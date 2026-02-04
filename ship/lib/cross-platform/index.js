/**
 * Cross-Platform Best Practices Library
 *
 * Patterns and utilities for building tools that work across:
 * - Claude Code (Anthropic)
 * - OpenCode (multi-model)
 * - Codex CLI (OpenAI)
 *
 * Based on research from official documentation:
 * - Anthropic Claude 4 Best Practices
 * - OpenCode CLI Documentation
 * - Codex CLI Skills and MCP Integration
 * - MCP Specification (2025-11-25)
 *
 * @module cross-platform
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Platform detection and configuration
 */
const PLATFORMS = {
  CLAUDE_CODE: 'claude-code',
  OPENCODE: 'opencode',
  CODEX_CLI: 'codex-cli'
};

/**
 * State directory by platform
 * Each platform uses its own directory to avoid conflicts
 */
const STATE_DIRS = {
  [PLATFORMS.CLAUDE_CODE]: '.claude',
  [PLATFORMS.OPENCODE]: '.opencode',
  [PLATFORMS.CODEX_CLI]: '.codex'
};

/**
 * Get the state directory for the current platform
 * Uses AI_STATE_DIR env var if set, otherwise defaults to .claude
 *
 * @returns {string} State directory name
 */
function getStateDir() {
  return process.env.AI_STATE_DIR || STATE_DIRS[PLATFORMS.CLAUDE_CODE];
}

/**
 * Detect current platform from environment
 *
 * @returns {string} Platform identifier
 */
function detectPlatform() {
  const stateDir = process.env.AI_STATE_DIR;
  if (stateDir === '.opencode') return PLATFORMS.OPENCODE;
  if (stateDir === '.codex') return PLATFORMS.CODEX_CLI;
  return PLATFORMS.CLAUDE_CODE;
}

/**
 * Get plugin root directory (works across all platforms)
 *
 * Search order:
 * 1. PLUGIN_ROOT env var (MCP mode)
 * 2. Search plugin installation directories
 *
 * @param {string} pluginName - Plugin name (e.g., 'enhance')
 * @returns {string} Plugin root path or null if not found
 */
function getPluginRoot(pluginName = 'enhance') {
  // Try environment variable first (MCP mode)
  if (process.env.PLUGIN_ROOT) {
    return process.env.PLUGIN_ROOT;
  }

  // Try to find in plugin cache
  const stateDir = getStateDir();
  const home = os.homedir();

  // Search pattern: ~/.{stateDir}/plugins/cache/awesome-slash/{pluginName}/{version}
  const searchPaths = [
    path.join(home, stateDir, 'plugins', 'cache', 'awesome-slash', pluginName),
    path.join(home, stateDir, 'plugins', 'awesome-slash', pluginName)
  ];

  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      // Find latest version directory
      const versions = fs.readdirSync(searchPath).filter(v => {
        return fs.statSync(path.join(searchPath, v)).isDirectory();
      });

      if (versions.length > 0) {
        // Sort by version and take latest
        const latest = versions.sort().reverse()[0];
        return path.join(searchPath, latest);
      }
    }
  }

  return null;
}

/**
 * Get path to enhance suppressions file
 *
 * @returns {string} Path to suppressions.json in state directory
 */
function getSuppressionPath() {
  const stateDir = getStateDir();
  const home = os.homedir();
  return path.join(home, stateDir, 'enhance', 'suppressions.json');
}

/**
 * MCP Tool Schema Best Practices
 *
 * Guidelines for cross-platform tool definitions:
 * 1. Use descriptive, semantic names (workflow_status not ws)
 * 2. Keep descriptions concise (<100 chars) for token efficiency
 * 3. Use flat parameter structures when possible
 * 4. Include enums for constrained values
 * 5. Make parameters optional with sensible defaults
 */
const TOOL_SCHEMA_GUIDELINES = {
  // Max description length for token efficiency
  maxDescriptionLength: 100,

  // Naming conventions
  namingPattern: /^[a-z][a-z0-9_]*$/,

  // Parameter best practices
  preferFlatStructures: true,
  useEnumsForConstraints: true,
  documentDefaults: true
};

/**
 * Create a tool definition following cross-platform best practices
 *
 * @param {string} name - Tool name (snake_case)
 * @param {string} description - Concise description
 * @param {Object} properties - Input schema properties
 * @param {string[]} required - Required property names
 * @returns {Object} MCP-compatible tool definition
 */
function createToolDefinition(name, description, properties = {}, required = []) {
  // Validate name
  if (!TOOL_SCHEMA_GUIDELINES.namingPattern.test(name)) {
    console.warn(`Tool name "${name}" should be snake_case`);
  }

  // Warn if description too long
  if (description.length > TOOL_SCHEMA_GUIDELINES.maxDescriptionLength) {
    console.warn(`Tool "${name}" description exceeds ${TOOL_SCHEMA_GUIDELINES.maxDescriptionLength} chars`);
  }

  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      required
    }
  };
}

/**
 * Error Response Patterns
 *
 * MCP uses isError flag for application errors, NOT JSON-RPC error codes.
 * Error messages should be actionable so AI can recover.
 */

/**
 * Create a success response
 *
 * @param {*} data - Response data (will be JSON stringified if object)
 * @returns {Object} MCP content response
 */
function successResponse(data) {
  const text = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
  return {
    content: [{ type: 'text', text }]
  };
}

/**
 * Create an error response with actionable message
 *
 * @param {string} message - Error message (should suggest recovery)
 * @param {Object} details - Optional additional details
 * @returns {Object} MCP error response
 */
function errorResponse(message, details = null) {
  let text = `Error: ${message}`;
  if (details) {
    text += `\nDetails: ${JSON.stringify(details)}`;
  }
  return {
    content: [{ type: 'text', text }],
    isError: true
  };
}

/**
 * Create an error response for missing tool
 *
 * @param {string} name - Tool name that was requested
 * @param {string[]} available - List of available tools
 * @returns {Object} MCP error response
 */
function unknownToolResponse(name, available = []) {
  let text = `Error: Unknown tool "${name}"`;
  if (available.length > 0) {
    text += `\nAvailable tools: ${available.join(', ')}`;
  }
  return {
    content: [{ type: 'text', text }],
    isError: true
  };
}

/**
 * Prompt Formatting for Cross-Model Compatibility
 *
 * Different models have different preferences:
 * - Claude: Trained with XML tags, follows instructions literally
 * - GPT-4: Prefers Markdown, more flexible interpretation
 *
 * For maximum compatibility, use both:
 * - Markdown headers for major sections
 * - XML tags for data blocks
 */

/**
 * Format structured data for cross-model prompts
 *
 * @param {string} tag - XML-style tag name
 * @param {string} content - Content to wrap
 * @returns {string} Formatted content block
 */
function formatBlock(tag, content) {
  return `<${tag}>\n${content}\n</${tag}>`;
}

/**
 * Format a list of items for prompts
 *
 * @param {string[]} items - Items to format
 * @param {boolean} numbered - Use numbered list
 * @returns {string} Formatted list
 */
function formatList(items, numbered = false) {
  return items.map((item, i) => {
    const prefix = numbered ? `${i + 1}.` : '-';
    return `${prefix} ${item}`;
  }).join('\n');
}

/**
 * Create an agent prompt section with cross-model formatting
 *
 * @param {string} title - Section title
 * @param {string} content - Section content
 * @returns {string} Formatted section
 */
function formatSection(title, content) {
  return `## ${title}\n\n${content}\n`;
}

/**
 * Token Efficiency Strategies
 *
 * Key insights from research:
 * - MCP tools can consume 50K+ tokens before conversation starts
 * - Concise descriptions reduce overhead by 60%+
 * - Consolidate similar tools (one tool with filter vs many tools)
 * - Return minimal structured JSON, not verbose text
 */

/**
 * Truncate text to limit with ellipsis
 *
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Create a compact summary of findings/results
 *
 * @param {Array} items - Items to summarize
 * @param {Function} keyFn - Function to extract key from item
 * @param {number} maxItems - Maximum items to include
 * @returns {Object} Compact summary
 */
function compactSummary(items, keyFn, maxItems = 10) {
  const limited = items.slice(0, maxItems);
  const truncated = items.length > maxItems;

  // Group by key
  const groups = {};
  for (const item of limited) {
    const key = keyFn(item);
    groups[key] = (groups[key] || 0) + 1;
  }

  return {
    total: items.length,
    showing: limited.length,
    truncated,
    byKey: groups
  };
}

/**
 * Agent Prompt Best Practices
 *
 * Cross-model recommendations:
 * 1. State instructions explicitly - don't rely on inference
 * 2. Put critical constraints at START and END (Lost in Middle)
 * 3. Use imperative language: "Do X", "Never Y"
 * 4. Include 2-3 examples for complex tasks
 * 5. Explicit tool allowlisting
 * 6. Flat state management - pass state each turn
 */

/**
 * Agent prompt template structure
 */
const AGENT_TEMPLATE = `# Agent: {name}

## Role
{role}

## Instructions
{instructions}

## Tools Available
{tools}
If a tool is not listed above, respond with: "Tool not available"

## Output Format
{outputFormat}

## Critical Constraints
{constraints}`;

/**
 * Create an agent prompt from template
 *
 * @param {Object} config - Agent configuration
 * @param {string} config.name - Agent name
 * @param {string} config.role - One-sentence role description
 * @param {string[]} config.instructions - Imperative instructions
 * @param {Object[]} config.tools - Available tools {name, description}
 * @param {string} config.outputFormat - Expected output format
 * @param {string[]} config.constraints - Critical constraints (repeated for emphasis)
 * @returns {string} Formatted agent prompt
 */
function createAgentPrompt(config) {
  const {
    name,
    role,
    instructions = [],
    tools = [],
    outputFormat = 'Respond with structured JSON',
    constraints = []
  } = config;

  // Format instructions as numbered list
  const instructionsList = instructions.map((inst, i) => `${i + 1}. ${inst}`).join('\n');

  // Format tools
  const toolsList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

  // Format constraints (repeated for "Lost in Middle" mitigation)
  const constraintsList = constraints.map(c => `- **${c}**`).join('\n');

  return AGENT_TEMPLATE
    .replace('{name}', name)
    .replace('{role}', role)
    .replace('{instructions}', instructionsList)
    .replace('{tools}', toolsList)
    .replace('{outputFormat}', outputFormat)
    .replace('{constraints}', constraintsList);
}

/**
 * Convert a path to forward slashes (safe for require() on all platforms)
 * Windows paths with backslashes break in require() strings
 *
 * @param {string} p - Path to normalize
 * @returns {string} Path with forward slashes
 */
function normalizePathForRequire(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Platform-specific configuration helpers
 */

/**
 * Get OpenCode MCP configuration object
 *
 * @param {string} serverPath - Path to MCP server
 * @param {Object} env - Environment variables
 * @returns {Object} OpenCode config structure
 */
function getOpenCodeConfig(serverPath, env = {}) {
  return {
    mcp: {
      'awesome-slash': {
        type: 'local',
        command: ['node', serverPath],
        environment: {
          PLUGIN_ROOT: path.dirname(path.dirname(serverPath)),
          AI_STATE_DIR: '.opencode',
          ...env
        },
        timeout: 10000,
        enabled: true
      }
    }
  };
}

/**
 * Get Codex CLI MCP configuration (TOML format)
 *
 * @param {string} serverPath - Path to MCP server
 * @param {Object} env - Environment variables
 * @returns {string} TOML configuration
 */
function getCodexConfig(serverPath, env = {}) {
  const envEntries = Object.entries({
    PLUGIN_ROOT: path.dirname(path.dirname(serverPath)),
    AI_STATE_DIR: '.codex',
    ...env
  }).map(([k, v]) => `${k} = "${v}"`).join(', ');

  return `
[mcp_servers.awesome-slash]
command = "node"
args = ["${serverPath}"]
env = { ${envEntries} }
enabled = true
`.trim();
}

/**
 * Instruction file conventions by platform
 */
const INSTRUCTION_FILES = {
  [PLATFORMS.CLAUDE_CODE]: ['CLAUDE.md', '.claude/CLAUDE.md'],
  [PLATFORMS.OPENCODE]: ['AGENTS.md', 'CLAUDE.md'],
  [PLATFORMS.CODEX_CLI]: ['AGENTS.md', 'AGENTS.override.md']
};

/**
 * Get instruction file paths for current platform
 *
 * @param {string} platform - Platform identifier
 * @returns {string[]} Instruction file paths in precedence order
 */
function getInstructionFiles(platform = null) {
  const p = platform || detectPlatform();
  return INSTRUCTION_FILES[p] || INSTRUCTION_FILES[PLATFORMS.CLAUDE_CODE];
}

module.exports = {
  // Platform detection
  PLATFORMS,
  STATE_DIRS,
  getStateDir,
  detectPlatform,
  getPluginRoot,
  getSuppressionPath,

  // Tool schema
  TOOL_SCHEMA_GUIDELINES,
  createToolDefinition,

  // Response helpers
  successResponse,
  errorResponse,
  unknownToolResponse,

  // Prompt formatting
  formatBlock,
  formatList,
  formatSection,

  // Token efficiency
  truncate,
  compactSummary,

  // Agent prompts
  AGENT_TEMPLATE,
  createAgentPrompt,

  // Platform configs
  getOpenCodeConfig,
  getCodexConfig,
  getInstructionFiles,
  INSTRUCTION_FILES,

  // Path normalization
  normalizePathForRequire
};
