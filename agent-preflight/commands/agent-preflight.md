---
description: Run a lightweight repo-safety preflight before Claude Code gets shell/tool access
argument-hint: [repo-path]
---

You are preparing to work in a repository with Claude Code or another local AI coding agent.

Target repository path: `$ARGUMENTS` (if blank, use the current working directory).

Before installing dependencies, running package scripts, editing agent config, or executing shell commands:

1. Resolve the target path and confirm it is the repository you are about to work in.
2. If the free scanner is present in the workspace, run:

   ```bash
   python3 agent_preflight_lite.py "$ARGUMENTS" --json
   ```

   If `$ARGUMENTS` is blank, use `.` instead.
3. If the scanner script is not present, fetch or inspect the free source repo first: `https://github.com/el-zachariah/ai-agent-safety-starter-pack`.
4. Convert findings into a Green / Yellow / Red decision:
   - Green: 0-1 low-risk buckets; continue with normal review discipline.
   - Yellow: 2-3 buckets; write may-run / must-ask / must-not-touch rules before tool use.
   - Red: 4+ buckets, secret-adjacent files, destructive shell, or agent/MCP config; stop and add guardrails before tool use.
5. Produce a short handoff note with:
   - risk buckets found,
   - files the agent should not touch,
   - commands the agent must ask before running,
   - safe first commands to run.
6. Do not run package scripts, install hooks, edit credentials, or mutate CI until the handoff note exists.
