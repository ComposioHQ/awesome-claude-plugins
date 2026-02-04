---
name: perf-checkpoint
description: Create a checkpoint commit and update the investigation log after each phase.
---

# Perf Checkpoint Hook

Create a checkpoint commit and update `{state-dir}/perf/investigations/<id>.md` after each phase.

Follow `docs/perf-requirements.md` as the canonical contract.

## Commit Message Format

```
perf: phase <phase-name> [<id>] baseline=<version> delta=<summary>
```

## Required Steps

1. Ensure working tree is clean aside from intended changes.
2. Update investigation log with phase summary and evidence.
3. Commit with the format above.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Checkpoint created successfully |
| 1 | Failed to create checkpoint (git error, dirty state) |
| 2 | Blocked - benchmarks still running |

## Constraints

- No checkpoint if benchmarks are still running (exit 2).
- Do not batch multiple phases into one commit.
