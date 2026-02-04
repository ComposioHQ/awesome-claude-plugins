/**
 * Java JFR profiler helper.
 *
 * @module lib/perf/profilers/java
 */

module.exports = {
  id: 'jfr',
  tool: 'jfr',
  buildCommand(options = {}) {
    const command = options.command || 'java';
    const output = options.output || 'profile.jfr';
    const duration = options.duration || '60s';
    return `${command} -XX:StartFlightRecording=duration=${duration},filename=${output}`;
  },
  parseOutput() {
    return {
      tool: 'jfr',
      hotspots: [],
      artifacts: []
    };
  }
};
