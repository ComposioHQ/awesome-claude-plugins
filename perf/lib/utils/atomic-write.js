/**
 * Atomic File Write Utility
 *
 * Provides crash-safe file writes using the write-to-temp-then-rename pattern.
 * Prevents data corruption from partial writes during concurrent operations.
 *
 * @module utils/atomic-write
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate a unique temporary filename
 * @param {string} targetPath - Target file path
 * @returns {string} Temporary file path
 */
function getTempPath(targetPath) {
  const dir = path.dirname(targetPath);
  const basename = path.basename(targetPath);
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  return path.join(dir, `.${basename}.${randomSuffix}.tmp`);
}

/**
 * Write file atomically using write-to-temp-then-rename pattern
 *
 * This ensures:
 * - File is never partially written (atomic rename)
 * - Concurrent reads see either old or new content, never partial
 * - Crash-safe: interrupted writes don't corrupt existing file
 *
 * @param {string} filePath - Target file path
 * @param {string} content - Content to write
 * @param {Object} options - Options
 * @param {string} options.encoding - File encoding (default: 'utf8')
 * @param {number} options.mode - File mode (default: 0o644)
 * @returns {boolean} True on success
 * @throws {Error} On write or rename failure
 */
function writeFileAtomic(filePath, content, options = {}) {
  const { encoding = 'utf8', mode = 0o644 } = options;

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = getTempPath(filePath);

  try {
    // Write to temp file
    fs.writeFileSync(tempPath, content, { encoding, mode });

    // Atomic rename (overwrites existing file)
    fs.renameSync(tempPath, filePath);

    return true;
  } catch (error) {
    // Cleanup temp file on failure
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Write JSON file atomically
 *
 * @param {string} filePath - Target file path
 * @param {*} data - Data to serialize as JSON
 * @param {Object} options - Options
 * @param {number} options.indent - JSON indentation (default: 2)
 * @param {string} options.encoding - File encoding (default: 'utf8')
 * @returns {boolean} True on success
 */
function writeJsonAtomic(filePath, data, options = {}) {
  const { indent = 2, ...writeOptions } = options;
  const content = JSON.stringify(data, null, indent);
  return writeFileAtomic(filePath, content, writeOptions);
}

module.exports = {
  writeFileAtomic,
  writeJsonAtomic,
  getTempPath
};
