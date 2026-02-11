---
description: Subscribe to a skill event. Adds a subscription that injects context before or after a skill runs. Supports optional conditions at both insert-level (inherited) and subscription-level (AND-stacked).
---

# Subscribe to Skill Event

**Announce:** "[skill-bus] Adding subscription."

## Process

### Step 1: Scope Selection

Ask the user using AskUserQuestion:

**"What scope for this subscription?"**
- **Global** - Applies to all projects. Saved to `~/.claude/skill-bus.json`
- **Project** - This repo only. Saved to `.claude/skill-bus.json`

### Step 2: Skill Selection

Run the skill discovery script to show available skills:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" skills --cwd "$PWD"
```

Display the output to the user, then ask: **"Which skill(s) to subscribe to?"**

If the user enters a `*` wildcard pattern, warn them:
> "Wildcard subscriptions match many skills and add context tokens on every match. Are you sure?"

### Step 3: Timing Selection

Ask using AskUserQuestion:
**"When should this fire?"**
- **Pre** - Before the skill loads. Use for: adding context, referencing files, setting up state.
- **Post** - After the skill tool returns. Use for: supplementing skill output.
- **Complete** *(experimental)* - After Claude finishes the skill's full scope of work. Use for: triggering follow-up skills, capturing outputs, chaining workflows. Auto-injects "you MUST run /skill-bus:complete" instruction. Requires `"completionHooks": true` in settings.

### Step 4: Insert Selection

Show existing inserts for the selected scope:

Set `SCOPE` to the user's choice from Step 1 (`global` or `project`), then run:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
SCOPE="global"  # or "project" — set from Step 1
python3 "$SB_CLI" inserts --scope "$SCOPE" --cwd "$PWD"
```

Display the output.

Ask: **"Which insert to attach?"**

**If "Create new":**
1. Ask for insert name (slug format, e.g., `deploy-guard`)
2. **Name existence check:** If an insert with that name already exists in the target scope, refuse: "Insert '{name}' already exists. Use the existing one, or choose a different name." Offer to link to the existing insert instead.
3. Ask for insert text (the context to inject)
4. Check text length — if >200 chars (~50 tokens), warn:
   > "This insert is fairly long (~N tokens). Proceed?"
5. Save insert to the `inserts` object in the target config

**If existing insert:**
Proceed to Step 5.

### Step 5: Conditions (Optional)

**Check if the selected insert has insert-level conditions.** If it does, show:

```
Insert 'compound-knowledge' has insert-level conditions:
  - fileExists("docs/")

These are inherited by this subscription (AND-stacked with any subscription conditions you add).
To opt out of inherited conditions, choose "Opt out" below.
```

Ask using AskUserQuestion:
**"Add subscription-level conditions?"**
- **No extra conditions** - Only insert-level conditions apply (or none if insert has none)
- **Add conditions** - Add subscription-specific conditions (AND-stacked with insert conditions)
- **Opt out of insert conditions** - This subscription ignores insert-level conditions. Sets `"inheritConditions": false`.

If the insert has no conditions, simplify to:
**"Add conditions? (subscription only fires when ALL conditions pass)"**
- **No conditions** - Always fires when the skill matches
- **Add conditions** - Only fire when runtime conditions are met

**If "Add conditions":**

Present the available condition types:

```
Condition types:

  1. fileExists    — File or directory exists (relative to project root)
                     Example: "docs/plans/"
  2. gitBranch     — Current branch matches pattern
                     Example: "feature/*"
  3. envSet        — Environment variable is set and non-empty
                     Example: "CI"
  4. envEquals     — Environment variable equals a specific value
                     Example: NODE_ENV = "development"
  5. fileContains  — File contains a string (or regex with "regex": true)
                     Example (literal): package.json contains "prisma"
                     Example (regex): package.json matches "prisma.*\d+\.\d+"
```

Ask: **"Which condition type?"**

Then ask for the value based on the type:
- `fileExists`: **"What path should exist?"** (relative to project root)
- `gitBranch`: **"What branch pattern?"** (supports globs like `feature/*`, `fix/*`)
- `envSet`: **"Which environment variable?"**
- `envEquals`: **"Which variable?"** then **"What value?"**
- `fileContains`: **"Which file?"** then **"What pattern to search for?"** then **"Use regex matching?"** (yes/no, default: no)

After each condition, ask using AskUserQuestion:
**"Add another condition? (AND logic — all must pass)"**
- **Done** - No more conditions
- **Add another** - Add one more condition
- **Wrap in NOT** - Negate the last condition added

**If "Wrap in NOT":** Wrap the most recent condition in `{"not": {...}}`. Show the updated condition. Then ask again if they want to add more.

**If "Opt out of insert conditions":** Set `"inheritConditions": false` on the subscription. Then ask if they want to add subscription-level conditions (same flow as "Add conditions" above).

### Step 6: Duplicate Check

Check if the `insert+on+when` tuple already exists in the target scope.
If duplicate: show "This subscription already exists: {insert} -> {skill} [{timing}]. Nothing to add." and stop.

Note: Two subscriptions with the same `insert+on+when` but different conditions ARE considered duplicates. Conditions modify behavior, not identity. If the user wants different conditions for the same insert+skill, they should create a differently-named insert.

### Step 7: Save Subscription

Create the subscription object:

Without conditions:
```json
{"insert": "<name>", "on": "<pattern>", "when": "<pre|post|complete>"}
```

With subscription-level conditions:
```json
{"insert": "<name>", "on": "<pattern>", "when": "<pre|post|complete>", "conditions": [{"fileExists": "docs/plans/"}, {"gitBranch": "feature/*"}]}
```

With inheritConditions opt-out:
```json
{"insert": "<name>", "on": "<pattern>", "when": "<pre|post|complete>", "inheritConditions": false}
```

With opt-out AND own conditions:
```json
{"insert": "<name>", "on": "<pattern>", "when": "<pre|post|complete>", "inheritConditions": false, "conditions": [{"gitBranch": "feature/*"}]}
```

Append to the `subscriptions` array in the target config. If the file doesn't exist, create it with `mkdir -p .claude` for project scope.

### Step 8: Confirm

When insert has conditions and subscription adds more:
```
Subscription created:
  insert: compound-knowledge
  on:     superpowers:brainstorming
  when:   pre
  scope:  project

  Effective conditions:
    inherited: fileExists("docs/")        ← from insert
    added:     gitBranch("feature/*")     ← subscription-specific
    logic:     fileExists("docs/") AND gitBranch("feature/*")

  Saved to .claude/skill-bus.json
```

When opt-out:
```
  Effective conditions:
    (none — opted out of insert conditions with inheritConditions: false)
```

When opt-out with own conditions:
```
  Effective conditions:
    inherited: (opted out with inheritConditions: false)
    added:     gitBranch("feature/*")     ← subscription-specific
    logic:     gitBranch("feature/*")
```

When no conditions anywhere:
```
  Conditions: none (always fires when skill matches)
```
