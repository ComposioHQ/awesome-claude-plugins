---
description: Edit an existing insert. Change text content or manage insert-level conditions. Changes apply to all subscriptions that reference the insert.
---

# Edit Insert

**Announce:** "[skill-bus] Editing insert."

## Process

### Step 1: Scope Selection

Ask using AskUserQuestion:
**"Which scope to edit in?"**
- **Global** - `~/.claude/skill-bus.json`
- **Project** - `.claude/skill-bus.json`

If the selected scope has no config file or no inserts, show: "No inserts found in {scope} config. Run /skill-bus:add-sub to create inserts."

### Step 2: Select Insert

Show inserts in the selected scope:

Set `SCOPE` to the user's choice from Step 1 (`global` or `project`), then run:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
SCOPE="global"  # or "project" — set from Step 1
python3 "$SB_CLI" inserts --scope "$SCOPE" --cwd "$PWD"
```

Display the output (without the "[Create new insert]" line). Ask: **"Which insert to edit?"**

**Cross-scope note:** If the user selects a scope but the insert they want is in the other scope, inform them: "This insert is defined in {other scope} scope. Switch to that scope to edit it."

### Step 3: Choose What to Edit

Ask using AskUserQuestion:
**"What would you like to edit?"**
- **Text** - Change the insert's text content
- **Conditions** - Add, remove, or modify insert-level conditions
- **Both** - Edit text and conditions

### Step 4a: Edit Text (if selected)

Display the full current text of the selected insert.

Ask: **"What should the new text be?"**

### Step 4b: Edit Conditions (if selected)

Show current insert-level conditions:

When conditions exist:
```
Current conditions on 'compound-knowledge':
  1. fileExists("docs/")

These conditions apply to ALL subscriptions using this insert
(unless a subscription opts out with "inheritConditions": false).
```

When no conditions:
```
No conditions on 'compound-knowledge'.
Insert-level conditions apply to ALL subscriptions using this insert.
```

Present options using AskUserQuestion:
**"What condition change?"**
- **Add condition** - Add a new condition to this insert
- **Remove condition** - Remove an existing condition (only when conditions exist)
- **Replace all** - Clear and set new conditions
- **Clear all** - Remove all conditions from this insert

**If "Add condition":** Use the same condition selection flow as add-sub Step 4 (present 5+1 types, get value, offer NOT wrap, loop for more).

**If "Remove condition":** Show numbered list, ask which to remove.

**If "Replace all":** Clear existing, then use add-condition flow.

**If "Clear all":** Set conditions to undefined (remove the key from the insert object).

### Step 5: Save and Confirm

Update the insert in the config file. Show which subscriptions are affected (scan BOTH scopes for references):

```
Updated insert 'compound-knowledge'.
  Text: [changed / unchanged]
  Conditions: fileExists("docs/") (1 condition)
Affects subscriptions:
  → superpowers:writing-plans [pre] (project) — effective: fileExists("docs/") AND gitBranch("feature/*")
  → superpowers:brainstorming [pre] (global) — effective: fileExists("docs/")
```

When a subscription opts out with no own conditions:
```
  → superpowers:code-review [pre] (project) — effective: (no conditions — opts out with inheritConditions: false)
```

When a subscription opts out but has its own conditions:
```
  → superpowers:code-review [pre] (project) — effective: gitBranch("feature/*") (subscription-level only — opts out of insert conditions)
```

When no subscriptions reference this insert:
```
Affects subscriptions: (none — this insert is not referenced by any subscription)
```
