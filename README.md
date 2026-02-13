<h1 align="center">Awesome Claude Code Plugins</h1>

<p align="center">
<a href="https://platform.composio.dev?next_page=/settings/api-keys">
  <img width="1280" alt="Awesome Claude Plugins" src="./cover_image.png">
</a>
</p>

<p align="center">
  <a href="https://awesome.re">
    <img src="https://awesome.re/badge.svg" alt="Awesome" />
  </a>
  <a href="https://makeapullrequest.com">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" />
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT" />
  </a>
</p>

<div>
<p align="center">
  <a href="https://twitter.com/composio">
    <img src="https://img.shields.io/badge/Follow%20on%20X-000000?style=for-the-badge&logo=x&logoColor=white" alt="Follow on X" />
  </a>
  <a href="https://www.linkedin.com/company/composiohq/">
    <img src="https://img.shields.io/badge/Follow%20on%20LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="Follow on LinkedIn" />
  </a>
  <a href="https://discord.com/invite/composio">
    <img src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord" />
  </a>
</p>
</div>

<p align="center">
A curated list of production-ready plugins for Claude Code to supercharge your development workflow.
</p>

> **Want plugins that do more than generate text?** The [connect-apps](./connect-apps) plugin lets Claude send emails, create issues, post to Slack, and take actions across 500+ apps.

---

## Quickstart: Connect Claude to 500+ Apps

The **[connect-apps](./connect-apps)** plugin lets Claude perform real actions - send emails, create issues, post to Slack. It handles auth and connects to 500+ apps using Composio under the hood.

### 1. Clone & Run

```bash
git clone https://github.com/composio/awesome-claude-plugins.git
cd awesome-claude-plugins
claude --plugin-dir ./connect-apps
```

### 2. Run Setup

```shell
/connect-apps:setup
```

Paste your API key when asked. (Get a free key at [platform.composio.dev](https://platform.composio.dev?next_page=/settings/api-keys))

### 3. Try It

Ask Claude to send you a test email. If you receive it, Claude is now connected to 500+ apps.

**[See all supported apps →](https://composio.dev/tools)**

---

## Contents

- [What Are Claude Plugins?](#what-are-claude-plugins)
- [Plugins](#plugins)
  - [Integrations](#integrations)
  - [Frontend & Design](#frontend--design)
  - [Git & Version Control](#git--version-control)
  - [Code Quality & Testing](#code-quality--testing)
  - [Backend & Architecture](#backend--architecture)
  - [DevOps & Performance](#devops--performance)
  - [Documentation & Security](#documentation--security)
  - [Developer Productivity](#developer-productivity)
- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [Resources](#resources)
- [License](#license)

## What Are Claude Plugins?

Claude Plugins are extensions that enhance Claude Code with custom slash commands, specialized agents, hooks, and skills. Plugins can be shared across projects and teams, providing consistent tooling and workflows.

## Plugins

### Integrations

- [connect-apps](./connect-apps) - Connect Claude to any app. Send emails, create issues, post messages, update databases - take real actions across Gmail, Slack, GitHub, Notion, and 500+ services.

### Frontend & Design

- [frontend-design](./frontend-design) - Create distinctive, production-grade interfaces. Avoids generic "AI slop" with bold typography, unique color palettes, and creative layouts.
- [artifacts-builder](./artifacts-builder) - Suite of tools for creating elaborate, multi-component HTML artifacts using React, Tailwind CSS, and shadcn/ui.
- [theme-factory](./theme-factory) - Applies professional font and color themes to artifacts including slides, docs, reports, and HTML landing pages with 10 pre-set themes.
- [canvas-design](./canvas-design) - Creates beautiful visual art in PNG and PDF documents using design philosophy and aesthetic principles for posters and static pieces.
- [senior-frontend](./senior-frontend) - React/Next.js/TypeScript development patterns with bundle analysis, component generation, and accessibility best practices.
- [frontend-developer](./frontend-developer) - Frontend development specialist agent for building modern web interfaces.

### Git & Version Control

- [commit](./commit) - Creates smart git commits using conventional commit format with meaningful messages and emojis.
- [create-pr](./create-pr) - Automates pull request creation with proper templates, descriptions, and labels.
- [pr-review](./pr-review) - Comprehensive PR reviews with detailed feedback on code quality, security, and best practices.
- [changelog-generator](./changelog-generator) - Automatically creates user-facing changelogs from git commits by analyzing history and transforming technical commits into customer-friendly release notes.
- [ship](./ship) - Complete PR workflow from commit to production. Lint, test, review, and deploy.

### Code Quality & Testing

- [code-review](./code-review) - Comprehensive code review with best practices, patterns, and improvement suggestions.
- [test-writer-fixer](./test-writer-fixer) - Automatically write and fix unit tests. Supports Jest, Vitest, Pytest, and more.
- [debugger](./debugger) - Advanced debugging assistant for tracking down and fixing complex bugs.
- [bug-fix](./bug-fix) - Analyzes stack traces and code to identify and fix bugs in your codebase.

### Backend & Architecture

- [backend-architect](./backend-architect) - Backend architecture patterns, API design, database schemas, and system design.
- [mcp-builder](./mcp-builder) - Guides creation of high-quality MCP (Model Context Protocol) servers for integrating external APIs and services with LLMs.
- [agent-sdk-dev](./agent-sdk-dev) - Claude Agent SDK development helper for building custom AI agents.

### DevOps & Performance

- [perf](./perf) - Performance analysis and optimization. Identify bottlenecks and improve speed.
- [audit-project](./audit-project) - Full project audit for code quality, dependencies, security, and best practices.

### Documentation & Security

- [documentation-generator](./documentation-generator) - Generate comprehensive documentation from code. READMEs, API docs, and guides.
- [security-guidance](./security-guidance) - Security best practices and vulnerability detection. OWASP guidelines and secure coding.

### Developer Productivity

- [developer-growth-analysis](./developer-growth-analysis) - Analyzes your recent Claude Code chat history to identify coding patterns, development gaps, and curates personalized learning resources.
- [management-consulting](./management-consulting) - 28 commands and 9 skills for the full consulting engagement lifecycle. RFP analysis, strategic frameworks (Porter's, 7S, SWOT, BCG), financial modeling, implementation planning, and executive deliverables.

## Getting Started

### Using Plugins

Clone the repo and run Claude with any plugin:

```bash
git clone https://github.com/composio/awesome-claude-plugins.git
cd awesome-claude-plugins
claude --plugin-dir ./commit
```

Load multiple plugins at once:

```bash
claude --plugin-dir ./commit --plugin-dir ./code-review --plugin-dir ./connect-apps
```

### Plugin Structure

Each plugin follows the standard Claude Code plugin format:

```
plugin-name/
├── .claude-plugin/
│   └── plugin.json       # Plugin metadata
├── skills/               # Skill definitions (optional)
│   └── skill-name/
│       └── SKILL.md
├── commands/             # Slash commands (optional)
│   └── command.md
├── agents/               # Agent definitions (optional)
│   └── agent.md
└── hooks/                # Event hooks (optional)
    └── hooks.json
```

## Contributing

Want to add your plugin?

1. Fork this repository
2. Add your plugin folder with the standard structure
3. Update this README with your plugin details
4. Submit a pull request

Please ensure your plugin:
- Addresses a real use case
- Doesn't duplicate existing functionality
- Follows the template structure
- Has been tested

## Resources

- [Claude Code Documentation](https://code.claude.com/docs)
- [Plugin Development Guide](https://code.claude.com/docs/en/plugins)
- [Discover Plugins](https://code.claude.com/docs/en/discover-plugins)
- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) - More skills and resources

## License

MIT - See individual plugins for their specific licenses.
