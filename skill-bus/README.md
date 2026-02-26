# Skill Bus

**The skill for connecting skills.**

Wire context, conditions, and other skills into any skill invocation — declaratively, without modification.

## Installation

```bash
claude plugin marketplace add joeymnguyen/skill-bus
claude plugin install skill-bus@skill-bus-marketplace
```

Skill Bus is now active in all your Claude Code sessions.

### Requirements

- **Claude Code** v2.0.12+ (with plugin support)
- **Python 3** (stdlib only — no `pip install` needed)
- **Bash** (macOS/Linux)

### Upgrading

```bash
claude plugin update skill-bus
```

Then restart Claude Code (open a new window or restart the CLI) for the update to take effect.

### Manual install

```bash
git clone https://github.com/joeymnguyen/skill-bus.git ~/skill-bus
mkdir -p ~/.claude/plugins/cache/skill-bus-marketplace/skill-bus/0.7.0/
cp -r ~/skill-bus/* ~/.claude/plugins/cache/skill-bus-marketplace/skill-bus/0.7.0/
cp -r ~/skill-bus/.claude-plugin ~/.claude/plugins/cache/skill-bus-marketplace/skill-bus/0.7.0/
```

## Quick Start

### Guided setup (recommended)

Run the onboard command in Claude Code:

```
/skill-bus:onboard
```

This walks you through a five-step flow: discover your project's knowledge files, route them to subscriptions, configure settings, set up telemetry feedback, and verify everything works. Safe to re-run — it's additive and won't overwrite existing config.

### Manual setup

If you prefer to configure by hand, run `/skill-bus:add-sub` in Claude Code, or create a config file directly:

**Context → skill** (`~/.claude/skill-bus.json`) — inject knowledge into a skill:

```json
{
  "inserts": {
    "prior-decisions": {
      "text": "Before brainstorming, check docs/decisions/ for prior ADRs and docs/solutions/ for past resolutions.",
      "conditions": [{ "fileExists": "docs/decisions/" }]
    }
  },
  "subscriptions": [
    {
      "insert": "prior-decisions",
      "on": "superpowers:brainstorming",
      "when": "pre"
    }
  ]
}
```

When you invoke `/superpowers:brainstorming`, Skill Bus injects your prior decisions before the skill loads. The condition ensures it only fires in projects that have a decisions directory.

**Skill → skill** (`.claude/skill-bus.json`) — chain one skill after another:

```json
{
  "settings": { "completionHooks": true },
  "inserts": {
    "update-handover": {
      "text": "Run /update-handover-doc to capture what was accomplished, decisions made, and next steps."
    }
  },
  "subscriptions": [
    {
      "insert": "update-handover",
      "on": "superpowers:finishing-a-development-branch",
      "when": "complete"
    }
  ]
}
```

After Claude finishes wrapping up a branch, Skill Bus triggers a handover doc update automatically. Complete timing is [experimental](#timing) — see the Timing section for details.

### Check what's active

```
/skill-bus:list-subs    # See all subscriptions
/skill-bus:help         # Overview and quick reference
```

---

## Why Skill Bus?

Claude Code [skills](https://docs.anthropic.com/en/docs/claude-code/skills) and slash commands are already powerful. Skill Bus lets you get even more out of them.

**Layer context onto any skill invocation.** Skills fire based on Claude's autonomy — it decides when and where to use them. Skill Bus lets you attach additional context at the exact moment a skill runs, like project conventions, prior decisions, team standards, whatever you need.

**Compose multiple concerns onto a single command.** When you run `/commit` or `/review-pr`, you might want to bring in context from several sources at once. Skill Bus lets you stack multiple subscriptions onto the same skill, each injecting their own context.

**Enhance third-party skills without forking them.** You can always tailor skills you've written yourself, but marketplace and third-party skills update independently. Skill Bus lets you enrich any skill — yours or someone else's — without touching the original. Your customisations live in your own config, separate to their code.

### Without Skill Bus

```
User invokes /superpowers:writing-plans
        │
        ▼
┌─────────────────────────────┐
│  Claude Code loads SKILL.md │
│  (the skill's built-in      │
│   prompt — nothing else)    │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Claude receives:           │
│  • skill prompt             │
│  • (that's it)              │
└─────────────────────────────┘
```

To add project-specific context, you can:
- **Modify the skill directly** — but you lose your changes when it updates
- **Write a custom wrapper skill** — works, but now you're maintaining a separate wrapper that can fall out of sync
- **Tell Claude each time** — easy to forget, not repeatable

### With Skill Bus

```
User invokes /superpowers:writing-plans
        │
        ▼
┌─────────────────────────────┐
│  Claude Code loads SKILL.md │
│  (same as before)           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Skill Bus intercepts       │
│  (PreToolUse hook)          │
└──────────┬──────────────────┘
           │ matches 4 subscriptions
           ▼
┌─────────────────────────────┐
│  Claude receives:           │
│  • skill prompt             │
│  • + compound-knowledge     │
│  • + capture-knowledge      │
│  • + handover-update        │
│  • + update-diagrams        │
└─────────────────────────────┘
```

```
writing-plans  (pre)
    │
    ├── compound-knowledge  — search docs/ for prior decisions, solutions, diagrams
    ├── capture-knowledge   — plan must include knowledge capture task
    ├── handover-update     — plan must include HANDOVER.md update task
    └── update-diagrams     — plan must include diagram check task
```

Four subscriptions fire automatically. The original skill is untouched — your context layers on top via config. Each insert is a reusable block of text that you define once and attach to any skill pattern.

---

## How It Works

Under the hood, Skill Bus uses a two-stage dispatch to keep latency low:

```
        ▼ PreToolUse hook fires
┌─────────────────────────────┐
│  Fast Path (bash, ~6ms)     │
│  grep config for skill name │
│  No match? → exit early     │
└──────────┬──────────────────┘
           │ match found
           ▼
┌─────────────────────────────┐
│  Slow Path (Python, ~20ms)  │
│  Load & merge configs       │
│  Evaluate conditions        │
│  Pattern-match subscriptions│
└──────────┬──────────────────┘
           │ matched subs
           ▼
┌─────────────────────────────┐
│  Build hookSpecificOutput   │
│  JSON and return to Claude  │
└─────────────────────────────┘
```

1. User invokes a skill (e.g. `/superpowers:writing-plans`)
2. Claude Code fires a `PreToolUse` hook before the Skill tool runs
3. **Fast path** — bash `grep` checks if the skill name appears in any config (~6ms). No match = instant exit, Python never invoked.
4. **Slow path** — Python loads configs, evaluates conditions, matches subscriptions via `fnmatch` (~20ms)
5. Matched subscriptions return injected text via the `hookSpecificOutput` protocol
6. Claude receives the injected context alongside the skill's own output

### Prompt Monitor

Skill Bus hooks intercept Claude's tool use — but when **you** type a slash command directly (e.g. `/commit`), it doesn't go through Claude's Skill tool use path. The `PreToolUse` hook never fires. For these user-initiated commands, Skill Bus includes a **prompt monitor** — a `UserPromptSubmit` hook that watches for `/command` patterns in your input and matches them against your subscriptions.

This is opt-in by design (`"monitorSlashCommands": true` in settings). The prompt monitor runs on every user input, so enable it with awareness of the tradeoff: broader coverage in exchange for a lightweight check on each prompt. The same fast-path/slow-path dispatch applies, so the overhead is ~6ms when nothing matches.

**Limitation:** The prompt monitor matches `pre` timing subscriptions directly. It also supports `complete` timing — the pre-timing injection tells Claude to run `/skill-bus:complete` when finished, and the prompt monitor catches that signal too. However, `post` timing requires the `PostToolUse` hook event, which only fires when Claude initiates the skill via the Skill tool — not when you type a slash command directly.

### First-Run Nudge

When Skill Bus is installed but no config exists for the current project, it prompts once:

> *"[skill-bus] No subscriptions configured. Run /skill-bus:onboard for guided setup, or /skill-bus:help to get started."*

This fires once per project (tracked via a `.sb-nudged` marker file) and won't repeat after you've seen it.

### Timing

Every subscription has a `when` field that controls when it fires relative to the skill's lifecycle:

| Timing | Fires when | Use for |
|--------|-----------|---------|
| `pre` | Before the skill loads | Adding context, project conventions, prior decisions — shaping how the skill behaves |
| `post` | After the skill tool call returns | Follow-up reminders, supplementary context, checklists |
| `complete` *(experimental)* | After Claude finishes the skill's full scope of work | Chaining follow-up skills, capturing outputs, triggering downstream workflows |

**Pre** is the most common timing. The injected text arrives alongside the skill's own prompt, so Claude sees your context before it starts working. Conditions are evaluated at this point — if they fail, the insert is not injected.

**Post** fires immediately after the skill's tool call returns — not after Claude has finished acting on it. This is a narrow window: the skill tool has responded, but Claude hasn't necessarily completed the work the skill kicked off. Post is useful for reminders or supplementary guidance that should appear after the skill loads but before Claude wraps up. Conditions are evaluated at post-fire time.

**Complete** is different from both. It fires after Claude signals that it has finished the skill's *entire scope of work* — not just the tool call, but everything the skill asked Claude to do. This is a synthetic signal: during pre-timing, Skill Bus auto-injects an instruction telling Claude to run `/skill-bus:complete` when the work is done. Claude then fires that signal, and Skill Bus evaluates the complete-timing subscriptions at that point (including conditions). This enables skill-to-skill chaining: "after writing the plan, run the code review."

Complete timing is experimental and requires two settings:
- `"completionHooks": true` — feature flag to enable the mechanism
- `"monitorSlashCommands": true` — needed if you want completion chains to work for user-typed slash commands (not just Claude-initiated skill invocations)

A chain depth limit (default 5) prevents infinite loops when complete subscriptions trigger further complete subscriptions.

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Insert** | Reusable text content with optional conditions. The "what" to inject. |
| **Subscription** | Routes an insert to a skill pattern at a timing. The "when" and "where". |
| **Condition** | Rules that gate whether a subscription fires (AND-stacked). |
| **Scope** | Global (`~/.claude/`) or project (`.claude/`). Project wins on conflict. |

## Configuration

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
    "insert-name": {
      "text": "Context to inject",
      "conditions": [{ "fileExists": "src/" }]
    }
  },
  "subscriptions": [
    {
      "insert": "insert-name",
      "on": "superpowers:writing-plans",
      "when": "pre",
      "conditions": [{ "gitBranch": "feature/*" }]
    }
  ]
}
```

### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | boolean | `true` | Master kill switch |
| `maxMatchesPerSkill` | integer | `3` | Max subscriptions that fire per skill invocation |
| `showConsoleEcho` | boolean | `true` | Show match info in console |
| `disableGlobal` | boolean | `false` | Ignore global config entirely |
| `monitorSlashCommands` | boolean | `false` | Enable prompt monitor for slash commands |
| `showConditionSkips` | boolean | `false` | Log when conditions cause a skip |
| `telemetry` | boolean | `false` | Enable JSONL telemetry logging |
| `observeUnmatched` | boolean | `false` | Log skills with no matching subscriptions (requires `telemetry`) |
| `telemetryPath` | string | `""` | Override telemetry log path (default: `.claude/skill-bus-telemetry.jsonl`) |
| `completionHooks` | boolean | `false` | *(Experimental)* Enable synthetic completion hooks (`"when": "complete"` subscriptions) |
| `maxLogSizeKB` | integer | `512` | Max telemetry log size in KB before rotation |

### Subscription Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `insert` | string | Yes | Name of the insert to inject |
| `on` | string | Yes | Skill glob pattern (e.g. `superpowers:*`, `*:writing-plans`) |
| `when` | string | Yes | `"pre"` (before skill loads), `"post"` (after skill tool returns), or `"complete"` *(experimental)* (after skill work finishes) |
| `enabled` | boolean | No | Set `false` in project scope to disable a global sub |
| `conditions` | array | No | Subscription-level conditions (AND-stacked) |
| `inheritConditions` | boolean | No | Set `false` to skip insert-level conditions |

**Pattern matching:** The `on` field uses glob patterns (Python's `fnmatch`), not regex. `*` matches any sequence of characters, `?` matches any single character. Common patterns:

| Pattern | Matches |
|---------|---------|
| `superpowers:writing-plans` | Exact skill name |
| `superpowers:*` | All superpowers skills |
| `*:writing-plans` | Any plugin's writing-plans skill |
| `*` | Everything (use with caution — adds context tokens on every skill invocation) |

Note: `fileContains` conditions *do* support regex with `"regex": true` — but the `on` field is always glob, never regex.

### Condition Types

Conditions are AND-stacked — all must pass for a subscription to fire.

| Type | Example | Description |
|------|---------|-------------|
| `fileExists` | `{"fileExists": "docs/"}` | File or directory exists (relative to CWD) |
| `gitBranch` | `{"gitBranch": "feature/*"}` | Current branch matches glob pattern |
| `envSet` | `{"envSet": "CI"}` | Environment variable is set and non-empty |
| `envEquals` | `{"envEquals": {"var": "NODE_ENV", "value": "dev"}}` | Env var equals specific value |
| `fileContains` | `{"fileContains": {"file": "package.json", "pattern": "prisma"}}` | File contains substring (add `"regex": true` for regex) |
| `not` | `{"not": {"envSet": "CI"}}` | Negate any condition |

### Condition Stacking

Insert-level conditions are inherited by all subscriptions referencing that insert:

```json
{
  "inserts": {
    "ts-context": {
      "text": "Use strict TypeScript.",
      "conditions": [{ "fileExists": "tsconfig.json" }]
    }
  },
  "subscriptions": [
    {
      "insert": "ts-context",
      "on": "superpowers:*",
      "when": "pre",
      "conditions": [{ "gitBranch": "feature/*" }]
    }
  ]
}
```

Effective conditions: `fileExists("tsconfig.json") AND gitBranch("feature/*")`

Opt out of inherited conditions with `"inheritConditions": false` on the subscription.

### Dynamic Inserts

Instead of static text, an insert can delegate to a dynamic handler that generates content at dispatch time:

```json
{
  "inserts": {
    "session-summary": {
      "text": "Fallback text if handler fails.",
      "dynamic": "session-stats"
    }
  }
}
```

The `"dynamic"` field names a registered handler. If the handler returns content, it replaces the static `"text"`. If it fails or returns nothing, the static text is used as a fallback.

**Built-in handlers:**

| Handler | Description |
|---------|-------------|
| `session-stats` | Generates a summary from all telemetry events (matches, skips, no-coverage) |

### Merge Behavior

| Layer | Rule |
|-------|------|
| **Settings** | Cascade: defaults -> global -> project (later wins) |
| **Inserts** | Project wins on name collision (INFO logged) |
| **Subscriptions** | Dedup by `(insert, on, when)` — project wins on conflict |
| **Overrides** | Project `enabled: false` disables matching global subs |

## Commands

All commands are available as slash commands in Claude Code:

| Command | Description |
|---------|-------------|
| `/skill-bus:help` | Overview, status, and quick reference |
| `/skill-bus:help advanced` | Full settings, conditions, and config reference |
| `/skill-bus:list-subs` | List all subscriptions with merge status and conditions |
| `/skill-bus:add-sub` | Subscribe to a skill event (guided workflow) |
| `/skill-bus:remove-sub` | Remove or disable a subscription |
| `/skill-bus:edit-insert` | Edit insert text or conditions |
| `/skill-bus:pause-subs` | Temporarily disable all subscriptions |
| `/skill-bus:unpause-subs` | Re-enable after pausing |
| `/skill-bus:report` | Telemetry report — matches, skips, no-coverage |
| `/skill-bus:onboard` | Guided setup — discover knowledge, create subscriptions, enable features |

## CLI

A deterministic Python CLI is available for scripting and debugging:

```bash
# List all subscriptions
python3 lib/cli.py list --cwd "$PWD"

# Simulate what fires for a skill (without actually invoking it)
python3 lib/cli.py simulate "superpowers:writing-plans" --cwd "$PWD"

# List all discoverable skills
python3 lib/cli.py skills --cwd "$PWD"

# One-line status
python3 lib/cli.py status --cwd "$PWD"

# List inserts for a scope
python3 lib/cli.py inserts --scope global --cwd "$PWD"

# Review telemetry
python3 lib/cli.py stats --cwd "$PWD"

# Review telemetry (last 7 days)
python3 lib/cli.py stats --days 7 --cwd "$PWD"

# Discover project knowledge files (CLAUDE.md, docs/, build tooling, etc.)
python3 lib/cli.py scan --cwd "$PWD"

# Write a setting to config
python3 lib/cli.py set telemetry true --scope project --cwd "$PWD"

# Programmatically create an insert + subscription
python3 lib/cli.py add-insert --name "my-context" --text "Always check edge cases." --on "superpowers:*" --scope project --cwd "$PWD"
```

## Examples

### Inject prior decisions into planning skills

```json
{
  "inserts": {
    "compound-knowledge": {
      "text": "Before planning, check docs/decisions/ for prior ADRs and docs/solutions/ for resolved issues.",
      "conditions": [{ "fileExists": "docs/decisions/" }]
    }
  },
  "subscriptions": [
    {
      "insert": "compound-knowledge",
      "on": "superpowers:writing-plans",
      "when": "pre"
    },
    {
      "insert": "compound-knowledge",
      "on": "superpowers:brainstorming",
      "when": "pre"
    }
  ]
}
```

### Gate subscriptions to feature branches

```json
{
  "subscriptions": [
    {
      "insert": "wip-context",
      "on": "superpowers:*",
      "when": "pre",
      "conditions": [{ "gitBranch": "feature/*" }]
    }
  ]
}
```

### Add a post-timing follow-up reminder

```json
{
  "inserts": {
    "test-reminder": {
      "text": "Before moving on, confirm that you've run the relevant test suite."
    }
  },
  "subscriptions": [
    {
      "insert": "test-reminder",
      "on": "superpowers:executing-plans",
      "when": "post"
    }
  ]
}
```

Post timing fires after the skill tool call returns — useful for reminders before Claude wraps up the work.

### Only fire outside CI

```json
{
  "inserts": {
    "interactive-context": {
      "text": "Ask the user to confirm before making destructive changes.",
      "conditions": [{ "not": { "envSet": "CI" } }]
    }
  },
  "subscriptions": [
    {
      "insert": "interactive-context",
      "on": "superpowers:*",
      "when": "pre"
    }
  ]
}
```

The `not` wrapper negates any condition type.

### Match on file content with regex

```json
{
  "inserts": {
    "prisma-context": {
      "text": "This project uses Prisma. Check schema.prisma before modifying data models.",
      "conditions": [
        {
          "fileContains": {
            "file": "package.json",
            "pattern": "\"(prisma|@prisma/client)\"",
            "regex": true
          }
        }
      ]
    }
  },
  "subscriptions": [
    {
      "insert": "prisma-context",
      "on": "superpowers:writing-plans",
      "when": "pre"
    }
  ]
}
```

### Disable a global subscription in one project

```json
{
  "subscriptions": [
    {
      "insert": "compound-knowledge",
      "on": "superpowers:writing-plans",
      "when": "pre",
      "enabled": false
    }
  ]
}
```

Override a specific global subscription by matching its `(insert, on, when)` tuple.

### Disable all global subs for an insert

```json
{
  "subscriptions": [
    {
      "insert": "compound-knowledge",
      "enabled": false
    }
  ]
}
```

Omitting `on` and `when` disables every global subscription that references that insert.

### Dynamic insert with subscription

```json
{
  "inserts": {
    "session-summary": {
      "text": "No telemetry data available yet.",
      "dynamic": "session-stats"
    }
  },
  "subscriptions": [
    {
      "insert": "session-summary",
      "on": "skill-bus:reflecting-on-sessions",
      "when": "pre"
    }
  ]
}
```

The `session-stats` handler generates a live telemetry summary. If it fails, the static `text` is used as fallback.

## Performance

| Path | Latency | When |
|------|---------|------|
| No config files | ~0ms | Instant exit |
| Fast path (no match) | ~6ms | Bash grep, no Python |
| Slow path (match + conditions) | ~20ms | Full Python evaluation |
| Hook timeout | 5s | Fail-safe: skill loads without context |

## Testing

337 tests across four suites:

```bash
# Run all tests
bash tests/test_telemetry.sh && bash tests/test_conditions.sh && bash tests/test_cli.sh && bash tests/test_comprehensive.sh

# Telemetry tests (52 tests — JSONL logging, fast-path, stats CLI, time windowing, rotation, suggestions, completion)
bash tests/test_telemetry.sh

# Condition tests (24 tests — all 6 condition types + edge cases)
bash tests/test_conditions.sh

# CLI tests (106 tests — groups A-L: format, list, simulate, scope, skills, inserts, review, scan, set, add-insert, complete timing, hardening guards)
bash tests/test_cli.sh

# Integration tests (155 tests — groups H-W: dispatch, monitor, conditions, merge, edge cases, nudge, dynamic, onboard, complete timing)
bash tests/test_comprehensive.sh
```

## Troubleshooting

### Changes not taking effect?

- **Config changes** (skill-bus.json — adding subscriptions, editing inserts, changing settings) take effect **immediately** — no restart needed.
- **Plugin updates** (`claude plugin update skill-bus`) require **restarting Claude Code** (new window or restart CLI) to load the new code.

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed flow diagrams (Mermaid), component reference, and gotchas.

```
skill-bus/
├── .claude-plugin/
│   ├── plugin.json          # Plugin manifest
│   └── marketplace.json     # Marketplace metadata
├── docs/
│   └── architecture.md      # Architecture diagrams (Mermaid) and component reference
├── commands/                 # Slash commands (markdown)
│   ├── add-sub.md
│   ├── complete.md            # Synthetic completion signal (experimental)
│   ├── edit-insert.md
│   ├── help.md
│   ├── list-subs.md
│   ├── onboard.md
│   ├── pause-subs.md
│   ├── remove-sub.md
│   ├── report.md
│   └── unpause-subs.md
├── hooks/
│   ├── hooks.json           # Hook declarations
│   ├── dispatch.sh          # Shared fast-path dispatcher
│   ├── pre-skill.sh         # PreToolUse entry point
│   ├── post-skill.sh        # PostToolUse entry point
│   └── prompt-monitor.sh    # UserPromptSubmit hook (opt-in)
├── lib/
│   ├── dispatcher.py        # Core matching engine + conditions
│   ├── cli.py               # Deterministic CLI
│   └── telemetry.py         # JSONL event logging
├── skills/
│   ├── add-sub/SKILL.md     # Add subscription skill
│   ├── help/SKILL.md        # Help skill
│   ├── list-subs/SKILL.md   # List subscriptions skill
│   ├── pause-subs/SKILL.md  # Pause subscriptions skill
│   ├── reflecting-on-sessions/SKILL.md  # Session reflection skill
│   ├── remove-sub/SKILL.md  # Remove subscription skill
│   └── unpause-subs/SKILL.md # Unpause subscriptions skill
└── tests/
    ├── test_telemetry.sh       # 52 telemetry tests
    ├── test_conditions.sh      # 24 condition tests
    ├── test_cli.sh             # 106 CLI tests
    └── test_comprehensive.sh   # 155 integration tests
```

### Tech Stack

- **Bash** — fast-path dispatch (no Python overhead for non-matching skills)
- **Python 3 (stdlib only)** — matching engine, condition evaluation, CLI
- **JSON** — config format and `hookSpecificOutput` protocol
- **Zero external dependencies**

## Debugging

```bash
# Simulate already shows per-condition pass/fail by default
python3 lib/cli.py simulate "your:skill" --cwd "$PWD"

# For live dispatch, enable condition skip logging
# "settings": { "showConditionSkips": true }

# Or via env var (affects hook dispatch, not CLI simulate)
SKILL_BUS_DEBUG=1
```

## License

MIT
