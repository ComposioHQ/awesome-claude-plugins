/**
 * Cache Manager
 * Centralized caching abstraction with TTL and size limits
 *
 * @module lib/utils/cache-manager
 * @author Avi Fenesh
 * @license MIT
 */

/**
 * Cache manager with TTL and size limits
 */
class CacheManager {
  /**
   * Create a new cache manager
   * @param {Object} options - Cache configuration
   * @param {number} options.maxSize - Maximum number of entries (default: 100)
   * @param {number} options.ttl - Time-to-live in milliseconds (default: 60000)
   * @param {number} options.maxValueSize - Maximum size per value in bytes (default: null - unlimited)
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttl = options.ttl || 60000; // 1 minute default
    this.maxValueSize = options.maxValueSize || null;

    // Use Map for insertion-order guarantee (FIFO eviction)
    this._cache = new Map();
    this._timestamps = new Map();
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined if not found/expired
   */
  get(key) {
    if (!this._cache.has(key)) {
      return undefined;
    }

    // Check if expired
    const timestamp = this._timestamps.get(key);
    if (Date.now() - timestamp > this.ttl) {
      this.delete(key);
      return undefined;
    }

    return this._cache.get(key);
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @returns {boolean} True if cached, false if value too large
   */
  set(key, value) {
    // Check value size if limit set
    if (this.maxValueSize !== null && typeof value === 'string') {
      if (value.length > this.maxValueSize) {
        return false; // Value too large, don't cache
      }
    }

    // Update or add entry
    this._cache.set(key, value);
    this._timestamps.set(key, Date.now());

    // Enforce size limit with FIFO eviction
    this._enforceMaxSize();

    return true;
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is valid
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key existed
   */
  delete(key) {
    this._timestamps.delete(key);
    return this._cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this._cache.clear();
    this._timestamps.clear();
  }

  /**
   * Get current cache size
   * @returns {number} Number of entries
   */
  get size() {
    return this._cache.size;
  }

  /**
   * Get cache statistics
   * @returns {Object} Stats object with size, ttl, maxSize
   */
  getStats() {
    return {
      size: this._cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      maxValueSize: this.maxValueSize
    };
  }

  /**
   * Enforce maximum cache size using FIFO eviction
   * @private
   */
  _enforceMaxSize() {
    // Only evict if cache exceeds limit
    if (this._cache.size <= this.maxSize) {
      return;
    }

    // Map maintains insertion order - first key is oldest
    while (this._cache.size > this.maxSize) {
      const firstKey = this._cache.keys().next().value;
      this.delete(firstKey);
    }
  }

  /**
   * Remove expired entries (useful for long-running processes)
   * @returns {number} Number of entries removed
   */
  prune() {
    let removed = 0;
    const now = Date.now();

    for (const [key, timestamp] of this._timestamps.entries()) {
      if (now - timestamp > this.ttl) {
        this.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

module.exports = { CacheManager };
