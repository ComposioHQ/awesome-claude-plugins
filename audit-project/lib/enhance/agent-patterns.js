/**
 * Agent Prompt Patterns
 * Detection patterns for agent prompt engineering best practices
 *
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Agent prompt patterns with certainty levels
 * Following the plugin-patterns model
 */
const agentPatterns = {
  /**
   * Missing YAML frontmatter
   * HIGH certainty - always fixable
   */
  missing_frontmatter: {
    id: 'missing_frontmatter',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Agent prompt missing YAML frontmatter (---...---)',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check if frontmatter exists
      const hasFrontmatter = content.trim().startsWith('---');

      if (!hasFrontmatter) {
        return {
          issue: 'Missing YAML frontmatter',
          fix: 'Add frontmatter with name, description, tools, model'
        };
      }
      return null;
    }
  },

  /**
   * Missing name field in frontmatter
   * HIGH certainty - requires manual fix (name is context-dependent)
   */
  missing_name: {
    id: 'missing_name',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Frontmatter missing "name" field',
    check: (frontmatter) => {
      if (!frontmatter || typeof frontmatter !== 'object') return null;

      if (!frontmatter.name || (typeof frontmatter.name === 'string' && frontmatter.name.trim() === '')) {
        return {
          issue: 'Frontmatter missing "name" field',
          fix: 'Add "name" field to frontmatter'
        };
      }
      return null;
    }
  },

  /**
   * Missing description field in frontmatter
   * HIGH certainty - requires manual fix (description is context-dependent)
   */
  missing_description: {
    id: 'missing_description',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Frontmatter missing "description" field',
    check: (frontmatter) => {
      if (!frontmatter || typeof frontmatter !== 'object') return null;

      if (!frontmatter.description || (typeof frontmatter.description === 'string' && frontmatter.description.trim() === '')) {
        return {
          issue: 'Frontmatter missing "description" field',
          fix: 'Add "description" field to frontmatter'
        };
      }
      return null;
    }
  },

  /**
   * Missing role section
   * HIGH certainty - should have clear role definition
   */
  missing_role: {
    id: 'missing_role',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: true,
    description: 'No role section ("You are..." or "## Role")',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Look for role indicators (various forms)
      const hasYouAre = /you are/i.test(content);
      const hasYouPerform = /you (?:perform|handle|execute|do|manage|coordinate|analyze|review|create|design|implement|validate|update|check|monitor)/i.test(content);
      const hasRoleSection = /##\s+(?:your\s+)?role|\*\*(?:your\s+)?role\*\*/i.test(content);

      if (!hasYouAre && !hasYouPerform && !hasRoleSection) {
        return {
          issue: 'Missing role definition',
          fix: 'Add role section explaining agent purpose'
        };
      }
      return null;
    }
  },

  /**
   * Missing output format specification
   * HIGH certainty - agents should specify output format
   */
  missing_output_format: {
    id: 'missing_output_format',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: false,
    description: 'No output format specification',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Look for output format indicators
      const hasOutputFormat = /##\s+output\s+format/i.test(content);
      const hasFormatSection = /##\s+format/i.test(content);
      const hasResponseFormat = /##\s+response/i.test(content);

      if (!hasOutputFormat && !hasFormatSection && !hasResponseFormat) {
        return {
          issue: 'Missing output format specification',
          fix: 'Add section specifying expected output format'
        };
      }
      return null;
    }
  },

  /**
   * Missing constraints section
   * HIGH certainty - agents should have clear constraints
   */
  missing_constraints: {
    id: 'missing_constraints',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: false,
    description: 'No constraints section',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Look for constraints indicators (H2 or H3)
      const hasConstraints = /#{2,3}\s+constraints/i.test(content);
      const hasDontSection = /#{2,3}\s+(?:what\s+)?(?:this\s+agent\s+)?(?:you\s+)?(?:must\s+)?not\s+do/i.test(content);
      const hasRulesSection = /#{2,3}\s+rules/i.test(content);
      const hasWorkflowGates = /#{2,3}\s+workflow\s+gates/i.test(content);

      if (!hasConstraints && !hasDontSection && !hasRulesSection && !hasWorkflowGates) {
        return {
          issue: 'Missing constraints section',
          fix: 'Add section defining agent limitations and boundaries'
        };
      }
      return null;
    }
  },

  /**
   * Unrestricted tools in frontmatter
   * HIGH certainty - no tools field means all tools allowed
   */
  unrestricted_tools: {
    id: 'unrestricted_tools',
    category: 'tool',
    certainty: 'HIGH',
    autoFix: false,
    description: 'No "tools" field in frontmatter (all tools allowed)',
    check: (frontmatter) => {
      if (!frontmatter || typeof frontmatter !== 'object') return null;

      if (!frontmatter.tools) {
        return {
          issue: 'No tools restriction - agent has access to all tools',
          fix: 'Add "tools" field to frontmatter with specific tools needed'
        };
      }
      return null;
    }
  },

  /**
   * Unrestricted Bash tool
   * HIGH certainty - Bash without restrictions is dangerous
   */
  unrestricted_bash: {
    id: 'unrestricted_bash',
    category: 'tool',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Has "Bash" without restrictions (should be "Bash(git:*)" etc)',
    check: (frontmatter) => {
      if (!frontmatter || typeof frontmatter !== 'object') return null;

      if (frontmatter.tools) {
        const toolsArray = Array.isArray(frontmatter.tools)
          ? frontmatter.tools
          : frontmatter.tools.split(',').map(t => t.trim());

        const hasUnrestrictedBash = toolsArray.some(t =>
          t === 'Bash' || t === 'bash'
        );

        if (hasUnrestrictedBash) {
          return {
            issue: 'Unrestricted Bash access',
            fix: 'Replace "Bash" with "Bash(git:*)" or specific scope'
          };
        }
      }
      return null;
    }
  },

  /**
   * Missing XML structure for complex data
   * MEDIUM certainty - beneficial for structured prompts
   */
  missing_xml_structure: {
    id: 'missing_xml_structure',
    category: 'xml',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Could benefit from XML tags for structure',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check if content is complex enough to benefit from XML
      const sectionCount = (content.match(/##\s+/g) || []).length;
      const hasLists = /^\s*[-*]\s+/m.test(content);
      const hasCodeBlocks = /```/g.test(content);

      // If complex but no XML tags
      if (sectionCount >= 5 || (hasLists && hasCodeBlocks)) {
        const hasXML = /<\w+>/.test(content);

        if (!hasXML) {
          return {
            issue: 'Complex prompt without XML structure',
            fix: 'Consider using XML tags for key sections (e.g., <rules>, <examples>)'
          };
        }
      }
      return null;
    }
  },

  /**
   * Unnecessary step-by-step reasoning
   * MEDIUM certainty - step-by-step on simple tasks
   */
  unnecessary_cot: {
    id: 'unnecessary_cot',
    category: 'cot',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Step-by-step reasoning on simple tasks',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Look for step-by-step language
      const hasStepByStep = /step[- ]by[- ]step/i.test(content);
      const hasThinkingTags = /<thinking>/i.test(content);

      // Check if task is simple (short prompt, few sections)
      const wordCount = content.split(/\s+/).length;
      const sectionCount = (content.match(/##\s+/g) || []).length;

      if ((hasStepByStep || hasThinkingTags) && wordCount < 500 && sectionCount < 4) {
        return {
          issue: 'Unnecessary chain-of-thought for simple task',
          fix: 'Remove step-by-step instructions for straightforward operations'
        };
      }
      return null;
    }
  },

  /**
   * Missing chain-of-thought for complex reasoning
   * MEDIUM certainty - complex tasks benefit from CoT
   */
  missing_cot: {
    id: 'missing_cot',
    category: 'cot',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Complex reasoning without thinking guidance',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check if task is complex
      const wordCount = content.split(/\s+/).length;
      const sectionCount = (content.match(/##\s+/g) || []).length;
      const hasAnalysis = /analy[sz]e|evaluate|assess|review/i.test(content);

      // Look for CoT indicators
      const hasStepByStep = /step[- ]by[- ]step/i.test(content);
      const hasThinkingTags = /<thinking>/i.test(content);
      const hasReasoningGuidance = /reasoning|think\s+through/i.test(content);

      if (wordCount > 1000 && sectionCount >= 5 && hasAnalysis) {
        if (!hasStepByStep && !hasThinkingTags && !hasReasoningGuidance) {
          return {
            issue: 'Complex task without reasoning guidance',
            fix: 'Add chain-of-thought instructions or <thinking> tags'
          };
        }
      }
      return null;
    }
  },

  /**
   * Suboptimal example count
   * LOW certainty - 2-5 examples is generally optimal
   */
  example_count_suboptimal: {
    id: 'example_count_suboptimal',
    category: 'example',
    certainty: 'LOW',
    autoFix: false,
    description: 'Not 2-5 examples',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Count example sections
      const exampleCount = (content.match(/##\s+example/gi) || []).length;
      const goodExample = (content.match(/<good[- ]?example>/gi) || []).length;
      const badExample = (content.match(/<bad[- ]?example>/gi) || []).length;

      const totalExamples = exampleCount + goodExample + badExample;

      if (totalExamples > 0 && (totalExamples < 2 || totalExamples > 5)) {
        return {
          issue: `Found ${totalExamples} examples (optimal: 2-5)`,
          fix: totalExamples < 2
            ? 'Consider adding more examples for clarity'
            : 'Consider reducing examples to avoid token bloat'
        };
      }
      return null;
    }
  },

  /**
   * Vague instructions
   * MEDIUM certainty - fuzzy language reduces effectiveness
   */
  vague_instructions: {
    id: 'vague_instructions',
    category: 'anti-pattern',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Fuzzy language like "usually", "sometimes"',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Look for vague words
      const vagueWords = [
        'usually', 'sometimes', 'often', 'rarely', 'maybe',
        'might', 'could', 'should probably', 'try to',
        'as much as possible', 'if possible'
      ];

      const found = [];
      for (const word of vagueWords) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        if (regex.test(content)) {
          found.push(word);
        }
      }

      if (found.length > 3) {
        return {
          issue: `Found vague language: ${found.slice(0, 3).join(', ')}...`,
          fix: 'Replace fuzzy language with clear, definitive instructions'
        };
      }
      return null;
    }
  },

  /**
   * Prompt bloat
   * LOW certainty - long prompts use more tokens
   */
  prompt_bloat: {
    id: 'prompt_bloat',
    category: 'anti-pattern',
    certainty: 'LOW',
    autoFix: false,
    description: 'Token count > 2000',
    maxTokens: 2000,
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Rough token estimate (1 token ≈ 4 characters)
      const estimatedTokens = Math.ceil(content.length / 4);

      if (estimatedTokens > 2000) {
        return {
          issue: `Prompt ~${estimatedTokens} tokens (max recommended: 2000)`,
          fix: 'Simplify prompt, remove redundant sections, or use XML for compression'
        };
      }
      return null;
    }
  },

  // ============================================
  // CROSS-PLATFORM COMPATIBILITY PATTERNS
  // ============================================

  /**
   * Hardcoded .claude/ state directory
   * HIGH certainty - breaks OpenCode/Codex
   */
  hardcoded_claude_dir: {
    id: 'hardcoded_claude_dir',
    category: 'cross-platform',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Hardcoded .claude/ directory (breaks OpenCode/Codex)',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Look for hardcoded .claude/ references
      const hasHardcoded = /\.claude\//.test(content);
      // Exclude if using AI_STATE_DIR
      const usesEnvVar = /AI_STATE_DIR|\$\{.*STATE.*\}/i.test(content);

      if (hasHardcoded && !usesEnvVar) {
        return {
          issue: 'Hardcoded .claude/ directory path',
          fix: 'Use AI_STATE_DIR env var or platform detection for cross-platform support'
        };
      }
      return null;
    }
  },

  /**
   * CLAUDE.md reference without AGENTS.md
   * MEDIUM certainty - OpenCode/Codex use AGENTS.md
   */
  claude_md_reference: {
    id: 'claude_md_reference',
    category: 'cross-platform',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'References CLAUDE.md without also checking AGENTS.md',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const hasClaudeMd = /CLAUDE\.md/i.test(content);
      const hasAgentsMd = /AGENTS\.md/i.test(content);

      // Only flag if mentions CLAUDE.md but not AGENTS.md
      if (hasClaudeMd && !hasAgentsMd) {
        return {
          issue: 'References CLAUDE.md without AGENTS.md',
          fix: 'Also check for AGENTS.md (used by OpenCode/Codex)'
        };
      }
      return null;
    }
  },

  /**
   * Missing XML for cross-model compatibility
   * LOW certainty - XML helps both Claude and GPT-4
   */
  no_xml_for_data: {
    id: 'no_xml_for_data',
    category: 'cross-platform',
    certainty: 'LOW',
    autoFix: false,
    description: 'Data blocks without XML tags (helps both Claude and GPT-4)',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check if has code blocks or lists but no XML
      const hasCodeBlocks = /```[\s\S]+?```/.test(content);
      const hasLists = /^[-*]\s+.+$/m.test(content);
      const hasXML = /<\w+>[\s\S]*?<\/\w+>/.test(content);
      const sectionCount = (content.match(/^##\s+/gm) || []).length;

      // Complex content without XML
      if ((hasCodeBlocks || hasLists) && sectionCount >= 4 && !hasXML) {
        return {
          issue: 'Complex content without XML tags',
          fix: 'Wrap data blocks in XML tags (e.g., <context>, <rules>) for cross-model compatibility'
        };
      }
      return null;
    }
  }
};

/**
 * Get all patterns
 * @returns {Object} All agent patterns
 */
function getAllPatterns() {
  return agentPatterns;
}

/**
 * Get patterns by certainty level
 * @param {string} certainty - HIGH, MEDIUM, or LOW
 * @returns {Object} Filtered patterns
 */
function getPatternsByCertainty(certainty) {
  const result = {};
  for (const [name, pattern] of Object.entries(agentPatterns)) {
    if (pattern.certainty === certainty) {
      result[name] = pattern;
    }
  }
  return result;
}

/**
 * Get patterns by category
 * @param {string} category - structure, tool, xml, cot, example, anti-pattern
 * @returns {Object} Filtered patterns
 */
function getPatternsByCategory(category) {
  const result = {};
  for (const [name, pattern] of Object.entries(agentPatterns)) {
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
  for (const [name, pattern] of Object.entries(agentPatterns)) {
    if (pattern.autoFix) {
      result[name] = pattern;
    }
  }
  return result;
}

module.exports = {
  agentPatterns,
  getAllPatterns,
  getPatternsByCertainty,
  getPatternsByCategory,
  getAutoFixablePatterns
};
