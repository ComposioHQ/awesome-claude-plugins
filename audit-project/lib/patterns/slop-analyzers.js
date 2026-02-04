/**
 * Slop Analyzers - Multi-pass analysis functions for slop detection
 *
 * These analyzers handle patterns that require structural code analysis
 * beyond simple regex matching (e.g., doc/code ratio computation).
 *
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Analyze JSDoc-to-function ratio to detect excessive documentation
 *
 * Flags functions where JSDoc block lines exceed maxRatio times the function body lines.
 * This pattern often indicates AI-generated code with verbose, unnecessary documentation.
 *
 * @param {string} content - File content to analyze
 * @param {Object} options - Analysis options
 * @param {number} [options.minFunctionLines=3] - Minimum function body lines to analyze
 * @param {number} [options.maxRatio=3.0] - Maximum allowed doc/code ratio
 * @returns {Array<Object>} Array of violations: { line, docLines, codeLines, ratio }
 */
function analyzeDocCodeRatio(content, options = {}) {
  const minFunctionLines = options.minFunctionLines || 3;
  const maxRatio = options.maxRatio || 3.0;
  const lang = detectLanguage(options.filePath || '.js');
  const violations = [];

  const config = getDocCodeConfig(lang);
  if (!config) return violations;

  if (config.useBraces) {
    return analyzeDocCodeBraceLanguage(content, lang, config, minFunctionLines, maxRatio);
  } else {
    return analyzeDocCodePython(content, minFunctionLines, maxRatio);
  }
}

/**
 * Get language-specific configuration for doc/code ratio detection
 */
function getDocCodeConfig(lang) {
  const configs = {
    js: {
      useBraces: true,
      // JSDoc: /** ... */ followed by function
      docPatterns: [
        /\/\*\*([\s\S]*?)\*\/\s*(export\s+)?(async\s+)?(?:function\s+(\w+)\s*\([^)]*\)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g,
      ],
    },
    java: {
      useBraces: true,
      // Javadoc: /** ... */ followed by method
      docPatterns: [
        /\/\*\*([\s\S]*?)\*\/\s*(?:@\w+\s*)*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\([^)]*\)/g,
      ],
    },
    rust: {
      useBraces: true,
      // Rust doc comments: /// or //! lines before fn
      docPatterns: [
        /((?:^\s*\/\/[\/!].*\n)+)\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm,
      ],
    },
    go: {
      useBraces: true,
      // Go doc comments: // lines before func
      docPatterns: [
        /((?:^\s*\/\/.*\n)+)\s*func\s+(?:\([^)]+\)\s+)?(\w+)/gm,
      ],
    },
    python: {
      useBraces: false,
    },
  };
  return configs[lang];
}

/**
 * Analyze doc/code ratio for brace-delimited languages (JS, Java, Rust, Go)
 */
function analyzeDocCodeBraceLanguage(content, lang, config, minFunctionLines, maxRatio) {
  const violations = [];

  for (const pattern of config.docPatterns) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(content)) !== null) {
      const docBlock = match[1];
      const docLines = countNonEmptyLines(docBlock);

      // Find the opening brace after the match
      const afterMatch = match.index + match[0].length;
      const openBraceOffset = content.substring(afterMatch).search(/\{/);
      if (openBraceOffset === -1) continue;

      const funcStart = afterMatch + openBraceOffset;
      const closingBraceIndex = findMatchingBrace(content, funcStart);
      if (closingBraceIndex === -1) continue;

      const funcBody = content.substring(funcStart + 1, closingBraceIndex);
      const funcLines = countNonEmptyLines(funcBody);

      if (funcLines < minFunctionLines) continue;

      const ratio = docLines / funcLines;
      if (ratio > maxRatio) {
        const lineNumber = countNewlines(content.substring(0, match.index)) + 1;
        const funcName = match[4] || match[5] || 'unknown';
        violations.push({
          line: lineNumber,
          docLines: docLines,
          codeLines: funcLines,
          ratio: parseFloat(ratio.toFixed(2)),
          functionName: funcName
        });
      }
    }
  }

  return violations;
}

/**
 * Analyze doc/code ratio for Python (indentation-based with docstrings)
 */
function analyzeDocCodePython(content, minFunctionLines, maxRatio) {
  const violations = [];
  const lines = content.split('\n');

  const defPattern = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\([^)]*\)\s*(?:->.*)?:\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const match = defPattern.exec(lines[i]);
    if (!match) continue;

    const funcIndent = match[1].length;
    const funcName = match[2];

    // Look for docstring right after def
    let docLines = 0;
    let docEndLine = i + 1;
    if (docEndLine < lines.length) {
      const nextLine = lines[docEndLine].trim();
      if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) {
        const quote = nextLine.substring(0, 3);
        // Single-line docstring?
        if (nextLine.length > 6 && nextLine.endsWith(quote)) {
          docLines = 1;
          docEndLine++;
        } else {
          // Multi-line docstring
          docLines = 1;
          docEndLine++;
          while (docEndLine < lines.length) {
            docLines++;
            if (lines[docEndLine].includes(quote)) {
              docEndLine++;
              break;
            }
            docEndLine++;
          }
        }
      }
    }

    // Count function body lines (after docstring)
    let codeLines = 0;
    for (let j = docEndLine; j < lines.length; j++) {
      const line = lines[j];
      const trimmed = line.trim();
      if (!trimmed) continue;

      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= funcIndent && trimmed) break;

      if (!trimmed.startsWith('#')) {
        codeLines++;
      }
    }

    if (codeLines < minFunctionLines) continue;

    const ratio = docLines / codeLines;
    if (ratio > maxRatio) {
      violations.push({
        line: i + 1,
        docLines: docLines,
        codeLines: codeLines,
        ratio: parseFloat(ratio.toFixed(2)),
        functionName: funcName
      });
    }
  }

  return violations;
}

/**
 * Count non-empty lines in a string
 * @param {string} str - String to count lines in
 * @returns {number} Number of non-empty lines
 */
function countNonEmptyLines(str) {
  return str.split('\n').filter(line => line.trim().length > 0).length;
}

/**
 * Count newlines in a string (for line number calculation)
 * @param {string} str - String to count newlines in
 * @returns {number} Number of newlines (lines - 1 for content before position)
 */
function countNewlines(str) {
  if (!str) return 0;
  return (str.match(/\n/g) || []).length;
}

/**
 * Find matching closing brace (handles nested braces and string literals)
 *
 * Stops at 5000 characters to prevent runaway parsing on malformed code.
 *
 * @param {string} content - Full file content
 * @param {number} openIndex - Index of opening brace
 * @returns {number} Index of matching closing brace, or -1 if not found
 */
function findMatchingBrace(content, openIndex) {
  let depth = 1;
  let inString = false;
  let stringChar = '';
  let inTemplateExpr = false;
  let templateExprDepth = 0;

  // Limit search to prevent runaway parsing
  const maxSearch = Math.min(content.length, openIndex + 5000);

  for (let i = openIndex + 1; i < maxSearch; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';

    // Skip single-line comments (must be checked before string handling)
    // Quotes/apostrophes inside comments should not affect string state
    if (!inString && char === '/' && content[i + 1] === '/') {
      const eol = content.indexOf('\n', i);
      i = eol === -1 ? maxSearch : eol;
      continue;
    }

    // Skip block comments
    if (!inString && char === '/' && content[i + 1] === '*') {
      const endComment = content.indexOf('*/', i + 2);
      i = endComment === -1 ? maxSearch : endComment + 1;
      continue;
    }

    // Handle template literal expression ${...}
    if (char === '$' && content[i + 1] === '{' && inString && stringChar === '`') {
      inTemplateExpr = true;
      templateExprDepth = 1;
      i++; // Skip the {
      continue;
    }

    // Inside template expression, track braces separately
    if (inTemplateExpr) {
      if (char === '{') {
        templateExprDepth++;
      } else if (char === '}') {
        templateExprDepth--;
        if (templateExprDepth === 0) {
          inTemplateExpr = false;
        }
      }
      continue;
    }

    // Track string state (handle escaped quotes)
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
      } else if (!inString) {
        inString = true;
        stringChar = char;
      }
      continue;
    }

    // Count braces outside strings
    if (!inString) {
      if (char === '{') depth++;
      if (char === '}') depth--;
      if (depth === 0) return i;
    }
  }

  return -1; // Not found within limit
}

// ============================================================================
// Verbosity Detection
// ============================================================================

/**
 * Comment syntax patterns for different languages
 * blockLen: length of block comment delimiter (2 for /*, 3 for """)
 */
const COMMENT_SYNTAX = {
  js: { line: /^\s*\/\//, block: { start: /\/\*/, end: /\*\//, len: 2 } },
  python: { line: /^\s*#/, block: { start: /"""/, end: /"""/, len: 3 } },
  rust: { line: /^\s*\/\//, block: { start: /\/\*/, end: /\*\//, len: 2 } },
  go: { line: /^\s*\/\//, block: { start: /\/\*/, end: /\*\//, len: 2 } }
};

/**
 * Detect language from file extension for comment syntax
 * @param {string} filePath - File path or extension
 * @returns {string} Language key (js, python, rust, go)
 */
function detectCommentLanguage(filePath) {
  if (!filePath) return 'js';
  const ext = filePath.includes('.') ? filePath.substring(filePath.lastIndexOf('.')) : filePath;
  if (['.py'].includes(ext)) return 'python';
  if (['.rs'].includes(ext)) return 'rust';
  if (['.go'].includes(ext)) return 'go';
  return 'js'; // Default for .js, .ts, .jsx, .tsx, etc.
}

/**
 * Analyze inline comment-to-code ratio within functions
 *
 * Flags functions where inline comment lines exceed maxCommentRatio times the code lines.
 * This pattern detects over-explained code where comments restate what the code does.
 *
 * Different from doc/code ratio:
 * - doc/code ratio: counts JSDoc blocks ABOVE functions
 * - verbosity ratio: counts inline comments WITHIN function bodies
 *
 * @param {string} content - File content to analyze
 * @param {Object} options - Analysis options
 * @param {number} [options.minCodeLines=3] - Minimum code lines to analyze
 * @param {number} [options.maxCommentRatio=2.0] - Maximum allowed comment/code ratio
 * @param {string} [options.filePath] - File path for language detection
 * @returns {Array<Object>} Array of violations: { line, commentLines, codeLines, ratio }
 */
function analyzeVerbosityRatio(content, options = {}) {
  const minCodeLines = options.minCodeLines || 3;
  const maxCommentRatio = options.maxCommentRatio || 2.0;
  const lang = detectCommentLanguage(options.filePath);
  const violations = [];

  // Pattern to find function declarations with opening brace
  // Handles: function name(), async function name(), const name = () =>, arrow functions
  const funcPattern = /(export\s+)?(async\s+)?(?:function\s+\w+\s*\([^)]*\)|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?function\s*\([^)]*\))/g;

  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    // Find the opening brace after the function declaration
    const afterMatch = match.index + match[0].length;
    const searchRegion = content.substring(afterMatch, afterMatch + 200); // Look ahead
    const braceMatch = searchRegion.match(/^\s*\{/);

    if (!braceMatch) continue; // No opening brace found (might be expression body arrow)

    const funcStart = afterMatch + searchRegion.indexOf('{');
    const closingBraceIndex = findMatchingBrace(content, funcStart);

    if (closingBraceIndex === -1) continue; // Parsing failed, skip

    const funcBody = content.substring(funcStart + 1, closingBraceIndex);

    // Count comment lines and code lines within function body
    const lines = funcBody.split('\n');
    let commentLines = 0;
    let codeLines = 0;
    let inBlockComment = false;
    const commentSyntax = COMMENT_SYNTAX[lang] || COMMENT_SYNTAX.js;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue; // Skip empty lines

      // Handle block comments
      if (inBlockComment) {
        commentLines++;
        if (commentSyntax.block.end.test(trimmed)) {
          inBlockComment = false;
        }
        continue;
      }

      if (commentSyntax.block.start.test(trimmed)) {
        commentLines++;
        const delimLen = commentSyntax.block.len || 2;
        if (!commentSyntax.block.end.test(trimmed.substring(trimmed.search(commentSyntax.block.start) + delimLen))) {
          inBlockComment = true;
        }
        continue;
      }

      // Handle line comments
      if (commentSyntax.line.test(trimmed)) {
        commentLines++;
        continue;
      }

      // It's code (may have trailing comment, but primary purpose is code)
      codeLines++;
    }

    // Skip if function is too small
    if (codeLines < minCodeLines) continue;

    const ratio = commentLines / codeLines;
    if (ratio > maxCommentRatio) {
      // Line number is 1-indexed: count newlines before match + 1
      const lineNumber = countNewlines(content.substring(0, match.index)) + 1;
      violations.push({
        line: lineNumber,
        commentLines,
        codeLines,
        ratio: parseFloat(ratio.toFixed(2))
      });
    }
  }

  return violations;
}

// ============================================================================
// Over-Engineering Detection
// ============================================================================

/**
 * Standard entry points per language ecosystem
 * Libraries typically re-export from these files
 */
const ENTRY_POINTS = [
  'index.js', 'index.ts', 'src/index.js', 'src/index.ts',
  'lib/index.js', 'lib/index.ts', 'main.js', 'main.ts',
  'lib.rs', 'src/lib.rs',
  'main.go',
  '__init__.py', 'src/__init__.py',
  'Main.java', 'src/Main.java', 'src/main/java/Main.java',
  'Application.java', 'src/main/java/Application.java',
  'App.java', 'src/main/java/App.java'
];

/**
 * Export patterns per language (used by countExportsInContent)
 */
const EXPORT_PATTERNS = {
  js: [
    /export\s+(function|class|const|let|var|default|async\s+function)/g,
    /export\s*\{[^}]+\}/g,           // Named re-exports: export { Foo, Bar }
    /export\s*\*\s*(as\s+\w+\s+)?from/g,  // Star re-exports: export * from './foo'
    /module\.exports\s*=/g,
    /exports\.\w+\s*=/g
  ],
  rust: [
    /^pub\s+(fn|struct|enum|mod|type|trait|const|static)/gm
  ],
  go: [
    /^func\s+[A-Z]/gm,
    /^type\s+[A-Z]\w*\s+(struct|interface)/gm,
    /^var\s+[A-Z]/gm,
    /^const\s+[A-Z]/gm
  ],
  python: [
    /__all__\s*=\s*\[/g,
    /^def\s+(?!_)\w+\s*\(/gm,    // Public functions (excludes _private)
    /^class\s+[A-Z]\w*[\s:(]/gm
  ],
  java: [
    /^\s*public\s+(?:static\s+)?(?:final\s+)?(?:class|interface|enum)\s+\w+/gm,
    /^\s*public\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:\w+(?:<[^>]*>)?)\s+\w+\s*\(/gm
  ]
};

/**
 * Source file extensions per language
 */
const SOURCE_EXTENSIONS = {
  js: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
  rust: ['.rs'],
  go: ['.go'],
  python: ['.py'],
  java: ['.java']
};

/**
 * Directories to exclude from analysis
 */
const EXCLUDE_DIRS = [
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target',
  '.git', '.svn', '.hg', '__pycache__', '.pytest_cache',
  'coverage', '.nyc_output', '.next', '.nuxt', '.cache'
];

/**
 * Parse .gitignore file and return a matcher function
 * @param {string} repoPath - Repository root path
 * @param {Object} fs - File system module
 * @param {Object} path - Path module
 * @returns {Function|null} Matcher function or null if no .gitignore
 */
function parseGitignore(repoPath, fs, path) {
  const gitignorePath = path.join(repoPath, '.gitignore');

  let content;
  try {
    content = fs.readFileSync(gitignorePath, 'utf8');
  } catch {
    return null; // No .gitignore file
  }

  const patterns = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(rawPattern => {
      let pattern = rawPattern;

      // Track if pattern is negated
      const negated = pattern.startsWith('!');
      if (negated) pattern = pattern.slice(1);

      // Track if pattern is directory-only
      const dirOnly = pattern.endsWith('/');
      if (dirOnly) pattern = pattern.slice(0, -1);

      // Track if pattern is anchored (explicit / at start)
      const anchored = pattern.startsWith('/');
      if (anchored) pattern = pattern.slice(1);

      // Check if pattern starts with ** (matches any leading path)
      const matchesAnywhere = pattern.startsWith('**/');

      // Convert gitignore pattern to regex
      // Step 1: Replace globstar patterns with placeholders (before escaping)
      let regexStr = pattern
        .replace(/^\*\*\//, '\x00LEADING\x00')
        .replace(/\/\*\*$/, '\x00TRAILING\x00')
        .replace(/\*\*\//g, '\x00ANYPATH\x00')
        .replace(/\/\*\*/g, '\x00ANYPATH2\x00')
        .replace(/\*\*/g, '\x00STAR2\x00');

      // Step 2: Escape special regex chars (except * and ?) and handle remaining globs
      regexStr = regexStr
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');

      // Step 3: Restore globstar patterns with proper regex
      regexStr = regexStr
        .replace(/\x00LEADING\x00/g, '(?:.*/)?')
        .replace(/\x00TRAILING\x00/g, '(?:/.*)?')
        .replace(/\x00ANYPATH\x00/g, '(?:.*/)?')
        .replace(/\x00ANYPATH2\x00/g, '(?:/.*)?')
        .replace(/\x00STAR2\x00/g, '.*');

      // Pattern matching rules:
      // - Anchored (starts with /): match from root only
      // - Starts with **: match anywhere (leading ** already handled in regex)
      // - Contains /: match relative to root
      // - Simple name: match anywhere in path
      if (anchored) {
        regexStr = '^' + regexStr;
      } else if (matchesAnywhere) {
        // Leading ** already allows matching anywhere via (?:.*/)? prefix
        regexStr = '^' + regexStr;
      } else if (pattern.includes('/')) {
        regexStr = '^' + regexStr;
      } else {
        // Simple patterns match anywhere
        regexStr = '(?:^|/)' + regexStr;
      }

      return {
        regex: new RegExp(regexStr + '(?:$|/)'),
        negated,
        dirOnly
      };
    });

  return function isIgnored(relativePath, isDirectory = false) {
    // Normalize path separators
    const normalized = relativePath.replace(/\\/g, '/');
    let ignored = false;

    for (const { regex, negated, dirOnly } of patterns) {
      // Skip directory-only patterns for files
      if (dirOnly && !isDirectory) continue;

      if (regex.test(normalized)) {
        ignored = !negated;
      }
    }

    return ignored;
  };
}

/**
 * Detect language from file extension
 * @param {string} filePath - Path to file
 * @returns {string} Language key (js, rust, go, python)
 */
function detectLanguage(filePath) {
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  for (const [lang, exts] of Object.entries(SOURCE_EXTENSIONS)) {
    if (exts.includes(ext)) return lang;
  }
  return 'js'; // Default to JS patterns
}

/**
 * Count exports in file content based on language
 * @param {string} content - File content
 * @param {string} lang - Language key
 * @returns {number} Number of exports detected
 */
function countExportsInContent(content, lang) {
  const patterns = EXPORT_PATTERNS[lang] || EXPORT_PATTERNS.js;
  let count = 0;

  for (const pattern of patterns) {
    // Clone pattern to reset lastIndex
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = content.match(regex);
    if (matches) count += matches.length;
  }

  return count;
}

/**
 * Check if path should be excluded from analysis
 * @param {string} filePath - Path to check
 * @param {string[]} excludeDirs - Directories to exclude
 * @returns {boolean} True if should be excluded
 */
function shouldExclude(filePath, excludeDirs = EXCLUDE_DIRS) {
  const parts = filePath.split(/[\\/]/);
  return parts.some(part => excludeDirs.includes(part));
}

/**
 * Check if file is a test file
 * @param {string} filePath - Path to check
 * @returns {boolean} True if test file
 */
function isTestFile(filePath) {
  const testPatterns = [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /_tests?\.(go|rs|py)$/,
    /test_.*\.py$/,
    /__tests__/,
    /tests?\//i
  ];
  return testPatterns.some(p => p.test(filePath));
}

/**
 * Count source files in directory (recursive, excludes tests/vendor by default)
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options
 * @param {Function} options.readdir - Directory reader (for testing)
 * @param {Function} options.stat - Stat function (for testing)
 * @param {number} options.maxFiles - Maximum files to count (default 10000)
 * @param {boolean} options.includeTests - Include test files (default false)
 * @param {boolean} options.respectGitignore - Respect .gitignore patterns (default true)
 * @returns {Object} { count, files[] }
 */
function countSourceFiles(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');
  const maxFiles = options.maxFiles || 10000;
  const includeTests = options.includeTests || false;
  const respectGitignore = options.respectGitignore !== false;

  const files = [];
  let count = 0;
  // Pre-compute extension list for performance (avoid recalculation in loop)
  const allExts = Object.values(SOURCE_EXTENSIONS).flat();

  // Parse .gitignore if enabled
  const isIgnored = respectGitignore ? parseGitignore(repoPath, fs, path) : null;

  function walk(dir, depth = 0) {
    if (count >= maxFiles) return;
    if (depth > 10) return; // Prevent infinite recursion

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      if (count >= maxFiles) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(repoPath, fullPath);

      if (shouldExclude(relativePath)) continue;

      // Check gitignore
      if (isIgnored && isIgnored(relativePath, entry.isDirectory())) continue;

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);

        if (allExts.includes(ext) && (includeTests || !isTestFile(relativePath))) {
          files.push(relativePath);
          count++;
        }
      }
    }
  }

  walk(repoPath);
  return { count, files };
}

/**
 * Count source lines (excluding comments and blanks)
 *
 * Uses simple heuristics - not a full parser but good enough for metrics.
 * Reads files asynchronously to avoid blocking I/O (PERF-007).
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options
 * @param {string[]} options.files - Files to count (from countSourceFiles)
 * @param {Object} options.fs - File system module (for testing)
 * @returns {Promise<number>} Total source lines
 */
async function countSourceLines(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const fsPromises = fs.promises || require('fs').promises;
  const path = options.path || require('path');
  const files = options.files || countSourceFiles(repoPath, options).files;

  // Process files in parallel batches to avoid overwhelming the system
  const BATCH_SIZE = 50;
  let totalLines = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const content = await fsPromises.readFile(path.join(repoPath, file), 'utf8');
          return countLinesInContent(content);
        } catch {
          // Skip unreadable files
          return 0;
        }
      })
    );
    totalLines += results.reduce((sum, count) => sum + count, 0);
  }

  return totalLines;
}

/**
 * Count source lines in file content (excluding comments and blanks)
 *
 * @param {string} content - File content
 * @returns {number} Source line count
 */
function countLinesInContent(content) {
  const lines = content.split('\n');
  let count = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Process line for block comments (handles inline and multi-line)
    let processedLine = trimmed;

    // Handle block comment state transitions
    if (inBlockComment) {
      const endIdx = processedLine.indexOf('*/');
      if (endIdx !== -1) {
        // Comment ends on this line - keep anything after */
        inBlockComment = false;
        processedLine = processedLine.substring(endIdx + 2).trim();
      } else {
        // Still in block comment
        continue;
      }
    }

    // Check for block comment start (may also end on same line)
    const startIdx = processedLine.indexOf('/*');
    if (startIdx !== -1) {
      const beforeComment = processedLine.substring(0, startIdx).trim();
      const afterStart = processedLine.substring(startIdx + 2);
      const endIdx = afterStart.indexOf('*/');

      if (endIdx !== -1) {
        // Single-line block comment: /* ... */
        processedLine = beforeComment + ' ' + afterStart.substring(endIdx + 2).trim();
        processedLine = processedLine.trim();
      } else {
        // Block comment starts but doesn't end
        inBlockComment = true;
        processedLine = beforeComment;
      }
    }

    // Skip if nothing left after removing comments
    if (!processedLine) continue;

    // Skip single-line comments
    if (processedLine.startsWith('//') || processedLine.startsWith('#')) continue;

    // Skip Python/Rust doc comments that span the whole line
    if (processedLine.startsWith('///') || processedLine.startsWith('"""') || processedLine.startsWith("'''")) continue;

    count++;
  }

  return count;
}

/**
 * Count exports from entry points
 *
 * Scans standard entry points (index.js, lib.rs, etc.) for export statements.
 * Falls back to scanning all src/ if no entry points found.
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options
 * @param {Function} options.readFile - File reader (for testing)
 * @returns {Object} { count, method, entryPoints[] }
 */
function countEntryPointExports(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const foundEntries = [];
  let count = 0;

  // Try standard entry points
  for (const entry of ENTRY_POINTS) {
    const fullPath = path.join(repoPath, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lang = detectLanguage(entry);
        const exports = countExportsInContent(content, lang);
        if (exports > 0) {
          foundEntries.push(entry);
          count += exports;
        }
      }
    } catch {
      // File doesn't exist, try next
    }
  }

  if (count > 0) {
    return { count, method: 'entry-points', entryPoints: foundEntries };
  }

  // Fallback: scan src/ for all exports
  const srcDir = path.join(repoPath, 'src');
  try {
    const srcStat = fs.statSync(srcDir);
    if (srcStat.isDirectory()) {
      const { files } = countSourceFiles(srcDir, options);
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
          const lang = detectLanguage(file);
          count += countExportsInContent(content, lang);
        } catch {
          // Skip unreadable
        }
      }
      if (count > 0) {
        return { count, method: 'src-scan', entryPoints: ['src/'] };
      }
    }
  } catch {
    // No src/ directory
  }

  // Final fallback
  return { count: 1, method: 'fallback', entryPoints: [] };
}

/**
 * Get maximum directory depth in a path
 *
 * @param {string} repoPath - Repository root path
 * @param {string} startDir - Directory to start from (e.g., 'src')
 * @param {Object} options - Options
 * @returns {number} Maximum depth (0 if startDir doesn't exist)
 */
function getMaxDirectoryDepth(repoPath, startDir = 'src', options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const rootDir = path.join(repoPath, startDir);
  let maxDepth = 0;

  function walk(dir, depth) {
    if (depth > maxDepth) maxDepth = depth;
    if (depth > 20) return; // Safety limit

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !shouldExclude(entry.name)) {
          walk(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Skip unreadable
    }
  }

  try {
    const stat = fs.statSync(rootDir);
    if (stat.isDirectory()) {
      walk(rootDir, 1);
    }
  } catch {
    return 0;
  }

  return maxDepth;
}

/**
 * Analyze over-engineering metrics for a repository
 *
 * Detects three signals of over-engineering:
 * 1. File-to-export ratio > 20x
 * 2. Lines-per-export > 500:1
 * 3. Directory depth > 4 levels
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Analysis options
 * @param {number} [options.fileRatioThreshold=20] - Max files per export
 * @param {number} [options.linesPerExportThreshold=500] - Max lines per export
 * @param {number} [options.depthThreshold=4] - Max directory depth
 * @returns {Promise<Object>} Analysis results with violations
 */
async function analyzeOverEngineering(repoPath, options = {}) {
  const fileRatioThreshold = options.fileRatioThreshold || 20;
  const linesPerExportThreshold = options.linesPerExportThreshold || 500;
  const depthThreshold = options.depthThreshold || 4;

  const violations = [];

  // Count source files
  const { count: sourceFileCount, files } = countSourceFiles(repoPath, options);

  // Count exports from entry points
  const { count: exportCount, method: exportMethod, entryPoints } = countEntryPointExports(repoPath, options);

  // Calculate file-to-export ratio
  const fileRatio = sourceFileCount / Math.max(exportCount, 1);
  if (fileRatio > fileRatioThreshold) {
    violations.push({
      type: 'file_proliferation',
      value: `${sourceFileCount} files / ${exportCount} exports = ${fileRatio.toFixed(1)}x`,
      threshold: `${fileRatioThreshold}x`,
      severity: fileRatio > fileRatioThreshold * 2 ? 'high' : 'medium',
      details: { sourceFileCount, exportCount, fileRatio, exportMethod }
    });
  }

  // Count source lines (async to avoid blocking I/O - PERF-007)
  const totalLines = await countSourceLines(repoPath, { ...options, files });

  // Calculate lines-per-export ratio
  const linesPerExport = totalLines / Math.max(exportCount, 1);
  if (linesPerExport > linesPerExportThreshold) {
    violations.push({
      type: 'code_density',
      value: `${totalLines} lines / ${exportCount} exports = ${Math.round(linesPerExport)}:1`,
      threshold: `${linesPerExportThreshold}:1`,
      severity: linesPerExport > linesPerExportThreshold * 2 ? 'high' : 'medium',
      details: { totalLines, exportCount, linesPerExport }
    });
  }

  // Get directory depth
  const maxDepth = getMaxDirectoryDepth(repoPath, 'src', options);
  if (maxDepth > depthThreshold) {
    violations.push({
      type: 'directory_depth',
      value: `${maxDepth} levels`,
      threshold: `${depthThreshold} levels`,
      severity: maxDepth > depthThreshold + 2 ? 'high' : 'medium',
      details: { maxDepth }
    });
  }

  return {
    metrics: {
      sourceFiles: sourceFileCount,
      exports: exportCount,
      exportMethod,
      entryPoints,
      totalLines,
      directoryDepth: maxDepth,
      fileRatio: parseFloat(fileRatio.toFixed(2)),
      linesPerExport: Math.round(linesPerExport)
    },
    violations,
    verdict: violations.length > 0
      ? (violations.some(v => v.severity === 'high') ? 'HIGH' : 'MEDIUM')
      : 'OK'
  };
}

// ============================================================================
// Infrastructure Without Implementation Detection
// Detects infrastructure components that are set up but never used
// ============================================================================

/**
 * Common infrastructure component suffixes that indicate setup/configuration
 * These naming patterns typically indicate infrastructure components
 */
const INFRASTRUCTURE_SUFFIXES = [
  'Client', 'Connection', 'Pool', 'Service', 'Provider',
  'Manager', 'Factory', 'Repository', 'Gateway', 'Adapter',
  'Handler', 'Broker', 'Queue', 'Cache', 'Store',
  'Transport', 'Channel', 'Socket', 'Server', 'Database'
];

// Pattern for detecting overly generic variable names to skip
const GENERIC_VAR_PATTERN = /^[ijkxy]$/;

/**
 * Common setup/initialization verbs that indicate infrastructure creation
 */
const SETUP_VERBS = [
  'create', 'connect', 'init', 'initialize', 'setup',
  'configure', 'establish', 'open', 'start', 'new',
  'build', 'make', 'construct', 'instantiate', 'spawn'
];

/**
 * Language-specific patterns for instantiation/initialization
 * These patterns detect when infrastructure components are created
 */
const INSTANTIATION_PATTERNS = {
  js: [
    // new Class() instantiation
    /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(\w+(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))/g,
    // Factory/builder pattern: createXxx(), Xxx.create()
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:create|connect|init|initialize|setup)(\w+)/gi,
    // Method call pattern: thing.connect(), thing.initialize()
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?\w+\.(?:create|connect|init|initialize|setup|open|start)\(/gi
  ],
  python: [
    // Class instantiation: client = SomeClient()
    /(\w+)\s*=\s*(\w+(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))\(/gm,
    // Module.Class pattern: client = module.RedisClient()
    /(\w+)\s*=\s*\w+\.(\w+(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))\(/gm,
    // Factory pattern: client = create_client()
    /(\w+)\s*=\s*(?:create|connect|init|initialize|setup)_(\w+)\(/gm,
    // Async patterns: client = await create_client()
    /(\w+)\s*=\s*await\s+(?:create|connect|init|initialize|setup)_(\w+)\(/gm
  ],
  go: [
    // New* function pattern: client := NewClient()
    /(\w+)\s*:=\s*(?:New|Create|Connect|Init|Setup)(\w+)\(/g,
    // Module.New* pattern: client := redis.NewClient()
    /(\w+)\s*:=\s*\w+\.(?:New|Create|Connect|Init|Setup)(\w+)\(/g,
    // Variable declaration: var client = NewClient()
    /var\s+(\w+)\s+.*=\s*(?:New|Create|Connect|Init|Setup)(\w+)\(/g,
    // Struct literal with suffix: client := &RedisClient{}
    /(\w+)\s*:=\s*&(\w+(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))\{/g
  ],
  rust: [
    // ::new() constructor: let client = Client::new()
    /let\s+(?:mut\s+)?(\w+)\s*=\s*(\w*(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))::(?:new|create|connect|init|build)\(/g,
    // Builder pattern: let client = ClientBuilder::new().build()
    /let\s+(?:mut\s+)?(\w+)\s*=\s*(\w+Builder)::new\(\).*\.build\(\)/g,
    // From/into patterns: let client = Client::from()
    /let\s+(?:mut\s+)?(\w+)\s*=\s*(\w*(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))::from/g
  ],
  java: [
    // Field/local var: Client client = new Client()
    /(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*=\s*new\s+(\w+(?:Client|Connection|Pool|Service|Provider|Manager|Factory|Repository|Gateway|Adapter|Handler|Broker|Queue|Cache|Store|Transport|Channel|Socket|Server|Database))(?:<[^>]*>)?\s*\(/g,
    // Factory pattern: Client client = ClientFactory.create()
    /(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*=\s*(\w+(?:Factory|Builder))\.(?:create|build|get|new)\w*\(/g,
    // Builder pattern: Client client = Client.builder().build()
    /(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*=\s*(\w+)\.builder\(\).*\.build\(\)/g,
    // Spring/DI injection via constructor or field
    /@(?:Autowired|Inject)\s+(?:private\s+)?(?:\w+(?:<[^>]*>)?)\s+(\w+)/g
  ]
};

// ============================================================================
// Buzzword Inflation Detection
// Detects quality claims in docs/comments without supporting code evidence
// ============================================================================

/**
 * Default buzzword categories and their associated terms
 */
const BUZZWORD_CATEGORIES = {
  production: ['production-ready', 'production-grade', 'prod-ready'],
  enterprise: ['enterprise-grade', 'enterprise-ready', 'enterprise-class'],
  security: ['secure', 'secure by default', 'security-focused'],
  scale: ['scalable', 'high-performance', 'performant', 'highly scalable'],
  reliability: ['battle-tested', 'robust', 'reliable', 'rock-solid'],
  completeness: ['comprehensive', 'complete', 'full-featured', 'feature-complete']
};

/**
 * Evidence patterns per buzzword category
 * Each category maps to evidence types, each with array of regex patterns
 */
const EVIDENCE_PATTERNS = {
  production: {
    tests: [/\.test\.[jt]sx?$|\.spec\.[jt]sx?$|__tests__|test_.*\.py$|_test\.go$|_test\.rs$/],
    errorHandling: [/try\s*\{|catch\s*\(|\.catch\s*\(|except\s*:|if\s+let\s+Err|match.*Err\(/],
    logging: [/logger\.|\.log\s*\(|console\.error|tracing::|slog\.|log\.(info|warn|error|debug)/i]
  },
  enterprise: {
    auth: [/authenticat|authorization|permission|rbac|acl|role/i],
    audit: [/audit|track.*event|event.*log|activity.*log/i],
    rateLimit: [/rate.?limit|throttle|limiter/i]
  },
  security: {
    validation: [/validat|sanitiz|escape|clean|htmlspecialchars/i],
    auth: [/\bauth\b|token|jwt|session|login|passport/i],
    encryption: [/encrypt|decrypt|hash|bcrypt|argon|crypto\./i]
  },
  scale: {
    async: [/async\s+|await\s+|Promise|Future|tokio|async_std|goroutine/],
    cache: [/\bcache\b|redis|memcache|lru/i],
    pool: [/pool|connection.?pool|thread.?pool/i]
  },
  reliability: {
    tests: [/\.test\.[jt]sx?$|\.spec\.[jt]sx?$|__tests__|test_.*\.py$|_test\.go$|_test\.rs$/],
    coverage: [/coverage|lcov|nyc|istanbul|codecov/i],
    errorHandling: [/try\s*\{|catch\s*\(|\.catch\s*\(|except\s*:|if\s+let\s+Err/]
  },
  completeness: {
    edgeCases: [/edge.?case|boundary|corner.?case/i],
    errorHandling: [/\b(handle|handles|handled|handling)\s+(all\s+)?(errors?|exceptions?|failures?)\b/i],
    documentation: [/\/\*\*|\/\/\/|"""|'''/]
  }
};

/**
 * Patterns indicating a positive claim (not TODO/aspirational)
 */
const CLAIM_INDICATORS = [
  /\bis\s+/i,           // "is secure"
  /\bare\s+/i,          // "are production-ready"
  /\bprovides?\s+/i,    // "provides secure"
  /\boffers?\s+/i,      // "offers robust"
  /\bfeatures?\s+/i,    // "features comprehensive"
  /\bfully\s+/i,        // "fully production-ready"
  /\b100%\s+/i,         // "100% secure"
  /\bdesigned\s+(for|to\s+be)\s+/i  // "designed for security"
];

/**
 * Patterns indicating NOT a claim (aspirational/TODO)
 */
const NOT_CLAIM_INDICATORS = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bshould\s+be\b/i,
  /\bwill\s+be\b/i,
  /\bmake\s+(?:it\s+(?:more|less|better)|this\b)/i,
  /\bneed(s)?\s+to\s+be\b/i,
  /\bplan(ning)?\s+to\b/i,
  /\bwant(s)?\s+to\b/i
];

/**
 * Escape regex special characters in a string
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for regex
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract buzzword claims from file content
 *
 * @param {string} content - File content
 * @param {string} filePath - Path to file (for reporting)
 * @param {Object} buzzwordCategories - Buzzword category mappings
 * @returns {Array<Object>} Array of claims with line, buzzword, category, isPositiveClaim
 */
function extractClaims(content, filePath, buzzwordCategories = BUZZWORD_CATEGORIES) {
  const claims = [];
  const lines = content.split('\n');

  // Build single regex from all buzzwords and reverse map for category lookup
  const allBuzzwords = [];
  const buzzwordToCategory = new Map();
  for (const [category, buzzwords] of Object.entries(buzzwordCategories)) {
    for (const buzzword of buzzwords) {
      allBuzzwords.push(escapeRegex(buzzword));
      buzzwordToCategory.set(buzzword.toLowerCase(), { category, buzzword });
    }
  }
  const combinedRegex = new RegExp(`\\b(${allBuzzwords.join('|')})\\b`, 'gi');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find all buzzword matches in this line
    const matches = [...line.matchAll(combinedRegex)];
    if (matches.length === 0) continue;

    // Check claim indicators once per line (only if matches found)
    const hasNotClaimIndicator = NOT_CLAIM_INDICATORS.some(p => p.test(line));
    const hasClaimIndicator = CLAIM_INDICATORS.some(p => p.test(line));
    const isPositiveClaim = hasClaimIndicator && !hasNotClaimIndicator;

    for (const match of matches) {
      const matchedText = match[1].toLowerCase();
      const mapping = buzzwordToCategory.get(matchedText);
      if (!mapping) continue;

      claims.push({
        line: i + 1,
        column: match.index,
        buzzword: mapping.buzzword,
        category: mapping.category,
        text: line.trim(),
        isPositiveClaim,
        filePath
      });
    }
  }

  return claims;
}

/**
 * Find files that may contain claims (docs, READMEs, code with comments)
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Options with fs/path overrides
 * @returns {Array<string>} Array of relative file paths
 */
function findClaimSourceFiles(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const files = [];
  const docPatterns = [
    /README/i,
    /\.md$/,
    /docs?\//i,
    /\.rst$/,
    /CHANGELOG/i,
    /\.[jt]sx?$/,  // JS/TS files (JSDoc comments)
    /\.py$/,       // Python (docstrings)
    /\.rs$/,       // Rust (doc comments)
    /\.go$/        // Go (doc comments)
  ];

  function walk(dir, depth = 0) {
    if (depth > 5) return; // Limit depth
    if (files.length > 500) return; // Limit file count

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(repoPath, fullPath);

      if (shouldExclude(relativePath)) continue;

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (docPatterns.some(p => p.test(relativePath))) {
          files.push(relativePath);
        }
      }
    }
  }

  walk(repoPath);
  return files;
}

/**
 * Check if a regex pattern is for matching file paths (vs file content)
 * File path patterns typically match file extensions or test directory structures
 *
 * @param {RegExp} regex - The pattern to check
 * @returns {boolean} True if this is a file path pattern
 */
function isFilePathPattern(regex) {
  const source = regex.source;
  // File path patterns match file extensions or test directories
  return (
    source.includes('\\.[jt]sx?$') ||  // .js, .ts, .jsx, .tsx
    source.includes('\\.py$') ||        // .py
    source.includes('\\.go$') ||        // .go
    source.includes('\\.rs$') ||        // .rs
    source.includes('__tests__') ||     // Jest test directory
    source.includes('_test\\.') ||      // Go/Rust test files
    source.includes('test_.*\\.') ||    // Python test files
    source.includes('\\.spec\\.')       // Spec files
  );
}

/**
 * Search for evidence supporting a buzzword category
 *
 * @param {string} repoPath - Repository root path
 * @param {string} category - Buzzword category to search evidence for
 * @param {Object} evidencePatterns - Evidence patterns mapping
 * @param {Array<string>} filesToSearch - Files to search
 * @param {Object} options - Options with fs/path overrides
 * @returns {Object} Evidence results: { found[], total, categories{} }
 */
function searchEvidence(repoPath, category, evidencePatterns, filesToSearch, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const evidence = {
    found: [],
    total: 0,
    categories: {}
  };

  // Get evidence patterns for this category
  const patterns = evidencePatterns[category];
  if (!patterns) return evidence;

  // Separate path patterns from content patterns for efficiency
  const pathPatterns = [];
  const contentPatterns = [];
  for (const [evidenceType, regexes] of Object.entries(patterns)) {
    for (const regex of regexes) {
      if (isFilePathPattern(regex)) {
        pathPatterns.push({ evidenceType, regex });
      } else {
        contentPatterns.push({ evidenceType, regex });
      }
    }
  }

  for (const file of filesToSearch) {
    // Check path patterns first (no file read needed)
    for (const { evidenceType, regex } of pathPatterns) {
      if (regex.test(file)) {
        if (!evidence.categories[evidenceType]) {
          evidence.categories[evidenceType] = [];
        }
        if (!evidence.categories[evidenceType].includes(file)) {
          evidence.categories[evidenceType].push(file);
          evidence.total++;
        }
      }
    }

    // Only read content if there are content patterns to check
    if (contentPatterns.length > 0) {
      let content;
      try {
        const fullPath = path.isAbsolute(file) ? file : path.join(repoPath, file);
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue; // Skip unreadable files
      }

      for (const { evidenceType, regex } of contentPatterns) {
        if (regex.test(content)) {
          if (!evidence.categories[evidenceType]) {
            evidence.categories[evidenceType] = [];
          }
          if (!evidence.categories[evidenceType].includes(file)) {
            evidence.categories[evidenceType].push(file);
            evidence.total++;
          }
        }
      }
    }
  }

  evidence.found = Object.keys(evidence.categories);
  return evidence;
}

/**
 * Detect gaps between claims and evidence
 *
 * @param {Array<Object>} claims - Extracted claims
 * @param {string} repoPath - Repository root path
 * @param {Object} evidencePatterns - Evidence patterns
 * @param {number} minEvidenceMatches - Minimum evidence required
 * @param {Array<string>} filesToSearch - Files to search for evidence
 * @param {Object} options - Options
 * @returns {Array<Object>} Violations
 */
function detectGaps(claims, repoPath, evidencePatterns, minEvidenceMatches, filesToSearch, options = {}) {
  const violations = [];

  // Cache evidence searches per category (avoid re-searching)
  const evidenceCache = new Map();

  for (const claim of claims) {
    // Skip non-positive claims (TODOs, aspirational)
    if (!claim.isPositiveClaim) continue;

    // Check cache first
    let evidence = evidenceCache.get(claim.category);
    if (!evidence) {
      evidence = searchEvidence(
        repoPath,
        claim.category,
        evidencePatterns,
        filesToSearch,
        options
      );
      evidenceCache.set(claim.category, evidence);
    }

    // Check if sufficient evidence exists
    if (evidence.total < minEvidenceMatches) {
      violations.push({
        type: 'buzzword_inflation',
        file: claim.filePath,
        line: claim.line,
        buzzword: claim.buzzword,
        category: claim.category,
        claim: claim.text,
        evidenceFound: evidence.found,
        evidenceCount: evidence.total,
        evidenceRequired: minEvidenceMatches,
        severity: evidence.total === 0 ? 'high' : 'medium',
        message: `Claim "${claim.buzzword}" without sufficient evidence (found ${evidence.total}/${minEvidenceMatches} required)`
      });
    }
  }

  return violations;
}

/**
 * Analyze buzzword inflation - quality claims without supporting code evidence
 *
 * Detects claims like "production-ready", "secure", "scalable" in documentation
 * and comments, then searches for supporting evidence in the codebase.
 * Flags claims that lack sufficient evidence.
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Analysis options
 * @param {Object} [options.buzzwordCategories] - Buzzword category mappings
 * @param {Object} [options.evidencePatterns] - Evidence patterns per category
 * @param {number} [options.minEvidenceMatches=2] - Minimum evidence matches required
 * @returns {Object} Analysis results with violations
 */
function analyzeBuzzwordInflation(repoPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const buzzwordCategories = options.buzzwordCategories || BUZZWORD_CATEGORIES;
  const evidencePatterns = options.evidencePatterns || EVIDENCE_PATTERNS;
  const minEvidenceMatches = options.minEvidenceMatches || 2;

  // Find files that may contain claims
  const claimSourceFiles = findClaimSourceFiles(repoPath, options);

  // Find all source files for evidence searching (include tests - they're evidence)
  const { files: sourceFiles } = countSourceFiles(repoPath, { ...options, includeTests: true });

  // Extract all claims from claim source files
  const allClaims = [];
  for (const file of claimSourceFiles) {
    let content;
    try {
      content = fs.readFileSync(path.join(repoPath, file), 'utf8');
    } catch {
      continue; // Skip unreadable files
    }

    const claims = extractClaims(content, file, buzzwordCategories);
    allClaims.push(...claims);
  }

  // Detect gaps (claims without evidence)
  const violations = detectGaps(
    allClaims,
    repoPath,
    evidencePatterns,
    minEvidenceMatches,
    sourceFiles,
    options
  );

  return {
    claimsFound: allClaims.length,
    positiveClaimsFound: allClaims.filter(c => c.isPositiveClaim).length,
    violations,
    verdict: violations.length > 0
      ? (violations.some(v => v.severity === 'high') ? 'HIGH' : 'MEDIUM')
      : 'OK'
  };
}

/**
 * Analyze infrastructure without implementation - setup without usage
 *
 * Detects infrastructure components (clients, connections, pools, services) that are
 * instantiated/configured but never actually used anywhere in the codebase.
 * This pattern often indicates dead code or incomplete implementations.
 *
 * @param {string} rootPath - Repository root path
 * @param {Object} options - Analysis options
 * @param {Array} [options.infrastructureSuffixes] - Component suffixes to detect
 * @param {Array} [options.setupVerbs] - Setup verbs to detect
 * @param {Object} [options.instantiationPatterns] - Language-specific patterns
 * @returns {Object} Analysis results: { setupsFound, usagesFound, violations, verdict }
 */
function analyzeInfrastructureWithoutImplementation(rootPath, options = {}) {
  const fs = options.fs || require('fs');
  const path = options.path || require('path');

  const instantiationPatterns = options.instantiationPatterns || INSTANTIATION_PATTERNS;

  // Collect all source files (excluding tests by default)
  const { files: sourceFiles } = countSourceFiles(rootPath, {
    ...options,
    includeTests: false,
    maxFiles: 1000
  });

  // Track infrastructure setups and their usage
  const infrastructureSetups = new Map(); // varName -> { file, line, type, component }
  const infrastructureUsage = new Map();  // varName -> { count, files[] }

  // Cache file contents to avoid O(N*M) file reads
  // Phase 1 reads N files, Phase 2 would read N*M without caching
  const fileContentCache = new Map(); // file -> { content, lines }

  // Phase 1: Find all infrastructure setups (single pass through files)
  for (const file of sourceFiles) {
    if (shouldExclude(file) || isTestFile(file)) continue;

    let content;
    try {
      content = fs.readFileSync(path.join(rootPath, file), 'utf8');
    } catch (err) {
      // Skip unreadable files (permissions, binary, etc.)
      // This is expected for some files in the repository
      continue;
    }

    // Cache content for Phase 2 usage search
    fileContentCache.set(file, { content, lines: content.split('\n') });

    const lang = detectLanguage(file);
    const patterns = instantiationPatterns[lang] || instantiationPatterns.js;

    for (const pattern of patterns) {
      // Reset regex state
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      let matchCount = 0;
      const MAX_MATCHES_PER_FILE = 100; // Safety limit to prevent DoS

      while ((match = regex.exec(content)) !== null && matchCount < MAX_MATCHES_PER_FILE) {
        matchCount++;
        const varName = match[1];
        const componentType = match[2] || 'Infrastructure';

        // Skip if variable name is too generic (e.g., 'x', 'i', 'tmp')
        if (varName.length < 2 || GENERIC_VAR_PATTERN.test(varName)) continue;

        const lineNumber = countNewlines(content.substring(0, match.index)) + 1;

        // Store the setup location
        const key = `${file}:${varName}`;
        infrastructureSetups.set(key, {
          file,
          line: lineNumber,
          varName,
          type: componentType,
          content: content.split('\n')[lineNumber - 1].trim()
        });

        // Initialize usage tracking
        if (!infrastructureUsage.has(key)) {
          infrastructureUsage.set(key, { count: 0, files: [] });
        }
      }
    }
  }

  // Phase 2: Search for usage of each setup variable (using cached content)
  for (const [key, setup] of infrastructureSetups.entries()) {
    const { varName, file: setupFile } = setup;

    // Pre-compile usage patterns once per variable for performance
    const escapedVarName = escapeRegex(varName);
    const usagePatterns = [
      new RegExp(`\\b${escapedVarName}\\s*\\.\\w+`),  // varName.method()
      new RegExp(`\\b${escapedVarName}\\s*\\[`),      // varName[prop]
      new RegExp(`\\(.*\\b${escapedVarName}\\b.*\\)`), // func(varName)
      new RegExp(`\\b${escapedVarName}\\s*\\)`),      // func(arg, varName)
      new RegExp(`return\\s+.*\\b${escapedVarName}\\b`) // return varName
    ];

    // Search for usage in all source files (using cache - O(N) instead of O(N*M))
    for (const [file, cached] of fileContentCache.entries()) {
      const { lines } = cached;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip the setup line itself
        if (file === setupFile && i === setup.line - 1) continue;

        // Look for usage patterns (method calls, property access, passed as argument)
        // Using word boundaries to avoid false positives
        for (const pattern of usagePatterns) {
          if (pattern.test(line)) {
            const usage = infrastructureUsage.get(key);
            usage.count++;
            if (!usage.files.includes(file)) {
              usage.files.push(file);
            }
            break; // Count once per line
          }
        }
      }
    }
  }

  // Clear cache to free memory
  fileContentCache.clear();

  // Phase 3: Detect violations (setups without usage)
  const violations = [];
  for (const [key, setup] of infrastructureSetups.entries()) {
    const usage = infrastructureUsage.get(key);

    if (usage.count === 0) {
      // Check for false positives - might be exported or used in a way we didn't detect
      const setupContent = setup.content.toLowerCase();

      // Skip if it's likely exported or part of a module.exports
      if (setupContent.includes('export') || setupContent.includes('module.exports')) {
        continue;
      }

      // Skip if it's a parameter or destructured assignment
      if (setupContent.includes('function') && setupContent.includes(setup.varName)) {
        continue;
      }

      violations.push({
        file: setup.file,
        line: setup.line,
        varName: setup.varName,
        type: setup.type,
        content: setup.content,
        severity: 'high',
        message: `Infrastructure component "${setup.varName}" (${setup.type}) is created but never used`
      });
    }
  }

  return {
    setupsFound: infrastructureSetups.size,
    usagesFound: Array.from(infrastructureUsage.values()).filter(u => u.count > 0).length,
    violations,
    verdict: violations.length > 0 ? 'HIGH' : 'OK'
  };
}

// ============================================================================
// Dead Code Detection
// Detects unreachable code after return/throw/break/continue statements
// ============================================================================

/**
 * Language-specific control flow termination patterns
 * These statements terminate the current execution path
 */
const TERMINATION_STATEMENTS = {
  js: [
    /\breturn\s*(?:[^;]*)?;/,
    /\bthrow\s+/,
    /\bbreak\s*;/,
    /\bcontinue\s*;/
  ],
  python: [
    /^\s*return(?:\s+|$)/m,
    /^\s*raise\s+/m,
    /^\s*break\s*$/m,
    /^\s*continue\s*$/m
  ],
  go: [
    /\breturn\b/,
    /\bpanic\s*\(/,
    /\bbreak\s*$/m,
    /\bcontinue\s*$/m
  ],
  rust: [
    /\breturn\s*(?:[^;]*)?;/,
    /\bpanic!\s*\(/,
    /\bbreak\s*;/,
    /\bcontinue\s*;/
  ],
  java: [
    /\breturn\s*(?:[^;]*)?;/,
    /\bthrow\s+/,
    /\bbreak\s*;/,
    /\bcontinue\s*;/
  ]
};

/**
 * Patterns for block start (opening braces/colons)
 */
const BLOCK_START_PATTERNS = {
  js: /\{[\s]*$/,
  python: /:[\s]*$/,
  go: /\{[\s]*$/,
  rust: /\{[\s]*$/
};

/**
 * Analyze dead code - unreachable statements after control flow terminators
 *
 * Detects code that appears after return, throw, break, or continue statements
 * within the same block scope. This is a common sign of incomplete refactoring
 * or copy-paste errors.
 *
 * @param {string} content - File content to analyze
 * @param {Object} options - Analysis options
 * @param {string} [options.filePath] - File path for language detection
 * @returns {Array<Object>} Array of violations: { line, terminatedBy, deadCode }
 */
function analyzeDeadCode(content, options = {}) {
  const lang = detectLanguage(options.filePath || '.js');
  const violations = [];
  const terminationPatterns = TERMINATION_STATEMENTS[lang] || TERMINATION_STATEMENTS.js;

  const lines = content.split('\n');
  const lineCount = lines.length;

  for (let i = 0; i < lineCount; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines, comments, and closing braces
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') ||
        trimmed.startsWith('/*') || trimmed.startsWith('*') ||
        trimmed === '}' || trimmed === '},' || trimmed === '};') {
      continue;
    }

    // Check if this line contains a termination statement
    let isTermination = false;
    let terminationType = '';

    for (const pattern of terminationPatterns) {
      if (pattern.test(trimmed)) {
        isTermination = true;
        terminationType = trimmed.match(/\b(return|throw|break|continue|panic|raise)\b/i)?.[1] || 'terminator';
        break;
      }
    }

    if (!isTermination) continue;

    // Skip if termination is part of a one-line conditional (e.g., "if (x) return;")
    // These don't make subsequent code unreachable
    if (/^\s*(if|elif|else\s+if)\s*\(/.test(trimmed) ||
        /^\s*if\s+.*:/.test(trimmed)) {
      continue;
    }

    // Check for multi-line statements (unbalanced brackets)
    // e.g., "throw new Error(" or "return [" continues on next lines
    const countBrackets = (str) => {
      const open = (str.match(/[\(\[\{]/g) || []).length;
      const close = (str.match(/[\)\]\}]/g) || []).length;
      return open - close;
    };
    let bracketBalance = countBrackets(trimmed);
    if (bracketBalance > 0) {
      // Statement continues on following lines - skip to where it ends
      for (let k = i + 1; k < lineCount && bracketBalance > 0; k++) {
        const contLine = lines[k].trim();
        bracketBalance += countBrackets(contLine);
        i = k; // Advance past continuation lines
      }
    }

    // Look for non-empty code after the termination (within same block)
    // Use different scope tracking for Python vs brace-based languages
    const isPython = lang === 'python';
    const currentIndent = isPython ? (line.match(/^\s*/)[0].length) : null;
    let braceDepth = 0;

    for (let j = i + 1; j < lineCount; j++) {
      const nextLine = lines[j];
      const nextTrimmed = nextLine.trim();

      // Skip empty lines and comments
      if (!nextTrimmed || nextTrimmed.startsWith('//') || nextTrimmed.startsWith('#') ||
          nextTrimmed.startsWith('/*') || nextTrimmed.startsWith('*')) {
        continue;
      }

      // Python: Check indentation level to detect scope exit
      if (isPython) {
        const nextIndent = nextLine.match(/^\s*/)[0].length;

        // If dedented to LESS than current level, we've exited the block
        if (nextIndent < currentIndent) {
          break;
        }
      } else {
        // Brace-based languages: Track brace depth
        const openBraces = (nextTrimmed.match(/\{/g) || []).length;
        const closeBraces = (nextTrimmed.match(/\}/g) || []).length;
        braceDepth += openBraces - closeBraces;

        // If we see a closing brace that takes us out of the current scope, stop
        if (braceDepth < 0) break;

        // If we see only a closing brace, that's fine (not dead code)
        if (nextTrimmed === '}' || nextTrimmed === '},' || nextTrimmed === '};') {
          continue;
        }
      }

      // Skip case/default labels in switch statements
      if (/^(case\s+|default\s*:)/.test(nextTrimmed)) {
        break;
      }

      // Skip else/elif/except/catch clauses (they're alternative paths, not dead code)
      // Handles: "} else {", "} catch {", "} catch (e) {", "catch {" (modern JS without binding)
      if (/^(else\s*[:{]?|elif\s+|else\s+if\s+|except\s*[:(]|catch\s*[({]|\}\s*else\s*|\}\s*catch\s*)/.test(nextTrimmed)) {
        break;
      }

      // Found potential dead code
      violations.push({
        line: j + 1, // 1-indexed
        terminationType: terminationType,
        terminationLine: i + 1,
        content: nextTrimmed.substring(0, 50) + (nextTrimmed.length > 50 ? '...' : ''),
        severity: 'high'
      });

      // Only report the first dead line per terminator (avoids noise)
      break;
    }
  }

  return violations;
}

// ============================================================================
// Shotgun Surgery Detection
// Detects files that frequently change together across commits
// ============================================================================

/**
 * Analyze shotgun surgery - files that frequently change together
 *
 * Uses git log to find commits where multiple files change together,
 * indicating tight coupling that may need refactoring.
 *
 * @param {string} repoPath - Repository root path
 * @param {Object} options - Analysis options
 * @param {number} [options.commitLimit=100] - Number of commits to analyze
 * @param {number} [options.clusterThreshold=5] - Min files changed together to flag
 * @param {Function} [options.execFileSync] - Command executor (for testing)
 * @returns {Object} Analysis results: { clusters, violations, verdict }
 */
function analyzeShotgunSurgery(repoPath, options = {}) {
  // Validate commitLimit to prevent command injection
  let commitLimit = parseInt(options.commitLimit, 10) || 100;
  if (!Number.isInteger(commitLimit) || commitLimit < 1 || commitLimit > 10000) {
    commitLimit = 100;
  }
  const clusterThreshold = options.clusterThreshold || 5;
  const execFileSync = options.execFileSync || require('child_process').execFileSync;
  const path = options.path || require('path');

  const violations = [];
  const fileClusters = new Map(); // "file1,file2" -> count

  try {
    // Get commit hashes with file changes
    // maxBuffer: 2MB is sufficient for 100 commits (typical output is ~50-200KB)
    const logResult = execFileSync(
      'git',
      ['log', '--name-only', '--pretty=format:COMMIT:%H', '-n', String(commitLimit)],
      { cwd: repoPath, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }
    );

    // Parse commits and their files
    const commits = [];
    let currentCommit = null;

    for (const line of logResult.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('COMMIT:')) {
        if (currentCommit && currentCommit.files.length > 1) {
          commits.push(currentCommit);
        }
        currentCommit = { hash: trimmed.substring(7), files: [] };
      } else if (currentCommit) {
        // Filter to source files only, exclude common uninteresting files
        const ext = path.extname(trimmed);
        if (['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java'].includes(ext)) {
          // Skip test files, they often change with implementation
          if (!isTestFile(trimmed) && !shouldExclude(trimmed)) {
            currentCommit.files.push(trimmed);
          }
        }
      }
    }

    // Don't forget the last commit
    if (currentCommit && currentCommit.files.length > 1) {
      commits.push(currentCommit);
    }

    // Build co-change matrix
    for (const commit of commits) {
      const files = commit.files;
      if (files.length < 2 || files.length > 20) continue; // Skip huge commits

      // Count co-changes for each pair
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          const pair = [files[i], files[j]].sort().join('|||');
          fileClusters.set(pair, (fileClusters.get(pair) || 0) + 1);
        }
      }
    }

    // Find highly coupled file pairs (appear together in 3+ commits)
    const coupledPairs = [];
    for (const [pair, count] of fileClusters.entries()) {
      if (count >= 3) {
        const [file1, file2] = pair.split('|||');
        coupledPairs.push({ file1, file2, count });
      }
    }

    // Sort by frequency
    coupledPairs.sort((a, b) => b.count - a.count);

    // Find clusters of files that frequently change together
    // A cluster is when a file appears in multiple coupled pairs
    const fileFrequency = new Map(); // file -> number of coupled pairs it appears in
    for (const { file1, file2 } of coupledPairs) {
      fileFrequency.set(file1, (fileFrequency.get(file1) || 0) + 1);
      fileFrequency.set(file2, (fileFrequency.get(file2) || 0) + 1);
    }

    // Files that appear in many coupled pairs indicate shotgun surgery
    const frequentlyChangedFiles = Array.from(fileFrequency.entries())
      .filter(([_, count]) => count >= clusterThreshold)
      .sort((a, b) => b[1] - a[1]);

    // Report violations
    for (const [file, coupledCount] of frequentlyChangedFiles) {
      // Find all files this one is coupled with
      const coupledWith = coupledPairs
        .filter(p => p.file1 === file || p.file2 === file)
        .map(p => p.file1 === file ? p.file2 : p.file1)
        .slice(0, 5); // Limit to top 5 for readability

      violations.push({
        file,
        coupledCount,
        coupledWith,
        severity: coupledCount >= clusterThreshold * 2 ? 'high' : 'medium',
        message: `"${file}" changes with ${coupledCount} other files frequently (shotgun surgery indicator)`
      });
    }

    return {
      commitsAnalyzed: commits.length,
      coupledPairs: coupledPairs.slice(0, 20), // Top 20 for report
      violations,
      verdict: violations.length > 0
        ? (violations.some(v => v.severity === 'high') ? 'HIGH' : 'MEDIUM')
        : 'OK'
    };

  } catch (err) {
    // Git command failed - likely not a git repo or no commits
    return {
      commitsAnalyzed: 0,
      coupledPairs: [],
      violations: [],
      verdict: 'SKIP',
      error: err.message
    };
  }
}

// ============================================================================
// Stub Function Detection
// Detects functions that only return placeholder values without real logic
// ============================================================================

/**
 * Analyze stub functions - functions that only return placeholder values
 *
 * A stub function is one where:
 * - The body contains only a return statement (plus optional comments)
 * - The return value is a placeholder: 0, null, undefined, true, false, [], {}, "", ''
 *
 * Higher certainty when TODO/FIXME comments are present.
 *
 * @param {string} content - File content to analyze
 * @param {Object} options - Analysis options
 * @param {string} [options.filePath] - File path for language detection
 * @returns {Array<Object>} Array of violations: { line, functionName, returnValue, hasTodo, certainty }
 */
function analyzeStubFunctions(content, options = {}) {
  const violations = [];
  const lang = detectLanguage(options.filePath || '.js');

  const langConfig = getStubFunctionConfig(lang);
  if (!langConfig) return violations;

  if (langConfig.useBraces) {
    return analyzeStubFunctionsBraceLanguage(content, lang, langConfig);
  } else {
    return analyzeStubFunctionsPython(content);
  }
}

/**
 * Get language-specific configuration for stub detection
 */
function getStubFunctionConfig(lang) {
  const configs = {
    js: {
      useBraces: true,
      functionPatterns: [
        /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g,
        /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g,
        /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\([^)]*\)\s*\{/g,
        /^\s*(?:async\s+)?(?!if\b|for\b|while\b|switch\b|catch\b|with\b|function\b)(\w+)\s*\([^)]*\)\s*\{/gm,
      ],
      stubReturnPattern: /^\s*return\s+(0|null|undefined|true|false|\[\]|\{\}|""|''|``)\s*;?\s*$/,
      commentPatterns: [/^\s*\/\//, /^\s*\/\*/, /^\s*\*/, /^\s*\*\/$/],
    },
    rust: {
      useBraces: true,
      functionPatterns: [
        /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)(?:\s*->\s*[^{]+)?\s*\{/g,
      ],
      stubReturnPattern: /^\s*(?:return\s+)?(None|0|true|false|String::new\(\)|Vec::new\(\)|vec!\[\]|\(\)|""|Default::default\(\))\s*;?\s*$/,
      stubMacroPattern: /^\s*(todo!\(\)|unimplemented!\(\)|panic!\([^)]*\))\s*;?\s*$/,
      commentPatterns: [/^\s*\/\//, /^\s*\/\*/, /^\s*\*/, /^\s*\*\/$/],
    },
    java: {
      useBraces: true,
      functionPatterns: [
        /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[^{]+)?\s*\{/g,
      ],
      stubReturnPattern: /^\s*return\s+(null|0|0L|0\.0|0\.0f|true|false|""|Collections\.emptyList\(\)|Collections\.emptyMap\(\)|Optional\.empty\(\))\s*;\s*$/,
      throwStubPattern: /^\s*throw\s+new\s+(?:Unsupported(?:Operation)?Exception|NotImplementedException|IllegalStateException)\s*\([^)]*\)\s*;\s*$/,
      commentPatterns: [/^\s*\/\//, /^\s*\/\*/, /^\s*\*/, /^\s*\*\/$/],
    },
    go: {
      useBraces: true,
      functionPatterns: [
        /func\s+(?:\([^)]+\)\s+)?(\w+)\s*\([^)]*\)(?:\s*(?:\([^)]+\)|[^{]+))?\s*\{/g,
      ],
      stubReturnPattern: /^\s*return\s+(nil|0|""|false|true|\[\][a-zA-Z_]\w*\{\}|map\[[^\]]+\][a-zA-Z_]\w*\{\}|\&?[A-Z]\w*\{\})\s*$/,
      panicPattern: /^\s*panic\s*\([^)]*\)\s*$/,
      commentPatterns: [/^\s*\/\//],
    },
    python: {
      useBraces: false,
    },
  };

  return configs[lang];
}

/**
 * Analyze brace-delimited languages (JS, Rust, Java, Go)
 */
function analyzeStubFunctionsBraceLanguage(content, lang, config) {
  const violations = [];

  for (const pattern of config.functionPatterns) {
    let match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(content)) !== null) {
      const funcName = match[1] || 'anonymous';
      const funcStart = match.index + match[0].length - 1;

      const closingBrace = findMatchingBrace(content, funcStart);
      if (closingBrace === -1) continue;

      const bodyContent = content.substring(funcStart + 1, closingBrace);
      const bodyLines = bodyContent.split('\n');

      const significantLines = bodyLines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        for (const commentPattern of config.commentPatterns) {
          if (commentPattern.test(trimmed)) return false;
        }
        return true;
      });

      if (significantLines.length === 1) {
        const onlyLine = significantLines[0].trim();
        let stubMatch = config.stubReturnPattern.exec(onlyLine);
        let returnValue = stubMatch ? stubMatch[1] : null;

        if (!stubMatch && config.stubMacroPattern) {
          stubMatch = config.stubMacroPattern.exec(onlyLine);
          returnValue = stubMatch ? stubMatch[1] : null;
        }
        if (!stubMatch && config.throwStubPattern) {
          stubMatch = config.throwStubPattern.exec(onlyLine);
          returnValue = stubMatch ? 'throw stub' : null;
        }
        if (!stubMatch && config.panicPattern) {
          stubMatch = config.panicPattern.exec(onlyLine);
          returnValue = stubMatch ? 'panic' : null;
        }

        if (stubMatch && returnValue) {
          const hasTodo = /\b(TODO|FIXME|XXX|HACK|STUB)\b/i.test(bodyContent);
          const lineNumber = countNewlines(content.substring(0, funcStart)) + 1;

          violations.push({
            line: lineNumber,
            functionName: funcName,
            returnValue: returnValue,
            hasTodo: hasTodo,
            certainty: hasTodo ? 'HIGH' : 'MEDIUM',
            content: `${funcName}() returns ${returnValue}`
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Analyze Python functions (indentation-based)
 */
function analyzeStubFunctionsPython(content) {
  const violations = [];
  const lines = content.split('\n');

  const defPattern = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\([^)]*\)\s*(?:->.*)?:\s*$/;
  const stubReturns = [
    /^\s*return\s+(None|0|True|False|\[\]|\{\}|"")\s*$/,
    /^\s*pass\s*$/,
    /^\s*raise\s+NotImplementedError\s*\([^)]*\)\s*$/,
    /^\s*\.\.\.\s*$/,
  ];
  const commentPattern = /^\s*#/;

  for (let i = 0; i < lines.length; i++) {
    const match = defPattern.exec(lines[i]);
    if (!match) continue;

    const funcIndent = match[1].length;
    const funcName = match[2];

    const bodyLines = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      const trimmed = line.trim();

      if (!trimmed) continue;

      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= funcIndent && trimmed) break;

      if (!commentPattern.test(trimmed) && !trimmed.startsWith('"""') && !trimmed.startsWith("'''")) {
        bodyLines.push(trimmed);
      }
    }

    if (bodyLines.length === 1) {
      const onlyLine = bodyLines[0];
      for (const stubPattern of stubReturns) {
        const stubMatch = stubPattern.exec(onlyLine);
        if (stubMatch) {
          const returnValue = stubMatch[1] || onlyLine.trim();
          const hasTodo = /\b(TODO|FIXME|XXX|HACK|STUB)\b/i.test(
            lines.slice(i, Math.min(i + 10, lines.length)).join('\n')
          );

          violations.push({
            line: i + 1,
            functionName: funcName,
            returnValue: returnValue,
            hasTodo: hasTodo,
            certainty: hasTodo ? 'HIGH' : 'MEDIUM',
            content: `def ${funcName}(): ${onlyLine}`
          });
          break;
        }
      }
    }
  }

  return violations;
}

module.exports = {
  analyzeDocCodeRatio,
  analyzeVerbosityRatio,
  analyzeOverEngineering,
  analyzeBuzzwordInflation,
  analyzeInfrastructureWithoutImplementation,
  analyzeDeadCode,
  analyzeShotgunSurgery,
  analyzeStubFunctions,
  // Export helpers for testing
  findMatchingBrace,
  countNonEmptyLines,
  countSourceFiles,
  countSourceLines,
  countEntryPointExports,
  countExportsInContent,
  getMaxDirectoryDepth,
  detectLanguage,
  detectCommentLanguage,
  shouldExclude,
  isTestFile,
  parseGitignore,
  // Buzzword inflation helpers (for testing)
  extractClaims,
  searchEvidence,
  detectGaps,
  findClaimSourceFiles,
  escapeRegex,
  isFilePathPattern,
  // Export constants for testing
  ENTRY_POINTS,
  EXPORT_PATTERNS,
  SOURCE_EXTENSIONS,
  EXCLUDE_DIRS,
  COMMENT_SYNTAX,
  // Buzzword inflation constants
  BUZZWORD_CATEGORIES,
  EVIDENCE_PATTERNS,
  CLAIM_INDICATORS,
  NOT_CLAIM_INDICATORS,
  // Infrastructure detection constants
  INFRASTRUCTURE_SUFFIXES,
  SETUP_VERBS,
  INSTANTIATION_PATTERNS,
  GENERIC_VAR_PATTERN,
  // Dead code detection constants
  TERMINATION_STATEMENTS,
  BLOCK_START_PATTERNS
};
