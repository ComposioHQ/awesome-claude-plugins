/**
 * Baseline storage utilities for /perf
 *
 * Stores baselines under:
 * - {state-dir}/perf/baselines/{version}.json
 *
 * @module lib/perf/baseline-store
 */

const fs = require('fs');
const path = require('path');
const { getStateDir } = require('../platform/state-dir');
const { validateBaseline, assertValid } = require('./schemas');

const BASELINE_DIR = 'baselines';

function assertSafeBaselineVersion(version) {
  if (!version || typeof version !== 'string') {
    throw new Error('Baseline version is required');
  }
  if (version.includes('..') || version.includes('/') || version.includes('\\') || version.includes('\0')) {
    throw new Error('Baseline version contains invalid characters');
  }
  if (!/^[a-zA-Z0-9._+-]+$/.test(version)) {
    throw new Error('Baseline version contains invalid characters');
  }
  return version;
}

/**
 * Get baseline directory path
 * @param {string} basePath
 * @returns {string}
 */
function getBaselineDir(basePath = process.cwd()) {
  return path.join(basePath, getStateDir(basePath), 'perf', BASELINE_DIR);
}

/**
 * Ensure baseline directory exists
 * @param {string} basePath
 * @returns {string}
 */
function ensureBaselineDir(basePath = process.cwd()) {
  const dir = getBaselineDir(basePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Build baseline file path
 * @param {string} version
 * @param {string} basePath
 * @returns {string}
 */
function getBaselinePath(version, basePath = process.cwd()) {
  const safeVersion = assertSafeBaselineVersion(version);
  return path.join(ensureBaselineDir(basePath), `${safeVersion}.json`);
}

/**
 * List baseline versions
 * @param {string} basePath
 * @returns {string[]}
 */
function listBaselines(basePath = process.cwd()) {
  const dir = ensureBaselineDir(basePath);
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.basename(file, '.json'))
    .sort();
}

/**
 * Read baseline file
 * @param {string} version
 * @param {string} basePath
 * @returns {object|null}
 */
function readBaseline(version, basePath = process.cwd()) {
  const baselinePath = getBaselinePath(version, basePath);
  if (!fs.existsSync(baselinePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const validation = validateBaseline(parsed);
    if (!validation.ok) {
      console.error(`[CRITICAL] Invalid baseline file at ${baselinePath}: ${validation.errors.join(', ')}`);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error(`[CRITICAL] Corrupted baseline file at ${baselinePath}: ${error.message}`);
    return null;
  }
}

/**
 * Write baseline file (overwrites existing)
 * @param {string} version
 * @param {object} baseline
 * @param {string} basePath
 * @returns {boolean}
 */
function writeBaseline(version, baseline, basePath = process.cwd()) {
  const baselinePath = getBaselinePath(version, basePath);
  const payload = {
    version,
    recordedAt: new Date().toISOString(),
    ...baseline
  };
  assertValid(validateBaseline(payload), 'Invalid baseline payload');
  fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2), 'utf8');
  return true;
}

module.exports = {
  getBaselineDir,
  ensureBaselineDir,
  getBaselinePath,
  listBaselines,
  readBaseline,
  writeBaseline
};
