/**
 * Project Memory Patterns
 * Detection patterns for CLAUDE.md/AGENTS.md project memory files
 */

/**
 * Project memory patterns with certainty levels
 * Following the agent-patterns model
 */
const projectMemoryPatterns = {
  // ============================================
  // HIGH CERTAINTY PATTERNS
  // ============================================

  /**
   * Missing critical rules section
   * HIGH certainty - project memory should have critical rules
   */
  missing_critical_rules: {
    id: 'missing_critical_rules',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: false,
    description: 'No critical rules or priority rules section',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Look for critical rules indicators
      const hasCriticalRules = /##\s+critical\s+rules/i.test(content);
      const hasPriorityRules = /##\s+priority\s+rules/i.test(content);
      const hasImportantRules = /<critical-rules>/i.test(content);
      const hasMustKnow = /##\s+must[- ]know/i.test(content);

      if (!hasCriticalRules && !hasPriorityRules && !hasImportantRules && !hasMustKnow) {
        return {
          issue: 'Missing critical rules section',
          fix: 'Add "## Critical Rules" section with prioritized project rules'
        };
      }
      return null;
    }
  },

  /**
   * Missing architecture section
   * HIGH certainty - should have overview of project structure
   */
  missing_architecture: {
    id: 'missing_architecture',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: false,
    description: 'No architecture or project structure section',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const hasArchitecture = /##\s+architecture/i.test(content);
      const hasStructure = /##\s+(?:project\s+)?structure/i.test(content);
      const hasOverview = /##\s+overview/i.test(content);
      const hasDirectoryTree = /```[\s\S]*?(?:├──|└──|lib\/|src\/)[\s\S]*?```/.test(content);

      if (!hasArchitecture && !hasStructure && !hasOverview && !hasDirectoryTree) {
        return {
          issue: 'Missing architecture/structure section',
          fix: 'Add "## Architecture" section with directory tree or project overview'
        };
      }
      return null;
    }
  },

  /**
   * Missing key commands section
   * HIGH certainty - should document common commands
   */
  missing_key_commands: {
    id: 'missing_key_commands',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: false,
    description: 'No commands or scripts section',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const hasCommands = /##\s+(?:key\s+)?commands/i.test(content);
      const hasScripts = /##\s+scripts/i.test(content);
      const hasUsage = /##\s+usage/i.test(content);
      const hasCodeBlocks = /```(?:bash|sh|shell)[\s\S]*?(?:npm|yarn|pnpm|git|make)/i.test(content);

      if (!hasCommands && !hasScripts && !hasUsage && !hasCodeBlocks) {
        return {
          issue: 'Missing key commands section',
          fix: 'Add "## Key Commands" section with common development commands'
        };
      }
      return null;
    }
  },

  /**
   * Broken file reference
   * HIGH certainty - referenced files should exist
   */
  broken_file_reference: {
    id: 'broken_file_reference',
    category: 'reference',
    certainty: 'HIGH',
    autoFix: false,
    description: 'References a file that does not exist',
    check: (content, context = {}) => {
      // This check requires file system access, handled in analyzer
      // Pattern just defines the structure
      if (!content || typeof content !== 'string') return null;
      if (!context.brokenFiles || context.brokenFiles.length === 0) return null;

      return {
        issue: `Broken file references: ${context.brokenFiles.slice(0, 3).join(', ')}${context.brokenFiles.length > 3 ? '...' : ''}`,
        fix: 'Update or remove references to non-existent files',
        files: context.brokenFiles
      };
    }
  },

  /**
   * Broken command reference
   * HIGH certainty - documented commands should work
   */
  broken_command_reference: {
    id: 'broken_command_reference',
    category: 'reference',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Documents a command that does not exist in package.json',
    check: (content, context = {}) => {
      // This check requires package.json access, handled in analyzer
      if (!content || typeof content !== 'string') return null;
      if (!context.brokenCommands || context.brokenCommands.length === 0) return null;

      return {
        issue: `Broken command references: ${context.brokenCommands.join(', ')}`,
        fix: 'Update or remove references to non-existent commands',
        commands: context.brokenCommands
      };
    }
  },

  // ============================================
  // MEDIUM CERTAINTY PATTERNS
  // ============================================

  /**
   * README duplication
   * MEDIUM certainty - should not duplicate README.md content
   */
  readme_duplication: {
    id: 'readme_duplication',
    category: 'efficiency',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Duplicates content from README.md',
    check: (content, context = {}) => {
      if (!content || typeof content !== 'string') return null;
      if (!context.duplicationRatio) return null;

      // Flag if more than 40% overlap with README
      if (context.duplicationRatio > 0.4) {
        return {
          issue: `${Math.round(context.duplicationRatio * 100)}% content duplicated from README.md`,
          fix: 'Reference README.md instead of duplicating content'
        };
      }
      return null;
    }
  },

  /**
   * Excessive token count
   * MEDIUM certainty - large files waste context tokens
   */
  excessive_token_count: {
    id: 'excessive_token_count',
    category: 'efficiency',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Project memory file exceeds recommended token count',
    maxTokens: 1500,
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Rough token estimate (1 token ~ 4 characters)
      const estimatedTokens = Math.ceil(content.length / 4);

      if (estimatedTokens > 1500) {
        return {
          issue: `Estimated ${estimatedTokens} tokens (recommended max: 1500)`,
          fix: 'Condense content, use links to detailed docs, or move verbose sections elsewhere'
        };
      }
      return null;
    }
  },

  /**
   * Verbose instructions
   * MEDIUM certainty - project memory should be concise
   */
  verbose_instructions: {
    id: 'verbose_instructions',
    category: 'efficiency',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Instructions are too verbose for quick reference',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check for verbose indicators
      const lines = content.split('\n');
      const avgLineLength = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
      const longParagraphs = (content.match(/[^\n]{200,}/g) || []).length;

      // Flag if average line is long OR many long paragraphs
      if (avgLineLength > 80 && longParagraphs > 3) {
        return {
          issue: 'Content is verbose (avg line: ' + Math.round(avgLineLength) + ' chars)',
          fix: 'Use bullet points, tables, and concise language'
        };
      }
      return null;
    }
  },

  /**
   * Missing WHY explanations
   * MEDIUM certainty - rules should explain rationale
   */
  missing_why: {
    id: 'missing_why',
    category: 'quality',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Rules lack WHY explanations',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Count rules/requirements
      const ruleIndicators = content.match(/(?:must|never|always|do not|required|important)/gi) || [];
      const whyExplanations = content.match(/(?:\*WHY:|WHY:|because|reason:|rationale:)/gi) || [];

      // If many rules but few explanations
      if (ruleIndicators.length > 5 && whyExplanations.length < ruleIndicators.length / 3) {
        return {
          issue: `Found ${ruleIndicators.length} rules but only ${whyExplanations.length} WHY explanations`,
          fix: 'Add *WHY: explanation for each rule to help AI understand intent'
        };
      }
      return null;
    }
  },

  // ============================================
  // LOW CERTAINTY PATTERNS
  // ============================================

  /**
   * Example overload
   * LOW certainty - too many examples waste tokens
   */
  example_overload: {
    id: 'example_overload',
    category: 'efficiency',
    certainty: 'LOW',
    autoFix: false,
    description: 'Too many inline examples',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Count example blocks
      const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
      const exampleSections = (content.match(/##\s+example/gi) || []).length;
      const inlineExamples = (content.match(/<(?:good-)?example>/gi) || []).length;

      const totalExamples = codeBlocks + exampleSections + inlineExamples;

      if (totalExamples > 10) {
        return {
          issue: `Found ${totalExamples} examples/code blocks (may be excessive)`,
          fix: 'Consider moving examples to separate docs and linking'
        };
      }
      return null;
    }
  },

  /**
   * Deep nesting in structure
   * LOW certainty - deeply nested content is hard to scan
   */
  deep_nesting: {
    id: 'deep_nesting',
    category: 'quality',
    certainty: 'LOW',
    autoFix: false,
    description: 'Content has deep nesting (>3 levels)',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check header nesting depth
      const h4Plus = (content.match(/^####/gm) || []).length;
      const h5Plus = (content.match(/^#####/gm) || []).length;

      // Check list nesting
      const deepLists = (content.match(/^(?:\s{8,}[-*]|\t{3,}[-*])/gm) || []).length;

      if (h5Plus > 2 || deepLists > 5 || (h4Plus > 5 && deepLists > 3)) {
        return {
          issue: 'Content has deep nesting structure',
          fix: 'Flatten hierarchy for easier scanning'
        };
      }
      return null;
    }
  },

  // ============================================
  // CROSS-PLATFORM PATTERNS
  // ============================================

  /**
   * Hardcoded state directory
   * HIGH certainty - breaks cross-platform compatibility
   */
  hardcoded_state_dir: {
    id: 'hardcoded_state_dir',
    category: 'cross-platform',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Hardcoded .claude/ directory (breaks OpenCode/Codex)',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Look for hardcoded .claude/ that should be ${STATE_DIR}/
      const hasHardcodedClaude = /\.claude\//.test(content);
      // Check if properly using platform-aware reference
      const usesPlatformAware = /\$\{?STATE_DIR\}?|\.opencode\/|\.codex\/|Platform-aware/i.test(content);

      if (hasHardcodedClaude && !usesPlatformAware) {
        return {
          issue: 'Hardcoded .claude/ directory path without cross-platform note',
          fix: 'Use ${STATE_DIR}/ or document platform variations (.claude/, .opencode/, .codex/)'
        };
      }
      return null;
    }
  },

  /**
   * Claude-only terminology
   * MEDIUM certainty - should be tool-agnostic where possible
   */
  claude_only_terminology: {
    id: 'claude_only_terminology',
    category: 'cross-platform',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Uses Claude-specific terminology without alternatives',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check for Claude-specific terms without alternatives
      const claudeOnly = (content.match(/\bClaude Code\b/g) || []).length;
      const hasAlternatives = /OpenCode|Codex|AI assistant|AI coding assistant/i.test(content);

      if (claudeOnly > 3 && !hasAlternatives) {
        return {
          issue: 'Uses "Claude Code" frequently without mentioning alternatives',
          fix: 'Use "AI assistant" or mention OpenCode/Codex alternatives for cross-platform support'
        };
      }
      return null;
    }
  },

  /**
   * Missing file type recognition
   * MEDIUM certainty - should mention AGENTS.md alternative
   */
  missing_agents_md_mention: {
    id: 'missing_agents_md_mention',
    category: 'cross-platform',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'File is CLAUDE.md but does not mention AGENTS.md compatibility',
    check: (content, context = {}) => {
      if (!content || typeof content !== 'string') return null;

      // Only applies to CLAUDE.md files
      if (context.fileName && !context.fileName.includes('CLAUDE.md')) return null;

      const mentionsAgentsMd = /AGENTS\.md/i.test(content);

      if (!mentionsAgentsMd) {
        return {
          issue: 'CLAUDE.md does not mention AGENTS.md compatibility',
          fix: 'Note: This file may also work as AGENTS.md for OpenCode/Codex'
        };
      }
      return null;
    }
  },

  // ============================================
  // CONTENT QUALITY PATTERNS (from Claude Code Best Practices)
  // ============================================

  /**
   * Includes obvious information Claude can infer
   * MEDIUM certainty - wastes tokens on things Claude knows
   * Source: https://code.claude.com/docs/en/best-practices
   */
  includes_obvious_information: {
    id: 'includes_obvious_information',
    category: 'efficiency',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Includes information Claude can infer from reading code',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Patterns that suggest obvious/inferable content
      const obviousPatterns = [
        /\bthis is a (?:node|python|rust|go|java)\s+project\b/i,
        /\bwe use (?:npm|yarn|pnpm|pip|cargo)\b/i,
        /\bthe (?:src|lib|test) folder contains\b/i,
        /\bstandard (?:REST|HTTP|JSON) conventions\b/i,
        /\bfollow (?:PEP|ESLint|standard) (?:style|conventions)\b/i,
        /\bwrite clean code\b/i,
        /\buse meaningful variable names\b/i,
        /\bcomment your code\b/i,
        /\bhandle errors appropriately\b/i
      ];

      const found = [];
      for (const pattern of obviousPatterns) {
        if (pattern.test(content)) {
          found.push(pattern.source.slice(2, 40) + '...');
        }
      }

      if (found.length >= 3) {
        return {
          issue: `Contains ${found.length} obvious/inferable items that waste tokens`,
          fix: 'Remove information Claude can infer from code. Focus on what Claude CANNOT guess.',
          details: found.slice(0, 3)
        };
      }
      return null;
    }
  },

  /**
   * Missing emphasis markers on important rules
   * MEDIUM certainty - IMPORTANT/MUST improves adherence
   * Source: https://code.claude.com/docs/en/best-practices
   */
  missing_emphasis_markers: {
    id: 'missing_emphasis_markers',
    category: 'quality',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Critical rules lack emphasis markers (IMPORTANT, MUST, CRITICAL)',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Count strong rules without emphasis
      const strongRules = (content.match(/\b(?:never|always|required|must not)\b/gi) || []).length;
      const emphasisMarkers = (content.match(/\b(?:IMPORTANT|CRITICAL|MUST|YOU MUST|NEVER)\b/g) || []).length;

      // If many rules but few emphasis markers
      if (strongRules > 5 && emphasisMarkers < 2) {
        return {
          issue: `Found ${strongRules} strong rules but only ${emphasisMarkers} emphasis markers`,
          fix: 'Add IMPORTANT: or MUST prefix to critical rules to improve adherence'
        };
      }
      return null;
    }
  },

  /**
   * Self-evident practices that waste tokens
   * LOW certainty - generic advice Claude already follows
   * Source: https://code.claude.com/docs/en/best-practices
   */
  self_evident_practices: {
    id: 'self_evident_practices',
    category: 'efficiency',
    certainty: 'LOW',
    autoFix: false,
    description: 'Contains self-evident practices Claude already follows',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const selfEvident = [
        /\bwrite tests\b/i,
        /\bfollow best practices\b/i,
        /\bbe consistent\b/i,
        /\buse descriptive names\b/i,
        /\bavoid code duplication\b/i,
        /\bkeep functions small\b/i,
        /\bsingle responsibility\b/i,
        /\bDRY principle\b/i
      ];

      let count = 0;
      for (const pattern of selfEvident) {
        if (pattern.test(content)) count++;
      }

      if (count >= 4) {
        return {
          issue: `Contains ${count} self-evident practices that Claude already follows`,
          fix: 'Remove generic best practices. Only document PROJECT-SPECIFIC rules.'
        };
      }
      return null;
    }
  },

  /**
   * File too long causing rule ignorance
   * HIGH certainty - long files cause Claude to miss rules
   * Source: https://code.claude.com/docs/en/best-practices
   */
  file_too_long_rules_ignored: {
    id: 'file_too_long_rules_ignored',
    category: 'efficiency',
    certainty: 'HIGH',
    autoFix: false,
    description: 'File is long enough that rules may be ignored',
    maxLines: 150,
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const lines = content.split('\n').length;
      const ruleCount = (content.match(/\b(?:must|never|always|required|important)\b/gi) || []).length;

      // If file is long AND has many rules, some will be ignored
      if (lines > 150 && ruleCount > 10) {
        return {
          issue: `File has ${lines} lines and ${ruleCount} rules - some rules will likely be ignored`,
          fix: 'If Claude ignores rules despite them being documented, the file is too long. Prune ruthlessly.'
        };
      }
      return null;
    }
  }
};

/**
 * Get all patterns
 * @returns {Object} All project memory patterns
 */
function getAllPatterns() {
  return projectMemoryPatterns;
}

/**
 * Get patterns by certainty level
 * @param {string} certainty - HIGH, MEDIUM, or LOW
 * @returns {Object} Filtered patterns
 */
function getPatternsByCertainty(certainty) {
  const result = {};
  for (const [name, pattern] of Object.entries(projectMemoryPatterns)) {
    if (pattern.certainty === certainty) {
      result[name] = pattern;
    }
  }
  return result;
}

/**
 * Get patterns by category
 * @param {string} category - structure, reference, efficiency, quality, cross-platform
 * @returns {Object} Filtered patterns
 */
function getPatternsByCategory(category) {
  const result = {};
  for (const [name, pattern] of Object.entries(projectMemoryPatterns)) {
    if (pattern.category === category) {
      result[name] = pattern;
    }
  }
  return result;
}

/**
 * Get auto-fixable patterns
 * @returns {Object} Patterns with autoFix: true
 */
function getAutoFixablePatterns() {
  const result = {};
  for (const [name, pattern] of Object.entries(projectMemoryPatterns)) {
    if (pattern.autoFix) {
      result[name] = pattern;
    }
  }
  return result;
}

module.exports = {
  projectMemoryPatterns,
  getAllPatterns,
  getPatternsByCertainty,
  getPatternsByCategory,
  getAutoFixablePatterns
};
