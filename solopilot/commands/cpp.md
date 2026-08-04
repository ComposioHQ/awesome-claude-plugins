---
description: Commit-Push-PR — analyze git diff, generate Conventional Commits message, commit, push, open draft PR. One shot, idempotent.
---

# /cpp — Commit · Push · PR

Turn uncommitted changes into a draft PR in one step. Generates a Conventional Commits message from the diff, pushes the branch, opens a draft PR via `gh`.

## Usage

```
/cpp                       # auto-detect type, draft PR
/cpp --ready               # open as ready (not draft)
/cpp --type feat           # force commit type
/cpp --no-pr               # commit + push only
/cpp --base main           # PR base branch (default: detect from gh)
/cpp "<custom message>"    # use the provided message verbatim
```

## What this command makes Claude do

### 0. Preflight
- Refuse if not a git repo, or no uncommitted changes (staged or unstaged).
- Refuse if on `main`/`master`/`develop` — instruct user to switch branches first.
- Verify `gh auth status` (skip if `--no-pr`).

### 1. Inspect changes (use context-mode)
Use `mcp__plugin_context-mode_context-mode__ctx_batch_execute` to keep diff out of main context:
- `git status --short` (label: "status")
- `git diff --stat HEAD` (label: "stat")
- `git diff HEAD` (label: "diff")
- `git log --oneline -5` (label: "recent")
- `gh pr list --head $(git branch --show-current) --json number,state` (label: "existing-pr")

Then `ctx_search` to extract: changed file count, dominant subsystem, breaking changes, test changes, dependency bumps.

### 2. Classify (Conventional Commits)
Pick `type` based on diff signal (override if `--type` given):
- `feat` — new functionality
- `fix` — bug fix
- `refactor` — no behavior change
- `perf` — speed/memory improvement
- `docs` — only docs/comments
- `test` — only tests
- `build` — build system/deps
- `ci` — CI config
- `chore` — tooling, no production code

Optional `scope` from dominant directory (e.g., `feat(auth):`).

### 3. Generate message
Format:
```
<type>(<scope>): <imperative subject ≤72 chars>

<body: WHY, not what — 2-4 sentences max>

<footer: BREAKING CHANGE / Closes #N if relevant>
```

Rules:
- Imperative mood (`add`, not `added`)
- No trailing period in subject
- Body explains motivation, not changed lines
- No `Co-Authored-By` (user has attribution disabled per global rules)
- If user passed `"<custom message>"` as $ARGUMENTS, use it verbatim, validate format

### 4. Commit
- Stage explicitly named files (no `git add -A` — avoids leaking secrets/big binaries)
- `git commit -m "<message via heredoc>"` to preserve newlines
- If pre-commit hook fails: read error, fix, re-stage, NEW commit (never `--amend`)

### 5. Push
- Detect upstream: `git rev-parse --abbrev-ref --symbolic-full-name @{u}` 2>/dev/null
- If no upstream: `git push -u origin <branch>`
- Else: `git push`
- Never `--force` unless user explicitly typed `--force` in args

### 6. Open PR (skip if `--no-pr`)
- Check existing PR for branch (from step 1) — if exists, just print URL and exit
- Else `gh pr create --draft` (or `--ready` if flag) with:
  - Title = commit subject
  - Body = HEREDOC with:
    ```
    ## Summary
    <2-3 bullets from commit body>

    ## Test plan
    - [ ] <inferred from diff: tests added/modified, manual verification needed>

    🤖 Generated with /cpp
    ```
- Print PR URL on success

### 7. Summary (3 lines exact)
```
✓ committed: <short-sha> <subject>
✓ pushed:    <branch> → origin
✓ pr:        <url>  (or "skipped")
```

## Safety

- **Never** `git add -A` or `git add .` — explicit file list only.
- **Never** `--amend` — always new commit on hook failure.
- **Never** `--force` push unless user typed it.
- **Never** include `.env`, credentials, lock files >5MB, or anything matching project `.gitignore` patterns.
- **Refuse** to commit if `git diff` shows what looks like a secret (API key pattern, private key header).
- **Confirm** before committing if changed files >20 (likely accidental scope).

## Arguments

$ARGUMENTS:
- `--ready` — open PR as ready (default: draft)
- `--type <t>` — force commit type
- `--no-pr` — skip PR creation
- `--base <branch>` — PR base (default: repo default)
- `"<message>"` — use verbatim, skip auto-generation
- `--force` — allow force push (rare, dangerous)
