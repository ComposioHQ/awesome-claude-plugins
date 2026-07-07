# Dependency & Supply-Chain Scan

**Coverage anchors** — OWASP Top 10 2021: A06 Vulnerable & Outdated Components, A08 Software & Data Integrity Failures. ASVS 4.0: V14.2 (Dependency management). CWE: 1104, 1035, 937.

## 1. Run the ecosystem's audit tool

Use what the repo's lockfile implies. Run read-only audits; never auto-run `... audit fix` without approval.

| Ecosystem | Command | Notes |
|---|---|---|
| npm | `npm audit` | `--omit=dev` to focus on runtime deps; JSON via `--json` |
| pnpm | `pnpm audit` | |
| yarn | `yarn npm audit` (berry) / `yarn audit` (v1) | |
| Python | `pip-audit` | falls back: `pip install pip-audit`; or `osv-scanner` |
| Go | `govulncheck ./...` | call-graph aware — its results are reachability-filtered already |
| Java | `mvn org.owasp:dependency-check-maven:check` or Gradle equivalent | slow; osv-scanner is a faster first pass |
| Ruby | `bundle audit` (bundler-audit) | |
| PHP | `composer audit` | |
| .NET | `dotnet list package --vulnerable --include-transitive` | |
| Any / monorepo | `osv-scanner -r .` | good universal fallback if installed |

If a tool isn't installed, say so and offer the install command — don't silently skip the step.

## 2. Triage the results (don't just paste the output)

For each reported vulnerability, assess and report:
- **Reachability:** is the vulnerable function actually used? A prototype-pollution advisory in a build-time-only dep is Low; the same in the request path is High.
- **Direct vs transitive:** direct → upgrade the dep; transitive → upgrade the parent, or use `overrides` (npm) / `resolutions` (yarn) / constraints as a stopgap and note it's a stopgap.
- **Runtime vs dev dependency:** dev-only advisories rarely matter in production (but do matter in CI supply-chain terms).
- Group by the fix action ("upgrade express to 4.19.2 clears 3 advisories") rather than listing CVEs one by one.

## 3. Lockfile & manifest hygiene

- Lockfile committed and in sync with the manifest (unlocked deps = non-reproducible, drift-prone builds).
- No dependencies from raw URLs, `git+http://`, or personal forks without a pinned commit.
- Version ranges on security-critical libs (auth, crypto, session, ORM): wide ranges (`*`, `>=`) are a flag.
- Deprecated/unmaintained security-critical packages (e.g. abandoned auth middleware) — recommend maintained replacements.

## 4. Supply-chain checks

- **Install scripts (npm):** `postinstall` hooks are the main attack vector — for unfamiliar deps, check what their scripts do; recommend `--ignore-scripts` for CI installs where feasible.
- **Typosquatting:** hand-typed package names close to popular ones; very new packages with few downloads pulled into production code.
- **CI actions/plugins:** third-party GitHub Actions pinned to a SHA, not a movable tag, on repos holding secrets.
- **Base images:** pinned tags or digests, not `latest`; if trivy/`docker scout` is available, offer an image scan — don't install scanners unprompted.

## 5. Config files that ride along

While in scan mode, also check (details in infra.md):
- `Dockerfile` / `docker-compose.yml` — root user, baked secrets, `.dockerignore`
- CI workflow files — secret exposure, fork-triggered workflows, unpinned actions
- `.env*` — gitignored, never committed historically (`git log --all --oneline -- .env`), no `.env.production` with real values in the repo
