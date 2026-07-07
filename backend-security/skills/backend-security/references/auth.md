# Authentication & Access Control

**Coverage anchors** — OWASP Top 10 2021: A01 Broken Access Control, A07 Identification & Authentication Failures, A04 Insecure Design. ASVS 4.0: V2 (Authentication), V3 (Session Management), V4 (Access Control). CWE: 287, 862, 863, 639, 384, 613, 307, 522, 620.

Two questions dominate this domain: **who are you** (authn) and **what may you touch** (authz). Broken object-level authorization (IDOR) is the single most common real-world backend vulnerability — check it on every route that takes an ID.

## Password storage

- **Require:** bcrypt (cost ≥ 10), argon2id, or scrypt. Flag: MD5, SHA-1, unsalted/plain SHA-256, plaintext, reversible encryption, home-rolled hashing.
- Hash comparison must be the library's verify function, not `==` on hashes.
- Hunt: `md5(`, `sha1(`, `createHash('sha256').update(password`, `hashlib.md5`, columns named `password` populated without a hash call.

## Password policy

- **Minimum length** enforced server-side (≥8, prefer ≥12). Flag validation that accepts trivially short passwords — e.g. a regex like `/^.{1,20}$/` sets only a *maximum* and permits a 1-character password.
- Reject known-breached / top-common passwords (e.g. a HaveIBeenPwned range check or a common-password list). Don't impose arbitrary composition rules that push users toward predictable patterns (`Password1!`).
- No low upper bound that forces truncation; bcrypt's 72-byte limit should be handled, not worked around by capping user length short.
- Hunt: signup/reset validators (`PASS_RE`, `password.length`, joi/zod `.min()`/`.max()` on password) — confirm a real minimum exists and is applied on **both** registration and password-change/reset paths.

## JWT

- **`decode` vs `verify`:** `jwt.decode()` (Node `jsonwebtoken`, PyJWT with `verify=False`/no key) does NOT check the signature. Any token trusted after mere decoding is a full auth bypass. Hunt: `jwt.decode(` and confirm a separate `verify` guards the trust decision.
- **Algorithm confusion:** verification must pin an algorithm allowlist (`algorithms: ['RS256']`). Accepting `none`, or verifying RS256 tokens with the public key as an HMAC secret (HS256 confusion), is a bypass.
- **Secret strength:** HMAC secrets must be long random values from env/secret store — flag short/dictionary strings, secrets committed to the repo, the same secret across environments.
- **Claims:** enforce `exp` (and reasonable lifetime), validate `iss`/`aud` in multi-service setups. Don't put authorization data the user can pick (role from a request) into the token.
- **Revocation:** long-lived tokens with no revocation path (logout, password change, ban) — flag as High for sensitive apps. Refresh tokens: stored hashed, rotated on use, revocable.

## Sessions & cookies

- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`. Session ID regenerated on login (fixation) and invalidated server-side on logout.
- Absolute + idle expiry for sensitive apps. Session data server-side; if using signed cookie sessions, nothing sensitive inside and strong signing key.
- CSRF: if auth is cookie-based, state-changing routes need CSRF protection (token or strict SameSite + custom-header check). Pure Bearer-token APIs are exempt.

## Login flow

- **Rate limiting / lockout** on login, password reset, OTP verification — per-account and per-IP. Missing = Medium minimum.
- **User enumeration:** identical errors and similar timing for "no such user" vs "wrong password"; registration and reset flows shouldn't reveal whether an email exists.
- **Timing-safe comparison** for tokens, API keys, OTPs: `crypto.timingSafeEqual`, `hmac.compare_digest` — flag `==`/`===` on secret values.

## Password reset

- Token: ≥128 bits from a CSPRNG (not `Math.random`, not a timestamp/user-id hash), stored hashed, single-use, short expiry (≤1h).
- Sessions invalidated on password change. Reset link host not built from the request's `Host` header (host-header injection → token theft).

## Access control (authorization)

- **Every route:** identify the authn middleware chain; list routes that skip it and confirm each is intentionally public. Watch for routers mounted before auth middleware and "temporary" debug endpoints.
- **IDOR / object-level:** every fetch/update/delete by ID from the request must scope to the caller: `findOne({ id, userId: session.userId })` or an explicit ownership/tenant check after fetch. Hunt: `findById(req.params`, `get_object_or_404(Model, pk=` with no owner filter. Sequential integer IDs make it trivially exploitable — but UUIDs are NOT authorization.
- **Function-level:** admin routes need a server-side role check, not just hidden UI. Role must come from the session/DB, never from the request body or a client-editable JWT claim.
- **Privilege escalation via mass assignment:** can a profile-update endpoint set `role`/`isAdmin`? (see injection.md).
- **Multi-tenancy:** tenant ID from the authenticated context, never from a request parameter; ideally enforced centrally (scoped query helpers, RLS) rather than per-query discipline.

## OAuth / SSO

- `redirect_uri` validated by exact match against a registration (not prefix/substring). `state` parameter required and verified (CSRF). PKCE for public clients.
- Account linking by email: only trust `email_verified`; otherwise pre-registration account takeover.
- ID token: verify signature, `aud`, `iss`, `nonce`.

## API keys & machine auth

- Stored hashed server-side (they're passwords). Timing-safe comparison. Scoped and revocable, prefixed (`sk_live_`) so leaks are greppable.
- Internal service-to-service endpoints: confirm they're not reachable from the public edge with no auth ("the gateway handles it" — verify).
