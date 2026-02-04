/**
 * Rust perf helper (Linux).
 *
 * @module lib/perf/profilers/rust
 */

module.exports = {
  id: 'perf',
  tool: 'perf',
  buildCommand(options = {}) {
    const command = options.command || 'perf record';
    const output = options.output || 'perf.data';
    const target = options.target || './target/release/app';
    return `${command} -o ${output} ${target}`;
  },
  parseOutput() {
    return {
      tool: 'perf',
      hotspots: [],
      artifacts: []
    };
  }
};
