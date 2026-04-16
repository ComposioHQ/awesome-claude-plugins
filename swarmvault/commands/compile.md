---
description: Compile the SwarmVault wiki from the current vault's raw sources.
argument-hint: "[--approve] [--max-tokens N]"
---

Run SwarmVault's compile pipeline over the current vault. This rebuilds the generated markdown wiki, knowledge graph, and search index from `raw/` using the rules in `swarmvault.schema.md`.

Before compiling:
1. Confirm the working directory is a SwarmVault vault (has `swarmvault.schema.md` or `swarmvault.config.json` at the root). If it doesn't, run `swarmvault init` first.
2. Read `swarmvault.schema.md` so you understand the vault's naming, categorization, grounding, and freshness rules. Update the schema before recompiling if organization or grounding looks wrong.

Then run:

```bash
swarmvault compile $ARGUMENTS
```

Useful flags:
- `--approve` — stage changes in `state/approvals/` for local review (`swarmvault review list|show|accept|reject`) instead of writing them live.
- `--max-tokens <n>` — cap the generated wiki at a bounded context budget.
- `--commit` — commit `wiki/` and `state/` changes when the vault lives in a git repo.

After compile:
- Summarize what changed in `wiki/` and `state/`.
- If `wiki/graph/report.md` exists, use it before broad repo search on follow-up questions.
