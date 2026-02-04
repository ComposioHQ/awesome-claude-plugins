/**
 * Profiling execution helper.
 *
 * @module lib/perf/profiling-runner
 */

const { execSync } = require('child_process');
const profilers = require('./profilers');

/**
 * Run a profiling command and return artifacts/hotspots metadata.
 * @param {object} options
 * @param {string} [options.repoPath]
 * @param {object} [options.profileOptions]
 * @returns {{ ok: boolean, result?: object, error?: string }}
 */
function runProfiling(options = {}) {
  const repoPath = options.repoPath || process.cwd();
  const profiler = profilers.selectProfiler(repoPath);

  if (!profiler || typeof profiler.buildCommand !== 'function') {
    return { ok: false, error: 'No profiler available' };
  }

  const command = profiler.buildCommand({
    command: options.command,
    output: options.output,
    ...(options.profileOptions || {})
  });
  const env = {
    ...process.env,
    ...(options.env || {})
  };
  try {
    execSync(command, { stdio: 'pipe', env });
  } catch (error) {
    return { ok: false, error: error.message };
  }

  const parsed = typeof profiler.parseOutput === 'function'
    ? profiler.parseOutput()
    : { tool: profiler.id, hotspots: [], artifacts: [] };

  const result = {
    tool: profiler.id,
    command,
    hotspots: parsed.hotspots || [],
    artifacts: parsed.artifacts || []
  };

  return { ok: true, result };
}

module.exports = {
  runProfiling
};
