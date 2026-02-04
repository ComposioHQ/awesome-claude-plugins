/**
 * Plugin Analysis Fixer
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');

function applyFixes(issues, options = {}) {
  const { dryRun = false, backup = true } = options;

  const results = {
    applied: [],
    skipped: [],
    errors: []
  };

  // Auto-fixable pattern IDs for markdown files
  const markdownAutoFixPatternIds = [
    // Agent patterns
    'missing_frontmatter',
    'unrestricted_bash',
    'missing_role',
    // Prompt patterns
    'missing_output_format',
    'missing_examples',
    'missing_xml_structure',
    'missing_verification_criteria',
    'aggressive_emphasis',
    // Skill patterns
    'missing_trigger_phrase'
  ];

  // Filter to only HIGH certainty issues that are auto-fixable
  // Includes: JSON issues with autoFixFn OR markdown issues with known pattern IDs
  const fixableIssues = issues.filter(i =>
    i.certainty === 'HIGH' &&
    (i.filePath || i.file) &&
    (i.autoFixFn || markdownAutoFixPatternIds.includes(i.patternId))
  );

  // Group by file to minimize reads/writes
  const byFile = new Map();
  for (const issue of fixableIssues) {
    const fp = issue.filePath || issue.file;
    if (!byFile.has(fp)) {
      byFile.set(fp, []);
    }
    byFile.get(fp).push(issue);
  }

  // Process each file
  for (const [filePath, fileIssues] of byFile) {
    try {
      // Read current content
      if (!fs.existsSync(filePath)) {
        results.errors.push({ filePath, error: 'File not found' });
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      let data;

      // Parse based on file type
      if (filePath.endsWith('.json')) {
        data = JSON.parse(content);
      } else if (filePath.endsWith('.md')) {
        // Markdown files - handle specially
        data = content;
      } else {
        // For other files, skip auto-fix
        results.skipped.push(...fileIssues.map(i => ({
          ...i,
          reason: 'Unsupported file type - manual fix required'
        })));
        continue;
      }

      // Apply each fix
      let modified = data;
      const appliedToFile = [];

      for (const issue of fileIssues) {
        try {
          // Determine what part of data to fix
          if (filePath.endsWith('.md')) {
            // Markdown-specific fixes
            if (issue.patternId === 'missing_frontmatter') {
              modified = fixMissingFrontmatter(modified);
            } else if (issue.patternId === 'unrestricted_bash') {
              modified = fixUnrestrictedBash(modified);
            } else if (issue.patternId === 'missing_role') {
              modified = fixMissingRole(modified);
            } else if (issue.patternId === 'missing_output_format') {
              modified = fixMissingOutputFormat(modified);
            } else if (issue.patternId === 'missing_examples') {
              modified = fixMissingExamples(modified);
            } else if (issue.patternId === 'missing_xml_structure') {
              modified = fixMissingXmlStructure(modified);
            } else if (issue.patternId === 'missing_verification_criteria') {
              modified = fixMissingVerificationCriteria(modified);
            } else if (issue.patternId === 'aggressive_emphasis') {
              modified = fixAggressiveEmphasis(modified);
            } else if (issue.patternId === 'missing_trigger_phrase') {
              modified = fixMissingTriggerPhrase(modified);
            } else {
              // No auto-fix available for this markdown issue
              continue;
            }
          } else if (issue.schemaPath) {
            // Fix at specific path in the data
            modified = applyAtPath(modified, issue.schemaPath, issue.autoFixFn);
          } else {
            // Apply to root
            modified = issue.autoFixFn(modified);
          }

          appliedToFile.push({
            issue: issue.issue,
            fix: issue.fix,
            filePath
          });
        } catch (err) {
          results.errors.push({
            issue: issue.issue,
            filePath,
            error: err.message
          });
        }
      }

      // Write changes
      if (!dryRun && appliedToFile.length > 0) {
        // Create backup
        if (backup) {
          const backupPath = `${filePath}.backup`;
          fs.writeFileSync(backupPath, content, 'utf8');
        }

        // Write modified content
        let newContent;
        if (filePath.endsWith('.md')) {
          newContent = modified; // Already a string
        } else {
          newContent = JSON.stringify(modified, null, 2);
        }
        fs.writeFileSync(filePath, newContent, 'utf8');
      }

      results.applied.push(...appliedToFile);

    } catch (err) {
      results.errors.push({
        filePath,
        error: err.message
      });
    }
  }

  // Add non-fixable issues to skipped
  const nonFixable = issues.filter(i =>
    i.certainty !== 'HIGH' || !markdownAutoFixPatternIds.includes(i.patternId)
  );
  results.skipped.push(...nonFixable.map(i => ({
    ...i,
    reason: i.certainty !== 'HIGH' ? 'Not HIGH certainty' : 'No auto-fix available for this pattern'
  })));

  return results;
}

function applyAtPath(obj, pathStr, fixFn) {
  const parts = pathStr.split('.');
  const result = structuredClone(obj);

  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part.includes('[')) {
      // Array access
      const match = part.match(/(\w+)\[(\d+)\]/);
      if (match) {
        current = current[match[1]][parseInt(match[2], 10)];
      }
    } else {
      current = current[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart.includes('[')) {
    const match = lastPart.match(/(\w+)\[(\d+)\]/);
    if (match) {
      current[match[1]][parseInt(match[2], 10)] = fixFn(current[match[1]][parseInt(match[2], 10)]);
    }
  } else {
    current[lastPart] = fixFn(current[lastPart]);
  }

  return result;
}

function fixAdditionalProperties(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  const fixed = { ...schema };

  if (fixed.type === 'object' && fixed.properties) {
    fixed.additionalProperties = false;
  }

  // Recursively fix nested schemas
  if (fixed.properties) {
    fixed.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      fixed.properties[key] = fixAdditionalProperties(value);
    }
  }

  return fixed;
}

function fixRequiredFields(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  const fixed = { ...schema };

  if (fixed.type === 'object' && fixed.properties && !fixed.required) {
    // Add all non-optional fields to required
    fixed.required = Object.entries(fixed.properties)
      .filter(([_, prop]) => {
        // Skip if has default or marked optional in description
        if (prop.default !== undefined) return false;
        if (prop.description && /optional/i.test(prop.description)) return false;
        return true;
      })
      .map(([key]) => key);
  }

  return fixed;
}

function fixVersionMismatch(pluginJson, targetVersion) {
  return {
    ...pluginJson,
    version: targetVersion
  };
}

function previewFixes(issues) {
  const previews = [];

  for (const issue of issues) {
    if (issue.certainty === 'HIGH' && issue.autoFixFn) {
      previews.push({
        filePath: issue.filePath,
        issue: issue.issue,
        fix: issue.fix,
        willApply: true
      });
    } else {
      previews.push({
        filePath: issue.filePath,
        issue: issue.issue,
        fix: issue.fix || 'No auto-fix available',
        willApply: false,
        reason: issue.certainty !== 'HIGH' ? 'Not HIGH certainty' : 'No auto-fix function'
      });
    }
  }

  return previews;
}

function restoreFromBackup(filePath) {
  const backupPath = `${filePath}.backup`;

  if (!fs.existsSync(backupPath)) {
    return false;
  }

  const backupContent = fs.readFileSync(backupPath, 'utf8');
  fs.writeFileSync(filePath, backupContent, 'utf8');
  fs.unlinkSync(backupPath);

  return true;
}

function cleanupBackups(directory) {
  let count = 0;

  function findBackups(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findBackups(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.backup')) {
        try {
          fs.unlinkSync(fullPath);
          count++;
        } catch (err) {
          console.error('[WARN] fixer error:', err.message);
        }
      }
    }
  }

  findBackups(directory);
  return count;
}

function fixMissingFrontmatter(content) {
  if (!content || typeof content !== 'string') return content;

  const template = `---
name: agent-name
description: Agent description
tools: Read, Glob, Grep
model: sonnet
---

`;

  return template + content.trim();
}

function fixUnrestrictedBash(content) {
  if (!content || typeof content !== 'string') return content;

  const lines = content.split('\n');
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        break;
      }
    } else if (inFrontmatter && lines[i].startsWith('tools:')) {
      lines[i] = lines[i].replace(/\bBash\b(?!\()/g, 'Bash(git:*)');
    }
  }

  return lines.join('\n');
}

function fixMissingRole(content) {
  if (!content || typeof content !== 'string') return content;

  const lines = content.split('\n');
  let frontmatterEnd = -1;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        frontmatterEnd = i;
        break;
      }
    }
  }

  const roleSection = `
## Your Role

You are an agent that [describe agent purpose].
`;

  if (frontmatterEnd >= 0) {
    lines.splice(frontmatterEnd + 1, 0, roleSection);
  } else {
    lines.unshift(roleSection);
  }

  return lines.join('\n');
}

function fixInconsistentHeadings(content) {
  if (!content || typeof content !== 'string') return content;

  const lines = content.split('\n');
  let lastLevel = 0;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const currentLevel = headingMatch[1].length;
      const headingText = headingMatch[2];

      if (lastLevel === 0) {
        lastLevel = currentLevel;
        continue;
      }

      // If jumping more than one level down, fix it
      if (currentLevel > lastLevel + 1) {
        const fixedLevel = lastLevel + 1;
        lines[i] = '#'.repeat(fixedLevel) + ' ' + headingText;
        lastLevel = fixedLevel;
      } else {
        lastLevel = currentLevel;
      }
    }
  }

  return lines.join('\n');
}

function fixVerboseExplanations(content) {
  if (!content || typeof content !== 'string') return content;

  const replacements = [
    { from: /\bin order to\b/gi, to: 'to' },
    { from: /\bfor the purpose of\b/gi, to: 'for' },
    { from: /\bin the event that\b/gi, to: 'if' },
    { from: /\bat this point in time\b/gi, to: 'now' },
    { from: /\bdue to the fact that\b/gi, to: 'because' },
    { from: /\bhas the ability to\b/gi, to: 'can' },
    { from: /\bis able to\b/gi, to: 'can' },
    { from: /\bmake use of\b/gi, to: 'use' },
    { from: /\ba large number of\b/gi, to: 'many' },
    { from: /\ba small number of\b/gi, to: 'few' },
    { from: /\bthe majority of\b/gi, to: 'most' },
    { from: /\bprior to\b/gi, to: 'before' },
    { from: /\bsubsequent to\b/gi, to: 'after' }
  ];

  let result = content;

  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks = [];
  let placeholder = 0;

  result = result.replace(codeBlockRegex, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${placeholder++}__`;
  });

  for (const { from, to } of replacements) {
    result = result.replace(from, (match) => {
      // Preserve case of first character
      if (match[0] === match[0].toUpperCase()) {
        return to[0].toUpperCase() + to.slice(1);
      }
      return to;
    });
  }

  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
  }

  return result;
}

// ============================================
// PROMPT AUTO-FIX FUNCTIONS
// ============================================

/**
 * Add output format section to prompt
 * @param {string} content - Prompt content
 * @returns {string} Fixed content
 */
function fixMissingOutputFormat(content) {
  if (!content || typeof content !== 'string') return content;

  // Don't add if already has output format
  if (/##\s*output\s*format/i.test(content) || /<output_format>/i.test(content)) {
    return content;
  }

  const outputSection = `

## Output Format

Respond with:
- [Describe expected format: JSON, markdown, plain text, etc.]
- [Include any specific structure requirements]
`;

  return content.trim() + outputSection;
}

/**
 * Add example section to prompt
 * @param {string} content - Prompt content
 * @returns {string} Fixed content
 */
function fixMissingExamples(content) {
  if (!content || typeof content !== 'string') return content;

  // Don't add if already has examples
  if (/<example>|##\s*example/i.test(content)) {
    return content;
  }

  const exampleSection = `

## Examples

<good-example>
Input: [example input]
Output: [example output]
</good-example>

<bad-example>
Input: [example input]
Output: [what NOT to do]
Why bad: [explanation]
</bad-example>
`;

  return content.trim() + exampleSection;
}

/**
 * Add XML structure tags to complex prompt
 * @param {string} content - Prompt content
 * @returns {string} Fixed content
 */
function fixMissingXmlStructure(content) {
  if (!content || typeof content !== 'string') return content;

  // Don't add if already has XML
  if (/<[a-z_][a-z0-9_-]*>/i.test(content)) {
    return content;
  }

  // Wrap role section if exists
  let result = content;

  // Find and wrap role section
  result = result.replace(
    /^(##\s*(?:your\s+)?role\s*\n)([\s\S]*?)(?=\n##|\n---|\Z)/im,
    '<role>\n$1$2</role>\n'
  );

  // Find and wrap constraints section
  result = result.replace(
    /^(##\s*(?:constraints?|rules?)\s*\n)([\s\S]*?)(?=\n##|\n---|\Z)/im,
    '<constraints>\n$1$2</constraints>\n'
  );

  return result;
}

/**
 * Add verification criteria to task prompt
 * @param {string} content - Prompt content
 * @returns {string} Fixed content
 */
function fixMissingVerificationCriteria(content) {
  if (!content || typeof content !== 'string') return content;

  // Don't add if already has verification
  if (/\bverif|test|validate|expected\s+output/i.test(content)) {
    return content;
  }

  const verificationSection = `

## Verification

After completing this task:
- [ ] Run relevant tests to verify the change works
- [ ] Check for regressions in related functionality
- [ ] Verify expected output matches: [describe expected result]
`;

  return content.trim() + verificationSection;
}

/**
 * Add trigger phrase to skill description
 * @param {string} content - SKILL.md content
 * @returns {string} Fixed content
 */
function fixMissingTriggerPhrase(content) {
  if (!content || typeof content !== 'string') return content;

  const lines = content.split('\n');
  let inFrontmatter = false;
  let descriptionLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        break;
      }
    } else if (inFrontmatter && lines[i].startsWith('description:')) {
      descriptionLineIndex = i;
      break;
    }
  }

  if (descriptionLineIndex >= 0) {
    const descLine = lines[descriptionLineIndex];
    // Check if already has trigger phrase
    if (!/use when user asks/i.test(descLine)) {
      // Extract current description
      const match = descLine.match(/^description:\s*(.+)$/);
      if (match) {
        const currentDesc = match[1].trim();
        // Add trigger phrase
        lines[descriptionLineIndex] = `description: Use when user asks to ${currentDesc.toLowerCase().replace(/^to\s+/i, '')}`;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Reduce aggressive emphasis (CAPS, !!)
 * @param {string} content - Prompt content
 * @returns {string} Fixed content
 */
function fixAggressiveEmphasis(content) {
  if (!content || typeof content !== 'string') return content;

  let result = content;

  // Preserve code blocks
  const codeBlocks = [];
  let placeholder = 0;
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${placeholder++}__`;
  });

  // Acceptable CAPS to preserve
  const acceptableCaps = ['API', 'JSON', 'XML', 'HTML', 'CSS', 'URL', 'HTTP', 'HTTPS', 'SQL', 'CLI', 'SDK', 'JWT', 'UUID', 'REST', 'YAML', 'EOF', 'TODO', 'FIXME', 'NOTE', 'README', 'MCP', 'HIGH', 'MEDIUM', 'LOW'];

  // Replace aggressive CAPS with normal case (except acceptable ones)
  result = result.replace(/\b[A-Z]{3,}\b/g, (match) => {
    if (acceptableCaps.includes(match)) return match;
    // Convert to sentence case
    return match.charAt(0) + match.slice(1).toLowerCase();
  });

  // Remove multiple exclamation marks
  result = result.replace(/!{2,}/g, '!');

  // Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
  }

  return result;
}

module.exports = {
  applyFixes,
  fixAdditionalProperties,
  fixRequiredFields,
  fixVersionMismatch,
  fixMissingFrontmatter,
  fixUnrestrictedBash,
  fixMissingRole,
  fixInconsistentHeadings,
  fixVerboseExplanations,
  // New prompt fixes
  fixMissingOutputFormat,
  fixMissingExamples,
  fixMissingXmlStructure,
  fixMissingVerificationCriteria,
  fixMissingTriggerPhrase,
  fixAggressiveEmphasis,
  previewFixes,
  restoreFromBackup,
  cleanupBackups
};
