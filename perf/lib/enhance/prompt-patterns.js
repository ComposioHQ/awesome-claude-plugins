/**
 * Prompt Patterns
 * Detection patterns for general prompt engineering best practices
 *
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Estimate tokens from text (1 token ~ 4 characters)
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Prompt patterns with certainty levels
 * Focuses on prompt quality (not agent-specific frontmatter/config)
 *
 * Categories:
 * - clarity: Clear, specific instructions
 * - structure: XML tags, sections, organization
 * - examples: Few-shot examples
 * - context: Context and motivation
 * - output: Output format specification
 * - anti-pattern: Common mistakes
 */
const promptPatterns = {
  // ============================================
  // CLARITY PATTERNS (HIGH certainty)
  // ============================================

  /**
   * Vague instructions without specifics
   * HIGH certainty - fuzzy language reduces effectiveness
   */
  vague_instructions: {
    id: 'vague_instructions',
    category: 'clarity',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Instructions use vague language like "usually", "sometimes", "try to"',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const vaguePatterns = [
        { pattern: /\busually\b/gi, word: 'usually' },
        { pattern: /\bsometimes\b/gi, word: 'sometimes' },
        { pattern: /\boften\b/gi, word: 'often' },
        { pattern: /\brarely\b/gi, word: 'rarely' },
        { pattern: /\bmaybe\b/gi, word: 'maybe' },
        { pattern: /\bmight\b/gi, word: 'might' },
        { pattern: /\bshould probably\b/gi, word: 'should probably' },
        { pattern: /\btry to\b/gi, word: 'try to' },
        { pattern: /\bas much as possible\b/gi, word: 'as much as possible' },
        { pattern: /\bif possible\b/gi, word: 'if possible' },
        { pattern: /\bwhen appropriate\b/gi, word: 'when appropriate' },
        { pattern: /\bas needed\b/gi, word: 'as needed' }
      ];

      const found = [];
      for (const { pattern, word } of vaguePatterns) {
        const matches = content.match(pattern);
        if (matches) {
          found.push({ word, count: matches.length });
        }
      }

      const totalCount = found.reduce((sum, f) => sum + f.count, 0);

      if (totalCount >= 4) {
        const examples = found.slice(0, 3).map(f => `"${f.word}" (${f.count}x)`);
        return {
          issue: `Found ${totalCount} vague terms: ${examples.join(', ')}`,
          fix: 'Replace vague language with specific, deterministic instructions'
        };
      }
      return null;
    }
  },

  /**
   * Negative-only constraints without alternatives
   * HIGH certainty - "don't X" less effective than "do Y instead"
   */
  negative_only_constraints: {
    id: 'negative_only_constraints',
    category: 'clarity',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Uses "don\'t", "never", "do not" without stating what TO do',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Find negative constraints
      const negativePatterns = [
        /\bdon['']t\s+\w+/gi,
        /\bnever\s+\w+/gi,
        /\bdo not\s+\w+/gi,
        /\bavoid\s+\w+ing\b/gi,
        /\brefrain from\b/gi
      ];

      const negatives = [];
      for (const pattern of negativePatterns) {
        const matches = content.match(pattern);
        if (matches) {
          negatives.push(...matches.slice(0, 2));
        }
      }

      // Check if there are positive alternatives nearby
      const positiveIndicators = /\binstead\b|\brather\b|\buse\b.*\binstead\b/gi;
      const hasAlternatives = positiveIndicators.test(content);

      if (negatives.length >= 5 && !hasAlternatives) {
        return {
          issue: `${negatives.length} negative constraints without positive alternatives`,
          fix: 'For each "don\'t X", also state what TO do instead',
          details: negatives.slice(0, 5)
        };
      }
      return null;
    }
  },

  /**
   * Missing explicit output format
   * HIGH certainty - prompts should specify expected output
   */
  missing_output_format: {
    id: 'missing_output_format',
    category: 'output',
    certainty: 'HIGH',
    autoFix: true,
    description: 'No clear output format specification',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Skip workflow orchestrators that spawn agents rather than produce output
      const isOrchestrator = /##\s*Phase\s+\d+|Task\(\{|spawn.*agent|subagent_type|await Task\(/i.test(content);
      if (isOrchestrator) return null;

      // Check for output format indicators
      const outputIndicators = [
        /##\s*output\s*format/i,
        /##\s*response\s*format/i,
        /##\s*format/i,
        /\brespond\s+(?:with|in)\s+(?:JSON|XML|markdown|YAML)/i,
        /\boutput\s*:\s*```/i,
        /<output_format>/i,
        /<response_format>/i,
        /your\s+(?:response|output)\s+should\s+(?:be|follow)/i
      ];

      for (const pattern of outputIndicators) {
        if (pattern.test(content)) {
          return null;
        }
      }

      // Only flag if prompt is substantial enough to warrant format spec
      const tokens = estimateTokens(content);
      if (tokens > 200) {
        return {
          issue: 'No output format specification found',
          fix: 'Add "## Output Format" section or <output_format> tags specifying expected response structure'
        };
      }
      return null;
    }
  },

  /**
   * Aggressive emphasis (CAPS, excessive emphasis)
   * HIGH certainty - overuse triggers over-indexing
   */
  aggressive_emphasis: {
    id: 'aggressive_emphasis',
    category: 'clarity',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Excessive CAPS or emphasis markers that may cause over-indexing',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Skip workflow enforcement contexts where emphasis is intentional
      const hasWorkflowGates = /WORKFLOW\s+(?:ENFORCEMENT|GATES)|MANDATORY.*GATES|agents?\s+MUST\s+NOT/i.test(content);
      const isWorkflowDoc = /##\s*Phase\s+\d+|Task\(\{|subagent_type/i.test(content);

      // Find CAPS words (3+ chars, excluding headings and code)
      const capsPattern = /\b[A-Z]{3,}\b/g;
      const capsMatches = content.match(capsPattern) || [];

      // Filter out common acceptable caps (acronyms, code, workflow terms)
      const acceptableCaps = ['API', 'JSON', 'XML', 'HTML', 'CSS', 'URL', 'HTTP', 'HTTPS', 'SQL', 'CLI', 'SDK', 'JWT', 'UUID', 'REST', 'YAML', 'EOF', 'TODO', 'FIXME', 'NOTE', 'README', 'MCP', 'CRITICAL', 'MUST', 'NOT', 'STOP', 'MANDATORY', 'SKIP'];
      const aggressiveCaps = capsMatches.filter(c => !acceptableCaps.includes(c));

      // Check for excessive exclamation marks
      const exclamations = (content.match(/!{2,}/g) || []).length;

      // Check for aggressive phrases
      const aggressivePhrases = [
        /\bABSOLUTELY\b/gi,
        /\bEXTREMELY\s+IMPORTANT\b/gi
      ];

      let aggressiveCount = aggressiveCaps.length + exclamations;
      for (const pattern of aggressivePhrases) {
        const matches = content.match(pattern);
        if (matches) aggressiveCount += matches.length;
      }

      // Higher threshold for workflow docs (intentional emphasis for gates)
      const threshold = (hasWorkflowGates || isWorkflowDoc) ? 50 : 5;

      if (aggressiveCount >= threshold) {
        return {
          issue: `${aggressiveCount} instances of aggressive emphasis (CAPS, !!, CRITICAL)`,
          fix: 'Use normal language - models respond well to clear instructions without shouting',
          details: aggressiveCaps.slice(0, 5)
        };
      }
      return null;
    }
  },

  // ============================================
  // STRUCTURE PATTERNS (HIGH/MEDIUM certainty)
  // ============================================

  /**
   * Missing XML structure for complex prompts
   * HIGH certainty - XML helps structure for Claude/GPT
   */
  missing_xml_structure: {
    id: 'missing_xml_structure',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Complex prompt without XML tags for structure',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const tokens = estimateTokens(content);
      const sectionCount = (content.match(/^#{1,6}\s+/gm) || []).length;
      const hasCodeBlocks = /```/.test(content);

      // Complex prompt indicators
      const isComplex = tokens > 800 || (sectionCount >= 6 && hasCodeBlocks);

      // Check for XML tags
      const hasXML = /<[a-z_][a-z0-9_-]*>/i.test(content);

      if (isComplex && !hasXML) {
        return {
          issue: 'Complex prompt without XML structure tags',
          fix: 'Use XML tags like <role>, <constraints>, <examples>, <output_format> for key sections'
        };
      }
      return null;
    }
  },

  /**
   * Inconsistent section formatting
   * MEDIUM certainty - consistency aids parsing
   */
  inconsistent_sections: {
    id: 'inconsistent_sections',
    category: 'structure',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Mixed heading styles or inconsistent section patterns',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check for mixed heading styles
      const h2Count = (content.match(/^##\s+/gm) || []).length;
      const boldHeadingCount = (content.match(/^\*\*[^*]+\*\*\s*$/gm) || []).length;

      if (h2Count >= 2 && boldHeadingCount >= 2) {
        return {
          issue: 'Mixed heading styles (## and **bold**)',
          fix: 'Use consistent heading format throughout the prompt'
        };
      }

      // Check for skipped heading levels
      const headings = content.match(/^(#{1,6})\s+/gm) || [];
      const levels = headings.map(h => h.trim().split(' ')[0].length);

      for (let i = 1; i < levels.length; i++) {
        if (levels[i] - levels[i - 1] > 1) {
          return {
            issue: `Heading level jumps from H${levels[i - 1]} to H${levels[i]}`,
            fix: 'Maintain proper heading hierarchy without skipping levels'
          };
        }
      }

      return null;
    }
  },

  /**
   * Critical info buried in middle
   * MEDIUM certainty - lost-in-the-middle effect
   */
  critical_info_buried: {
    id: 'critical_info_buried',
    category: 'structure',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Important instructions buried in middle of prompt',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length < 20) return null;

      const middleStart = Math.floor(lines.length * 0.3);
      const middleEnd = Math.floor(lines.length * 0.7);
      const middleSection = lines.slice(middleStart, middleEnd).join('\n');

      // Check for critical keywords in middle
      const criticalPatterns = [
        /\b(?:important|critical|must|essential|required|mandatory)\b/gi,
        /\b(?:always|never)\s+\w+/gi,
        /\b(?:warning|caution|note)\s*:/gi
      ];

      let criticalInMiddle = 0;
      for (const pattern of criticalPatterns) {
        const matches = middleSection.match(pattern);
        if (matches) criticalInMiddle += matches.length;
      }

      if (criticalInMiddle >= 5) {
        return {
          issue: `${criticalInMiddle} critical instructions in the middle 40% of prompt`,
          fix: 'Move critical instructions to the beginning or end (lost-in-the-middle effect)'
        };
      }
      return null;
    }
  },

  // ============================================
  // EXAMPLE PATTERNS (HIGH/MEDIUM certainty)
  // ============================================

  /**
   * No examples in complex prompt
   * HIGH certainty - few-shot improves accuracy
   */
  missing_examples: {
    id: 'missing_examples',
    category: 'examples',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Complex prompt without examples (few-shot)',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const tokens = estimateTokens(content);

      // Skip if prompt is simple
      if (tokens < 300) return null;

      // Skip workflow orchestrators and command files
      const isOrchestrator = /##\s*Phase\s+\d+|Task\(\{|spawn.*agent|subagent_type/i.test(content);
      if (isOrchestrator) return null;

      // Check for example indicators
      const exampleIndicators = [
        /##\s*example/i,
        /<example>/i,
        /<good[_-]?example>/i,
        /<bad[_-]?example>/i,
        /\bfor example\b/i,
        /\be\.g\.\b/i,
        /\bsample\s+(?:input|output|response)/i,
        /input:\s*\n.{1,500}\noutput:/is
      ];

      for (const pattern of exampleIndicators) {
        if (pattern.test(content)) {
          return null;
        }
      }

      // Check if it's asking for specific format
      const needsExamples = /\bformat\b|\bjson\b|\bxml\b|\bstructured\b/i.test(content);

      if (needsExamples) {
        return {
          issue: 'Complex prompt with format requirements but no examples',
          fix: 'Add 2-5 few-shot examples showing expected input/output format'
        };
      }
      return null;
    }
  },

  /**
   * Example count not optimal (2-5 is ideal)
   * MEDIUM certainty - too few or too many examples
   */
  suboptimal_example_count: {
    id: 'suboptimal_example_count',
    category: 'examples',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Example count outside optimal 2-5 range',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Count examples
      const exampleSections = (content.match(/##\s*example/gi) || []).length;
      const goodExamples = (content.match(/<good[_-]?example>/gi) || []).length;
      const badExamples = (content.match(/<bad[_-]?example>/gi) || []).length;
      const exampleTags = (content.match(/<example>/gi) || []).length;

      const totalExamples = exampleSections + goodExamples + badExamples + exampleTags;

      if (totalExamples === 0) return null; // Handled by missing_examples

      if (totalExamples === 1) {
        return {
          issue: 'Only 1 example (optimal: 2-5)',
          fix: 'Add at least one more example - single examples may not demonstrate patterns effectively'
        };
      }

      if (totalExamples > 7) {
        return {
          issue: `${totalExamples} examples (optimal: 2-5)`,
          fix: 'Consider reducing examples to avoid token bloat - keep the most representative ones'
        };
      }

      return null;
    }
  },

  /**
   * Examples without clear good/bad distinction
   * MEDIUM certainty - showing both patterns helps
   */
  examples_without_contrast: {
    id: 'examples_without_contrast',
    category: 'examples',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Examples lack good/bad contrast for pattern learning',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check if has examples
      const hasExamples = /<example>|##\s*example/i.test(content);
      if (!hasExamples) return null;

      // Check for contrast indicators
      const hasGood = /<good[_-]?example>|\bgood example\b|\bcorrect\b/i.test(content);
      const hasBad = /<bad[_-]?example>|\bbad example\b|\bincorrect\b|\bwrong\b/i.test(content);

      // Count total examples
      const exampleCount = (content.match(/<example>|##\s*example/gi) || []).length;

      if (exampleCount >= 3 && !hasGood && !hasBad) {
        return {
          issue: 'Multiple examples without good/bad distinction',
          fix: 'Label examples as good/bad or correct/incorrect to clarify expected patterns'
        };
      }
      return null;
    }
  },

  // ============================================
  // CONTEXT PATTERNS (MEDIUM certainty)
  // ============================================

  /**
   * Missing context/motivation for instructions
   * MEDIUM certainty - "why" improves compliance
   */
  missing_context_why: {
    id: 'missing_context_why',
    category: 'context',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Instructions without explanation of why they matter',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const tokens = estimateTokens(content);
      if (tokens < 400) return null;

      // Count imperatives/rules
      const rulePatterns = [
        /\b(?:must|should|always|never)\s+\w+/gi,
        /\bdo not\b/gi,
        /\b(?:required|mandatory)\b/gi
      ];

      let ruleCount = 0;
      for (const pattern of rulePatterns) {
        const matches = content.match(pattern);
        if (matches) ruleCount += matches.length;
      }

      // Check for "why" explanations
      const whyPatterns = [
        /\bbecause\b/gi,
        /\bsince\b/gi,
        /\bthis (?:is|ensures?|prevents?|helps?)/gi,
        /\bto (?:ensure|prevent|avoid|maintain)/gi,
        /\bwhy:\s/gi,
        /\*why\*/i
      ];

      let whyCount = 0;
      for (const pattern of whyPatterns) {
        const matches = content.match(pattern);
        if (matches) whyCount += matches.length;
      }

      // Ratio check: should have some explanation for rules
      if (ruleCount >= 8 && whyCount < ruleCount * 0.3) {
        return {
          issue: `${ruleCount} rules but few explanations (${whyCount} "why" phrases)`,
          fix: 'Add context explaining WHY instructions matter (improves compliance)'
        };
      }
      return null;
    }
  },

  /**
   * Missing instruction hierarchy/priority
   * MEDIUM certainty - helps with conflicting instructions
   */
  missing_instruction_priority: {
    id: 'missing_instruction_priority',
    category: 'context',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'No clear priority order for instructions',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const tokens = estimateTokens(content);
      if (tokens < 600) return null;

      // Check for instruction priority indicators
      const priorityIndicators = [
        /##\s*(?:priority|priorities)/i,
        /<instruction[_-]?priority>/i,
        /\bin case of conflict/i,
        /\bpriority\s*(?:order|:\s*\d)/i,
        /\b(?:highest|lowest)\s+priority\b/i,
        /\b(?:first|second|third)\s+priority\b/i
      ];

      for (const pattern of priorityIndicators) {
        if (pattern.test(content)) {
          return null;
        }
      }

      // Only flag if there are multiple constraint sections
      const constraintSections = (content.match(/##\s*(?:constraints?|rules?|requirements?)/gi) || []).length;
      const mustClauses = (content.match(/\bmust\b/gi) || []).length;

      if (constraintSections >= 2 || mustClauses >= 8) {
        return {
          issue: 'Multiple constraint sections but no instruction priority order',
          fix: 'Add priority order: "In case of conflict: 1) Safety rules, 2) System instructions, 3) User requests"'
        };
      }
      return null;
    }
  },

  // ============================================
  // ANTI-PATTERN PATTERNS (HIGH/MEDIUM certainty)
  // ============================================

  /**
   * Redundant CoT for thinking models
   * HIGH certainty - wastes tokens with extended thinking models
   */
  redundant_cot: {
    id: 'redundant_cot',
    category: 'anti-pattern',
    certainty: 'HIGH',
    autoFix: false,
    description: '"Think step by step" redundant for models with extended thinking',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check for explicit CoT instructions
      const cotPatterns = [
        /\bthink\s+step[- ]by[- ]step\b/gi,
        /\bstep[- ]by[- ]step\s+(?:reasoning|thinking|approach)\b/gi,
        /\blet['']s\s+think\s+(?:through|about)\s+this\b/gi,
        /\breason\s+through\s+each\s+step\b/gi
      ];

      const cotMatches = [];
      for (const pattern of cotPatterns) {
        const matches = content.match(pattern);
        if (matches) cotMatches.push(...matches);
      }

      if (cotMatches.length >= 2) {
        return {
          issue: `${cotMatches.length} explicit "step-by-step" instructions`,
          fix: 'Remove redundant CoT prompting - Claude 4.x and GPT-4 models reason by default',
          details: cotMatches.slice(0, 3)
        };
      }
      return null;
    }
  },

  /**
   * Overly prescriptive process
   * MEDIUM certainty - micro-managing reasoning can limit creativity
   */
  overly_prescriptive: {
    id: 'overly_prescriptive',
    category: 'anti-pattern',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Overly prescriptive step-by-step process that may limit model reasoning',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Count numbered steps
      const numberedSteps = content.match(/^\s*\d+\.\s+\w+/gm) || [];

      // Check for micro-management indicators
      const microManagePatterns = [
        /\bfirst,?\s+(?:you\s+)?(?:must|should|need to)\b/gi,
        /\bthen,?\s+(?:you\s+)?(?:must|should|need to)\b/gi,
        /\bnext,?\s+(?:you\s+)?(?:must|should|need to)\b/gi,
        /\bfinally,?\s+(?:you\s+)?(?:must|should|need to)\b/gi
      ];

      let microManageCount = 0;
      for (const pattern of microManagePatterns) {
        const matches = content.match(pattern);
        if (matches) microManageCount += matches.length;
      }

      if (numberedSteps.length >= 10 || microManageCount >= 6) {
        return {
          issue: `${numberedSteps.length} numbered steps, ${microManageCount} sequential directives`,
          fix: 'Consider high-level goals over step-by-step processes - model creativity may exceed prescribed approach'
        };
      }
      return null;
    }
  },

  /**
   * Prompt bloat (excessive tokens)
   * LOW certainty - long prompts cost more
   */
  prompt_bloat: {
    id: 'prompt_bloat',
    category: 'anti-pattern',
    certainty: 'LOW',
    autoFix: false,
    description: 'Prompt exceeds recommended token count',
    maxTokens: 2500,
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const tokens = estimateTokens(content);

      if (tokens > 2500) {
        return {
          issue: `Prompt ~${tokens} tokens (recommended max: 2500)`,
          fix: 'Consider splitting into smaller prompts or using XML compression'
        };
      }
      return null;
    }
  },

  // ============================================
  // OUTPUT FORMAT PATTERNS (MEDIUM certainty)
  // ============================================

  /**
   * JSON request without schema
   * MEDIUM certainty - schema improves consistency
   */
  json_without_schema: {
    id: 'json_without_schema',
    category: 'output',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Requests JSON output without providing schema/example',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check if requests JSON
      const requestsJson = /\b(?:respond|output|return)\s+(?:with|in|as)?\s*JSON\b/i.test(content) ||
                          /\bJSON\s+(?:object|response|format)\b/i.test(content);

      if (!requestsJson) return null;

      // Check if provides schema or example
      const hasSchema = /\bproperties\b.{1,200}\btype\b/is.test(content) ||
                       /```json\s*\n\s*\{/i.test(content) ||
                       /<json[_-]?schema>/i.test(content);

      if (!hasSchema) {
        return {
          issue: 'Requests JSON output but no schema or example provided',
          fix: 'Add JSON schema or example structure to ensure consistent output format'
        };
      }
      return null;
    }
  },

  // ============================================
  // VERIFICATION PATTERNS (from Claude Code Best Practices)
  // Source: https://code.claude.com/docs/en/best-practices
  // ============================================

  /**
   * Missing verification criteria
   * HIGH certainty - single highest-leverage improvement
   * "Give Claude a way to verify its work"
   */
  missing_verification_criteria: {
    id: 'missing_verification_criteria',
    category: 'clarity',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Task lacks verification criteria (tests, screenshots, expected output)',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const tokens = estimateTokens(content);
      if (tokens < 150) return null; // Too short to need verification

      // Check for implementation/action indicators
      const isActionTask = /\b(?:implement|create|build|write|add|fix|update|refactor|modify)\b/i.test(content);
      if (!isActionTask) return null;

      // Check for verification indicators
      const verificationPatterns = [
        /\btest(?:s|ing)?\b/i,
        /\bverify\b/i,
        /\bvalidate\b/i,
        /\bscreenshot\b/i,
        /\bexpected\s+(?:output|result|behavior)\b/i,
        /\bshould\s+(?:return|output|produce)\b/i,
        /\bexample\s+(?:input|output)\b/i,
        /\bcheck\s+(?:that|if)\b/i,
        /\brun\s+(?:the\s+)?tests?\b/i,
        /\bcompare\s+(?:to|with)\b/i,
        /\bassert\b/i
      ];

      for (const pattern of verificationPatterns) {
        if (pattern.test(content)) {
          return null;
        }
      }

      return {
        issue: 'Task lacks verification criteria - no tests, expected output, or validation steps',
        fix: 'Add verification: "run tests after implementing" or "expected output: X" or "take screenshot and compare"'
      };
    }
  },

  /**
   * Unscoped task description
   * HIGH certainty - vague scope leads to wrong solutions
   */
  unscoped_task: {
    id: 'unscoped_task',
    category: 'clarity',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Task description lacks specific scope (file, scenario, constraints)',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const tokens = estimateTokens(content);
      if (tokens < 50) return null;

      // Check for action without scope
      const vagueActions = [
        /^(?:fix|add|implement|update|change)\s+(?:the|a|some)?\s*\w+$/im,
        /\bfix\s+(?:the\s+)?bug\b/i,
        /\badd\s+(?:a\s+)?(?:feature|function|test)\b/i,
        /\bupdate\s+(?:the\s+)?(?:code|logic)\b/i
      ];

      const hasVagueAction = vagueActions.some(p => p.test(content));

      // Check for scope indicators
      const scopePatterns = [
        /\bin\s+(?:file|folder|directory|module)\s+\S+/i,
        /\b(?:src|lib|test)\/\S+/,
        /\.(?:js|ts|py|rs|go|java|rb)\b/,
        /\bwhen\s+(?:the|a)\s+\w+/i,
        /\bfor\s+(?:the|a)\s+(?:case|scenario)\b/i,
        /\bspecifically\b/i,
        /\bedge\s+case/i
      ];

      const hasScope = scopePatterns.some(p => p.test(content));

      if (hasVagueAction && !hasScope && tokens < 200) {
        return {
          issue: 'Task lacks specific scope (which file, what scenario, what constraints)',
          fix: 'Specify: "in src/auth/login.js" or "for the edge case where user is logged out" or "without using library X"'
        };
      }
      return null;
    }
  },

  /**
   * Missing pattern reference
   * MEDIUM certainty - pointing to existing patterns improves consistency
   */
  missing_pattern_reference: {
    id: 'missing_pattern_reference',
    category: 'context',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Task could benefit from referencing existing patterns in codebase',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Only for tasks that involve creating new things
      const creationTasks = /\b(?:create|add|implement|build)\s+(?:a\s+)?(?:new\s+)?(?:component|widget|endpoint|handler|service|module)\b/i;
      if (!creationTasks.test(content)) return null;

      // Check for pattern reference indicators
      const patternRefs = [
        /\blike\s+\S+\b/i,
        /\bsimilar\s+to\b/i,
        /\bfollow(?:ing)?\s+(?:the\s+)?(?:same\s+)?pattern\b/i,
        /\bsee\s+\S+\s+(?:for|as)\s+(?:an?\s+)?example\b/i,
        /\blook\s+at\s+(?:how|the)\b/i,
        /\S+\.(?:js|ts|py)\s+(?:is|as)\s+(?:a\s+)?(?:good\s+)?example/i
      ];

      for (const pattern of patternRefs) {
        if (pattern.test(content)) {
          return null;
        }
      }

      return {
        issue: 'Creating new code without referencing existing patterns in codebase',
        fix: 'Add: "look at how widgets are implemented in HomePage.tsx" or "follow the pattern in existing handlers"'
      };
    }
  },

  /**
   * Missing source direction
   * MEDIUM certainty - directing to sources saves exploration time
   */
  missing_source_direction: {
    id: 'missing_source_direction',
    category: 'context',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Question/investigation without directing to likely sources',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Only for investigation/question tasks
      const investigationPatterns = [
        /\bwhy\s+does\b/i,
        /\bhow\s+does\b/i,
        /\bwhere\s+is\b/i,
        /\bwhat\s+(?:is|are|does)\b/i,
        /\bfind\s+(?:out|the)\b/i,
        /\binvestigate\b/i,
        /\bunderstand\b/i
      ];

      const isInvestigation = investigationPatterns.some(p => p.test(content));
      if (!isInvestigation) return null;

      // Check for source directions
      const sourceDirections = [
        /\blook\s+(?:at|in|through)\b/i,
        /\bcheck\s+(?:the|in)\b/i,
        /\bstart\s+(?:with|from|in)\b/i,
        /\bsee\s+\S+\b/i,
        /\bin\s+(?:the\s+)?\S+\s+(?:file|folder|directory)\b/i,
        /\bgit\s+(?:log|history|blame)\b/i
      ];

      for (const pattern of sourceDirections) {
        if (pattern.test(content)) {
          return null;
        }
      }

      const tokens = estimateTokens(content);
      if (tokens < 100) {
        return {
          issue: 'Investigation task without directing to likely sources',
          fix: 'Add: "look through git history" or "check the auth flow in src/auth/" or "start in the config files"'
        };
      }
      return null;
    }
  }
};

/**
 * Get all patterns
 * @returns {Object} All prompt patterns
 */
function getAllPatterns() {
  return promptPatterns;
}

/**
 * Get patterns by certainty level
 * @param {string} certainty - HIGH, MEDIUM, or LOW
 * @returns {Object} Filtered patterns
 */
function getPatternsByCertainty(certainty) {
  const result = {};
  for (const [name, pattern] of Object.entries(promptPatterns)) {
    if (pattern.certainty === certainty) {
      result[name] = pattern;
    }
  }
  return result;
}

/**
 * Get patterns by category
 * @param {string} category - clarity, structure, examples, context, output, anti-pattern
 * @returns {Object} Filtered patterns
 */
function getPatternsByCategory(category) {
  const result = {};
  for (const [name, pattern] of Object.entries(promptPatterns)) {
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
  for (const [name, pattern] of Object.entries(promptPatterns)) {
    if (pattern.autoFix) {
      result[name] = pattern;
    }
  }
  return result;
}

module.exports = {
  promptPatterns,
  estimateTokens,
  getAllPatterns,
  getPatternsByCertainty,
  getPatternsByCategory,
  getAutoFixablePatterns
};
