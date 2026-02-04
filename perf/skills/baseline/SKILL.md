---
name: perf-baseline-manager
description: "Use when managing perf baselines, consolidating results, or comparing versions. Ensures one baseline JSON per version."
version: 1.0.0
---

# perf-baseline-manager

Manage baseline storage and comparison.

Follow `docs/perf-requirements.md` as the canonical contract.

## Required Rules

- One baseline JSON per version.
- Store under `{state-dir}/perf/baselines/<version>.json`.
- Record metrics + environment metadata.

## Output Format

```
baseline_version: <version>
metrics: <summary>
file: <path>
```

## Constraints

- Overwrite older baseline for the same version.
- Do not create multiple files for one version.
