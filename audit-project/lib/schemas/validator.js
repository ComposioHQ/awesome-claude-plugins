/**
 * JSON Schema Validator
 * Validates plugin manifests against JSON Schema
 *
 * @module lib/schemas/validator
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');

/**
 * Simple JSON Schema validator (minimal implementation)
 * For production use, consider using a library like ajv
 */
class SchemaValidator {
  /**
   * Load a JSON Schema from file
   * @param {string} schemaPath - Path to schema file
   * @returns {Object} Loaded schema
   */
  static loadSchema(schemaPath) {
    const content = fs.readFileSync(schemaPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Validate data against a schema
   * @param {Object} data - Data to validate
   * @param {Object} schema - JSON Schema
   * @returns {{valid: boolean, errors: string[]}} Validation result
   */
  static validate(data, schema) {
    const errors = [];

    // Check type (handle arrays correctly and null separately)
    if (schema.type) {
      let actualType;
      if (data === null) {
        actualType = 'null';
      } else if (Array.isArray(data)) {
        actualType = 'array';
      } else {
        actualType = typeof data;
      }

      if (actualType !== schema.type) {
        errors.push(`Expected type ${schema.type}, got ${actualType}`);
        return { valid: false, errors };
      }
    }

    // String validations (for primitive string values)
    if (schema.type === 'string' && typeof data === 'string') {
      if (schema.minLength && data.length < schema.minLength) {
        errors.push(`String too short (min ${schema.minLength})`);
      }
      if (schema.maxLength && data.length > schema.maxLength) {
        errors.push(`String too long (max ${schema.maxLength})`);
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
        errors.push(`String does not match pattern ${schema.pattern}`);
      }
    }

    // Array validations (for primitive array values)
    if (schema.type === 'array' && Array.isArray(data)) {
      if (schema.minItems && data.length < schema.minItems) {
        errors.push(`Array too short (min ${schema.minItems})`);
      }
      if (schema.maxItems && data.length > schema.maxItems) {
        errors.push(`Array too long (max ${schema.maxItems})`);
      }
      if (schema.uniqueItems) {
        const seen = new Set();
        for (const item of data) {
          const key = JSON.stringify(item);
          if (seen.has(key)) {
            errors.push(`Array contains duplicate items`);
            break;
          }
          seen.add(key);
        }
      }
    }

    // Check required properties
    if (schema.required && Array.isArray(schema.required)) {
      for (const required of schema.required) {
        if (!(required in data)) {
          errors.push(`Missing required property: ${required}`);
        }
      }
    }

    // Check properties (guard against null)
    if (schema.properties && typeof data === 'object' && data !== null) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const propResult = this.validateProperty(data[key], propSchema, key);
          errors.push(...propResult.errors);
        }
      }
    }

    // Check additional properties (guard against null, honor patternProperties)
    if (schema.additionalProperties === false && typeof data === 'object' && data !== null) {
      const allowedKeys = new Set(Object.keys(schema.properties || {}));

      // Honor patternProperties - don't reject keys that match patterns
      const patternProps = schema.patternProperties || {};
      const patternRegexes = Object.keys(patternProps).map(p => new RegExp(p));

      for (const key of Object.keys(data)) {
        const matchesPattern = patternRegexes.some(regex => regex.test(key));
        if (!allowedKeys.has(key) && !matchesPattern) {
          errors.push(`Unexpected property: ${key}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a single property
   * @param {*} value - Property value
   * @param {Object} schema - Property schema
   * @param {string} path - Property path for error messages
   * @returns {{valid: boolean, errors: string[]}} Validation result
   */
  static validateProperty(value, schema, path) {
    const errors = [];

    // Type check
    if (schema.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== schema.type) {
        errors.push(`${path}: expected type ${schema.type}, got ${actualType}`);
        return { valid: false, errors };
      }
    }

    // String validations
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength && value.length < schema.minLength) {
        errors.push(`${path}: string too short (min ${schema.minLength})`);
      }
      if (schema.maxLength && value.length > schema.maxLength) {
        errors.push(`${path}: string too long (max ${schema.maxLength})`);
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push(`${path}: does not match pattern ${schema.pattern}`);
      }
    }

    // Array validations
    if (schema.type === 'array' && Array.isArray(value)) {
      if (schema.minItems && value.length < schema.minItems) {
        errors.push(`${path}: array too short (min ${schema.minItems})`);
      }
      if (schema.maxItems && value.length > schema.maxItems) {
        errors.push(`${path}: array too long (max ${schema.maxItems})`);
      }
      if (schema.uniqueItems) {
        const seen = new Set();
        for (const item of value) {
          const key = JSON.stringify(item);
          if (seen.has(key)) {
            errors.push(`${path}: duplicate items not allowed`);
            break;
          }
          seen.add(key);
        }
      }
    }

    // Object validations
    if (schema.type === 'object' && typeof value === 'object' && value !== null) {
      const result = this.validate(value, schema);
      for (const error of result.errors) {
        errors.push(`${path}.${error}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a plugin manifest
   * @param {Object} manifest - Plugin manifest to validate
   * @returns {{valid: boolean, errors: string[]}} Validation result
   */
  static validatePluginManifest(manifest) {
    const schemaPath = path.join(__dirname, 'plugin-manifest.schema.json');
    const schema = this.loadSchema(schemaPath);
    return this.validate(manifest, schema);
  }
}

/**
 * Validate a plugin manifest file
 * @param {string} manifestPath - Path to plugin.json
 * @returns {{valid: boolean, errors: string[], manifest?: Object}} Validation result
 */
function validateManifestFile(manifestPath) {
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);
    const result = SchemaValidator.validatePluginManifest(manifest);
    return { ...result, manifest };
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to load manifest: ${error.message}`]
    };
  }
}

module.exports = {
  SchemaValidator,
  validateManifestFile
};

// CLI usage
if (require.main === module) {
  const manifestPath = process.argv[2] || '.claude-plugin/plugin.json';

  console.log(`Validating: ${manifestPath}`);
  const result = validateManifestFile(manifestPath);

  if (result.valid) {
    console.log('[OK] Manifest is valid');
    if (result.manifest) {
      console.log(`  Plugin: ${result.manifest.name} v${result.manifest.version}`);
      console.log(`  Author: ${result.manifest.author.name}`);
    }
    process.exit(0);
  } else {
    console.error('[ERROR] Manifest is invalid:');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}
