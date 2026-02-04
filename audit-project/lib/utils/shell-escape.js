/**
 * Shell Escaping Utilities
 * Centralized string escaping functions for safe shell command construction
 *
 * @module lib/utils/shell-escape
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Escape shell special characters for safe command interpolation
 * Handles all dangerous shell metacharacters including command injection vectors
 * Optimized: uses single regex test instead of multiple .includes() calls
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for shell use
 * @throws {Error} If string contains null bytes or newlines
 */
function escapeShell(str) {
  if (typeof str !== 'string') return '';

  // Reject null bytes and newlines which could be used for injection
  // Optimized: single regex test instead of 3 separate .includes() scans
  // Use \x00 instead of \0 for better portability across JS engines
  if (/[\x00\n\r]/.test(str)) {
    throw new Error('Input contains invalid characters (null bytes or newlines)');
  }

  // Escape all shell metacharacters: " $ ` \ ! ; | & > < ( ) { } [ ] * ? ~ # ' space tab
  return str.replace(/["\$`\\!;|&><(){}[\]*?~#'\s]/g, '\\$&');
}

/**
 * Escape single quotes for shell (replace ' with '\''
 * Use this for strings that will be wrapped in single quotes
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for single-quoted shell use
 */
function escapeSingleQuotes(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/'/g, "'\\''");
}

/**
 * Validate and sanitize file extension
 * Removes all non-alphanumeric characters
 * @param {string} ext - Extension to validate
 * @returns {string} Safe extension (alphanumeric only), defaults to 'ts' if empty
 */
function sanitizeExtension(ext) {
  if (typeof ext !== 'string') return 'ts';
  const safe = ext.replace(/[^a-zA-Z0-9]/g, '');
  return safe || 'ts';
}

/**
 * Escape a string for use in a double-quoted shell context
 * More permissive than escapeShell but still safe
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for double-quoted shell use
 */
function escapeDoubleQuotes(str) {
  if (typeof str !== 'string') return '';

  // In double quotes, we need to escape: $ ` " \ and newlines
  return str.replace(/[$`"\\\n]/g, '\\$&');
}

/**
 * Quote a string for safe shell use
 * Wraps in single quotes and escapes any embedded single quotes
 * This is often safer than escapeShell for complex strings
 * @param {string} str - String to quote
 * @returns {string} Safely quoted string
 */
function quoteShell(str) {
  if (typeof str !== 'string') return "''";

  // Wrap in single quotes and escape any embedded single quotes
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

module.exports = {
  escapeShell,
  escapeSingleQuotes,
  sanitizeExtension,
  escapeDoubleQuotes,
  quoteShell
};
