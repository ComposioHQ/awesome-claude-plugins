# SwarmVault Plugin for Claude Code

[SwarmVault](https://swarmvault.ai) is a local-first RAG knowledge vault. It compiles raw sources (books, notes, transcripts, exports, datasets, slide decks, files, URLs, code) into a durable markdown wiki with a knowledge graph and a hybrid SQLite FTS plus embeddings index.

This plugin wires SwarmVault into Claude Code:

- Registers the SwarmVault MCP server so Claude can search pages, read the graph, and run query/ingest/compile/lint over the current vault.
- Ships the canonical SwarmVault skill so Claude knows when and how to use the vault.
- Adds three slash commands: `/swarmvault:compile`, `/swarmvault:query`, `/swarmvault:graph`.

## Requirements

- Node.js 18 or newer (the MCP server runs via `npx -y @swarmvaultai/cli`).
- A SwarmVault vault directory. If you don't have one yet, `cd` to an empty directory and run `npx -y @swarmvaultai/cli init` or use the `/swarmvault:compile` command which will prompt for `init` first.

## Install

```
/plugin install swarmvault
```

Or from the repository directly while it is still pending in the marketplace:

```
/plugin marketplace add swarmclawai/swarmvault
/plugin install swarmvault@swarmvault
```

## Usage

Start Claude Code **from the vault root**:

```bash
cd ~/my-vault
claude
```

The plugin inherits that working directory, so the MCP server and slash commands operate against the vault without extra configuration.

### Slash commands

- `/swarmvault:compile` — rebuild the wiki, graph, and search index from `raw/`. Accepts the same flags as the CLI (`--approve`, `--max-tokens`, `--commit`).
- `/swarmvault:query <question>` — ask a question against the compiled vault. The answer is saved to `wiki/outputs/` by default.
- `/swarmvault:graph` — start the live graph viewer at a local URL.

### MCP tools

Once installed, the `swarmvault` MCP server is registered automatically. It exposes tools for page search, page reads, source listing, query, ingest, compile, and lint. See the SwarmVault docs at https://swarmvault.ai/docs for the full tool list.

### Skill

The bundled skill tells Claude when to reach for SwarmVault — typically when a project already contains `swarmvault.config.json` or `swarmvault.schema.md`, or when the user asks for durable notes, a knowledge base, or a graph over their sources. Claude will propose running `swarmvault init`, `ingest`, or `compile` when appropriate.

## Changing the vault directory

The MCP server runs in whatever directory Claude Code started in. To point at a different vault, restart Claude Code from that directory. If you need a fixed `cwd` (for example, when using Claude Code inside a monorepo whose root is not the vault), fork this plugin and add `"cwd": "/absolute/path/to/vault"` to the `swarmvault` entry in `.mcp.json`.

## License

MIT. See [LICENSE](./LICENSE).

## Links

- Website: https://swarmvault.ai
- Docs: https://swarmvault.ai/docs
- CLI on npm: https://www.npmjs.com/package/@swarmvaultai/cli
- Source: https://github.com/swarmclawai/swarmvault
