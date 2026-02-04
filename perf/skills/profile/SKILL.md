---
name: perf-profiler
description: "Use when profiling CPU/memory hot paths, generating flame graphs, or capturing JFR/perf evidence."
version: 1.0.0
argument-hint: "<tool> <command>"
---

# perf-profiler

Run profiling tools and capture hotspots with evidence.

Follow `docs/perf-requirements.md` as the canonical contract.

## Required Rules

- Verify debug symbols before profiling.
- Capture file:line for hotspots.
- Provide flame graph or equivalent output when possible.

## Output Format

```
tool: <profiler>
command: <command>
hotspots:
  - file:line - reason
artifacts:
  - <path to flame graph or profile>
```

## Constraints

- No profiling without a clear scenario.
- Keep outputs minimal and evidence-backed.
