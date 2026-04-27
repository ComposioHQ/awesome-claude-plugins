---
description: One-shot bootstrap of PM-driven autonomous dev system — spec-truth, 3-agent (Coordinator/Implementor/Verifier), drift-resistant, self-improving. Sets up CLAUDE.md, agents, commands, hooks, and prints /schedule routine block.
---

# Autopilot

Bootstrap a complete autonomous development system in the current project. **Idempotent** — re-running merges instead of overwriting.

## Usage

```
/autopilot                  # full setup, prompt for missing info
/autopilot --quiet          # skip confirmations, use detected defaults
/autopilot --update         # only sync drift in existing setup
/autopilot --routines-only  # only print /schedule strings
/autopilot --no-routines    # skip step 10
/autopilot --dry-run        # show plan, write nothing
/autopilot --autoloop       # after setup, immediately invoke /loop on PM cycle
```

## What this command makes Claude do (in order)

### 0. Preflight
- Refuse if `pwd == $HOME`. Refuse if not a git repo (offer `git init`).
- If files >50 lines exist at any target path, confirm before merging unless `--quiet`.

### 1. Detect stack (use context-mode)
**Required**: use `mcp__plugin_context-mode_context-mode__ctx_batch_execute` to read all manifests in one call — keeps raw file content out of the main context window.

Commands to run in batch:
- `cat package.json 2>/dev/null` (label: "package.json")
- `cat go.mod 2>/dev/null` (label: "go.mod")
- `cat Cargo.toml 2>/dev/null` (label: "Cargo.toml")
- `cat pyproject.toml 2>/dev/null` (label: "pyproject.toml")
- `cat requirements.txt 2>/dev/null` (label: "requirements.txt")
- `cat Gemfile 2>/dev/null` (label: "Gemfile")
- `cat composer.json 2>/dev/null` (label: "composer.json")
- `cat pubspec.yaml 2>/dev/null` (label: "pubspec.yaml")
- `cat build.gradle.kts 2>/dev/null` (label: "gradle")
- `cat pom.xml 2>/dev/null` (label: "pom.xml")
- `cat Makefile 2>/dev/null` (label: "Makefile")
- `ls -la` (label: "tree")

Then `ctx_search` for specific fields (scripts, packageManager, deps). Extract:
- Language, package manager, build cmd, test cmd, lint cmd, format cmd, typecheck cmd
- If ambiguous, ask once with detected options as multiple-choice.

### 2. Detect git state
Current branch, remote URL (note: routines need GitHub remote), default branch.

### 3. Generate or merge `CLAUDE.md` (≤120 lines)
If exists: preserve user content, only add missing sections. Sections:
- `## Stack` — one-liner each (auto-detected)
- `## Commands` — exact strings for build/test/lint/format/typecheck
- `## Workflow` — Plan → Work → Verify → Compound. State: **`specs/PRD.md` is source of truth, agents read-only.**
- `## Rules` — append-only `LEARNINGS.md`; no `--no-verify`; tests decide reality; no scope creep beyond current spec; immutable PRD.
- `## 학습` — empty section, populated by `/compound`.

### 4. Generate `specs/PRD.md` template (if missing)
Frontmatter:
```yaml
---
immutable-to-agent: true
created: <YYYY-MM-DD>
last-human-edit: <YYYY-MM-DD>
---
```
Sections: Goal, Non-goals, Constraints, Acceptance Criteria, Out-of-scope.

### 5. Generate `.claude/agents/` (3 files)
- `coordinator.md` — PM role. Reads PRD, decomposes into atomic tasks, assigns priority via dependency graph, writes plans to `specs/plans/<feature>.md`. **Never writes code.** Tools: Read, Grep, Glob, Write (only to `specs/plans/`).
- `implementor.md` — Engineer role. Receives one task + context packet (PRD excerpt, CLAUDE.md, relevant files). Executes in worktree. Reports diff + test results. Tools: full read/write within worktree, Bash for build/test only.
- `verifier.md` — QA role. Read-only. Runs tests, compares diff against PRD acceptance criteria, flags drift with severity (low/medium/high). On `high`: pause loop, surface to human. Tools: Read, Grep, Bash (test/lint only).

### 6. Generate `.claude/commands/` (5 files, project-scoped)
- `plan.md` — invokes `coordinator` agent on $ARGUMENTS, produces `specs/plans/<feature>.md`
- `work.md` — invokes `implementor` agent on next unblocked task from current plan
- `verify.md` — invokes `verifier` agent; on drift severity=high, exits non-zero
- `compound.md` — extracts session learnings, appends to `LEARNINGS.md`, proposes CLAUDE.md updates as a diff for human approval
- `drift.md` — full repo PRD-vs-code drift audit, opens PR with findings

### 7. Generate or merge `.claude/settings.json`
Merge with existing. Fields:
- `hooks.PostToolUse[]`:
  - On Write|Edit matching detected source files: run formatter (silent if not detected)
  - On Write|Edit: run typechecker (silent if not detected)
- `hooks.Stop[]`:
  - Suggest `/compound` if session had >5 tool calls and no learnings appended (non-blocking)
- `permissions.allow[]`: stack-specific safe whitelist — test, build, lint, format, typecheck, `git status`, `git diff`, `git log`, `git branch`, `git switch`
- `permissions.deny[]`: `git push --force`, `git reset --hard`, `rm -rf /`, `npm publish`, `cargo publish`, `gem push`, `pypi upload`

### 8. Generate `LEARNINGS.md` (root, if missing)
```yaml
---
append-only: true
created: <YYYY-MM-DD>
---
```
Body: explanation that entries are append-only, format `## YYYY-MM-DD — <topic>` with bullet points.

### 9. Generate `.claude/agents/CLAUDE.md` (subagent context packet)
Brief shared context all 3 agents inherit: project name, stack, PRD path, LEARNINGS.md path, build/test commands.

### 10. Print `/schedule` block (skip if `--no-routines` or no GitHub remote)
Output exact copy-paste strings the user runs in next message:

```
/schedule daily standup at 9am — scan yesterday's commits in this repo, summarize progress vs specs/PRD.md acceptance criteria, flag blockers, post to GitHub issue or local file
/schedule weekly drift audit Sunday 10pm — run /drift, if findings open a PR with the report
/schedule on github pull_request opened — run /verify against specs/PRD.md, post comment with drift report
```

Note: routines run on Anthropic cloud (1h minimum interval), need GitHub repo connector.

### 10b. (if `--autoloop`) Start the PM cycle loop
Use the `loop` skill to immediately start the cycle. Self-paced — no fixed interval. Loop body:
```
1. /verify   → if drift severity=high, pause and surface to human
2. /work     → next unblocked task from current plan
3. (every 3rd iteration) /compound → append learnings
```
Stop conditions: PRD acceptance criteria all met, OR human interrupts, OR 3 consecutive failed `/verify` runs.
Print: "PM loop started. Use /loop status to inspect, Ctrl+C to halt."

### 11. Print summary (5 lines exact)
```
✓ stack: <detected>
✓ files: N created, M merged
✓ agents: coordinator, implementor, verifier
✓ next: /plan "<your first feature>"
✓ routines: paste the block above into next message
```

## Safety rules

- **Never overwrite** user content in `CLAUDE.md`, `settings.json`, `PRD.md` — only merge/append.
- **Never run `/schedule` directly** (conversational, account-scoped) — print strings, user pastes.
- **Never enable** `--dangerously-skip-permissions` or remove safety hooks.
- **Confirm before writing** if any target file has >50 lines of existing user content (unless `--quiet`).
- **Skip routine step** if no GitHub remote (Anthropic routines need cloud connector).
- **Append, don't edit** `LEARNINGS.md` — even on re-run.

## Arguments

$ARGUMENTS:
- `--quiet` — no confirmations
- `--update` — sync drift only, no new files
- `--routines-only` — print `/schedule` strings only
- `--no-routines` — skip step 10
- `--dry-run` — show plan, write nothing
