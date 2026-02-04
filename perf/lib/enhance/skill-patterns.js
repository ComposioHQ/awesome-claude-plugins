/**
 * Skill patterns for /enhance.
 */

const skillPatterns = {
  missing_frontmatter: {
    id: 'missing_frontmatter',
    certainty: 'HIGH',
    check(content) {
      if (!content || !content.trim().startsWith('---')) {
        return { issue: 'Missing YAML frontmatter in SKILL.md' };
      }
      return null;
    }
  },
  missing_name: {
    id: 'missing_name',
    certainty: 'HIGH',
    check(frontmatter) {
      if (!frontmatter || !frontmatter.name) {
        return { issue: 'Missing name in SKILL.md frontmatter' };
      }
      return null;
    }
  },
  missing_description: {
    id: 'missing_description',
    certainty: 'HIGH',
    check(frontmatter) {
      if (!frontmatter || !frontmatter.description) {
        return { issue: 'Missing description in SKILL.md frontmatter' };
      }
      return null;
    }
  },
  missing_trigger_phrase: {
    id: 'missing_trigger_phrase',
    certainty: 'MEDIUM',
    autoFix: true,
    check(frontmatter) {
      if (!frontmatter || !frontmatter.description) return null;
      if (!/use when user asks/i.test(frontmatter.description)) {
        return { issue: 'Description missing "Use when user asks" trigger phrase' };
      }
      return null;
    }
  },

  // ============================================
  // PATTERNS FROM CLAUDE CODE BEST PRACTICES
  // Source: https://code.claude.com/docs/en/best-practices
  // ============================================

  /**
   * Side-effect skill without disable-model-invocation
   * HIGH certainty - skills with side effects should be manual-only
   */
  side_effect_without_disable: {
    id: 'side_effect_without_disable',
    certainty: 'HIGH',
    check(frontmatter, content) {
      if (!frontmatter) return null;

      // Check if skill has side effects indicators
      const sideEffectPatterns = [
        /\b(?:deploy|ship|push|merge|commit|delete|remove|publish)\b/i,
        /\bgit\s+(?:push|commit|reset)\b/i,
        /\bcreate\s+(?:PR|pull\s+request|issue)\b/i,
        /\bsend\s+(?:email|notification|message)\b/i,
        /\brun\s+(?:migration|deploy)\b/i
      ];

      const hasSideEffects = sideEffectPatterns.some(p => {
        return p.test(frontmatter.name || '') ||
               p.test(frontmatter.description || '') ||
               (content && p.test(content));
      });

      if (hasSideEffects && frontmatter['disable-model-invocation'] !== true) {
        return {
          issue: 'Skill with side effects should have disable-model-invocation: true',
          fix: 'Add "disable-model-invocation: true" to frontmatter for manual-only invocation'
        };
      }
      return null;
    }
  },

  /**
   * Missing context: fork for isolated execution
   * MEDIUM certainty - skills that read many files should fork context
   */
  missing_context_fork: {
    id: 'missing_context_fork',
    certainty: 'MEDIUM',
    check(frontmatter, content) {
      if (!frontmatter) return null;

      // Check if skill does extensive exploration
      const explorationPatterns = [
        /\b(?:search|explore|analyze|scan)\s+(?:the\s+)?(?:codebase|repo|project)\b/i,
        /\bread\s+(?:all|many|multiple)\s+files\b/i,
        /\b(?:deep|thorough)\s+(?:analysis|review|investigation)\b/i
      ];

      const doesExploration = explorationPatterns.some(p => {
        return p.test(frontmatter.description || '') ||
               (content && p.test(content));
      });

      if (doesExploration && frontmatter.context !== 'fork') {
        return {
          issue: 'Exploration skill should use context: fork to keep main context clean',
          fix: 'Add "context: fork" to run in isolated subagent context'
        };
      }
      return null;
    }
  },

  /**
   * Missing allowed-tools restriction
   * MEDIUM certainty - skills should specify allowed tools
   */
  missing_allowed_tools: {
    id: 'missing_allowed_tools',
    certainty: 'MEDIUM',
    check(frontmatter) {
      if (!frontmatter) return null;

      // Only flag if skill has context: fork (subagent execution)
      if (frontmatter.context !== 'fork') return null;

      if (!frontmatter['allowed-tools']) {
        return {
          issue: 'Forked skill missing allowed-tools restriction',
          fix: 'Add "allowed-tools: Read, Grep, Glob" to scope subagent capabilities'
        };
      }
      return null;
    }
  }
};

module.exports = {
  skillPatterns
};
