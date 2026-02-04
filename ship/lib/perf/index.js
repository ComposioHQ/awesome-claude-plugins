/**
 * Performance investigation utilities
 *
 * @module lib/perf
 */

const investigationState = require('./investigation-state');
const baselineStore = require('./baseline-store');
const baselineComparator = require('./baseline-comparator');
const benchmarkRunner = require('./benchmark-runner');
const breakingPointFinder = require('./breaking-point-finder');
const breakingPointRunner = require('./breaking-point-runner');
const experimentRunner = require('./experiment-runner');
const constraintRunner = require('./constraint-runner');
const checkpoint = require('./checkpoint');
const profilingRunner = require('./profiling-runner');
const optimizationRunner = require('./optimization-runner');
const consolidation = require('./consolidation');
const profilers = require('./profilers');
const analyzer = require('./analyzer');
const argumentParser = require('./argument-parser');
const codePaths = require('./code-paths');

module.exports = {
  investigationState,
  baselineStore,
  baselineComparator,
  benchmarkRunner,
  breakingPointFinder,
  breakingPointRunner,
  experimentRunner,
  constraintRunner,
  checkpoint,
  profilingRunner,
  optimizationRunner,
  consolidation,
  profilers,
  analyzer,
  argumentParser,
  codePaths
};
