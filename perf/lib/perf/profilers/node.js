/**
 * Node.js profiler helper.
 *
 * @module lib/perf/profilers/node
 */

module.exports = {
  id: 'node',
  tool: '--cpu-prof',
  buildCommand(options = {}) {
    const command = options.command || 'node';
    const output = options.output || 'node.cpuprofile';
    const trimmed = command.trim();
    if (trimmed.startsWith('node ')) {
      const rest = trimmed.slice(5);
      return `node --cpu-prof --cpu-prof-name=${output} ${rest}`.trim();
    }
    return `${command} --cpu-prof --cpu-prof-name=${output}`.trim();
  },
  parseOutput() {
    return {
      tool: 'node',
      hotspots: [],
      artifacts: []
    };
  }
};
