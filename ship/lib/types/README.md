# Plugin Interface Type Definitions

TypeScript type definitions for Claude Code plugin components.

## Overview

This directory contains the canonical type definitions for all plugin components:

- **Plugin Manifest** (`plugin.json`) - Plugin metadata and configuration
- **Command Frontmatter** - YAML metadata for slash commands
- **Agent Frontmatter** - YAML metadata for specialized agents
- **Skill Frontmatter** - YAML metadata for user-invocable skills
- **Hook Frontmatter** - YAML metadata for lifecycle hooks

## Usage

### TypeScript Projects

```typescript
import {
  PluginManifest,
  CommandFrontmatter,
  AgentFrontmatter,
  SkillFrontmatter,
  HookFrontmatter,
  validatePluginManifest,
  validateCommandFrontmatter
} from './lib/types';

// Validate a plugin manifest
const manifest: PluginManifest = {
  name: "my-plugin",
  version: "1.0.0",
  description: "My awesome plugin",
  author: {
    name: "John Doe"
  },
  license: "MIT"
};

validatePluginManifest(manifest); // Throws if invalid
```

### JavaScript Projects (JSDoc)

```javascript
/**
 * @typedef {import('./lib/types').PluginManifest} PluginManifest
 * @typedef {import('./lib/types').CommandFrontmatter} CommandFrontmatter
 */

/**
 * Load and validate plugin manifest
 * @param {string} path - Path to plugin.json
 * @returns {PluginManifest} Validated manifest
 */
function loadPluginManifest(path) {
  const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
  const { validatePluginManifest } = require('./lib/types/plugin-manifest');
  validatePluginManifest(manifest);
  return manifest;
}
```

## Type Definitions

### PluginManifest

Defines the structure of `plugin.json`:

```typescript
interface PluginManifest {
  name: string;                    // Unique identifier (kebab-case)
  version: string;                 // Semantic version (X.Y.Z)
  description: string;             // Short description
  author: PluginAuthor;            // Author info
  homepage?: string;               // Plugin homepage URL
  repository?: string;             // Repository URL
  license: string;                 // SPDX license identifier
  keywords?: string[];             // Search keywords
  minClaudeVersion?: string;       // Minimum Claude Code version
  dependencies?: {                 // Plugin dependencies
    [pluginName: string]: string;
  };
  config?: {                       // Plugin configuration
    [key: string]: unknown;
  };
}
```

### CommandFrontmatter

Defines YAML frontmatter for commands:

```yaml
---
command: my-command
description: Do something awesome
argument-hint: "[options]"
model: sonnet
requiresGit: true
tags:
  - utility
  - automation
---
```

```typescript
interface CommandFrontmatter {
  command: string;                 // Command name
  description: string;             // Short description
  'argument-hint'?: string;        // Autocomplete hint
  usage?: string[];                // Usage examples
  arguments?: CommandArgument[];   // Argument definitions
  aliases?: string[];              // Alternative names
  category?: string;               // Command category
  requiresGit?: boolean;           // Requires git repo
  requiresNetwork?: boolean;       // Requires network
  model?: 'sonnet' | 'opus' | 'haiku';
  maxTurns?: number;               // Max conversation turns
  tags?: string[];                 // Tags for search
}
```

### AgentFrontmatter

Defines YAML frontmatter for agents:

```yaml
---
agent: my-agent
description: Specialized agent for X
tools:
  - Read
  - Grep
  - Glob
model: opus
color: blue
maxTurns: 10
---
```

```typescript
interface AgentFrontmatter {
  agent: string;                   // Agent identifier
  description: string;             // Purpose description
  tools?: AgentTool[];             // Available tools
  model?: 'sonnet' | 'opus' | 'haiku';
  maxTurns?: number;               // Max turns
  color?: AgentColor;              // UI color
  canRunInBackground?: boolean;    // Background support
  requiresApproval?: boolean;      // User approval needed
  category?: string;               // Agent category
  tags?: string[];                 // Tags for search
  'when-to-use'?: string[];        // Triggering conditions
  examples?: string[];             // Usage examples
}
```

### SkillFrontmatter

Defines YAML frontmatter for skills:

```yaml
---
skill: my-skill
description: User-invocable skill
model: sonnet
when-to-use:
  - "User says /my-skill"
  - "Task requires X functionality"
---
```

```typescript
interface SkillFrontmatter {
  skill: string;                   // Skill identifier
  description: string;             // Purpose description
  category?: string;               // Skill category
  'when-to-use'?: string[];        // Triggering conditions
  examples?: string[];             // Usage examples
  model?: 'sonnet' | 'opus' | 'haiku';
  requiresApproval?: boolean;      // User approval needed
  tags?: string[];                 // Tags for search
  related?: string[];              // Related components
}
```

### HookFrontmatter

Defines YAML frontmatter for hooks:

```yaml
---
hook: my-hook
event: SubagentStop
description: Triggered when agent stops
priority: 10
enabled: true
---
```

```typescript
interface HookFrontmatter {
  hook: string;                    // Hook identifier
  event: HookEvent;                // Trigger event
  description: string;             // Purpose description
  tool?: string;                   // Tool name (for PreToolUse/PostToolUse)
  priority?: number;               // Execution priority
  enabled?: boolean;               // Enabled by default
  category?: string;               // Hook category
  tags?: string[];                 // Tags for search
  related?: string[];              // Related hooks
}
```

## Validation

All frontmatter types include validation functions:

```typescript
import {
  validatePluginManifest,
  validateCommandFrontmatter,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
  validateHookFrontmatter
} from './lib/types';

// Throws Error if invalid
validatePluginManifest(manifest);
validateCommandFrontmatter(frontmatter);
validateAgentFrontmatter(frontmatter);
validateSkillFrontmatter(frontmatter);
validateHookFrontmatter(frontmatter);
```

## Type Guards

Use type guards for runtime checking:

```typescript
import { isPluginManifest, isCommandFrontmatter } from './lib/types';

if (isPluginManifest(obj)) {
  // obj is PluginManifest
  console.log(obj.name);
}

if (isCommandFrontmatter(obj)) {
  // obj is CommandFrontmatter
  console.log(obj.command);
}
```

## Plugin Structure

Standard plugin directory structure:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── commands/                # Slash commands
│   └── my-command.md
├── agents/                  # Specialized agents
│   └── my-agent.md
├── skills/                  # User-invocable skills
│   └── my-skill.md
├── hooks/                   # Lifecycle hooks
│   └── my-hook.md
├── lib/                     # Shared libraries
│   ├── platform/
│   ├── patterns/
│   └── utils/
└── tests/                   # Tests
```

## Contributing

When adding new plugin component types:

1. Create a new `.d.ts` file in this directory
2. Define the interface with JSDoc comments
3. Add type guard function (`is*`)
4. Add validation function (`validate*`)
5. Export from `index.d.ts`
6. Update this README

## License

MIT © Avi Fenesh
