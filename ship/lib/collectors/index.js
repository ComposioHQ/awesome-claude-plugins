/**
 * Shared Data Collectors
 *
 * Composable data collection infrastructure for drift-detect, deslop, sync-docs.
 * Follows the "JS collectors + single LLM call" pattern for token efficiency.
 *
 * @module lib/collectors
 */

'use strict';

const github = require('./github');
const documentation = require('./documentation');
const codebase = require('./codebase');
const docsPatterns = require('./docs-patterns');

const DEFAULT_OPTIONS = {
  collectors: ['github', 'docs', 'code'],
  depth: 'thorough',
  cwd: process.cwd()
};

/**
 * Collect data from specified collectors
 *
 * @param {Object} options - Collection options
 * @param {string[]} options.collectors - Which collectors to run: 'github', 'docs', 'code', 'docs-patterns'
 * @param {string} options.depth - 'quick' or 'thorough'
 * @param {string} options.cwd - Working directory
 * @param {string[]} options.changedFiles - For docs-patterns collector
 * @returns {Object} Collected data
 *
 * @example
 * // Drift-detect uses all three
 * const data = collect({ collectors: ['github', 'docs', 'code'] });
 *
 * // Deslop uses codebase only
 * const data = collect({ collectors: ['code'] });
 *
 * // Sync-docs uses docs + docs-patterns
 * const data = collect({ collectors: ['docs', 'docs-patterns'], changedFiles });
 */
function collect(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const collectors = Array.isArray(opts.collectors) ? opts.collectors : DEFAULT_OPTIONS.collectors;

  const data = {
    timestamp: new Date().toISOString(),
    options: opts,
    github: null,
    docs: null,
    code: null,
    docsPatterns: null
  };

  // Collect from each enabled collector
  if (collectors.includes('github')) {
    data.github = github.scanGitHubState(opts);
  }

  if (collectors.includes('docs')) {
    data.docs = documentation.analyzeDocumentation(opts);
  }

  if (collectors.includes('code')) {
    data.code = codebase.scanCodebase(opts);
  }

  if (collectors.includes('docs-patterns')) {
    data.docsPatterns = docsPatterns.collect(opts);
  }

  return data;
}

/**
 * Collect all data (backward compat with drift-detect)
 *
 * Supports both new 'collectors' option and legacy 'sources' option
 */
function collectAllData(options = {}) {
  // Map legacy 'sources' option to 'collectors'
  let collectors = ['github', 'docs', 'code'];
  if (options.sources) {
    collectors = options.sources;
  } else if (options.collectors) {
    collectors = options.collectors;
  }

  return collect({
    ...options,
    collectors
  });
}

module.exports = {
  // Main entry point
  collect,
  collectAllData,

  // Individual collectors
  github,
  documentation,
  codebase,
  docsPatterns,

  // Re-export commonly used functions for convenience
  scanGitHubState: github.scanGitHubState,
  isGhAvailable: github.isGhAvailable,
  analyzeDocumentation: documentation.analyzeDocumentation,
  scanCodebase: codebase.scanCodebase,
  findRelatedDocs: docsPatterns.findRelatedDocs,
  analyzeDocIssues: docsPatterns.analyzeDocIssues,
  checkChangelog: docsPatterns.checkChangelog,

  // Constants
  DEFAULT_OPTIONS
};
