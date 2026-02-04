/**
 * Go pprof helper.
 *
 * @module lib/perf/profilers/go
 */

module.exports = {
  id: 'pprof',
  tool: 'pprof',
  buildCommand(options = {}) {
    const command = options.command || 'go test';
    const output = options.output || 'cpu.pprof';
    return `${command} -cpuprofile=${output}`;
  },
  parseOutput() {
    return {
      tool: 'pprof',
      hotspots: [],
      artifacts: []
    };
  }
};
