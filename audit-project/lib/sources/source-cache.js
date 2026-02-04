/**
 * Source Cache
 * File-based persistence for task source preferences
 *
 * State directory is platform-aware:
 * - Claude Code: .claude/sources/
 * - OpenCode: .opencode/sources/
 * - Codex CLI: .codex/sources/
 *
 * @module lib/sources/source-cache
 */

const fs = require('fs');
const path = require('path');
const { getStateDir } = require('../platform/state-dir');
const { writeJsonAtomic } = require('../utils/atomic-write');

const PREFERENCE_FILE = 'preference.json';

/**
 * Get the sources directory path (platform-aware)
 * @returns {string} Path to sources directory
 */
function getSourcesDir() {
  return path.join(getStateDir(), 'sources');
}

/**
 * Validate tool name to prevent path traversal
 * @param {string} toolName - Tool name to validate
 * @returns {boolean} True if valid
 */
function isValidToolName(toolName) {
  // Prevent path traversal and shell metacharacters
  return /^[a-zA-Z0-9_-]+$/.test(toolName);
}

/**
 * Ensure sources directory exists
 * @returns {string} Path to sources directory
 */
function ensureDir() {
  const sourcesDir = getSourcesDir();
  if (!fs.existsSync(sourcesDir)) {
    fs.mkdirSync(sourcesDir, { recursive: true });
  }
  return sourcesDir;
}

/**
 * Get cached source preference
 * @returns {Object|null} Preference object or null if not cached
 * @example
 * // Returns: { source: 'github' }
 * // Or: { source: 'custom', type: 'cli', tool: 'tea' }
 */
function getPreference() {
  const filePath = path.join(getSourcesDir(), PREFERENCE_FILE);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read preference file:`, err.message);
    return null;
  }
}

/**
 * Save source preference
 * @param {Object} preference - Preference object
 * @param {string} preference.source - Source type (github, gitlab, local, custom, other)
 * @param {string} [preference.type] - For custom: mcp, cli, skill, file
 * @param {string} [preference.tool] - Tool name or path
 * @param {string} [preference.description] - For other: user's free text
 */
function savePreference(preference) {
  ensureDir();
  const filePath = path.join(getSourcesDir(), PREFERENCE_FILE);
  writeJsonAtomic(filePath, {
    ...preference,
    savedAt: new Date().toISOString()
  });
}

/**
 * Get cached tool capabilities (for custom sources)
 * @param {string} toolName - Tool identifier (e.g., 'tea', 'glab')
 * @returns {Object|null} Capabilities object or null
 */
function getToolCapabilities(toolName) {
  // Prevent path traversal
  if (!isValidToolName(toolName)) {
    console.error(`Invalid tool name: ${toolName}`);
    return null;
  }
  const filePath = path.join(getSourcesDir(), `${toolName}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read tool capabilities for ${toolName}:`, err.message);
    return null;
  }
}

/**
 * Save tool capabilities after discovery
 * @param {string} toolName - Tool identifier
 * @param {Object} capabilities - Discovered capabilities
 * @param {string[]} capabilities.features - Available features (issues, prs, ci)
 * @param {Object} capabilities.commands - Command mappings
 */
function saveToolCapabilities(toolName, capabilities) {
  // Prevent path traversal
  if (!isValidToolName(toolName)) {
    console.error(`Invalid tool name: ${toolName}`);
    return;
  }
  ensureDir();
  const filePath = path.join(getSourcesDir(), `${toolName}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    ...capabilities,
    discoveredAt: new Date().toISOString()
  }, null, 2));
}

/**
 * Clear all cached preferences
 */
function clearCache() {
  const sourcesDir = getSourcesDir();
  if (fs.existsSync(sourcesDir)) {
    const files = fs.readdirSync(sourcesDir);
    for (const file of files) {
      const filePath = path.join(sourcesDir, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        fs.unlinkSync(filePath);
      }
    }
  }
}

/**
 * Check if preference matches a specific source
 * @param {string} source - Source to check
 * @returns {boolean} True if preference matches
 */
function isPreferred(source) {
  const pref = getPreference();
  return pref?.source === source;
}

module.exports = {
  getPreference,
  savePreference,
  getToolCapabilities,
  saveToolCapabilities,
  clearCache,
  isPreferred
};
