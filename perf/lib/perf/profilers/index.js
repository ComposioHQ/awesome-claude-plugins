/**
 * Profilers registry for /perf.
 *
 * @module lib/perf/profilers
 */

const fs = require('fs');
const path = require('path');
const cliEnhancers = require('../../patterns/cli-enhancers');
const nodeProfiler = require('./node');
const pythonProfiler = require('./python');
const goProfiler = require('./go');
const rustProfiler = require('./rust');
const javaProfiler = require('./java');

function hasJavaIndicators(repoPath) {
  const indicators = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
  return indicators.some((file) => fs.existsSync(path.join(repoPath, file)));
}

function selectProfiler(repoPath = process.cwd()) {
  const languages = cliEnhancers.detectProjectLanguages(repoPath);

  if (hasJavaIndicators(repoPath)) return javaProfiler;
  if (languages.includes('typescript') || languages.includes('javascript')) return nodeProfiler;
  if (languages.includes('go')) return goProfiler;
  if (languages.includes('python')) return pythonProfiler;
  if (languages.includes('rust')) return rustProfiler;

  return nodeProfiler;
}

function listAvailable() {
  return [
    nodeProfiler.id,
    javaProfiler.id,
    pythonProfiler.id,
    goProfiler.id,
    rustProfiler.id
  ];
}

module.exports = {
  listAvailable,
  selectProfiler
};
