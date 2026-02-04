/**
 * Optimization runner for /perf experiments.
 *
 * @module lib/perf/optimization-runner
 */

const { runBenchmark, runBenchmarkSeries, DEFAULT_MIN_DURATION } = require('./benchmark-runner');
const { compareBaselines } = require('./baseline-comparator');
const { isWorkingTreeClean } = require('./checkpoint');

/**
 * Run a single optimization experiment with two benchmark runs.
 * NOTE: This helper does not modify code; it assumes the change was applied externally.
 *
 * @param {object} options
 * @param {string} options.command
 * @param {string} options.changeSummary
 * @param {number} [options.duration]
 * @param {number} [options.minDuration]
 * @param {number} [options.runs]
 * @param {string} [options.aggregate]
 * @param {object} [options.env]
 * @returns {{ baseline: object, experiment: object, delta: object, verdict: string, change: string }}
 */
function runOptimizationExperiment(options) {
  const { command, changeSummary, duration, minDuration, runs, aggregate, env } = options || {};

  if (!command || typeof command !== 'string') {
    throw new Error('command must be a non-empty string');
  }
  if (!changeSummary || typeof changeSummary !== 'string') {
    throw new Error('changeSummary must be a non-empty string');
  }

  const shouldCheckClean = options?.requireClean !== false && process.env.PERF_ALLOW_DIRTY !== '1';
  if (shouldCheckClean && !isWorkingTreeClean()) {
    throw new Error('working tree is dirty before experiment');
  }

  const baselineEnv = { ...env, PERF_EXPERIMENT: '0' };
  const experimentEnv = { ...env, PERF_EXPERIMENT: '1' };
  const seriesOptions = {
    duration: duration ?? DEFAULT_MIN_DURATION,
    minDuration,
    runs,
    aggregate
  };

  const baselineRun = runBenchmarkSeries(command, { ...seriesOptions, env: baselineEnv });

  // NOTE: Caller is responsible for applying the experiment change here.
  // Warm up the system (caches/JIT) before capturing experiment metrics.
  const runMode = runs && runs > 1 ? 'oneshot' : 'duration';
  runBenchmark(command, {
    duration: duration ?? DEFAULT_MIN_DURATION,
    minDuration,
    env: experimentEnv,
    runMode,
    setDurationEnv: runMode !== 'oneshot'
  });
  const experimentRun = runBenchmarkSeries(command, { ...seriesOptions, env: experimentEnv });

  const delta = compareBaselines(
    { metrics: baselineRun.metrics },
    { metrics: experimentRun.metrics }
  );

  return {
    change: changeSummary,
    baseline: { metrics: baselineRun.metrics },
    experiment: { metrics: experimentRun.metrics },
    delta,
    verdict: 'inconclusive'
  };
}

module.exports = {
  runOptimizationExperiment
};
