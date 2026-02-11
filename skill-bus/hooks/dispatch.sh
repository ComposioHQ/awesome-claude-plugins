#!/bin/bash
# Skill Bus - shared dispatcher logic
# Usage: dispatch.sh <pre|post>
# Fast path: pure bash, no Python. ~6ms for no-match case.

TIMING="$1"
[ -z "$TIMING" ] && exit 0

GLOBAL_CONFIG="${SKILL_BUS_GLOBAL_CONFIG:-$HOME/.claude/skill-bus.json}"
PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Read stdin (hook input JSON)
INPUT=$(cat)

# Fast path 1: extract CWD, check config files exist
CWD=$(echo "$INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/')
[ -z "$CWD" ] && CWD="$PWD"
PROJECT_CONFIG="$CWD/.claude/skill-bus.json"

if [ ! -f "$GLOBAL_CONFIG" ] && [ ! -f "$PROJECT_CONFIG" ]; then
    # First-run nudge: once per project (marker file in .claude/)
    NUDGE_FLAG="$CWD/.claude/.sb-nudged"
    if [ ! -f "$NUDGE_FLAG" ]; then
        mkdir -p "$CWD/.claude" 2>/dev/null || true
        touch "$NUDGE_FLAG" 2>/dev/null || true
        echo '{"systemMessage":"[skill-bus] No subscriptions configured. Run /skill-bus:onboard for guided setup, or /skill-bus:help to get started."}'
    fi
    exit 0
fi

# Fast path 2: extract skill name via bash (no Python needed)
SKILL_NAME=$(echo "$INPUT" | grep -o '"skill"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/')
if [ -z "$SKILL_NAME" ]; then
    echo '{"systemMessage":"[skill-bus] WARNING - could not extract skill name from hook input. Check plugin compatibility."}'
    exit 0
fi

# ─── Completion signal handling ───
# If skill is "skill-bus:complete", route to Python slow path with --timing complete
# The completed skill name and chain depth are in the "args" field of the tool input
# Only process on pre timing — post timing for skill-bus:complete should be a no-op
if [ "$SKILL_NAME" = "skill-bus:complete" ] && [ "$TIMING" = "pre" ]; then
    # Extract the args field (contains completed skill name + optional --depth N)
    COMPLETE_ARGS=$(echo "$INPUT" | grep -o '"args"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/')
    if [ -z "$COMPLETE_ARGS" ]; then
        # No args = no completed skill name, nothing to trigger
        exit 0
    fi
    # Extract completed skill name (first token before --depth)
    # Require at least one space before --depth to avoid false match in skill names containing "depth"
    # Reject args that start with -- (no skill name present, e.g. "--depth 2")
    case "$COMPLETE_ARGS" in
        --*) exit 0 ;;
    esac
    COMPLETED_SKILL=$(echo "$COMPLETE_ARGS" | sed 's/ \{1,\}--depth.*//')
    if [ -z "$COMPLETED_SKILL" ]; then
        exit 0
    fi
    # Chain depth guard: extract --depth N from args (default 0)
    CHAIN_DEPTH=$(echo "$COMPLETE_ARGS" | grep -oE '\-\-depth [0-9]+' | awk '{print $2}')
    CHAIN_DEPTH="${CHAIN_DEPTH:-0}"
    # Guard against non-numeric extraction
    case "$CHAIN_DEPTH" in
        ''|*[!0-9]*) CHAIN_DEPTH=0 ;;
    esac
    if [ "$CHAIN_DEPTH" -ge 5 ]; then
        echo '{"systemMessage":"[skill-bus] WARNING: chain depth limit reached (5). Stopping to prevent infinite loop."}'
        exit 0
    fi
    # Verify python3 exists
    if ! command -v python3 &>/dev/null; then
        echo '{"systemMessage":"[skill-bus] ERROR - python3 not found. Install Python 3 to enable subscriptions."}'
        exit 0
    fi
    # Pass chain depth to Python via env var (for injection of incremented depth in downstream instructions)
    export _SB_CHAIN_DEPTH=$((CHAIN_DEPTH + 1))
    SKILL_BUS_SKILL="$COMPLETED_SKILL" python3 "$PLUGIN_ROOT/lib/dispatcher.py" --timing complete --cwd "$CWD"
    exit 0
fi
# Post timing for skill-bus:complete — no-op (completion only fires on pre)
if [ "$SKILL_NAME" = "skill-bus:complete" ] && [ "$TIMING" = "post" ]; then
    exit 0
fi

# Fast path 3: skill name not in either config file
# grep -F for literal string match (no regex injection via skill names)
# Separate check for wildcard patterns (scoped to "on" field to reduce false positives)
# Note: Subscriptions with "conditions" still contain the skill name in the "on" field,
# so grep-F matching works correctly. Condition evaluation happens in the Python slow path.
# No fast-path changes needed for v0.3.0 conditions feature.
FOUND=0
if [ -f "$GLOBAL_CONFIG" ]; then
    grep -qF "\"$SKILL_NAME\"" "$GLOBAL_CONFIG" 2>/dev/null && FOUND=1
    [ "$FOUND" -eq 0 ] && grep -qE '"on"[[:space:]]*:[[:space:]]*"[^"]*\*' "$GLOBAL_CONFIG" 2>/dev/null && FOUND=1
fi
if [ "$FOUND" -eq 0 ] && [ -f "$PROJECT_CONFIG" ]; then
    grep -qF "\"$SKILL_NAME\"" "$PROJECT_CONFIG" 2>/dev/null && FOUND=1
    [ "$FOUND" -eq 0 ] && grep -qE '"on"[[:space:]]*:[[:space:]]*"[^"]*\*' "$PROJECT_CONFIG" 2>/dev/null && FOUND=1
fi
if [ "$FOUND" -eq 0 ]; then
    # Telemetry: log no_match if enabled + observeUnmatched + telemetry are all true (triple check)
    OBSERVE=0
    if [ -f "$PROJECT_CONFIG" ]; then
        # Check enabled is not explicitly false (absent = true by default)
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
    if [ "$OBSERVE" -eq 1 ] && [ -n "$SKILL_NAME" ]; then
        # Use Python one-liner for JSON-safe output (avoids shell injection via skill names)
        LOGDIR="$CWD/.claude"
        LOGFILE="$LOGDIR/skill-bus-telemetry.jsonl"
        if [ -d "$LOGDIR" ]; then
            _SB_SKILL="$SKILL_NAME" _SB_LOG="$LOGFILE" python3 -c "
import json, time, os
entry = {'ts': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'sessionId': str(os.getpid()), 'event': 'no_match', 'skill': os.environ.get('_SB_SKILL',''), 'source': 'fast_path'}
with open(os.environ.get('_SB_LOG',''), 'a') as f: f.write(json.dumps(entry, separators=(',',':')) + '\n')
" 2>/dev/null
        fi
    fi
    exit 0
fi

# Slow path: verify python3 exists
if ! command -v python3 &>/dev/null; then
    echo '{"systemMessage":"[skill-bus] ERROR - python3 not found. Install Python 3 to enable subscriptions."}'
    exit 0
fi

# Slow path: full matching via Python dispatcher
# Skill name passed via env var (avoids shell injection via command args)
# Note: hook framework enforces 5s timeout via hooks.json - no need for bash timeout
SKILL_BUS_SKILL="$SKILL_NAME" python3 "$PLUGIN_ROOT/lib/dispatcher.py" --timing "$TIMING" --cwd "$CWD"
