---
name: thoth
description: Official Codex public surface for the Thoth authority runtime. Use this skill when the user wants to operate Thoth through the single `$thoth <command>` public entry.
---

# Thoth

Official Codex public surface for Thoth. This skill is generated from the same host-neutral command specification that renders the Claude `/thoth:*` commands.

## Public Entry

Use the single public entrypoint:

- `$thoth <command>`

Supported commands:
- `$thoth init`: Initialize, migrate, or resync canonical .thoth authority without taking ownership of repo-root `.codex`.
- `$thoth run`: Start one strict run bound to `work_id@revision`; live runs foreground and `--sleep` detaches the same runtime driver.
- `$thoth loop`: Start one bounded controller service whose parent creates four-phase child runs.
- `$thoth review`: Prepare a structured live review packet through the shared Thoth surface.
- `$thoth auto`: Run the highest-priority actionable work queue until ready/active/failed work is closed, paused, or stopped.
- `$thoth status`: Show repo status and active durable runs from the shared ledger.
- `$thoth discuss`: Discuss or record planning decisions without entering implementation execution.
- `$thoth doctor`: Alias for `status --doctor`; strictly audit project health without writing authority.
- `$thoth dashboard`: Alias for `status --dashboard`; manage the local dashboard backed by .thoth ledgers.

## Dispatcher

- `.thoth` is the only runtime authority.
- Parse the requested `$thoth <command>`, then open only the matching micro prompt under `./commands/<command>.md`.
- Execute the literal shell command immediately; do not replace it with explanation.
- If `thoth` is not on PATH, use the installed Codex plugin cache or marketplace-root runtime entrypoint described by the micro prompt; do not use a local checkout as fallback.
- If neither PATH nor the installed Codex plugin cache / marketplace root contains the runtime entrypoint, treat that as host install drift.
- Do not create alternative public Codex variants such as `run:codex` or `loop:codex`.

## Route Table

- `init` -> `mechanical_fast` / `none` / `result_envelope`
- `run` -> `live_intelligent` / `high` / `phase_controller`
- `loop` -> `live_intelligent` / `high` / `phase_controller`
- `review` -> `live_intelligent` / `high` / `review_packet`
- `auto` -> `live_intelligent` / `high` / `phase_controller`
- `status` -> `mechanical_fast` / `none` / `result_envelope`
- `discuss` -> `live_intelligent` / `high` / `command_packet`
- `doctor` -> `mechanical_fast` / `none` / `result_envelope`
- `dashboard` -> `mechanical_fast` / `none` / `result_envelope`

## Shared Rules

- `init`, `status`, `doctor`, and `dashboard` are mechanical fast-path commands and should return only short receipts.
- `discuss`, `run`, `loop`, `auto`, and open-ended `review` are high-intelligence paths.
- `review` exact-match/probe flows are protocol-fast: if the packet exposes an exact result, do not improvise.
- `run` and `loop` use one RuntimeDriver: lifecycle is `plan -> execute -> validate -> reflect`; live is foreground monitor, `--sleep` is detached monitor.
- Host hooks and subagents may improve throughput but are never correctness requirements.
