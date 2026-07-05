# Agent Preflight

Run a lightweight repo-safety preflight before giving Claude Code shell/tool access in an unfamiliar repository.

## Use

From this awesome-claude-plugins checkout:

```bash
claude --plugin-dir ./agent-preflight
```

Then run the slash command in Claude Code:

```text
/agent-preflight /path/to/repo
```

The command asks Claude to run the free `agent_preflight_lite.py` scanner from the public source repo when it is available, then produce a Green / Yellow / Red handoff with:

- risk buckets found,
- files the agent should avoid,
- commands the agent must ask before running,
- safe first commands.

Source scanner and examples: <https://github.com/el-zachariah/ai-agent-safety-starter-pack>
