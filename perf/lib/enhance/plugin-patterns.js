/**
 * Plugin Structure Patterns
 * Detection patterns for plugin.json and structure issues
 *
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Plugin structure patterns with certainty levels
 * Following the slop-patterns model
 */
const pluginPatterns = {
  /**
   * Missing additionalProperties in schema
   * HIGH certainty - always fixable
   */
  missing_additional_properties: {
    id: 'missing_additional_properties',
    category: 'tool',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Schema missing additionalProperties: false',
    check: (schema) => {
      if (!schema || typeof schema !== 'object') return null;
      if (schema.type === 'object' && schema.properties) {
        if (schema.additionalProperties !== false) {
          return {
            issue: 'Missing additionalProperties: false',
            fix: 'Add "additionalProperties": false to schema',
            autoFixFn: (s) => ({ ...s, additionalProperties: false })
          };
        }
      }
      return null;
    }
  },

  /**
   * Missing required array in schema
   * HIGH certainty - fixable by adding all properties
   */
  missing_required_fields: {
    id: 'missing_required_fields',
    category: 'tool',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Schema missing required field declarations',
    check: (schema) => {
      if (!schema || typeof schema !== 'object') return null;
      if (schema.type === 'object' && schema.properties) {
        const propKeys = Object.keys(schema.properties);
        if (propKeys.length > 0 && (!schema.required || schema.required.length === 0)) {
          return {
            issue: 'No required fields declared',
            fix: 'Add required array with all mandatory fields'
            // autoFixFn is provided by plugin-analyzer which uses fixer.fixRequiredFields
          };
        }
      }
      return null;
    }
  },

  /**
   * Version mismatch between plugin.json and package.json
   * HIGH certainty - fixable by syncing
   */
  version_mismatch: {
    id: 'version_mismatch',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: true,
    description: 'Version mismatch between plugin.json and package.json',
    check: (pluginJson, packageJson) => {
      if (!pluginJson || !packageJson) return null;
      if (pluginJson.version !== packageJson.version) {
        return {
          issue: `Version mismatch: plugin.json (${pluginJson.version}) vs package.json (${packageJson.version})`,
          fix: 'Sync versions',
          autoFixFn: (pj) => ({ ...pj, version: packageJson.version })
        };
      }
      return null;
    }
  },

  /**
   * Missing tool description
   * HIGH certainty - must have description
   */
  missing_tool_description: {
    id: 'missing_tool_description',
    category: 'tool',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Tool definition missing description',
    check: (tool) => {
      if (!tool || typeof tool !== 'object') return null;
      if (!tool.description || tool.description.trim() === '') {
        return {
          issue: 'Missing tool description',
          fix: 'Add descriptive description field'
        };
      }
      return null;
    }
  },

  /**
   * Deeply nested parameter structure
   * MEDIUM certainty - may be intentional
   */
  deep_nesting: {
    id: 'deep_nesting',
    category: 'tool',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Parameter schema too deeply nested (>2 levels)',
    maxDepth: 2,
    check: (schema, depth = 0) => {
      if (!schema || typeof schema !== 'object') return null;
      if (depth > 2) {
        return {
          issue: `Schema nested ${depth} levels deep (max: 2)`,
          fix: 'Flatten parameter structure'
        };
      }
      // Check nested properties
      if (schema.properties) {
        for (const prop of Object.values(schema.properties)) {
          const nested = pluginPatterns.deep_nesting.check(prop, depth + 1);
          if (nested) return nested;
        }
      }
      return null;
    }
  },

  /**
   * Tool description too long
   * MEDIUM certainty - affects token efficiency
   */
  long_description: {
    id: 'long_description',
    category: 'tool',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Tool description exceeds 500 characters',
    maxLength: 500,
    check: (tool) => {
      if (!tool || typeof tool !== 'object') return null;
      if (tool.description && tool.description.length > 500) {
        return {
          issue: `Description too long (${tool.description.length} chars, max: 500)`,
          fix: 'Shorten description for token efficiency'
        };
      }
      return null;
    }
  },

  /**
   * Missing parameter descriptions
   * MEDIUM certainty - improves clarity
   */
  missing_param_description: {
    id: 'missing_param_description',
    category: 'tool',
    certainty: 'MEDIUM',
    autoFix: false,
    description: 'Parameter missing description',
    check: (schema) => {
      if (!schema || !schema.properties) return null;
      const missing = [];
      for (const [name, prop] of Object.entries(schema.properties)) {
        if (!prop.description || prop.description.trim() === '') {
          missing.push(name);
        }
      }
      if (missing.length > 0) {
        return {
          issue: `Parameters missing descriptions: ${missing.join(', ')}`,
          fix: 'Add descriptions to all parameters'
        };
      }
      return null;
    }
  },

  /**
   * Too many tools in plugin
   * LOW certainty - advisory
   */
  tool_overexposure: {
    id: 'tool_overexposure',
    category: 'structure',
    certainty: 'LOW',
    autoFix: false,
    description: 'Plugin exposes many tools (consider splitting)',
    maxTools: 10,
    check: (pluginJson) => {
      if (!pluginJson) return null;
      const toolCount = (pluginJson.commands?.length || 0) + (pluginJson.agents?.length || 0);
      if (toolCount > 10) {
        return {
          issue: `Plugin has ${toolCount} tools/commands (consider splitting)`,
          fix: 'Consider splitting into multiple focused plugins'
        };
      }
      return null;
    }
  },

  /**
   * Missing required plugin.json fields
   * HIGH certainty
   */
  missing_required_plugin_fields: {
    id: 'missing_required_plugin_fields',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Plugin.json missing required fields',
    requiredFields: ['name', 'version', 'description'],
    check: (pluginJson) => {
      if (!pluginJson) return null;
      const missing = [];
      for (const field of pluginPatterns.missing_required_plugin_fields.requiredFields) {
        if (!pluginJson[field]) {
          missing.push(field);
        }
      }
      if (missing.length > 0) {
        return {
          issue: `Missing required fields: ${missing.join(', ')}`,
          fix: 'Add required fields to plugin.json'
        };
      }
      return null;
    }
  },

  /**
   * Invalid version format
   * HIGH certainty
   */
  invalid_version_format: {
    id: 'invalid_version_format',
    category: 'structure',
    certainty: 'HIGH',
    autoFix: false,
    description: 'Version does not follow semver format',
    check: (pluginJson) => {
      if (!pluginJson || !pluginJson.version) return null;
      const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;
      if (!semverRegex.test(pluginJson.version)) {
        return {
          issue: `Invalid version format: ${pluginJson.version}`,
          fix: 'Use semver format (e.g., 1.0.0)'
        };
      }
      return null;
    }
  }
};

/**
 * Get all patterns
 * @returns {Object} All plugin patterns
 */
function getAllPatterns() {
  return pluginPatterns;
}

/**
 * Get patterns by certainty level
 * @param {string} certainty - HIGH, MEDIUM, or LOW
 * @returns {Object} Filtered patterns
 */
function getPatternsByCertainty(certainty) {
  const result = {};
  for (const [name, pattern] of Object.entries(pluginPatterns)) {
    if (pattern.certainty === certainty) {
      result[name] = pattern;
    }
  }
  return result;
}

/**
 * Get patterns by category
 * @param {string} category - tool, structure, security
 * @returns {Object} Filtered patterns
 */
function getPatternsByCategory(category) {
  const result = {};
  for (const [name, pattern] of Object.entries(pluginPatterns)) {
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
  for (const [name, pattern] of Object.entries(pluginPatterns)) {
    if (pattern.autoFix) {
      result[name] = pattern;
    }
  }
  return result;
}

module.exports = {
  pluginPatterns,
  getAllPatterns,
  getPatternsByCertainty,
  getPatternsByCategory,
  getAutoFixablePatterns
};
