---
name: perf-benchmarker
description: "Use when running performance benchmarks, establishing baselines, or validating regressions with sequential runs. Enforces 60s minimum runs (30s only for binary search) and no parallel benchmarks."
version: 1.0.0
argument-hint: "<command> [duration]"
---

# perf-benchmarker

Run sequential benchmarks with strict duration rules.

Follow `docs/perf-requirements.md` as the canonical contract.

## Required Rules

- Benchmarks MUST run sequentially (never parallel).
- Minimum duration: 60s per run (30s only for binary search).
- Warmup: 10s minimum before measurement.
- Re-run anomalies.

## Output Format

```
command: <benchmark command>
duration: <seconds>
warmup: <seconds>
results: <metrics summary>
notes: <anomalies or reruns>
```

## Output Contract

Benchmarks MUST emit a JSON metrics block between markers:

```
PERF_METRICS_START
{"scenarios":{"low":{"latency_ms":120},"high":{"latency_ms":450}}}
PERF_METRICS_END
```

## Constraints

- No short runs unless binary-search phase.
- Do not change code while benchmarking.
