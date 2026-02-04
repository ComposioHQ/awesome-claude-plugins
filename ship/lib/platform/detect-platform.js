#!/usr/bin/env node
/**
 * Platform Detection Infrastructure
 * Auto-detects project configuration for zero-config slash commands
 *
 * Usage: node lib/platform/detect-platform.js
 * Output: JSON with detected platform information
 *
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const fsPromises = fs.promises;

// Import shared utilities
const { CacheManager } = require('../utils/cache-manager');
const {
  CI_CONFIGS,
  DEPLOYMENT_CONFIGS,
  PACKAGE_MANAGER_CONFIGS
} = require('./detection-configs');

/**
 * Default timeout for async operations (5 seconds)
 */
const DEFAULT_ASYNC_TIMEOUT_MS = 5000;

/**
 * Maximum JSON file size to parse (1MB) - prevents DoS via large files
 */
const MAX_JSON_SIZE_BYTES = 1024 * 1024;

/**
 * Safely parse JSON content with size limit
 * @param {string} content - JSON string to parse
 * @param {string} filename - Filename for error messages
 * @returns {Object|null} Parsed object or null if invalid/too large
 */
function safeJSONParse(content, filename = 'unknown') {
  if (!content || typeof content !== 'string') {
    return null;
  }
  if (content.length > MAX_JSON_SIZE_BYTES) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Wrap a promise with a timeout
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operation - Operation name for error message
 * @returns {Promise} Promise that rejects on timeout
 */
function withTimeout(promise, timeoutMs = DEFAULT_ASYNC_TIMEOUT_MS, operation = 'operation') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Execute a command with timeout protection
 * @param {string} cmd - Command to execute
 * @param {Object} options - exec options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function execWithTimeout(cmd, options = {}, timeoutMs = DEFAULT_ASYNC_TIMEOUT_MS) {
  return withTimeout(execAsync(cmd, options), timeoutMs, `exec: ${cmd.substring(0, 50)}`);
}

// Maximum cached file size constant
const MAX_CACHED_FILE_SIZE = 64 * 1024; // 64KB max per cached file

// Cache instances using CacheManager abstraction
const _detectionCache = new CacheManager({ maxSize: 1, ttl: 60000 });
const _fileCache = new CacheManager({ maxSize: 100, ttl: 60000, maxValueSize: MAX_CACHED_FILE_SIZE });
const _existsCache = new CacheManager({ maxSize: 100, ttl: 60000 });

/**
 * Generic file-based detector
 * @param {Array} configs - Array of {file, platform} objects
 * @param {Function} existsChecker - Async function to check file existence
 * @returns {Promise<string|null>} Detected platform or null
 */
async function detectFromFiles(configs, existsChecker) {
  try {
    const checks = await Promise.all(
      configs.map(({ file }) => existsChecker(file).catch(() => false))
    );

    for (let i = 0; i < checks.length; i++) {
      if (checks[i]) {
        return configs[i].platform;
      }
    }
    return null;
  } catch (error) {
    // Log unexpected errors but return null to allow detection to continue
    if (process.env.DEBUG) {
      console.error(`[detect-platform] detectFromFiles error: ${error.message}`);
    }
    return null;
  }
}

/**
 * Check if a file exists (cached)
 * @param {string} filepath - Path to check
 * @returns {Promise<boolean>}
 */
async function existsCached(filepath) {
  const cached = _existsCache.get(filepath);
  if (cached !== undefined) {
    return cached;
  }
  try {
    await fsPromises.access(filepath);
    _existsCache.set(filepath, true);
    return true;
  } catch {
    _existsCache.set(filepath, false);
    return false;
  }
}

/**
 * Read file contents (cached)
 * Only caches files smaller than MAX_CACHED_FILE_SIZE to prevent memory bloat
 * Optimized: normalizes filepath to prevent cache pollution from variant paths
 * @param {string} filepath - Path to read
 * @returns {Promise<string|null>}
 */
async function readFileCached(filepath) {
  const normalizedPath = path.resolve(filepath);

  const cached = _fileCache.get(normalizedPath);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const content = await fsPromises.readFile(normalizedPath, 'utf8');
    _fileCache.set(normalizedPath, content);
    return content;
  } catch {
    _fileCache.set(normalizedPath, null);
    return null;
  }
}

/**
 * Detects CI platform by scanning for configuration files
 * @returns {Promise<string|null>} CI platform name or null if not detected
 */
async function detectCI() {
  return detectFromFiles(CI_CONFIGS, existsCached);
}

/**
 * Detects deployment platform by scanning for platform-specific files
 * @returns {Promise<string|null>} Deployment platform name or null if not detected
 */
async function detectDeployment() {
  return detectFromFiles(DEPLOYMENT_CONFIGS, existsCached);
}

/**
 * Detects project type by scanning for language-specific files
 * @returns {Promise<string>} Project type identifier
 */
async function detectProjectType() {
  try {
    const checks = await Promise.all([
      existsCached('package.json').catch(() => false),
      existsCached('requirements.txt').catch(() => false),
      existsCached('pyproject.toml').catch(() => false),
      existsCached('setup.py').catch(() => false),
      existsCached('Cargo.toml').catch(() => false),
      existsCached('go.mod').catch(() => false),
      existsCached('pom.xml').catch(() => false),
      existsCached('build.gradle').catch(() => false)
    ]);

    if (checks[0]) return 'nodejs';
    if (checks[1] || checks[2] || checks[3]) return 'python';
    if (checks[4]) return 'rust';
    if (checks[5]) return 'go';
    if (checks[6] || checks[7]) return 'java';
    return 'unknown';
  } catch (error) {
    if (process.env.DEBUG) {
      console.error(`[detect-platform] detectProjectType error: ${error.message}`);
    }
    return 'unknown';
  }
}

/**
 * Detects package manager by scanning for lockfiles
 * @returns {Promise<string|null>} Package manager name or null if not detected
 */
async function detectPackageManager() {
  return detectFromFiles(
    PACKAGE_MANAGER_CONFIGS.map(({ file, manager }) => ({ file, platform: manager })),
    existsCached
  );
}

/**
 * Detects branch strategy (single-branch vs multi-branch with dev+prod)
 * @returns {Promise<string>} 'single-branch' or 'multi-branch'
 */
async function detectBranchStrategy() {
  try {
    const [localResult, remoteResult] = await Promise.all([
      execWithTimeout('git branch', { encoding: 'utf8' }).catch(() => ({ stdout: '' })),
      execWithTimeout('git branch -r', { encoding: 'utf8' }).catch(() => ({ stdout: '' }))
    ]);

    const allBranches = (localResult.stdout || '') + (remoteResult.stdout || '');

    const hasStable = allBranches.includes('stable');
    const hasProduction = allBranches.includes('production') || allBranches.includes('prod');

    if (hasStable || hasProduction) {
      return 'multi-branch';
    }

    if (await existsCached('railway.json')) {
      try {
        const content = await readFileCached('railway.json');
        if (content) {
          const config = safeJSONParse(content, 'railway.json');
          if (config &&
              typeof config === 'object' &&
              typeof config.environments === 'object' &&
              config.environments !== null &&
              Object.keys(config.environments).length > 1) {
            return 'multi-branch';
          }
        }
      } catch { /* config parse error - ignore */ }
    }

    return 'single-branch';
  } catch {
    return 'single-branch';
  }
}

/**
 * Detects the main branch name
 * @returns {Promise<string>} Main branch name ('main' or 'master')
 */
async function detectMainBranch() {
  try {
    const { stdout } = await execWithTimeout('git symbolic-ref refs/remotes/origin/HEAD', { encoding: 'utf8' });
    return stdout.trim().replace('refs/remotes/origin/', '');
  } catch {
    try {
      await execWithTimeout('git rev-parse --verify main', { encoding: 'utf8' });
      return 'main';
    } catch {
      return 'master';
    }
  }
}

/**
 * Main detection function - aggregates all platform information
 * Uses Promise.all for parallel execution and caching
 * @param {boolean} forceRefresh - Force cache refresh
 * @returns {Promise<Object>} Platform configuration object
 */
async function detect(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = _detectionCache.get('detection');
    if (cached !== undefined) {
      return cached;
    }
  }

  try {
    const [
      ci,
      deployment,
      projectType,
      packageManager,
      branchStrategy,
      mainBranch,
      hasPlanFile,
      hasTechDebtFile
    ] = await Promise.all([
      detectCI().catch((err) => {
        if (process.env.DEBUG) console.error(`[detect-platform] detectCI failed: ${err.message}`);
        return null;
      }),
      detectDeployment().catch((err) => {
        if (process.env.DEBUG) console.error(`[detect-platform] detectDeployment failed: ${err.message}`);
        return null;
      }),
      detectProjectType().catch((err) => {
        if (process.env.DEBUG) console.error(`[detect-platform] detectProjectType failed: ${err.message}`);
        return 'unknown';
      }),
      detectPackageManager().catch((err) => {
        if (process.env.DEBUG) console.error(`[detect-platform] detectPackageManager failed: ${err.message}`);
        return null;
      }),
      detectBranchStrategy().catch((err) => {
        if (process.env.DEBUG) console.error(`[detect-platform] detectBranchStrategy failed: ${err.message}`);
        return 'single-branch';
      }),
      detectMainBranch().catch((err) => {
        if (process.env.DEBUG) console.error(`[detect-platform] detectMainBranch failed: ${err.message}`);
        return 'main';
      }),
      existsCached('PLAN.md').catch(() => false),
      existsCached('TECHNICAL_DEBT.md').catch(() => false)
    ]);

    const detection = {
      ci,
      deployment,
      projectType,
      packageManager,
      branchStrategy,
      mainBranch,
      hasPlanFile,
      hasTechDebtFile,
      timestamp: new Date().toISOString()
    };

    _detectionCache.set('detection', detection);
    return detection;
  } catch (error) {
    // Return sensible defaults if detection fails entirely
    const fallback = {
      ci: null,
      deployment: null,
      projectType: 'unknown',
      packageManager: null,
      branchStrategy: 'single-branch',
      mainBranch: 'main',
      hasPlanFile: false,
      hasTechDebtFile: false,
      timestamp: new Date().toISOString(),
      error: error.message
    };
    if (process.env.DEBUG) {
      console.error(`[detect-platform] detect() failed, returning fallback: ${error.message}`);
    }
    return fallback;
  }
}

/**
 * Invalidate all detection caches
 * Call this after making changes that affect platform detection
 */
function invalidateCache() {
  _detectionCache.clear();
  _fileCache.clear();
  _existsCache.clear();
}

// When run directly, output JSON
if (require.main === module) {
  (async () => {
    try {
      const result = await detect();
      const indent = process.stdout.isTTY ? 2 : 0;
      console.log(JSON.stringify(result, null, indent));
    } catch (error) {
      const indent = process.stderr.isTTY ? 2 : 0;
      console.error(JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, indent));
      process.exit(1);
    }
  })();
}

// Export for use as module
module.exports = {
  detect,
  invalidateCache,
  detectCI,
  detectDeployment,
  detectProjectType,
  detectPackageManager,
  detectBranchStrategy,
  detectMainBranch
};
