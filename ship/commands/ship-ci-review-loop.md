<ci-review-loop>
# Phase 4: CI & Review Monitor Loop - Reference

This file contains detailed implementation for the CI & Review Monitor Loop phase of `/ship`.

**Parent document**: `ship.md`

---

<mandatory-requirements>
## This Phase Is Mandatory

This is not optional. You must:
1. Wait the full 3 minutes for auto-reviewers
2. Run the monitor loop (not just check once)
3. Address all comments before merge
</mandatory-requirements>

---

<pr-auto-review>
## PR Auto-Review Process

PRs receive automatic reviews from configured auto-reviewers (Copilot, Gemini, CodeRabbit, etc.).

**Mandatory workflow:**
1. After PR creation, wait **at least 3 minutes** for first review round
2. Read **all comments** from all reviewers
3. Address **every comment** - no exceptions
4. Iterate until **zero unresolved threads** (typically 2-4 rounds)

**Rules:**
- Always address all comments, including "minor" or "nit" suggestions
- Do not skip a comment unless factually wrong or user-approved
- Treat all feedback as **required changes**, not suggestions
</pr-auto-review>

---

<overview>
## Overview

The monitor loop must wait for:
1. CI to pass
2. All comments resolved (addressed or replied to)
3. No "changes requested" reviews remain

## Why All Comments Matter

**Every comment must be addressed:**
- Critical/High issues: Fix immediately
- Medium issues: Fix (don't defer)
- Minor/Nit issues: Fix (shows attention to quality)
- Style suggestions: Fix (maintains codebase consistency)
- Questions: Answer with explanation
- False positives: Reply explaining why, then resolve
- Not relevant: Reply explaining why, then resolve

Do not ignore comments. Do not leave comments unresolved. A clean PR has zero unresolved conversations.
</overview>

## The Monitor Loop Algorithm

> **Note:** The JavaScript below is **conceptual pseudocode** showing the algorithm flow.
> Implement using bash functions defined in this file.

```javascript
const MAX_ITERATIONS = 10;  // Safety limit
const INITIAL_WAIT_MS = 180000;  // 3 minutes - wait for auto-reviews
const ITERATION_WAIT_MS = 30000;  // 30 seconds between iterations
let iteration = 0;

while (iteration < MAX_ITERATIONS) {
  iteration++;
  console.log(`\n## CI & Review Monitor - Iteration ${iteration}`);

  // Step 1: Wait for CI to complete
  const ciStatus = await waitForCI();
  if (ciStatus === 'failed') {
    await fixCIFailures();
    continue;  // Push fix, re-run CI
  }

  // Step 1.5: First iteration only - wait for auto-reviews
  if (iteration === 1) {
    console.log("Waiting 3 minutes for auto-reviews...");
    await sleep(INITIAL_WAIT_MS);
  }

  // Step 2: Check for PR comments and reviews
  const feedback = await checkPRFeedback();

  if (feedback.unresolvedCount === 0 && !feedback.changesRequested) {
    console.log("[OK] CI passed, all comments resolved");
    break;  // Ready to merge!
  }

  // Step 3: Address ALL feedback
  await addressAllFeedback(PR_NUMBER);

  // Step 4: Push fixes
  if (feedback.hasCodeChanges) {
    await commitAndPush(`fix: address review feedback (iteration ${iteration})`);
  }

  // Step 5: Sleep before next check
  await sleep(ITERATION_WAIT_MS);
}
```

## Step 1: Wait for CI

```bash
wait_for_ci() {
  echo "Waiting for CI checks..."

  while true; do
    CHECKS=$(gh pr checks $PR_NUMBER --json name,state 2>/dev/null || echo "[]")

    PENDING=$(echo "$CHECKS" | jq '[.[] | select(.state | IN("PENDING", "QUEUED", "IN_PROGRESS"))] | length')
    FAILED=$(echo "$CHECKS" | jq '[.[] | select(.state | IN("FAILURE", "CANCELLED"))] | length')
    PASSED=$(echo "$CHECKS" | jq '[.[] | select(.state=="SUCCESS")] | length')

    if [ "$FAILED" -gt 0 ]; then
      echo "[ERROR] CI failed ($FAILED checks)"
      gh pr checks $PR_NUMBER
      return 1
    elif [ "$PENDING" -eq 0 ] && [ "$PASSED" -gt 0 ]; then
      echo "[OK] CI passed ($PASSED checks)"
      return 0
    elif [ "$PENDING" -eq 0 ] && [ "$PASSED" -eq 0 ]; then
      echo "[WARN] No CI checks found, proceeding..."
      return 0
    fi

    echo "  Waiting... ($PENDING pending, $PASSED passed)"
    sleep 15
  done
}
```

## Step 2: Check PR Feedback

```bash
check_pr_feedback() {
  local pr_number=$1

  echo "Checking PR feedback..."

  # Extract owner and repo from git remote
  REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"')
  OWNER=$(echo "$REPO_INFO" | cut -d'/' -f1)
  REPO=$(echo "$REPO_INFO" | cut -d'/' -f2)

  # Get review state
  REVIEWS=$(gh pr view $pr_number --json reviews --jq '.reviews')
  CHANGES_REQUESTED=$(echo "$REVIEWS" | jq '[.[] | select(.state=="CHANGES_REQUESTED")] | length')

  # Get unresolved review threads
  # NOTE: Fetches first 100 threads. For PRs with >100 threads, implement pagination.
  UNRESOLVED_THREADS=$(gh api graphql -f query='
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              isResolved
            }
          }
        }
      }
    }
  ' -f owner="$OWNER" -f repo="$REPO" -F pr=$pr_number \
    --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')

  echo "  Unresolved threads: $UNRESOLVED_THREADS"
  echo "  Changes requested: $CHANGES_REQUESTED"

  echo "{\"unresolvedThreads\": $UNRESOLVED_THREADS, \"changesRequested\": $CHANGES_REQUESTED}"
}
```

### Get Full Thread Details

```bash
get_unresolved_threads() {
  local pr_number=$1

  REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"')
  OWNER=$(echo "$REPO_INFO" | cut -d'/' -f1)
  REPO=$(echo "$REPO_INFO" | cut -d'/' -f2)

  # NOTE: Fetches first 100 threads. For PRs with >100, implement pagination.
  gh api graphql -f query='
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              path
              line
              diffHunk
              comments(first: 1) {
                nodes {
                  id
                  body
                }
              }
            }
          }
        }
      }
    }
  ' -f owner="$OWNER" -f repo="$REPO" -F pr=$pr_number \
    --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
}
```

## Step 3: Address ALL Feedback

> **Note:** This is **conceptual pseudocode** showing the algorithm flow.
> Implement using: gh api, Read, Edit, Task (ci-fixer), etc.

```javascript
async function addressAllFeedback(prNumber) {
  const threads = await getUnresolvedThreads(prNumber);

  console.log(`\nAddressing ${threads.length} unresolved threads...`);

  for (const thread of threads) {
    console.log(`\n--- Thread: ${thread.path}:${thread.line} ---`);
    const analysis = analyzeComment(thread);

    switch (analysis.type) {
      case 'code_fix_required':
        console.log(`Action: Fixing code issue`);
        await implementFix(thread);  // Use Task(ci-fixer) or Edit tool
        break;

      case 'style_suggestion':
        console.log(`Action: Applying style fix`);
        await implementFix(thread);
        break;

      case 'question':
        console.log(`Action: Answering question`);
        await replyToComment(prNumber, thread.commentId, generateAnswer(thread));
        await resolveThread(thread.id);
        break;

      case 'false_positive':
        console.log(`Action: Explaining false positive`);
        await replyToComment(prNumber, thread.commentId,
          `This is a false positive because: ${analysis.reason}\n\n` +
          `Resolving. Please reopen if you disagree.`
        );
        await resolveThread(thread.id);
        break;

      case 'not_relevant':
        console.log(`Action: Explaining out of scope`);
        await replyToComment(prNumber, thread.commentId,
          `Outside scope of this PR: ${analysis.reason}\n\n` +
          `Resolving. Please reopen if needed.`
        );
        await resolveThread(thread.id);
        break;

      case 'already_addressed':
        console.log(`Action: Confirming addressed`);
        await replyToComment(prNumber, thread.commentId,
          `Addressed in commit ${gitRevParseHead}.`
        );
        await resolveThread(thread.id);
        break;
    }
  }

  // Request re-review from those who requested changes
  const changesRequestedReviews = await getChangesRequestedReviews(prNumber);
  for (const review of changesRequestedReviews) {
    await requestReReview(prNumber, review.author);
  }
}
```

## Comment Analysis Heuristics

> **Note:** Classification heuristics for comment handling.

```javascript
function analyzeComment(thread) {
  const body = thread.body.toLowerCase();

  // Question patterns
  if (body.includes('?') || body.startsWith('why') || body.startsWith('how') ||
      body.startsWith('what') || body.startsWith('could you explain')) {
    return { type: 'question', reason: 'Comment is a question' };
  }

  // Style/nit patterns
  if (body.includes('nit:') || body.includes('nitpick') || body.includes('minor:') ||
      body.includes('style:') || body.includes('consider') || body.includes('optional')) {
    return { type: 'style_suggestion', reason: 'Style or minor suggestion' };
  }

  // Out of scope patterns
  if (!thread.diffHunk || commentRefersToUnchangedCode(thread)) {
    return { type: 'not_relevant', reason: 'Comment refers to unchanged code' };
  }

  // Default: treat as code fix required
  return { type: 'code_fix_required', reason: 'Valid code feedback' };
}
```

## Implementing Fixes

Use the ci-fixer agent for code changes:

```javascript
Task({
  subagent_type: "next-task:ci-fixer",
  prompt: `Fix the following review comment:

**File**: ${thread.path}
**Line**: ${thread.line}
**Comment**: ${thread.body}
**Code Context**:
\`\`\`
${thread.diffHunk}
\`\`\`

Requirements:
1. Make the minimal change to address the feedback
2. Do NOT over-engineer or add unrelated changes
3. Ensure tests still pass after the fix`
});
```

## Resolving Threads

```bash
resolve_thread() {
  local thread_id=$1

  gh api graphql -f query='
    mutation($threadId: ID!) {
      resolveReviewThread(input: {threadId: $threadId}) {
        thread {
          isResolved
        }
      }
    }
  ' -f threadId="$thread_id"
}

reply_to_comment() {
  local pr_number=$1
  local comment_id=$2
  local body=$3

  REPO_INFO=$(gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"')
  OWNER=$(echo "$REPO_INFO" | cut -d'/' -f1)
  REPO=$(echo "$REPO_INFO" | cut -d'/' -f2)

  gh api -X POST "repos/$OWNER/$REPO/pulls/$pr_number/comments" \
    -f body="$body" \
    -F in_reply_to="$comment_id"
}
```

## Step 4: Commit and Push

```bash
commit_and_push_fixes() {
  local message=$1
  local branch=${2:-$(git branch --show-current)}

  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "$message"
    git push origin "$branch"
    echo "[OK] Pushed fixes"
    return 0
  else
    echo "No code changes to commit (only comment replies)"
    return 1
  fi
}
```

## Complete Loop Script

```bash
#!/bin/bash
# Phase 4: CI & Review Monitor Loop

MAX_ITERATIONS=10
INITIAL_WAIT=${SHIP_INITIAL_WAIT:-180}  # Configurable via env var
ITERATION_WAIT=30
iteration=0

while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo "[CI Monitor] Iteration $iteration"

  # Step 1: Wait for CI
  if ! wait_for_ci; then
    echo "CI failed - launching ci-fixer agent..."
    continue
  fi

  # Step 1.5: First iteration - wait for auto-reviews
  if [ $iteration -eq 1 ] && [ "$INITIAL_WAIT" -gt 0 ]; then
    echo "First iteration - waiting ${INITIAL_WAIT}s for auto-reviews..."
    sleep $INITIAL_WAIT
  fi

  # Step 2: Check feedback
  FEEDBACK=$(check_pr_feedback $PR_NUMBER)
  UNRESOLVED=$(echo "$FEEDBACK" | jq -r '.unresolvedThreads')
  CHANGES_REQ=$(echo "$FEEDBACK" | jq -r '.changesRequested')

  if [ "$UNRESOLVED" -eq 0 ] && [ "$CHANGES_REQ" -eq 0 ]; then
    echo "[OK] ALL CHECKS PASSED"
    echo "[OK] ALL COMMENTS RESOLVED"
    echo "Ready to merge!"
    break
  fi

  # Step 3: Address all feedback
  echo "Addressing $UNRESOLVED unresolved threads..."

  # Step 4: Commit and push
  commit_and_push_fixes "fix: address review feedback (iteration $iteration)"

  # Step 5: Wait before next iteration
  echo "Waiting ${ITERATION_WAIT}s..."
  sleep $ITERATION_WAIT
done

if [ $iteration -ge $MAX_ITERATIONS ]; then
  echo "[ERROR] Max iterations reached - manual intervention required"
  exit 1
fi
```

<iteration-summary>
## Iteration Summary Output

```markdown
## Iteration ${iteration} Summary

**CI Status**: [OK] Passed
**Comments Addressed**: ${addressedCount}
  - Code fixes: ${codeFixCount}
  - Answered questions: ${questionCount}
  - Resolved as not applicable: ${notApplicableCount}
**Remaining Unresolved**: ${remainingCount}

${remainingCount > 0 ? 'Continuing...' : 'Ready to merge!'}
```
</iteration-summary>
</ci-review-loop>
