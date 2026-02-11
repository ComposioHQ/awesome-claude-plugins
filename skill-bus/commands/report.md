---
description: Review skill-bus telemetry — match counts, condition skips, no-coverage skills, and actionable suggestions. Helps identify which subscriptions fire, which are skipped, and where coverage gaps exist.
---

# Report

**Announce:** "[skill-bus] Report."

## Process

### Step 1: Run CLI stats

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" stats --cwd "$PWD"
```

### Step 2: Present the output

Show the stats summary to the user. Highlight the Suggestions section if present.

### Step 3: Act on suggestions

If there are suggestions in the output:

**For uncovered skills** ("ran Nx with no subscription"):
- "Would you like to add a subscription for [skill]? I can run `/skill-bus:add-sub`"

**For frequent condition skips** ("skipped Nx due to conditions"):
- Run the following for per-condition diagnosis:
```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" simulate [skill] --cwd "$PWD"
```
- Suggest adjusting or removing the condition if it's too restrictive

### Step 4: Guide setup if needed

If telemetry is disabled:
- Add `"telemetry": true` to settings in your config file
- Optionally add `"observeUnmatched": true` for full coverage visibility

If no data exists:
- Telemetry accumulates as you use skills — check back after a work session
