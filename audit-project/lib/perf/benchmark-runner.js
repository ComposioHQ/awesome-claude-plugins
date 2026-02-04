/**
 * Sequential benchmark runner utilities.
 *
 * @module lib/perf/benchmark-runner
 */

const { execSync } = require('child_process');
const { validateBaseline } = require('./schemas');

const DEFAULT_MIN_DURATION = 60;
const BINARY_SEARCH_MIN_DURATION = 30;
const DEFAULT_DURATION_SLACK_SECONDS = 1;

function parseDuration(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Normalize benchmark options and enforce minimum durations.
 * @param {object} options
 * @returns {object}
 */
function normalizeBenchmarkOptions(options = {}) {
  const mode = options.mode || 'full';
  const defaultMin = mode === 'binary-search'
    ? BINARY_SEARCH_MIN_DURATION
    : DEFAULT_MIN_DURATION;
  const requestedDuration = parseDuration(options.duration);
  const requestedMin = parseDuration(options.minDuration);
  const minDuration = requestedMin ?? requestedDuration ?? defaultMin;
  const duration = Math.max(requestedDuration ?? minDuration, minDuration);

  return {
    ...options,
    mode,
    duration,
    warmup: options.warmup || 10,
    allowShort: options.allowShort === true
  };
}

/**
 * Run a benchmark command synchronously (sequential only).
 * @param {string} command
 * @param {object} options
 * @param {number} [options.duration]
 * @param {number} [options.minDuration]
 * @param {boolean} [options.setDurationEnv]
 * @param {string} [options.runMode]
 * @returns {{ success: boolean, output: string }}
 */
function runBenchmark(command, options = {}) {
  if (!command || typeof command !== 'string') {
    throw new Error('Benchmark command must be a non-empty string');
  }

  const normalized = normalizeBenchmarkOptions(options);
  const setDurationEnv = options.setDurationEnv !== false;
  const env = {
    ...process.env,
    ...normalized.env
  };
  if (setDurationEnv) {
    env.PERF_RUN_DURATION = String(normalized.duration);
  }
  if (options.runMode) {
    env.PERF_RUN_MODE = options.runMode;
  }

  const start = Date.now();
  let output;
  try {
    output = execSync(command, {
      stdio: 'pipe',
      encoding: 'utf8',
      env
    });
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : '';
    const stdout = error.stdout ? error.stdout.toString().trim() : '';
    const exitCode = error.status ?? 'unknown';
    const details = stderr || stdout || error.message || 'No error details available';
    throw new Error(
      `Benchmark command failed (exit code ${exitCode}): ${command}\n` +
      `Details: ${details}`
    );
  }
  const elapsedSeconds = (Date.now() - start) / 1000;

  const allowShort = normalized.allowShort || process.env.PERF_ALLOW_SHORT === '1';
  if (!allowShort && setDurationEnv && elapsedSeconds + DEFAULT_DURATION_SLACK_SECONDS < normalized.duration) {
    throw new Error(`Benchmark finished too quickly (${elapsedSeconds.toFixed(2)}s < ${normalized.duration}s)`);
  }

  return {
    success: true,
    output,
    duration: normalized.duration,
    warmup: normalized.warmup,
    mode: normalized.mode,
    elapsedSeconds
  };
}

function parseLineMetrics(output) {
  const lines = output.split(/\r?\n/);
  const metrics = {};
  let sawMarker = false;

  for (const line of lines) {
    const markerIndex = line.indexOf('PERF_METRICS');
    if (markerIndex === -1) continue;

    sawMarker = true;
    const rest = line.slice(markerIndex + 'PERF_METRICS'.length).trim();
    if (!rest) continue;

    const tokens = rest.split(/\s+/).filter(Boolean);
    let scenario = null;
    const lineMetrics = {};

    for (const token of tokens) {
      const eqIndex = token.indexOf('=');
      if (eqIndex === -1) continue;

      const key = token.slice(0, eqIndex).trim();
      const rawValue = token.slice(eqIndex + 1).trim();
      if (!key) continue;

      if (key === 'scenario') {
        scenario = rawValue;
        continue;
      }

      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        return { ok: false, error: `Metric ${key} must be a number` };
      }

      lineMetrics[key] = value;
    }

    if (Object.keys(lineMetrics).length === 0) {
      continue;
    }

    if (scenario) {
      if (!metrics.scenarios) {
        metrics.scenarios = {};
      }
      metrics.scenarios[scenario] = {
        ...(metrics.scenarios[scenario] || {}),
        ...lineMetrics
      };
    } else {
      Object.assign(metrics, lineMetrics);
    }
  }

  if (!sawMarker) {
    return { ok: false, error: 'Metrics markers not found' };
  }

  return { ok: true, metrics };
}

/**
 * Parse metrics from benchmark output using PERF_METRICS markers.
 * @param {string} output
 * @returns {{ ok: boolean, metrics?: object, error?: string }}
 */
function parseMetrics(output) {
  if (typeof output !== 'string') {
    return { ok: false, error: 'Output must be a string' };
  }

  const startMarker = 'PERF_METRICS_START';
  const endMarker = 'PERF_METRICS_END';
  const startIndex = output.indexOf(startMarker);
  const endIndex = output.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const jsonStart = startIndex + startMarker.length;
    const raw = output.slice(jsonStart, endIndex).trim();

    try {
      const parsed = JSON.parse(raw);
      const validation = validateBaseline({
        version: 'temp',
        recordedAt: new Date().toISOString(),
        command: 'temp',
        metrics: parsed
      });
      if (!validation.ok) {
        return { ok: false, error: `Invalid metrics: ${validation.errors.join(', ')}` };
      }
      return { ok: true, metrics: parsed };
    } catch (error) {
      return { ok: false, error: `Failed to parse metrics JSON: ${error.message}` };
    }
  }

  const lineParsed = parseLineMetrics(output);
  if (!lineParsed.ok) {
    return lineParsed;
  }

  const validation = validateBaseline({
    version: 'temp',
    recordedAt: new Date().toISOString(),
    command: 'temp',
    metrics: lineParsed.metrics
  });
  if (!validation.ok) {
    return { ok: false, error: `Invalid metrics: ${validation.errors.join(', ')}` };
  }
  return { ok: true, metrics: lineParsed.metrics };
}

function flattenMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    throw new Error('metrics must be an object');
  }
  const flat = {};

  for (const [key, value] of Object.entries(metrics)) {
    if (key === 'scenarios') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('metrics.scenarios must be an object');
      }
      for (const [scenarioName, scenarioMetrics] of Object.entries(value)) {
        if (!scenarioMetrics || typeof scenarioMetrics !== 'object' || Array.isArray(scenarioMetrics)) {
          throw new Error(`metrics.scenarios.${scenarioName} must be an object`);
        }
        for (const [metricName, metricValue] of Object.entries(scenarioMetrics)) {
          if (typeof metricValue !== 'number' || Number.isNaN(metricValue)) {
            throw new Error(`metric ${scenarioName}.${metricName} must be a number`);
          }
          flat[`scenarios.${scenarioName}.${metricName}`] = metricValue;
        }
      }
      continue;
    }

    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`metric ${key} must be a number`);
    }
    flat[key] = value;
  }

  return flat;
}

function unflattenMetrics(flat) {
  const metrics = {};
  for (const [key, value] of Object.entries(flat)) {
    if (!key.startsWith('scenarios.')) {
      metrics[key] = value;
      continue;
    }
    const parts = key.split('.');
    if (parts.length < 3) {
      throw new Error(`invalid scenario metric key: ${key}`);
    }
    const scenarioName = parts[1];
    const metricName = parts.slice(2).join('.');
    if (!metrics.scenarios) {
      metrics.scenarios = {};
    }
    if (!metrics.scenarios[scenarioName]) {
      metrics.scenarios[scenarioName] = {};
    }
    metrics.scenarios[scenarioName][metricName] = value;
  }
  return metrics;
}

function aggregateValues(values, aggregate) {
  const normalized = (aggregate || 'median').toLowerCase();
  const sorted = [...values].sort((a, b) => a - b);

  switch (normalized) {
    case 'median': {
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
      }
      return sorted[mid];
    }
    case 'mean': {
      const sum = sorted.reduce((acc, value) => acc + value, 0);
      return sum / sorted.length;
    }
    case 'min':
      return sorted[0];
    case 'max':
      return sorted[sorted.length - 1];
    default:
      throw new Error(`Unsupported aggregate: ${aggregate}`);
  }
}

function aggregateMetrics(samples, aggregate = 'median') {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('samples must be a non-empty array');
  }

  const flattened = samples.map(flattenMetrics);
  const keys = Object.keys(flattened[0]).sort();

  for (const sample of flattened) {
    const sampleKeys = Object.keys(sample).sort();
    if (sampleKeys.length !== keys.length) {
      throw new Error('Metric sets differ across runs');
    }
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] !== sampleKeys[i]) {
        throw new Error('Metric sets differ across runs');
      }
    }
  }

  const aggregated = {};
  for (const key of keys) {
    const values = flattened.map(sample => sample[key]);
    aggregated[key] = aggregateValues(values, aggregate);
  }

  return unflattenMetrics(aggregated);
}

function resolveRuns(options) {
  if (!options || options.runs == null) return 1;
  const runs = Number(options.runs);
  if (!Number.isFinite(runs) || runs < 1) {
    throw new Error('runs must be a positive number');
  }
  return Math.floor(runs);
}

/**
 * Run benchmark multiple times and aggregate metrics.
 * @param {string} command
 * @param {object} options
 * @returns {{ metrics: object, samples: object[], runs: number, aggregate: string }}
 */
function runBenchmarkSeries(command, options = {}) {
  const runs = resolveRuns(options);
  const aggregate = options.aggregate || (runs > 1 ? 'median' : 'median');
  const runMode = options.runMode || (runs > 1 ? 'oneshot' : 'duration');
  const env = {
    ...options.env,
    PERF_RUN_MODE: runMode
  };
  const allowShort = options.allowShort === true || runMode === 'oneshot';
  const setDurationEnv = runMode !== 'oneshot' && options.setDurationEnv !== false;

  const samples = [];
  for (let i = 0; i < runs; i++) {
    let result;
    try {
      result = runBenchmark(command, {
        ...options,
        env,
        allowShort,
        setDurationEnv,
        runMode
      });
    } catch (error) {
      throw new Error(
        `Benchmark run ${i + 1}/${runs} failed: ${error.message}`
      );
    }
    const parsed = parseMetrics(result.output);
    if (!parsed.ok) {
      throw new Error(`Metrics parse failed on run ${i + 1}/${runs}: ${parsed.error}`);
    }
    samples.push(parsed.metrics);
  }

  const metrics = samples.length === 1 ? samples[0] : aggregateMetrics(samples, aggregate);
  return {
    metrics,
    samples,
    runs,
    aggregate
  };
}

module.exports = {
  DEFAULT_MIN_DURATION,
  BINARY_SEARCH_MIN_DURATION,
  normalizeBenchmarkOptions,
  runBenchmark,
  runBenchmarkSeries,
  aggregateMetrics,
  parseMetrics
};
