# Management Consulting Plugin

28 commands and 9 skills for the full consulting engagement lifecycle — RFP teardown to project close-out.

> Built on the [Agent Skills](https://agentskills.io) open standard. Works with Claude Code, Cursor, Windsurf, Cline, GitHub Copilot, Gemini CLI, and [20+ other agents](https://agentskills.io).

## Why this exists

Consulting runs on structured thinking. MECE breakdowns, hypothesis trees, framework applications, governance cadences — these are repeatable patterns, not creative leaps. This plugin encodes those patterns so you spend less time on scaffolding and more time on the actual thinking.

It covers seven phases of engagement work:

**Win the work** — RFP analysis, proposals, SOWs, pitch decks
**Stand up the engagement** — kickoff, governance, stakeholder mapping
**Do the analysis** — frameworks, market research, financial modeling, due diligence
**Build the strategy** — options generation, business cases, roadmaps
**Plan the execution** — implementation, change management, org design, process improvement
**Deliver the artifacts** — presentations, reports, workshops, thought leadership
**Run the project** — status reports, risk registers, project close-out

Every command works standalone with web search and your own context. Connect MCP servers (Slack, Jira, Google Drive, etc.) and they get better.

## Install

### Claude Code

```bash
claude plugin marketplace add anotb/management-consulting-plugin
claude plugin install management-consulting
```

### Cursor / Windsurf / Cline / Other Agents

Clone into your project's skills directory:

```bash
git clone https://github.com/anotb/management-consulting-plugin.git .skills/management-consulting
```

## Commands

Slash commands for explicit workflows. Each one walks you through a structured process — ask questions, gather context, produce output.

### Business Development

| Command | What it does |
|---|---|
| `/rfp-analyze` | Tear apart an RFP — requirements, evaluation criteria, win themes, competitive positioning |
| `/proposal-develop` | Build a proposal with value prop, technical approach, team structure, pricing |
| `/sow-create` | Draft a Statement of Work — scope, deliverables, timeline, assumptions, exclusions |
| `/pitch-deck` | Structure a client pitch with storyline, key messages, and slide-by-slide outline |
| `/value-proposition` | Develop differentiated positioning against competitors |

### Engagement Initiation

| Command | What it does |
|---|---|
| `/kickoff` | Design a kickoff workshop — charter, objectives, ways of working, initial workplan |
| `/discovery` | Run a discovery phase — interview guides, data requests, synthesis templates |
| `/governance-setup` | Set up RACI, steering committee structure, decision rights, escalation paths |
| `/stakeholder-map` | Map stakeholders by influence and interest, build engagement strategies for each |

### Research & Analysis

| Command | What it does |
|---|---|
| `/framework-apply` | Apply consulting frameworks — 7S, Five Forces, SWOT, PESTLE, Value Chain, and more |
| `/market-analysis` | Industry sizing, competitive landscape, trend analysis, market entry assessment |
| `/financial-analysis` | Financial models, ROI calculations, sensitivity analysis, business case math |
| `/due-diligence` | Commercial, operational, or strategic due diligence with red flag identification |

### Strategy Development

| Command | What it does |
|---|---|
| `/options-generate` | Generate strategic options, define evaluation criteria, score and recommend |
| `/business-case` | Full investment business case — NPV, IRR, payback, risk-adjusted scenarios |
| `/roadmap-create` | Strategic roadmap with phases, milestones, dependencies, and resource requirements |

### Implementation

| Command | What it does |
|---|---|
| `/implementation-plan` | Detailed implementation plan — workstreams, owners, timelines, dependencies |
| `/change-plan` | Change management strategy — stakeholder impact, communications, training, resistance |
| `/process-improve` | Lean Six Sigma process analysis — current state, root cause, future state, control plan |
| `/org-design` | Organizational structure design — spans, layers, roles, reporting lines, transition plan |

### Deliverables

| Command | What it does |
|---|---|
| `/presentation-create` | Executive presentation — pyramid structure, storyline, exhibit design |
| `/report-generate` | Strategic report — findings, analysis, recommendations, appendices |
| `/workshop-facilitate` | Workshop design — objectives, agenda, exercises, facilitation guide, follow-up |
| `/thought-leadership` | POVs, white papers, case studies — research, structure, draft, and polish |

### Project Management

| Command | What it does |
|---|---|
| `/status-report` | Weekly/monthly status — progress, risks, decisions needed, next steps |
| `/risk-register` | Identify risks, assess likelihood and impact, define mitigations and owners |
| `/project-close` | Close-out — deliverable sign-off, lessons learned, knowledge transfer, transition |

### Commercial

| Command | What it does |
|---|---|
| `/pricing-model` | Pricing strategy — fixed fee, T&M, value-based, blended rate calculations |

## Skills

Skills are domain knowledge the agent uses automatically when it's relevant — you don't invoke these, they activate in context.

| Skill | What it knows |
|---|---|
| `problem-solving` | Hypothesis-driven problem solving, issue trees, MECE structuring |
| `strategic-frameworks` | 20+ frameworks — Porter's, BCG matrix, 7S, Blue Ocean, Ansoff, and more |
| `workshop-facilitation` | Design thinking, innovation sprints, ideation techniques, group facilitation |
| `executive-presentation` | Pyramid principle, top-down communication, C-suite storytelling |
| `financial-modeling` | ROI, NPV, DCF, IRR, sensitivity tables, scenario modeling |
| `change-management` | Kotter, ADKAR, resistance management, adoption curves, communications planning |
| `process-excellence` | Lean Six Sigma, value stream mapping, DMAIC, statistical process control |
| `project-governance` | RACI matrices, steering committees, stage gates, decision frameworks |
| `due-diligence` | Commercial DD, operational DD, integration planning, synergy estimation |

## Example Workflows

Commands are designed to chain together. Here's how they map to common engagement types.

### Strategy engagement

```
/kickoff Acme Corp Digital Strategy
```

Define the charter and governance, then work through:

```
/stakeholder-map → /discovery → /framework-apply → /market-analysis
→ /financial-analysis → /options-generate → /business-case → /roadmap-create
```

### Transformation program

```
/discovery Current state operations assessment for Acme Corp
```

Assess current state, then:

```
/org-design → /process-improve → /implementation-plan → /change-plan
→ /status-report (weekly) → /project-close
```

### Pursuit / BD

```
/rfp-analyze [paste RFP content]
```

Analyze the opportunity, then:

```
/proposal-develop → /sow-create → /pitch-deck → /pricing-model
```

## Works Standalone, Better With Tools

Everything works with just web search and what you tell the agent. Connect MCP servers and commands get access to real data.

| Capability | Standalone | With MCP integrations |
|---|---|---|
| Analysis | Web search + your input | Data warehouse, BI dashboards |
| Financial models | You describe assumptions | Excel files, financial databases |
| Presentations | You describe the content | PowerPoint, Google Slides |
| Market research | Web search | Industry databases, CRM data |
| Project management | You describe status | Jira, Confluence, project tools |

See [CONNECTORS.md](CONNECTORS.md) for integration details.

## Settings

Create `.claude/settings.local.json` in the plugin directory to set defaults:

```json
{
  "firm": {
    "name": "Your Firm",
    "methodology": "hypothesis-driven",
    "standard_frameworks": ["7S", "Five Forces", "SWOT"]
  },
  "engagement_defaults": {
    "pricing_model": "value-based",
    "reporting_format": "executive-summary"
  }
}
```

If these aren't set, commands will ask you interactively.

## Heads up

This plugin produces structured consulting outputs — frameworks, analyses, plans, deliverables. Everything should be reviewed by someone who knows the client context before it goes anywhere near a steering committee.

## License

[MIT](LICENSE)
