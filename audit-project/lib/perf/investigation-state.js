/**
 * Performance investigation state management
 *
 * Stores investigation state and logs under the platform-aware state directory:
 * - {state-dir}/perf/investigation.json
 * - {state-dir}/perf/investigations/{id}.md
 *
 * @module lib/perf/investigation-state
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getStateDir } = require('../platform/state-dir');
const { validateInvestigationState, assertValid } = require('./schemas');
const { writeJsonAtomic, writeFileAtomic } = require('../utils/atomic-write');

const SCHEMA_VERSION = 1;
const INVESTIGATION_FILE = 'investigation.json';
const LOG_DIR = 'investigations';
const BASELINE_DIR = 'baselines';

const PHASES = [
  'setup',
  'baseline',
  'breaking-point',
  'constraints',
  'hypotheses',
  'code-paths',
  'profiling',
  'optimization',
  'decision',
  'consolidation'
];

/**
 * Validate and resolve path to prevent path traversal attacks
 * @param {string} basePath - Base directory path
 * @returns {string} Validated absolute path
 */
function validatePath(basePath) {
  if (typeof basePath !== 'string' || basePath.length === 0) {
    throw new Error('Path must be a non-empty string');
  }
  const resolved = path.resolve(basePath);
  if (resolved.includes('\0')) {
    throw new Error('Path contains invalid null byte');
  }
  return resolved;
}

/**
 * Validate that target path is within base directory
 * @param {string} targetPath - Target file path
 * @param {string} basePath - Base directory
 */
function validatePathWithinBase(targetPath, basePath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(basePath);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error('Path traversal detected');
  }
}

function assertSafeInvestigationId(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('Investigation id is required');
  }
  if (id.includes('..') || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    throw new Error('Investigation id contains invalid characters');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error('Investigation id contains invalid characters');
  }
  return id;
}

/**
 * Generate a unique investigation ID
 * @returns {string}
 */
function generateInvestigationId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const random = crypto.randomBytes(4).toString('hex');
  return `perf-${date}-${time}-${random}`;
}

/**
 * Get perf state directory path
 * @param {string} basePath
 * @returns {string}
 */
function getPerfDir(basePath = process.cwd()) {
  const validatedBase = validatePath(basePath);
  const perfDir = path.join(validatedBase, getStateDir(basePath), 'perf');
  validatePathWithinBase(perfDir, validatedBase);
  return perfDir;
}

/**
 * Ensure perf directories exist
 * @param {string} basePath
 * @returns {{ perfDir: string, logDir: string, baselineDir: string }}
 */
function ensurePerfDirs(basePath = process.cwd()) {
  const perfDir = getPerfDir(basePath);
  const logDir = path.join(perfDir, LOG_DIR);
  const baselineDir = path.join(perfDir, BASELINE_DIR);

  if (!fs.existsSync(perfDir)) {
    fs.mkdirSync(perfDir, { recursive: true });
  }
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  if (!fs.existsSync(baselineDir)) {
    fs.mkdirSync(baselineDir, { recursive: true });
  }

  return { perfDir, logDir, baselineDir };
}

/**
 * Get path to investigation.json
 * @param {string} basePath
 * @returns {string}
 */
function getInvestigationPath(basePath = process.cwd()) {
  const perfDir = getPerfDir(basePath);
  return path.join(perfDir, INVESTIGATION_FILE);
}

/**
 * Get path to investigation log
 * @param {string} id
 * @param {string} basePath
 * @returns {string}
 */
function getInvestigationLogPath(id, basePath = process.cwd()) {
  const safeId = assertSafeInvestigationId(id);
  const { logDir } = ensurePerfDirs(basePath);
  return path.join(logDir, `${safeId}.md`);
}

/**
 * Read investigation.json
 * @param {string} basePath
 * @returns {object|null}
 */
function readInvestigation(basePath = process.cwd()) {
  const investigationPath = getInvestigationPath(basePath);
  if (!fs.existsSync(investigationPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(investigationPath, 'utf8'));
    const validation = validateInvestigationState(parsed);
    if (!validation.ok) {
      console.error(`[CRITICAL] Invalid investigation state at ${investigationPath}: ${validation.errors.join(', ')}`);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error(`[CRITICAL] Corrupted investigation.json at ${investigationPath}: ${error.message}`);
    return null;
  }
}

/**
 * Write investigation.json
 * Increments version for optimistic locking
 * @param {object} state
 * @param {string} basePath
 * @returns {boolean}
 */
function writeInvestigation(state, basePath = process.cwd()) {
  ensurePerfDirs(basePath);
  const investigationPath = getInvestigationPath(basePath);
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString(),
    _version: (state._version || 0) + 1
  };
  assertValid(validateInvestigationState(nextState), 'Invalid investigation state');
  writeJsonAtomic(investigationPath, nextState);
  return true;
}

/**
 * Update investigation.json with partial updates
 * Uses optimistic locking with version check and retry
 * @param {object} updates
 * @param {string} basePath
 * @returns {object|null}
 */
function updateInvestigation(updates, basePath = process.cwd()) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = readInvestigation(basePath) || {};
    const initialVersion = current._version || 0;
    const nextState = { ...current };

    for (const [key, value] of Object.entries(updates)) {
      // Skip internal version field from updates
      if (key === '_version') continue;

      if (value === null) {
        nextState[key] = null;
      } else if (
        value && typeof value === 'object' && !Array.isArray(value) &&
        nextState[key] && typeof nextState[key] === 'object' && !Array.isArray(nextState[key])
      ) {
        nextState[key] = { ...nextState[key], ...value };
      } else {
        nextState[key] = value;
      }
    }

    // Preserve version for write (writeInvestigation will increment it)
    nextState._version = initialVersion;

    writeInvestigation(nextState, basePath);

    // Re-read to verify our write succeeded
    const afterWrite = readInvestigation(basePath);
    if (afterWrite && afterWrite._version === initialVersion + 1) {
      return afterWrite; // Success
    }

    // Version conflict - retry after brief delay
    if (attempt < MAX_RETRIES - 1) {
      const delay = Math.floor(Math.random() * 50) + 10;
      const start = Date.now();
      while (Date.now() - start < delay) {
        // Busy wait (synchronous delay)
      }
    }
  }

  // All retries exhausted
  console.error('[WARN] updateInvestigation: max retries exceeded, possible version conflict');
  return readInvestigation(basePath);
}

/**
 * Initialize a new investigation
 * @param {object} options
 * @param {string} basePath
 * @returns {object}
 */
function initializeInvestigation(options = {}, basePath = process.cwd()) {
  const id = options.id || generateInvestigationId();
  const phase = options.phase || PHASES[0];

  if (!PHASES.includes(phase)) {
    throw new Error(`Invalid perf phase: ${phase}`);
  }

  const state = {
    schemaVersion: SCHEMA_VERSION,
    id,
    status: 'in_progress',
    phase,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenario: {
      description: options.scenario || '',
      metrics: options.metrics || [],
      successCriteria: options.successCriteria || '',
      scenarios: Array.isArray(options.scenarios) ? options.scenarios : []
    },
    baselines: [],
    hypotheses: [],
    codePaths: [],
    experiments: [],
    results: [],
    breakingPoint: null,
    breakingPointHistory: [],
    constraintResults: [],
    profilingResults: [],
    decision: null
  };

  assertValid(validateInvestigationState(state), 'Invalid initial investigation state');
  writeInvestigation(state, basePath);
  return state;
}

/**
 * Append a line to the investigation log
 * @param {string} id
 * @param {string} content
 * @param {string} basePath
 */
function appendInvestigationLog(id, content, basePath = process.cwd()) {
  if (!content) return;
  const logPath = getInvestigationLogPath(id, basePath);
  const entry = content.endsWith('\n') ? content : `${content}\n`;
  fs.appendFileSync(logPath, entry, 'utf8');
}

/**
 * Append a baseline section to the investigation log
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.userQuote
 * @param {string} input.command
 * @param {object} input.metrics
 * @param {string} input.baselinePath
 * @param {number} [input.duration]
 * @param {number} [input.runs]
 * @param {string} [input.aggregate]
 * @param {string} [input.date]
 * @param {string} basePath
 */
function appendBaselineLog(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('appendBaselineLog requires an input object');
  }

  const { id, userQuote, command, metrics, baselinePath, date, scenarios, duration, runs, aggregate } = input;

  if (!id || typeof id !== 'string') {
    throw new Error('appendBaselineLog requires a valid investigation id');
  }
  if (!userQuote || typeof userQuote !== 'string') {
    throw new Error('appendBaselineLog requires a non-empty userQuote');
  }
  if (!command || typeof command !== 'string') {
    throw new Error('appendBaselineLog requires a non-empty command');
  }
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    throw new Error('appendBaselineLog requires a metrics object');
  }
  if (!baselinePath || typeof baselinePath !== 'string') {
    throw new Error('appendBaselineLog requires a baselinePath');
  }

  const logDate = date || new Date().toISOString().slice(0, 10);
  const metricsText = JSON.stringify(metrics);
  const scenarioText = Array.isArray(scenarios) && scenarios.length > 0
    ? scenarios.map((scenario) => scenario.name).filter(Boolean).join(', ')
    : '';
  const durationLine = Number.isFinite(duration) ? `- Duration: ${duration}s` : null;
  const runsLine = Number.isFinite(runs) ? `- Runs: ${runs}` : null;
  const aggregateLine = aggregate ? `- Aggregate: ${aggregate}` : null;

  const entry = [
    `## Baseline - ${logDate}`,
    '',
    `**User Quote:** "${userQuote}"`,
    '',
    '**Summary**',
    scenarioText ? `- Scenarios: ${scenarioText}` : null,
    `- Baseline command: \`${command}\``,
    durationLine,
    runsLine,
    aggregateLine,
    `- Metrics: ${metricsText}`,
    '',
    '**Evidence**',
    `- Baseline file: ${baselinePath}`,
    ''
  ].filter(Boolean).join('\n');

  appendInvestigationLog(id, entry, basePath);
}

/**
 * Append a profiling section to the investigation log
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.userQuote
 * @param {string} input.tool
 * @param {string} input.command
 * @param {string[]} input.artifacts
 * @param {string[]} input.hotspots
 * @param {string} [input.date]
 * @param {string} basePath
 */
function appendProfilingLog(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('appendProfilingLog requires an input object');
  }

  const { id, userQuote, tool, command, artifacts, hotspots, date } = input;

  if (!id || typeof id !== 'string') {
    throw new Error('appendProfilingLog requires a valid investigation id');
  }
  if (!userQuote || typeof userQuote !== 'string') {
    throw new Error('appendProfilingLog requires a non-empty userQuote');
  }
  if (!tool || typeof tool !== 'string') {
    throw new Error('appendProfilingLog requires a tool');
  }
  if (!command || typeof command !== 'string') {
    throw new Error('appendProfilingLog requires a command');
  }

  const logDate = date || new Date().toISOString().slice(0, 10);
  const artifactList = Array.isArray(artifacts) ? artifacts : [];
  const hotspotList = Array.isArray(hotspots) ? hotspots : [];

  const entry = [
    `## Profiling - ${logDate}`,
    '',
    `**User Quote:** "${userQuote}"`,
    '',
    '**Summary**',
    `- Tool: ${tool}`,
    `- Command: \`${command}\``,
    '',
    '**Evidence**',
    artifactList.length ? `- Artifacts: ${artifactList.join(', ')}` : '- Artifacts: n/a',
    hotspotList.length ? `- Hotspots: ${hotspotList.join(', ')}` : '- Hotspots: n/a',
    ''
  ].join('\n');

  appendInvestigationLog(id, entry, basePath);
}

/**
 * Append a decision section to the investigation log
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.userQuote
 * @param {string} input.verdict
 * @param {string} input.rationale
 * @param {string} [input.date]
 * @param {string} basePath
 */
function appendDecisionLog(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('appendDecisionLog requires an input object');
  }

  const { id, userQuote, verdict, rationale, date, resultsCount } = input;

  if (!id || typeof id !== 'string') {
    throw new Error('appendDecisionLog requires a valid investigation id');
  }
  if (!userQuote || typeof userQuote !== 'string') {
    throw new Error('appendDecisionLog requires a non-empty userQuote');
  }
  if (!verdict || typeof verdict !== 'string') {
    throw new Error('appendDecisionLog requires a verdict');
  }
  if (!rationale || typeof rationale !== 'string') {
    throw new Error('appendDecisionLog requires a rationale');
  }

  const logDate = date || new Date().toISOString().slice(0, 10);
  const resultCountText = typeof resultsCount === 'number' ? String(resultsCount) : 'n/a';

  const entry = [
    `## Decision - ${logDate}`,
    '',
    `**User Quote:** "${userQuote}"`,
    '',
    '**Summary**',
    `- Verdict: ${verdict}`,
    `- Rationale: ${rationale}`,
    '',
    '**Evidence**',
    `- Results count: ${resultCountText}`,
    ''
  ].join('\n');

  appendInvestigationLog(id, entry, basePath);
}

/**
 * Append a setup section to the investigation log
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.userQuote
 * @param {string} input.scenario
 * @param {string} input.command
 * @param {string} input.version
 * @param {number} [input.duration]
 * @param {number} [input.runs]
 * @param {string} [input.aggregate]
 * @param {string} [input.date]
 * @param {string} basePath
 */
function appendSetupLog(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('appendSetupLog requires an input object');
  }

  const { id, userQuote, scenario, command, version, duration, runs, aggregate, date } = input;

  if (!id || typeof id !== 'string') {
    throw new Error('appendSetupLog requires a valid investigation id');
  }
  if (!userQuote || typeof userQuote !== 'string') {
    throw new Error('appendSetupLog requires a non-empty userQuote');
  }
  if (!scenario || typeof scenario !== 'string') {
    throw new Error('appendSetupLog requires a scenario');
  }
  if (!command || typeof command !== 'string') {
    throw new Error('appendSetupLog requires a command');
  }
  if (!version || typeof version !== 'string') {
    throw new Error('appendSetupLog requires a version');
  }

  const logDate = date || new Date().toISOString().slice(0, 10);
  const durationLine = Number.isFinite(duration) ? `- Duration: ${duration}s` : null;
  const runsLine = Number.isFinite(runs) ? `- Runs: ${runs}` : null;
  const aggregateLine = aggregate ? `- Aggregate: ${aggregate}` : null;
  const entry = [
    `## Setup - ${logDate}`,
    '',
    `**User Quote:** "${userQuote}"`,
    '',
    '**Summary**',
    `- Scenario: ${scenario}`,
    `- Command: \`${command}\``,
    `- Version: ${version}`,
    durationLine,
    runsLine,
    aggregateLine,
    '',
    '**Evidence**',
    `- Command: \`${command}\``,
    `- Version: ${version}`,
    ''
  ].filter(Boolean).join('\n');

  appendInvestigationLog(id, entry, basePath);
}

/**
 * Append a breaking point section to the investigation log
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.userQuote
 * @param {string} input.paramEnv
 * @param {number} input.min
 * @param {number} input.max
 * @param {number|null} input.breakingPoint
 * @param {string} [input.date]
 * @param {string} basePath
 */
function appendBreakingPointLog(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('appendBreakingPointLog requires an input object');
  }
  const { id, userQuote, paramEnv, min, max, breakingPoint, history, date } = input;

  if (!id || typeof id !== 'string') {
    throw new Error('appendBreakingPointLog requires a valid investigation id');
  }
  if (!userQuote || typeof userQuote !== 'string') {
    throw new Error('appendBreakingPointLog requires a non-empty userQuote');
  }
  if (!paramEnv || typeof paramEnv !== 'string') {
    throw new Error('appendBreakingPointLog requires a paramEnv');
  }
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new Error('appendBreakingPointLog requires numeric min/max');
  }

  const logDate = date || new Date().toISOString().slice(0, 10);
  const historyText = Array.isArray(history) ? JSON.stringify(history) : 'n/a';
  const entry = [
    `## Breaking Point - ${logDate}`,
    '',
    `**User Quote:** "${userQuote}"`,
    '',
    '**Summary**',
    `- Param env: ${paramEnv}`,
    `- Range: ${min}..${max}`,
    `- Breaking point: ${breakingPoint ?? 'n/a'}`,
    '',
    '**Evidence**',
    `- History: ${historyText}`,
    ''
  ].join('\n');

  appendInvestigationLog(id, entry, basePath);
}

/**
 * Append a constraints section to the investigation log
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.userQuote
 * @param {object} input.constraints
 * @param {object} input.delta
 * @param {string} [input.date]
 * @param {string} basePath
 */
function appendConstraintLog(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('appendConstraintLog requires an input object');
  }
  const { id, userQuote, constraints, delta, date } = input;

  if (!id || typeof id !== 'string') {
    throw new Error('appendConstraintLog requires a valid investigation id');
  }
  if (!userQuote || typeof userQuote !== 'string') {
    throw new Error('appendConstraintLog requires a non-empty userQuote');
  }
  if (!constraints || typeof constraints !== 'object') {
    throw new Error('appendConstraintLog requires constraints');
  }
  if (!delta || typeof delta !== 'object') {
    throw new Error('appendConstraintLog requires delta');
  }

  const logDate = date || new Date().toISOString().slice(0, 10);
  const entry = [
    `## Constraints - ${logDate}`,
    '',
    `**User Quote:** "${userQuote}"`,
    '',
    '**Summary**',
    `- CPU: ${constraints.cpu || 'n/a'}`,
    `- Memory: ${constraints.memory || 'n/a'}`,
    '',
    '**Evidence**',
    `- Delta: ${JSON.stringify(delta.metrics || {})}`,
    ''
  ].join('\n');

  appendInvestigationLog(id, entry, basePath);
}

/**
 * Append a hypotheses section to the investigation log
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.userQuote
 * @param {Array} input.hypotheses
 * @param {string} [input.date]
 * @param {string} basePath
 */
function appendHypothesesLog(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('appendHypothesesLog requires an input object');
  }
  const { id, userQuote, hypotheses, date, gitHistory, hypothesesFile } = input;

  if (!id || typeof id !== 'string') {
    throw new Error('appendHypothesesLog requires a valid investigation id');
  }
  if (!userQuote || typeof userQuote !== 'string') {
    throw new Error('appendHypothesesLog requires a non-empty userQuote');
  }
  if (!Array.isArray(hypotheses)) {
    throw new Error('appendHypothesesLog requires hypotheses array');
  }

  const logDate = date || new Date().toISOString().slice(0, 10);
  const lines = hypotheses.map((item) => {
    if (!item) return null;
    const label = item.id ? `${item.id}: ` : '';
    const evidence = item.evidence ? ` (evidence: ${item.evidence})` : '';
    const confidence = item.confidence ? ` [${item.confidence}]` : '';
    return `- ${label}${item.hypothesis || 'n/a'}${confidence}${evidence}`;
  }).filter(Boolean);

  const entry = [
    `## Hypotheses - ${logDate}`,
    '',
    `**User Quote:** "${userQuote}"`,
    '',
    '**Summary**',
    lines.length > 0 ? lines.join('\n') : '- n/a',
    '',
    '**Evidence**',
    `- Git history: ${Array.isArray(gitHistory) && gitHistory.length ? gitHistory.join(' | ') : 'n/a'}`,
    hypothesesFile ? `- Hypotheses file: ${hypothesesFile}` : null,
    ''
  ].join('\n');

  appendInvestigationLog(id, entry, basePath);
}

/**
 * Append a code-paths section to the investigation log
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.userQuote
 * @param {string[]} input.keywords
 * @param {Array} input.paths
 * @param {string} [input.date]
 * @param {string} basePath
 */
function appendCodePathsLog(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('appendCodePathsLog requires an input object');
  }
  const { id, userQuote, keywords, paths, date, repoMapStatus } = input;

  if (!id || typeof id !== 'string') {
    throw new Error('appendCodePathsLog requires a valid investigation id');
  }
  if (!userQuote || typeof userQuote !== 'string') {
    throw new Error('appendCodePathsLog requires a non-empty userQuote');
  }
  if (!Array.isArray(paths)) {
    throw new Error('appendCodePathsLog requires paths array');
  }

  const logDate = date || new Date().toISOString().slice(0, 10);
  const keywordText = Array.isArray(keywords) && keywords.length > 0 ? keywords.join(', ') : 'n/a';
  const pathLines = paths.map((pathEntry) => {
    const file = pathEntry.file || 'n/a';
    const score = typeof pathEntry.score === 'number' ? ` (score: ${pathEntry.score})` : '';
    const symbols = Array.isArray(pathEntry.symbols) && pathEntry.symbols.length > 0
      ? ` [${pathEntry.symbols.join(', ')}]`
      : '';
    return `- ${file}${score}${symbols}`;
  });

  const entry = [
    `## Code Paths - ${logDate}`,
    '',
    `**User Quote:** "${userQuote}"`,
    '',
    '**Summary**',
    `- Keywords: ${keywordText}`,
    pathLines.length > 0 ? pathLines.join('\n') : '- n/a',
    '',
    '**Evidence**',
    `- Repo map: ${repoMapStatus || 'n/a'}`,
    `- Paths count: ${pathLines.length}`,
    ''
  ].join('\n');

  appendInvestigationLog(id, entry, basePath);
}

/**
 * Append an optimization section to the investigation log
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.userQuote
 * @param {string} input.change
 * @param {object} input.delta
 * @param {string} input.verdict
 * @param {number} [input.runs]
 * @param {string} [input.aggregate]
 * @param {string} [input.date]
 * @param {string} basePath
 */
function appendOptimizationLog(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('appendOptimizationLog requires an input object');
  }
  const { id, userQuote, change, delta, verdict, date, gitHistory, runs, aggregate } = input;

  if (!id || typeof id !== 'string') {
    throw new Error('appendOptimizationLog requires a valid investigation id');
  }
  if (!userQuote || typeof userQuote !== 'string') {
    throw new Error('appendOptimizationLog requires a non-empty userQuote');
  }
  if (!change || typeof change !== 'string') {
    throw new Error('appendOptimizationLog requires a change summary');
  }
  if (!delta || typeof delta !== 'object') {
    throw new Error('appendOptimizationLog requires delta');
  }
  if (!verdict || typeof verdict !== 'string') {
    throw new Error('appendOptimizationLog requires a verdict');
  }

  const logDate = date || new Date().toISOString().slice(0, 10);
  const gitHistoryText = Array.isArray(gitHistory) && gitHistory.length
    ? gitHistory.join(' | ')
    : 'n/a';
  const runsLine = Number.isFinite(runs) ? `- Runs: ${runs}` : null;
  const aggregateLine = aggregate ? `- Aggregate: ${aggregate}` : null;
  const entry = [
    `## Optimization - ${logDate}`,
    '',
    `**User Quote:** "${userQuote}"`,
    '',
    '**Summary**',
    `- Change: ${change}`,
    `- Verdict: ${verdict}`,
    runsLine,
    aggregateLine,
    '',
    '**Evidence**',
    `- Delta: ${JSON.stringify(delta.metrics || {})}`,
    `- Git history: ${gitHistoryText}`,
    ''
  ].join('\n');

  appendInvestigationLog(id, entry, basePath);
}

/**
 * Append a consolidation section to the investigation log
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.userQuote
 * @param {string} input.version
 * @param {string} input.path
 * @param {string} [input.date]
 * @param {string} basePath
 */
function appendConsolidationLog(input, basePath = process.cwd()) {
  if (!input || typeof input !== 'object') {
    throw new Error('appendConsolidationLog requires an input object');
  }

  const { id, userQuote, version, path, date } = input;

  if (!id || typeof id !== 'string') {
    throw new Error('appendConsolidationLog requires a valid investigation id');
  }
  if (!userQuote || typeof userQuote !== 'string') {
    throw new Error('appendConsolidationLog requires a non-empty userQuote');
  }
  if (!version || typeof version !== 'string') {
    throw new Error('appendConsolidationLog requires a version');
  }
  if (!path || typeof path !== 'string') {
    throw new Error('appendConsolidationLog requires a path');
  }

  const logDate = date || new Date().toISOString().slice(0, 10);
  const entry = [
    `## Consolidation - ${logDate}`,
    '',
    `**User Quote:** "${userQuote}"`,
    '',
    '**Summary**',
    `- Version: ${version}`,
    `- Baseline file: ${path}`,
    '',
    '**Evidence**',
    `- Baseline file: ${path}`,
    ''
  ].join('\n');

  appendInvestigationLog(id, entry, basePath);
}

module.exports = {
  SCHEMA_VERSION,
  PHASES,
  generateInvestigationId,
  getPerfDir,
  ensurePerfDirs,
  getInvestigationPath,
  getInvestigationLogPath,
  readInvestigation,
  writeInvestigation,
  updateInvestigation,
  initializeInvestigation,
  appendInvestigationLog,
  appendBaselineLog,
  appendProfilingLog,
  appendDecisionLog,
  appendSetupLog,
  appendBreakingPointLog,
  appendConstraintLog,
  appendHypothesesLog,
  appendCodePathsLog,
  appendOptimizationLog,
  appendConsolidationLog
};
