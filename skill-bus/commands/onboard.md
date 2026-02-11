---
description: Guided setup — discover knowledge files, create subscriptions, enable telemetry, and close the feedback loop. Safe to re-run (additive).
---

# Skill Bus Onboard

**Announce:** "[skill-bus] Starting guided setup."

## Process

### Step 1: Discover

#### Phase 1a: Read CLAUDE.md

Read `.claude/CLAUDE.md` if it exists. Parse it for:
- Referenced file paths and directories
- Architecture descriptions and conventions
- Workflow or process descriptions
- Tech stack information

Store findings as notes for Step 2 (knowledge routing).

#### Phase 1b: Scan project

Locate the CLI and run the project scanner:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
if [ -z "$SB_CLI" ]; then
    echo "ERROR: skill-bus CLI not found. Is the plugin installed?"
    exit 1
fi
python3 "$SB_CLI" scan --cwd "$PWD"
```

Also discover installed skills:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" skills --cwd "$PWD"
```

And check current config status:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" status --cwd "$PWD"
```

#### Phase 1c: Present findings and discuss skills

Present what was found, then walk through the installed skills before proposing subscriptions:

> "Based on your CLAUDE.md and project structure, I found these knowledge sources:
> - [list each discovered knowledge file with description]
>
> Here are the skills installed in your environment that Skill Bus can enhance:
> - [list key skills from Phase 1b output, grouped by plugin/category]
>
> The idea is to connect your knowledge sources to relevant skills. For example, if you have `docs/decisions/` with past architectural decisions, that context is valuable when planning (`writing-plans`) or debugging (`systematic-debugging`).
>
> Which of these skills do you use most? Any knowledge sources I missed — project briefs, people files, architecture docs, troubleshooting archives?"

**If no knowledge files found**, pivot:

> "You don't have structured knowledge files yet — that's fine. Skill-bus routes existing knowledge to skills, and the feedback loop will identify what's missing over time."
>
> "A good starting point: create a `docs/decisions/` directory. Even a few notes on past decisions gives planning and debugging skills valuable context. Re-run `/skill-bus:onboard` anytime to wire in new knowledge."

Skip to Step 3 (Settings).

**If existing config found with subscriptions:**

> "You already have N subscriptions configured. Want to review them, or set up additional ones?"

If they want to review, run `/skill-bus:list-subs`. Then continue with new subscriptions only.

### Step 2: Knowledge Routing

For each knowledge source discovered (from Phase 1a + 1b + 1c), propose a subscription interactively.

#### Routing table:

| Knowledge found | Proposed insert name | Suggested insert text pattern | Suggested skills |
|----------------|---------------------|-------------------------------|-----------------|
| `docs/` with decisions or solutions | `prior-decisions` | "Check [path] for prior decisions/solutions before starting this work" | `*:writing-plans`, `*:brainstorming`, `*:systematic-debugging` |
| `README.md` / `CLAUDE.md` with conventions | `project-conventions` | "Apply project conventions from [path]" | `*:code-review`, `*:verification-*` |
| `.git/config` with org remote | `git-identity` | "Enforce git identity for [org] in this project" | `*:finishing-*`, `*:code-review` |
| Build tooling (`package.json` etc.) | `build-check` | "Run build/type-check before claiming done" | `*:verification-*`, `*:finishing-*` |
| User-specified paths (from Phase 1c) | Ask user for name | Generated based on user's description | Matched to relevant skill categories |

For each:

1. Show the proposed subscription
2. Ask using AskUserQuestion: **"Create this subscription?"**
   - **Yes, auto-generate text** — Draft the insert text based on what was found
   - **Yes, choose a pattern** — Pick from insert text templates:
     - "Check [path] for prior context before starting this work"
     - "Search [path] for existing solutions before debugging from scratch"
     - "Cross-reference [path] for relevant context when names/people are mentioned"
     - "Enforce [convention] from [path] during this workflow"
     - Custom — describe in your own words
   - **Skip** — Don't create this subscription

3. If they chose yes, ask scope using AskUserQuestion:
   - **"Scope: global (all projects) or project (this repo only)?"**
   - **Global** — Saved to `~/.claude/skill-bus.json`
   - **Project** — Saved to `.claude/skill-bus.json`

4. For any file/directory-based knowledge, auto-add a `fileExists` condition on the insert. Explain:
   > "Adding a `fileExists` condition so this only fires in projects that have [path]."

5. Write the insert and subscription to config using the `add-insert` CLI subcommand. **Create subscriptions one at a time** (do not parallelize these writes — the CLI uses read-modify-write on the config file):

   ```bash
   SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
   python3 "$SB_CLI" add-insert \
       --name "<insert-name>" \
       --text "<insert text>" \
       --conditions '[{"fileExists": "<path>"}]' \
       --on "<skill-pattern>" \
       --when pre \
       --scope "$SCOPE" \
       --cwd "$PWD"
   ```

   Set `SCOPE` to `"global"` or `"project"` based on the user's choice. Omit `--conditions` if no conditions needed. Adapt arguments based on user's choices.

6. Confirm each subscription created:
   > "Created: [insert-name] -> [skill-pattern] [timing] ([scope])"

### Step 3: Settings & Advanced Options

#### Telemetry

> "Before we set up the feedback loop, let's enable telemetry. Skill-bus telemetry records which inserts fire and which conditions pass or fail. This powers `/skill-bus:report` and the reflection skill. It's stored locally as a JSONL file — nothing leaves your machine."

Ask using AskUserQuestion:
**"Enable telemetry?"**
- **Yes (recommended)** — enables stats, reflection, and gap detection
- **Yes, with full coverage tracking** — also logs skills that fire with no subscriptions (`observeUnmatched`)
- **No** — skip telemetry (stats and reflection won't have data)

If Yes or Yes+full:
```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" set telemetry true --scope project --cwd "$PWD"
```

If Yes+full, also:
```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" set observeUnmatched true --scope project --cwd "$PWD"
```

If No, warn:
> "Without telemetry, the reflection skill and gap-check won't have data to work with. You can enable it later via: `/skill-bus:help advanced`"

#### Prompt Monitor

> "When you type a slash command directly (e.g. `/commit`), it bypasses Claude's Skill tool — so skill-bus hooks don't fire. The prompt monitor watches for these patterns and matches them against your subscriptions."
>
> "This runs a lightweight check (~6ms) on every message you type. Enable it?"

Ask using AskUserQuestion:
**"Enable prompt monitor?"**
- **Yes** — enables `monitorSlashCommands` for broader coverage
- **No** — only intercept skills that Claude invokes through the Skill tool

If Yes:
```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" set monitorSlashCommands true --scope project --cwd "$PWD"
```

### Step 4: Feedback Loop Setup

> "Last step — closing the feedback loop. Skill-bus includes a reflection skill that reviews what fired, what didn't, and suggests new subscriptions based on real usage."
>
> "Do you run anything at the end of sessions or after completing a piece of work? For example:"
> - `superpowers:finishing-a-development-branch` — runs when wrapping up a branch
> - `superpowers:verification-before-completion` — runs before claiming work is done
> - `compound-engineering:compound-docs` — captures solved problems as documentation
> - A custom branch-finishing or session-closing routine

Ask using AskUserQuestion:
**"Subscribe gap-check to a completion skill?"**
- **Yes, I use one of these** — Let user specify which skill
- **No, skip this** — Rely on reflecting-on-sessions skill

**If Yes:**

Ask which skill they use (free text or pick from the examples above).

Create a `session-gaps` insert with `"dynamic": "session-stats"` and a subscription to their chosen skill:

Write to config using the `add-insert` CLI with the `--dynamic` flag:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" add-insert \
    --name "session-gaps" \
    --text "No telemetry data available yet. Enable telemetry and use skills to generate stats." \
    --dynamic "session-stats" \
    --on "[their-skill-pattern]" \
    --when pre \
    --scope project \
    --cwd "$PWD"
```

> "When [their skill] runs, you'll see a summary of what fired, what didn't, and any gaps detected."

Also mention:
> "Skill-bus also has a built-in `reflecting-on-sessions` skill that Claude will invoke at natural transitions — plan completions, branch finishes, session wind-downs. This works alongside the subscription."

**If No:**

> "No problem. Skill-bus includes a `reflecting-on-sessions` skill that Claude will automatically invoke at natural transition points. You can also run `/skill-bus:report` anytime to check coverage manually."

### Step 5: Verify

Run simulation with the most relevant skill to confirm setup works:

```bash
SB_CLI=$(ls ~/.claude/plugins/cache/*/skill-bus/*/lib/cli.py ~/.claude/plugins/repos/skill-bus/lib/cli.py 2>/dev/null | tail -1)
python3 "$SB_CLI" simulate "[most relevant skill from discovered plugins]" --cwd "$PWD"
```

Show:
> "Here's what would fire if you ran `[skill]` right now:"
> [simulation output]

Then show final summary:
> "Setup complete. You have N subscriptions configured."
>
> Quick reference:
> - `/skill-bus:report` — review what's firing and what's not
> - `/skill-bus:list-subs` — see all subscriptions
> - `/skill-bus:add-sub` — add more subscriptions
> - `/skill-bus:onboard` — re-run to add new knowledge sources (additive)
