/**
 * Repo Map - AST-based repository symbol mapping
 * 
 * Uses ast-grep (sg) for accurate symbol extraction across multiple languages.
 * Generates a cached map of exports, functions, classes, and imports.
 * 
 * @module lib/repo-map
 */

'use strict';

const installer = require('./installer');
const runner = require('./runner');
const cache = require('./cache');
const updater = require('./updater');
const usageAnalyzer = require('./usage-analyzer');

/**
 * Initialize a new repo map (full scan)
 * @param {string} basePath - Repository root path
 * @param {Object} options - Options
 * @param {boolean} options.force - Force rebuild even if map exists
 * @param {string[]} options.languages - Languages to scan (auto-detect if not specified)
 * @returns {Promise<{success: boolean, map?: Object, error?: string}>}
 */
async function init(basePath, options = {}) {
  // Check if ast-grep is installed
  const installed = await installer.checkInstalled();
  if (!installed.found) {
    return {
      success: false,
      error: 'ast-grep not found',
      installSuggestion: installer.getInstallInstructions()
    };
  }

  if (!installer.meetsMinimumVersion(installed.version)) {
    return {
      success: false,
      error: `ast-grep version ${installed.version || 'unknown'} is too old. Minimum required: ${installer.getMinimumVersion()}`,
      installSuggestion: installer.getInstallInstructions()
    };
  }

  // Check if map already exists
  const existing = cache.load(basePath);
  if (existing && !options.force) {
    return {
      success: false,
      error: 'Repo map already exists. Use --force to rebuild or /repo-map update to refresh.',
      existing: cache.getStatus(basePath)
    };
  }

  // Detect languages in the project
  const languages = options.languages || await runner.detectLanguages(basePath);
  if (languages.length === 0) {
    return {
      success: false,
      error: 'No supported languages detected in repository'
    };
  }

  // Run full scan
  const startTime = Date.now();
  const map = await runner.fullScan(basePath, languages, {
    fileLimit: options.fileLimit
  });
  map.stats.scanDurationMs = Date.now() - startTime;

  // Save map
  cache.save(basePath, map);

  return {
    success: true,
    map,
    summary: {
      files: Object.keys(map.files).length,
      symbols: map.stats.totalSymbols,
      languages: map.project.languages,
      duration: map.stats.scanDurationMs
    }
  };
}

/**
 * Update an existing repo map (incremental)
 * @param {string} basePath - Repository root path
 * @param {Object} options - Options
 * @param {boolean} options.full - Force full rebuild instead of incremental
 * @returns {Promise<{success: boolean, changes?: Object, error?: string}>}
 */
async function update(basePath, options = {}) {
  // Check if ast-grep is installed
  const installed = await installer.checkInstalled();
  if (!installed.found) {
    return {
      success: false,
      error: 'ast-grep not found',
      installSuggestion: installer.getInstallInstructions()
    };
  }

  if (!installer.meetsMinimumVersion(installed.version)) {
    return {
      success: false,
      error: `ast-grep version ${installed.version || 'unknown'} is too old. Minimum required: ${installer.getMinimumVersion()}`,
      installSuggestion: installer.getInstallInstructions()
    };
  }

  // Load existing map
  const existing = cache.load(basePath);
  if (!existing) {
    return {
      success: false,
      error: 'No repo map found. Run /repo-map init first.'
    };
  }

  // Force full rebuild if requested
  if (options.full) {
    return init(basePath, { force: true });
  }

  // Incremental update
  const result = await updater.incrementalUpdate(basePath, existing);
  
  if (result.success) {
    cache.save(basePath, result.map);
  }

  return result;
}

/**
 * Get repo map status
 * @param {string} basePath - Repository root path
 * @returns {{exists: boolean, status?: Object}}
 */
function status(basePath) {
  const map = cache.load(basePath);
  if (!map) {
    return { exists: false };
  }

  const staleness = updater.checkStaleness(basePath, map);
  
  return {
    exists: true,
    status: {
      generated: map.generated,
      updated: map.updated,
      commit: map.git?.commit,
      branch: map.git?.branch,
      files: Object.keys(map.files).length,
      symbols: map.stats?.totalSymbols || 0,
      languages: map.project?.languages || [],
      staleness
    }
  };
}

/**
 * Load repo map (if exists)
 * @param {string} basePath - Repository root path
 * @returns {Object|null} - The map or null if not found
 */
function load(basePath) {
  return cache.load(basePath);
}

/**
 * Check if ast-grep is installed
 * @returns {Promise<{found: boolean, version?: string, path?: string}>}
 */
async function checkAstGrepInstalled() {
  return installer.checkInstalled();
}

/**
 * Get install instructions for ast-grep
 * @returns {string}
 */
function getInstallInstructions() {
  return installer.getInstallInstructions();
}

/**
 * Check if repo map exists
 * @param {string} basePath - Repository root path
 * @returns {boolean}
 */
function exists(basePath) {
  return cache.exists(basePath);
}

module.exports = {
  init,
  update,
  status,
  load,
  exists,
  checkAstGrepInstalled,
  getInstallInstructions,

  // Usage analysis functions
  buildUsageIndex: usageAnalyzer.buildUsageIndex,
  findUsages: usageAnalyzer.findUsages,
  findDependents: usageAnalyzer.findDependents,
  findUnusedExports: usageAnalyzer.findUnusedExports,
  findOrphanedInfrastructure: usageAnalyzer.findOrphanedInfrastructure,
  getDependencyGraph: usageAnalyzer.getDependencyGraph,
  findCircularDependencies: usageAnalyzer.findCircularDependencies,

  // Re-export submodules for advanced usage
  installer,
  runner,
  cache,
  updater,
  usageAnalyzer
};
