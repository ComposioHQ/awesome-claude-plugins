---
name: reflecting-on-sessions
description: Use when completing a plan, finishing a development branch, wrapping up a session, or at any natural transition between work phases — reviews skill-bus telemetry to identify subscription gaps and suggest improvements
---

# Reflecting on Sessions

**Announce:** "[skill-bus] Reflecting on this session's skill-bus activity."

## When to Reflect

This skill is for natural transition moments:
- After executing a plan (all tasks complete)
- After finishing a development branch
- Before session wrap-up or handover
- At any natural pause between work phases
- When asked about skill-bus effectiveness

## Process

### Step 1: Check telemetry status

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" status --cwd "$PWD"
```

If telemetry is off, tell the user:
> "Skill-bus telemetry is disabled for this project. To enable session reflection, add `"telemetry": true` to your skill-bus config. For full coverage visibility, also add `"observeUnmatched": true`."

Stop here if telemetry is off.

### Step 2: Run stats for this session

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" stats --cwd "$PWD"
```

### Step 3: Interpret and present

Present the stats output to the user with brief interpretation:

**If there are suggestions**, highlight the top 1-2:
- For uncovered skills: "I noticed [skill] ran N times without any subscription. Would you like to add one? I can run `/skill-bus:add-sub`."
- For condition skips: "[insert] was skipped N times due to conditions. This might mean the condition is too restrictive for your current workflow."

**If everything looks healthy** (matches > 0, no suggestions):
- "Skill-bus is working well this session — N skills intercepted, M inserts injected. No gaps detected."

**If no telemetry data**:
- "No telemetry data for this project yet. Have you invoked any skills this session?"

### Step 4: Offer next steps

If there are actionable suggestions:
- "Would you like me to run `/skill-bus:add-sub` for any of these?"
- "Run `/skill-bus:report` anytime to check coverage."
