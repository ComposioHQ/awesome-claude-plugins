# Secrets, Configuration & API Hardening

**Coverage anchors** — OWASP Top 10 2021: A05 Security Misconfiguration, A02 Cryptographic Failures, A09 Security Logging & Monitoring Failures, A07 (rate limiting). ASVS 4.0: V7 (Error Handling & Logging), V8 (Data Protection), V9 (Communications), V14 (Configuration). CWE: 798, 16, 209, 532, 942, 693, 319, 311.

## Hardcoded secrets

Hunt in source, config, tests, and scripts:
- Patterns: `AKIA[0-9A-Z]{16}` (AWS), `-----BEGIN (RSA |EC )?PRIVATE KEY`, `ghp_`/`gho_` (GitHub), `sk_live_`/`sk-` (Stripe/OpenAI), `xox[bp]-` (Slack), `eyJhbGci` (embedded JWTs), connection strings with credentials (`postgres://user:pass@`, `mongodb+srv://`), `password\s*[:=]\s*['"][^'"]+`, `api[_-]?key\s*[:=]`
- `.env` files: confirm they're in `.gitignore` AND check history — `git log --all --oneline -- .env` (gitignore doesn't remove already-committed files). A secret ever committed is compromised: the fix is **rotate**, not just delete.
- Secrets in test fixtures and example files pointing at real services; secrets logged at startup ("config dump" logs); secrets in client-delivered code (Next.js `NEXT_PUBLIC_`, Vite `VITE_` — these are public by design).

## Dangerous configuration

- Debug mode in production paths: Django `DEBUG=True`, Flask `debug=True` (Werkzeug debugger = RCE), Express `NODE_ENV` not production, GraphQL introspection + playground exposed in prod.
- Default/weak credentials in docker-compose, seeds, or admin bootstrap code.
- Admin/metrics/health endpoints (`/admin`, `/metrics`, `/actuator`, `/debug/pprof`, `/graphql`) exposed without auth. Spring Actuator and pprof are frequent real-world breaches.
- TLS verification disabled: `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `verify=False` (requests), `InsecureSkipVerify: true` — flag every one, including in "internal" clients.

## CORS

- `Access-Control-Allow-Origin: *` combined with `Allow-Credentials: true` (browsers block it, but reflecting the request's `Origin` header with credentials is the same hole and does work). Hunt: origin callbacks that `return callback(null, true)` for any origin.
- Origin validation by substring/`startsWith` (`https://myapp.com.evil.com` passes). Use exact-match allowlists.
- `null` origin allowed (sandboxed iframes can send it).

## Security headers & responses

For APIs: `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, correct `Content-Type` on every response, `Cache-Control: no-store` on responses carrying tokens or personal data. For server-rendered HTML additionally: CSP, `frame-ancestors` (clickjacking). One-line wins: `helmet` (Express), `SecurityMiddleware` (Django).

## Rate limiting & abuse

- Required on: login, registration, password reset, OTP, anything sending email/SMS (cost + flooding), expensive queries, public write endpoints.
- Keying: per-IP alone fails behind shared NATs and against botnets — sensitive flows need per-account too. If behind a proxy, the app must use the right client-IP header *and* trust only the proxy for it (spoofable `X-Forwarded-For` = rate-limit bypass).
- Payload limits: JSON body size caps (`express.json({limit})`), pagination caps (`?limit=1000000`), GraphQL depth/complexity limits, regex on user input checked for ReDoS.

## Error handling & logging

- Stack traces, SQL errors, or framework debug pages returned to clients: information disclosure — return generic errors, log details server-side with a correlation ID.
- Logs must not contain: passwords (watch "log the whole request body" middleware), tokens/API keys, full card numbers, session IDs. Check what the HTTP client/ORM logs at debug level in production.
- Log injection: user input logged raw can forge lines via `\n` — encode or strip newlines in logged user data.
- Missing audit logging on security events (login, failed login, permission change, data export) — worth a hardening note.

## Sensitive data at rest

- Regulated / high-value data — SSN, national ID, date of birth, financial account and routing numbers, health data, government IDs, auth tokens — stored **plaintext** in the DB is a Cryptographic Failure (OWASP A02). Flag columns/fields holding this data with no encryption or tokenization.
- Encrypt with a vetted authenticated cipher (AES-GCM) using keys from a KMS/secret manager, or tokenize via a dedicated service — never a hardcoded key in the repo, and never a home-rolled scheme. Reused/static IVs and ECB mode are findings in themselves.
- Data minimization first: if you don't need to store it (e.g. full card PAN — that's PCI scope), don't. Hash where you only ever need to compare, encrypt where you must read it back.
- Hunt: model/schema definitions and `INSERT`/`update` calls writing `ssn`, `dob`, `taxId`, `bankAcc`, `routing`, `cardNumber`, `mrn` as raw strings; confirm an `encrypt(...)` / KMS call wraps them.

## Dockerfile

- Runs as root (no `USER` directive) — container escape blast radius.
- Secrets via `ARG`/`ENV` at build time or `COPY .env` — baked into image layers forever. Use runtime env/secret mounts; check `.dockerignore` excludes `.env`, `.git`.
- Unpinned base images (`FROM node:latest`); dev dependencies and build tools left in the final image (prefer multi-stage); overly broad `COPY . .` pulling in secrets.

## CI/CD

- Secrets echoed in logs; secrets available to workflows triggered by forks — `pull_request_target` with checkout of PR code is a known takeover pattern.
- Third-party actions unpinned (`uses: some/action@v1` vs pinned SHA) — supply-chain risk on repos with secrets.
- Deploy credentials scoped too broadly (CI having prod admin keys when it needs push-to-registry only).

## Cloud & runtime (when config is visible in repo)

- Public object-storage buckets holding user data; signed URLs with very long expiry.
- Overly broad IAM in IaC (`"Action": "*"`, `"Resource": "*"`).
- SSRF reachability to metadata endpoints (see injection.md) — on AWS, check IMDSv2 is enforced.
- Databases/queues bound to public interfaces with password-only auth.
