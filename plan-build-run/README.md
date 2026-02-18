# Plan-Build-Run

Context-engineered development workflow for Claude Code. Solves context rot through
disciplined subagent delegation, structured planning, atomic execution, and
goal-backward verification.

## What it does

- Keeps orchestrator at ~15% context by delegating to fresh subagent windows
- 21 `/pbr:*` slash commands (begin, plan, build, review, debug, resume, etc.)
- 10 specialized agents with configurable model profiles
- 15 lifecycle hooks enforcing commit format, context budget, plan compliance
- Wave-based parallel execution with atomic commits
- Kill-safe: all state lives on disk in `.planning/`

## Install

```bash
claude plugin marketplace add SienkLogic/plan-build-run
claude plugin install pbr@plan-build-run
```

## Links

- **Repository**: https://github.com/SienkLogic/plan-build-run
- **Wiki**: https://github.com/SienkLogic/plan-build-run/wiki
- **License**: MIT
