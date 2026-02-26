---
description: Show skill-bus overview, status, and available commands. Quick reference for all skill-bus features.
---

# Skill Bus Help

**Announce:** "[skill-bus] Help."

## Process

### Step 1: Show Status

Run:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" status --cwd "$PWD"
```

### Step 2: Check Arguments

If `$ARGUMENTS` contains "advanced" (case-insensitive), skip to **Step 3: Show Advanced Reference**.

Otherwise, show the **Basic Reference** below:

## What is Skill Bus?

The skill for connecting skills. Wire context, conditions, and other skills into any skill invocation — declaratively, without modification.

Subscriptions match skill names using glob patterns and inject context from named **inserts** via PreToolUse/PostToolUse hooks. Conditions gate when subscriptions fire, making them context-aware (branch, file existence, env vars).

## Commands

| Command | Description |
|---------|-------------|
| `/skill-bus:help` | This help screen |
| `/skill-bus:help advanced` | Full settings, conditions, and config reference |
| `/skill-bus:list-subs` | List all subscriptions with merge status and conditions |
| `/skill-bus:add-sub` | Subscribe to a skill event |
| `/skill-bus:remove-sub` | Remove or disable subscriptions |
| `/skill-bus:edit-insert` | Edit insert text or conditions |
| `/skill-bus:pause-subs` | Temporarily disable the skill bus |
| `/skill-bus:unpause-subs` | Re-enable after pausing |
| `/skill-bus:report` | Telemetry report — match counts, condition skips, no-coverage skills |
| `/skill-bus:onboard` | Guided setup — discover knowledge, create subscriptions, enable features |

## Config Files

- **Global:** `~/.claude/skill-bus.json` (applies to all projects)
- **Project:** `.claude/skill-bus.json` (overrides global for this repo)

## Key Concepts

- **Insert**: Reusable text content with optional conditions
- **Subscription**: Routes an insert to a skill pattern (`on`) at a timing (`when`: pre/post/complete)
- **Conditions**: AND-stacked rules that must all pass for a subscription to fire
- **Complete** *(experimental)*: Fires when Claude signals it has finished the skill's scope of work (via `/skill-bus:complete`). Auto-injects a completion trigger instruction during pre-hook. Works for both Claude-initiated skill invocations and user-typed slash commands (via prompt-monitor bridge). Requires `monitorSlashCommands: true` for user-typed commands.

## Prompt Monitor

The prompt monitor is an **opt-in** feature that watches for slash commands typed by the user (e.g. `/commit`, `/deploy`) and can inject context before those commands run. Enable it with `"monitorSlashCommands": true` in settings. Built-in commands (help, clear, config, etc.) are excluded.

## Quick Tips

- Use `/skill-bus:list-subs` to see active state and simulate matching
- Use **pre** timing when you want to shape how a skill behaves (most common)
- Use **post** timing when you want to add context after a skill returns (e.g. reminders, follow-up guidance)
- Use **complete** timing *(experimental)* to chain follow-up skills after work is done
- Project scope can disable global subscriptions with `"enabled": false`
- Run `/skill-bus:help advanced` for full settings, condition types, and config format

**End of basic reference. Stop here unless advanced was requested.**

---

### Step 3: Show Advanced Reference

Display this advanced reference:

## Advanced Reference

### Settings

All settings go under the `"settings"` key in your config file. Project settings override global.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | boolean | `true` | Master kill switch. If false, no subscriptions are evaluated. |
| `maxMatchesPerSkill` | integer | `3` | Maximum subscriptions that can fire per skill invocation. Warns if more match. |
| `showConsoleEcho` | boolean | `true` | Show `[skill-bus] N sub(s) matched (...)` message in console. |
| `disableGlobal` | boolean | `false` | Ignore global config entirely. Only project config is used. |
| `monitorSlashCommands` | boolean | `false` | Enable UserPromptSubmit hook to monitor slash commands. |
| `completionHooks` | boolean | `false` | *(Experimental)* Enable synthetic completion hooks (`"when": "complete"` subscriptions). |
| `showConditionSkips` | boolean | `false` | Log when subscriptions are skipped due to failed conditions. Also enabled by `SKILL_BUS_DEBUG=1` env var. |
| `telemetry` | boolean | `false` | Enable JSONL telemetry logging (subscription matches, condition skips, unmatched skills). |
| `observeUnmatched` | boolean | `false` | Log skills that have no matching subscriptions (requires `telemetry: true`). |
| `telemetryPath` | string | `""` | Override telemetry log path. Default: `.claude/skill-bus-telemetry.jsonl`. Relative to CWD or absolute. |
| `maxLogSizeKB` | integer | `512` | Max telemetry log size in KB before rotation (oldest half truncated). Set to `0` to disable rotation. |

### Condition Types

Conditions are AND-stacked — all must pass for a subscription to fire. Short-circuits on first failure.

| Type | Syntax | Description |
|------|--------|-------------|
| `fileExists` | `{"fileExists": "path/to/check"}` | True if file or directory exists (relative to CWD). Supports `~` expansion. |
| `gitBranch` | `{"gitBranch": "feature/*"}` | True if current git branch matches the glob pattern (uses `fnmatch`). |
| `envSet` | `{"envSet": "VAR_NAME"}` | True if environment variable is set AND non-empty. |
| `envEquals` | `{"envEquals": {"var": "NAME", "value": "expected"}}` | True if env var equals the value (exact, case-sensitive). Value must be a string. |
| `fileContains` | `{"fileContains": {"file": "path", "pattern": "text"}}` | True if file contains the literal substring. Add `"regex": true` for regex matching. Skips files > 1MB. |
| `not` | `{"not": {"envSet": "SKIP"}}` | Negates any single condition. Warns on double negation. |

### Insert-Level vs Subscription-Level Conditions

- **Insert conditions** are defined on the insert and inherited by ALL subscriptions referencing it
- **Subscription conditions** are defined on the subscription and AND-stacked with insert conditions
- Insert conditions are evaluated **first** — if they fail, subscription conditions are not checked (short-circuit)
- A subscription can opt out of inheriting insert conditions with `"inheritConditions": false`

### Config Format

```json
{
  "settings": {
    "enabled": true,
    "maxMatchesPerSkill": 3,
    "showConsoleEcho": true,
    "monitorSlashCommands": false
  },
  "inserts": {
    "my-context": {
      "text": "Context injected into matched skills",
      "conditions": [{"fileExists": "docs/"}]
    }
  },
  "subscriptions": [
    {
      "insert": "my-context",
      "on": "superpowers:writing-plans",
      "when": "pre",
      "conditions": [{"gitBranch": "feature/*"}],
      "inheritConditions": true
    }
  ]
}
```

### Subscription Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `insert` | string | Yes | Name of the insert to inject |
| `on` | string | Yes | Skill glob pattern (e.g. `superpowers:*`, `*:writing-plans`) |
| `when` | string | Yes | `"pre"` (before skill loads), `"post"` (after skill tool returns), or `"complete"` *(experimental)* (after skill work finishes) |
| `enabled` | boolean | No | Default `true`. Set to `false` in project scope to disable a global subscription. |
| `conditions` | array | No | AND-stacked conditions specific to this subscription |
| `inheritConditions` | boolean | No | Default `true`. Set to `false` to skip insert-level conditions. |

### Override Model

Project configs can disable global subscriptions:

**Level 1 (specific):** Disable exact `(insert, on, when)` match:
```json
{"insert": "compound-knowledge", "on": "superpowers:writing-plans", "when": "pre", "enabled": false}
```

**Level 2 (broad):** Disable all subscriptions for an insert:
```json
{"insert": "compound-knowledge", "enabled": false}
```

### Merge Behavior

1. **Settings**: Cascade — defaults → global → project (later wins)
2. **Inserts**: Project wins — same name in both scopes uses project version (INFO logged)
3. **Subscriptions**: Dedup by `(insert, on, when)` — project wins on conflict
4. **Overrides**: Project `enabled: false` filters matching global subscriptions

### CLI Reference

```bash
# List all subscriptions with conditions and merge status
python3 lib/cli.py list --cwd "$PWD"

# Simulate what fires for a skill
python3 lib/cli.py simulate "superpowers:writing-plans" --cwd "$PWD"

# List all available skills across plugins
python3 lib/cli.py skills --cwd "$PWD"

# One-line status
python3 lib/cli.py status --cwd "$PWD"

# List inserts for a scope
python3 lib/cli.py inserts --scope global --cwd "$PWD"

# Review telemetry (command: /skill-bus:report)
python3 lib/cli.py stats --cwd "$PWD"
python3 lib/cli.py stats --session <id> --cwd "$PWD"
```

### Prompt Monitor Details

When `monitorSlashCommands` is enabled:
- Watches `UserPromptSubmit` events for slash commands (prompts starting with `/`)
- Skips built-in commands: help, clear, compact, init, login, logout, config, status, doctor, memory, cost, tasks
- Matches command names against subscription patterns (same `on` glob matching)
- Always fires as `pre` timing (no post-submit monitoring)
- Uses the same fast-path/slow-path dispatch as skill hooks

### Performance

- **Fast path** (bash): ~6ms — grep-based check, exits early if no possible match
- **Slow path** (Python): ~20ms — full condition evaluation and pattern matching
- **Hook timeout**: 5s — if exceeded, skill loads without injected context (fail-safe)
- **No-match case**: Fast path only (~6ms), Python never invoked

### Debugging

- Set `"showConditionSkips": true` in settings to see why subscriptions don't fire
- Or set env var `SKILL_BUS_DEBUG=1` for the same effect
- Use `python3 lib/cli.py simulate "skill:name" --cwd "$PWD"` to test matching without invoking a skill

### Limitations

- **Dedup by tuple:** Subscriptions are deduplicated by `(insert, on, when)`. You cannot subscribe the same insert to the same skill with different conditions. Workaround: create differently-named inserts with different condition sets.

### Architecture

See the Architecture section in the [README](https://github.com/joeymnguyen/skill-bus#architecture) for the full file structure and tech stack.
