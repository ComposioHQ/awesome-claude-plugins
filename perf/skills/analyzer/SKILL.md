---
name: perf-analyzer
description: "Use when synthesizing perf findings into evidence-backed recommendations and decisions."
version: 1.0.0
---

# perf-analyzer

Synthesize performance investigation results into clear recommendations.

Follow `docs/perf-requirements.md` as the canonical contract.

## Inputs

- Baseline data
- Experiment results
- Profiling evidence
- Hypotheses tested
- Breaking point results

## Output Format

```
summary: <2-3 sentences>
recommendations:
  - <actionable recommendation 1>
  - <actionable recommendation 2>
abandoned:
  - <hypothesis or experiment that failed>
next_steps:
  - <if user should continue or stop>
```

## Constraints

- Only cite evidence that exists in logs or code.
- If data is insufficient, say so and request a re-run.
