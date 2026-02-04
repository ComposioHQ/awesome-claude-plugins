/**
 * Project Memory Analyzer
 * Analyzes CLAUDE.md/AGENTS.md project memory files for optimization opportunities
 */

const fs = require('fs');
const path = require('path');
const { projectMemoryPatterns } = require('./projectmemory-patterns');

const PROJECT_MEMORY_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.github/CLAUDE.md',
  '.github/AGENTS.md'
];

/**
 * Find the project memory file in a directory
 * @param {string} projectPath - Project root directory
 * @returns {Object|null} { path, name, type } or null if not found
 */
function findProjectMemoryFile(projectPath) {
  for (const fileName of PROJECT_MEMORY_FILES) {
    const filePath = path.join(projectPath, fileName);
    if (fs.existsSync(filePath)) {
      return {
        path: filePath,
        name: fileName,
        type: fileName.includes('AGENTS') ? 'agents' : 'claude'
      };
    }
  }
  return null;
}

/**
 * Extract file references from markdown content
 * @param {string} content - Markdown content
 * @returns {Array} Array of file paths referenced
 */
function extractFileReferences(content) {
  if (!content || typeof content !== 'string') return [];

  const references = [];

  // Match markdown links: [text](path)
  const linkMatches = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
  for (const match of linkMatches) {
    const pathMatch = match.match(/\]\(([^)]+)\)/);
    if (pathMatch && pathMatch[1]) {
      const href = pathMatch[1];
      // Skip URLs and anchors
      if (!href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
        references.push(href.split('#')[0]); // Remove anchor
      }
    }
  }

  // Match backtick paths: `path/to/file.ext` or `file.ext` (root files)
  const backtickMatches = content.match(/`([^`]+)`/g) || [];
  for (const match of backtickMatches) {
    const filePath = match.replace(/`/g, '');
    // Include paths with / or extension, exclude spaces and variables
    if ((filePath.includes('.') || filePath.includes('/')) && !filePath.includes(' ') && !filePath.startsWith('$')) {
      references.push(filePath);
    }
  }

  return [...new Set(references)];
}

/**
 * Validate file references exist
 * @param {string} content - Markdown content
 * @param {string} projectPath - Project root directory
 * @returns {Object} { valid: [], broken: [] }
 */
function validateFileReferences(content, projectPath) {
  const references = extractFileReferences(content);
  const valid = [];
  const broken = [];

  const resolvedProjectPath = path.resolve(projectPath);

  for (const ref of references) {
    // Skip glob patterns and variable references
    if (ref.includes('*') || ref.includes('${')) {
      valid.push(ref);
      continue;
    }

    // Resolve path and validate it stays within project root (prevent path traversal)
    const fullPath = path.resolve(projectPath, ref);
    if (fullPath.startsWith(resolvedProjectPath) && fs.existsSync(fullPath)) {
      valid.push(ref);
    } else {
      broken.push(ref);
    }
  }

  return { valid, broken };
}

/**
 * Extract npm script references from content
 * @param {string} content - Markdown content
 * @returns {Array} Array of npm commands referenced
 */
function extractCommandReferences(content) {
  if (!content || typeof content !== 'string') return [];

  const commands = [];

  // Match npm run commands: npm run <script>
  const npmRunMatches = content.match(/npm\s+run\s+([a-z][\w:-]*)/gi) || [];
  for (const match of npmRunMatches) {
    const scriptMatch = match.match(/npm\s+run\s+([a-z][\w:-]*)/i);
    if (scriptMatch && scriptMatch[1]) {
      commands.push(scriptMatch[1]);
    }
  }

  // Match npm <script> shorthand (test, start, etc)
  const npmShortMatches = content.match(/npm\s+(test|start|build|lint|install)/gi) || [];
  for (const match of npmShortMatches) {
    const cmdMatch = match.match(/npm\s+(\w+)/i);
    if (cmdMatch && cmdMatch[1]) {
      commands.push(cmdMatch[1]);
    }
  }

  return [...new Set(commands)];
}

/**
 * Validate command references exist in package.json
 * @param {string} content - Markdown content
 * @param {string} projectPath - Project root directory
 * @returns {Object} { valid: [], broken: [] }
 */
function validateCommandReferences(content, projectPath) {
  const commands = extractCommandReferences(content);
  const valid = [];
  const broken = [];

  const packagePath = path.join(projectPath, 'package.json');
  let scripts = {};

  let packageParseError = null;
  if (fs.existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      scripts = pkg.scripts || {};
    } catch (err) {
      packageParseError = err.message;
      // Continue with empty scripts - commands will be marked as broken
    }
  }

  const builtInCommands = ['install', 'i', 'ci', 'test', 't', 'start', 'build', 'publish', 'pack'];

  for (const cmd of commands) {
    if (scripts[cmd] || builtInCommands.includes(cmd)) {
      valid.push(cmd);
    } else {
      broken.push(cmd);
    }
  }

  const result = { valid, broken };
  if (packageParseError) {
    result.parseError = packageParseError;
  }
  return result;
}

/**
 * Calculate token metrics for content
 * @param {string} content - Content to analyze
 * @param {string} readmeContent - Optional README content for comparison
 * @returns {Object} Token metrics
 */
function calculateTokenMetrics(content, readmeContent = null) {
  if (!content || typeof content !== 'string') {
    return { estimatedTokens: 0, characterCount: 0, lineCount: 0, wordCount: 0 };
  }

  const characterCount = content.length;
  const lineCount = content.split('\n').length;
  const estimatedTokens = Math.ceil(characterCount / 4);

  const result = {
    estimatedTokens,
    characterCount,
    lineCount,
    wordCount: content.split(/\s+/).filter(Boolean).length
  };

  // Calculate README overlap if provided
  if (readmeContent && typeof readmeContent === 'string') {
    result.readmeOverlap = calculateTextOverlap(content, readmeContent);
  }

  return result;
}

/**
 * Calculate text overlap between two documents
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {number} Overlap ratio (0-1)
 */
function calculateTextOverlap(text1, text2) {
  if (!text1 || !text2) return 0;

  const normalize = (text) => text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences1 = normalize(text1).split(/[.!?]+/).filter(s => s.length > 20);
  const sentences2 = new Set(normalize(text2).split(/[.!?]+/).filter(s => s.length > 20));

  if (sentences1.length === 0) return 0;

  let matchCount = 0;
  for (const sentence of sentences1) {
    for (const s2 of sentences2) {
      const words1 = sentence.split(' ');
      const words2 = new Set(s2.split(' '));
      const matchingWords = words1.filter(w => words2.has(w)).length;
      if (matchingWords / words1.length > 0.8) {
        matchCount++;
        break;
      }
    }
  }

  return matchCount / sentences1.length;
}

/**
 * Detect README duplication
 * @param {string} memoryFilePath - Path to project memory file
 * @param {string} readmePath - Path to README.md (optional, auto-detected)
 * @returns {Object} Duplication analysis
 */
function detectReadmeDuplication(memoryFilePath, readmePath = null) {
  if (!readmePath) {
    const possibleReadmes = ['README.md', 'readme.md', 'Readme.md'];
    let currentDir = path.dirname(memoryFilePath);

    // Walk up directory tree to find README (handles .github/ case)
    while (currentDir && currentDir.length > 0) {
      for (const name of possibleReadmes) {
        const tryPath = path.join(currentDir, name);
        if (fs.existsSync(tryPath)) {
          readmePath = tryPath;
          break;
        }
      }
      if (readmePath) break;

      const parentDir = path.dirname(currentDir);
      if (!parentDir || parentDir === currentDir) break;
      currentDir = parentDir;
    }
  }

  if (!readmePath || !fs.existsSync(readmePath)) {
    return { hasReadme: false, duplicationRatio: 0 };
  }

  try {
    const memoryContent = fs.readFileSync(memoryFilePath, 'utf8');
    const readmeContent = fs.readFileSync(readmePath, 'utf8');

    return {
      hasReadme: true,
      readmePath,
      duplicationRatio: calculateTextOverlap(memoryContent, readmeContent)
    };
  } catch (err) {
    return { hasReadme: true, readmePath, error: err.message };
  }
}

/**
 * Analyze a single project memory file
 * @param {string} filePath - Path to project memory file
 * @param {Object} options - Analysis options
 * @param {boolean} options.verbose - Include LOW certainty issues
 * @param {boolean} options.checkReferences - Validate file/command references
 * @returns {Object} Analysis results
 */
function analyzeFile(filePath, options = {}) {
  const { verbose = false, checkReferences = true } = options;

  const results = {
    fileName: path.basename(filePath),
    filePath,
    fileType: filePath.includes('AGENTS') ? 'agents' : 'claude',
    structureIssues: [],
    referenceIssues: [],
    efficiencyIssues: [],
    qualityIssues: [],
    crossPlatformIssues: [],
    metrics: null
  };

  // Read file
  if (!fs.existsSync(filePath)) {
    results.structureIssues.push({
      issue: 'File not found',
      file: filePath,
      certainty: 'HIGH',
      patternId: 'file_not_found'
    });
    return results;
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    results.structureIssues.push({
      issue: `Failed to read file: ${err.message}`,
      file: filePath,
      certainty: 'HIGH',
      patternId: 'read_error'
    });
    return results;
  }

  // Determine project root - if file is in .github/, use parent directory
  let projectPath = path.dirname(filePath);
  if (projectPath.endsWith('.github') || projectPath.endsWith('.github/') || projectPath.endsWith('.github\\')) {
    projectPath = path.dirname(projectPath);
  }

  const readmeDuplication = detectReadmeDuplication(filePath);
  let readmeContent = null;
  if (readmeDuplication.hasReadme && !readmeDuplication.error) {
    try {
      readmeContent = fs.readFileSync(readmeDuplication.readmePath, 'utf8');
    } catch (err) {
      // README exists but couldn't be read - continue without it
    }
  }
  results.metrics = calculateTokenMetrics(content, readmeContent);

  const context = {
    fileName: results.fileName,
    duplicationRatio: readmeDuplication.duplicationRatio
  };

  if (checkReferences) {
    const fileRefs = validateFileReferences(content, projectPath);
    context.brokenFiles = fileRefs.broken;

    const cmdRefs = validateCommandReferences(content, projectPath);
    context.brokenCommands = cmdRefs.broken;
  }

  const structurePatterns = ['missing_critical_rules', 'missing_architecture', 'missing_key_commands'];
  for (const patternName of structurePatterns) {
    const pattern = projectMemoryPatterns[patternName];
    if (!pattern) continue;

    const result = pattern.check(content, context);
    if (result && (verbose || pattern.certainty !== 'LOW')) {
      results.structureIssues.push({
        ...result,
        file: filePath,
        certainty: pattern.certainty,
        patternId: pattern.id
      });
    }
  }

  const referencePatterns = ['broken_file_reference', 'broken_command_reference'];
  for (const patternName of referencePatterns) {
    const pattern = projectMemoryPatterns[patternName];
    if (!pattern) continue;

    const result = pattern.check(content, context);
    if (result && (verbose || pattern.certainty !== 'LOW')) {
      results.referenceIssues.push({
        ...result,
        file: filePath,
        certainty: pattern.certainty,
        patternId: pattern.id
      });
    }
  }

  const efficiencyPatterns = ['readme_duplication', 'excessive_token_count', 'verbose_instructions', 'example_overload'];
  for (const patternName of efficiencyPatterns) {
    const pattern = projectMemoryPatterns[patternName];
    if (!pattern) continue;

    const result = pattern.check(content, context);
    if (result && (verbose || pattern.certainty !== 'LOW')) {
      results.efficiencyIssues.push({
        ...result,
        file: filePath,
        certainty: pattern.certainty,
        patternId: pattern.id
      });
    }
  }

  const qualityPatterns = ['missing_why', 'deep_nesting'];
  for (const patternName of qualityPatterns) {
    const pattern = projectMemoryPatterns[patternName];
    if (!pattern) continue;

    const result = pattern.check(content, context);
    if (result && (verbose || pattern.certainty !== 'LOW')) {
      results.qualityIssues.push({
        ...result,
        file: filePath,
        certainty: pattern.certainty,
        patternId: pattern.id
      });
    }
  }

  const crossPlatformPatterns = ['hardcoded_state_dir', 'claude_only_terminology', 'missing_agents_md_mention'];
  for (const patternName of crossPlatformPatterns) {
    const pattern = projectMemoryPatterns[patternName];
    if (!pattern) continue;

    const result = pattern.check(content, context);
    if (result && (verbose || pattern.certainty !== 'LOW')) {
      results.crossPlatformIssues.push({
        ...result,
        file: filePath,
        certainty: pattern.certainty,
        patternId: pattern.id
      });
    }
  }

  return results;
}

/**
 * Main analyze function
 * @param {string} targetPath - Path to project directory or specific file
 * @param {Object} options - Analysis options
 * @param {boolean} options.verbose - Include LOW certainty issues
 * @param {boolean} options.checkReferences - Validate file/command references
 * @returns {Object} Analysis results
 */
function analyze(targetPath, options = {}) {
  let filePath;

  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    if (stat.isFile()) {
      filePath = targetPath;
    } else {
      const found = findProjectMemoryFile(targetPath);
      if (!found) {
        return {
          error: 'No project memory file found',
          searchedPaths: PROJECT_MEMORY_FILES.map(f => path.join(targetPath, f)),
          structureIssues: [{
            issue: 'No CLAUDE.md or AGENTS.md found in project',
            fix: 'Create CLAUDE.md with project memory content',
            certainty: 'HIGH',
            patternId: 'missing_project_memory'
          }]
        };
      }
      filePath = found.path;
    }
  } else {
    return {
      error: `Path does not exist: ${targetPath}`,
      structureIssues: [{
        issue: 'Target path does not exist',
        file: targetPath,
        certainty: 'HIGH',
        patternId: 'path_not_found'
      }]
    };
  }

  return analyzeFile(filePath, options);
}

/**
 * Apply fixes to analysis results
 * @param {Object} results - Analysis results
 * @param {Object} options - Fix options
 * @returns {Object} Fix results
 */
function applyFixes(results, options = {}) {
  const allIssues = [
    ...(results.structureIssues || []),
    ...(results.referenceIssues || []),
    ...(results.efficiencyIssues || []),
    ...(results.qualityIssues || []),
    ...(results.crossPlatformIssues || [])
  ];

  return {
    applied: [],
    skipped: allIssues.map(i => ({
      ...i,
      reason: 'No auto-fix available - requires human judgment'
    })),
    errors: []
  };
}

/**
 * Generate markdown report from analysis results
 * @param {Object} results - Analysis results
 * @param {Object} options - Report options
 * @returns {string} Markdown report
 */
function generateReport(results, options = {}) {
  const reporter = require('./reporter');

  return reporter.generateProjectMemoryReport(results, options);
}

module.exports = {
  PROJECT_MEMORY_FILES,
  findProjectMemoryFile,
  extractFileReferences,
  validateFileReferences,
  extractCommandReferences,
  validateCommandReferences,
  calculateTokenMetrics,
  calculateTextOverlap,
  detectReadmeDuplication,
  analyzeFile,
  analyze,
  applyFixes,
  generateReport
};
