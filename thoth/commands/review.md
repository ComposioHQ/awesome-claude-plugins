---
name: thoth:review
description: Prepare a structured live review packet through the shared Thoth surface.
argument-hint: "[--executor claude|codex] [--host claude|codex] [--work-id <work_id>] <target>"
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Bash, Task
---

# /thoth:review

## Generated Surface

This file is generated from `thoth.command_specs.COMMAND_SPECS`. Do not hand edit.

## Real Runtime Execution

The repo-local Thoth runtime command for this slash command has already been
executed before Claude sees this prompt.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/thoth-claude-command.sh" review --host claude $ARGUMENTS
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
- For `review`, inspect `packet.target`, produce structured findings matching `packet.required_review_shape`, and finish through the review protocol rather than free-form prose.
- If `packet.review_mode` is `exact_match`, reproduce that exact structured result and do not add prose or extra findings.
- If `packet.protocol_commands.complete_exact` exists, execute that exact completion command rather than deriving your own variant.

## Authority Summary

### Route

- route_class: `live_intelligent`
- intelligence_tier: `high`
- packet_authority_mode: `review_packet`

### Objective

Produce the best possible review output: understand user intent, apply professional judgment and first-principles reasoning, and return structured findings without modifying code.

### Hard Stops

- Do not modify project code or write fixes.
- Do not reduce the review to a checklist; infer the user's intent from evidence and reason from first principles.
- If the target, intent, or acceptance bar is ambiguous, ask with AskUserQuestion before judging instead of assuming.
- If review_expectation or complete_exact exists, follow it exactly.

### Reply Contract

- reply_budget_utf8: `160`
- result_style: short summary plus structured findings
- validator_policy: exact-match route is protocol_fast; open-ended route stays live but still structured
