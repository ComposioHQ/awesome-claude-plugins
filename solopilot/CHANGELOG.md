# Changelog

All notable changes to **solopilot** will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned for 0.2
- Interactive PRD interview during `/autopilot` (replaces empty PRD template)
- Pre-built routine bundles (`/autopilot --routines daily,weekly,on-pr`)

## [0.1.0] - 2026-04-27

Initial release. PM-driven autonomous engineering for solo builders.

### Added
- `/autopilot` — one-shot bootstrap of the full system: stack detection (11 manifest types), `CLAUDE.md` merge-only generator, `specs/PRD.md` template, 3-agent setup (Coordinator/Implementor/Verifier), `.claude/settings.json` with PostToolUse hooks, `LEARNINGS.md` append-only knowledge base, `/schedule` block printer.
- `/cpp` — Conventional Commits message generator + commit + push + draft PR via `gh`. Refuses on secret patterns. Never `--amend`. Never `git add -A`.
- `/grill` — staff-engineer adversarial review with 5 parallel passes (security / types / concurrency / edge cases / scope drift). Severity tags. Verdict: SHIP / FIX-FIRST / REWRITE.
- `/learn` — extract patterns and anti-patterns from a PR or session, append to `LEARNINGS.md` (append-only) and the most generalizable to `CLAUDE.md`'s `## 학습` section.
- `--autoloop` mode for `/autopilot` — self-paced PM cycle (verify → work → compound) with stop conditions.
- Marketplace manifest for direct install via `/plugin marketplace add` and `/plugin install`.
- MIT license.

### Safety defaults
- All file generators are merge-only or append-only — never overwrite user content.
- `permissions.deny[]` includes `git push --force`, `git reset --hard`, `rm -rf /`, `npm publish`, `cargo publish`, `gem push`, `pypi upload`.
- `--dangerously-skip-permissions` is never enabled.
- `/schedule` is never invoked directly — copy-paste strings are printed instead.

[Unreleased]: https://github.com/Mrbaeksang/solopilot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Mrbaeksang/solopilot/releases/tag/v0.1.0
