---
name: list-subs
description: List all active skill-bus subscriptions across global and project scopes, showing merge status, insert-level and subscription-level conditions, effective condition stacking, and what would fire for each skill.
---

# List Skill Bus Subscriptions

**Announce:** "Listing skill-bus subscriptions."

## Process

### Step 1: Load Configs

Read both config files:
- `~/.claude/skill-bus.json` (global)
- `.claude/skill-bus.json` (project, if exists)

### Step 2: Show Settings

(See `/skill-bus:list-subs` command for full display format)

### Step 3: Show All Subscriptions

Present merged view showing effective state with insert-level and subscription-level conditions.

### Step 4: Simulate (optional)

If the user asks "what would fire for X?", simulate matching with per-condition pass/fail at both insert and subscription levels.
