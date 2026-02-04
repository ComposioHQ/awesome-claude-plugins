# Cross-Platform Research: Claude Code, OpenCode, Codex CLI

Research compiled from official documentation and best practices guides.
This document informs the implementation in `index.js`.

## Sources

### Official Documentation
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [OpenCode CLI Documentation](https://opencode.ai/docs/)
- [Codex CLI Documentation](https://developers.openai.com/codex/)
- [Anthropic Claude 4 Best Practices](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)

### Community Guides
- [MCP Error Handling Best Practices](https://mcpcat.io/guides/error-handling-custom-mcp-servers/)
- [Claude Code Token Optimization](https://medium.com/@joe.njenga/claude-code-just-cut-mcp-context-bloat-by-46-9)
- [Agent Skills Specification](https://agentskills.io/)

---

## 1. Platform Comparison

| Feature | Claude Code | OpenCode | Codex CLI |
|---------|-------------|----------|-----------|
| MCP Config | `.mcp.json` | `opencode.json` | `config.toml` |
| State Dir | `.claude/` | `.opencode/` | `.codex/` |
| Instructions | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` |
| Command Prefix | `/` | `/` | `$` |
| Skill Format | Plugin `.md` | Command `.md` | `SKILL.md` |

---

## 2. MCP Server Best Practices

### Tool Schema Design

```javascript
// Good: Concise, flat, with enums
{
  name: 'task_discover',
  description: 'Find tasks from configured sources',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', enum: ['gh-issues', 'linear', 'tasks-md'] },
      limit: { type: 'number', description: 'Max tasks (default: 10)' }
    }
  }
}

// Bad: Verbose, nested
{
  name: 'discover_tasks_from_multiple_sources_with_filtering',
  description: 'This tool allows you to discover tasks from various sources...',
  inputSchema: {
    type: 'object',
    properties: {
      config: {
        type: 'object',
        properties: {
          sources: { type: 'object', properties: { ... } }
        }
      }
    }
  }
}
```

### Error Handling

Use `isError: true` for application errors, NOT JSON-RPC error codes:

```javascript
// Correct
return {
  content: [{ type: 'text', text: 'Error: GitHub CLI not found. Install: brew install gh' }],
  isError: true
};

// Wrong - don't throw
throw new Error('GitHub CLI not found');
```

### Token Efficiency

Research shows MCP tools can consume 50K+ tokens before conversations start.

Optimization strategies:
1. **Concise descriptions**: <100 chars
2. **Tool consolidation**: One tool with filter vs many similar tools
3. **Minimal responses**: JSON, not verbose text
4. **Defer loading**: Load tools on-demand (Claude Code 2025+)

---

## 3. Prompt Formatting

### Cross-Model Compatibility

| Model | Preference | Notes |
|-------|------------|-------|
| Claude | XML tags | Trained with XML, follows literally |
| GPT-4 | Markdown | Flexible interpretation |
| Both | Headers + XML | Best compatibility |

### Recommended Format

```markdown
## Section Title

<context>
Data block with XML tags for Claude compatibility
</context>

1. Numbered instructions
2. Clear steps

**Critical constraint repeated for emphasis**
```

### Lost in the Middle

Both Claude and GPT-4 recall information better from the START and END of prompts.

**Solution**: Put critical constraints at both locations.

---

## 4. State Management

### File Locations

| File | Location | Purpose |
|------|----------|---------|
| `flow.json` | `{state-dir}/` | Workflow phase, task, policy |
| `tasks.json` | `{state-dir}/` | Active worktree/task |
| `sources/preference.json` | `{state-dir}/` | Cached source preference |

### Design Principles

Keep state **simple and flat**:
- No history arrays (they grow unbounded)
- No nested objects (hard to update)
- No cached settings (stale quickly)

```javascript
// Good
{ "phase": "implementation", "task": { "id": "123" } }

// Bad
{ "history": [...hundreds of entries], "cache": { "settings": {...} } }
```

---

## 5. Tool Calling Differences

### Claude
- Higher accuracy (100% vs 81% in benchmarks)
- Interleaved thinking with tool use
- Proactive tool calling

### GPT-4
- More robust API (fewer errors)
- Better with complex parameters
- Lower cost per task

### Cross-Platform Recommendations

1. Define schemas explicitly
2. Include examples of valid calls
3. List tools explicitly with fallback message
4. Use flat parameter structures

---

## 6. Agent Prompt Template

```markdown
# Agent: {name}

## Role
{one-sentence description}

## Instructions
1. ALWAYS {critical constraint}
2. NEVER {prohibited action}
3. {specific step}

## Tools Available
- tool_1: description
- tool_2: description
If tool not listed, respond: "Tool not available"

## Output Format
<output>
{exact structure}
</output>

## Critical Constraints
{repeat most important - addresses Lost in Middle}
```

---

## 7. Configuration Examples

### OpenCode (`~/.config/opencode/opencode.json`)

```json
{
  "mcp": {
    "awesome-slash": {
      "type": "local",
      "command": ["node", "/path/to/mcp-server/index.js"],
      "environment": {
        "PLUGIN_ROOT": "/path/to/plugin",
        "AI_STATE_DIR": ".opencode"
      },
      "timeout": 10000,
      "enabled": true
    }
  }
}
```

### Codex CLI (`~/.codex/config.toml`)

```toml
[mcp_servers.awesome-slash]
command = "node"
args = ["/path/to/mcp-server/index.js"]
env = { PLUGIN_ROOT = "/path/to/plugin", AI_STATE_DIR = ".codex" }
enabled = true
```

### Claude Code (plugin system)

Uses marketplace installation or manual plugin setup.

---

## 8. Skills/Commands

### Codex SKILL.md Format

```yaml
---
name: skill-name
description: Description for implicit invocation (max 500 chars)
---
Skill instructions here.
```

### OpenCode Command Format

```yaml
---
description: Command description
agent: optional-agent
---
Prompt with $ARGUMENTS placeholder.
```

---

## Key Takeaways

1. **Use AI_STATE_DIR env var** for platform-aware state directories
2. **Keep tool descriptions under 100 chars** for token efficiency
3. **Return structured JSON** not verbose text
4. **Use isError: true** for application errors
5. **Put critical info at START and END** of prompts
6. **Test across platforms** - behavior differs
