---
name: perf-investigation-logger
description: "Use when appending structured perf investigation notes and evidence."
version: 1.0.0
---

# perf-investigation-logger

Append structured investigation notes to `{state-dir}/perf/investigations/<id>.md`.

Follow `docs/perf-requirements.md` as the canonical contract.

## Required Content

1. Exact user quotes (verbatim)
2. Phase summary
3. Decisions and rationale
4. Evidence pointers (files, metrics, commands)

## Output Format

```
## <Phase Name> - <YYYY-MM-DD>

**User Quote:** "<exact quote>"

**Summary**
- ...

**Evidence**
- Command: `...`
- File: `path:line`

**Decision**
- ...
```

## Constraints

- Use `AI_STATE_DIR` for state path (default `.claude`).
- Do not paraphrase user quotes.
