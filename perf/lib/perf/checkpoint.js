/**
 * Git checkpoint helper for /perf phases.
 *
 * @module lib/perf/checkpoint
 */

const { execFileSync } = require('child_process');
const path = require('path');
const { getStateDir } = require('../platform/state-dir');

/**
 * Check if git repo is clean.
 * @returns {boolean}
 */
function isWorkingTreeClean() {
  const output = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  return output.length === 0;
}

/**
 * Build checkpoint commit message.
 * @param {object} input
 * @param {string} input.phase
 * @param {string} input.id
 * @param {string} [input.baselineVersion]
 * @param {string} [input.deltaSummary]
 * @returns {string}
 */
function buildCheckpointMessage(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Checkpoint input must be an object');
  }
  const { phase, id, baselineVersion, deltaSummary } = input;

  if (!phase || typeof phase !== 'string') {
    throw new Error('phase is required');
  }
  if (!id || typeof id !== 'string') {
    throw new Error('id is required');
  }

  const baseline = baselineVersion || 'n/a';
  const delta = deltaSummary || 'n/a';
  return `perf: phase ${phase} [${id}] baseline=${baseline} delta=${delta}`;
}

/**
 * Get the most recent git commit message.
 * @returns {string|null}
 */
function getLastCommitMessage() {
  try {
    return execFileSync('git', ['log', '-1', '--pretty=%B'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Get recent git commit summaries.
 * @param {number} [limit=5]
 * @returns {string[]}
 */
function getRecentCommits(limit = 5) {
  try {
    const count = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 5;
    const output = execFileSync('git', ['log', `-${count}`, '--pretty=format:%h %s'], { encoding: 'utf8' }).trim();
    if (!output) return [];
    return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check if the next checkpoint would duplicate the last commit.
 * @param {string} message
 * @returns {boolean}
 */
function isDuplicateCheckpoint(message) {
  const last = getLastCommitMessage();
  if (!last) return false;
  return last.trim() === String(message || '').trim();
}

/**
 * Commit a checkpoint for a perf phase.
 * @param {object} input
 * @returns {{ ok: boolean, message?: string, reason?: string }}
 */
function commitCheckpoint(input) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
  } catch {
    return { ok: false, reason: 'not a git repo' };
  }

  if (isWorkingTreeClean()) {
    return { ok: false, reason: 'nothing to commit' };
  }

  const message = buildCheckpointMessage(input);
  if (isDuplicateCheckpoint(message)) {
    return { ok: false, reason: 'duplicate checkpoint' };
  }
  const perfDir = path.join(getStateDir(), 'perf');
  try {
    execFileSync('git', ['add', '-A', '--', perfDir], { stdio: 'ignore' });
  } catch {
    execFileSync('git', ['add', '-A'], { stdio: 'ignore' });
  }
  execFileSync('git', ['commit', '-m', message], { stdio: 'ignore' });
  return { ok: true, message };
}

module.exports = {
  isWorkingTreeClean,
  buildCheckpointMessage,
  getLastCommitMessage,
  getRecentCommits,
  isDuplicateCheckpoint,
  commitCheckpoint
};
