---
name: thoth:run
description: Start one strict run bound to `work_id@revision`; live runs foreground and `--sleep` detaches the same runtime driver.
argument-hint: "[--executor claude|codex] [--host claude|codex] [--sleep] [--attach <run_id>] [--watch <run_id>] [--stop <run_id>] --work-id <work_id>"
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Task
---

# /thoth:run

## Generated Surface

This file is generated from `thoth.command_specs.COMMAND_SPECS`. Do not hand edit.

## Real Runtime Execution

The repo-local Thoth runtime command for this slash command has already been
executed before Claude sees this prompt.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/thoth-claude-command.sh" run --host claude $ARGUMENTS
```

## Response Contract

- Treat the structured bridge payload above as the only authority for this command invocation.
- If `bridge_success` is `false`, report the exact bridge failure and stop.
- If `run` or `loop` is missing `--work-id`, show the returned candidate work items exactly as provided and stop.
- If `run` or `loop` is missing `--work-id`, do not invent, create, compile, or guess a work item.
- If `bridge_success` is `true` and runtime events are present, summarize progress, terminal status, and risk from those events only.
- Do not hand-edit `.thoth` or manually call runtime protocol commands; the Thoth RuntimeDriver advances phases.
- If `packet.dispatch_mode` is `external_worker`, do not duplicate the work locally; report the run id, worker mode, and the correct follow-up only.
- If you only describe what should happen next instead of reporting the executed runtime result, treat that as failure.
- If `packet.executor == codex`, the substantive execution must really flow through Codex rather than being silently done by Claude.
- Runtime lifecycle is `plan -> execute -> validate -> reflect`; auto runs selected work through child loops.
- Prefer running `packet.strict_task.eval_entrypoint.command` exactly as provided rather than inventing a parallel validator lifecycle.
- Use `packet.strict_task.goal_statement`, `packet.strict_task.authority_context`, `packet.strict_task.implementation_recipe`, and `packet.strict_task.eval_entrypoint` as the only task authority.
- If plan reports `authority_complete=false` or `reason=needs_input`, stop and route the user back to `/thoth:discuss` instead of guessing.

## Authority Summary

### Route

- route_class: `live_intelligent`
- intelligence_tier: `high`
- packet_authority_mode: `phase_controller`

### Objective

Finish the current strict task through the four-phase RuntimeDriver.

### Hard Stops

- Do not invent or compile a new work item when --work-id is missing.
- Do not stop after starting the runtime; monitor RuntimeDriver events until terminal.
- Do not hand-edit .thoth ledgers.

### Reply Contract

- reply_budget_utf8: `36`
- result_style: terminal receipt only
- validator_policy: plan first, validate decides completion, reflect always summarizes evidence and risk
