# Error Handling & Recovery - Reference

This file contains error handling procedures for `/ship`.

**Parent document**: `ship.md`

## GitHub CLI Not Available

```markdown
ERROR: GitHub CLI (gh) not found

Install: https://cli.github.com

Or use package manager:
  macOS: brew install gh
  Windows: winget install GitHub.cli
  Linux: See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

Then authenticate:
  gh auth login
```

## CI Failure

```markdown
[ERROR] CI checks failed for PR #${PR_NUMBER}

View details:
  ${CI_URL}

Fix the failing tests/checks and push again.
The /ship command will resume from Phase 4 (CI monitoring).

To retry:
  git push
  /ship
```

### CI Fix with ci-fixer Agent

When CI fails, use the ci-fixer agent:

```javascript
Task({
  subagent_type: "next-task:ci-fixer",
  prompt: `Fix CI failure for PR #${PR_NUMBER}

CI Output:
${CI_OUTPUT}

Failed checks:
${FAILED_CHECKS}

Requirements:
1. Analyze the failure reason
2. Make minimal fix to pass CI
3. Do not introduce unrelated changes
4. Ensure all tests pass after fix`
});
```

## Merge Conflicts

```markdown
[ERROR] Cannot merge PR #${PR_NUMBER}: conflicts with ${MAIN_BRANCH}

Resolve conflicts:
  git fetch origin
  git merge origin/${MAIN_BRANCH}
  # Resolve conflicts in your editor
  git add .
  git commit
  git push

Then retry:
  /ship
```

## Deployment Failure

```markdown
[ERROR] Deployment failed

${WORKFLOW === 'dev-prod' ? 'Development' : 'Production'} deployment did not succeed.

Check deployment logs:
  ${DEPLOYMENT === 'railway' ? 'railway logs' : ''}
  ${DEPLOYMENT === 'vercel' ? 'vercel logs' : ''}
  ${DEPLOYMENT === 'netlify' ? 'netlify logs' : ''}

Once fixed, deployment will retry automatically.
```

## Production Validation Failure with Rollback

```markdown
[ERROR] Production validation failed

ROLLBACK INITIATED

Production has been rolled back to previous version.
Previous deployment: ${PREVIOUS_SHA}

Issues detected:
  ${VALIDATION_ISSUES}

Fix the issues and try shipping again:
  /ship
```

## Push Failure

```markdown
[ERROR] Push to remote failed

Possible causes:
1. Authentication issue: gh auth status
2. Remote branch protected: check branch protection rules
3. Out of date: git pull --rebase origin ${CURRENT_BRANCH}

Resolve and retry:
  /ship
```

## PR Creation Failure

```markdown
[ERROR] Failed to create PR

Possible causes:
1. Already exists: gh pr list --head ${CURRENT_BRANCH}
2. No commits: git log ${MAIN_BRANCH}..HEAD
3. Same branch: ensure not on ${MAIN_BRANCH}

Check existing PRs:
  gh pr list --state all --head ${CURRENT_BRANCH}
```

## Max Review Iterations Reached

```markdown
[ERROR] Max iterations (${MAX_ITERATIONS}) reached

Unable to resolve all review comments automatically.
Manual intervention required.

Remaining unresolved threads: ${UNRESOLVED_COUNT}

View PR: ${PR_URL}

Options:
1. Manually address remaining comments
2. Request reviewer to close non-blocking items
3. Continue with /ship after resolving
```

## Worktree Cleanup Failure

```markdown
[WARN] Failed to clean up worktree

Worktree at: ${WORKTREE_PATH}

Manual cleanup:
  git worktree remove ${WORKTREE_PATH} --force
  git worktree prune
```

## Force Push Safety

When rollback requires force push:

```bash
# ALWAYS use --force-with-lease instead of --force
# This prevents overwriting unexpected remote changes

if ! git push --force-with-lease origin $PROD_BRANCH; then
  echo "[ERROR] Force push failed - remote has unexpected changes"
  echo "Someone else may have pushed to production"
  echo "Manual investigation required"
  exit 1
fi
```

## Recovery Procedures

### Resume After CI Fix

```bash
# After fixing CI locally
git add .
git commit -m "fix: address CI failures"
git push

# Resume shipping
/ship
```

### Resume After Conflict Resolution

```bash
# After resolving merge conflicts
git add .
git commit
git push

# Resume shipping
/ship
```

### Resume After Manual Review Resolution

```bash
# After manually addressing review comments
git add .
git commit -m "fix: address review feedback"
git push

# Resume shipping
/ship
```

### Cancel and Cleanup

```bash
# If you need to abandon the PR
gh pr close $PR_NUMBER --delete-branch

# Clean up local
git checkout $MAIN_BRANCH
git branch -D $CURRENT_BRANCH
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - PR merged |
| 1 | General failure |
| 2 | CI failure (retryable) |
| 3 | Review timeout (manual intervention) |
| 4 | Deployment failure |
| 5 | Rollback triggered |

## Logging for Debugging

Enable verbose logging:

```bash
export SHIP_DEBUG=1
/ship
```

This will output detailed information about each phase for troubleshooting.
