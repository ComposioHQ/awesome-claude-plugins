/**
 * Reality Check Data Collectors
 * Pure JavaScript data collection - no LLM needed
 *
 * BACKWARD COMPATIBILITY: This module re-exports from lib/collectors.
 * For new code, use: const { collectors } = require('@awesome-slash/lib');
 *
 * Replaces three LLM agents (issue-scanner, doc-analyzer, code-explorer)
 * with deterministic JavaScript functions.
 *
 * @module lib/drift-detect/collectors
 */

'use strict';

// Re-export from shared collectors module
const collectors = require('../collectors');

// Legacy DEFAULT_OPTIONS (backward compatible format)
const DEFAULT_OPTIONS = {
  sources: ['github', 'docs', 'code'],
  depth: 'thorough',
  issueLimit: collectors.github.DEFAULT_OPTIONS.issueLimit,
  prLimit: collectors.github.DEFAULT_OPTIONS.prLimit,
  timeout: collectors.github.DEFAULT_OPTIONS.timeout
};

// Re-export all functions for backward compatibility
module.exports = {
  DEFAULT_OPTIONS,
  scanGitHubState: collectors.scanGitHubState,
  analyzeDocumentation: collectors.analyzeDocumentation,
  scanCodebase: collectors.scanCodebase,
  collectAllData: collectors.collectAllData,
  isGhAvailable: collectors.isGhAvailable,
  isPathSafe: collectors.documentation.isPathSafe
};
