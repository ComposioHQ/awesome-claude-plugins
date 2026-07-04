---
description: Clear all live claude-bionify overrides, back to your configured defaults.
allowed-tools: Bash(python3 *)
---

!`python3 "${CLAUDE_PLUGIN_ROOT}/scripts/control.py" reset`

The command above cleared the overrides and printed claude-bionify's new state. Relay that single line to the user and take no further action.
