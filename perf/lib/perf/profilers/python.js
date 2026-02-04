/**
 * Python cProfile helper.
 *
 * @module lib/perf/profilers/python
 */

module.exports = {
  id: 'cprofile',
  tool: 'cProfile',
  buildCommand(options = {}) {
    const command = options.command || 'python';
    const target = options.target || '-m';
    const output = options.output || 'profile.prof';
    return `${command} -m cProfile -o ${output} ${target}`;
  },
  parseOutput() {
    return {
      tool: 'cprofile',
      hotspots: [],
      artifacts: []
    };
  }
};
