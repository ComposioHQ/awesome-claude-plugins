/**
 * Binary search helper for breaking point discovery.
 *
 * @module lib/perf/breaking-point-finder
 */

/**
 * Find breaking point using binary search.
 * The runner should return { ok: boolean, data?: any }.
 *
 * @param {object} options
 * @param {number} options.min
 * @param {number} options.max
 * @param {(value:number)=>Promise<{ok:boolean,data?:any}>} options.runner
 * @returns {Promise<{breakingPoint:number|null, attempts:number, history:Array}>}
 */
async function findBreakingPoint({ min, max, runner }) {
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new Error('min and max must be numbers');
  }
  if (typeof runner !== 'function') {
    throw new Error('runner must be a function');
  }

  let low = min;
  let high = max;
  let breakingPoint = null;
  const history = [];

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const result = await runner(mid);
    history.push({ value: mid, ok: result.ok });

    if (result.ok) {
      low = mid + 1;
    } else {
      breakingPoint = mid;
      high = mid - 1;
    }
  }

  return {
    breakingPoint,
    attempts: history.length,
    history
  };
}

module.exports = {
  findBreakingPoint
};
