# Injection & Untrusted Input

**Coverage anchors** — OWASP Top 10 2021: A03 Injection, A08 Software & Data Integrity (deserialization), A10 SSRF, A04 Insecure Design (mass assignment). ASVS 4.0: V5 (Validation, Sanitization & Encoding), V12 (File & Resources), V13 (API). CWE: 89, 78, 22, 79, 918, 502, 611, 1321.

For each check: run the hunt patterns (adapt to the stack's idioms), then trace whether attacker-controlled data reaches the sink.

## SQL injection

Hunt for string-built queries and ORM escape hatches:
- Concatenation/interpolation into query strings: `` query(`...${ ``, `"SELECT " +`, Python f-strings/`%`/`.format()` inside `execute(...)`
- ORM raw escape hatches: Sequelize `literal()`/`query()`, Prisma `$queryRawUnsafe`/`$executeRawUnsafe`, Knex `.raw()`, TypeORM `.query()`, Django `.raw()`/`.extra()`, SQLAlchemy `text()` with interpolation, ActiveRecord `where("... #{...}")`
- Dynamic ORDER BY / column names built from request params (parameterization can't cover identifiers — require an allowlist)

**Fix:** parameterized queries / tagged templates (`$queryRaw` with template literal is safe; `$queryRawUnsafe` is not). Identifiers via explicit allowlist map.

## NoSQL injection (MongoDB and friends)

- Request objects passed directly into queries: `find(req.body)`, `findOne({ email: req.body.email, password: req.body.password })` — attacker sends `{"password": {"$gt": ""}}`
- `$where`, `mapReduce`, or aggregation stages built from user input

**Fix:** validate types at the boundary (must be string, not object); strip `$`-prefixed keys; use schema validation (zod/joi/mongoose strict).

## Command injection

- `child_process.exec`, `execSync`, `spawn(..., {shell: true})`; Python `os.system`, `subprocess` with `shell=True`; Ruby backticks/`system` with interpolation; Go `exec.Command("sh", "-c", ...)`
- Also: arguments that become flags (`--output=...`) — argument injection even without a shell

**Fix:** `execFile`/`spawn` with an args array and no shell; validate/allowlist arguments; prepend `--` where the tool supports it.

## Path traversal

- User input in `path.join`/`os.path.join`, `fs.readFile`, `sendFile`, `open()`, archive extraction (zip-slip)
- `path.join(base, userInput)` is NOT safe — `../../` escapes. Check for: resolve then verify `resolved.startsWith(base + sep)`
- Null bytes and URL-encoded traversal (`..%2f`) if input isn't decoded consistently

**Fix:** resolve the full path and enforce it stays under the intended base directory; or map user input to an ID → filename lookup so no path math involves user data.

## SSRF (server-side request forgery)

- `fetch`/`axios`/`requests.get`/`http.Get` where any part of the URL (host, path, or full URL) comes from user input — webhooks, "import from URL", PDF/image fetchers, link previews
- Check for: internal-network access (`localhost`, `10.x`, `172.16-31.x`, `192.168.x`), cloud metadata (`169.254.169.254`), redirects that bypass the check, DNS rebinding, non-HTTP schemes (`file://`, `gopher://`)

**Fix:** allowlist of hosts where possible; otherwise resolve DNS and reject private/link-local ranges *after* redirects (validate per-hop, disable or re-validate redirects); enforce scheme `https`.

## Insecure deserialization

- Python `pickle.loads`, `yaml.load` without `SafeLoader`, `marshal`; Java `ObjectInputStream.readObject`, XMLDecoder; PHP `unserialize`; Node `node-serialize`, `serialize-javascript` misuse — on any data an attacker can influence (cookies, cache, queue messages, uploaded files)

**Fix:** use JSON with schema validation; if a binary format is required, sign it (HMAC) and verify before deserializing.

## XXE

- XML parsers with external entities enabled: Java `DocumentBuilderFactory` without `disallow-doctype-decl`, Python `lxml` with `resolve_entities=True`, .NET `XmlReader` with `DtdProcessing.Parse`

**Fix:** disable DTDs and external entity resolution; prefer `defusedxml` (Python).

## Template injection (SSTI)

- User input used as the *template* (not a variable): `render_template_string(userInput)`, Handlebars/EJS/Pug compile of user strings, Go `template.New().Parse(userInput)`
- Email/notification systems that let users edit templates are the classic entry point

**Fix:** user data goes into template variables only; if user-editable templates are a feature, use a logic-less sandboxed engine.

## XSS from the backend

- HTML responses concatenating user input; `res.send("<h1>" + name)`; disabled auto-escaping (`| safe`, `mark_safe`, `dangerouslySetInnerHTML` fed by API data, `{{{ }}}` in Handlebars)
- APIs returning user content with wrong `Content-Type` (HTML sniffing) — JSON endpoints must send `application/json` and `X-Content-Type-Options: nosniff`
- Reflected input in error pages and redirects (`Location` header injection via CRLF)

## Open redirect & unvalidated redirects

- User-controlled redirect targets: `res.redirect(req.query.url)`, `redirect(request.args.get('next'))`, `Location` set from a request param, post-login "return to" parameters, OAuth `redirect_uri`/`state` echoes.
- Impact: phishing (attacker sends a link to your trusted domain that bounces to theirs), OAuth token/code theft when the redirect carries credentials, and a pivot for SSRF when the "redirect" is followed server-side (see SSRF above).
- Hunt: `redirect(req.`, `res.redirect(`, `sendRedirect(`, `Location:` headers built from input, `?url=`/`?next=`/`?return=`/`?redirect=` parameters.

**Fix:** redirect only to an allowlist of paths/hosts, or to relative paths you build (strip the scheme+host, reject anything starting with `//` or containing `:`). Never pass a raw user URL to a redirect. For OAuth, exact-match `redirect_uri` against registration.

## File uploads

Check the full chain:
1. **Validation** — extension AND content type; never trust client `Content-Type`; allowlist, not denylist; beware double extensions (`shell.php.jpg`) and case tricks
2. **Storage** — outside the web root or in object storage; generated filenames (never the user's — traversal + overwrite); size limits enforced server-side
3. **Serving** — `Content-Disposition: attachment` or a separate domain for user content; correct Content-Type; no execution permissions
4. **Processing** — image/document libraries run on untrusted files (historic RCEs: ImageMagick, ffmpeg); pin versions, consider sandboxing, strip metadata

## Mass assignment

- `Model.create(req.body)`, `user.update(params)`, `**request.json` spread into a model — attacker sets `role`, `isAdmin`, `price`, `verified`
**Fix:** explicit field allowlist per endpoint (DTOs, serializers, `pick()` of named fields).
