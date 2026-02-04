/**
 * Prompt Analyzer
 * Analyzes general prompts for prompt engineering best practices
 *
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');
const { promptPatterns, estimateTokens } = require('./prompt-patterns');
const reporter = require('./reporter');

/**
 * Detect prompt file type from path or content
 * @param {string} filePath - File path
 * @param {string} content - File content
 * @returns {string} File type: 'agent', 'command', 'skill', 'prompt', 'markdown'
 */
function detectPromptType(filePath, content) {
  const lowerPath = filePath.toLowerCase();

  // Check path patterns
  if (lowerPath.includes('/agents/') || lowerPath.includes('\\agents\\')) {
    return 'agent';
  }
  if (lowerPath.includes('/commands/') || lowerPath.includes('\\commands\\')) {
    return 'command';
  }
  if (lowerPath.includes('/skills/') || lowerPath.includes('\\skills\\')) {
    return 'skill';
  }
  if (lowerPath.includes('/prompts/') || lowerPath.includes('\\prompts\\')) {
    return 'prompt';
  }

  // Check content patterns
  if (content) {
    // Agent frontmatter
    if (/^---\s*\nname:\s*\w+/m.test(content)) {
      return 'agent';
    }
    // System prompt indicators
    if (/<system>/i.test(content) || /^##?\s*system\s+prompt/im.test(content)) {
      return 'prompt';
    }
  }

  return 'markdown';
}

/**
 * Analyze a single prompt file
 * @param {string} promptPath - Path to prompt file
 * @param {Object} options - Analysis options
 * @param {boolean} options.verbose - Include LOW certainty issues
 * @returns {Object} Analysis results
 */
function analyzePrompt(promptPath, options = {}) {
  const { verbose = false } = options;

  const results = {
    promptName: path.basename(promptPath, path.extname(promptPath)),
    promptPath,
    promptType: null,
    tokenCount: 0,
    clarityIssues: [],
    structureIssues: [],
    exampleIssues: [],
    contextIssues: [],
    outputIssues: [],
    antiPatternIssues: []
  };

  // Read file
  if (!fs.existsSync(promptPath)) {
    results.structureIssues.push({
      issue: 'File not found',
      file: promptPath,
      certainty: 'HIGH',
      patternId: 'file_not_found'
    });
    return results;
  }

  let content;
  try {
    content = fs.readFileSync(promptPath, 'utf8');
  } catch (err) {
    results.structureIssues.push({
      issue: `Failed to read file: ${err.message}`,
      file: promptPath,
      certainty: 'HIGH',
      patternId: 'read_error'
    });
    return results;
  }

  // Detect prompt type
  results.promptType = detectPromptType(promptPath, content);

  // Calculate token count
  results.tokenCount = estimateTokens(content);

  // Run each pattern check
  for (const pattern of Object.values(promptPatterns)) {
    // Skip LOW certainty unless verbose
    if (pattern.certainty === 'LOW' && !verbose) {
      continue;
    }

    // Run the check
    const result = pattern.check(content);

    if (result) {
      const issue = {
        ...result,
        file: promptPath,
        certainty: pattern.certainty,
        patternId: pattern.id,
        autoFix: pattern.autoFix
      };

      // Route to appropriate issue category
      switch (pattern.category) {
        case 'clarity':
          results.clarityIssues.push(issue);
          break;
        case 'structure':
          results.structureIssues.push(issue);
          break;
        case 'examples':
          results.exampleIssues.push(issue);
          break;
        case 'context':
          results.contextIssues.push(issue);
          break;
        case 'output':
          results.outputIssues.push(issue);
          break;
        case 'anti-pattern':
          results.antiPatternIssues.push(issue);
          break;
        default:
          results.structureIssues.push(issue);
      }
    }
  }

  return results;
}

/**
 * Analyze all prompts in a directory
 * @param {string} promptsDir - Path to prompts directory
 * @param {Object} options - Analysis options
 * @returns {Array} Array of analysis results
 */
function analyzeAllPrompts(promptsDir, options = {}) {
  const { recursive = true, extensions = ['.md', '.txt'], ...analyzeOptions } = options;
  const results = [];

  // Validate and normalize path
  if (!promptsDir || typeof promptsDir !== 'string') {
    return results;
  }

  // Resolve to absolute path to prevent path traversal
  const resolvedDir = path.resolve(promptsDir);

  if (!fs.existsSync(resolvedDir)) {
    return results;
  }

  // Collect prompt files
  const promptFiles = [];

  function findPromptFiles(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Ensure traversed paths stay within the resolved directory
      const resolvedFullPath = path.resolve(fullPath);
      if (!resolvedFullPath.startsWith(resolvedDir)) {
        continue;
      }

      if (entry.isDirectory() && recursive) {
        // Skip common non-prompt directories
        if (!['node_modules', '.git', 'dist', 'build', 'tests', '__tests__'].includes(entry.name)) {
          findPromptFiles(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          // Skip README files
          if (entry.name.toLowerCase() !== 'readme.md') {
            promptFiles.push(fullPath);
          }
        }
      }
    }
  }

  findPromptFiles(resolvedDir);

  // Analyze each file
  for (const promptFile of promptFiles) {
    const result = analyzePrompt(promptFile, analyzeOptions);
    results.push(result);
  }

  return results;
}

/**
 * Main analyze function
 * @param {Object} options - Analysis options
 * @param {string} options.prompt - Specific prompt file path (optional)
 * @param {string} options.promptsDir - Path to prompts directory
 * @param {boolean} options.verbose - Include LOW certainty issues
 * @returns {Object|Array} Analysis results
 */
function analyze(options = {}) {
  const {
    prompt,
    promptsDir,
    verbose = false
  } = options;

  if (prompt) {
    // Check if prompt is a directory or file
    try {
      const stats = fs.statSync(prompt);
      if (stats.isDirectory()) {
        return analyzeAllPrompts(prompt, { verbose });
      } else {
        return analyzePrompt(prompt, { verbose });
      }
    } catch (err) {
      // If doesn't exist, let analyzePrompt handle the error
      return analyzePrompt(prompt, { verbose });
    }
  } else if (promptsDir) {
    return analyzeAllPrompts(promptsDir, { verbose });
  } else {
    // Default: analyze common prompt locations
    const defaultDirs = ['prompts', 'agents', 'commands', 'skills'];
    const allResults = [];

    for (const dir of defaultDirs) {
      if (fs.existsSync(dir)) {
        const results = analyzeAllPrompts(dir, { verbose });
        allResults.push(...results);
      }
    }

    return allResults.length > 0 ? allResults : [];
  }
}

/**
 * Apply fixes to analysis results
 * Currently only aggressive_emphasis is auto-fixable
 * @param {Object|Array} results - Analysis results
 * @param {Object} options - Fix options
 * @returns {Object} Fix results
 */
function applyFixes(results, options = {}) {
  const { dryRun = false, backup = true } = options;

  const fixResults = {
    applied: [],
    skipped: [],
    errors: []
  };

  // Collect all issues
  let allIssues = [];

  if (Array.isArray(results)) {
    for (const r of results) {
      allIssues.push(...(r.clarityIssues || []));
      allIssues.push(...(r.structureIssues || []));
      allIssues.push(...(r.exampleIssues || []));
      allIssues.push(...(r.contextIssues || []));
      allIssues.push(...(r.outputIssues || []));
      allIssues.push(...(r.antiPatternIssues || []));
    }
  } else {
    allIssues.push(...(results.clarityIssues || []));
    allIssues.push(...(results.structureIssues || []));
    allIssues.push(...(results.exampleIssues || []));
    allIssues.push(...(results.contextIssues || []));
    allIssues.push(...(results.outputIssues || []));
    allIssues.push(...(results.antiPatternIssues || []));
  }

  // Filter to auto-fixable HIGH certainty issues
  const fixableIssues = allIssues.filter(i =>
    i.certainty === 'HIGH' && i.autoFix
  );

  // Group by file
  const byFile = new Map();
  for (const issue of fixableIssues) {
    const fp = issue.file;
    if (!byFile.has(fp)) {
      byFile.set(fp, []);
    }
    byFile.get(fp).push(issue);
  }

  // Process each file
  for (const [filePath, fileIssues] of byFile) {
    try {
      if (!fs.existsSync(filePath)) {
        fixResults.errors.push({ filePath, error: 'File not found' });
        continue;
      }

      let content = fs.readFileSync(filePath, 'utf8');
      const appliedToFile = [];

      for (const issue of fileIssues) {
        try {
          if (issue.patternId === 'aggressive_emphasis') {
            content = fixAggressiveEmphasis(content);
            appliedToFile.push({
              issue: issue.issue,
              fix: 'Reduced aggressive emphasis',
              filePath
            });
          }
          // Add more fixers as needed
        } catch (err) {
          fixResults.errors.push({
            issue: issue.issue,
            filePath,
            error: err.message
          });
        }
      }

      // Write changes
      if (!dryRun && appliedToFile.length > 0) {
        if (backup) {
          fs.writeFileSync(`${filePath}.backup`, fs.readFileSync(filePath, 'utf8'), 'utf8');
        }
        fs.writeFileSync(filePath, content, 'utf8');
      }

      fixResults.applied.push(...appliedToFile);

    } catch (err) {
      fixResults.errors.push({
        filePath,
        error: err.message
      });
    }
  }

  return fixResults;
}

/**
 * Fix aggressive emphasis in content
 * @param {string} content - Content to fix
 * @returns {string} Fixed content
 */
function fixAggressiveEmphasis(content) {
  if (!content) return content;

  // Replace aggressive CAPS phrases with normal case
  const replacements = [
    { pattern: /\bCRITICAL\b/g, replacement: 'critical' },
    { pattern: /\bIMPORTANT\b/g, replacement: 'important' },
    { pattern: /\bMUST\b/g, replacement: 'must' },
    { pattern: /\bNEVER\b/g, replacement: 'never' },
    { pattern: /\bALWAYS\b/g, replacement: 'always' },
    { pattern: /\bREQUIRED\b/g, replacement: 'required' },
    { pattern: /\bMANDATORY\b/g, replacement: 'mandatory' },
    { pattern: /\bESSENTIAL\b/g, replacement: 'essential' },
    { pattern: /\bWARNING\b/g, replacement: 'warning' },
    { pattern: /\bCAUTION\b/g, replacement: 'caution' }
  ];

  let result = content;
  for (const { pattern, replacement } of replacements) {
    result = result.replace(pattern, replacement);
  }

  // Reduce multiple exclamation marks
  result = result.replace(/!{2,}/g, '!');

  return result;
}

/**
 * Generate report from analysis results
 * @param {Object|Array} results - Analysis results
 * @param {Object} options - Report options
 * @returns {string} Markdown report
 */
function generateReport(results, options = {}) {
  if (Array.isArray(results)) {
    return reporter.generatePromptSummaryReport(results, options);
  } else {
    return reporter.generatePromptReport(results, options);
  }
}

module.exports = {
  analyzePrompt,
  analyzeAllPrompts,
  analyze,
  applyFixes,
  fixAggressiveEmphasis,
  generateReport,
  detectPromptType,
  estimateTokens
};
