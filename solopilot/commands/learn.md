---
description: Extract reusable patterns and anti-patterns from a PR (or session), append to CLAUDE.md "## 학습" and LEARNINGS.md. Compound-engineering core loop.
---

# /learn — Compound from a PR

The 4th step of compound engineering: turn what just happened into durable system knowledge. Future sessions read these, get smarter automatically.

## Usage

```
/learn 123                     # learn from PR #123
/learn 123 --anti              # only extract anti-patterns
/learn 123 --pattern           # only extract reusable patterns
/learn session                 # learn from current session (no PR needed)
/learn 123 --no-claude-md      # write LEARNINGS.md only, skip CLAUDE.md update
/learn 123 --pr-comment        # also post extracted lessons as PR comment
```

## What this command makes Claude do

### 0. Resolve source
- If $ARGUMENTS is a number → `gh pr view <n> --json title,body,baseRefName,headRefName,additions,deletions,changedFiles,commits,comments,reviews` + `gh pr diff <n>`
- If `session` → use current conversation transcript (last 50 turns)
- Else error with usage

### 1. Gather context (use context-mode)
Use `ctx_batch_execute`:
- `gh pr view <n> --json ...` (label: "pr-meta")
- `gh pr diff <n>` (label: "pr-diff")
- `gh pr view <n> --json comments,reviews` (label: "pr-discussion")
- `cat CLAUDE.md 2>/dev/null` (label: "claude-md")
- `cat LEARNINGS.md 2>/dev/null` (label: "learnings")
- `cat specs/PRD.md 2>/dev/null` (label: "prd")

Then `ctx_search` for: review concerns, fix iterations, scope changes, surprises.

### 2. Extract (5 categories)

For each, only emit if signal is real (not boilerplate):

**Patterns (do this again):**
- New abstractions worth reusing
- Workflow tactics that worked (e.g., "feature flag for X migration class")
- Tool/library choices validated by this PR

**Anti-patterns (don't do this):**
- Bug shapes that recurred
- Naming/organization choices that confused review
- Tests that didn't catch what they should have
- Dependencies that bit us

**Decisions (preserve rationale):**
- Why we chose A over B (so we don't re-relitigate)
- Trade-offs accepted (latency for simplicity, etc.)

**Constraints (newly discovered):**
- Limits of a service/library
- Performance ceilings
- Compatibility surprises

**Spec gaps (PRD insufficient):**
- Acceptance criteria the PRD missed
- Edge cases the spec didn't define
- (Triggers a `/drift` recommendation)

### 3. Filter — quality bar

Skip if:
- Already in `LEARNINGS.md` (search before write)
- Trivial / could be derived from reading the code
- Speculative (not validated by this specific PR)
- Project-level info that belongs in CLAUDE.md `## Stack`/`## Commands`, not learnings

Aim for **3-7 high-signal entries max**. Less > more.

### 4. Append to LEARNINGS.md (always)

Format:
```markdown
## <YYYY-MM-DD> — PR #<n>: <pr-title>

### Pattern: <short title>
- **What:** <one sentence>
- **Why:** <reason / mechanism>
- **When to apply:** <conditions>
- **Source:** PR #<n>, files: <comma list, max 3>

### Anti-pattern: <short title>
- **What we did:** <observed>
- **Why it bit:** <concrete failure>
- **Instead:** <preferred approach>
- **Source:** PR #<n>, commit <sha>

### Decision: <topic>
- **Chose:** <option A>
- **Over:** <option B>
- **Reason:** <one sentence>
- **Reversible?:** yes / no / expensive
- **Source:** PR #<n>
```

Append-only — never edit prior entries. If a prior entry is wrong, add a new entry referencing and superseding it.

### 5. Update CLAUDE.md `## 학습` section (skip if `--no-claude-md`)

Only the **most generalizable 1-3 entries** make it here (CLAUDE.md is loaded every session — keep precious).

Format:
```markdown
## 학습

- <YYYY-MM-DD> [pattern] **<title>** — <one line>. See LEARNINGS.md.
- <YYYY-MM-DD> [anti] **<title>** — <one line>. See LEARNINGS.md.
```

Show diff to user, ask confirm if CLAUDE.md `## 학습` already has >20 entries (overflow signal — propose archiving older ones).

### 6. (if `--pr-comment`) post to PR

```bash
gh pr comment <n> --body "<HEREDOC: extracted lessons in markdown>"
```

### 7. Summary (4 lines)
```
✓ source: PR #<n> "<title>"
✓ extracted: <P> patterns, <A> anti-patterns, <D> decisions
✓ written: LEARNINGS.md (+<N> entries), CLAUDE.md (+<M> entries)
✓ next: review changes, commit when satisfied
```

## Rules

- **Append-only** to LEARNINGS.md — never modify existing entries.
- **No speculation** — every entry must cite the specific PR/file/commit it came from.
- **Quality > quantity** — 3 high-signal beats 15 trivial.
- **Don't duplicate** — search first, link if related.
- **Confirm before** writing if `## 학습` in CLAUDE.md exceeds 20 entries.

## Arguments

$ARGUMENTS:
- `<n>` — PR number, or `session` for current conversation
- `--anti` — anti-patterns only
- `--pattern` — patterns only
- `--no-claude-md` — skip CLAUDE.md update
- `--pr-comment` — also post as PR comment
