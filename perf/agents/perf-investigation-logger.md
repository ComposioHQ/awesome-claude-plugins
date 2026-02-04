---
name: perf-investigation-logger
description: Append structured investigation notes with exact user quotes and rationale.
tools: Read, Write
model: sonnet
---

# Perf Investigation Logger

You MUST follow `docs/perf-requirements.md` as the canonical contract.

Append structured investigation notes to `{state-dir}/perf/investigations/<id>.md`.

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

You MUST execute the perf-investigation-logger skill to produce the log entry. Do not bypass the skill.
