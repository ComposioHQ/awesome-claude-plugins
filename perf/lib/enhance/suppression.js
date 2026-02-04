/**
 * Suppression System for /enhance
 * Handles inline comments and config file suppressions
 */

const fs = require('fs');
const path = require('path');

/**
 * Default suppression config
 */
const DEFAULT_CONFIG = {
  ignore: {
    patterns: [],
    files: [],
    rules: {}
  },
  severity: {}
};

// Maximum config file size (1MB) to prevent DoS via large files
const MAX_CONFIG_SIZE = 1024 * 1024;

/**
 * Load suppression config from project root
 * @param {string} projectRoot - Path to project root
 * @returns {Object} Merged config
 */
function loadConfig(projectRoot) {
  const configPaths = [
    path.join(projectRoot, '.enhancerc.json'),
    path.join(projectRoot, '.enhancerc'),
    path.join(projectRoot, 'enhance.config.json')
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        // Check file size before reading to prevent DoS
        const stats = fs.statSync(configPath);
        if (stats.size > MAX_CONFIG_SIZE) {
          console.error(`[WARN] Config file too large (${stats.size} bytes), using defaults`);
          continue;
        }
        const content = fs.readFileSync(configPath, 'utf8');
        const userConfig = JSON.parse(content);
        return mergeConfig(DEFAULT_CONFIG, userConfig);
      } catch (err) {
        // Invalid config, use defaults
      }
    }
  }

  return DEFAULT_CONFIG;
}

/**
 * Merge user config with defaults
 * @param {Object} defaults - Default config
 * @param {Object} user - User config
 * @returns {Object} Merged config
 */
function mergeConfig(defaults, user) {
  return {
    ignore: {
      patterns: [...(defaults.ignore.patterns || []), ...(user.ignore?.patterns || [])],
      files: [...(defaults.ignore.files || []), ...(user.ignore?.files || [])],
      rules: { ...(defaults.ignore.rules || {}), ...(user.ignore?.rules || {}) }
    },
    severity: { ...(defaults.severity || {}), ...(user.severity || {}) }
  };
}

/**
 * Extract inline suppressions from content
 * Supports:
 * - <!-- enhance:ignore pattern_id -->
 * - // enhance:ignore pattern_id
 * - # enhance:ignore pattern_id
 *
 * @param {string} content - File content
 * @returns {Set<string>} Set of suppressed pattern IDs
 */
function extractInlineSuppressions(content) {
  if (!content || typeof content !== 'string') return new Set();

  const suppressions = new Set();

  // HTML/Markdown comments
  const htmlPattern = /<!--\s*enhance:ignore\s+(\S+)\s*-->/gi;
  let match;
  while ((match = htmlPattern.exec(content)) !== null) {
    suppressions.add(match[1].toLowerCase());
  }

  // JS/TS comments
  const jsPattern = /\/\/\s*enhance:ignore\s+(\S+)/gi;
  while ((match = jsPattern.exec(content)) !== null) {
    suppressions.add(match[1].toLowerCase());
  }

  // Python/Shell comments
  const pyPattern = /#\s*enhance:ignore\s+(\S+)/gi;
  while ((match = pyPattern.exec(content)) !== null) {
    suppressions.add(match[1].toLowerCase());
  }

  return suppressions;
}

/**
 * Check if a finding should be suppressed
 * @param {Object} finding - The finding to check
 * @param {Object} config - Suppression config
 * @param {Set<string>} inlineSuppressions - Inline suppressions for this file
 * @param {string} filePath - Path to file being analyzed
 * @param {string} projectRoot - Project root path
 * @returns {Object|null} Suppression info if suppressed, null otherwise
 */
function shouldSuppress(finding, config, inlineSuppressions, filePath, projectRoot) {
  const patternId = (finding.patternId || finding.id || '').toLowerCase();

  // Check inline suppressions
  if (inlineSuppressions.has(patternId)) {
    return {
      reason: 'inline',
      patternId,
      source: 'inline comment'
    };
  }

  // Check config pattern suppressions
  if (config.ignore.patterns.includes(patternId)) {
    return {
      reason: 'config',
      patternId,
      source: 'config: ignore.patterns'
    };
  }

  // Check config rule suppressions
  const ruleConfig = config.ignore.rules[patternId];
  if (ruleConfig) {
    if (ruleConfig.severity === 'off' || ruleConfig === 'off') {
      return {
        reason: 'config',
        patternId,
        source: `config: ignore.rules.${patternId}`,
        userReason: ruleConfig.reason
      };
    }
  }

  // Check file pattern suppressions
  if (filePath && projectRoot) {
    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    for (const filePattern of config.ignore.files) {
      if (matchGlob(relativePath, filePattern)) {
        return {
          reason: 'config',
          patternId,
          source: `config: ignore.files (${filePattern})`
        };
      }
    }
  }

  // Check auto-learned suppressions
  if (config.auto_learned?.patterns?.[patternId]) {
    const autoRule = config.auto_learned.patterns[patternId];
    const relativePath = filePath && projectRoot
      ? path.relative(projectRoot, filePath).replace(/\\/g, '/')
      : filePath;

    // Check if this file is in the auto-learned list
    const fileMatch = autoRule.files?.some(f => {
      // Support both exact match and glob patterns
      if (f === relativePath || f === filePath) return true;
      return matchGlob(relativePath || '', f);
    });

    if (fileMatch) {
      return {
        reason: 'auto_learned',
        patternId,
        source: 'auto-learned suppression',
        confidence: autoRule.confidence,
        note: autoRule.reason
      };
    }
  }

  return null;
}

/**
 * Simple glob matching (supports * and **)
 * @param {string} filePath - File path to match
 * @param {string} pattern - Glob pattern
 * @returns {boolean} True if matches
 */
function matchGlob(filePath, pattern) {
  // Convert glob to regex
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

/**
 * Apply severity overrides from config
 * @param {Object} finding - Finding to check
 * @param {Object} config - Suppression config
 * @returns {string} Adjusted certainty level
 */
function applySeverityOverride(finding, config) {
  const patternId = (finding.patternId || finding.id || '').toLowerCase();

  // Check config severity overrides
  if (config.severity[patternId]) {
    const override = config.severity[patternId];
    if (['HIGH', 'MEDIUM', 'LOW'].includes(override.toUpperCase())) {
      return override.toUpperCase();
    }
  }

  // Check rule-level severity
  const ruleConfig = config.ignore.rules[patternId];
  if (ruleConfig && ruleConfig.severity && ruleConfig.severity !== 'off') {
    if (['HIGH', 'MEDIUM', 'LOW'].includes(ruleConfig.severity.toUpperCase())) {
      return ruleConfig.severity.toUpperCase();
    }
  }

  return finding.certainty;
}

/**
 * Filter findings with suppression tracking
 * @param {Array} findings - All findings
 * @param {Object} config - Suppression config
 * @param {string} projectRoot - Project root path
 * @param {Map<string, string>} fileContents - Map of file path to content (for inline suppression extraction)
 * @returns {Object} { active: [], suppressed: [] }
 */
function filterFindings(findings, config, projectRoot, fileContents = new Map()) {
  const active = [];
  const suppressed = [];

  // Cache inline suppressions per file
  const inlineSuppressionsCache = new Map();

  for (const finding of findings) {
    const filePath = finding.file || finding.filePath;

    // Get inline suppressions for this file
    let inlineSuppressions;
    if (inlineSuppressionsCache.has(filePath)) {
      inlineSuppressions = inlineSuppressionsCache.get(filePath);
    } else {
      const content = fileContents.get(filePath);
      inlineSuppressions = content ? extractInlineSuppressions(content) : new Set();
      inlineSuppressionsCache.set(filePath, inlineSuppressions);
    }

    // Check if suppressed
    const suppression = shouldSuppress(finding, config, inlineSuppressions, filePath, projectRoot);

    if (suppression) {
      suppressed.push({
        ...finding,
        reason: suppression.reason,
        confidence: suppression.confidence,
        note: suppression.note,
        suppression
      });
    } else {
      // Apply severity override
      const adjustedCertainty = applySeverityOverride(finding, config);
      active.push({
        ...finding,
        certainty: adjustedCertainty,
        originalCertainty: finding.certainty !== adjustedCertainty ? finding.certainty : undefined
      });
    }
  }

  return { active, suppressed };
}

/**
 * Generate suppression summary for report
 * @param {Array} suppressed - Suppressed findings
 * @returns {string} Summary markdown
 */
function generateSuppressionSummary(suppressed) {
  if (!suppressed || suppressed.length === 0) {
    return '';
  }

  const lines = [];
  lines.push('## Suppressed Findings');
  lines.push('');
  lines.push(`**${suppressed.length} findings suppressed**`);
  lines.push('');

  // Group by suppression source
  const bySource = {};
  for (const finding of suppressed) {
    const source = finding.suppression?.source || 'unknown';
    if (!bySource[source]) bySource[source] = [];
    bySource[source].push(finding);
  }

  lines.push('| Source | Pattern | Count |');
  lines.push('|--------|---------|-------|');

  for (const [source, findings] of Object.entries(bySource)) {
    // Group by pattern within source
    const byPattern = {};
    for (const f of findings) {
      const pattern = f.suppression?.patternId || 'unknown';
      byPattern[pattern] = (byPattern[pattern] || 0) + 1;
    }

    for (const [pattern, count] of Object.entries(byPattern)) {
      lines.push(`| ${source} | ${pattern} | ${count} |`);
    }
  }

  lines.push('');
  lines.push('*Use `--show-suppressed` to see full details*');
  lines.push('');

  return lines.join('\n');
}

module.exports = {
  loadConfig,
  extractInlineSuppressions,
  shouldSuppress,
  applySeverityOverride,
  filterFindings,
  generateSuppressionSummary,
  matchGlob,
  DEFAULT_CONFIG
};
