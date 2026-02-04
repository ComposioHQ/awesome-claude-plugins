/**
 * Perf analysis helpers.
 *
 * @module lib/perf/analyzer
 */

/**
 * Build a compact summary of perf findings.
 * @param {object} input
 * @returns {object}
 */
function summarize(input = {}) {
  return {
    summary: input.summary || '',
    recommendations: input.recommendations || [],
    risks: input.risks || []
  };
}

module.exports = {
  summarize
};
