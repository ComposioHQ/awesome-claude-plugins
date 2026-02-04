# Phase 8: GitHub Issue Creation - Reference

This file contains GitHub integration for `/audit-project`.

**Parent document**: `audit-project.md`

## Pre-Conditions

```bash
# Check if git and gh are available
GIT_AVAILABLE=$(command -v git >/dev/null 2>&1 && echo "true" || echo "false")
GH_AVAILABLE=$(command -v gh >/dev/null 2>&1 && echo "true" || echo "false")

# Check if this is a GitHub repository
IS_GITHUB_REPO="false"
if [ "$GIT_AVAILABLE" = "true" ]; then
  REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
  if echo "$REMOTE_URL" | grep -q "github.com"; then
    IS_GITHUB_REPO="true"
  fi
fi
```

## Creating GitHub Issues

If `git` and `gh` are available, create issues for **non-security** deferred items:

```bash
if [ "$GH_AVAILABLE" = "true" ] && [ "$IS_GITHUB_REPO" = "true" ]; then
  echo "Creating GitHub issues for deferred items..."

  # DO NOT create public issues for security-sensitive findings
  for issue in "${DEFERRED_NON_SECURITY_ISSUES[@]}"; do
    gh issue create \
      --title "${issue.title}" \
      --body "${issue.body}"
  done

  echo "Created ${#DEFERRED_NON_SECURITY_ISSUES[@]} GitHub issues"
fi
```

## Issue Format

Each created issue includes:

```markdown
## Issue from /audit-project

**Severity**: [Critical|High|Medium|Low]
**Category**: [Performance|Architecture|Code Quality|Enhancement]
**Effort**: [Small|Medium|Large] (~X hours)

### Description
[Description of the issue]

### Current Behavior
\`\`\`[language]
[Code showing the problem]
\`\`\`

### Proposed Fix
[Specific remediation approach]

### Impact
[Why this matters]

### Files
- [List of affected files]
```

## Security Issue Handling

```

  [WARN] SECURITY ISSUES MUST NOT BE PUBLIC

  The following must NOT be created as GitHub issues:
  - Token/credential exposure
  - Authentication vulnerabilities
  - Authorization bypasses
  - Injection vulnerabilities
  - Any exploitable security finding

  For security issues:
  1. Fix immediately if possible
  2. Keep documented internally only
  3. Note in completion report (no details)

```

## TECHNICAL_DEBT.md Cleanup

After all issues are handled, remove TECHNICAL_DEBT.md:

```bash
if [ "$GH_AVAILABLE" = "true" ] && [ "$IS_GITHUB_REPO" = "true" ]; then
  if [ -f "TECHNICAL_DEBT.md" ]; then
    rm TECHNICAL_DEBT.md
    git add TECHNICAL_DEBT.md
    git commit -m "chore: remove TECHNICAL_DEBT.md - issues tracked in GitHub

Created GitHub issues for all deferred non-security items.
Security-sensitive issues kept internal."
    echo "Removed TECHNICAL_DEBT.md - issues now in GitHub"
  fi
else
  echo "TECHNICAL_DEBT.md retained - no GitHub integration"
fi
```

## Cleanup Conditions

**Remove TECHNICAL_DEBT.md when ALL true:**
1. `git` is available
2. `gh` CLI is available and authenticated
3. Repository has GitHub remote
4. All non-security issues created as GitHub issues

**Keep TECHNICAL_DEBT.md when ANY true:**
1. No GitHub integration available
2. `gh` CLI not authenticated
3. User requested `--create-tech-debt` flag
4. Security issues exist

## Final Commit

If issues were created:

```bash
git add -A
git commit -m "chore: audit-project complete - issues tracked in GitHub

Created X GitHub issues for deferred items:
- #N: [issue title]
- #N: [issue title]

Security-sensitive issues (Y total) kept internal.
Fixed Z issues in this review session."
```
