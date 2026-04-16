---
name: swarmvault
description: "Use SwarmVault when the user needs a local-first knowledge vault that writes durable markdown, graph, search, dashboard, review, and MCP artifacts to disk from books, notes, transcripts, exports, datasets, slide decks, files, URLs, code, and recurring source workflows."
---

# SwarmVault

Use this skill when the user wants a local-first knowledge vault built on the [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern — three layers (raw sources, wiki, schema) where the LLM maintains a durable wiki between you and raw sources. Also use it when the project already contains `swarmvault.config.json` or `swarmvault.schema.md`.

For onboarding, examples, command references, or troubleshooting, read SwarmVault's bundled docs at https://swarmvault.ai/docs before improvising workflow advice.

## Quick checks

- Work from the vault root.
- If the vault does not exist yet, run `swarmvault init`.
- Use `swarmvault demo --no-serve` when the user wants the fastest zero-config walkthrough before pointing SwarmVault at their own sources.
- Use `swarmvault scan <directory> --no-serve` when the user wants the fastest scratch pass over a local repo or docs tree without manually stepping through init + ingest + compile first.
- Read `swarmvault.schema.md` before compile or query work. It is the vault's operating contract.
- If `wiki/graph/report.md` exists, use it before broad repo search.

## Core loop

1. Initialize a vault with `swarmvault init` when needed.
2. Update `swarmvault.schema.md` before a serious compile. Use it for naming rules, categories, grounding, freshness expectations, and exclusions.
3. Use `swarmvault source add <input>` when the input is a recurring local file, local directory, public GitHub repo root, or docs hub that should stay registered.
4. Ingest one-off inputs with `swarmvault ingest <path-or-url>`, or ingest a whole repo tree with `swarmvault ingest <directory>`. Audio files use `tasks.audioProvider` when configured, and supported YouTube URLs go through direct transcript capture instead of generic URL ingest.
5. Use `swarmvault ingest --guide`, `swarmvault source add --guide`, `swarmvault source reload --guide`, `swarmvault source guide <id>`, or `swarmvault source session <id>` when the human should integrate one source at a time before canonical pages change. Set `profile.guidedIngestDefault: true` in `swarmvault.config.json` to make guided mode the default; use `--no-guide` to override. Profiles using `guidedSessionMode: "canonical_review"` stage approval-queued canonical edits; `insights_only` profiles keep exploratory synthesis in `wiki/insights/`. Use `--review` only for the lighter review-only path.
6. Use `swarmvault inbox import` for capture-style batches, then `swarmvault watch --lint --repo` when the workflow should stay automated. Add `--code-only` when the refresh should stay AST-only and defer non-code semantic re-analysis to a later `compile`. On tracked repos, code-only changes take that faster compile path automatically. Install `swarmvault hook install` when git checkouts and commits should trigger the same repo-aware code-only refresh automatically.
7. Compile with `swarmvault compile`, use `compile --max-tokens <n>` when the generated wiki must stay inside a bounded context budget, or use `compile --approve` when changes should go through the local review queue first.
8. Resolve staged work with `swarmvault review list|show|accept|reject` and `swarmvault candidate list|promote|archive`.
9. Ask questions with `swarmvault query "<question>"`. It saves durable answers into `wiki/outputs/` by default; add `--no-save` only for ephemeral checks. When an embedding provider is configured, query can merge semantic page matches into local search; `search.rerank: true` lets the current `queryProvider` rerank the merged top hits before answering.
10. Use `swarmvault explore "<question>" --steps <n>` for save-first multi-step research loops, or `--format report|slides|chart|image` when the artifact should be presentation-oriented.
11. Run `swarmvault lint` whenever the schema changed, artifacts look stale, or compile/query results drift. Set `profile.deepLintDefault: true` in `swarmvault.config.json` when the advisory deep-lint pass should be the default, and use `--no-deep` when you need a structural-only run. Add `--web` only when deep lint is enabled and a `webSearch.tasks.deepLintProvider` adapter is configured; web evidence is scoped to deep lint and does not change compile or query behavior.
12. Use `swarmvault mcp` when another agent or tool should browse, search, and query the vault through MCP. When this plugin is installed, the SwarmVault MCP server is already registered — the agent can call its tools directly.
13. Use `swarmvault graph blast <target>` when the user wants reverse-import impact analysis, `swarmvault graph serve` when the live workspace or bookmarklet clipper will help, `swarmvault diff` when they need a graph-level change summary against the last committed baseline, or `swarmvault graph export --html <output>` / `graph export --report <output>` when sharing will help. `graph export` also supports `--html-standalone`, `--json`, `--obsidian`, and `--canvas` for lighter or Obsidian-native sharing.

## Working rules

- Prefer changing the schema before re-running compile when organization or grounding is wrong.
- Treat `wiki/` and `state/` as first-class outputs. Inspect them instead of trusting a single chat answer.
- Prefer `wiki/graph/report.md`, `state/graph.json`, and saved wiki pages over ad hoc broad search when they already exist.
- Use `source add` for recurring files, directories, public GitHub repo roots, and docs hubs. Use `ingest` and `add` for deliberate one-off inputs.
- When the vault lives in a git repo, `ingest|compile|query --commit` can commit `wiki/` and `state/` changes immediately after the run.
- The default heuristic provider is a valid local/offline starting point. Add a model provider only when the user wants richer synthesis quality or optional capabilities such as embeddings, vision, image generation, or audio transcription. The recommended fully-local setup is Ollama + Gemma: `ollama pull gemma4` then set `providers.llm` to `{ type: "ollama", model: "gemma4" }` and point `tasks.compileProvider`, `tasks.queryProvider`, and `tasks.lintProvider` at it.
- Audio ingest needs `tasks.audioProvider` to resolve to a provider that exposes `audio` capability. YouTube transcript ingest does not need a provider. Set `graph.communityResolution` when the user wants to pin community clustering instead of using the adaptive default.
- If an OpenAI-compatible backend cannot satisfy structured generation, reduce its declared capabilities instead of forcing every task through it.
- Keep raw sources immutable. Put corrections in schema, new sources, or saved outputs rather than manually rewriting generated provenance.

## Files and artifacts

- `swarmvault.schema.md`: vault-specific compile and query rules.
- `raw/sources/` and `raw/assets/`: canonical source storage.
- `wiki/`: generated pages plus saved outputs.
- `wiki/outputs/source-briefs/`: saved onboarding briefs for managed sources.
- `wiki/outputs/source-sessions/`: resumable guided-session anchors plus question/answer history for one-source-at-a-time integration.
- `wiki/outputs/source-reviews/`: staged source-scoped review pages.
- `wiki/outputs/source-guides/`: staged source-integration guides for one-source-at-a-time workflows.
- `wiki/dashboards/`: recent sources, reading log, timeline, source sessions, source guides, research map, contradiction, and open-question dashboards.
- `state/extracts/`: extracted markdown and JSON sidecars for ingested sources (PDF, Office formats, transcripts, code, config, data files, and more).
- `state/code-index.json`: repo-aware code aliases and local import resolution data.
- `wiki/projects/`: project rollups over canonical pages.
- `wiki/candidates/`: staged concept and entity pages awaiting promotion.
- `state/graph.json`: compiled graph.
- `state/search.sqlite`: local search index.
- `state/sources.json` and `state/sources/<id>/`: managed-source registry entries plus working sync state.
- `state/approvals/`: staged review bundles from `compile --approve`.
- `state/sessions/`: canonical session artifacts for compile, query, explore, lint, watch, review, and candidate actions.
- `state/jobs.ndjson`: watch-mode run log.

## Agent integration

- `swarmvault install --agent claude` installs graph-first rules into the current project for Claude Code.
- `swarmvault mcp` exposes tools and resources for page search, page reads, source listing, query, ingest, compile, and lint. This plugin registers it automatically.

## Defaults to preserve

- Keep raw source material immutable under `raw/`.
- Save useful answers unless the user explicitly wants ephemeral output.
- Prefer reviewable flows such as `compile --approve`, `review`, and `candidate` when a change should not activate silently.
- Treat provider setup as part of serious vault operation. If only `heuristic` is configured, say so clearly.
- When a vault uses the `profile` block in `swarmvault.config.json`, respect it as the deterministic behavior layer. `swarmvault.schema.md` still defines the human intent layer.
