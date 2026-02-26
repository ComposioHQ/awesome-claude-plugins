---
description: List all active skill-bus subscriptions across global and project scopes, showing merge status, insert-level and subscription-level conditions, effective condition stacking, and what would fire for each skill.
---

# List Skill Bus Subscriptions

**Announce:** "[skill-bus] Listing subscriptions."

## Process

### Step 1: Generate Report

Run the listing script and display its output:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" list --cwd "$PWD"
```

Display the output verbatim to the user. Do not reformat or re-parse it.

### Step 2: Simulate (optional)

If the user asks "what would fire for X?" or wants to test matching, run:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" simulate <skill-name> --cwd "$PWD" --timing <pre|post|complete>
```

Replace `<skill-name>` with the skill to test (e.g. `superpowers:writing-plans`).
Replace `<pre|post|complete>` with the timing (default: `pre`).

Display the output verbatim.
