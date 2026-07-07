# Harden Roadmap: Zero → Hardened Backend

Use this in **Harden mode** — when the user wants to take a backend with little or no security and build it up to a defensible baseline. Work the phases in order: each phase depends on the previous one being real, not aspirational. Every phase has **exit criteria** mapped to the OWASP Application Security Verification Standard (ASVS 4.0), so "done" is measurable rather than a vibe.

Realistic target: completing all six phases gets the **application layer** to roughly **ASVS Level 1 and much of Level 2**. That is a strong baseline — better than most early-stage products — but it is not the whole of "enterprise grade." See `../SKILL.md` → Scope & limits for what lives outside this roadmap (infra ops, monitoring/IR, compliance certification, pentesting).

How to run a phase: assess current state against the checklist, report the gaps ranked by the severity rubric, propose fixes, and apply them only after the user approves (same rules as audit mode). Don't advance to the next phase until the current phase's exit criteria hold.

---

## Phase 1 — Foundations & input validation
*Goal: nothing untrusted reaches a dangerous sink unvalidated; the app fails safe.*

- Every external input boundary (HTTP body/query/params, headers, webhooks, queue messages, uploaded files) has runtime schema validation — types, ranges, allowlists — not just compile-time types. See `injection.md` and `nodejs.md` (the TypeScript boundary note).
- No injection sinks reachable from user input: parameterized DB queries, no `eval`/dynamic code, `execFile` over shell strings, path traversal defended. Sweep every class in `injection.md`.
- Central error handler returns generic messages to clients; stack traces and internal errors go to server logs only.
- Body-size limits and basic payload caps set (pagination limits, JSON size) so a single request can't exhaust memory.

**Exit criteria (ASVS V5 Validation/Sanitization/Encoding, V7 Error Handling):** no unparameterized queries; no code-eval of input; all inputs validated at the boundary; errors don't leak internals.

## Phase 2 — Authentication
*Goal: identity is established securely and can't be trivially bypassed or brute-forced.*

- Passwords stored with bcrypt/argon2id/scrypt; verification via the library's constant-time compare. No plaintext, no fast hashes. (`auth.md`)
- Password policy: minimum length (≥8, prefer ≥12), reject known-breached/common passwords; no arbitrary composition rules that push users to weak patterns.
- Session management: server-side sessions or properly signed tokens; session ID regenerated on login (anti-fixation) and invalidated on logout and password change.
- Login, registration, password-reset, and OTP endpoints are rate-limited and lock out / back off on repeated failure. Identical errors and similar timing for unknown-user vs wrong-password (no enumeration).
- Password reset uses a CSPRNG token, stored hashed, single-use, short-lived; reset host not derived from the request `Host` header.

**Exit criteria (ASVS V2 Authentication, V3 Session Management):** strong hashing verified; sessions regenerate and expire; brute-force controls on all credential endpoints; no user enumeration.

## Phase 3 — Authorization & multi-tenancy
*Goal: authenticated users can act only on what they're entitled to.*

- Every route past the auth boundary has an explicit authorization decision; the list of intentionally public routes is reviewed and confirmed.
- Object-level authorization (no IDOR): every fetch/update/delete by an ID from the request is scoped to the caller (`{ id, ownerId: session.userId }` or an explicit ownership/tenant check after load). UUIDs are not authorization. (`auth.md`)
- Function-level authorization: admin/privileged routes check a server-side role that comes from the session/DB, never from the request body or a client-editable token claim.
- No privilege escalation via mass assignment: update endpoints use explicit field allowlists so `role`/`isAdmin`/`price` can't be set by the client. (`injection.md`)
- Multi-tenant apps derive tenant scope from the authenticated context, enforced centrally (scoped query helpers / row-level security), not per-query discipline.

**Exit criteria (ASVS V4 Access Control):** every ID-taking route ownership-checked; privileged routes role-checked server-side; no mass-assignment path to authorization fields.

## Phase 4 — Secrets & data protection
*Goal: secrets aren't in the repo, sensitive data is protected in transit and at rest.*

- No secrets in source, config, history, or client bundles; secrets come from env/secret manager. Anything ever committed is rotated, not just deleted. (`infra.md`)
- TLS everywhere: HTTPS enforced (HSTS), no disabled certificate verification anywhere in the codebase, including "internal" clients.
- Sensitive data at rest (PII such as SSN/DOB, financial data, tokens) is encrypted or tokenized; secrets and keys are managed, not hardcoded.
- Cookies carrying auth: `HttpOnly`, `Secure`, `SameSite`; responses with tokens/PII set `Cache-Control: no-store`. Logs scrubbed of passwords, tokens, PII. (`auth.md`, `infra.md`)

**Exit criteria (ASVS V6 Stored Cryptography, V8 Data Protection, V9 Communications):** no committed secrets; TLS enforced with verification on; sensitive data encrypted at rest; sensitive data kept out of logs.

## Phase 5 — Abuse resistance & configuration hardening
*Goal: the app resists automated abuse and ships with a locked-down configuration.*

- Rate limiting and payload/complexity limits on all expensive and abusable endpoints (auth, search, email/SMS senders, public writes, GraphQL depth). Correct client-IP handling behind proxies so limits can't be spoofed. (`infra.md`)
- Security headers set (helmet or equivalent): `nosniff`, HSTS, and CSP/`frame-ancestors` for any HTML. CORS uses an exact-match allowlist, never reflect-origin-with-credentials.
- Production config hardened: debug modes off, framework debuggers disabled, admin/metrics/health/introspection endpoints authenticated or not exposed, default credentials removed.
- ReDoS-safe input validation; dependency and container config hardened per `deps.md` (audit clean of known-reachable criticals, images non-root, no baked secrets).

**Exit criteria (ASVS V13 API/Web Service, V14 Configuration):** rate limits on abusable endpoints; security headers + strict CORS; no debug/admin surface exposed in prod; dependency audit triaged.

## Phase 6 — Observability & incident readiness
*Goal: security-relevant events are recorded, and there's a plan for when something goes wrong.*

- Security event logging: authentication (success/failure), authorization denials, privilege and password changes, data exports — with correlation IDs, no sensitive values, tamper-resistant storage.
- Monitoring/alerting on abuse signals (spikes in auth failures, 403s, error rates) — at least wired to a destination, even if basic.
- A written, minimal incident-response path: how a report is received, who rotates credentials, how users are notified. Dependency-update / patch cadence defined.
- Backups exist and restore is tested; secret-rotation procedure documented.

**Exit criteria (ASVS V7 Logging, plus operational readiness):** security events logged safely; an alerting destination exists; a documented IR and patch process is in place. *(This phase reaches into operations — the roadmap gets you to readiness; running it 24/7 is an ops function beyond the skill.)*

---

## Reporting a Harden engagement
Produce a phase-by-phase status: for each phase, `Met / Partial / Not met`, the specific gaps (with `file:line` and severity), and the prioritized fixes. Lead with the phase the backend is currently stuck at — that's where the next work goes. Restate the Scope & limits boundary so "all six phases met" is never mistaken for "certified enterprise-secure."
