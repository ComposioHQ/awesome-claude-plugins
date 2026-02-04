---
description: Structured performance investigation with baselines, profiling, and evidence-backed decisions
argument-hint: "[--resume] [--phase setup|baseline|breaking-point|constraints|hypotheses|code-paths|profiling|optimization|decision|consolidation] [--id <id>] [--scenario <text>] [--command <cmd>] [--version <ver>] [--duration <seconds>] [--runs <n>] [--aggregate <median|mean|min|max>] [--quote <text>] [--hypotheses-file <path>] [--param-env <name>] [--param-min <n>] [--param-max <n>] [--cpu <limit>] [--memory <limit>] [--change <summary>] [--verdict <continue|stop>] [--rationale <text>]"
allowed-tools: Read, Write, Edit, Task, Bash(git:*), Bash(node:*), Bash(npm:*), Bash(pnpm:*), Bash(yarn:*), Bash(cargo:*), Bash(go:*), Bash(pytest:*), Bash(mvn:*), Bash(gradle:*)
---

# /perf - Performance Investigation Workflow

Run a rigorous, evidence-driven performance investigation with strict rules, baselines, and reproducible benchmarks.

## Canonical Requirements

All behavior must follow:
- `docs/perf-requirements.md` (source of truth)
- `docs/perf-research-methodology.md`

## Arguments

- `--resume`: Continue the latest investigation from `{state-dir}/perf/investigation.json`
- `--phase <phase>`: Force starting phase (use only when resuming)
- `--id <id>`: Set investigation id (new only)
- `--scenario <text>`: Short scenario description
- `--command <cmd>`: Benchmark command (prints PERF_METRICS markers)
- `--version <ver>`: Baseline version label
- `--duration <seconds>`: Benchmark duration override (default 60s; use smaller values for micro-benchmarks)
- `--runs <n>`: Number of runs for start-to-end benchmarks (use with median aggregation)
- `--aggregate <median|mean|min|max>`: Aggregation method for multi-run benchmarks (default median)
- `--quote <text>`: User quote to record in logs
- `--hypotheses-file <path>`: JSON file with hypothesis list (for hypotheses phase)
- `--param-env <name>`: Env var for breaking-point value (default PERF_PARAM_VALUE)
- `--param-min <n>`: Breaking-point min value (default 1)
- `--param-max <n>`: Breaking-point max value (default 500)
- `--cpu <limit>`: Constraint CPU limit (default 1)
- `--memory <limit>`: Constraint memory limit (default 1GB)
- `--change <summary>`: Optimization change summary
- `--verdict <continue|stop>`: Decision verdict
- `--rationale <text>`: Decision rationale

## Phase 1: Initialize Investigation State

```javascript
const { getPluginRoot } = require('@awesome-slash/lib/cross-platform');
const pluginRoot = getPluginRoot('perf');
if (!pluginRoot) { console.error('Error: Could not locate perf plugin root'); process.exit(1); }
const investigationState = require(`${pluginRoot}/lib/perf/investigation-state.js`);
const baselineStore = require(`${pluginRoot}/lib/perf/baseline-store.js`);
const benchmarkRunner = require(`${pluginRoot}/lib/perf/benchmark-runner.js`);
const breakingPointRunner = require(`${pluginRoot}/lib/perf/breaking-point-runner.js`);
const constraintRunner = require(`${pluginRoot}/lib/perf/constraint-runner.js`);
const profilingRunner = require(`${pluginRoot}/lib/perf/profiling-runner.js`);
const optimizationRunner = require(`${pluginRoot}/lib/perf/optimization-runner.js`);
const consolidation = require(`${pluginRoot}/lib/perf/consolidation.js`);
const checkpoint = require(`${pluginRoot}/lib/perf/checkpoint.js`);
const argumentParser = require(`${pluginRoot}/lib/perf/argument-parser.js`);
const codePaths = require(`${pluginRoot}/lib/perf/code-paths.js`);
const repoMap = require(`${pluginRoot}/lib/repo-map`);
const fs = require('fs');

const args = argumentParser.parseArguments('$ARGUMENTS');
const options = {
  resume: false,
  phase: null,
  id: null,
  scenario: '',
  command: '',
  version: '',
  duration: null,
  runs: null,
  aggregate: '',
  quote: '',
  hypothesesFile: '',
  paramEnv: 'PERF_PARAM_VALUE',
  paramMin: 1,
  paramMax: 500,
  cpu: '1',
  memory: '1GB',
  change: '',
  verdict: '',
  rationale: ''
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--resume') options.resume = true;
  else if (arg === '--phase' && args[i + 1]) options.phase = args[++i];
  else if (arg === '--id' && args[i + 1]) options.id = args[++i];
  else if (arg === '--scenario' && args[i + 1]) options.scenario = args[++i];
  else if (arg === '--command' && args[i + 1]) options.command = args[++i];
  else if (arg === '--version' && args[i + 1]) options.version = args[++i];
  else if (arg === '--duration' && args[i + 1]) options.duration = Number(args[++i]);
  else if (arg === '--runs' && args[i + 1]) options.runs = Number(args[++i]);
  else if (arg === '--aggregate' && args[i + 1]) options.aggregate = args[++i];
  else if (arg === '--quote' && args[i + 1]) options.quote = args[++i];
  else if (arg === '--hypotheses-file' && args[i + 1]) options.hypothesesFile = args[++i];
  else if (arg === '--param-env' && args[i + 1]) options.paramEnv = args[++i];
  else if (arg === '--param-min' && args[i + 1]) options.paramMin = Number(args[++i]);
  else if (arg === '--param-max' && args[i + 1]) options.paramMax = Number(args[++i]);
  else if (arg === '--cpu' && args[i + 1]) options.cpu = args[++i];
  else if (arg === '--memory' && args[i + 1]) options.memory = args[++i];
  else if (arg === '--change' && args[i + 1]) options.change = args[++i];
  else if (arg === '--verdict' && args[i + 1]) options.verdict = args[++i];
  else if (arg === '--rationale' && args[i + 1]) options.rationale = args[++i];
}

const cwd = process.cwd();
const allowedPhases = investigationState.PHASES;
if (options.phase && !allowedPhases.includes(options.phase)) {
  console.error(`Invalid phase: ${options.phase}. Allowed: ${allowedPhases.join(', ')}`);
  process.exit(1);
}

let state = investigationState.readInvestigation(cwd);
if (options.resume) {
  if (!state) {
    console.error('No active investigation found. Run /perf without --resume first.');
    process.exit(1);
  }
} else {
  state = investigationState.initializeInvestigation({
    id: options.id,
    phase: options.phase,
    scenario: options.scenario
  }, cwd);
}

if (options.phase && options.resume) {
  state = investigationState.updateInvestigation({ phase: options.phase }, cwd);
}

const userQuote = options.quote || options.scenario || 'n/a';
if (options.command || options.version || options.scenario) {
  state = investigationState.updateInvestigation({
    scenario: {
      description: options.scenario || state.scenario?.description || '',
      metrics: state.scenario?.metrics || [],
      successCriteria: state.scenario?.successCriteria || '',
      scenarios: state.scenario?.scenarios || []
    },
    benchmark: {
      command: options.command || state.benchmark?.command || '',
      version: options.version || state.benchmark?.version || '',
      duration: Number.isFinite(options.duration) ? options.duration : state.benchmark?.duration,
      runs: Number.isFinite(options.runs) ? options.runs : state.benchmark?.runs,
      aggregate: options.aggregate || state.benchmark?.aggregate
    }
  }, cwd);
}

console.log(`
## /perf Investigation

**ID**: ${state.id}
**Phase**: ${state.phase}
**Scenario**: ${state.scenario?.description || 'n/a'}

Running phase handler...
`);

const phase = state.phase;
const command = state.benchmark?.command || options.command;
const version = state.benchmark?.version || options.version;

function requireFields(fields) {
  const missing = fields.filter(Boolean);
  if (missing.length > 0) {
    console.error(`Missing required input(s): ${missing.join(', ')}`);
    process.exit(1);
  }
}

const phaseRequirements = {
  setup: () => requireFields([
    state.scenario?.description ? '' : '--scenario',
    command ? '' : '--command',
    version ? '' : '--version'
  ]),
  baseline: () => requireFields([command ? '' : '--command', version ? '' : '--version']),
  'breaking-point': () => requireFields([command ? '' : '--command']),
  constraints: () => requireFields([command ? '' : '--command']),
  hypotheses: () => requireFields([state.scenario?.description ? '' : '--scenario']),
  'code-paths': () => requireFields([state.scenario?.description ? '' : '--scenario']),
  profiling: () => requireFields([]),
  optimization: () => requireFields([options.change ? '' : '--change']),
  decision: () => requireFields([options.verdict ? '' : '--verdict', options.rationale ? '' : '--rationale']),
  consolidation: () => requireFields([version ? '' : '--version'])
};

async function runPhase() {
  if (phaseRequirements[phase]) {
    phaseRequirements[phase]();
  }
  switch (phase) {
    case 'setup': {
      state = investigationState.updateInvestigation({ phase: 'baseline' }, cwd);
      investigationState.appendSetupLog({
        id: state.id,
        userQuote,
        scenario: state.scenario?.description || '',
        command,
        version,
        duration: Number.isFinite(options.duration) ? options.duration : state.benchmark?.duration,
        runs: Number.isFinite(options.runs) ? options.runs : state.benchmark?.runs,
        aggregate: options.aggregate || state.benchmark?.aggregate
      }, cwd);
      checkpoint.commitCheckpoint({
        phase: 'setup',
        id: state.id,
        baselineVersion: version,
        deltaSummary: 'n/a'
      });
      return;
    }
    case 'baseline': {
      const runs = Number.isFinite(options.runs) ? options.runs : state.benchmark?.runs;
      const aggregate = options.aggregate || state.benchmark?.aggregate;
      const result = benchmarkRunner.runBenchmarkSeries(command, {
        duration: Number.isFinite(options.duration) ? options.duration : undefined,
        runs,
        aggregate
      });
      baselineStore.writeBaseline(version, { command, metrics: result.metrics }, cwd);
      const baselinePath = baselineStore.getBaselinePath(version, cwd);
      investigationState.appendBaselineLog({
        id: state.id,
        userQuote,
        command,
        metrics: result.metrics,
        baselinePath,
        duration: Number.isFinite(options.duration) ? options.duration : state.benchmark?.duration,
        runs,
        aggregate: aggregate || (runs ? 'median' : undefined),
        scenarios: state.scenario?.scenarios
      }, cwd);
      state = investigationState.updateInvestigation({ phase: 'breaking-point' }, cwd);
      checkpoint.commitCheckpoint({
        phase: 'baseline',
        id: state.id,
        baselineVersion: version,
        deltaSummary: 'n/a'
      });
      return;
    }
    case 'breaking-point': {
      const result = await breakingPointRunner.runBreakingPointSearch({
        command,
        paramEnv: options.paramEnv,
        min: options.paramMin,
        max: options.paramMax
      });
      investigationState.updateInvestigation({
        breakingPoint: result.breakingPoint,
        breakingPointHistory: result.history,
        phase: 'constraints'
      }, cwd);
      investigationState.appendBreakingPointLog({
        id: state.id,
        userQuote,
        paramEnv: options.paramEnv,
        min: options.paramMin,
        max: options.paramMax,
        breakingPoint: result.breakingPoint,
        history: result.history
      }, cwd);
      checkpoint.commitCheckpoint({
        phase: 'breaking-point',
        id: state.id,
        baselineVersion: version || 'n/a',
        deltaSummary: `breakingPoint=${result.breakingPoint ?? 'n/a'}`
      });
      return;
    }
    case 'constraints': {
      const runs = Number.isFinite(options.runs) ? options.runs : state.benchmark?.runs;
      const aggregate = options.aggregate || state.benchmark?.aggregate;
      const results = constraintRunner.runConstraintTest({
        command,
        constraints: { cpu: options.cpu, memory: options.memory },
        duration: Number.isFinite(options.duration) ? options.duration : undefined,
        runs,
        aggregate
      });
      const nextResults = Array.isArray(state.constraintResults) ? state.constraintResults : [];
      nextResults.push(results);
      investigationState.updateInvestigation({ constraintResults: nextResults, phase: 'hypotheses' }, cwd);
      investigationState.appendConstraintLog({
        id: state.id,
        userQuote,
        constraints: results.constraints,
        delta: results.delta
      }, cwd);
      checkpoint.commitCheckpoint({
        phase: 'constraints',
        id: state.id,
        baselineVersion: version || 'n/a',
        deltaSummary: 'constraints'
      });
      return;
    }
    case 'hypotheses': {
      const gitHistory = checkpoint.getRecentCommits(5);
      let hypotheses = Array.isArray(state.hypotheses) ? state.hypotheses : [];
      if (hypotheses.length === 0) {
        if (!options.hypothesesFile) {
          console.error('Missing hypotheses. Run perf-theory-gatherer or provide --hypotheses-file.');
          process.exit(1);
        }
        try {
          const raw = fs.readFileSync(options.hypothesesFile, 'utf8');
          const parsed = JSON.parse(raw);
          hypotheses = Array.isArray(parsed.hypotheses) ? parsed.hypotheses : parsed;
        } catch (error) {
          console.error(`Failed to load hypotheses file: ${error.message}`);
          process.exit(1);
        }
      }
      investigationState.updateInvestigation({ hypotheses, phase: 'code-paths' }, cwd);
      investigationState.appendHypothesesLog({
        id: state.id,
        userQuote,
        hypotheses,
        gitHistory,
        hypothesesFile: options.hypothesesFile || null
      }, cwd);
      checkpoint.commitCheckpoint({
        phase: 'hypotheses',
        id: state.id,
        baselineVersion: version || 'n/a',
        deltaSummary: 'n/a'
      });
      return;
    }
    case 'code-paths': {
      const mapStatus = repoMap.status(cwd);
      if (!mapStatus.exists) {
        console.log('Repo map not found. Run /repo-map init for better code-path coverage.');
      }
      const repoMapStatus = mapStatus.exists
        ? `available (files=${mapStatus.status?.files ?? 'n/a'}, symbols=${mapStatus.status?.symbols ?? 'n/a'})`
        : 'missing';
      const map = repoMap.load(cwd);
      const result = codePaths.collectCodePaths(map, state.scenario?.description || '');
      investigationState.updateInvestigation({ codePaths: result.paths, phase: 'profiling' }, cwd);
      investigationState.appendCodePathsLog({
        id: state.id,
        userQuote,
        keywords: result.keywords,
        paths: result.paths,
        repoMapStatus
      }, cwd);
      checkpoint.commitCheckpoint({
        phase: 'code-paths',
        id: state.id,
        baselineVersion: version || 'n/a',
        deltaSummary: `paths=${result.paths.length}`
      });
      return;
    }
    case 'profiling': {
      const result = profilingRunner.runProfiling({ repoPath: cwd, command });
      if (!result.ok) {
        console.error(`Profiling failed: ${result.error}`);
        process.exit(1);
      }
      const nextResults = Array.isArray(state.profilingResults) ? state.profilingResults : [];
      nextResults.push(result.result);
      investigationState.updateInvestigation({ profilingResults: nextResults, phase: 'optimization' }, cwd);
      investigationState.appendProfilingLog({
        id: state.id,
        userQuote,
        tool: result.result.tool,
        command: result.result.command,
        artifacts: result.result.artifacts,
        hotspots: result.result.hotspots
      }, cwd);
      checkpoint.commitCheckpoint({
        phase: 'profiling',
        id: state.id,
        baselineVersion: version || 'n/a',
        deltaSummary: 'n/a'
      });
      return;
    }
    case 'optimization': {
      const gitHistory = checkpoint.getRecentCommits(5);
      const runs = Number.isFinite(options.runs) ? options.runs : state.benchmark?.runs;
      const aggregate = options.aggregate || state.benchmark?.aggregate;
      const result = optimizationRunner.runOptimizationExperiment({
        command,
        changeSummary: options.change,
        duration: Number.isFinite(options.duration) ? options.duration : undefined,
        runs,
        aggregate
      });
      const nextResults = Array.isArray(state.results) ? state.results : [];
      nextResults.push(result);
      investigationState.updateInvestigation({ results: nextResults, phase: 'decision' }, cwd);
      investigationState.appendOptimizationLog({
        id: state.id,
        userQuote,
        change: options.change,
        delta: result.delta,
        verdict: result.verdict,
        gitHistory,
        runs,
        aggregate: aggregate || (runs ? 'median' : undefined)
      }, cwd);
      checkpoint.commitCheckpoint({
        phase: 'optimization',
        id: state.id,
        baselineVersion: version || 'n/a',
        deltaSummary: 'n/a'
      });
      return;
    }
    case 'decision': {
      const decision = { verdict: options.verdict, rationale: options.rationale };
      investigationState.updateInvestigation({ decision, phase: 'consolidation' }, cwd);
      investigationState.appendDecisionLog({
        id: state.id,
        userQuote,
        verdict: options.verdict,
        rationale: options.rationale,
        resultsCount: Array.isArray(state.results) ? state.results.length : 0
      }, cwd);
      checkpoint.commitCheckpoint({
        phase: 'decision',
        id: state.id,
        baselineVersion: version || 'n/a',
        deltaSummary: 'n/a'
      });
      return;
    }
    case 'consolidation': {
      const baseline = baselineStore.readBaseline(version, cwd);
      if (!baseline) {
        console.error(`Baseline not found for version ${version}`);
        process.exit(1);
      }
      const result = consolidation.consolidateBaseline({ version, baseline }, cwd);
      investigationState.appendConsolidationLog({
        id: state.id,
        userQuote,
        version,
        path: result.path
      }, cwd);
      investigationState.updateInvestigation({ phase: 'complete' }, cwd);
      checkpoint.commitCheckpoint({
        phase: 'consolidation',
        id: state.id,
        baselineVersion: version,
        deltaSummary: 'n/a'
      });
      return;
    }
    default:
      return;
  }
}

await runPhase();
```

## Output

- Updated `{state-dir}/perf/investigation.json`
- Investigation log at `{state-dir}/perf/investigations/<id>.md`
- Baseline files at `{state-dir}/perf/baselines/<version>.json`

Begin the performance investigation now.
