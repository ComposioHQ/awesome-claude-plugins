/**
 * Baseline consolidation helper.
 *
 * @module lib/perf/consolidation
 */

const baselineStore = require('./baseline-store');

/**
 * Consolidate a baseline for a version (overwrite existing).
 * @param {object} input
 * @param {string} input.version
 * @param {object} input.baseline
 * @param {string} [basePath]
 * @returns {{ version: string, path: string }}
 */
function consolidateBaseline(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('consolidateBaseline requires an input object');
  }
  const { version, baseline } = input;

  if (!version || typeof version !== 'string') {
    throw new Error('version is required');
  }
  if (!baseline || typeof baseline !== 'object') {
    throw new Error('baseline is required');
  }

  baselineStore.writeBaseline(version, baseline, basePath);
  const path = baselineStore.getBaselinePath(version, basePath);
  return { version, path };
}

module.exports = {
  consolidateBaseline
};
