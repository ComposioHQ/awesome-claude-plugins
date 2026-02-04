/**
 * Experiment runner utilities.
 *
 * @module lib/perf/experiment-runner
 */

/**
 * Run experiments sequentially (never parallel).
 * @param {Array<object>} experiments
 * @param {(experiment:object)=>Promise<object>} runner
 * @returns {Promise<{results:Array<object>}>}
 */
async function runExperiments(experiments, runner) {
  if (!Array.isArray(experiments)) {
    throw new Error('experiments must be an array');
  }
  if (typeof runner !== 'function') {
    throw new Error('runner must be a function');
  }

  const results = [];
  for (const experiment of experiments) {
    const result = await runner(experiment);
    results.push(result);
  }

  return { results };
}

module.exports = {
  runExperiments
};
