# $thoth loop

Generated micro prompt for the Thoth Codex dispatcher.

## Route

- route_class: `live_intelligent`
- intelligence_tier: `high`
- packet_authority_mode: `phase_controller`

## Objective

Advance the current bounded loop through foreground or sleeping RuntimeDriver monitoring.

## Hard Stops

- Do not decide extra iterations outside the recorded loop budget.
- Do not skip validator output when judging success.
- Do not expand into iteration diaries or runtime narration.

## Reply Contract

- reply_budget_utf8: `40`
- result_style: terminal receipt only
- validator_policy: parent loop budget controls retries; each child runs plan -> execute -> validate -> reflect

## Execution String

Operate only on this repo. Use the installed skill named thoth. The Codex public surface is `$thoth loop`, but in the workspace shell you must execute it literally as `bash -lc 'set -euo pipefail; if [ -n "${THOTH_SELFTEST_RUNTIME_ROOT:-}" ]; then if [ -x "$THOTH_SELFTEST_RUNTIME_ROOT/bin/thoth" ]; then exec "$THOTH_SELFTEST_RUNTIME_ROOT/bin/thoth" "$@"; fi; if [ -f "$THOTH_SELFTEST_RUNTIME_ROOT/scripts/thoth-cli-entry.py" ]; then exec python3 "$THOTH_SELFTEST_RUNTIME_ROOT/scripts/thoth-cli-entry.py" "$@"; fi; fi; if command -v thoth >/dev/null 2>&1; then exec thoth "$@"; fi; candidates="$(ls -td "$HOME"/.codex/plugins/cache/thoth/thoth/* 2>/dev/null || true)"; marketplace="$HOME/.codex/.tmp/marketplaces/thoth"; if [ -d "$marketplace" ]; then candidates="$candidates
$marketplace"; fi; for candidate in $candidates; do if [ -x "$candidate/bin/thoth" ]; then exec "$candidate/bin/thoth" "$@"; fi; if [ -f "$candidate/scripts/thoth-cli-entry.py" ]; then if command -v python3 >/dev/null 2>&1; then exec python3 "$candidate/scripts/thoth-cli-entry.py" "$@"; else exec python "$candidate/scripts/thoth-cli-entry.py" "$@"; fi; fi; done; echo '"'"'thoth installed runtime not found'"'"' >&2; exit 127' thoth loop`. Execute that shell command immediately as your first meaningful action. Do not explain the command before executing it. Do not replace execution with prose. If neither PATH nor the installed Codex plugin cache or marketplace root contains the runtime entrypoint, report host install drift instead of inventing another entrypoint. route_class=live_intelligent. intelligence_tier=high. packet_authority_mode=phase_controller. Objective: Advance the current bounded loop through foreground or sleeping RuntimeDriver monitoring. Hard stop: Do not decide extra iterations outside the recorded loop budget. Hard stop: Do not skip validator output when judging success. Hard stop: Do not expand into iteration diaries or runtime narration. If the command streams runtime events, report progress and risks from those events only. Stay in the same session until the RuntimeDriver reaches terminal state unless --sleep was requested. Runtime lifecycle is plan -> execute -> validate -> reflect; auto advances selected work through child loops. Do not hand-edit `.thoth`; let the Thoth runtime driver advance phases. Plan must prove coverage of strict_task.authority_context before execute; needs_input routes back to discuss. Reply with `THOTH_DONE` only after the command path reaches its terminal outcome.
