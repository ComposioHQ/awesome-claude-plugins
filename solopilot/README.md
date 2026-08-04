<div align="center">

# 🛩️ solopilot

**PM-driven autonomous engineering for solo builders.**

One command. Full team. Coordinator + Implementor + Verifier work the spec, you sleep.

[![Stars](https://img.shields.io/github/stars/Mrbaeksang/solopilot?style=flat-square&logo=github&color=yellow)](https://github.com/Mrbaeksang/solopilot/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-orange?style=flat-square)](https://code.claude.com)
[![Version](https://img.shields.io/badge/version-0.1.0-green?style=flat-square)](CHANGELOG.md)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

[Install](#install) · [Quick start](#quick-start) · [Commands](#commands) · [How it works](#how-it-works) · [Why](#why-solopilot)

</div>

---

> **TL;DR** — Run `/autopilot` in any repo. It detects your stack, writes `CLAUDE.md`, sets up a Coordinator (PM) / Implementor (engineer) / Verifier (QA) trio with `specs/PRD.md` as immutable truth, wires hooks for formatter/typecheck, drops in `/cpp` / `/grill` / `/learn` for the daily loop, and prints the exact `/schedule` strings to put it on autopilot. Compound engineering + context-driven development + agent harness, in one slash.

---

## Install

```sh
# 1. Add the marketplace
/plugin marketplace add Mrbaeksang/solopilot

# 2. Install the plugin
/plugin install solopilot@solopilot
```

That's it. Four commands now available globally:

| Command | Purpose |
|---|---|
| `/autopilot` | One-shot bootstrap of the full PM-driven system in any repo |
| `/cpp`       | Commit · Push · PR — git diff → conventional commit → draft PR |
| `/grill`     | Staff-engineer adversarial review of current branch |
| `/learn`     | Extract patterns from a PR, append to `CLAUDE.md` + `LEARNINGS.md` |

## Quick start

```sh
# Inside your project
cd my-project
/autopilot                    # interactive setup — answers go into specs/PRD.md
/autopilot --autoloop         # setup + immediately start the PM cycle
```

Daily loop after setup:

```sh
/plan "<feature>"             # Coordinator drafts specs/plans/<feature>.md
/work                         # Implementor picks next task, runs in worktree
/grill                        # Adversarial review before merge
/cpp                          # Commit · Push · draft PR
/learn 123                    # Compound learnings from PR #123
```

## How it works

**4 layers**, each maps to a real engineering team role:

```
┌─────────────────────────────────────────────────────────┐
│ Layer 0: specs/PRD.md is truth, immutable to agents     │
├─────────────────────────────────────────────────────────┤
│ Layer 1: Coordinator → Implementor → Verifier           │
│          (PM)          (Engineer)     (QA)              │
├─────────────────────────────────────────────────────────┤
│ Layer 2: Quality gates — build → test → spec compliance │
├─────────────────────────────────────────────────────────┤
│ Layer 3: LEARNINGS.md (append-only) + CLAUDE.md "## 학습"│
│          ↑ compound engineering — system gets smarter   │
└─────────────────────────────────────────────────────────┘
```

`/autopilot` writes:

```
your-project/
├── CLAUDE.md                 # auto-generated, merge-only
├── LEARNINGS.md              # append-only knowledge base
├── specs/
│   └── PRD.md                # source of truth, agent read-only
├── .claude/
│   ├── agents/
│   │   ├── coordinator.md
│   │   ├── implementor.md
│   │   └── verifier.md
│   ├── commands/             # project-scoped /plan /work /verify /compound /drift
│   └── settings.json         # PostToolUse hooks + permissions
```

Then prints `/schedule` strings for daily standup, weekly drift audit, and on-PR verification.

## Why solopilot

**The problem.** AI coding agents drift. They lose track of the spec, build past it, accumulate technical debt, and never learn from yesterday's mistakes. Solo developers feel this most — no PM, no QA, no review pressure.

**The fix.** Treat the spec as truth. Split agent responsibilities so no single agent both decides and verifies. Make every PR teach the system something durable. Run it on schedule so the work continues while you sleep.

solopilot codifies the patterns from:

- **Compound Engineering** ([Every / Kieran Klaassen](https://every.to/guides/compound-engineering)) — the 4-step Plan→Work→Review→Compound loop
- **Spec-Driven Development** — PRD as immutable truth, drift detection
- **Agent Harness Engineering** — OODA loops, recovery ladders, quality gates ([ECC](https://github.com/affaan-m/everything-claude-code))
- **Ralph Wiggum** ([Geoffrey Huntley](https://ghuntley.com/ralph/)) — fresh-context, codebase-as-memory loops
- **Anthropic best practices** — Boris Cherny's plan-mode-first workflow, parallel sessions

If you've used context-mode and felt the difference, you'll feel this.

## Commands in detail

<details>
<summary><b>/autopilot</b> — bootstrap</summary>

Detects your stack (`package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `Gemfile`, `composer.json`, `pubspec.yaml`, `build.gradle.kts`, `pom.xml`, `Makefile`), generates `CLAUDE.md` and `specs/PRD.md`, sets up the 3-agent system, configures PostToolUse hooks for formatter/typecheck, prints `/schedule` strings for routines.

Idempotent — re-running merges, never overwrites your edits.

```
/autopilot                # full setup
/autopilot --autoloop     # setup + start PM cycle loop
/autopilot --update       # sync drift only
/autopilot --dry-run      # preview without writing
```
</details>

<details>
<summary><b>/cpp</b> — commit · push · PR</summary>

Analyzes uncommitted changes, classifies them (Conventional Commits), generates a message that explains *why* not *what*, commits with explicit file list (no `git add -A`), pushes (with upstream auto-detect), opens a draft PR via `gh`.

```
/cpp                      # auto
/cpp --type feat          # force type
/cpp "fix(auth): close timing leak"   # custom message
```

Refuses to commit if it sees a secret pattern. Never `--amend`. Never `git add -A`.
</details>

<details>
<summary><b>/grill</b> — adversarial review</summary>

5 parallel passes (security, types, concurrency, edge cases, scope drift) with severity tags (🔴/🟠/🟡/🟢). Optionally runs santa-method dual-review for convergence on top findings. Outputs to `.solopilot/grill/<run-id>.md` with verdict: SHIP / FIX-FIRST / REWRITE.

```
/grill                    # branch vs default base
/grill --pr 123           # remote PR
/grill --severity high    # filter
/grill --quick            # single-pass
```
</details>

<details>
<summary><b>/learn</b> — compound from a PR</summary>

Extracts 5 categories (patterns, anti-patterns, decisions, constraints, spec gaps) from a PR or current session, filters by quality (no duplicates, no triviality, must cite source), appends to `LEARNINGS.md` (append-only) and the most generalizable 1-3 to `CLAUDE.md`'s `## 학습` section.

```
/learn 123                # PR #123
/learn session            # current conversation
/learn 123 --pr-comment   # also post to PR
```
</details>

## Prerequisites

- [Claude Code](https://code.claude.com) installed
- `gh` (GitHub CLI) authenticated, for `/cpp` and `/learn`
- A project with `git init` already run

Pairs well with: [`context-mode`](https://github.com/context-mode/context-mode), [`everything-claude-code`](https://github.com/affaan-m/everything-claude-code), [`compound-engineering-plugin`](https://github.com/EveryInc/compound-engineering-plugin).

## Roadmap

- [x] v0.1.0 — `/autopilot`, `/cpp`, `/grill`, `/learn`
- [ ] v0.2 — interactive PRD interview during `/autopilot`
- [ ] v0.3 — pre-built routines (`/autopilot --routines daily,weekly,on-pr`)
- [ ] v0.4 — drift dashboard (`solopilot status`)
- [ ] v0.5 — multi-repo coordinator mode

## Contributing

PRs welcome. Run `/grill --pr <your-pr>` before requesting review — meta-dogfooding.

## License

[MIT](LICENSE)

---

<div align="center">

**If solopilot saved you a sprint, ⭐ the repo.**

</div>
