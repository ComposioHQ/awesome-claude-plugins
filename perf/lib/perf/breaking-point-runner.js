/**
 * Breaking point runner wrapper for /perf.
 *
 * @module lib/perf/breaking-point-runner
 */

const { runBenchmark, parseMetrics, BINARY_SEARCH_MIN_DURATION } = require('./benchmark-runner');
const { findBreakingPoint } = require('./breaking-point-finder');

/**
 * Run a binary search to find the breaking point for a numeric parameter.
 * The benchmark command should accept the value via an env var.
 *
 * @param {object} options
 * @param {string} options.command
 * @param {string} options.paramEnv
 * @param {number} options.min
 * @param {number} options.max
 * @returns {Promise<{breakingPoint:number|null, attempts:number, history:Array}>}
 */
async function runBreakingPointSearch(options) {
  const { command, paramEnv, min, max } = options || {};

  if (!command || typeof command !== 'string') {
    throw new Error('command must be a non-empty string');
  }
  if (!paramEnv || typeof paramEnv !== 'string') {
    throw new Error('paramEnv must be a non-empty string');
  }
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new Error('min and max must be numbers');
  }

  const runner = async (value) => {
    try {
      const result = runBenchmark(command, {
        mode: 'binary-search',
        duration: BINARY_SEARCH_MIN_DURATION,
        env: {
          [paramEnv]: String(value)
        }
      });

      const parsed = parseMetrics(result.output);
      if (!parsed.ok) {
        return { ok: false, data: { error: parsed.error } };
      }

      return { ok: true, data: { metrics: parsed.metrics } };
    } catch (error) {
      return { ok: false, data: { error: error.message } };
    }
  };

  return findBreakingPoint({ min, max, runner });
}

module.exports = {
  runBreakingPointSearch
};
