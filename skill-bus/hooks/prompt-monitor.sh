#!/bin/bash
# WORKAROUND: Compensates for Claude Code not emitting Skill tool calls on direct slash commands.
# Remove this when/if the framework adds proper slash command hook events.
# Opt-in via monitorSlashCommands: true in skill-bus config
# Fast path: ~2ms exit for non-slash prompts or when disabled (5-layer)

GLOBAL_CONFIG="${SKILL_BUS_GLOBAL_CONFIG:-$HOME/.claude/skill-bus.json}"
PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Read stdin (hook input JSON)
INPUT=$(cat)

# Fast path 1: check if either config exists
CWD=$(printf '%s' "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/')
[ -z "$CWD" ] && CWD="$PWD"
PROJECT_CONFIG="$CWD/.claude/skill-bus.json"

[ ! -f "$GLOBAL_CONFIG" ] && [ ! -f "$PROJECT_CONFIG" ] && exit 0

# Fast path 2: check monitorSlashCommands setting
# Project can override global: check project LAST so it wins
MONITOR=0
if [ -f "$GLOBAL_CONFIG" ]; then
    grep -q '"monitorSlashCommands"[[:space:]]*:[[:space:]]*true' "$GLOBAL_CONFIG" 2>/dev/null && MONITOR=1
fi
if [ -f "$PROJECT_CONFIG" ]; then
    if grep -q '"monitorSlashCommands"[[:space:]]*:[[:space:]]*true' "$PROJECT_CONFIG" 2>/dev/null; then
        MONITOR=1
    elif grep -q '"monitorSlashCommands"[[:space:]]*:[[:space:]]*false' "$PROJECT_CONFIG" 2>/dev/null; then
        MONITOR=0
    fi
fi
[ "$MONITOR" -eq 0 ] && exit 0

# NOTE: No 'enabled' check here — merge semantics (project overrides global) are
# complex to replicate in bash. Let Python dispatcher handle it, matching dispatch.sh.

# Fast path 3: check if prompt starts with /
PROMPT=$(printf '%s' "$INPUT" | grep -o '"prompt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/')
[ -z "$PROMPT" ] && exit 0

case "$PROMPT" in
    /*) ;;
    *) exit 0 ;;
esac

# Extract command name: strip leading /, take first word only
CMD_NAME="${PROMPT#/}"
CMD_NAME="${CMD_NAME%% *}"
CMD_NAME=$(printf '%s' "$CMD_NAME" | sed 's/[[:space:]]*$//')
[ -z "$CMD_NAME" ] && exit 0

# Fast path 4: skip known built-in commands (non-exhaustive; false positives handled by Python)
case "$CMD_NAME" in
    help|clear|compact|init|login|logout|config|status|stats|doctor|memory|cost|tasks|skill-bus:complete) exit 0 ;;
esac

# Fast path 5: check if command name exists in config
# Note: uses bare name (no quotes) because short names like "finishing-a-development-branch"
# appear as substrings in qualified patterns like "superpowers:finishing-a-development-branch".
# This produces more false positives than dispatch.sh's quoted grep, but correctness is
# preserved by the Python slow path.
# Note: Conditions are evaluated in the Python slow path. The bash fast-path only checks
# if the skill/command name appears in config files (via grep). This is correct because
# subscriptions with conditions still have "on" patterns containing the skill name.
FOUND=0
if [ -f "$GLOBAL_CONFIG" ]; then
    grep -qF "$CMD_NAME" "$GLOBAL_CONFIG" 2>/dev/null && FOUND=1
    [ "$FOUND" -eq 0 ] && grep -qE '"on"[[:space:]]*:[[:space:]]*"[^"]*\*' "$GLOBAL_CONFIG" 2>/dev/null && FOUND=1
fi
if [ "$FOUND" -eq 0 ] && [ -f "$PROJECT_CONFIG" ]; then
    grep -qF "$CMD_NAME" "$PROJECT_CONFIG" 2>/dev/null && FOUND=1
    [ "$FOUND" -eq 0 ] && grep -qE '"on"[[:space:]]*:[[:space:]]*"[^"]*\*' "$PROJECT_CONFIG" 2>/dev/null && FOUND=1
fi
if [ "$FOUND" -eq 0 ]; then
    # Telemetry: log no_match if enabled + observeUnmatched + telemetry all true
    OBSERVE=0
    if [ -f "$PROJECT_CONFIG" ]; then
        if ! grep -q '"enabled"[[:space:]]*:[[:space:]]*false' "$PROJECT_CONFIG" 2>/dev/null; then
            grep -q '"observeUnmatched"[[:space:]]*:[[:space:]]*true' "$PROJECT_CONFIG" 2>/dev/null && \
            grep -q '"telemetry"[[:space:]]*:[[:space:]]*true' "$PROJECT_CONFIG" 2>/dev/null && OBSERVE=1
        fi
    fi
    if [ "$OBSERVE" -eq 0 ] && [ -f "$GLOBAL_CONFIG" ]; then
        if ! grep -q '"enabled"[[:space:]]*:[[:space:]]*false' "$GLOBAL_CONFIG" 2>/dev/null; then
            grep -q '"observeUnmatched"[[:space:]]*:[[:space:]]*true' "$GLOBAL_CONFIG" 2>/dev/null && \
            grep -q '"telemetry"[[:space:]]*:[[:space:]]*true' "$GLOBAL_CONFIG" 2>/dev/null && OBSERVE=1
        fi
    fi
    if [ "$OBSERVE" -eq 1 ] && [ -n "$CMD_NAME" ]; then
        LOGDIR="$CWD/.claude"
        LOGFILE="$LOGDIR/skill-bus-telemetry.jsonl"
        if [ -d "$LOGDIR" ]; then
            _SB_SKILL="$CMD_NAME" _SB_LOG="$LOGFILE" python3 -c "
import json, time, os
entry = {'ts': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'sessionId': str(os.getpid()), 'event': 'no_match', 'skill': os.environ.get('_SB_SKILL',''), 'source': 'prompt_fast_path'}
with open(os.environ.get('_SB_LOG',''), 'a') as f: f.write(json.dumps(entry, separators=(',',':')) + '\n')
" 2>/dev/null
        fi
    fi
    exit 0
fi

# Slow path: verify python3 exists
if ! command -v python3 &>/dev/null; then
    echo '{"systemMessage":"[skill-bus] ERROR - python3 not found."}'
    exit 0
fi

# Slow path: delegate to Python dispatcher with --source prompt
export SKILL_BUS_SKILL="$CMD_NAME"
exec python3 "$PLUGIN_ROOT/lib/dispatcher.py" --timing pre --source prompt --cwd "$CWD"
