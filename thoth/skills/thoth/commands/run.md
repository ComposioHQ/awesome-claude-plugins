# $thoth run

Generated micro prompt for the Thoth Codex dispatcher.

## Route

- route_class: `live_intelligent`
- intelligence_tier: `high`
- packet_authority_mode: `phase_controller`

## Objective

Finish the current strict task through the four-phase RuntimeDriver.

## Hard Stops

- Do not invent or compile a new work item when --work-id is missing.
- Do not stop after starting the runtime; monitor RuntimeDriver events until terminal.
- Do not hand-edit .thoth ledgers.

## Reply Contract

- reply_budget_utf8: `36`
- result_style: terminal receipt only
- validator_policy: plan first, validate decides completion, reflect always summarizes evidence and risk

## Execution String

Operate only on this repo. Use the installed skill named thoth. The Codex public surface is `$thoth run`, but in the workspace shell you must execute it literally as `bash -lc 'set -euo pipefail; if [ -n "${THOTH_SELFTEST_RUNTIME_ROOT:-}" ]; then if [ -x "$THOTH_SELFTEST_RUNTIME_ROOT/bin/thoth" ]; then exec "$THOTH_SELFTEST_RUNTIME_ROOT/bin/thoth" "$@"; fi; if [ -f "$THOTH_SELFTEST_RUNTIME_ROOT/scripts/thoth-cli-entry.py" ]; then exec python3 "$THOTH_SELFTEST_RUNTIME_ROOT/scripts/thoth-cli-entry.py" "$@"; fi; fi; if command -v thoth >/dev/null 2>&1; then exec thoth "$@"; fi; candidates="$(ls -td "$HOME"/.codex/plugins/cache/thoth/thoth/* 2>/dev/null || true)"; marketplace="$HOME/.codex/.tmp/marketplaces/thoth"; if [ -d "$marketplace" ]; then candidates="$candidates
$marketplace"; fi; for candidate in $candidates; do if [ -x "$candidate/bin/thoth" ]; then exec "$candidate/bin/thoth" "$@"; fi; if [ -f "$candidate/scripts/thoth-cli-entry.py" ]; then if command -v python3 >/dev/null 2>&1; then exec python3 "$candidate/scripts/thoth-cli-entry.py" "$@"; else exec python "$candidate/scripts/thoth-cli-entry.py" "$@"; fi; fi; done; echo '"'"'thoth installed runtime not found'"'"' >&2; exit 127' thoth run`. Execute that shell command immediately as your first meaningful action. Do not explain the command before executing it. Do not replace execution with prose. If neither PATH nor the installed Codex plugin cache or marketplace root contains the runtime entrypoint, report host install drift instead of inventing another entrypoint. route_class=live_intelligent. intelligence_tier=high. packet_authority_mode=phase_controller. Objective: Finish the current strict task through the four-phase RuntimeDriver. Hard stop: Do not invent or compile a new work item when --work-id is missing. Hard stop: Do not stop after starting the runtime; monitor RuntimeDriver events until terminal. Hard stop: Do not hand-edit .thoth ledgers. If the command streams runtime events, report progress and risks from those events only. Stay in the same session until the RuntimeDriver reaches terminal state unless --sleep was requested. Runtime lifecycle is plan -> execute -> validate -> reflect; auto advances selected work through child loops. Do not hand-edit `.thoth`; let the Thoth runtime driver advance phases. Plan must prove coverage of strict_task.authority_context before execute; needs_input routes back to discuss. Reply with `THOTH_DONE` only after the command path reaches its terminal outcome.
