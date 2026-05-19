---
name: thoth:init
description: Initialize, migrate, or resync canonical .thoth authority without taking ownership of repo-root `.codex`.
argument-hint: "[--sync] [--migrate preview|apply] [--migrate --preview|--apply]"
disable-model-invocation: true
---

# /thoth:init

## Generated Surface

This file is generated from `thoth.command_specs.COMMAND_SPECS`. Do not hand edit.

## Real Runtime Execution

The repo-local Thoth runtime command for this slash command has already been
executed before Claude sees this prompt.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/thoth-claude-command.sh" init $ARGUMENTS
```

## Response Contract

- Treat the structured bridge payload above as the only authority for this invocation.
- If `bridge_success` is `false`, report the exact bridge failure and stop.
- If stdout starts with `version=`, repeat stdout exactly and output nothing else.
- If `bridge_success` is `true`, report only the real command result in one short receipt.
- If extra evidence is required, inspect only the smallest artifact explicitly named by the bridge payload.
- Do not launch broad Explore, Task, cache/source scans, or background investigation after the bridge result.
- If the result exposes blockers or asks for human decisions, use AskUserQuestion to ask only the unresolved questions and stop.
- Do not expand into runtime explanation, walkthroughs, or extra command execution.

## Authority Summary

### Route

- route_class: `mechanical_fast`
- intelligence_tier: `none`
- packet_authority_mode: `result_envelope`

### Objective

Report audit-first adopt/init outcome, generated artifacts, blockers, and user decisions required before continuing.

### Hard Stops

- Do not assume the repo is blank.
- Do not assume goals, project identity, migration intent, work priority, unblock policy, or acceptance criteria.
- Do not launch broad Explore, Task, plugin-cache/source scans, or background investigation after the init result.
- If extra evidence is required, inspect only the smallest artifact explicitly named by the init payload.
- If the preview/apply result leaves blocked work or unresolved migration choices, ask with AskUserQuestion and stop.
- Do not narrate the full migration procedure.

### Reply Contract

- reply_budget_utf8: `60`
- result_style: brief outcome receipt
- validator_policy: preview and generated artifacts define success
