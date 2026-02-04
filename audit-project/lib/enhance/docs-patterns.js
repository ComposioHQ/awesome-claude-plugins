/**
 * Documentation Patterns
 * @author Avi Fenesh
 * @license MIT
 */

function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Supports modes: 'ai' (RAG optimized), 'both' (balanced), 'shared' (both)
 */
const docsPatterns = {
  broken_internal_link: {
    id: 'broken_internal_link',
    category: 'link',
    certainty: 'HIGH',
    autoFix: false,
    mode: 'shared',
    description: 'Internal link references non-existent file or anchor',
    check: (content, context = {}) => {
      if (!content || typeof content !== 'string') return null;

      // Find markdown links
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      const brokenLinks = [];
      let match;

      while ((match = linkRegex.exec(content)) !== null) {
        const linkTarget = match[2];

        // Skip external links
        if (linkTarget.startsWith('http://') || linkTarget.startsWith('https://')) {
          continue;
        }

        // Check internal anchor links
        if (linkTarget.startsWith('#')) {
          const anchorId = linkTarget.slice(1).toLowerCase();
          // Generate expected heading anchors from content
          const headings = content.match(/^#{1,6}\s+(.+)$/gm) || [];
          const anchors = headings.map(h => {
            return h.replace(/^#{1,6}\s+/, '')
              .toLowerCase()
              .replace(/[^a-z0-9\s-]/g, '')
              .replace(/\s+/g, '-');
          });

          if (!anchors.includes(anchorId)) {
            brokenLinks.push(linkTarget);
          }
        }

        // Note: File existence checks require context.existingFiles
        // which is passed by the analyzer
        if (context.existingFiles && !linkTarget.startsWith('#')) {
          const targetPath = linkTarget.split('#')[0];
          if (!context.existingFiles.includes(targetPath)) {
            brokenLinks.push(linkTarget);
          }
        }
      }

      if (brokenLinks.length > 0) {
        return {
          issue: `Broken internal links: ${brokenLinks.slice(0, 3).join(', ')}${brokenLinks.length > 3 ? '...' : ''}`,
          fix: 'Fix or remove broken links',
          details: brokenLinks
        };
      }
      return null;
    }
  },

  inconsistent_heading_levels: {
    id: 'inconsistent_heading_levels',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: true,
    mode: 'shared',
    description: 'Heading levels skip (e.g., H1 to H3 without H2)',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const headingRegex = /^(#{1,6})\s+/gm;
      const levels = [];
      let match;

      while ((match = headingRegex.exec(content)) !== null) {
        levels.push(match[1].length);
      }

      // Check for skipped levels
      for (let i = 1; i < levels.length; i++) {
        const jump = levels[i] - levels[i - 1];
        if (jump > 1) {
          return {
            issue: `Heading level jumps from H${levels[i - 1]} to H${levels[i]}`,
            fix: 'Fix heading hierarchy to not skip levels'
          };
        }
      }
      return null;
    }
  },

  missing_code_language: {
    id: 'missing_code_language',
    category: 'code',
    certainty: 'HIGH',
    autoFix: false,
    mode: 'shared',
    description: 'Code block without language specification',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Find all code block starts
      const allCodeBlocks = content.match(/```/g) || [];
      // Count pairs (opening blocks)
      const totalBlocks = Math.floor(allCodeBlocks.length / 2);

      if (totalBlocks === 0) return null;

      // Find code blocks with language (``` followed by non-whitespace)
      const withLangRegex = /```[a-zA-Z][a-zA-Z0-9_-]*/g;
      const withLang = content.match(withLangRegex) || [];

      const withoutLang = totalBlocks - withLang.length;

      if (withoutLang > 0) {
        return {
          issue: `${withoutLang} code block(s) without language specification`,
          fix: 'Add language hint after ``` (e.g., ```javascript)'
        };
      }
      return null;
    }
  },

  section_too_long: {
    id: 'section_too_long',
    category: 'structure',
    certainty: 'MEDIUM',
    autoFix: false,
    mode: 'shared',
    description: 'Section exceeds 1000 tokens (poor for RAG chunking)',
    maxTokens: 1000,
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Split by headings
      const sections = content.split(/^#{1,6}\s+/m);
      const longSections = [];

      for (let i = 1; i < sections.length; i++) {
        const section = sections[i];
        const tokens = estimateTokens(section);
        if (tokens > 1000) {
          // Get section title (first line)
          const title = section.split('\n')[0].trim().slice(0, 50);
          longSections.push({ title, tokens });
        }
      }

      if (longSections.length > 0) {
        return {
          issue: `${longSections.length} section(s) exceed 1000 tokens`,
          fix: 'Break long sections into smaller, focused subsections',
          details: longSections
        };
      }
      return null;
    }
  },

  unnecessary_prose: {
    id: 'unnecessary_prose',
    category: 'efficiency',
    certainty: 'HIGH',
    autoFix: false,
    mode: 'ai',
    description: 'Filler prose that adds no information value',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Patterns that indicate unnecessary prose
      const prosePatterns = [
        /in this (?:document|section|guide)/gi,
        /as you (?:can see|may know|probably know)/gi,
        /it(?:'s| is) (?:important|worth noting) (?:to note |that )?/gi,
        /please note that/gi,
        /the following (?:section|document|guide) (?:will |provides )/gi,
        /let(?:'s| us) (?:take a look|explore|dive into)/gi,
        /we(?:'ll| will) (?:cover|discuss|explore)/gi,
        /this allows you to/gi,
        /you(?:'ll| will) (?:learn|discover|find)/gi,
        /as mentioned (?:earlier|above|before)/gi
      ];

      const found = [];
      for (const pattern of prosePatterns) {
        const matches = content.match(pattern);
        if (matches) {
          found.push(...matches.slice(0, 2));
        }
      }

      if (found.length >= 3) {
        return {
          issue: `Found ${found.length} instances of unnecessary prose`,
          fix: 'Remove filler text - state facts directly',
          details: found.slice(0, 5)
        };
      }
      return null;
    }
  },

  verbose_explanations: {
    id: 'verbose_explanations',
    category: 'efficiency',
    certainty: 'HIGH',
    autoFix: true,
    mode: 'ai',
    description: 'Verbose explanations that could be condensed',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Detect verbose patterns
      const verbosePatterns = [
        { pattern: /\bin order to\b/gi, replacement: 'to' },
        { pattern: /\bfor the purpose of\b/gi, replacement: 'for' },
        { pattern: /\bin the event that\b/gi, replacement: 'if' },
        { pattern: /\bat this point in time\b/gi, replacement: 'now' },
        { pattern: /\bdue to the fact that\b/gi, replacement: 'because' },
        { pattern: /\bhas the ability to\b/gi, replacement: 'can' },
        { pattern: /\bis able to\b/gi, replacement: 'can' },
        { pattern: /\bmake use of\b/gi, replacement: 'use' },
        { pattern: /\ba large number of\b/gi, replacement: 'many' },
        { pattern: /\ba small number of\b/gi, replacement: 'few' },
        { pattern: /\bthe majority of\b/gi, replacement: 'most' },
        { pattern: /\bprior to\b/gi, replacement: 'before' },
        { pattern: /\bsubsequent to\b/gi, replacement: 'after' }
      ];

      const found = [];
      for (const { pattern } of verbosePatterns) {
        const matches = content.match(pattern);
        if (matches) {
          found.push(...matches);
        }
      }

      if (found.length >= 3) {
        return {
          issue: `Found ${found.length} verbose phrases that could be simplified`,
          fix: 'Replace verbose phrases with concise alternatives',
          details: found.slice(0, 5)
        };
      }
      return null;
    }
  },

  suboptimal_chunking: {
    id: 'suboptimal_chunking',
    category: 'rag',
    certainty: 'MEDIUM',
    autoFix: false,
    mode: 'ai',
    description: 'Content structure suboptimal for RAG chunking',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const issues = [];

      // Check for very few headings in long content
      const tokens = estimateTokens(content);
      const headingCount = (content.match(/^#{1,6}\s+/gm) || []).length;

      if (tokens > 500 && headingCount < Math.floor(tokens / 500)) {
        issues.push('Too few section headings for content length');
      }

      // Check for headings without content
      const sections = content.split(/^#{1,6}\s+/m);
      for (let i = 1; i < sections.length; i++) {
        const sectionContent = sections[i].split(/^#{1,6}\s+/m)[0];
        if (estimateTokens(sectionContent) < 20) {
          issues.push('Some sections have very little content');
          break;
        }
      }

      if (issues.length > 0) {
        return {
          issue: issues.join('; '),
          fix: 'Restructure content with consistent section sizes (200-500 tokens)'
        };
      }
      return null;
    }
  },

  poor_semantic_boundaries: {
    id: 'poor_semantic_boundaries',
    category: 'rag',
    certainty: 'MEDIUM',
    autoFix: false,
    mode: 'ai',
    description: 'Section mixes multiple distinct topics',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Look for transition words that suggest topic changes within sections
      const transitionPatterns = [
        /\n\n(?:additionally|also|furthermore|moreover|on another note|separately)/gi,
        /\n\n(?:however|on the other hand|alternatively|in contrast)/gi,
        /\n\n(?:next|then|finally|lastly|another (?:thing|point|topic))/gi
      ];

      // Split into sections and check each
      const sections = content.split(/^#{1,6}\s+/m);
      let problemSections = 0;

      for (const section of sections) {
        let transitionsInSection = 0;
        for (const pattern of transitionPatterns) {
          const matches = section.match(pattern);
          if (matches) transitionsInSection += matches.length;
        }

        if (transitionsInSection >= 3) {
          problemSections++;
        }
      }

      if (problemSections > 0) {
        return {
          issue: `${problemSections} section(s) may mix multiple topics`,
          fix: 'Split sections so each covers a single, focused topic'
        };
      }
      return null;
    }
  },

  missing_context_anchors: {
    id: 'missing_context_anchors',
    category: 'rag',
    certainty: 'MEDIUM',
    autoFix: false,
    mode: 'ai',
    description: 'Sections lack self-contained context for RAG retrieval',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check for dangling pronouns at section starts
      const sections = content.split(/^#{1,6}\s+/m);
      const issues = [];

      for (let i = 1; i < sections.length; i++) {
        const section = sections[i];
        const lines = section.split('\n').filter(l => l.trim());

        if (lines.length > 1) {
          // First content line after heading
          const firstLine = lines[1] || '';

          // Check if starts with dangling reference
          if (/^(?:It|This|These|Those|They|The above|As mentioned)\s/i.test(firstLine)) {
            const title = lines[0].slice(0, 30);
            issues.push(title);
          }
        }
      }

      if (issues.length >= 2) {
        return {
          issue: `${issues.length} sections start with context-dependent references`,
          fix: 'Make each section self-contained (avoid "It", "This" without context)',
          details: issues.slice(0, 3)
        };
      }
      return null;
    }
  },

  token_inefficiency_suggestions: {
    id: 'token_inefficiency_suggestions',
    category: 'efficiency',
    certainty: 'LOW',
    autoFix: false,
    mode: 'ai',
    description: 'Suggestions for reducing token usage',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const suggestions = [];
      const tokens = estimateTokens(content);

      // Check for repeated phrases
      const words = content.toLowerCase().split(/\s+/);
      const phrases = {};
      for (let i = 0; i < words.length - 2; i++) {
        const phrase = words.slice(i, i + 3).join(' ');
        phrases[phrase] = (phrases[phrase] || 0) + 1;
      }

      const repeatedPhrases = Object.entries(phrases)
        .filter(([_, count]) => count >= 4)
        .map(([phrase]) => phrase);

      if (repeatedPhrases.length > 0) {
        suggestions.push(`Repeated phrases could be consolidated: ${repeatedPhrases.slice(0, 2).join(', ')}`);
      }

      // Check for very long lists that could be tables
      const longLists = content.match(/(?:^[-*]\s+.+\n){10,}/gm);
      if (longLists) {
        suggestions.push('Long lists (10+ items) might be more efficient as tables');
      }

      // Check token density
      const lineCount = content.split('\n').length;
      if (lineCount > 0 && tokens / lineCount < 3) {
        suggestions.push('Many short lines - consider consolidating');
      }

      if (suggestions.length > 0) {
        return {
          issue: `Token efficiency suggestions (current: ~${tokens} tokens)`,
          fix: suggestions.join('; ')
        };
      }
      return null;
    }
  },

  missing_section_headers: {
    id: 'missing_section_headers',
    category: 'structure',
    certainty: 'MEDIUM',
    autoFix: false,
    mode: 'both',
    description: 'Long content blocks without section headers',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Find paragraphs (content between headings or start/end)
      const parts = content.split(/^#{1,6}\s+/m);
      const longBlocks = [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        // First part (before any heading) should have heading line removed
        // Subsequent parts have the heading text as first line, which we keep for token count
        const cleanPart = i === 0 ? part : part.split('\n').slice(1).join('\n');
        const tokens = estimateTokens(cleanPart);

        if (tokens > 500) {
          const preview = cleanPart.trim().split('\n')[0].slice(0, 50);
          longBlocks.push({ tokens, preview });
        }
      }

      if (longBlocks.length > 0) {
        return {
          issue: `${longBlocks.length} content block(s) over 500 tokens without sub-headers`,
          fix: 'Add section headers to break up long content',
          details: longBlocks
        };
      }
      return null;
    }
  },

  poor_context_ordering: {
    id: 'poor_context_ordering',
    category: 'structure',
    certainty: 'MEDIUM',
    autoFix: false,
    mode: 'both',
    description: 'Important information may be buried too deep',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      // Check if critical keywords appear late in document
      const criticalKeywords = [
        /\b(?:important|critical|must|required|warning|caution|danger)\b/i,
        /\b(?:error|fail|break|crash|security|vulnerability)\b/i
      ];

      const lines = content.split('\n');
      const totalLines = lines.length;
      const lateThreshold = Math.floor(totalLines * 0.7);

      const lateImportantLines = [];

      for (let i = lateThreshold; i < totalLines; i++) {
        for (const pattern of criticalKeywords) {
          if (pattern.test(lines[i])) {
            lateImportantLines.push(lines[i].trim().slice(0, 50));
            break;
          }
        }
      }

      if (lateImportantLines.length >= 3) {
        return {
          issue: 'Critical information appears in the last 30% of document',
          fix: 'Move important warnings/requirements earlier in the document'
        };
      }
      return null;
    }
  },

  readability_with_rag_suggestions: {
    id: 'readability_with_rag_suggestions',
    category: 'balance',
    certainty: 'LOW',
    autoFix: false,
    mode: 'both',
    description: 'Suggestions for balancing readability and RAG optimization',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const suggestions = [];

      // Check for very short paragraphs (good for RAG, but might hurt readability)
      const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
      const veryShort = paragraphs.filter(p => estimateTokens(p) < 20).length;

      if (veryShort > paragraphs.length * 0.5) {
        suggestions.push('Many very short paragraphs - consider grouping related points');
      }

      // Check for lack of explanatory text (good for AI, bad for humans)
      const hasExamples = /```|<example>|for example|e\.g\./i.test(content);
      const hasExplanation = /because|since|therefore|this means/i.test(content);

      if (hasExamples && !hasExplanation) {
        suggestions.push('Examples present but limited explanation - add context for human readers');
      }

      // Check for dense technical content without summaries
      const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
      const hasSummary = /^##?\s+(?:summary|overview|tldr|key points)/im.test(content);

      if (codeBlocks >= 5 && !hasSummary) {
        suggestions.push('Dense code content - consider adding a summary section');
      }

      if (suggestions.length > 0) {
        return {
          issue: 'Balance suggestions for readability vs RAG optimization',
          fix: suggestions.join('; ')
        };
      }
      return null;
    }
  },

  structure_recommendations: {
    id: 'structure_recommendations',
    category: 'structure',
    certainty: 'LOW',
    autoFix: false,
    mode: 'both',
    description: 'General structure recommendations',
    check: (content) => {
      if (!content || typeof content !== 'string') return null;

      const recommendations = [];

      // Check for table of contents in long documents
      const tokens = estimateTokens(content);
      const headingCount = (content.match(/^#{1,6}\s+/gm) || []).length;
      const hasToc = /^##?\s+(?:table of contents|contents|toc)/im.test(content) ||
                     /^\s*-\s+\[.+\]\(#/m.test(content);

      if (tokens > 2000 && headingCount >= 5 && !hasToc) {
        recommendations.push('Consider adding a table of contents for navigation');
      }

      // Check for missing introduction
      const firstHeading = content.match(/^#{1,6}\s+(.+)/m);
      const hasIntro = /^##?\s+(?:introduction|overview|about|getting started)/im.test(content);

      if (tokens > 1000 && firstHeading && !hasIntro) {
        recommendations.push('Consider adding an introduction or overview section');
      }

      // Check for consistent formatting
      const bulletStyles = {
        dash: (content.match(/^-\s+/gm) || []).length,
        asterisk: (content.match(/^\*\s+/gm) || []).length
      };

      if (bulletStyles.dash > 0 && bulletStyles.asterisk > 0) {
        recommendations.push('Mixed bullet styles (- and *) - consider using one consistently');
      }

      if (recommendations.length > 0) {
        return {
          issue: 'Structure recommendations',
          fix: recommendations.join('; ')
        };
      }
      return null;
    }
  }
};

function getAllPatterns() {
  return docsPatterns;
}

function getPatternsByMode(mode) {
  const result = {};
  for (const [name, pattern] of Object.entries(docsPatterns)) {
    if (pattern.mode === mode || pattern.mode === 'shared') {
      result[name] = pattern;
    }
  }
  return result;
}

function getPatternsByCertainty(certainty) {
  const result = {};
  for (const [name, pattern] of Object.entries(docsPatterns)) {
    if (pattern.certainty === certainty) {
      result[name] = pattern;
    }
  }
  return result;
}

function getPatternsByCategory(category) {
  const result = {};
  for (const [name, pattern] of Object.entries(docsPatterns)) {
    if (pattern.category === category) {
      result[name] = pattern;
    }
  }
  return result;
}

function getAutoFixablePatterns() {
  const result = {};
  for (const [name, pattern] of Object.entries(docsPatterns)) {
    if (pattern.autoFix) {
      result[name] = pattern;
    }
  }
  return result;
}

module.exports = {
  docsPatterns,
  estimateTokens,
  getAllPatterns,
  getPatternsByMode,
  getPatternsByCertainty,
  getPatternsByCategory,
  getAutoFixablePatterns,
  getPatternsForMode: getPatternsByMode
};
