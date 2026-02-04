---
name: perf-constraint-tester
description: Apply CPU/memory constraints and compare results to baseline.
---

# Perf Constraint Tester Hook

Apply resource constraints and run the same benchmark sequentially.

Follow `docs/perf-requirements.md` as the canonical contract.

## Required Steps

1. Set CPU limit and/or memory limit (document exact values).
2. Run baseline benchmark (60s minimum).
3. Run constrained benchmark (60s minimum).
4. Compare metrics and record deltas.

Constraints should be exposed to the benchmark via env vars:

```
PERF_CPU_LIMIT
PERF_MEMORY_LIMIT
```

## Output Format

```
constraints:
  cpu: <value>
  memory: <value>
baseline: <metrics>
constrained: <metrics>
delta: <summary>
```

## Constraints

- Do not run constraints in parallel.
- Revert to unconstrained state afterward.
