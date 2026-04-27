---
description: Staff-engineer adversarial review of current branch — security, types, race conditions, edge cases, scope drift. Severity-tagged findings. No mercy.
---

# /grill — Staff Engineer Code Grilling

Brutally review the current branch like a staff engineer who hates your guts. Not friendly suggestions — actual blockers. Designed to catch what `/code-review` misses by adopting an adversarial mindset.

## Usage

```
/grill                 # review uncommitted + branch vs base
/grill --base main     # diff against specific base
/grill --staged        # only staged changes
/grill --pr 123        # grill an existing PR (fetches diff via gh)
/grill --severity high # only show high/critical findings
/grill --quick         # skip deep analysis (no santa-method, no agent spawns)
```

## What this command makes Claude do

### 0. Setup
- Detect base branch (`gh repo view --json defaultBranchRef -q .defaultBranchRef.name`, fallback `main`)
- Generate run id: `<branch>-<short-sha>-<timestamp>`
- Output dir: `.solopilot/grill/<run-id>.md`

### 1. Gather diff (use context-mode)
Use `ctx_batch_execute`:
- `git diff <base>...HEAD` (label: "diff")
- `git diff <base>...HEAD --stat` (label: "stat")
- `git log <base>..HEAD --oneline` (label: "commits")
- `git ls-files | head -50` (label: "tree")
- (if `--pr <n>`) `gh pr diff <n>` overrides

Search index for: imports, dependency changes, async patterns, error handlers, input validation surfaces.

### 2. Run 5 adversarial passes (parallel where possible)

Spawn subagents in parallel (use Agent tool with subagent_type matching language):
- **Security pass** — secrets in diff, SSRF, injection, auth bypass, missing rate limit, unsafe crypto, OWASP Top 10. Use `security-reviewer` agent or `security-review` skill.
- **Type pass** — `any` proliferation, missing null checks, type assertions, schema mismatches at boundaries (API ↔ DB ↔ UI). Language-specific reviewer agent (`typescript-reviewer`, `python-reviewer`, etc.).
- **Concurrency pass** — race conditions, missing locks/atomics, double-fetch, async without `await`, shared mutable state, request idempotency. Flag iterations over mutating collections.
- **Edge case pass** — empty inputs, null/undefined, boundary values (0, -1, MAX_INT), unicode, timezone, empty collections, large inputs, network failures, partial writes.
- **Scope-drift pass** — read `specs/PRD.md` if exists, check diff against acceptance criteria. Flag changes outside current spec scope. Cross-reference `LEARNINGS.md` for past anti-patterns.

(if not `--quick`) Then run **santa-method skill** for adversarial dual-review convergence on the top 3 findings.

### 3. Score each finding

Severity tags:
- 🔴 **CRITICAL** — ship-blocker, security/data loss/correctness
- 🟠 **HIGH** — should fix before merge
- 🟡 **MEDIUM** — fix soon, not blocking
- 🟢 **LOW** — nit / style / future cleanup
- ℹ️ **INFO** — non-actionable observation

Filter by `--severity` if given. Default shows all but INFO.

### 4. Output report

Write to `.solopilot/grill/<run-id>.md`:
```markdown
# Grill Report — <branch>
**Base:** <base> · **HEAD:** <sha> · **Date:** <YYYY-MM-DD HH:MM>
**Files:** N · **Findings:** X critical, Y high, Z medium

## 🔴 CRITICAL
### [path:line] <title>
**What:** <observed>
**Why it bites:** <concrete failure scenario>
**Fix:** <minimal change>
**Confidence:** high/medium/low

## 🟠 HIGH
...

## Spec drift
<list of diff hunks not covered by PRD acceptance criteria, or "no drift detected">

## Past patterns hit
<refs to LEARNINGS.md entries that this diff repeats or violates>
```

Print **only the headers + counts** to chat — full report stays in file. End with:
```
✓ report: .solopilot/grill/<run-id>.md
✓ verdict: <SHIP / FIX-FIRST / REWRITE>
```

### 5. Verdict logic
- Any 🔴 → `REWRITE` (don't merge, redesign)
- ≥3 🟠 or 1 critical-confidence-high without 🔴 → `FIX-FIRST`
- Else → `SHIP`

## Adversarial mindset rules

- **Don't be polite.** "Looks good" is banned. If nothing is wrong, list 5 things you would have changed.
- **Concrete failure scenarios.** Not "could leak data" — "if attacker sends X, server returns Y, exposing Z".
- **No false positives via assumption.** If you grep and find no caller, ask first; don't conclude unused.
- **Reference past learnings.** If `LEARNINGS.md` already records this anti-pattern, cite the entry.
- **Question the spec.** If diff implements PRD literally but the PRD itself looks dumb, flag it.

## Arguments

$ARGUMENTS:
- `--base <branch>` — diff base (default: repo default)
- `--staged` — only staged
- `--pr <n>` — grill a remote PR
- `--severity <level>` — filter (critical|high|medium|low|info)
- `--quick` — skip santa-method + parallel agents (single-pass)
