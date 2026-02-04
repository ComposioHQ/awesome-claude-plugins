---
name: perf-theory-gatherer
description: "Use when generating performance hypotheses backed by git history and code evidence."
version: 1.0.0
---

# perf-theory-gatherer

Generate performance hypotheses for a specific scenario.

Follow `docs/perf-requirements.md` as the canonical contract.

## Required Steps

1. Review recent git history (scope to relevant paths when possible).
2. Identify code paths involved in the scenario (repo-map or grep).
3. Produce up to 5 hypotheses with evidence + confidence.

## Output Format

```
hypotheses:
  - id: H1
    hypothesis: <short description>
    evidence: <file/path or git change>
    confidence: low|medium|high
  - id: H2
    ...
```

## Constraints

- MUST check git history before hypothesizing.
- No optimization suggestions; only hypotheses.
- Keep to 5 hypotheses maximum.
