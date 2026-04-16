---
description: Ask a question against the SwarmVault wiki and save the answer to disk.
argument-hint: "<question>"
---

Ask SwarmVault a question about the current vault. By default the answer is saved as a durable page in `wiki/outputs/` so the team can cite it later.

Prerequisites:
1. Confirm the working directory is a SwarmVault vault. If the vault has never been compiled, run `swarmvault compile` first (or the query will only see raw sources).
2. Skim `swarmvault.schema.md` so the question lands on the right grounding and naming conventions.

Run:

```bash
swarmvault query "$ARGUMENTS"
```

Useful flags:
- `--no-save` — skip writing to `wiki/outputs/` for an ephemeral check.
- `--commit` — commit the saved output immediately when the vault lives in a git repo.

After the run:
- Report where the answer was saved (a path under `wiki/outputs/`).
- If the question revealed gaps in the wiki, suggest a follow-up: add a new source, edit the schema, or rerun `swarmvault compile`.
