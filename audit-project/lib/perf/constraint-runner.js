/**
 * Constraint testing runner for /perf.
 *
 * @module lib/perf/constraint-runner
 */

const { runBenchmarkSeries, DEFAULT_MIN_DURATION } = require('./benchmark-runner');
const { compareBaselines } = require('./baseline-comparator');

/**
 * Run baseline and constrained benchmarks sequentially.
 * Constraints are provided via env vars to keep it cross-platform.
 *
 * @param {object} options
 * @param {string} options.command
 * @param {object} options.constraints
 * @param {number} [options.duration]
 * @param {number} [options.minDuration]
 * @param {number} [options.runs]
 * @param {string} [options.aggregate]
 * @param {object} [options.env]
 * @returns {{ constraints: object, baseline: object, constrained: object, delta: object }}
 */
function runConstraintTest(options) {
  const { command, constraints, duration, minDuration, runs, aggregate, env } = options || {};

  if (!command || typeof command !== 'string') {
    throw new Error('command must be a non-empty string');
  }
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) {
    throw new Error('constraints must be an object');
  }

  const baselineResult = runBenchmarkSeries(command, {
    duration: duration ?? DEFAULT_MIN_DURATION,
    minDuration,
    runs,
    aggregate,
    env: {
      ...env
    }
  });

  const constrainedResult = runBenchmarkSeries(command, {
    duration: duration ?? DEFAULT_MIN_DURATION,
    minDuration,
    runs,
    aggregate,
    env: {
      ...env,
      PERF_CPU_LIMIT: constraints.cpu,
      PERF_MEMORY_LIMIT: constraints.memory
    }
  });

  const delta = compareBaselines(
    { metrics: baselineResult.metrics },
    { metrics: constrainedResult.metrics }
  );

  return {
    constraints,
    baseline: { metrics: baselineResult.metrics },
    constrained: { metrics: constrainedResult.metrics },
    delta
  };
}

module.exports = {
  runConstraintTest
};
