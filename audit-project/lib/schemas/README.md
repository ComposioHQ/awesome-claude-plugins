# JSON Schema Definitions

JSON Schema validation for plugin manifests and configuration files.

## Overview

This directory contains JSON Schema definitions and validators for:

- **Plugin Manifest** (`plugin.json`) - Plugin metadata validation
- Additional schemas can be added for other JSON config files

## Files

- `plugin-manifest.schema.json` - JSON Schema for plugin.json
- `validator.js` - Schema validation utility
- `README.md` - This file

## Usage

### Command Line

Validate a plugin manifest:

```bash
# Validate default location
node lib/schemas/validator.js

# Validate specific file
node lib/schemas/validator.js plugins/next-task/.claude-plugin/plugin.json

# Output on success:
# [OK] Manifest is valid
#   Plugin: next-task v3.0.0
#   Author: Avi Fenesh

# Output on failure:
# [ERROR] Manifest is invalid:
#   - Missing required property: name
#   - version: does not match pattern
```

### Programmatic Use

```javascript
const { validateManifestFile, SchemaValidator } = require('./lib/schemas/validator');

// Validate a manifest file
const result = validateManifestFile('.claude-plugin/plugin.json');
if (result.valid) {
  console.log('Valid!', result.manifest);
} else {
  console.error('Errors:', result.errors);
}

// Validate manifest object directly
const manifest = {
  name: "my-plugin",
  version: "1.0.0",
  description: "My awesome plugin",
  author: { name: "John Doe" },
  license: "MIT"
};

const validation = SchemaValidator.validatePluginManifest(manifest);
if (!validation.valid) {
  console.error(validation.errors);
}
```

### Integration in Tests

```javascript
const { validateManifestFile } = require('./lib/schemas/validator');
const path = require('path');

describe('Plugin Manifest', () => {
  it('should be valid', () => {
    const result = validateManifestFile(
      path.join(__dirname, '../.claude-plugin/plugin.json')
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should have required fields', () => {
    const result = validateManifestFile(
      path.join(__dirname, '../.claude-plugin/plugin.json')
    );
    expect(result.manifest.name).toBeTruthy();
    expect(result.manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

## Schema Details

### plugin-manifest.schema.json

Validates `plugin.json` files with the following rules:

**Required fields:**
- `name` - Kebab-case identifier (e.g., "awesome-slash")
- `version` - Semantic version (e.g., "1.0.0")
- `description` - 10-500 characters
- `author` - Object with `name` field
- `license` - SPDX identifier (e.g., "MIT")

**Optional fields:**
- `homepage` - URL to plugin homepage
- `repository` - URL to source repository
- `keywords` - Array of search terms (1-20 items)
- `minClaudeVersion` - Minimum required version
- `dependencies` - Plugin dependencies
- `config` - Plugin configuration

**Constraints:**
- `name` must be lowercase, kebab-case
- `version` must follow semver (X.Y.Z)
- `keywords` must be unique, 2-50 chars each
- `author.email` must be valid email format
- `author.url` must be valid URI format

### Example Valid Manifest

```json
{
  "name": "awesome-slash",
  "version": "3.0.0",
  "description": "Professional-grade slash commands for Claude Code",
  "author": {
    "name": "Avi Fenesh",
    "email": "[email protected]",
    "url": "https://github.com/avifenesh"
  },
  "homepage": "https://github.com/avifenesh/awesome-slash",
  "repository": "https://github.com/avifenesh/awesome-slash",
  "license": "MIT",
  "keywords": ["workflow", "automation", "productivity"],
  "minClaudeVersion": "1.0.0"
}
```

## Validation Errors

Common validation errors and fixes:

### "Missing required property: name"
**Fix:** Add `name` field to plugin.json

### "name: does not match pattern"
**Fix:** Use lowercase, kebab-case (e.g., "my-plugin" not "MyPlugin")

### "version: does not match pattern"
**Fix:** Use semantic version format: "1.0.0" not "v1.0" or "1.0"

### "description: string too short"
**Fix:** Provide description with at least 10 characters

### "Unexpected property: xyz"
**Fix:** Remove invalid field or update schema if it's a new field

### "keywords: array too long"
**Fix:** Use maximum 20 keywords

## Adding New Schemas

To add validation for other JSON files:

1. Create `{name}.schema.json` in this directory
2. Add validator method to `validator.js`:
   ```javascript
   static validate{Name}(data) {
     const schema = this.loadSchema(path.join(__dirname, '{name}.schema.json'));
     return this.validate(data, schema);
   }
   ```
3. Export validation function
4. Update this README

## External Tools

For more advanced validation, consider using:

- [ajv](https://ajv.js.org/) - Production-grade JSON Schema validator
- [json-schema-validator](https://www.jsonschemavalidator.net/) - Online validator
- [VSCode JSON Schema](https://code.visualstudio.com/docs/languages/json#_json-schemas) - IDE integration

## Related

- **TypeScript Types**: `lib/types/` - TypeScript definitions for same structures
- **Plugin Manifest Spec**: See `lib/types/README.md` for detailed type documentation

## License

MIT © Avi Fenesh
