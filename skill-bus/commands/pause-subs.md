---
description: Temporarily disable the skill bus. Quick toggle to stop all subscriptions from firing without removing them.
---

# Pause Skill Bus

**Announce:** "[skill-bus] Pausing."

## Process

### Step 1: Determine Scope

Ask using AskUserQuestion:
**"Pause at which level?"**
- **Global** - Pauses skill-bus everywhere. Sets `enabled: false` in `~/.claude/skill-bus.json`
- **Project** - Pauses skill-bus for this project only. Sets `enabled: false` in `.claude/skill-bus.json`

### Step 2: Update Config

Read the appropriate config file. Set `settings.enabled` to `false`. If the file doesn't exist, create the directory first (`mkdir -p .claude` for project scope) then create the file with just:

```json
{
  "settings": {
    "enabled": false
  }
}
```

### Step 3: Confirm

Show: "Skill bus paused at [scope] level. Run /skill-bus:unpause-subs to re-enable."
