# agentsys

Agent runtime and orchestration system for Claude Code, OpenCode, and Codex CLI. Bundles 12 plugins with 41 agents (31 file-based + 10 role-based) and 27 skills.

## Install

```bash
npm install -g agentsys
agentsys
```

## Commands

| Command | Description |
|---------|-------------|
| `/next-task` | Master workflow: task discovery, implementation, PR, merge |
| `/ship` | PR creation, CI monitoring, review loop, merge, deploy |
| `/enhance` | Run all code quality enhancement analyzers |
| `/audit-project` | Multi-agent code review (10 specialized agents) |
| `/perf` | Performance investigation with benchmarks and profiling |
| `/deslop` | Detect and clean AI-generated slop patterns |
| `/drift-detect` | Compare plan vs actual implementation |
| `/repo-map` | Generate AST-based repository map |
| `/sync-docs` | Update documentation to match code |
| `/learn` | Research topics online and create learning guides |
| `/agnix` | Lint agent configs (SKILL.md, CLAUDE.md, hooks, MCP) |
| `/consult` | Cross-tool AI consultation |

## Plugins

| Plugin | Agents | Skills | Purpose |
|--------|--------|--------|---------|
| next-task | 10 | 3 | Master workflow orchestration |
| audit-project | 10 | 0 | Multi-agent code review |
| enhance | 8 | 9 | Code quality analyzers |
| perf | 6 | 8 | Performance investigation |
| ship | 0 | 0 | PR creation and deployment |
| deslop | 1 | 1 | AI slop cleanup |
| drift-detect | 1 | 1 | Plan drift detection |
| repo-map | 1 | 1 | AST repo mapping |
| sync-docs | 1 | 1 | Documentation sync |
| learn | 1 | 1 | Topic research and learning |
| agnix | 1 | 1 | Agent config linting |
| consult | 1 | 1 | Cross-tool consultation |

## Cross-Platform

Works with Claude Code, OpenCode, and Codex CLI. Adapts state directories and platform detection automatically.

## Links

- [GitHub](https://github.com/avifenesh/agentsys)
- [npm](https://www.npmjs.com/package/agentsys)
- [MIT License](https://github.com/avifenesh/agentsys/blob/main/LICENSE)
