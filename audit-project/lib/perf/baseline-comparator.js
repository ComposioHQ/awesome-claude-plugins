/**
 * Baseline comparison helpers
 *
 * @module lib/perf/baseline-comparator
 */

/**
 * Compute delta between baseline and current metrics.
 * Supports flat numeric values under baseline.metrics/current.metrics.
 *
 * @param {object} baseline
 * @param {object} current
 * @returns {object}
 */
function compareBaselines(baseline, current) {
  const baselineMetrics = baseline?.metrics || {};
  const currentMetrics = current?.metrics || {};
  const keys = new Set([
    ...Object.keys(baselineMetrics),
    ...Object.keys(currentMetrics)
  ]);

  const deltas = {};
  for (const key of keys) {
    const baseValue = baselineMetrics[key];
    const currentValue = currentMetrics[key];

    if (typeof baseValue === 'number' && typeof currentValue === 'number') {
      const delta = currentValue - baseValue;
      const percent = baseValue === 0 ? null : delta / baseValue;
      deltas[key] = { baseline: baseValue, current: currentValue, delta, percent };
    } else {
      deltas[key] = {
        baseline: baseValue ?? null,
        current: currentValue ?? null,
        delta: null,
        percent: null
      };
    }
  }

  return {
    comparedAt: new Date().toISOString(),
    metrics: deltas
  };
}

module.exports = {
  compareBaselines
};
