/**
 * Security Patterns
 * Detection patterns for security vulnerabilities in plugins
 *
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Security patterns with certainty levels
 */
const securityPatterns = {
  /**
   * Unrestricted Bash tool access
   * HIGH certainty - security risk
   */
  unrestricted_bash: {
    id: 'unrestricted_bash',
    category: 'security',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Agent has unrestricted Bash tool access',
    pattern: /^tools:\s*.*\bBash\b(?!\s*\()/m,
    check: (content, filePath) => {
      // Check for Bash without restrictions in agent frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) return null;

      const frontmatter = frontmatterMatch[1];
      const toolsMatch = frontmatter.match(/^tools:\s*(.*)$/m);
      if (!toolsMatch) return null;

      const tools = toolsMatch[1];
      // Bash without parentheses means unrestricted
      if (/\bBash\b(?!\s*\()/.test(tools)) {
        return {
          issue: 'Unrestricted Bash access',
          fix: 'Add restrictions like Bash(git:*) or Bash(npm:*)',
          line: content.substring(0, frontmatterMatch.index + frontmatterMatch[0].indexOf(toolsMatch[0])).split('\n').length
        };
      }
      return null;
    }
  },

  /**
   * Command injection via string interpolation
   * HIGH certainty - dangerous pattern
   */
  command_injection: {
    id: 'command_injection',
    category: 'security',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Potential command injection via string interpolation',
    pattern: /\$\{[^}]*\}/,
    check: (content, filePath) => {
      const issues = [];
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for shell commands with interpolation
        if (/(?:exec|spawn|system|shell|`|Bash)\s*[(`].*\$\{/.test(line)) {
          issues.push({
            issue: 'Command injection risk via string interpolation',
            fix: 'Validate and escape user input before shell execution',
            line: i + 1
          });
        }
      }

      return issues.length > 0 ? issues : null;
    }
  },

  /**
   * Path traversal patterns
   * HIGH certainty - security risk
   */
  path_traversal: {
    id: 'path_traversal',
    category: 'security',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Potential path traversal vulnerability',
    pattern: /\.\.\//,
    check: (content, filePath) => {
      const issues = [];
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for user-controlled paths with ../
        if (/(?:path|file|dir).*\$.*\.\.\/|\.\.\/.*\$/.test(line)) {
          issues.push({
            issue: 'Path traversal risk - user input may contain ../',
            fix: 'Validate paths and use path.resolve() with base directory check',
            line: i + 1
          });
        }
      }

      return issues.length > 0 ? issues : null;
    }
  },

  /**
   * Hardcoded secrets in agent files
   * HIGH certainty - critical
   */
  hardcoded_secrets: {
    id: 'hardcoded_secrets',
    category: 'security',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Potential hardcoded secrets',
    pattern: /(api[_-]?key|secret|token|password|credential)\s*[:=]\s*["'`][^"'`\s]{8,}["'`]/i,
    check: (content, filePath) => {
      const issues = [];
      const lines = content.split('\n');
      const secretPattern = /(api[_-]?key|secret|token|password|credential)\s*[:=]\s*["'`](?!\$\{)(?!\{\{)[^"'`\s]{8,}["'`]/i;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (secretPattern.test(line)) {
          issues.push({
            issue: 'Potential hardcoded secret',
            fix: 'Use environment variables instead',
            line: i + 1
          });
        }
      }

      return issues.length > 0 ? issues : null;
    }
  },

  /**
   * Missing input validation
   * MEDIUM certainty - may be intentional
   */
  missing_input_validation: {
    id: 'missing_input_validation',
    category: 'security',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'User input used without validation',
    check: (content, filePath) => {
      const issues = [];
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for direct use of ARGUMENTS without validation
        if (/\$ARGUMENTS/.test(line) && !/validate|check|verify|sanitize/.test(lines.slice(Math.max(0, i - 5), i + 1).join('\n').toLowerCase())) {
          issues.push({
            issue: 'User input ($ARGUMENTS) used without apparent validation',
            fix: 'Add input validation before using user-provided arguments',
            line: i + 1
          });
        }
      }

      return issues.length > 0 ? issues : null;
    }
  },

  /**
   * Broad file access patterns
   * MEDIUM certainty - may be required
   */
  broad_file_access: {
    id: 'broad_file_access',
    category: 'security',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Agent requests broad file system access',
    check: (content, filePath) => {
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) return null;

      const frontmatter = frontmatterMatch[1];
      const toolsMatch = frontmatter.match(/^tools:\s*(.*)$/m);
      if (!toolsMatch) return null;

      const tools = toolsMatch[1];
      // Check for Write or Edit without restrictions
      if (/\b(Write|Edit)\b(?!\s*\()/.test(tools)) {
        return {
          issue: 'Broad file write access',
          fix: 'Consider restricting to specific directories',
          line: content.substring(0, frontmatterMatch.index + frontmatterMatch[0].indexOf(toolsMatch[0])).split('\n').length
        };
      }
      return null;
    }
  },

  /**
   * Unsafe eval patterns
   * HIGH certainty - dangerous
   */
  unsafe_eval: {
    id: 'unsafe_eval',
    category: 'security',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Unsafe eval() or Function() usage',
    pattern: /\b(?:eval|Function)\s*\(/,
    check: (content, filePath) => {
      const issues = [];
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\b(?:eval|Function)\s*\(/.test(line)) {
          issues.push({
            issue: 'Unsafe eval() or Function() usage',
            fix: 'Avoid dynamic code execution - use safer alternatives',
            line: i + 1
          });
        }
      }

      return issues.length > 0 ? issues : null;
    }
  }
};

/**
 * Get all security patterns
 * @returns {Object} All security patterns
 */
function getAllPatterns() {
  return securityPatterns;
}

/**
 * Get patterns by certainty level
 * @param {string} certainty - HIGH, MEDIUM, or LOW
 * @returns {Object} Filtered patterns
 */
function getPatternsByCertainty(certainty) {
  const result = {};
  for (const [name, pattern] of Object.entries(securityPatterns)) {
    if (pattern.certainty === certainty) {
      result[name] = pattern;
    }
  }
  return result;
}

/**
 * Run all security checks on content
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {Array} Array of issues found
 */
function checkSecurity(content, filePath) {
  const issues = [];

  for (const [name, pattern] of Object.entries(securityPatterns)) {
    if (pattern.check) {
      const result = pattern.check(content, filePath);
      if (result) {
        if (Array.isArray(result)) {
          issues.push(...result.map(r => ({ ...r, patternId: pattern.id, certainty: pattern.certainty })));
        } else {
          issues.push({ ...result, patternId: pattern.id, certainty: pattern.certainty });
        }
      }
    }
  }

  return issues;
}

module.exports = {
  securityPatterns,
  getAllPatterns,
  getPatternsByCertainty,
  checkSecurity
};
