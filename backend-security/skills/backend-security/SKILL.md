---
name: backend-security
description: Backend security audit, dependency/config scanning, and secure-coding guidance. Use when the user asks for a security audit or review of a backend, API, or server codebase, asks "is this secure" or "find vulnerabilities", wants dependencies, Dockerfiles, or CI configs scanned for security issues, or when writing or modifying backend authentication, authorization, API endpoints, database queries, file uploads, or secrets handling.
---

# Backend Security

You are performing defensive security work: finding and fixing vulnerabilities in code the user owns. Be precise, evidence-driven, and allergic to false positives — a report padded with speculative findings destroys trust.

## Pick a mode from how you were invoked

- **Audit** — "audit this backend", "find vulnerabilities", "security review the codebase" → run the full workflow below.
- **Scan** — "scan dependencies", "check the Docker/CI config" → run only Step 4.
- **Guide** — you are writing or modifying backend code (endpoints, auth, queries, uploads) → do not produce a report; build the code securely by following the relevant reference files, and briefly note the security decisions you made (e.g. "parameterized the query; added ownership check on the lookup").
- **Harden** — "secure this backend from scratch", "make this production-ready", "take this to enterprise grade" → read `references/roadmap.md` and run the phased zero→hardened engagement. Report phase-by-phase status against its ASVS exit criteria instead of the flat findings table. Use this when the goal is *building up* a baseline, not just *finding* what's broken.

Before anything else, read **Scope & limits** at the bottom of this file so you set honest expectations — this skill is one strong pillar of security, not a substitute for a professional audit, pentest, or compliance program.

## Step 1: Detect the stack

Check for manifests at the repo root (and in service subdirectories for monorepos):

| Manifest | Stack | Extra reference to read |
|---|---|---|
| `package.json` | Node.js / TypeScript | `references/nodejs.md` (always read for Node) |
| `requirements.txt`, `pyproject.toml`, `Pipfile` | Python | — |
| `go.mod` | Go | — |
| `pom.xml`, `build.gradle` | Java / Kotlin | — |
| `composer.json` | PHP | — |
| `Gemfile` | Ruby | — |
| `*.csproj` | .NET | — |

The general reference files apply to every stack; translate the grep patterns and idioms to the detected language. If multiple stacks exist (e.g. Node API + Python worker), cover each.

## Step 2: Map the attack surface (Audit mode)

Do not review file-by-file. Review **data flow: untrusted input → dangerous sink**. First build a map of:

1. **Entry points** — routes, controllers, GraphQL resolvers, webhook handlers, message consumers, cron jobs that read external data.
2. **The auth boundary** — which middleware/decorator enforces authentication, and which routes bypass it (intentionally or not).
3. **Sinks** — DB queries, shell/process execution, file reads/writes, outbound HTTP, template rendering, deserialization.
4. **Trust decisions** — every place the code reads a user id, role, tenant, or price/amount: does it come from the session/token (trusted) or from the request body/params (attacker-controlled)?

## Step 3: Domain review (Audit mode)

Read each reference file and hunt for its checks against the map from Step 2. Each file opens with **Coverage anchors** mapping its checks to OWASP Top 10 2021, ASVS 4.0, and CWE — cite these in findings so coverage is auditable:

1. `references/injection.md` — injection classes, SSRF, traversal, deserialization, uploads, open redirect
2. `references/auth.md` — authentication, password policy, sessions, JWT, access control, IDOR
3. `references/infra.md` — secrets, config, CORS, headers, rate limiting, TLS, data-at-rest, Docker, CI
4. `references/nodejs.md` — only when the stack is Node.js/TypeScript
5. `references/roadmap.md` — only in **Harden** mode (phased build-up, not a findings pass)

## Step 4: Dependency & config scan

Read `references/deps.md` and follow it: run the ecosystem's audit tool, check lockfile hygiene, and review Dockerfile/CI/env handling.

## Step 5: Verify before reporting

For every candidate finding:
- **Trace it**: confirm attacker-controlled data actually reaches the sink. Name the path (e.g. `req.query.path` → `resolveFile()` → `fs.readFile`).
- **Check reachability**: is the endpoint exposed? Behind auth? Dead code?
- **Check existing mitigations**: framework auto-escaping, ORM parameterization, validation middleware upstream. If mitigated, drop it or downgrade to hardening advice.
- If you cannot confirm exploitability but the pattern is dangerous, report it honestly as "needs verification" — never present speculation as fact.

## Severity rubric

- **Critical** — exploitable pre-auth with severe impact: SQL injection on a public endpoint, auth bypass, RCE, live production credentials committed to the repo.
- **High** — exploitable by an authenticated user or under realistic conditions: IDOR, weak/hardcoded JWT secret, stored XSS, SSRF to internal services.
- **Medium** — requires chaining or unusual conditions, or a meaningful hardening gap: missing rate limit on login, CORS reflecting Origin with credentials, verbose stack traces to clients.
- **Low** — defense-in-depth: missing security headers, missing cookie flags on non-sensitive cookies, outdated dep with no known reachable vuln.

## Report format (Audit and Scan modes)

```markdown
# Security Review — <repo/service name> (<date>)

**Scope:** <what was reviewed> · **Not reviewed:** <what was out of scope and why>

| # | Severity | Finding | Location |
|---|----------|---------|----------|

## Findings

### [SEC-1] <Title> — <Severity>
- **Location:** `path/file.ts:42`
- **Evidence:** <the vulnerable code and the input→sink path>
- **Impact:** <what an attacker gains, concretely>
- **Fix:** <ready-to-apply code>

## Hardening recommendations
<Low-severity / defense-in-depth items, briefly>
```

Finding nothing in a domain is a valid result — say "reviewed, no issues found", never invent findings to fill severity levels.

## Rules

- **Never apply fixes without approval.** Propose fix code in the report; edit files only after the user says to. Never commit.
- Every finding gets a `file:line` reference and real evidence from the code.
- Prefer fixing code over adding dependencies; suggest new security libraries only when hand-rolling would be worse (e.g. crypto, rate limiting).
- State clearly what you did **not** review (infrastructure you can't see, runtime config, third-party services).
- If the codebase is large, tell the user your prioritization (auth + payment + upload paths first) rather than silently sampling.

## Scope & limits

State these plainly to the user — overclaiming is the fastest way to give false confidence. This skill covers **one pillar** of security: the application code and repo-visible configuration.

**What it does well:** systematic source-level review of the vulnerability classes in the reference files, data-flow reasoning to cut false positives, live dependency scanning (delegated to `npm audit` / `pip-audit` / `osv-scanner` / `govulncheck`, so CVE data is always current), and a phased path to a strong ASVS L1–L2 application baseline.

**What it is not, and cannot replace:**
- **Not a SAST/DAST tool.** It is LLM-guided review: thorough but not exhaustive or provable. It does no runtime testing, fuzzing, or exploitation. On large codebases it prioritizes rather than covering every line — say so.
- **Not infrastructure or operations security.** It sees only what's in the repo — not your cloud IAM, network segmentation, WAF, secrets manager, or running config. It cannot set up monitoring, alerting, or 24/7 incident response.
- **Not a compliance or certification exercise.** It does not produce SOC 2 / ISO 27001 / PCI evidence, and it is **not a substitute for a professional penetration test or human security audit** before you stake real user data or money on it.
- **Static knowledge ages.** Library-specific advice reflects the author's knowledge cutoff; treat version-specific notes as prompts to verify against current advisories, not gospel.

The honest bottom line: this skill makes a backend meaningfully more secure and can build a solid baseline from zero — but "all checks pass" means *the application-layer baseline is strong*, not *this system is enterprise-certified secure*. Recommend a professional pentest and infra/ops review before high-stakes launch.
