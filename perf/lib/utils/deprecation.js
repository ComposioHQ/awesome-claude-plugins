/**
 * Deprecation Warning Utility
 * Centralized utility for handling deprecation warnings across the codebase
 *
 * @author Avi Fenesh
 * @license MIT
 */

// Track which functions have already shown deprecation warnings (once per function)
const _deprecationWarned = new Set();

/**
 * Show deprecation warning for sync functions (once per function name)
 * @param {string} funcName - Name of the deprecated sync function
 * @param {string} asyncAlt - Name of the async alternative
 */
function warnDeprecation(funcName, asyncAlt) {
  if (_deprecationWarned.has(funcName)) return;
  _deprecationWarned.add(funcName);
  console.warn(
    `DEPRECATED: ${funcName}() is synchronous and blocks the event loop. ` +
    `Use ${asyncAlt}() instead. Will be removed in v3.0.0.`
  );
}

/**
 * Reset deprecation warnings (for testing only)
 * @private
 */
function _resetDeprecationWarnings() {
  _deprecationWarned.clear();
}

module.exports = {
  warnDeprecation,
  _resetDeprecationWarnings
};
