/**
 * Language-specific query patterns for ast-grep
 *
 * @module lib/repo-map/queries
 */

'use strict';

const path = require('path');

const javascript = require('./javascript');
const typescript = require('./typescript');
const python = require('./python');
const rust = require('./rust');
const go = require('./go');
const java = require('./java');

/**
 * Get query patterns for a language
 * @param {string} language - Language name
 * @returns {Object|null}
 */
function getQueriesForLanguage(language) {
  switch (language) {
    case 'javascript':
    case 'js':
    case 'node':
      return javascript;
    case 'typescript':
    case 'ts':
      return typescript;
    case 'python':
    case 'py':
      return python;
    case 'rust':
      return rust;
    case 'go':
      return go;
    case 'java':
      return java;
    default:
      return null;
  }
}

/**
 * Get base ast-grep language identifier
 * @param {string} language - Language name
 * @returns {string}
 */
function getSgLanguage(language) {
  switch (language) {
    case 'javascript':
    case 'js':
    case 'node':
      return 'javascript';
    case 'typescript':
    case 'ts':
      return 'typescript';
    case 'python':
    case 'py':
      return 'python';
    case 'rust':
      return 'rust';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    default:
      return 'javascript';
  }
}

/**
 * Get ast-grep language identifier based on file extension
 * @param {string} filePath - File path
 * @param {string} language - Language name
 * @returns {string}
 */
function getSgLanguageForFile(filePath, language) {
  const ext = path.extname(filePath).toLowerCase();

  if (language === 'javascript') {
    if (ext === '.jsx') return 'jsx';
    return 'javascript';
  }

  if (language === 'typescript') {
    if (ext === '.tsx') return 'tsx';
    return 'typescript';
  }

  return getSgLanguage(language);
}

module.exports = {
  getQueriesForLanguage,
  getSgLanguage,
  getSgLanguageForFile
};
