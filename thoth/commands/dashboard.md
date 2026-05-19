---
name: thoth:dashboard
description: Alias for `status --dashboard`; manage the local dashboard backed by .thoth ledgers.
argument-hint: "[start|stop|rebuild]"
disable-model-invocation: true
---

# /thoth:dashboard

## Generated Surface

This file is generated from `thoth.command_specs.COMMAND_SPECS`. Do not hand edit.

## Real Runtime Execution

The repo-local Thoth runtime command for this slash command has already been
executed before Claude sees this prompt.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/thoth-claude-command.sh" dashboard $ARGUMENTS
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

Report endpoint, failure point, and one notable runtime delta only.

### Hard Stops

- Do not narrate the whole UI.
- Do not restate healthy panels.

### Reply Contract

- reply_budget_utf8: `56`
- result_style: brief operator receipt
- validator_policy: dashboard is read-only over .thoth ledgers
