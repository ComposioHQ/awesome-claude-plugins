/**
 * Slop Detection Patterns
 * Pattern library for detecting and removing AI-generated code slop
 *
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Deep freeze an object for V8 optimization and immutability
 * Optimized: uses for-of instead of forEach to avoid function call overhead
 * @param {Object} obj - Object to freeze
 * @returns {Object} Frozen object
 */
function deepFreeze(obj) {
  // Freeze the object first (fast path)
  Object.freeze(obj);

  // Then recursively freeze nested objects (only if needed)
  // Use Object.keys() for cleaner iteration over own properties
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value && typeof value === 'object' && !(value instanceof RegExp)) {
      deepFreeze(value);
    }
  }

  return obj;
}

// Pre-compiled regex cache for performance (limited to prevent memory growth)
const MAX_PATTERN_CACHE_SIZE = 50;
const _compiledExcludePatterns = new Map();

// Exclude result cache for directory-level caching (limited to prevent memory growth)
const MAX_EXCLUDE_RESULT_CACHE_SIZE = 200;
const _excludeResultCache = new Map();

/**
 * Maximum allowed wildcards in a glob pattern to prevent ReDoS
 */
const MAX_GLOB_WILDCARDS = 10;

/**
 * Get a compiled regex for an exclude pattern (cached)
 * Uses safe regex construction to prevent catastrophic backtracking
 * Optimized: uses Map.get() instead of has() + get() (eliminates redundant lookup)
 * @param {string} pattern - Glob pattern to compile
 * @returns {RegExp} Compiled regex
 */
function getCompiledPattern(pattern) {
  // Try to get cached pattern (O(1) lookup)
  let cached = _compiledExcludePatterns.get(pattern);
  if (cached) {
    return cached;
  }

  // Enforce cache size limit using FIFO eviction
  if (_compiledExcludePatterns.size >= MAX_PATTERN_CACHE_SIZE) {
    const firstKey = _compiledExcludePatterns.keys().next().value;
    _compiledExcludePatterns.delete(firstKey);
  }

  // Count wildcards to prevent overly complex patterns
  const wildcardCount = (pattern.match(/\*/g) || []).length;
  if (wildcardCount > MAX_GLOB_WILDCARDS) {
    // Too many wildcards - use a safe fallback that matches nothing dangerous
    const safeRegex = /^$/;
    _compiledExcludePatterns.set(pattern, safeRegex);
    return safeRegex;
  }

  // Escape all regex metacharacters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Convert glob patterns to regex:
  // - Both * and ** use .* for backward compatibility (patterns match anywhere in path)
  // - ReDoS protection is provided by MAX_GLOB_WILDCARDS limit above
  let regexStr = escaped
    .replace(/\*\*/g, '\0GLOBSTAR\0')  // Temporarily mark globstar
    .replace(/\*/g, '.*')              // Single star: match anything (backward compatible)
    .replace(/\0GLOBSTAR\0/g, '.*');   // Globstar: match anything

  regexStr = '^' + regexStr + '$';
  const compiledRegex = new RegExp(regexStr);
  _compiledExcludePatterns.set(pattern, compiledRegex);
  return compiledRegex;
}

/**
 * Helper to create secret detection pattern with common metadata
 * Reduces duplication across similar secret patterns (all have same severity/autoFix/language)
 * @param {RegExp} pattern - Detection regex pattern
 * @param {string} description - Human-readable description
 * @param {Array<string>} [additionalExcludes=[]] - Extra files to exclude beyond standard test files
 * @returns {Object} Complete pattern object
 */
function createSecretPattern(pattern, description, additionalExcludes = []) {
  return {
    pattern,
    exclude: ['*.test.*', '*.spec.*', '*.example.*', ...additionalExcludes],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description
  };
}

/**
 * Auto-fix strategies:
 * - remove: Delete the matching line(s)
 * - replace: Replace with suggested fix
 * - add_logging: Add proper error logging
 * - flag: Mark for manual review
 * - none: Report only, no auto-fix
 */

const slopPatterns = {
  /**
   * Console debugging in JavaScript/TypeScript
   * IMPROVED: Only flags console.log and console.debug (actual debug statements)
   * console.warn and console.error are legitimate for validation/error handling
   * Excludes CLI tools, scripts, entry points that have legitimate console output
   */
  console_debugging: {
    pattern: /console\.(log|debug)\(/,
    exclude: [
      '*.test.*', '*.spec.*', '*.config.*',
      'bin/**', '**/bin/**', 'scripts/**', '**/scripts/**',
      'cli.js', '**/cli.js', '**/cli/**',
      '**/e2e/**', '**/test/**', '**/tests/**',
      '**/seed*.{js,ts}', '**/fixtures/**', '**/mocks/**',
      'globalSetup.*', 'globalTeardown.*',
      '**/*-manager.{js,ts}', '**/*Manager.{js,ts}',
      '**/mcp-server/**', '**/index.js',
      '**/validator.js', '**/verify-tools.js', '**/detect-platform.js'  // CLI tools with stdout output
    ],
    severity: 'medium',
    autoFix: 'remove',
    language: 'javascript',
    description: 'console.log/debug statements (console.warn/error are legitimate)'
  },

  /**
   * Python debugging statements
   */
  python_debugging: {
    pattern: /(print\(|import pdb|breakpoint\(\)|import ipdb)/,
    exclude: ['test_*.py', '*_test.py', 'conftest.py'],
    severity: 'medium',
    autoFix: 'remove',
    language: 'python',
    description: 'Debug print/breakpoint statements in production'
  },

  /**
   * Rust debugging macros
   */
  rust_debugging: {
    pattern: /(println!|dbg!|eprintln!)\(/,
    exclude: ['*_test.rs', '*_tests.rs'],
    severity: 'medium',
    autoFix: 'remove',
    language: 'rust',
    description: 'Debug print macros in production code'
  },

  /**
   * Old TODO comments (>90 days)
   */
  old_todos: {
    pattern: /(TODO|FIXME|HACK|XXX):/,
    exclude: [],
    severity: 'low',
    autoFix: 'flag',
    language: null, // All languages
    description: 'TODO/FIXME comments older than 90 days',
    requiresAgeCheck: true,
    ageThreshold: 90 // days
  },

  /**
   * Commented out code blocks
   */
  commented_code: {
    pattern: /^\s*(\/\/|#)\s*\w{5,}/,
    exclude: [],
    severity: 'medium',
    autoFix: 'remove',
    language: null,
    description: 'Large blocks of commented-out code',
    minConsecutiveLines: 5
  },

  /**
   * Placeholder text
   * IMPROVED: Only matches actual placeholder content, not legitimate uses of the word "placeholder"
   * Now requires context: comments or string literals with multiple placeholder indicators
   */
  placeholder_text: {
    pattern: /(?:\/\/|\/\*|#|["'`]).*?\b(lorem ipsum|test test test|asdf asdf|foo bar baz|replace (?:this|me)|todo:?\s+implement|this is a placeholder)/i,
    exclude: ['*.test.*', '*.spec.*', 'README.*', '*.md', '**/slop-patterns.js', '**/slop-analyzers.js', '**/fixtures/**', '**/mocks/**'],
    severity: 'high',
    autoFix: 'flag',
    language: null,
    description: 'Placeholder text in comments/strings that should be replaced (excludes props like placeholder="...")'
  },

  // ============================================================================
  // Placeholder Function Detection (#98)
  // Detects compilable but non-functional placeholder code that linters miss
  // ============================================================================

  /**
   * JavaScript/TypeScript: Stub return values
   * Detects functions returning hardcoded 0, true, false, null, undefined, [], {}
   */
  placeholder_stub_returns_js: {
    // Disabled: too many false positives with simple regex
    // Needs multi-pass analysis to detect actual stub functions (single return as only statement)
    pattern: null,
    exclude: ['*.test.*', '*.spec.*', '*.config.*'],
    severity: 'low',
    autoFix: 'flag',
    language: 'javascript',
    description: 'Stub function returning hardcoded value (requires multi-pass analysis)',
    requiresMultiPass: true
  },

  /**
   * JavaScript/TypeScript: throw Error("TODO/not implemented")
   */
  placeholder_not_implemented_js: {
    pattern: /throw\s+new\s+Error\s*\(\s*['"`].*(?:TODO|implement|not\s+impl)/i,
    exclude: ['*.test.*', '*.spec.*'],
    severity: 'high',
    autoFix: 'flag',
    language: 'javascript',
    description: 'throw new Error("TODO: implement...") placeholder'
  },

  /**
   * JavaScript/TypeScript: Empty function bodies
   */
  placeholder_empty_function_js: {
    pattern: /(?:function\s+\w+\s*\([^)]*\)|=>\s*)\s*\{\s*\}/,
    exclude: ['*.test.*', '*.spec.*', '*.d.ts'],
    severity: 'high',
    autoFix: 'flag',
    language: 'javascript',
    description: 'Empty function body (placeholder)'
  },

  /**
   * Rust: todo!() and unimplemented!() macros
   */
  placeholder_todo_rust: {
    pattern: /\b(?:todo|unimplemented)!\s*\(/,
    exclude: ['*_test.rs', '*_tests.rs', '**/tests/**'],
    severity: 'high',
    autoFix: 'flag',
    language: 'rust',
    description: 'Rust todo!() or unimplemented!() macro'
  },

  /**
   * Rust: panic!("TODO: ...") placeholder
   */
  placeholder_panic_todo_rust: {
    pattern: /\bpanic!\s*\(\s*["'].*(?:TODO|implement)/i,
    exclude: ['*_test.rs', '*_tests.rs', '**/tests/**'],
    severity: 'high',
    autoFix: 'flag',
    language: 'rust',
    description: 'Rust panic!("TODO: ...") placeholder'
  },

  /**
   * Python: raise NotImplementedError
   */
  placeholder_not_implemented_py: {
    pattern: /raise\s+NotImplementedError/,
    exclude: ['test_*.py', '*_test.py', 'conftest.py', '**/tests/**'],
    severity: 'high',
    autoFix: 'flag',
    language: 'python',
    description: 'Python raise NotImplementedError placeholder'
  },

  /**
   * Python: Function with only pass statement
   * Matches both single-line (def foo(): pass) and multi-line formats
   */
  placeholder_pass_only_py: {
    pattern: /def\s+\w+\s*\([^)]*\)\s*:\s*(?:pass|\n\s+pass)\s*$/m,
    exclude: ['test_*.py', '*_test.py', 'conftest.py'],
    severity: 'high',
    autoFix: 'flag',
    language: 'python',
    description: 'Python function with only pass statement'
  },

  /**
   * Python: Function with only ellipsis (...)
   * Matches both single-line (def foo(): ...) and multi-line formats
   * Note: .pyi stub files legitimately use ellipsis, so excluded
   */
  placeholder_ellipsis_py: {
    pattern: /def\s+\w+\s*\([^)]*\)\s*:\s*(?:\.\.\.|\n\s+\.\.\.)\s*$/m,
    exclude: ['*.pyi', 'test_*.py', '*_test.py'],
    severity: 'high',
    autoFix: 'flag',
    language: 'python',
    description: 'Python function with only ellipsis (...)'
  },

  /**
   * Go: panic("TODO: ...") placeholder
   */
  placeholder_panic_go: {
    pattern: /panic\s*\(\s*["'].*(?:TODO|implement|not\s+impl)/i,
    exclude: ['*_test.go', '**/testdata/**'],
    severity: 'high',
    autoFix: 'flag',
    language: 'go',
    description: 'Go panic("TODO: ...") placeholder'
  },

  /**
   * Java: throw new UnsupportedOperationException()
   */
  placeholder_unsupported_java: {
    pattern: /throw\s+new\s+UnsupportedOperationException\s*\(/,
    exclude: ['*Test.java', '**/test/**'],
    severity: 'high',
    autoFix: 'flag',
    language: 'java',
    description: 'Java throw new UnsupportedOperationException() placeholder'
  },

  /**
   * Empty catch blocks (JavaScript/TypeScript)
   * Only matches truly empty catches - those with comments are intentional
   * Pattern: catch (e) {} but NOT catch { [comment] }
   */
  empty_catch_js: {
    pattern: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
    exclude: ['*.test.*', '*.spec.*'],
    severity: 'high',
    autoFix: 'add_logging',
    language: 'javascript',
    description: 'Empty catch blocks without error handling or comment'
  },

  /**
   * Empty except blocks (Python)
   */
  empty_except_py: {
    pattern: /except\s*[^:]*:\s*pass\s*$/,
    exclude: [],
    severity: 'high',
    autoFix: 'add_logging',
    language: 'python',
    description: 'Empty except blocks with just pass'
  },

  /**
   * Magic numbers in business logic
   * DISABLED: Too many false positives - thresholds, limits, timeouts are intentional
   * Semantic analysis needed to distinguish magic numbers from config values
   * Use ESLint no-magic-numbers rule with ignores instead
   */
  magic_numbers: {
    pattern: null,  // DISABLED - requires semantic analysis
    exclude: [],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Magic numbers detection disabled (use ESLint no-magic-numbers instead)',
    requiresMultiPass: true  // Mark as needing semantic analysis
  },

  /**
   * Disabled linter rules
   * IMPROVED: Lower severity - many disables have legitimate explanatory comments
   * Flag for review but not aggressive auto-fix
   */
  disabled_linter: {
    pattern: /(eslint-disable|pylint: disable|#\s*noqa|@SuppressWarnings|#\[allow\()/,
    exclude: ['*.test.*', '*.spec.*', '**/tests/**', '**/test/**'],
    severity: 'low',  // Reduced from medium - many disables are justified
    autoFix: 'flag',
    language: null,
    description: 'Disabled linter rules (review if justified with explanatory comment)'
  },

  /**
   * Unused imports (basic pattern, language-specific tools better)
   */
  unused_imports_hint: {
    pattern: /^import .* from .* \/\/ unused$/,
    exclude: [],
    severity: 'low',
    autoFix: 'remove',
    language: null,
    description: 'Imports marked as unused'
  },

  /**
   * Duplicate string literals (same string >5 times)
   */
  duplicate_strings: {
    pattern: null, // Requires multi-pass analysis
    exclude: ['*.test.*', '*.spec.*'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Duplicate string literals that should be constants',
    requiresMultiPass: true
  },

  /**
   * Inconsistent indentation markers
   */
  mixed_indentation: {
    pattern: /^\t+ +|^ +\t+/,
    exclude: ['Makefile', '*.mk'],
    severity: 'low',
    autoFix: 'replace',
    language: null,
    description: 'Mixed tabs and spaces'
  },

  /**
   * Trailing whitespace
   */
  trailing_whitespace: {
    pattern: /\s+$/,
    exclude: ['*.md'], // Markdown uses trailing spaces for line breaks
    severity: 'low',
    autoFix: 'remove',
    language: null,
    description: 'Trailing whitespace at end of lines'
  },

  /**
   * Multiple consecutive blank lines
   */
  multiple_blank_lines: {
    pattern: /^\s*\n\s*\n\s*\n/,
    exclude: [],
    severity: 'low',
    autoFix: 'replace',
    language: null,
    description: 'More than 2 consecutive blank lines'
  },

  /**
   * Hardcoded credentials patterns (expanded for comprehensive detection)
   * IMPROVED: Better test fixture detection
   * Excludes common false positives:
   * - Template placeholders: ${VAR}, {{VAR}}, <VAR>
   * - Masked/example values: xxxxxxxx, ********
   * - Test values: TestPassword, test-csrf-token, mock credentials
   */
  hardcoded_secrets: {
    pattern: /(password|secret|api[_-]?key|token|credential|auth)[_-]?(key|token|secret|pass)?\s*[:=]\s*["'`](?!\$\{)(?!\{\{)(?!<[A-Z_])(?![x*#]{8,})(?![X*#]{8,})(?!test)(?!Test)(?!MOCK)(?!mock)(?!dummy)(?!Dummy)[^"'`\s]{8,}["'`]/i,
    exclude: [
      '*.test.*', '*.spec.*', '*.example.*', '*.sample.*', 'README.*', '*.md',
      '**/fixtures/**', '**/mocks/**', '**/test/**', '**/tests/**', '**/e2e/**',
      '**/*fixture*.{js,ts}', '**/*mock*.{js,ts}'
    ],
    severity: 'critical',
    autoFix: 'flag',
    language: null,
    description: 'Potential hardcoded credentials (excludes test/mock/example values)'
  },

  /**
   * JWT tokens (eyJ prefix indicates base64 JSON header)
   */
  jwt_tokens: createSecretPattern(
    /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    'Hardcoded JWT token'
  ),

  /**
   * OpenAI API keys (sk-... format)
   */
  openai_api_key: createSecretPattern(
    /sk-[a-zA-Z0-9]{32,}/,
    'Hardcoded OpenAI API key'
  ),

  /**
   * GitHub tokens (personal access tokens, fine-grained tokens, OAuth)
   */
  github_token: createSecretPattern(
    /(ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|ghu_[a-zA-Z0-9]{36}|ghs_[a-zA-Z0-9]{36}|ghr_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})/,
    'Hardcoded GitHub token'
  ),

  /**
   * AWS credentials (access key IDs and secret keys)
   */
  aws_credentials: createSecretPattern(
    /(AKIA[0-9A-Z]{16}|aws_secret_access_key\s*[:=]\s*["'`][A-Za-z0-9/+=]{40}["'`])/i,
    'Hardcoded AWS credentials'
  ),

  /**
   * Google Cloud / Firebase API keys and service accounts
   */
  google_api_key: createSecretPattern(
    /(AIza[0-9A-Za-z_-]{35}|[0-9]+-[a-z0-9_]{32}\.apps\.googleusercontent\.com)/,
    'Hardcoded Google/Firebase API key'
  ),

  /**
   * Stripe API keys (live and test)
   */
  stripe_api_key: createSecretPattern(
    /(sk_live_[a-zA-Z0-9]{24,}|sk_test_[a-zA-Z0-9]{24,}|rk_live_[a-zA-Z0-9]{24,}|rk_test_[a-zA-Z0-9]{24,})/,
    'Hardcoded Stripe API key'
  ),

  /**
   * Slack tokens (bot, user, webhook)
   */
  slack_token: createSecretPattern(
    /(xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}|xoxp-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}|xoxa-[0-9]{10,}-[a-zA-Z0-9]{24}|https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8}\/B[A-Z0-9]{8,}\/[a-zA-Z0-9]{24})/,
    'Hardcoded Slack token or webhook URL'
  ),

  /**
   * Discord tokens and webhook URLs
   */
  discord_token: createSecretPattern(
    /(discord.*["'`][A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}["'`]|https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+)/i,
    'Hardcoded Discord token or webhook'
  ),

  /**
   * SendGrid API key
   */
  sendgrid_api_key: createSecretPattern(
    /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/,
    'Hardcoded SendGrid API key'
  ),

  /**
   * Twilio credentials
   */
  twilio_credentials: createSecretPattern(
    /(AC[a-f0-9]{32}|SK[a-f0-9]{32})/,
    'Hardcoded Twilio credentials'
  ),

  /**
   * NPM tokens
   */
  npm_token: createSecretPattern(
    /npm_[a-zA-Z0-9]{36}/,
    'Hardcoded NPM token'
  ),

  /**
   * Private keys (RSA, DSA, EC, PGP)
   */
  private_key: createSecretPattern(
    /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
    'Private key in source code',
    ['*.pem.example'] // Additional excludes beyond standard test files
  ),

  /**
   * Generic high-entropy strings (potential secrets)
   */
  high_entropy_string: {
    pattern: /["'`][A-Za-z0-9+/=_-]{40,}["'`]/,
    exclude: ['*.test.*', '*.spec.*', '*.example.*', '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
    severity: 'medium',
    autoFix: 'flag',
    language: null,
    description: 'High-entropy string that may be a secret',
    requiresEntropyCheck: true,
    entropyThreshold: 4.5
  },

  /**
   * Process.exit in libraries
   * DISABLED: Too many false positives in CLI tools, MCP servers, error handlers
   * process.exit() is legitimate in entry points, CLI tools, and error boundaries
   */
  process_exit: {
    pattern: null,  // DISABLED - too many legitimate uses
    exclude: [],
    severity: 'high',
    autoFix: 'flag',
    language: 'javascript',
    description: 'process.exit() detection disabled (legitimate in CLIs, servers, error handlers)'
  },

  /**
   * Bare URLs in code (should use constants)
   * DISABLED: Too many false positives - docs, links, comments are intentional
   * URLs in comments/docs are not "hardcoded" in the code sense
   */
  bare_urls: {
    pattern: null,  // DISABLED - too noisy
    exclude: [],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Bare URLs detection disabled (too many false positives in docs/comments)'
  },

  // ============================================================================
  // Doc/Code Ratio Detection (#P1-T2)
  // Detects JSDoc blocks that are disproportionately longer than function bodies
  // ============================================================================

  /**
   * JSDoc-to-function ratio (excessive documentation)
   * Flags when JSDoc is >3x the length of the function body
   * Requires multi-pass analysis since simple regex can't compute ratios
   */
  doc_code_ratio_js: {
    pattern: null, // Requires multi-pass analysis
    exclude: ['*.test.*', '*.spec.*', '*.d.ts'],
    severity: 'medium',
    autoFix: 'flag',
    language: 'javascript',
    description: 'Documentation longer than code (JSDoc > 3x function body)',
    requiresMultiPass: true,
    minFunctionLines: 3,  // Skip tiny functions
    maxRatio: 3.0          // Doc can be 3x function length max
  },

  // ============================================================================
  // Phantom Reference Detection (#P1-T3)
  // Detects issue/PR mentions and file path references in code comments
  // ============================================================================

  /**
   * Issue/PR/iteration references in code comments
   * ANY mention of issue/PR numbers is treated as slop - context belongs in commits
   */
  issue_pr_references: {
    pattern: /\/\/.*(?:#\d+|issue\s+#?\d+|PR\s+#?\d+|pull\s+request\s+#?\d+|fixed\s+in\s+#?\d+|closes?\s+#?\d+|resolves?\s+#?\d+|iteration\s+\d+)/i,
    exclude: ['*.md', 'README.*', 'CHANGELOG.*', 'CONTRIBUTING.*'],
    severity: 'medium',
    autoFix: 'remove',
    language: null,  // Universal - all languages
    description: 'Issue/PR/iteration references in comments (slop - remove context from code)'
  },

  /**
   * File path references in code comments
   * DISABLED: Too many false positives - documentation references are helpful
   * These references add context, not slop
   */
  file_path_references: {
    pattern: null,  // DISABLED - references are helpful, not slop
    exclude: [],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'File path references detection disabled (helpful context, not slop)'
  },

  // ============================================================================
  // Verbosity Detection
  // Detects AI preambles, marketing buzzwords, hedging language, and excessive comments
  // ============================================================================

  /**
   * AI preamble phrases in comments
   * Detects filler language like "Certainly!", "I'd be happy to help!"
   */
  verbosity_preambles: {
    pattern: /\/\/\s*(?:certainly|i'd\s+be\s+happy|great\s+question|absolutely|of\s+course|happy\s+to\s+help|let\s+me\s+help|i\s+can\s+help)/i,
    exclude: ['*.test.*', '*.spec.*', '*.md'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'AI preamble phrases in comments - remove filler language'
  },

  /**
   * Marketing buzzwords that obscure technical meaning
   * Focus on flowery language, NOT standard SE terms like "leverage", "utilize", "orchestrate"
   */
  verbosity_buzzwords: {
    pattern: /\b(?:synergize|operationalize|paradigm\s+shift|best-in-class|world-class|cutting-edge|game-changing|holistic|revolutionary|transformative|seamless|next-generation|bleeding-edge|industry-leading)\b/i,
    exclude: ['*.test.*', '*.spec.*', '*.md', 'CHANGELOG.*', 'README.*'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Marketing buzzwords that obscure technical meaning'
  },

  /**
   * Hedging language in comments
   * Indicates incomplete thinking - code should be definitive
   */
  verbosity_hedging: {
    pattern: /\/\/.*\b(?:it'?s?\s+worth\s+noting|generally\s+speaking|more\s+or\s+less|arguably|perhaps|possibly|might\s+be|should\s+work|i\s+think|i\s+believe|probably|maybe)\b/i,
    exclude: ['*.test.*', '*.spec.*'],
    severity: 'low',
    autoFix: 'flag',
    language: null,
    description: 'Hedging language in comments - be direct'
  },

  /**
   * Excessive inline comments (comment-to-code ratio)
   * Flags when inline comments exceed maxCommentRatio times the code lines
   * Requires multi-pass analysis for ratio computation
   */
  verbosity_ratio: {
    pattern: null, // Requires multi-pass analysis
    requiresMultiPass: true,
    exclude: ['*.test.*', '*.spec.*', '*.md', '*.d.ts'],
    severity: 'medium',
    autoFix: 'flag',
    language: null,
    description: 'Excessive inline comments (>2:1 comment-to-code ratio within function)',
    maxCommentRatio: 2.0,
    minCodeLines: 3
  },

  // ============================================================================
  // Over-Engineering Detection
  // Detects excessive complexity relative to public API surface
  // ============================================================================

  /**
   * Over-engineering metrics (project-level analysis)
   * Detects: file proliferation, code density, directory depth
   * Requires multi-pass analysis - cannot be done with simple regex
   */
  over_engineering_metrics: {
    pattern: null, // Requires multi-pass analysis
    exclude: [],  // Analyzes entire project
    severity: 'high',
    autoFix: 'flag',  // Cannot auto-fix architectural issues
    language: null,   // Universal - all languages
    description: 'Excessive files/lines relative to public API (over-engineering indicator)',
    requiresMultiPass: true,
    // Thresholds for violation detection
    fileRatioThreshold: 20,       // Max 20 files per export
    linesPerExportThreshold: 500, // Max 500 lines per export
    depthThreshold: 4             // Max 4 directory levels
  },

  // ============================================================================
  // Buzzword Inflation Detection
  // Detects quality claims without supporting code evidence
  // ============================================================================

  /**
   * Buzzword inflation (project-level analysis)
   * Detects claims like "production-ready", "secure", "scalable" in docs/comments
   * without supporting evidence in the codebase
   * Requires multi-pass analysis - extracts claims, searches for evidence
   */
  buzzword_inflation: {
    pattern: null, // Requires multi-pass analysis
    exclude: [],   // Exclusions handled by analyzer (isTestFile, shouldExclude)
    severity: 'high',
    autoFix: 'flag',  // Cannot auto-fix documentation claims
    language: null,   // Universal - all languages
    description: 'Quality claims (production-ready, secure, scalable) without supporting code evidence',
    requiresMultiPass: true,
    // Minimum evidence matches required to substantiate a claim
    minEvidenceMatches: 2
  },

  /**
   * Infrastructure without implementation (multi-pass analysis)
   * Detects infrastructure components (clients, connections, pools, services)
   * that are instantiated/configured but never actually used
   * Requires multi-pass - scans for setup patterns, then verifies usage
   */
  infrastructure_without_implementation: {
    pattern: null, // Requires multi-pass analysis
    exclude: ['node_modules', 'vendor', 'dist', 'build', '*.test.*', '*.spec.*'],
    severity: 'high',
    autoFix: 'flag',  // Cannot safely remove - may be lazy loading or future use
    language: null,   // Universal - all languages
    description: 'Infrastructure configured but never wired (setup without usage)',
    requiresMultiPass: true
  },

  // ============================================================================
  // Code Smell Detection (#106)
  // High-impact code smell patterns for maintainability and readability
  // ============================================================================

  /**
   * Boolean Blindness - functions called with 3+ consecutive boolean literals
   * e.g., process(true, false, true) - unclear what each boolean means
   * Suggests using named parameters or option objects
   */
  boolean_blindness: {
    pattern: /\w+\s*\([^)]*(?:true|false)\s*,\s*(?:true|false)\s*,\s*(?:true|false)[^)]*\)/i,
    exclude: ['*.test.*', '*.spec.*', '**/tests/**', '**/test/**'],
    severity: 'medium',
    autoFix: 'flag',
    language: null, // Universal - JS, Python, Rust, Go, Java
    description: 'Function call with 3+ boolean parameters (unclear meaning - use named params or options object)'
  },

  // REMOVED: message_chains_methods
  // Reason: 100% false positive rate - can't distinguish fluent APIs (Zod, query builders)
  // from actual Law of Demeter violations. Requires semantic analysis.
  // Alternative: Use eslint-plugin-smells no-complex-chaining rule.

  // REMOVED: message_chains_properties
  // Reason: Same issue as message_chains_methods - flags config access, nested object
  // destructuring, and other legitimate deep property patterns.

  /**
   * Mutable Globals - JavaScript/TypeScript
   * Detects module-level mutable state using let/var with UPPERCASE names
   * Convention: UPPERCASE = constant, but let/var makes it mutable = bug-prone
   */
  mutable_globals_js: {
    pattern: /^(?:let|var)\s+[A-Z][A-Z0-9_]*\s*=/m,
    exclude: ['*.test.*', '*.spec.*', '*.config.*', '**/tests/**', 'constants.js', 'constants.ts'],
    severity: 'high',
    autoFix: 'flag',
    language: 'javascript',
    description: 'Mutable global with UPPERCASE name (should be const or module-scoped)'
  },

  /**
   * Mutable Globals - Python
   * Detects module-level mutable collections assigned to UPPERCASE names
   */
  mutable_globals_py: {
    pattern: /^[A-Z][A-Z0-9_]*\s*=\s*(?:\[|\{|dict\(|list\(|set\()/m,
    exclude: ['test_*.py', '*_test.py', 'conftest.py', '**/tests/**', 'constants.py', 'settings.py'],
    severity: 'high',
    autoFix: 'flag',
    language: 'python',
    description: 'Mutable global collection (list/dict/set) - use module-level functions or classes'
  },

  /**
   * Dead Code Detection (multi-pass analysis)
   * Detects unreachable code after return/throw/break/continue
   * Requires multi-pass analysis to handle control flow
   */
  dead_code: {
    pattern: null, // Requires multi-pass analysis
    exclude: ['*.test.*', '*.spec.*'],
    severity: 'high',
    autoFix: 'flag',
    language: null,
    description: 'Unreachable code after return/throw/break/continue',
    requiresMultiPass: true
  },

  /**
   * Shotgun Surgery Detection (multi-pass analysis)
   * Detects files that frequently change together across commits
   * Indicates tight coupling that should be refactored
   * Requires git history analysis
   */
  shotgun_surgery: {
    pattern: null, // Requires multi-pass analysis with git
    exclude: [],
    severity: 'high',
    autoFix: 'flag',
    language: null,
    description: 'Files frequently change together (tight coupling - consider consolidation)',
    requiresMultiPass: true,
    // Configuration for git analysis
    commitLimit: 100,        // Analyze last 100 commits
    clusterThreshold: 5      // Flag clusters with 5+ files changing together
  },

  // REMOVED: feature_envy
  // Reason: 100% false positive rate with regex. Requires AST analysis.
  // Alternative: Use eslint-plugin-clean-code for proper feature envy detection.

  /**
   * Speculative Generality - Unused parameters (heuristic)
   * DISABLED: Underscore-prefixed params are often intentional (callback signatures, interface compliance)
   * Use ESLint no-unused-vars with args: 'none' or argsIgnorePattern: '^_' instead
   */
  speculative_generality_unused_params: {
    pattern: null,  // DISABLED - underscore params are often intentional
    exclude: [],
    severity: 'low',
    autoFix: 'flag',
    language: 'javascript',
    description: 'Unused params detection disabled (underscore convention is intentional)'
  },

  /**
   * Speculative Generality - Empty interfaces (TypeScript)
   * Detects interface definitions with no members
   * May indicate premature abstraction
   */
  speculative_generality_empty_interface: {
    pattern: /interface\s+\w+\s*(?:<[^>]*>)?\s*\{\s*\}/,
    exclude: ['*.test.*', '*.spec.*', '**/tests/**'],
    severity: 'low',
    autoFix: 'flag',
    language: 'javascript',
    description: 'Empty interface (heuristic - may be premature abstraction)'
  }
};

// Freeze the patterns object for V8 optimization
deepFreeze(slopPatterns);

// ============================================================================
// Pre-indexed Maps for O(1) lookup performance (#18)
// Built once at module load time, avoiding iteration on every lookup
// ============================================================================

/**
 * Pre-indexed patterns by language
 * Key: language name (or 'universal' for language-agnostic patterns)
 * Value: Object of pattern name -> pattern definition
 */
const _patternsByLanguage = new Map();

/**
 * Pre-indexed patterns by severity
 * Key: severity level ('critical', 'high', 'medium', 'low')
 * Value: Object of pattern name -> pattern definition
 */
const _patternsBySeverity = new Map();

/**
 * Pre-indexed patterns by autoFix strategy
 * Key: autoFix type ('remove', 'replace', 'add_logging', 'flag', 'none')
 * Value: Object of pattern name -> pattern definition
 */
const _patternsByAutoFix = new Map();

/**
 * Set of all available languages for O(1) existence check
 */
const _availableLanguages = new Set();

/**
 * Set of all available severity levels for O(1) existence check
 */
const _availableSeverities = new Set();

// Build indexes at module load time
(function buildIndexes() {
  for (const [name, pattern] of Object.entries(slopPatterns)) {
    // Index by language
    const lang = pattern.language || 'universal';
    if (!_patternsByLanguage.has(lang)) {
      _patternsByLanguage.set(lang, {});
    }
    _patternsByLanguage.get(lang)[name] = pattern;
    _availableLanguages.add(lang);

    // Index by severity
    const severity = pattern.severity;
    if (!_patternsBySeverity.has(severity)) {
      _patternsBySeverity.set(severity, {});
    }
    _patternsBySeverity.get(severity)[name] = pattern;
    _availableSeverities.add(severity);

    // Index by autoFix strategy
    const autoFix = pattern.autoFix || 'none';
    if (!_patternsByAutoFix.has(autoFix)) {
      _patternsByAutoFix.set(autoFix, {});
    }
    _patternsByAutoFix.get(autoFix)[name] = pattern;
  }
})();

// Freeze the index Sets
Object.freeze(_availableLanguages);
Object.freeze(_availableSeverities);

/**
 * Get patterns for a specific language (O(1) lookup via pre-indexed Map)
 * Includes universal patterns that apply to all languages
 * @param {string} language - Language identifier ('javascript', 'python', 'rust', etc.)
 * @returns {Object} Filtered patterns (language-specific + universal)
 */
function getPatternsForLanguage(language) {
  const langPatterns = _patternsByLanguage.get(language) || {};
  const universalPatterns = _patternsByLanguage.get('universal') || {};

  // Merge language-specific with universal patterns
  return { ...universalPatterns, ...langPatterns };
}

/**
 * Get patterns for a specific language only (excludes universal patterns)
 * @param {string} language - Language identifier
 * @returns {Object} Language-specific patterns only
 */
function getPatternsForLanguageOnly(language) {
  return _patternsByLanguage.get(language) || {};
}

/**
 * Get universal patterns (apply to all languages)
 * @returns {Object} Universal patterns
 */
function getUniversalPatterns() {
  return _patternsByLanguage.get('universal') || {};
}

/**
 * Get patterns by severity (O(1) lookup via pre-indexed Map)
 * @param {string} severity - Severity level ('critical', 'high', 'medium', 'low')
 * @returns {Object} Filtered patterns
 */
function getPatternsBySeverity(severity) {
  return _patternsBySeverity.get(severity) || {};
}

/**
 * Get patterns by autoFix strategy (O(1) lookup via pre-indexed Map)
 * @param {string} autoFix - AutoFix strategy ('remove', 'replace', 'add_logging', 'flag', 'none')
 * @returns {Object} Filtered patterns
 */
function getPatternsByAutoFix(autoFix) {
  return _patternsByAutoFix.get(autoFix) || {};
}

/**
 * Get patterns matching multiple criteria (language AND severity)
 * Optimized: single-pass filtering instead of chained Object.entries
 * @param {Object} criteria - Filter criteria
 * @param {string} [criteria.language] - Language filter
 * @param {string} [criteria.severity] - Severity filter
 * @param {string} [criteria.autoFix] - AutoFix strategy filter
 * @returns {Object} Patterns matching all criteria
 */
function getPatternsByCriteria(criteria = {}) {
  // Fast path: no criteria means return all patterns
  if (!criteria.language && !criteria.severity && !criteria.autoFix) {
    return { ...slopPatterns };
  }

  // Pre-fetch filter sets (O(1) Map lookups)
  const langPatterns = criteria.language ? getPatternsForLanguage(criteria.language) : null;
  const severityPatterns = criteria.severity ? getPatternsBySeverity(criteria.severity) : null;
  const autoFixPatterns = criteria.autoFix ? getPatternsByAutoFix(criteria.autoFix) : null;

  // Single-pass filter: check all criteria at once
  const result = {};
  for (const [name, pattern] of Object.entries(slopPatterns)) {
    // Check all criteria in one pass (short-circuit on first failure)
    if (langPatterns && !(name in langPatterns)) continue;
    if (severityPatterns && !(name in severityPatterns)) continue;
    if (autoFixPatterns && !(name in autoFixPatterns)) continue;

    result[name] = pattern;
  }

  return result;
}

/**
 * Get all available languages
 * @returns {Array<string>} List of language identifiers
 */
function getAvailableLanguages() {
  return Array.from(_availableLanguages);
}

/**
 * Get all available severity levels
 * @returns {Array<string>} List of severity levels
 */
function getAvailableSeverities() {
  return Array.from(_availableSeverities);
}

/**
 * Check if patterns exist for a language
 * @param {string} language - Language identifier
 * @returns {boolean} True if patterns exist
 */
function hasLanguage(language) {
  return _patternsByLanguage.has(language);
}

/**
 * Check if a file should be excluded based on pattern rules
 * Uses pre-compiled regex cache and result cache for performance
 * @param {string} filePath - File path to check
 * @param {Array<string>} excludePatterns - Exclude patterns
 * @returns {boolean} True if file should be excluded
 */
function isFileExcluded(filePath, excludePatterns) {
  if (!excludePatterns || excludePatterns.length === 0) return false;

  // Normalize Windows backslashes to forward slashes for consistent pattern matching
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Create cache key using JSON.stringify for collision-resistant format
  const cacheKey = JSON.stringify([normalizedPath, excludePatterns]);

  // Check cache first (O(1) lookup)
  const cached = _excludeResultCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Compute result
  const result = excludePatterns.some(pattern => {
    const regex = getCompiledPattern(pattern);
    return regex.test(normalizedPath);
  });

  // Store in cache with FIFO eviction
  if (_excludeResultCache.size >= MAX_EXCLUDE_RESULT_CACHE_SIZE) {
    const firstKey = _excludeResultCache.keys().next().value;
    _excludeResultCache.delete(firstKey);
  }
  _excludeResultCache.set(cacheKey, result);

  return result;
}

/**
 * Get patterns that require multi-pass analysis
 * These patterns have `requiresMultiPass: true` and need structural code analysis
 * @returns {Object} Patterns requiring multi-pass analysis
 */
function getMultiPassPatterns() {
  const result = {};
  for (const [name, pattern] of Object.entries(slopPatterns)) {
    if (pattern.requiresMultiPass) {
      result[name] = pattern;
    }
  }
  return result;
}

// Import analyzers for multi-pass patterns
const analyzers = require('./slop-analyzers');

module.exports = {
  slopPatterns,
  // Pre-indexed lookup functions (O(1) performance)
  getPatternsForLanguage,
  getPatternsForLanguageOnly,
  getUniversalPatterns,
  getPatternsBySeverity,
  getPatternsByAutoFix,
  getPatternsByCriteria,
  // Metadata functions
  getAvailableLanguages,
  getAvailableSeverities,
  hasLanguage,
  // File exclusion
  isFileExcluded,
  // Multi-pass analysis
  getMultiPassPatterns,
  analyzers
};
