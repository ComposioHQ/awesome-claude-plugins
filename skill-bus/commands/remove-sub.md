---
description: Unsubscribe from a skill event. Removes or disables subscriptions with scope-aware options.
---

# Unsubscribe from Skill Event

**Announce:** "[skill-bus] Removing subscription."

## Process

### Step 1: Show Current State

Run the listing script to show all subscriptions:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" list --cwd "$PWD"
```

Display the output verbatim. If the output shows no subscriptions, show:
> "No subscriptions found. Run /skill-bus:add-sub to create your first subscription."
...and stop.

### Step 2: Select Insert

Ask: **"Which insert's subscriptions to manage?"**

The listing output groups subscriptions by insert name. The user selects an insert from the groups shown.

### Step 3: Confirm Selection

Show the selected insert's subscriptions from the listing output (already displayed in Step 1). Proceed to Step 4.

### Step 4: Present Scope-Aware Options

Dynamically show only relevant options based on what's in scope:

**Always show:**
- **(a) Remove specific trigger(s)** — only available for project-scope subs. Deletes from project config.

**When global-scope subs exist:**
- **(b) Disable specific trigger(s) for this project** — creates an `{"insert": "name", "on": "pattern", "when": "timing", "enabled": false}` override directive in project config. Shows: "Disabled {insert} -> {skill} [{timing}] for this project."

**When override directives exist (previously disabled subs):**
- **(c) Re-enable disabled trigger(s)** — removes the `enabled: false` directive from project config. Shows: "Re-enabled {insert} -> {skill} [{timing}]. Global subscription will fire here again."

**Always show:**
- **(d) Delete insert + all its subscriptions** — if insert is project-scope, deletes it. If global-scope, warns that it can only be removed from the global config.

### Step 5: Execute Action

**For (a) Remove:**
- Let user select which project-scope subscription(s) to remove
- Delete from project config
- If last subscription removed for this insert: ask "Insert '{name}' has no remaining subscriptions. Delete the orphaned insert too?"

**For (b) Disable:**
- Let user select which global subscription(s) to disable
- Create override directive in project config
- Confirm: "Disabled {insert} -> {skill} [{timing}] for this project. Global subscription will not fire here."

**For (c) Re-enable:**
- Show currently disabled subs, let user select which to re-enable
- Remove the override directive from project config
- Confirm: "Re-enabled {insert} -> {skill} [{timing}]. Global subscription will fire here again."

**For (d) Delete insert:**
- If insert is in project scope: remove insert from `inserts` object AND all subscriptions referencing it
- If insert is in global scope: warn "This insert is defined in global scope (~/.claude/skill-bus.json). Edit the global config directly to remove it." Offer to disable all its subscriptions for this project instead (option b).

### Step 6: Confirm Final State

Show the updated subscription list for this insert (or confirm deletion).
If the subscriptions array becomes empty AND there are no inserts, offer to delete the config file entirely.
