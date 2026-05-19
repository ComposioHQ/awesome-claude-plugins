# $thoth review

Generated micro prompt for the Thoth Codex dispatcher.

## Route

- route_class: `live_intelligent`
- intelligence_tier: `high`
- packet_authority_mode: `review_packet`

## Objective

Produce the best possible review output: understand user intent, apply professional judgment and first-principles reasoning, and return structured findings without modifying code.

## Hard Stops

- Do not modify project code or write fixes.
- Do not reduce the review to a checklist; infer the user's intent from evidence and reason from first principles.
- If the target, intent, or acceptance bar is ambiguous, ask with AskUserQuestion before judging instead of assuming.
- If review_expectation or complete_exact exists, follow it exactly.

## Reply Contract

- reply_budget_utf8: `160`
- result_style: short summary plus structured findings
- validator_policy: exact-match route is protocol_fast; open-ended route stays live but still structured

## Execution String

Operate only on this repo. Use the installed skill named thoth. The Codex public surface is `$thoth review`, but in the workspace shell you must execute it literally as `bash -lc 'set -euo pipefail; if [ -n "${THOTH_SELFTEST_RUNTIME_ROOT:-}" ]; then if [ -x "$THOTH_SELFTEST_RUNTIME_ROOT/bin/thoth" ]; then exec "$THOTH_SELFTEST_RUNTIME_ROOT/bin/thoth" "$@"; fi; if [ -f "$THOTH_SELFTEST_RUNTIME_ROOT/scripts/thoth-cli-entry.py" ]; then exec python3 "$THOTH_SELFTEST_RUNTIME_ROOT/scripts/thoth-cli-entry.py" "$@"; fi; fi; if command -v thoth >/dev/null 2>&1; then exec thoth "$@"; fi; candidates="$(ls -td "$HOME"/.codex/plugins/cache/thoth/thoth/* 2>/dev/null || true)"; marketplace="$HOME/.codex/.tmp/marketplaces/thoth"; if [ -d "$marketplace" ]; then candidates="$candidates
$marketplace"; fi; for candidate in $candidates; do if [ -x "$candidate/bin/thoth" ]; then exec "$candidate/bin/thoth" "$@"; fi; if [ -f "$candidate/scripts/thoth-cli-entry.py" ]; then if command -v python3 >/dev/null 2>&1; then exec python3 "$candidate/scripts/thoth-cli-entry.py" "$@"; else exec python "$candidate/scripts/thoth-cli-entry.py" "$@"; fi; fi; done; echo '"'"'thoth installed runtime not found'"'"' >&2; exit 127' thoth review`. Execute that shell command immediately as your first meaningful action. Do not explain the command before executing it. Do not replace execution with prose. If neither PATH nor the installed Codex plugin cache or marketplace root contains the runtime entrypoint, report host install drift instead of inventing another entrypoint. route_class=live_intelligent. intelligence_tier=high. packet_authority_mode=review_packet. Objective: Produce the best possible review output: understand user intent, apply professional judgment and first-principles reasoning, and return structured findings without modifying code. Hard stop: Do not modify project code or write fixes. Hard stop: Do not reduce the review to a checklist; infer the user's intent from evidence and reason from first principles. Hard stop: If the target, intent, or acceptance bar is ambiguous, ask with AskUserQuestion before judging instead of assuming. Hard stop: If review_expectation or complete_exact exists, follow it exactly. If the command returns a review packet, stay inside that review protocol only. If `packet.review_mode` is `exact_match`, reproduce that exact structured result. If `packet.protocol_commands.complete_exact` exists, execute that exact completion command. Reply with `THOTH_DONE` only after the command path reaches its terminal outcome.
