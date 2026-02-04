# Phase 2: Multi-Agent Review - Reference

This file contains detailed agent coordination for `/audit-project`.

**Parent document**: `audit-project.md`

**Review Pass Definitions**: See `orchestrate-review` skill for canonical pass definitions (core + conditional). This command uses the same review passes but detects signals from project structure (not just changed files).

## Agent Specialization

### File Filtering by Agent

Each agent reviews only relevant files:

| Agent | File Patterns |
|-------|--------------|
| code-quality-reviewer | All source files (includes error handling) |
| security-expert | Auth, validation, API endpoints, config |
| performance-engineer | Hot paths, algorithms, loops, queries |
| test-quality-guardian | Test files + missing-test signals |
| architecture-reviewer | Cross-module boundaries, core packages |
| database-specialist | Models, queries, migrations |
| api-designer | API routes, controllers, handlers |
| frontend-specialist | Components, state management |
| backend-specialist | Services, domain logic, queues |
| devops-reviewer | CI/CD configs, Dockerfiles |

## Review Queue File

Create a temporary review queue file in the platform state dir. Review passes append JSONL or return JSON for the parent to write.

```javascript
const path = require('path');
const fs = require('fs');
const { getPluginRoot } = require('@awesome-slash/lib/cross-platform');
const pluginRoot = getPluginRoot('audit-project');
if (!pluginRoot) { console.error('Error: Could not locate audit-project plugin root'); process.exit(1); }
const { getStateDirPath } = require(`${pluginRoot}/lib/platform/state-dir.js`);

const stateDirPath = getStateDirPath(process.cwd());
if (!fs.existsSync(stateDirPath)) {
  fs.mkdirSync(stateDirPath, { recursive: true });
}

function findLatestQueue(dirPath) {
  const files = fs.readdirSync(dirPath)
    .filter(name => name.startsWith('review-queue-') && name.endsWith('.json'))
    .map(name => ({
      name,
      fullPath: path.join(dirPath, name),
      mtime: fs.statSync(path.join(dirPath, name)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.fullPath || null;
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`Review queue unreadable: ${filePath}. Starting fresh.`);
    return null;
  }
}

const resumeRequested = typeof RESUME_MODE !== 'undefined' && RESUME_MODE === 'true';
let reviewQueuePath = resumeRequested ? findLatestQueue(stateDirPath) : null;

if (!reviewQueuePath) {
  reviewQueuePath = path.join(stateDirPath, `review-queue-${Date.now()}.json`);
}

if (!fs.existsSync(reviewQueuePath)) {
  const reviewQueue = {
    status: 'open',
    scope: { type: 'audit', value: SCOPE },
    passes: [],
    items: [],
    iteration: 0,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(reviewQueuePath, JSON.stringify(reviewQueue, null, 2), 'utf8');
} else if (resumeRequested) {
  const reviewQueue = safeReadJson(reviewQueuePath) || {
    status: 'open',
    scope: { type: 'audit', value: SCOPE },
    passes: [],
    items: [],
    iteration: 0,
    updatedAt: new Date().toISOString()
  };
  reviewQueue.status = 'open';
  reviewQueue.resumedAt = new Date().toISOString();
  reviewQueue.updatedAt = new Date().toISOString();
  fs.writeFileSync(reviewQueuePath, JSON.stringify(reviewQueue, null, 2), 'utf8');
}
```

## Agent Coordination

Use Task tool to launch agents in parallel:

```javascript
const agents = [];

const baseReviewPrompt = (passId, role, focus) => `Role: ${role}.

Scope: ${SCOPE}
Framework: ${FRAMEWORK}

Focus on:
${focus.map(item => `- ${item}`).join('\n')}

Write findings to ${reviewQueuePath} (append JSONL if possible). If you cannot write files, return JSON only.

Return JSON ONLY in this format:
{
  "pass": "${passId}",
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "critical|high|medium|low",
      "category": "${passId}",
      "description": "Issue description",
      "suggestion": "How to fix",
      "confidence": "high|medium|low",
      "falsePositive": false
    }
  ]
}`;

// Always active agents
agents.push(Task({
  subagent_type: "review",
  prompt: baseReviewPrompt('code-quality', 'code quality reviewer', [
    'Code style and consistency',
    'Best practices violations',
    'Potential bugs and logic errors',
    'Error handling and failure paths',
    'Maintainability issues',
    'Code duplication'
  ])
}));

agents.push(Task({
  subagent_type: "review",
  prompt: baseReviewPrompt('security', 'security reviewer', [
    'Auth/authz flaws',
    'Input validation and output encoding',
    'Injection risks (SQL/command/template)',
    'Secrets exposure and unsafe configs',
    'Insecure defaults'
  ])
}));

agents.push(Task({
  subagent_type: "review",
  prompt: baseReviewPrompt('performance', 'performance reviewer', [
    'N+1 queries and inefficient loops',
    'Blocking operations in async paths',
    'Hot path inefficiencies',
    'Memory leaks or unnecessary allocations'
  ])
}));

agents.push(Task({
  subagent_type: "review",
  prompt: baseReviewPrompt('test-coverage', 'test coverage reviewer', [
    'New code without corresponding tests',
    'Missing edge case coverage',
    'Test quality (meaningful assertions)',
    'Integration test needs',
    'Mock/stub appropriateness',
    HAS_TESTS ? 'Existing tests: verify coverage depth' : 'No tests detected: report missing tests'
  ])
}));

// Conditional agents
if (FILE_COUNT > 50) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('architecture', 'architecture reviewer', [
      'Module boundaries and ownership',
      'Dependency direction and layering',
      'Cross-layer coupling',
      'Consistency of patterns'
    ])
  }));
}

if (HAS_DB) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('database', 'database specialist', [
      'Query optimization and N+1 queries',
      'Missing indexes',
      'Transaction handling',
      'Migration safety'
    ])
  }));
}

if (HAS_API) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('api', 'api designer', [
      'REST best practices',
      'Error handling and status codes',
      'Rate limiting and pagination',
      'API versioning'
    ])
  }));
}

if (HAS_FRONTEND) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('frontend', 'frontend specialist', [
      'Component boundaries',
      'State management patterns',
      'Accessibility',
      'Render performance'
    ])
  }));
}

if (HAS_BACKEND) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('backend', 'backend specialist', [
      'Service boundaries',
      'Domain logic correctness',
      'Concurrency and idempotency',
      'Background job safety'
    ])
  }));
}

if (HAS_CICD) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('devops', 'devops reviewer', [
      'CI/CD safety',
      'Secrets handling',
      'Build/test pipelines',
      'Deploy config correctness'
    ])
  }));
}
```

## Finding Consolidation

After all agents complete:

```javascript
function consolidateFindings(agentResults) {
  const allFindings = [];

  for (const result of agentResults) {
    const pass = result.pass || 'unknown';
    const findings = Array.isArray(result.findings) ? result.findings : [];
    for (const finding of findings) {
      allFindings.push({
        id: `${pass}:${finding.file}:${finding.line}:${finding.description}`,
        pass,
        ...finding,
        status: finding.falsePositive ? 'false-positive' : 'open'
      });
    }
  }

  // Deduplicate by pass:file:line:description
  const seen = new Set();
  const deduped = allFindings.filter(f => {
    const key = `${f.pass}:${f.file}:${f.line}:${f.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  deduped.sort((a, b) => {
    const aRank = severityOrder[a.severity] ?? 99;
    const bRank = severityOrder[b.severity] ?? 99;
    return aRank - bRank;
  });

  // Update queue file
  const queueState = safeReadJson(reviewQueuePath) || {
    status: 'open',
    scope: { type: 'audit', value: SCOPE },
    passes: [],
    items: [],
    iteration: 0,
    updatedAt: new Date().toISOString()
  };
  queueState.items = deduped;
  queueState.passes = Array.from(new Set(deduped.map(item => item.pass)));
  queueState.updatedAt = new Date().toISOString();
  fs.writeFileSync(reviewQueuePath, JSON.stringify(queueState, null, 2), 'utf8');

  // Group by file
  const byFile = {};
  for (const f of deduped) {
    if (!byFile[f.file]) byFile[f.file] = [];
    byFile[f.file].push(f);
  }

  return {
    all: deduped,
    byFile,
    counts: {
      critical: deduped.filter(f => f.severity === 'critical' && !f.falsePositive).length,
      high: deduped.filter(f => f.severity === 'high' && !f.falsePositive).length,
      medium: deduped.filter(f => f.severity === 'medium' && !f.falsePositive).length,
      low: deduped.filter(f => f.severity === 'low' && !f.falsePositive).length
    }
  };
}
```

## Queue Cleanup

After fixes and re-review, remove the queue file if no open issues remain:

```javascript
const queueState = safeReadJson(reviewQueuePath);
if (!queueState) {
  return;
}
const openCount = queueState.items.filter(item => !item.falsePositive).length;
if (openCount === 0) {
  if (fs.existsSync(reviewQueuePath)) {
    try {
      fs.unlinkSync(reviewQueuePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
```

## Framework-Specific Patterns

### React Patterns

```javascript
const reactPatterns = {
  hooks_rules: {
    description: "React hooks must be called at top level",
    pattern: /use[A-Z]\w+\(/,
    context: "inside conditionals or loops"
  },
  state_management: {
    description: "Avoid prop drilling, use context or state management",
    pattern: /props\.\w+\.\w+\.\w+/
  },
  performance: {
    description: "Use memo/useMemo for expensive computations",
    pattern: /\.map\(.*=>.*\.map\(/
  }
};
```

### Express Patterns

```javascript
const expressPatterns = {
  error_handling: {
    description: "Express routes must have error handling",
    pattern: /app\.(get|post|put|delete)\(/,
    check: "next(err) in catch block"
  },
  async_handlers: {
    description: "Async handlers need try-catch or wrapper",
    pattern: /async\s*\(req,\s*res/
  }
};
```

### Django Patterns

```javascript
const djangoPatterns = {
  n_plus_one: {
    description: "Use select_related/prefetch_related",
    pattern: /\.objects\.(all|filter)\(\)/
  },
  raw_queries: {
    description: "Avoid raw SQL, use ORM",
    pattern: /\.raw\(|connection\.cursor\(\)/
  }
};
```

## Pattern Application

```javascript
function applyPatterns(findings, frameworkPatterns) {
  if (!frameworkPatterns) return findings;

  for (const pattern of Object.values(frameworkPatterns)) {
    // Check each finding against framework patterns
    for (const finding of findings) {
      if (pattern.pattern.test(finding.codeQuote)) {
        finding.frameworkContext = pattern.description;
      }
    }
  }

  return findings;
}
```

## Review Output Format

```markdown
## Agent Reports

### security-expert
**Files Reviewed**: X
**Issues Found**: Y (Z critical, A high)

Findings:
1. [Finding details with file:line]
2. [Finding details with file:line]

### performance-engineer
**Files Reviewed**: X
**Issues Found**: Y

Findings:
1. [Finding details with file:line]

[... per agent]

## Consolidated Summary

**Total Issues**: X
- Critical: Y (must fix)
- High: Z (should fix)
- Medium: A (consider)
- Low: B (nice to have)

**Top Files by Issue Count**:
1. src/api/users.ts: 5 issues
2. src/auth/session.ts: 3 issues
```
