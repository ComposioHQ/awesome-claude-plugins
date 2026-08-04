---
description: Open the SwarmVault graph viewer for the current vault.
---

Launch SwarmVault's live graph viewer so the user can explore the knowledge graph, bookmarklet-clip pages from the browser, and inspect community clusters.

Prerequisites:
1. Confirm the working directory is a SwarmVault vault.
2. If `state/graph.json` does not yet exist, run `swarmvault compile` first so there is a graph to view.

Run:

```bash
swarmvault graph serve
```

This starts a local HTTP server and prints the URL. When the user is done, they can Ctrl-C the process.

Related commands worth offering as follow-ups:
- `swarmvault graph export --html <output>` — export a shareable standalone HTML view.
- `swarmvault graph export --obsidian` — export an Obsidian-friendly view.
- `swarmvault graph blast <target>` — reverse-import impact analysis for a specific page.
- `swarmvault diff` — graph-level change summary against the last committed baseline.
