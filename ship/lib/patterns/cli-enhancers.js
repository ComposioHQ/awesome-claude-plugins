/**
 * CLI Enhancers for Slop Detection Pipeline
 *
 * Optional CLI tool integration for Phase 2 detection.
 * All tools are user-installed globally - zero npm dependencies for this module.
 * Functions gracefully degrade when tools are not available.
 *
 * Supported languages: javascript, typescript, python, rust, go
 *
 * @module patterns/cli-enhancers
 * @author Avi Fenesh
 * @license MIT
 */

const { execSync, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
// Note: escapeDoubleQuotes no longer needed - using execFileSync with arg arrays

/**
 * Cache for tool availability (per-repo)
 * Key: repoPath, Value: { tools: {...}, languages: [...], timestamp: Date }
 */
const toolCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Supported languages (must match slop-patterns.js)
 */
const SUPPORTED_LANGUAGES = ['javascript', 'typescript', 'python', 'rust', 'go'];

/**
 * CLI tool definitions organized by language
 * Only includes tools for supported languages
 */
const CLI_TOOLS = {
  // Cross-language tools
  jscpd: {
    name: 'jscpd',
    description: 'Copy/paste detector for code duplication',
    checkCommand: 'jscpd --version',
    installHint: 'npm install -g jscpd',
    languages: ['javascript', 'typescript', 'python', 'go', 'rust']
  },

  // JavaScript/TypeScript tools
  madge: {
    name: 'madge',
    description: 'Circular dependency detector',
    checkCommand: 'madge --version',
    installHint: 'npm install -g madge',
    languages: ['javascript', 'typescript']
  },
  escomplex: {
    name: 'escomplex',
    description: 'Cyclomatic complexity analyzer',
    checkCommand: 'escomplex --version',
    installHint: 'npm install -g escomplex',
    languages: ['javascript']
  },

  // Python tools
  pylint: {
    name: 'pylint',
    description: 'Python linter with complexity analysis',
    checkCommand: 'pylint --version',
    installHint: 'pip install pylint',
    languages: ['python']
  },
  radon: {
    name: 'radon',
    description: 'Python complexity and maintainability metrics',
    checkCommand: 'radon --version',
    installHint: 'pip install radon',
    languages: ['python']
  },

  // Go tools
  golangci_lint: {
    name: 'golangci-lint',
    description: 'Go linters aggregator with complexity checks',
    checkCommand: 'golangci-lint --version',
    installHint: 'go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest',
    languages: ['go']
  },

  // Rust tools
  clippy: {
    name: 'cargo-clippy',
    description: 'Rust linter with code smell detection',
    checkCommand: 'cargo clippy --version',
    installHint: 'rustup component add clippy',
    languages: ['rust']
  }
};

/**
 * Check if a CLI tool is available in PATH
 * Uses execFileSync to avoid shell injection risks
 *
 * @param {string} command - Command to check (e.g., 'jscpd --version')
 * @returns {boolean} True if tool is available
 */
function isToolAvailable(command) {
  try {
    // Parse command into executable and args for safer execution
    const parts = command.split(/\s+/);
    const executable = parts[0];
    const args = parts.slice(1);
    execFileSync(executable, args, {
      stdio: 'pipe',
      timeout: 5000,
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get cache key for a repo
 * @param {string} repoPath - Repository root path
 * @returns {string} Cache key
 */
function getCacheKey(repoPath) {
  return path.resolve(repoPath);
}

/**
 * Check if cache is valid
 * @param {Object} cacheEntry - Cache entry
 * @returns {boolean} True if cache is still valid
 */
function isCacheValid(cacheEntry) {
  if (!cacheEntry) return false;
  return Date.now() - cacheEntry.timestamp < CACHE_TTL_MS;
}

/**
 * Clear the tool cache (useful for testing)
 */
function clearCache() {
  toolCache.clear();
}

/**
 * Detect primary language(s) of a repository based on file extensions and config files
 *
 * @param {string} repoPath - Repository root path
 * @returns {string[]} Array of detected languages (only supported ones)
 */
function detectProjectLanguages(repoPath) {
  const languages = new Set();

  // Check for language-specific config files
  const configIndicators = {
    'package.json': ['javascript', 'typescript'],
    'tsconfig.json': ['typescript'],
    'requirements.txt': ['python'],
    'setup.py': ['python'],
    'pyproject.toml': ['python'],
    'Pipfile': ['python'],
    'go.mod': ['go'],
    'go.sum': ['go'],
    'Cargo.toml': ['rust']
  };

  for (const [file, langs] of Object.entries(configIndicators)) {
    if (fs.existsSync(path.join(repoPath, file))) {
      langs.forEach(l => languages.add(l));
    }
  }

  // If no config files found, scan for source files
  if (languages.size === 0) {
    const extensionMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust'
    };

    // Quick scan of top-level and src/ directories
    const dirsToScan = [repoPath, path.join(repoPath, 'src'), path.join(repoPath, 'lib')];

    for (const dir of dirsToScan) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (extensionMap[ext]) {
            languages.add(extensionMap[ext]);
          }
        }
      } catch {
        // Directory not readable
      }
    }
  }

  // Filter to only supported languages
  const result = Array.from(languages).filter(l => SUPPORTED_LANGUAGES.includes(l));

  // Default to javascript if nothing detected
  if (result.length === 0) {
    result.push('javascript');
  }

  return result;
}

/**
 * Get tools relevant for specific languages
 *
 * @param {string[]} languages - Array of language names
 * @returns {Object} Filtered CLI_TOOLS for the specified languages
 */
function getToolsForLanguages(languages) {
  const relevant = {};

  for (const [toolName, tool] of Object.entries(CLI_TOOLS)) {
    if (tool.languages.some(lang => languages.includes(lang))) {
      relevant[toolName] = tool;
    }
  }

  return relevant;
}

/**
 * Detect which CLI tools are available on the system
 * Uses cache when available
 *
 * @param {string[]} [languages] - Optional languages to filter tools for
 * @param {string} [repoPath] - Optional repo path for caching
 * @returns {Object} Object with tool names as keys and availability as boolean values
 */
function detectAvailableTools(languages = null, repoPath = null) {
  // Check cache if repoPath provided
  if (repoPath) {
    const cacheKey = getCacheKey(repoPath);
    const cached = toolCache.get(cacheKey);
    if (isCacheValid(cached)) {
      // Return cached tools filtered by languages if specified
      if (languages) {
        const relevantTools = getToolsForLanguages(languages);
        const filtered = {};
        for (const name of Object.keys(relevantTools)) {
          filtered[name] = cached.tools[name] || false;
        }
        return filtered;
      }
      return { ...cached.tools };
    }
  }

  // Get tools to check
  const toolsToCheck = languages ? getToolsForLanguages(languages) : CLI_TOOLS;
  const result = {};

  for (const [toolName, tool] of Object.entries(toolsToCheck)) {
    result[toolName] = isToolAvailable(tool.checkCommand);
  }

  // Update cache if repoPath provided
  if (repoPath) {
    const cacheKey = getCacheKey(repoPath);
    const existing = toolCache.get(cacheKey) || {};
    toolCache.set(cacheKey, {
      tools: { ...existing.tools, ...result },
      languages: languages || existing.languages || [],
      timestamp: Date.now()
    });
  }

  return result;
}

/**
 * Get tool availability for a specific repo (with caching)
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} [options] - Options
 * @param {boolean} [options.forceRefresh=false] - Force cache refresh
 * @returns {{ available: Object, missing: string[], languages: string[] }} Tool availability info
 */
function getToolAvailabilityForRepo(repoPath, options = {}) {
  const cacheKey = getCacheKey(repoPath);

  // Check cache unless force refresh
  if (!options.forceRefresh) {
    const cached = toolCache.get(cacheKey);
    if (isCacheValid(cached) && cached.languages && cached.languages.length > 0) {
      const relevantTools = getToolsForLanguages(cached.languages);
      const missing = Object.keys(relevantTools).filter(t => !cached.tools[t]);
      return {
        available: { ...cached.tools },
        missing,
        languages: [...cached.languages]
      };
    }
  }

  // Detect languages
  const languages = detectProjectLanguages(repoPath);

  // Detect tools for those languages
  const available = detectAvailableTools(languages, repoPath);

  // Find missing tools
  const relevantTools = getToolsForLanguages(languages);
  const missing = Object.keys(relevantTools).filter(t => !available[t]);

  // Update cache
  toolCache.set(cacheKey, {
    tools: available,
    languages,
    timestamp: Date.now()
  });

  return { available, missing, languages };
}

/**
 * Run duplicate code detection using jscpd
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options
 * @param {number} [options.minLines=5] - Minimum lines for duplicate detection
 * @param {number} [options.minTokens=50] - Minimum tokens for duplicate detection
 * @returns {Array|null} Duplicates found, or null if tool not available
 */
function runDuplicateDetection(repoPath, options = {}) {
  if (!isToolAvailable(CLI_TOOLS.jscpd.checkCommand)) {
    return null;
  }

  const minLines = options.minLines || 5;
  const minTokens = options.minTokens || 50;

  try {
    // Run jscpd with JSON output
    // Use execFileSync with arg array to prevent command injection (no shell interpretation)
    const outputPath = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const args = [
      repoPath,
      '--min-lines', String(minLines),
      '--min-tokens', String(minTokens),
      '--reporters', 'json',
      '--output', outputPath,
      '--silent'
    ];

    const result = execFileSync('jscpd', args, {
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr all piped
      timeout: 60000,
      windowsHide: true,
      cwd: repoPath,
      encoding: 'utf8'
    });

    // Parse JSON output
    try {
      const report = JSON.parse(result);
      const duplicates = [];

      if (report.duplicates) {
        for (const dup of report.duplicates) {
          duplicates.push({
            firstFile: dup.firstFile?.name || 'unknown',
            firstLine: dup.firstFile?.start || 0,
            secondFile: dup.secondFile?.name || 'unknown',
            secondLine: dup.secondFile?.start || 0,
            lines: dup.lines || 0,
            tokens: dup.tokens || 0,
            fragment: dup.fragment?.substring(0, 100) || ''
          });
        }
      }

      return duplicates;
    } catch {
      // JSON parsing failed, return empty array
      return [];
    }
  } catch {
    // Tool execution failed
    return null;
  }
}

/**
 * Run circular dependency detection using madge
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options
 * @param {string} [options.entry] - Entry file (defaults to src/index.js or index.js)
 * @returns {Array|null} Circular dependency cycles, or null if tool not available
 */
function runDependencyAnalysis(repoPath, options = {}) {
  if (!isToolAvailable(CLI_TOOLS.madge.checkCommand)) {
    return null;
  }

  // Determine entry point
  let entry = options.entry;
  if (!entry) {
    const possibleEntries = [
      'src/index.js',
      'src/index.ts',
      'index.js',
      'index.ts',
      'lib/index.js',
      'main.js'
    ];

    for (const e of possibleEntries) {
      if (fs.existsSync(path.join(repoPath, e))) {
        entry = e;
        break;
      }
    }
  }

  if (!entry) {
    // No entry point found, scan entire directory
    entry = '.';
  }

  try {
    // Run madge with circular flag and JSON output
    // Use execFileSync with arg array to prevent command injection (no shell interpretation)
    const args = ['--circular', '--json', entry];

    const result = execFileSync('madge', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
      windowsHide: true,
      cwd: repoPath,
      encoding: 'utf8'
    });

    // Parse JSON output
    try {
      const cycles = JSON.parse(result);
      // madge returns array of arrays (each cycle is an array of file paths)
      return Array.isArray(cycles) ? cycles : [];
    } catch {
      return [];
    }
  } catch {
    // Tool execution failed
    return null;
  }
}

/**
 * Run complexity analysis using escomplex
 *
 * @param {string} repoPath - Repository root path
 * @param {string[]} targetFiles - Files to analyze
 * @param {Object} options - Options
 * @returns {Array|null} Complexity results, or null if tool not available
 */
function runComplexityAnalysis(repoPath, targetFiles, options = {}) {
  if (!isToolAvailable(CLI_TOOLS.escomplex.checkCommand)) {
    return null;
  }

  const results = [];

  // escomplex works on individual files
  for (const file of targetFiles) {
    // Only analyze JS/TS files
    if (!file.match(/\.[jt]sx?$/)) continue;

    const filePath = path.isAbsolute(file) ? file : path.join(repoPath, file);

    try {
      // Use execFileSync with arg array to prevent command injection (no shell interpretation)
      const args = [filePath, '--format', 'json'];

      const result = execFileSync('escomplex', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
        windowsHide: true,
        cwd: repoPath,
        encoding: 'utf8'
      });

      try {
        const report = JSON.parse(result);

        // Extract function-level complexity
        if (report.functions) {
          for (const fn of report.functions) {
            results.push({
              file,
              name: fn.name || 'anonymous',
              line: fn.line || 0,
              complexity: fn.cyclomatic || 0,
              halstead: fn.halstead?.difficulty || 0,
              sloc: fn.sloc?.logical || 0
            });
          }
        }

        // Also include module-level metrics
        if (report.aggregate) {
          results.push({
            file,
            name: 'module',
            line: 0,
            complexity: report.aggregate.cyclomatic || 0,
            halstead: report.aggregate.halstead?.difficulty || 0,
            sloc: report.aggregate.sloc?.logical || 0,
            maintainability: report.maintainability || 0
          });
        }
      } catch {
        // JSON parsing failed for this file
      }
    } catch {
      // Tool execution failed for this file
    }
  }

  return results.length > 0 ? results : null;
}

/**
 * Get user-friendly message about missing tools (language-aware)
 *
 * @param {string[]} missingTools - Array of missing tool names
 * @param {string[]} [languages] - Detected languages (for context in message)
 * @returns {string} Formatted message
 */
function getMissingToolsMessage(missingTools, languages = null) {
  if (!missingTools || missingTools.length === 0) {
    return '';
  }

  // Filter to only known tools
  const validTools = missingTools.filter(t => CLI_TOOLS[t]);
  if (validTools.length === 0) {
    return '';
  }

  let message = '\n## Enhanced Analysis Available\n\n';

  if (languages && languages.length > 0) {
    message += `Detected project languages: ${languages.join(', ')}\n\n`;
  }

  message += 'For deeper analysis, consider installing:\n\n';

  for (const toolName of validTools) {
    const tool = CLI_TOOLS[toolName];
    if (tool) {
      message += `- **${tool.name}**: ${tool.description}\n`;
      message += `  Install: \`${tool.installHint}\`\n`;
    }
  }

  message += '\nThese tools are optional and enhance detection capabilities.\n';

  return message;
}

/**
 * Get all CLI tool definitions
 *
 * @returns {Object} CLI tool definitions
 */
function getToolDefinitions() {
  return { ...CLI_TOOLS };
}

/**
 * Get supported languages list
 *
 * @returns {string[]} Array of supported language names
 */
function getSupportedLanguages() {
  return [...SUPPORTED_LANGUAGES];
}

module.exports = {
  detectAvailableTools,
  detectProjectLanguages,
  getToolsForLanguages,
  getToolAvailabilityForRepo,
  runDuplicateDetection,
  runDependencyAnalysis,
  runComplexityAnalysis,
  getMissingToolsMessage,
  getToolDefinitions,
  getSupportedLanguages,
  clearCache,
  // Exported for testing
  isToolAvailable,
  CLI_TOOLS,
  SUPPORTED_LANGUAGES
};
