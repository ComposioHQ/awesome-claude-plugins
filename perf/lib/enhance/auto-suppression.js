/**
 * Auto-Learning Suppression System for /enhance
 *
 * Automatically detects obvious false positives and stores them
 * for future runs, making the enhance tool smarter over time.
 *
 * Key features:
 * - Pattern-specific heuristics for common false positives
 * - Cross-platform storage using getSuppressionPath()
 * - 0.90+ confidence threshold for auto-suppression
 * - Backward compatible with existing suppression.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Try to import cross-platform helpers
let getSuppressionPath;
try {
  const crossPlatform = require('../cross-platform');
  getSuppressionPath = crossPlatform.getSuppressionPath;
} catch {
  // Fallback for when running from plugin directory
  const os = require('os');
  getSuppressionPath = () => path.join(os.homedir(), '.claude', 'enhance', 'suppressions.json');
}

/**
 * Minimum confidence threshold for auto-suppression
 */
const CONFIDENCE_THRESHOLD = 0.90;

/**
 * Maximum suppressions per project (prevents file bloat)
 */
const MAX_SUPPRESSIONS_PER_PROJECT = 100;

/**
 * Suppression expiry in milliseconds (6 months)
 */
const SUPPRESSION_EXPIRY_MS = 6 * 30 * 24 * 60 * 60 * 1000;

/**
 * Pattern-specific heuristics for detecting false positives
 * Each heuristic returns { reason, confidence } or null
 */
const PATTERN_HEURISTICS = {
  /**
   * vague_instructions: Detects when vague terms appear in pattern documentation
   * False positive when content describes the pattern itself
   */
  vague_instructions: (finding, content, context) => {
    const contentLower = content.toLowerCase();

    // Check if file is pattern documentation describing vague language detection
    const isPatternDoc =
      /pattern.*detect.*usually|example.*vague|fuzzy.*language.*like/i.test(content) ||
      /vague.*terms.*like|"usually".*"sometimes"/i.test(content);

    if (isPatternDoc) {
      return {
        reason: 'Pattern documentation self-reference (describes vague language detection)',
        confidence: 0.98
      };
    }

    // Check if in table describing patterns
    const line = finding.line || 0;
    const lines = content.split('\n');
    const surroundingLines = lines.slice(Math.max(0, line - 5), line + 5).join('\n');
    if (/\|.*vague.*\||\|.*usually.*sometimes.*\|/i.test(surroundingLines)) {
      return {
        reason: 'Pattern table documentation',
        confidence: 0.95
      };
    }

    return null;
  },

  /**
   * aggressive_emphasis: Detects legitimate workflow enforcement usage
   * False positive in workflow gates and critical agent constraints
   */
  aggressive_emphasis: (finding, content, context) => {
    const line = finding.line || 0;
    const lines = content.split('\n');
    const surroundingLines = lines.slice(Math.max(0, line - 20), line + 20).join('\n');

    // Check for workflow gate context
    const isWorkflowGate =
      /WORKFLOW\s+GATES?/i.test(surroundingLines) ||
      /\[CRITICAL\]\s*NO\s+AGENT\s+may/i.test(surroundingLines) ||
      /MUST\s+NOT\s+DO|NEVER\s+skip|DO\s+NOT\s+proceed/i.test(surroundingLines) ||
      /SubagentStop\s+hook|phase\s+9\s+review/i.test(surroundingLines);

    if (isWorkflowGate) {
      return {
        reason: 'Workflow enforcement requires emphasis for gates',
        confidence: 0.95
      };
    }

    // Check for critical rules section
    const isCriticalRules =
      /critical-rules|Critical\s+Rules.*Priority/i.test(surroundingLines) ||
      /<critical-rules>/i.test(surroundingLines);

    if (isCriticalRules) {
      return {
        reason: 'Critical rules section requires emphasis',
        confidence: 0.93
      };
    }

    return null;
  },

  /**
   * missing_examples: Detects orchestrator/workflow files that delegate to subagents
   * False positive when file is orchestrator that spawns other agents
   */
  missing_examples: (finding, content, context) => {
    const filePath = finding.file || context?.file || '';
    const fileNameLower = path.basename(filePath).toLowerCase();

    // Check if file is an orchestrator
    const isOrchestrator =
      fileNameLower.includes('orchestrator') ||
      fileNameLower.includes('coordinator') ||
      /Task\s*\(\s*\{[\s\S]*subagent_type/i.test(content);

    if (isOrchestrator) {
      return {
        reason: 'Orchestrator file delegates to subagents (examples in subagents)',
        confidence: 0.92
      };
    }

    // Check if workflow command that invokes agents
    const isWorkflowCommand =
      /spawn.*agent|invoke.*agent|Task\s*\(\s*\{/i.test(content) &&
      fileNameLower.endsWith('.md');

    if (isWorkflowCommand) {
      return {
        reason: 'Workflow command invokes agents with examples',
        confidence: 0.90
      };
    }

    return null;
  },

  /**
   * missing_output_format: Detects files that spawn subagents with output specs
   * False positive when subagent is responsible for output format
   */
  missing_output_format: (finding, content, context) => {
    // Check if content spawns subagents with their own output specs
    const spawnsSubagent =
      /subagent_type|spawn.*agent|Task\s*\(\s*\{/i.test(content) ||
      /enhance:.*-enhancer|enhance:.*-reporter/i.test(content);

    if (spawnsSubagent) {
      return {
        reason: 'Delegates output to subagent (subagent defines format)',
        confidence: 0.91
      };
    }

    return null;
  },

  /**
   * missing_constraints: Detects files that already have constraint sections
   * False positive when "## What Agent MUST NOT Do" or similar exists
   */
  missing_constraints: (finding, content, context) => {
    // Check for constraint section presence
    const hasConstraintSection =
      /##\s*What\s+.*MUST\s+NOT\s+Do/i.test(content) ||
      /##\s*Constraints/i.test(content) ||
      /<constraints>/i.test(content) ||
      /##\s*Critical\s+Constraints/i.test(content) ||
      /WORKFLOW\s+GATES/i.test(content);

    if (hasConstraintSection) {
      return {
        reason: 'File has constraint section (different heading format)',
        confidence: 0.94
      };
    }

    return null;
  },

  /**
   * redundant_cot: Detects legitimate step-by-step for complex workflows
   * False positive in multi-phase workflow prompts
   */
  redundant_cot: (finding, content, context) => {
    // Check if multi-phase workflow
    const isMultiPhase =
      /Phase\s+\d+:|Step\s+\d+:|###\s+Phase/i.test(content) &&
      /Phase\s+[2-9]:|Step\s+[2-9]:/i.test(content);

    if (isMultiPhase) {
      return {
        reason: 'Multi-phase workflow requires step guidance',
        confidence: 0.91
      };
    }

    return null;
  }
};

/**
 * Check if a finding is likely a false positive
 *
 * @param {Object} finding - The finding to check
 * @param {string} content - File content
 * @param {Object} context - Additional context { file, analyzer, suppressions }
 * @returns {{ reason: string, confidence: number } | null}
 */
function isLikelyFalsePositive(finding, content, context = {}) {
  const patternId = (finding.patternId || finding.id || '').toLowerCase();

  // Skip if no content
  if (!content || typeof content !== 'string') {
    return null;
  }

  // Check pattern-specific heuristic
  const heuristic = PATTERN_HEURISTICS[patternId];
  if (heuristic) {
    const result = heuristic(finding, content, context);
    if (result && result.confidence >= CONFIDENCE_THRESHOLD) {
      return result;
    }
  }

  // Generic self-reference detection: pattern names in pattern docs
  if (finding.file && isPatternDocumentation(finding.file, content, patternId)) {
    return {
      reason: 'Pattern self-reference in documentation',
      confidence: 0.96
    };
  }

  return null;
}

/**
 * Check if file is pattern documentation that mentions the pattern
 *
 * @param {string} filePath - File path
 * @param {string} content - File content
 * @param {string} patternId - Pattern being checked
 * @returns {boolean}
 */
function isPatternDocumentation(filePath, content, patternId) {
  const fileName = path.basename(filePath).toLowerCase();

  // Pattern documentation file names
  const isPatternFile =
    fileName.includes('pattern') ||
    fileName.includes('enhance.md') ||
    fileName.includes('enhancer');

  if (!isPatternFile) return false;

  // Check if content documents patterns in table format
  const patternIdReadable = patternId.replace(/_/g, ' ');
  const describesPattern =
    new RegExp(`\\|[^|]*${patternId}[^|]*\\|`, 'i').test(content) ||
    new RegExp(`\\|[^|]*${patternIdReadable}[^|]*\\|`, 'i').test(content);

  return describesPattern;
}

/**
 * Get project identifier from git remote or directory hash
 *
 * @param {string} projectRoot - Project root directory
 * @returns {string} Project identifier
 */
function getProjectId(projectRoot = process.cwd()) {
  try {
    // Try to get git remote
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    if (remote) {
      // Normalize remote URL to identifier
      // https://github.com/user/repo.git -> github.com/user/repo
      // git@github.com:user/repo.git -> github.com/user/repo
      return remote
        .replace(/^https?:\/\//, '')
        .replace(/^git@/, '')
        .replace(/\.git$/, '')
        .replace(':', '/');
    }
  } catch {
    // Git not available or not a git repo
  }

  // Fallback to directory name hash
  const absPath = path.resolve(projectRoot);
  return `local:${path.basename(absPath)}`;
}

/**
 * Load auto-learned suppressions for a project
 *
 * @param {string} suppressionPath - Path to suppressions.json
 * @param {string} projectId - Project identifier
 * @returns {Object} Auto-learned suppressions { patterns: {}, stats: {} }
 */
function loadAutoSuppressions(suppressionPath, projectId) {
  const defaultResult = { patterns: {}, stats: { totalSuppressed: 0 } };

  try {
    if (!fs.existsSync(suppressionPath)) {
      return defaultResult;
    }

    const data = JSON.parse(fs.readFileSync(suppressionPath, 'utf8'));
    const projectData = data.projects?.[projectId];

    if (!projectData?.auto_learned) {
      return defaultResult;
    }

    // Prune expired suppressions
    const autoLearned = projectData.auto_learned;
    const now = Date.now();
    const prunedPatterns = {};

    for (const [patternId, suppression] of Object.entries(autoLearned.patterns || {})) {
      const learnedAt = new Date(suppression.learnedAt).getTime();
      if (now - learnedAt < SUPPRESSION_EXPIRY_MS) {
        prunedPatterns[patternId] = suppression;
      }
    }

    return {
      patterns: prunedPatterns,
      stats: autoLearned.stats || { totalSuppressed: 0 }
    };
  } catch {
    return defaultResult;
  }
}

/**
 * Save auto-learned suppressions
 *
 * @param {string} suppressionPath - Path to suppressions.json
 * @param {string} projectId - Project identifier
 * @param {Array} findings - Findings to save as suppressions
 */
function saveAutoSuppressions(suppressionPath, projectId, findings) {
  if (!findings || findings.length === 0) return;

  // Ensure directory exists
  const dir = path.dirname(suppressionPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load existing data
  let data = { version: '2.0', projects: {} };
  try {
    if (fs.existsSync(suppressionPath)) {
      data = JSON.parse(fs.readFileSync(suppressionPath, 'utf8'));
    }
  } catch {
    // Start fresh on error
  }

  // Ensure structure
  if (!data.projects) data.projects = {};
  if (!data.projects[projectId]) data.projects[projectId] = {};
  if (!data.projects[projectId].auto_learned) {
    data.projects[projectId].auto_learned = {
      patterns: {},
      stats: { totalSuppressed: 0, lastAnalysis: null }
    };
  }

  const autoLearned = data.projects[projectId].auto_learned;
  const now = new Date().toISOString();

  // Group findings by pattern
  const byPattern = {};
  for (const finding of findings) {
    const patternId = (finding.patternId || finding.id || '').toLowerCase();
    if (!patternId) continue;

    if (!byPattern[patternId]) {
      byPattern[patternId] = {
        files: [],
        reason: finding.suppressionReason || 'Auto-detected false positive',
        confidence: finding.confidence || CONFIDENCE_THRESHOLD,
        learnedAt: now,
        occurrences: 0
      };
    }

    if (finding.file && !byPattern[patternId].files.includes(finding.file)) {
      byPattern[patternId].files.push(finding.file);
    }
    byPattern[patternId].occurrences++;

    // Keep highest confidence
    if (finding.confidence > byPattern[patternId].confidence) {
      byPattern[patternId].confidence = finding.confidence;
      byPattern[patternId].reason = finding.suppressionReason;
    }
  }

  // Merge with existing patterns
  for (const [patternId, newSuppression] of Object.entries(byPattern)) {
    const existing = autoLearned.patterns[patternId];
    if (existing) {
      // Merge files
      const allFiles = [...new Set([...existing.files, ...newSuppression.files])];
      existing.files = allFiles.slice(0, 50); // Cap files per pattern
      existing.occurrences = (existing.occurrences || 0) + newSuppression.occurrences;
      existing.lastSeen = now;
      // Update confidence if higher
      if (newSuppression.confidence > existing.confidence) {
        existing.confidence = newSuppression.confidence;
        existing.reason = newSuppression.reason;
      }
    } else {
      autoLearned.patterns[patternId] = newSuppression;
    }
  }

  // Enforce max suppressions per project
  const patternIds = Object.keys(autoLearned.patterns);
  if (patternIds.length > MAX_SUPPRESSIONS_PER_PROJECT) {
    // Remove oldest patterns
    const sorted = patternIds.sort((a, b) => {
      const aDate = new Date(autoLearned.patterns[a].learnedAt);
      const bDate = new Date(autoLearned.patterns[b].learnedAt);
      return aDate - bDate;
    });

    const toRemove = sorted.slice(0, patternIds.length - MAX_SUPPRESSIONS_PER_PROJECT);
    for (const id of toRemove) {
      delete autoLearned.patterns[id];
    }
  }

  // Update stats
  autoLearned.stats.totalSuppressed = Object.keys(autoLearned.patterns).length;
  autoLearned.stats.lastAnalysis = now;

  // Write file
  fs.writeFileSync(suppressionPath, JSON.stringify(data, null, 2));
}

/**
 * Clear auto-learned suppressions for a project
 *
 * @param {string} suppressionPath - Path to suppressions.json
 * @param {string} projectId - Project identifier
 */
function clearAutoSuppressions(suppressionPath, projectId) {
  try {
    if (!fs.existsSync(suppressionPath)) return;

    const data = JSON.parse(fs.readFileSync(suppressionPath, 'utf8'));

    if (data.projects?.[projectId]?.auto_learned) {
      data.projects[projectId].auto_learned = {
        patterns: {},
        stats: { totalSuppressed: 0, lastAnalysis: new Date().toISOString() }
      };
      fs.writeFileSync(suppressionPath, JSON.stringify(data, null, 2));
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Merge auto-learned suppressions with manual suppressions
 *
 * @param {Object} autoLearned - Auto-learned suppressions
 * @param {Object} manual - Manual suppressions (from config)
 * @returns {Object} Merged suppressions
 */
function mergeSuppressions(autoLearned, manual) {
  return {
    ignore: {
      patterns: [...(manual.ignore?.patterns || [])],
      files: [...(manual.ignore?.files || [])],
      rules: { ...(manual.ignore?.rules || {}) }
    },
    severity: { ...(manual.severity || {}) },
    auto_learned: autoLearned
  };
}

/**
 * Export learned suppressions for team sharing
 *
 * @param {string} suppressionPath - Path to suppressions.json
 * @param {string} projectId - Project identifier
 * @returns {Object} Exportable suppression data
 */
function exportAutoSuppressions(suppressionPath, projectId) {
  const autoLearned = loadAutoSuppressions(suppressionPath, projectId);

  return {
    exportedAt: new Date().toISOString(),
    projectId,
    suppressions: autoLearned.patterns,
    stats: autoLearned.stats
  };
}

/**
 * Import shared suppressions
 *
 * @param {string} suppressionPath - Path to suppressions.json
 * @param {string} projectId - Project identifier
 * @param {Object} importData - Data from exportAutoSuppressions
 */
function importAutoSuppressions(suppressionPath, projectId, importData) {
  if (!importData?.suppressions) return;

  // Convert imported suppressions to findings format
  const findings = [];
  for (const [patternId, suppression] of Object.entries(importData.suppressions)) {
    for (const file of suppression.files || []) {
      findings.push({
        patternId,
        file,
        suppressionReason: suppression.reason,
        confidence: suppression.confidence
      });
    }
  }

  saveAutoSuppressions(suppressionPath, projectId, findings);
}

/**
 * Analyze findings for potential auto-suppression
 * Returns findings that should be auto-suppressed
 *
 * @param {Array} findings - All findings
 * @param {Map<string, string>} fileContents - Map of file path to content
 * @param {Object} options - Options { noLearn, projectRoot }
 * @returns {Array} Findings to be auto-suppressed
 */
function analyzeForAutoSuppression(findings, fileContents, options = {}) {
  if (options.noLearn) return [];

  const toSuppress = [];

  for (const finding of findings) {
    const filePath = finding.file || finding.filePath;
    const content = fileContents.get(filePath);

    if (!content) continue;

    const fpCheck = isLikelyFalsePositive(finding, content, {
      file: filePath,
      projectRoot: options.projectRoot
    });

    if (fpCheck) {
      toSuppress.push({
        ...finding,
        suppressed: true,
        suppressionReason: fpCheck.reason,
        confidence: fpCheck.confidence
      });
    }
  }

  return toSuppress;
}

module.exports = {
  // Constants
  CONFIDENCE_THRESHOLD,
  MAX_SUPPRESSIONS_PER_PROJECT,
  SUPPRESSION_EXPIRY_MS,

  // Core functions
  isLikelyFalsePositive,
  getProjectId,

  // Storage functions
  loadAutoSuppressions,
  saveAutoSuppressions,
  clearAutoSuppressions,
  mergeSuppressions,

  // Import/export
  exportAutoSuppressions,
  importAutoSuppressions,

  // Analysis helper
  analyzeForAutoSuppression,

  // For testing
  PATTERN_HEURISTICS,
  isPatternDocumentation
};
