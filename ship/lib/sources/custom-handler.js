/**
 * Custom Source Handler
 * Handles follow-up questions and tool probing for custom sources
 *
 * @module lib/sources/custom-handler
 */

const { execFileSync } = require('child_process');
const sourceCache = require('./source-cache');

/**
 * Validate tool name to prevent command injection
 * Only allows alphanumeric, hyphens, and underscores
 * @param {string} toolName - Tool name to validate
 * @returns {boolean} True if valid
 */
function isValidToolName(toolName) {
  return /^[a-zA-Z0-9_-]+$/.test(toolName);
}

/**
 * Source types for custom selection
 */
const SOURCE_TYPES = {
  MCP: 'mcp',
  CLI: 'cli',
  SKILL: 'skill',
  FILE: 'file'
};

/**
 * Build follow-up questions for custom source
 * Returns AskUserQuestion-compatible structure
 * @returns {Object} Questions object for AskUserQuestion tool
 */
function getCustomTypeQuestion() {
  return {
    header: 'Source Type',
    question: 'What type of source is this?',
    options: [
      { label: 'CLI Tool', description: 'Command-line tool (e.g., tea, glab, jira-cli)' },
      { label: 'MCP Server', description: 'Model Context Protocol server' },
      { label: 'Skill/Plugin', description: 'Claude Code skill or plugin' },
      { label: 'File Path', description: 'Local file with tasks (markdown, JSON, etc.)' }
    ],
    multiSelect: false
  };
}

/**
 * Build name/path question based on type
 * @param {string} type - Source type (mcp, cli, skill, file)
 * @returns {Object} Questions object for AskUserQuestion tool
 */
function getCustomNameQuestion(type) {
  const prompts = {
    cli: { header: 'CLI Tool', question: 'What is the CLI tool name?', hint: 'e.g., tea, glab, jira' },
    mcp: { header: 'MCP Server', question: 'What is the MCP server name?', hint: 'e.g., gitea-mcp, linear-mcp' },
    skill: { header: 'Skill Name', question: 'What is the skill name?', hint: 'e.g., linear:list-issues' },
    file: { header: 'File Path', question: 'What is the file path?', hint: 'e.g., ./backlog.md, /docs/tasks.json' }
  };
  return prompts[type] || prompts.cli;
}

/**
 * Map user's type selection to internal type
 * @param {string} selection - User's selection label
 * @returns {string} Internal type (mcp, cli, skill, file)
 */
function mapTypeSelection(selection) {
  const map = {
    'CLI Tool': SOURCE_TYPES.CLI,
    'MCP Server': SOURCE_TYPES.MCP,
    'Skill/Plugin': SOURCE_TYPES.SKILL,
    'File Path': SOURCE_TYPES.FILE
  };
  return map[selection] || SOURCE_TYPES.CLI;
}

/**
 * Probe CLI tool for available commands
 * @param {string} toolName - CLI tool name
 * @returns {Object} Discovered capabilities
 */
function probeCLI(toolName) {
  const capabilities = {
    type: 'cli',
    tool: toolName,
    available: false,
    features: [],
    commands: {}
  };

  // Validate tool name to prevent command injection
  if (!isValidToolName(toolName)) {
    console.error(`Invalid tool name: ${toolName}`);
    return capabilities;
  }

  try {
    // Check if tool exists using execFileSync (prevents command injection)
    execFileSync(toolName, ['--version'], { encoding: 'utf8', stdio: 'pipe' });
    capabilities.available = true;
  } catch {
    return capabilities;
  }

  // Known CLI patterns
  const knownPatterns = {
    tea: {
      features: ['issues', 'prs', 'reviews'],
      commands: {
        list_issues: 'tea issues list',
        get_issue: 'tea issues view {id}',
        create_pr: 'tea pulls create --title {title} --base {base} --head {head}',
        list_prs: 'tea pulls list',
        get_pr: 'tea pr {id}'
      }
    },
    glab: {
      features: ['issues', 'prs', 'ci'],
      commands: {
        list_issues: 'glab issue list',
        get_issue: 'glab issue view {id}',
        create_pr: 'glab mr create --title {title} --target-branch {base} --source-branch {head}',
        list_prs: 'glab mr list',
        get_pr: 'glab mr view {id}',
        ci_status: 'glab ci status'
      }
    },
    gh: {
      features: ['issues', 'prs', 'ci'],
      commands: {
        list_issues: 'gh issue list',
        get_issue: 'gh issue view {id}',
        create_pr: 'gh pr create --title {title} --base {base} --head {head}',
        list_prs: 'gh pr list',
        get_pr: 'gh pr view {id}',
        ci_status: 'gh pr checks {id}'
      }
    }
  };

  // Use known pattern if available
  if (knownPatterns[toolName]) {
    capabilities.features = knownPatterns[toolName].features;
    capabilities.commands = knownPatterns[toolName].commands;
    capabilities.pattern = 'known';
  } else {
    // Unknown tool - try to discover via help
    capabilities.pattern = 'discovered';
    capabilities.features = ['unknown'];
    capabilities.commands = {
      help: `${toolName} --help`
    };
  }

  return capabilities;
}

/**
 * Build complete custom source config and cache it
 * @param {string} type - Source type
 * @param {string} name - Tool name or path
 * @returns {Object} Complete source configuration
 */
function buildCustomConfig(type, name) {
  const config = {
    source: 'custom',
    type: type,
    tool: name
  };

  // Probe capabilities for CLI tools
  if (type === SOURCE_TYPES.CLI) {
    const capabilities = probeCLI(name);
    config.capabilities = capabilities;

    // Cache capabilities for fast access
    if (capabilities.available) {
      sourceCache.saveToolCapabilities(name, capabilities);
    }
  }

  // Save preference
  sourceCache.savePreference(config);

  return config;
}

module.exports = {
  SOURCE_TYPES,
  getCustomTypeQuestion,
  getCustomNameQuestion,
  mapTypeSelection,
  probeCLI,
  buildCustomConfig,
  isValidToolName
};
