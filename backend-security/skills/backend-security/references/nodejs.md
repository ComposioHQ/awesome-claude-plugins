# Node.js / TypeScript Deep Checks

**Coverage anchors** — OWASP Top 10 2021: A03 Injection, A01 Broken Access Control, A05 Misconfiguration, A06 Vulnerable Components, A08 Integrity Failures. ASVS 4.0: V5, V1 (Architecture/middleware), V14. CWE: 1321 (prototype pollution), 89, 78, 400 (ReDoS), 1104 (unmaintained deps).

Read this in addition to the general references when the stack is Node. These are Node-specific bug classes and the exact APIs to hunt for.

## Express/Fastify/Nest middleware ordering

Order is the security model. Verify:
1. Body parsing with a size limit (`express.json({ limit: '1mb' })`) — default-unlimited parsers enable memory DoS.
2. Auth middleware registered **before** the routers it protects — hunt for `app.use('/api', router)` lines that appear above `app.use(authMiddleware)`, and routers that mount their own paths bypassing the guarded prefix.
3. Error handler registered **last**, and it must not leak `err.stack` to the client in production.
4. `helmet()` (or manual headers) present; `app.set('trust proxy', ...)` configured correctly if behind a proxy — wrong trust-proxy makes `req.ip` spoofable, breaking IP rate limits.
5. Nest: `@UseGuards` present at controller or global scope; hunt for controllers/handlers missing guards, and `@Public()`-style decorators on things that shouldn't be public.

## Prototype pollution

Attacker sends `{"__proto__": {"isAdmin": true}}` (or `constructor.prototype`) into a deep merge, polluting every object.
- Hunt sinks: `lodash.merge`/`mergeWith`/`defaultsDeep`, `deepmerge`, hand-rolled recursive merge/extend, `Object.assign(target, ...userInput)` where target is reused, setting keys by user-supplied path (`set(obj, req.body.path, value)`).
- Confirm: does user input reach a deep merge? Is lodash patched (< 4.17.12 vulnerable)?
- **Fix:** validate schemas before merging (zod strips unknown keys), reject `__proto__`/`constructor`/`prototype` keys, use `Object.create(null)` for dictionaries, or `structuredClone` + explicit field copying.

## ORM/DB escape hatches

- **Prisma:** `$queryRawUnsafe`/`$executeRawUnsafe` with interpolation = SQLi. `$queryRaw` with a tagged template literal is parameterized and safe — the distinction is exactly the backticks.
- **Sequelize:** `sequelize.query()` with string interpolation (use `replacements`/`bind`), `Sequelize.literal()` with user input, and legacy operator-injection via user-supplied objects in `where`.
- **Knex:** `.raw()`/`whereRaw()` with interpolation (use `?` bindings).
- **TypeORM:** `.query()` with concatenation; QueryBuilder `.where("id = " + id)` instead of parameter objects.
- **Mongoose/Mongo:** `$where` clauses; query objects built from `req.body`/`req.query` (operator injection — see injection.md); enable `sanitizeFilter` or strip `$` keys.

## Code execution & processes

- `eval()`, `new Function()`, `vm.runInContext` with any user input — the `vm` module is NOT a security sandbox.
- `child_process.exec`/`execSync` build a shell string → prefer `execFile`/`spawn` with args array; flag `spawn(..., { shell: true })`.
- Dynamic `require()`/`import()` from user-influenced paths.

## Path & static file handling

- `path.join(base, req.params.file)` traverses — see injection.md for the resolve-and-verify fix.
- `res.sendFile(name)` needs the `root` option (it enforces containment); without it, absolute paths and traversal work.
- `express.static` with `dotfiles: 'allow'` or pointed at a directory containing `.env`/`.git`.

## JWT (jsonwebtoken specifics)

- `jwt.verify(token, secret, { algorithms: ['HS256'] })` — the `algorithms` allowlist must be present; historic versions accepted attacker-chosen algorithms.
- `jwt.decode()` performs **no verification** — any trust decision after bare decode is an auth bypass.
- Verify which key type matches the algorithm (public key + HS256 = confusion attack on old versions).

## Timing & crypto

- Compare secrets with `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` (equal lengths required — hash both first), never `===`.
- Tokens from `crypto.randomBytes`/`crypto.randomUUID`, never `Math.random()`.
- Hunt: `Math.random().toString(36)` used for anything security-relevant.

## ReDoS

- User input tested against regexes with nested quantifiers (`(a+)+`, `(\w+\s?)*`) blocks the single-threaded event loop — one request can take down the process.
- Validation libraries with user-supplied patterns; `validator.js`/custom email regexes are common offenders.

## npm ecosystem

- `npm audit` (see deps.md); lockfile committed; no `git+http`/tarball-URL dependencies.
- New/unfamiliar packages: check publish date, downloads, and `postinstall` scripts (`npm pkg get scripts` per dep, or `--ignore-scripts` in CI installs) — install-time scripts are the main npm supply-chain vector.
- Typosquatting on hand-typed installs.

## Environment & TypeScript boundary

- `NODE_TLS_REJECT_UNAUTHORIZED=0` anywhere (env files, Dockerfiles, CI) disables TLS verification process-wide.
- TypeScript types are compile-time only: `req.body as CreateUserDto` validates nothing. Every external boundary (HTTP body/params/query, queue messages, webhooks) needs runtime validation (zod/joi/class-validator with `whitelist: true`). Hunt: handlers reading `req.body.x` with no schema parse in the chain.
- `console.log` of full request/response objects in production paths (token/PII leakage into logs).
