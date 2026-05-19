---
name: thoth:doctor
description: Alias for `status --doctor`; strictly audit project health without writing authority.
argument-hint: "[--quick] [--json] [--fix preview|apply] [--version]"
disable-model-invocation: true
---

# /thoth:doctor

## Generated Surface

This file is generated from `thoth.command_specs.COMMAND_SPECS`. Do not hand edit.

## Real Runtime Execution

The repo-local Thoth runtime command for this slash command has already been
executed before Claude sees this prompt.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/thoth-claude-command.sh" doctor $ARGUMENTS
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

Report only failing, drifting, missing checks, and any user decisions required to unblock authority.

### Hard Stops

- Do not pad with passing checks.
- Do not claim repo health without checks.
- Do not launch broad Explore, Task, plugin-cache/source scans, or background investigation after the doctor result.
- If extra evidence is required, inspect only the smallest artifact explicitly named by the doctor payload.
- If work items are blocked or migration decisions are unresolved, ask with AskUserQuestion instead of guessing or fixing.

### Reply Contract

- reply_budget_utf8: `64`
- result_style: brief defect receipt
- validator_policy: authority and generated surfaces decide health
