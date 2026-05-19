---
name: thoth:auto
description: Run the highest-priority actionable work queue until ready/active/failed work is closed, paused, or stopped.
argument-hint: "[--sleep] [--rounds <n>] [--scope all-open|ready|priority-top] [--work-id <work_id> ...] [--watch <controller_id>] [--stop <controller_id>]"
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Edit, Write, Bash, Task, Monitor
---

# /thoth:auto

## Generated Surface

This file is generated from `thoth.command_specs.COMMAND_SPECS`. Do not hand edit.

## Real Runtime Execution

The repo-local Thoth runtime command for this slash command has already been
executed before Claude sees this prompt.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/thoth-claude-command.sh" auto --host claude $ARGUMENTS
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
- If the bridge payload exposes `body.monitor_command`, observe that command instead of executing work directly in the Claude session.
- Prefer the Claude Monitor tool with `persistent=true` for `body.monitor_command` when available; otherwise use Bash to run the same watch command in the foreground.
- Treat the monitor/watch JSONL stream as the only live progress authority; summarize progress and risks from those events only.
- If the live observer is interrupted, do not stop the auto controller unless the user explicitly requests `/thoth:auto --stop <controller_id>`.

## Authority Summary

### Route

- route_class: `live_intelligent`
- intelligence_tier: `high`
- packet_authority_mode: `phase_controller`

### Objective

Run actionable work items by scheduling priority through child loops until none remain, budget pauses, or stop is requested.

### Hard Stops

- Do not execute blocked or draft work.
- Do not auto-abandon work items.
- Do not bypass execution-safety doctor preflight.

### Reply Contract

- reply_budget_utf8: `120`
- result_style: start or reuse the durable controller, then stream JSONL watch events until terminal or observer interruption
- validator_policy: controller cursor, child loop results, and auto watch events define queue state
