/**
 * Plugin Analyzer
 * Main orchestrator for plugin structure and tool use analysis
 *
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');
const pluginPatterns = require('./plugin-patterns');
const toolPatterns = require('./tool-patterns');
const securityPatterns = require('./security-patterns');
const reporter = require('./reporter');
const fixer = require('./fixer');

/**
 * Find nearest package.json by walking up directory tree
 * @param {string} startPath - Starting directory path
 * @param {number} maxLevels - Maximum levels to traverse (default: 5)
 * @returns {string|null} Path to package.json or null if not found
 */
function findNearestPackageJson(startPath, maxLevels = 5) {
  let currentPath = path.resolve(startPath);

  for (let i = 0; i < maxLevels; i++) {
    const packageJsonPath = path.join(currentPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return packageJsonPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      // Reached root
      break;
    }
    currentPath = parentPath;
  }

  return null;
}

/**
 * Analyze a single plugin
 * @param {string} pluginPath - Path to plugin directory
 * @param {Object} options - Analysis options
 * @param {boolean} options.verbose - Include LOW certainty issues
 * @returns {Object} Analysis results
 */
async function analyzePlugin(pluginPath, options = {}) {
  const results = {
    pluginName: path.basename(pluginPath),
    pluginPath,
    filesScanned: 0,
    toolIssues: [],
    structureIssues: [],
    securityIssues: []
  };

  // Find plugin.json
  const pluginJsonPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');
  const altPluginJsonPath = path.join(pluginPath, 'plugin.json');

  let pluginJson = null;
  let pluginJsonFile = null;

  if (fs.existsSync(pluginJsonPath)) {
    try {
      pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      pluginJsonFile = pluginJsonPath;
      results.filesScanned++;
    } catch (err) {
      results.structureIssues.push({
        issue: 'Failed to parse plugin.json',
        file: pluginJsonPath,
        detail: err.message,
        certainty: 'HIGH',
        patternId: 'malformed_plugin_json'
      });
    }
  } else if (fs.existsSync(altPluginJsonPath)) {
    try {
      pluginJson = JSON.parse(fs.readFileSync(altPluginJsonPath, 'utf8'));
      pluginJsonFile = altPluginJsonPath;
      results.filesScanned++;
    } catch (err) {
      results.structureIssues.push({
        issue: 'Failed to parse plugin.json',
        file: altPluginJsonPath,
        detail: err.message,
        certainty: 'HIGH',
        patternId: 'malformed_plugin_json'
      });
    }
  }

  // Check package.json for version comparison (walk up to find it)
  const packageJsonPath = findNearestPackageJson(pluginPath);
  let packageJson = null;
  if (packageJsonPath) {
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (err) {
      // Non-critical - version comparison will just be skipped
    }
  }

  // Analyze plugin.json structure
  if (pluginJson) {
    results.pluginName = pluginJson.name || results.pluginName;

    // Check required fields
    const reqFieldsPattern = pluginPatterns.pluginPatterns.missing_required_plugin_fields;
    const reqResult = reqFieldsPattern.check(pluginJson);
    if (reqResult) {
      results.structureIssues.push({
        ...reqResult,
        file: pluginJsonFile,
        certainty: reqFieldsPattern.certainty,
        patternId: reqFieldsPattern.id
      });
    }

    // Check version format
    const versionPattern = pluginPatterns.pluginPatterns.invalid_version_format;
    const versionResult = versionPattern.check(pluginJson);
    if (versionResult) {
      results.structureIssues.push({
        ...versionResult,
        file: pluginJsonFile,
        certainty: versionPattern.certainty,
        patternId: versionPattern.id
      });
    }

    // Check version mismatch
    if (packageJson) {
      const mismatchPattern = pluginPatterns.pluginPatterns.version_mismatch;
      const mismatchResult = mismatchPattern.check(pluginJson, packageJson);
      if (mismatchResult) {
        results.structureIssues.push({
          ...mismatchResult,
          file: pluginJsonFile,
          filePath: pluginJsonFile,
          certainty: mismatchPattern.certainty,
          patternId: mismatchPattern.id,
          autoFixFn: (pj) => fixer.fixVersionMismatch(pj, packageJson.version)
        });
      }
    }

    // Check tool overexposure
    const overexposurePattern = pluginPatterns.pluginPatterns.tool_overexposure;
    const overexposureResult = overexposurePattern.check(pluginJson);
    if (overexposureResult && (options.verbose || overexposurePattern.certainty !== 'LOW')) {
      results.structureIssues.push({
        ...overexposureResult,
        file: pluginJsonFile,
        certainty: overexposurePattern.certainty,
        patternId: overexposurePattern.id
      });
    }

    // Analyze commands
    if (pluginJson.commands) {
      for (let idx = 0; idx < pluginJson.commands.length; idx++) {
        const cmd = pluginJson.commands[idx];
        const cmdIssues = analyzeCommand(cmd, pluginJsonFile, idx);
        results.toolIssues.push(...cmdIssues);
      }
    }
  }

  // Analyze agent files
  const agentsDir = path.join(pluginPath, 'agents');
  if (fs.existsSync(agentsDir)) {
    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

    for (const agentFile of agentFiles) {
      const agentPath = path.join(agentsDir, agentFile);
      const content = fs.readFileSync(agentPath, 'utf8');
      results.filesScanned++;

      // Security checks
      const secIssues = securityPatterns.checkSecurity(content, agentPath);
      results.securityIssues.push(...secIssues.map(i => ({
        ...i,
        file: agentPath
      })));
    }
  }

  // Analyze command files
  const commandsDir = path.join(pluginPath, 'commands');
  if (fs.existsSync(commandsDir)) {
    const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));

    for (const cmdFile of commandFiles) {
      const cmdPath = path.join(commandsDir, cmdFile);
      const content = fs.readFileSync(cmdPath, 'utf8');
      results.filesScanned++;

      // Security checks
      const secIssues = securityPatterns.checkSecurity(content, cmdPath);
      results.securityIssues.push(...secIssues.map(i => ({
        ...i,
        file: cmdPath
      })));
    }
  }

  return results;
}

/**
 * Analyze a command definition
 * @private
 * @param {Object} cmd - Command definition
 * @param {string} filePath - Path to plugin.json
 * @param {number} cmdIndex - Index of command in commands array
 */
function analyzeCommand(cmd, filePath, cmdIndex) {
  const issues = [];

  // Check description
  const descPattern = pluginPatterns.pluginPatterns.missing_tool_description;
  const descResult = descPattern.check(cmd);
  if (descResult) {
    issues.push({
      ...descResult,
      tool: cmd.name,
      file: filePath,
      certainty: descPattern.certainty,
      patternId: descPattern.id
    });
  }

  // Check parameters schema
  if (cmd.parameters) {
    // Missing additionalProperties
    const addPropsPattern = pluginPatterns.pluginPatterns.missing_additional_properties;
    const addPropsResult = addPropsPattern.check(cmd.parameters);
    if (addPropsResult) {
      issues.push({
        ...addPropsResult,
        tool: cmd.name,
        file: filePath,
        filePath: filePath,
        schemaPath: `commands[${cmdIndex}].parameters`,
        certainty: addPropsPattern.certainty,
        patternId: addPropsPattern.id,
        autoFixFn: fixer.fixAdditionalProperties
      });
    }

    // Missing required
    const reqPattern = pluginPatterns.pluginPatterns.missing_required_fields;
    const reqResult = reqPattern.check(cmd.parameters);
    if (reqResult) {
      issues.push({
        ...reqResult,
        tool: cmd.name,
        file: filePath,
        filePath: filePath,
        schemaPath: `commands[${cmdIndex}].parameters`,
        certainty: reqPattern.certainty,
        patternId: reqPattern.id,
        autoFixFn: fixer.fixRequiredFields
      });
    }

    // Deep nesting
    const nestPattern = pluginPatterns.pluginPatterns.deep_nesting;
    const nestResult = nestPattern.check(cmd.parameters);
    if (nestResult) {
      issues.push({
        ...nestResult,
        tool: cmd.name,
        file: filePath,
        certainty: nestPattern.certainty,
        patternId: nestPattern.id
      });
    }

    // Run tool pattern checks
    const toolIssues = toolPatterns.analyzeTool({
      name: cmd.name,
      description: cmd.description,
      inputSchema: cmd.parameters
    });
    issues.push(...toolIssues.map(i => ({
      ...i,
      file: filePath
    })));
  }

  return issues;
}

/**
 * Analyze all plugins in a directory
 * @param {string} pluginsDir - Path to plugins directory
 * @param {Object} options - Analysis options
 * @returns {Array} Array of analysis results
 */
async function analyzeAllPlugins(pluginsDir, options = {}) {
  const results = [];

  if (!fs.existsSync(pluginsDir)) {
    return results;
  }

  const pluginDirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const pluginName of pluginDirs) {
    const pluginPath = path.join(pluginsDir, pluginName);
    const result = await analyzePlugin(pluginPath, options);
    results.push(result);
  }

  return results;
}

/**
 * Main analyze function
 * @param {Object} options - Analysis options
 * @param {string} options.plugin - Specific plugin name (optional)
 * @param {string} options.pluginsDir - Path to plugins directory
 * @param {boolean} options.verbose - Include LOW certainty issues
 * @returns {Object} Analysis results
 */
async function analyze(options = {}) {
  const {
    plugin,
    pluginsDir = 'plugins',
    verbose = false
  } = options;

  if (plugin) {
    // Analyze single plugin
    const pluginPath = path.join(pluginsDir, plugin);
    return analyzePlugin(pluginPath, { verbose });
  } else {
    // Analyze all plugins
    return analyzeAllPlugins(pluginsDir, { verbose });
  }
}

/**
 * Apply fixes to analysis results
 * @param {Object|Array} results - Analysis results
 * @param {Object} options - Fix options
 * @returns {Object} Fix results
 */
async function applyFixes(results, options = {}) {
  // Collect all issues
  let allIssues = [];

  if (Array.isArray(results)) {
    for (const r of results) {
      allIssues.push(...(r.toolIssues || []));
      allIssues.push(...(r.structureIssues || []));
      allIssues.push(...(r.securityIssues || []));
    }
  } else {
    allIssues.push(...(results.toolIssues || []));
    allIssues.push(...(results.structureIssues || []));
    allIssues.push(...(results.securityIssues || []));
  }

  return fixer.applyFixes(allIssues, options);
}

/**
 * Generate report from analysis results
 * @param {Object|Array} results - Analysis results
 * @param {Object} options - Report options
 * @returns {string} Markdown report
 */
function generateReport(results, options = {}) {
  if (Array.isArray(results)) {
    return reporter.generateSummaryReport(results, options);
  } else {
    return reporter.generateReport(results, options);
  }
}

module.exports = {
  analyze,
  analyzePlugin,
  analyzeAllPlugins,
  applyFixes,
  generateReport,
  // Re-export sub-modules
  pluginPatterns: pluginPatterns.pluginPatterns,
  toolPatterns: toolPatterns.toolPatterns,
  securityPatterns: securityPatterns.securityPatterns,
  reporter,
  fixer
};
