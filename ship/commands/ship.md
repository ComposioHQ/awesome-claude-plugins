---
description: Complete PR workflow from commit to production with validation
argument-hint: "[--strategy STRATEGY] [--skip-tests] [--dry-run] [--state-file PATH]"
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*), Bash(node:*), Read, Write, Edit, Glob, Grep, Task
---

# /ship - Complete PR Workflow

End-to-end workflow: commit - PR - CI - review - merge - deploy - validate - production.

Auto-adapts to your project's CI platform, deployment platform, and branch strategy.

---

<mandatory-steps>
## Mandatory Steps - No Shortcuts

Phase 4 (CI & Review Monitor Loop) is mandatory even when called from /next-task.

| Step | Requirement | Why It Matters |
|------|-------------|----------------|
| 3-minute initial wait | Must wait after PR creation | Auto-reviewers need time to analyze |
| Monitor loop iterations | Must run the full loop | Catches issues humans miss |
| Address all comments | Zero unresolved threads | Quality gate, blocks merge otherwise |

### Forbidden Actions
- Checking CI once and proceeding to merge
- Skipping the 3-minute initial wait for auto-reviewers
- Ignoring "minor" or "nit" comments
- Merging with unresolved comment threads
- Rationalizing "no comments yet means ready to merge"

### Required Verification Output

Before proceeding to merge, output:
```
[VERIFIED] Phase 4: wait=180s, iterations=N, unresolved=0
```
</mandatory-steps>

---

## Quick Reference

| Phase | Description | Details |
|-------|-------------|---------|
| 1-3 | Pre-flight, Commit, Create PR | This file |
| 4 | CI & Review Monitor Loop | See `ship-ci-review-loop.md` |
| 5 | Subagent Review (standalone) | This file |
| 6 | Merge PR | This file |
| 7-10 | Deploy & Validate | See `ship-deployment.md` |
| 11-12 | Cleanup & Report | This file |
| Errors | Error handling & rollback | See `ship-error-handling.md` |

## Integration with /next-task

When called from `/next-task` workflow (via `--state-file`):
- **SKIPS Phase 5** internal review agents (already done by Phase 9 review loop)
- **SKIPS deslop/docs** (already done by deslop-work, docs-updater)
- **Trusts** that all quality gates passed

**CRITICAL: Phase 4 ALWAYS runs** - even from /next-task. External auto-reviewers (Gemini, Copilot, CodeRabbit) comment AFTER PR creation and must be addressed.

When called standalone, runs full workflow including review.

## Arguments

Parse from $ARGUMENTS:
- **--strategy**: Merge strategy: `squash` (default) | `merge` | `rebase`
- **--skip-tests**: Skip test validation (dangerous)
- **--dry-run**: Show what would happen without executing
- **--state-file**: Path to workflow state file (for /next-task integration)

## State Integration

```javascript
const { getPluginRoot } = require('@awesome-slash/lib/cross-platform');
const pluginRoot = getPluginRoot('ship');
if (!pluginRoot) { console.error('Error: Could not locate ship plugin root'); process.exit(1); }

const args = '$ARGUMENTS'.split(' ');
const stateIdx = args.indexOf('--state-file');
let workflowState = null;
if (stateIdx >= 0) {
  workflowState = require(`${pluginRoot}/lib/state/workflow-state.js`);
}

function updatePhase(phase, result) {
  if (!workflowState) return;
  workflowState.startPhase(phase);
  if (result) workflowState.completePhase(result);
}
```

## Phase 1: Pre-flight Checks

```bash
# Detect platform and project configuration
PLUGIN_PATH=$(node -e "const { getPluginRoot, normalizePathForRequire } = require('@awesome-slash/lib/cross-platform'); const root = getPluginRoot('ship'); if (!root) { console.error('Error: Could not locate ship plugin root'); process.exit(1); } console.log(normalizePathForRequire(root));")
PLATFORM=$(node "$PLUGIN_PATH/lib/platform/detect-platform.js")
TOOLS=$(node "$PLUGIN_PATH/lib/platform/verify-tools.js")

# Extract critical info
CI_PLATFORM=$(echo $PLATFORM | jq -r '.ci')
DEPLOYMENT=$(echo $PLATFORM | jq -r '.deployment')
BRANCH_STRATEGY=$(echo $PLATFORM | jq -r '.branchStrategy')
MAIN_BRANCH=$(echo $PLATFORM | jq -r '.mainBranch')

# Check required tools
GH_AVAILABLE=$(echo $TOOLS | jq -r '.gh.available')
if [ "$GH_AVAILABLE" != "true" ]; then
  echo "ERROR: GitHub CLI (gh) required for PR workflow"
  exit 1
fi

# Determine workflow type
if [ "$BRANCH_STRATEGY" = "multi-branch" ]; then
  WORKFLOW="dev-prod"
  PROD_BRANCH="stable"
else
  WORKFLOW="single-branch"
fi
```

### Verify Git Status

```bash
# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  NEEDS_COMMIT="true"
else
  NEEDS_COMMIT="false"
fi

# Must be on feature branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "$MAIN_BRANCH" ]; then
  echo "ERROR: Cannot ship from $MAIN_BRANCH, must be on feature branch"
  exit 1
fi
```

### Dry Run Mode

If `--dry-run` provided, show plan and exit:
```markdown
## Dry Run: What Would Happen
**Branch**: ${CURRENT_BRANCH} → **Target**: ${MAIN_BRANCH}
**Workflow**: ${WORKFLOW} | **CI**: ${CI_PLATFORM} | **Deploy**: ${DEPLOYMENT}
```

## Phase 2: Commit Current Work

Only if `NEEDS_COMMIT=true`:

```bash
# Stage relevant files (exclude secrets)
git status --porcelain | awk '{print $2}' | grep -v '\.env' | xargs git add

# Generate semantic commit message
# Format: <type>(<scope>): <subject>
# Types: feat, fix, docs, refactor, test, chore

git commit -m "$(cat <<'EOF'
${COMMIT_MESSAGE}
EOF
)"

COMMIT_SHA=$(git rev-parse HEAD)
echo "[OK] Committed: $COMMIT_SHA"
```

## Phase 3: Create Pull Request

```bash
# Push to remote
git push -u origin $CURRENT_BRANCH

# Create PR
PR_URL=$(gh pr create \
  --base "$MAIN_BRANCH" \
  --title "$PR_TITLE" \
  --body "$(cat <<'EOF'
## Summary
- Bullet points of changes

## Test Plan
- How to test

## Related Issues
Closes #X
EOF
)")

PR_NUMBER=$(echo $PR_URL | grep -oP '/pull/\K\d+')
echo "[OK] Created PR #$PR_NUMBER: $PR_URL"
```

<phase-4>
## Phase 4: CI & Review Monitor Loop

**Blocking gate** - This phase is mandatory. Cannot proceed to merge without completing.

See `ship-ci-review-loop.md` for full implementation details.

### Summary

The monitor loop must:
1. Wait for CI to pass
2. Wait 3 minutes for auto-reviewers (mandatory on first iteration)
3. Address all comments (zero unresolved threads)
4. Iterate until clean

**Every comment must be addressed:**
- Critical/High issues: Fix immediately
- Medium/Minor issues: Fix (shows quality)
- Questions: Answer with explanation
- False positives: Reply explaining why, then resolve

Do not ignore comments. Do not leave comments unresolved.
Do not skip the 3-minute wait. Do not check CI once and merge.

### Loop Structure

```bash
MAX_ITERATIONS=10
INITIAL_WAIT=180  # 3 minutes - do not reduce or skip

iteration=0
while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo "[CI Monitor] Iteration $iteration"

  # 1. Wait for CI to complete
  wait_for_ci || { fix_ci_failures; continue; }

  # 2. First iteration must wait for auto-reviews
  if [ $iteration -eq 1 ]; then
    echo "Waiting ${INITIAL_WAIT}s for auto-reviewers..."
    sleep $INITIAL_WAIT
    echo "[DONE] Initial wait complete"
  fi

  # 3. Check feedback
  FEEDBACK=$(check_pr_feedback $PR_NUMBER)
  UNRESOLVED=$(echo "$FEEDBACK" | jq -r '.unresolvedThreads')

  echo "Unresolved threads: $UNRESOLVED"

  # 4. Exit only if zero unresolved
  if [ "$UNRESOLVED" -eq 0 ]; then
    echo "[OK] All comments resolved - ready to merge"
    break
  fi

  # 5. Address all feedback (see ship-ci-review-loop.md)
  address_all_feedback $PR_NUMBER

  # 6. Commit and push fixes
  commit_and_push_fixes "fix: address review feedback (iteration $iteration)"

  # 7. Wait before next iteration
  sleep 30
done

# Verification output - mandatory
echo "[VERIFIED] Phase 4: wait=180s, iterations=$iteration, unresolved=0"
```

### Forbidden Actions in Phase 4
- `sleep 0` or removing the initial wait
- Checking CI once without running the loop
- Breaking out of loop with unresolved comments
- Skipping to Phase 6 (merge) without verification output
</phase-4>

## Phase 5: Review Loop (Standalone Only)

**Skip if called from /next-task** (review already done).

```javascript
if (workflowState) {
  const state = workflowState.readState();
  const reviewPhase = state?.phases?.history?.find(p => p.phase === 'review-loop');
  if (reviewPhase?.result?.approved) {
    SKIP_REVIEW = true;  // Skip to Phase 6
  }
}
```

When running standalone, launch core review passes in parallel (error handling is part of code quality):

```javascript
const reviewPasses = [
  { id: 'code-quality', role: 'code quality reviewer' },
  { id: 'security', role: 'security reviewer' },
  { id: 'performance', role: 'performance reviewer' },
  { id: 'test-coverage', role: 'test coverage reviewer' }
];

// Add specialists based on repo signals (db, architecture, api, frontend, backend, devops)
// Then launch in parallel:
reviewPasses.map(pass => Task({
  subagent_type: "review",
  prompt: `Role: ${pass.role}. Review PR #${PR_NUMBER} and return JSON findings.`
}));
```

Iterate until no open (non-false-positive) issues remain (max 3 iterations if running standalone).

<phase-6>
## Phase 6: Merge PR

Pre-merge checks (do not skip):

```bash
# 1. Verify mergeable status
MERGEABLE=$(gh pr view $PR_NUMBER --json mergeable --jq '.mergeable')
[ "$MERGEABLE" != "MERGEABLE" ] && { echo "[ERROR] PR not mergeable"; exit 1; }

# 2. Verify all comments resolved (zero unresolved threads)
# Use separate gh calls for cleaner extraction (avoids cut parsing issues)
OWNER=$(gh repo view --json owner --jq '.owner.login')
REPO=$(gh repo view --json name --jq '.name')

# NOTE: Fetches first 100 threads. For PRs with >100 comment threads (rare),
# implement pagination using pageInfo.hasNextPage and pageInfo.endCursor.
# This covers 99.9% of PRs - pagination is left as a future enhancement.
UNRESOLVED=$(gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes { isResolved }
        }
      }
    }
  }
' -f owner="$OWNER" -f repo="$REPO" -F pr=$PR_NUMBER \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')

if [ "$UNRESOLVED" -gt 0 ]; then
  echo "[ERROR] Cannot merge: $UNRESOLVED unresolved comment threads"
  echo "Go back to Phase 4 and address all comments"
  exit 1
fi

echo "[OK] All comments resolved"

# 3. Merge with strategy (default: squash)
STRATEGY=${STRATEGY:-squash}
gh pr merge $PR_NUMBER --$STRATEGY --delete-branch

# Update local
git checkout $MAIN_BRANCH
git pull origin $MAIN_BRANCH

# Update repo-map if it exists (non-blocking)
node -e "const { getPluginRoot } = require('@awesome-slash/lib/cross-platform'); const pluginRoot = getPluginRoot('ship'); if (!pluginRoot) { console.log('Plugin root not found, skipping repo-map'); process.exit(0); } const repoMap = require(\`\${pluginRoot}/lib/repo-map\`); if (repoMap.exists(process.cwd())) { repoMap.update(process.cwd(), {}).then(() => console.log('[OK] Repo-map updated')).catch((e) => console.log('[WARN] Repo-map update failed: ' + e.message)); } else { console.log('Repo-map not found, skipping'); }" || true
MERGE_SHA=$(git rev-parse HEAD)
echo "[OK] Merged PR #$PR_NUMBER at $MERGE_SHA"
```
</phase-6>

## Phases 7-10: Deploy & Validate

**Skip if `WORKFLOW="single-branch"`**

See `ship-deployment.md` for platform-specific details:
- Phase 7: Deploy to Development (Railway, Vercel, Netlify)
- Phase 8: Validate Development (health checks, smoke tests)
- Phase 9: Deploy to Production (merge to prod branch)
- Phase 10: Validate Production (with auto-rollback on failure)

## Phase 11: Cleanup

```bash
# Clean up worktrees
git worktree list --porcelain | grep "worktree" | grep -v "$(git rev-parse --show-toplevel)" | while read -r wt; do
  WORKTREE_PATH=$(echo $wt | awk '{print $2}')
  git worktree remove $WORKTREE_PATH --force 2>/dev/null || true
done
```

### Close GitHub Issue (if applicable)

If the task came from a GitHub issue, close it with a completion comment:

```bash
if [ -n "$TASK_ID" ] && [ "$TASK_SOURCE" = "github" ]; then
  # Post completion comment
  gh issue comment "$TASK_ID" --body "$(cat <<'EOF'
[DONE] **Task Completed Successfully**

**PR**: #${PR_NUMBER}
**Status**: Merged to ${MAIN_BRANCH}
**Commit**: ${MERGE_SHA}

### Summary
- Implementation completed as planned
- All review comments addressed
- CI checks passed
- Merged successfully

---
_This issue was automatically processed by awesome-slash /next-task workflow._
_Closing issue as the work has been completed and merged._
EOF
)"

  # Close the issue
  gh issue close "$TASK_ID" --reason completed

  echo "[OK] Closed issue #$TASK_ID with completion comment"
fi
```

### Remove Task from Registry

```javascript
// Remove completed task from ${STATE_DIR}/tasks.json
if (workflowState) {
  const state = workflowState.readState();
  const mainRepoPath = state?.git?.mainRepoPath || process.cwd();
  const taskId = state?.task?.id;

  if (taskId) {
    const registryPath = path.join(mainRepoPath, '.claude', 'tasks.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registry.tasks = registry.tasks.filter(t => t.id !== taskId);
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    console.log(`[OK] Removed task #${taskId} from registry`);
  }
}
```

### Local Branch Cleanup

```bash
git checkout $MAIN_BRANCH
# Feature branch already deleted by --delete-branch
git branch -D $CURRENT_BRANCH 2>/dev/null || true
```

## Phase 12: Completion Report

```markdown
# Deployment Complete

## Pull Request
**Number**: #${PR_NUMBER} | **Status**: Merged to ${MAIN_BRANCH}

## Review Results
- Code Quality: [OK] | Error Handling: [OK] | Test Coverage: [OK] | CI: [OK]

## Deployments
${WORKFLOW === 'dev-prod' ?
  `Development: ${DEV_URL} [OK] | Production: ${PROD_URL} [OK]` :
  `Production: Deployed to ${MAIN_BRANCH}`}

[OK] Successfully shipped!
```

### Workflow Hook Response

After displaying the completion report, output JSON for the SubagentStop hook:

```json
{"ok": true, "nextPhase": "completed", "status": "shipped"}
```

This allows the `/next-task` workflow to detect that `/ship` completed successfully.

## Error Handling

See `ship-error-handling.md` for detailed error handling:
- GitHub CLI not available
- CI failures
- Merge conflicts
- Deployment failures
- Production validation failures with rollback

## Important Notes

- Requires GitHub CLI (gh) for PR workflow
- Auto-adapts to single-branch or multi-branch workflow
- Platform-specific CI and deployment monitoring
- Automatic rollback on production failures
- Respects project conventions (commit style, PR format)

Begin Phase 1 now.
