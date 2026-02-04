/**
 * MCP Tool Definition Patterns
 * Detection patterns for MCP tool definition issues
 * Based on FUNCTION-CALLING-TOOL-USE-REFERENCE.md best practices
 *
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Tool definition patterns
 */
const toolPatterns = {
  /**
   * Tool name should be verb + noun
   * MEDIUM certainty - naming convention
   */
  poor_tool_naming: {
    id: 'poor_tool_naming',
    category: 'tool',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Tool name should follow verb_noun pattern',
    check: (tool) => {
      if (!tool || !tool.name) return null;

      const name = tool.name;
      // Check for common verb prefixes
      const verbPrefixes = ['get', 'set', 'create', 'delete', 'update', 'list', 'find', 'search', 'add', 'remove', 'check', 'validate', 'run', 'execute', 'start', 'stop', 'read', 'write'];
      const hasVerb = verbPrefixes.some(v => name.toLowerCase().startsWith(v));

      if (!hasVerb && name.length > 3) {
        return {
          issue: `Tool name "${name}" doesn't start with a verb`,
          fix: 'Rename to verb_noun pattern (e.g., get_user, create_file)'
        };
      }
      return null;
    }
  },

  /**
   * Use enums for constrained values
   * MEDIUM certainty - improves reliability
   */
  missing_enum: {
    id: 'missing_enum',
    category: 'tool',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Parameter with limited options should use enum',
    check: (schema) => {
      if (!schema || !schema.properties) return null;

      const issues = [];
      for (const [name, prop] of Object.entries(schema.properties)) {
        // Check for string params that mention specific options in description
        if (prop.type === 'string' && prop.description) {
          const desc = prop.description.toLowerCase();
          if ((desc.includes('one of') || desc.includes('must be') || desc.includes('can be')) &&
              !prop.enum) {
            issues.push({
              param: name,
              issue: `Parameter "${name}" describes options but doesn't use enum`,
              fix: 'Add enum array with valid options'
            });
          }
        }
      }

      return issues.length > 0 ? issues : null;
    }
  },

  /**
   * Flat structure preferred
   * MEDIUM certainty - improves LLM reliability
   */
  nested_structure: {
    id: 'nested_structure',
    category: 'tool',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Prefer flat parameter structure over nested objects',
    maxDepth: 2,
    check: (schema, depth = 0) => {
      if (!schema || typeof schema !== 'object') return null;

      if (depth > 2) {
        return {
          issue: `Schema nested ${depth} levels (prefer flat structure)`,
          fix: 'Flatten to max 2 levels for LLM reliability'
        };
      }

      if (schema.properties) {
        for (const [name, prop] of Object.entries(schema.properties)) {
          if (prop.type === 'object' && prop.properties) {
            const nested = toolPatterns.nested_structure.check(prop, depth + 1);
            if (nested) return { ...nested, param: name };
          }
        }
      }

      return null;
    }
  },

  /**
   * Parameter format hints
   * LOW certainty - improves clarity
   */
  missing_format_hints: {
    id: 'missing_format_hints',
    category: 'tool',
    certainty: 'LOW',
    autoFix: false,
    description: 'Parameter description could include format hints',
    check: (schema) => {
      if (!schema || !schema.properties) return null;

      const issues = [];
      const formatKeywords = ['date', 'time', 'email', 'url', 'path', 'json', 'uuid', 'regex'];

      for (const [name, prop] of Object.entries(schema.properties)) {
        if (prop.type === 'string' && prop.description) {
          const nameLower = name.toLowerCase();
          const descLower = prop.description.toLowerCase();

          // Check if name suggests a format but no format/pattern specified
          for (const keyword of formatKeywords) {
            if ((nameLower.includes(keyword) || descLower.includes(keyword)) &&
                !prop.format && !prop.pattern) {
              issues.push({
                param: name,
                issue: `Parameter "${name}" may need format hint`,
                fix: `Consider adding format or pattern for ${keyword} validation`
              });
              break;
            }
          }
        }
      }

      return issues.length > 0 ? issues : null;
    }
  },

  /**
   * Required parameters should be explicit
   * HIGH certainty - prevents ambiguity
   */
  implicit_required: {
    id: 'implicit_required',
    category: 'tool',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Parameters should explicitly declare required status',
    check: (schema) => {
      if (!schema || !schema.properties) return null;

      const propCount = Object.keys(schema.properties).length;
      const requiredCount = schema.required?.length || 0;

      // If properties exist but no required array
      if (propCount > 0 && !schema.required) {
        return {
          issue: 'No required array defined',
          fix: 'Add required array listing mandatory parameters',
          autoFixFn: (s) => ({
            ...s,
            required: Object.keys(s.properties).filter(k => {
              const prop = s.properties[k];
              // Consider params required unless they have default or are marked optional
              return !prop.default && !/optional/i.test(prop.description || '');
            })
          })
        };
      }

      return null;
    }
  },

  /**
   * Strict mode recommended
   * HIGH certainty - prevents undefined behavior
   */
  missing_strict_mode: {
    id: 'missing_strict_mode',
    category: 'tool',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Schema should use strict mode (additionalProperties: false)',
    check: (schema) => {
      if (!schema || schema.type !== 'object') return null;

      if (schema.additionalProperties !== false) {
        return {
          issue: 'Schema not in strict mode',
          fix: 'Add additionalProperties: false',
          autoFixFn: (s) => ({ ...s, additionalProperties: false })
        };
      }

      return null;
    }
  },

  /**
   * Description quality check
   * LOW certainty - stylistic
   */
  poor_description: {
    id: 'poor_description',
    category: 'tool',
    certainty: 'LOW',
    autoFix: false,
    description: 'Tool description could be more descriptive',
    minLength: 20,
    check: (tool) => {
      if (!tool || !tool.description) return null;

      const desc = tool.description.trim();

      // Too short
      if (desc.length < 20) {
        return {
          issue: `Description too short (${desc.length} chars)`,
          fix: 'Add more detail about what the tool does'
        };
      }

      // Just repeats the name
      if (tool.name && desc.toLowerCase().replace(/[_-]/g, ' ') === tool.name.toLowerCase().replace(/[_-]/g, ' ')) {
        return {
          issue: 'Description just repeats tool name',
          fix: 'Describe what the tool does, not its name'
        };
      }

      return null;
    }
  },

  /**
   * Redundant tool detection
   * LOW certainty - may be intentional
   */
  redundant_tools: {
    id: 'redundant_tools',
    category: 'tool',
    certainty: 'LOW',
    autoFix: false,
    description: 'Potentially redundant tools with similar functionality',
    check: (tools) => {
      if (!tools || !Array.isArray(tools) || tools.length < 2) return null;

      const issues = [];
      const seen = new Map();

      for (const tool of tools) {
        if (!tool.name) continue;

        // Normalize name for comparison
        const normalized = tool.name.toLowerCase()
          .replace(/[_-]/g, '')
          .replace(/^(get|fetch|retrieve|find|search)/, 'get')
          .replace(/^(set|update|modify|change)/, 'set')
          .replace(/^(create|make|add|new)/, 'create')
          .replace(/^(delete|remove|destroy)/, 'delete');

        if (seen.has(normalized)) {
          issues.push({
            tool1: seen.get(normalized),
            tool2: tool.name,
            issue: `Tools "${seen.get(normalized)}" and "${tool.name}" may be redundant`,
            fix: 'Consider consolidating into single tool'
          });
        }
        seen.set(normalized, tool.name);
      }

      return issues.length > 0 ? issues : null;
    }
  }
};

/**
 * Get all tool patterns
 * @returns {Object} All tool patterns
 */
function getAllPatterns() {
  return toolPatterns;
}

/**
 * Get patterns by certainty level
 * @param {string} certainty - HIGH, MEDIUM, or LOW
 * @returns {Object} Filtered patterns
 */
function getPatternsByCertainty(certainty) {
  const result = {};
  for (const [name, pattern] of Object.entries(toolPatterns)) {
    if (pattern.certainty === certainty) {
      result[name] = pattern;
    }
  }
  return result;
}

/**
 * Analyze a tool definition
 * @param {Object} tool - Tool definition object
 * @returns {Array} Array of issues found
 */
function analyzeTool(tool) {
  const issues = [];

  for (const [name, pattern] of Object.entries(toolPatterns)) {
    if (pattern.check && name !== 'redundant_tools') {
      const result = pattern.check(tool);
      if (result) {
        if (Array.isArray(result)) {
          issues.push(...result.map(r => ({ ...r, patternId: pattern.id, certainty: pattern.certainty })));
        } else {
          issues.push({ ...result, patternId: pattern.id, certainty: pattern.certainty });
        }
      }
    }
  }

  // Check schema separately
  if (tool.inputSchema || tool.parameters) {
    const schema = tool.inputSchema || tool.parameters;
    for (const [name, pattern] of Object.entries(toolPatterns)) {
      if (pattern.check && ['nested_structure', 'missing_enum', 'missing_format_hints', 'implicit_required', 'missing_strict_mode'].includes(name)) {
        const result = pattern.check(schema);
        if (result) {
          if (Array.isArray(result)) {
            issues.push(...result.map(r => ({ ...r, patternId: pattern.id, certainty: pattern.certainty, tool: tool.name })));
          } else {
            issues.push({ ...result, patternId: pattern.id, certainty: pattern.certainty, tool: tool.name });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Check for redundant tools across a set
 * @param {Array} tools - Array of tool definitions
 * @returns {Array} Array of redundancy issues
 */
function checkRedundancy(tools) {
  const pattern = toolPatterns.redundant_tools;
  const result = pattern.check(tools);
  if (result) {
    return result.map(r => ({ ...r, patternId: pattern.id, certainty: pattern.certainty }));
  }
  return [];
}

module.exports = {
  toolPatterns,
  getAllPatterns,
  getPatternsByCertainty,
  analyzeTool,
  checkRedundancy
};
