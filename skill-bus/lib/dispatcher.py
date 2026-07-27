#!/usr/bin/env python3
"""
Skill Bus Dispatcher - routes skill events to matching subscriptions.

Usage:
    SKILL_BUS_SKILL=<name> python3 dispatcher.py --timing pre|post --cwd <path>

Skill name passed via env var to avoid shell injection.

Loads config from:
    1. ~/.claude/skill-bus.json (global)
    2. .claude/skill-bus.json (project, relative to CWD)

Merges subscriptions, applies overrides, outputs hookSpecificOutput JSON.
"""

import json
import sys
import os
import fnmatch
import argparse
import subprocess
import re
import time

try:
    from telemetry import log_event
except ImportError:
    log_event = None  # Telemetry module not available — logging disabled


# Dynamic insert handlers — registered by type name
_dynamic_handlers = {}


def register_dynamic_handler(name, handler):
    """Register a dynamic insert handler. Handler signature: handler(cwd, settings) -> str or None."""
    _dynamic_handlers[name] = handler


def _dynamic_session_stats(cwd, settings):
    """Generate session stats summary for injection into completion skills."""
    try:
        from telemetry import read_telemetry
    except ImportError:
        return None

    events = read_telemetry(cwd, settings)
    if not events:
        return None

    matches = [e for e in events if e.get("event") == "match"]
    skips = [e for e in events if e.get("event") == "condition_skip"]
    no_match = [e for e in events if e.get("event") == "no_match"]

    matched_skills = set(m.get("skill", "?") for m in matches)

    lines = ["[skill-bus session summary]"]
    lines.append(f"Skills intercepted: {len(matched_skills)} | Inserts injected: {len(matches)}")

    if skips:
        skip_by_insert = {}
        for s in skips:
            insert = s.get("insert", "?")
            skip_by_insert[insert] = skip_by_insert.get(insert, 0) + 1
        skip_parts = [f"{ins} ({cnt}x)" for ins, cnt in skip_by_insert.items()]
        lines.append(f"Condition skips: {', '.join(skip_parts)}")

    if no_match:
        no_match_by_skill = {}
        for n in no_match:
            skill = n.get("skill", "?")
            no_match_by_skill[skill] = no_match_by_skill.get(skill, 0) + 1

        gaps = [(s, c) for s, c in no_match_by_skill.items() if c >= 3]
        if gaps:
            lines.append("Gaps:")
            for skill, count in sorted(gaps, key=lambda x: -x[1]):
                lines.append(f"  {skill} ran {count}x with no subscriptions")
                lines.append(f"  Suggestion: add a subscription for {skill}")

    return "\n".join(lines)


register_dynamic_handler("session-stats", _dynamic_session_stats)


DEFAULT_SETTINGS = {
    "enabled": True,
    "maxMatchesPerSkill": 3,
    "showConsoleEcho": True,
    "disableGlobal": False,
    "monitorSlashCommands": False,
    "showConditionSkips": False,
    "telemetry": False,
    "observeUnmatched": False,
    "telemetryPath": "",
    "maxLogSizeKB": 512
}

# Collector for non-fatal warnings to include in systemMessage
_warnings = []


def load_config(path):
    """Load a skill-bus config file. Returns None if not found, warns on malformed JSON."""
    expanded = os.path.expanduser(path)
    if not os.path.exists(expanded):
        return None
    try:
        with open(expanded) as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        _warnings.append(f"[skill-bus] WARNING - {path} has invalid JSON ({e}). Fix to restore subscriptions.")
        return None


def merge_inserts(global_config, project_config):
    """Merge global and project inserts. Project wins on name collision."""
    global_inserts = {}
    project_inserts = {}

    if global_config:
        global_inserts = global_config.get("inserts", {})
    if project_config:
        project_inserts = project_config.get("inserts", {})

    # Check for name collisions (INFO: intentional override)
    for name in project_inserts:
        if name in global_inserts:
            _warnings.append(
                f"[skill-bus] INFO: insert '{name}' defined in both scopes — using project version"
            )

    # Merge: global first, project overwrites (project wins)
    merged = dict(global_inserts)
    merged.update(project_inserts)

    return merged, set()  # No conflicts — project always wins


def merge_configs(global_config, project_config):
    """Merge global and project configs.

    Uses insert-based subscriptions. Override directives in project scope
    (enabled:false) suppress matching global subs.
    """
    settings = dict(DEFAULT_SETTINGS)
    if global_config and "settings" in global_config:
        settings.update(global_config["settings"])
    if project_config and "settings" in project_config:
        settings.update(project_config["settings"])

    if not settings.get("enabled", True):
        return settings, []

    global_subs = []
    project_subs = []

    if global_config and not settings.get("disableGlobal", False):
        global_subs = global_config.get("subscriptions", [])

    if project_config:
        project_subs = project_config.get("subscriptions", [])

    # Separate project subs into override directives vs active subs
    overrides_specific = []     # Level 1: (insert, on, when) tuples
    overrides_insert = set()    # Level 2: insert names
    active_project_subs = []

    for sub in project_subs:
        if not isinstance(sub, dict):
            continue
        if sub.get("enabled") is False:
            if "insert" in sub:
                # Override directive: disable global subs matching this insert
                if "on" in sub and "when" in sub:
                    overrides_specific.append((sub["insert"], sub["on"], sub["when"]))
                else:
                    overrides_insert.add(sub["insert"])
            # else: self-disabled subscription without insert, skip silently
            continue
        active_project_subs.append(sub)

    # Filter global subs against overrides
    filtered_global = []
    for s in global_subs:
        if not isinstance(s, dict):
            continue
        if s.get("enabled", True) is False:
            continue
        # Check Level 2: all subs for this insert disabled
        if s.get("insert") in overrides_insert:
            continue
        # Check Level 1: specific tuple disabled
        sub_tuple = (s.get("insert", ""), s.get("on", ""), s.get("when", "pre"))
        if sub_tuple in overrides_specific:
            continue
        filtered_global.append(s)

    # Tag scope for dedup warning clarity
    for s in filtered_global:
        s["_scope"] = "global"
    for s in active_project_subs:
        s["_scope"] = "project"

    all_subs = filtered_global + active_project_subs

    # Deduplicate by insert+on+when tuple (project wins)
    seen_tuples = {}
    deduped = []
    for s in reversed(all_subs):  # Reversed so project (later) wins
        key = (s.get("insert", s.get("id", "")), s.get("on", ""), s.get("when", "pre"))
        if key not in seen_tuples:
            seen_tuples[key] = s.get("_scope", "unknown")
            deduped.append(s)
        else:
            winner_scope = seen_tuples[key]
            loser_scope = s.get("_scope", "unknown")
            if winner_scope == loser_scope:
                _warnings.append(
                    f"[skill-bus] WARNING: duplicate subscription ({key[0]} -> {key[1]} [{key[2]}]) in {loser_scope} scope — deduplicating"
                )
            else:
                _warnings.append(
                    f"[skill-bus] WARNING: duplicate subscription ({key[0]} -> {key[1]} [{key[2]}]) — using {winner_scope} version"
                )
    deduped.reverse()  # Restore original order

    # Clean up scope tags from all tagged subs (not just deduped — losers also got tagged)
    for s in filtered_global + active_project_subs:
        s.pop("_scope", None)

    return settings, deduped


VALID_TIMINGS = {"pre", "post", "complete"}

# Per-dispatch cache for expensive condition evaluations.
# Populated once per dispatcher invocation, cleared on next invocation.
# Prevents N redundant subprocess calls when N subscriptions share the same condition type.
_condition_cache = {}


def _get_git_branch(cwd):
    """Get current git branch, cached per CWD within a single dispatch."""
    cache_key = ("gitBranch", cwd)
    if cache_key in _condition_cache:
        return _condition_cache[cache_key]
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True, text=True, timeout=2, cwd=cwd
        )
        branch = result.stdout.strip() if result.returncode == 0 else None
    except (subprocess.TimeoutExpired, OSError):
        branch = None
    _condition_cache[cache_key] = branch
    return branch


def evaluate_condition(condition, cwd):
    """Evaluate a single condition. Returns True if condition is met."""
    if not isinstance(condition, dict) or len(condition) != 1:
        _warnings.append(f"[skill-bus] WARNING: malformed condition {repr(condition)}, treating as false")
        return False

    cond_type, cond_value = next(iter(condition.items()))

    if cond_type == "not":
        # Guard: wrapped value must be a dict (a condition object)
        if not isinstance(cond_value, dict):
            _warnings.append(f"[skill-bus] WARNING: 'not' condition must wrap a condition object, got {type(cond_value).__name__}")
            return False  # Fail-safe: malformed not → don't fire
        # Warn on double negation (likely a mistake)
        if "not" in cond_value:
            _warnings.append("[skill-bus] WARNING: double negation in condition — likely a mistake")
        return not evaluate_condition(cond_value, cwd)

    if cond_type == "fileExists":
        path = os.path.expanduser(cond_value)
        if not os.path.isabs(path):
            path = os.path.join(cwd, path)
        return os.path.exists(path)

    if cond_type == "gitBranch":
        branch = _get_git_branch(cwd)
        if branch is None:
            return False  # Not a git repo or git not available
        return fnmatch.fnmatch(branch, cond_value)

    if cond_type == "envSet":
        val = os.environ.get(cond_value, "")
        return len(val) > 0

    if cond_type == "envEquals":
        if not isinstance(cond_value, dict):
            _warnings.append(f"[skill-bus] WARNING: envEquals requires {{\"var\": ..., \"value\": ...}}, got {type(cond_value).__name__}")
            return False
        var_name = cond_value.get("var")
        expected = cond_value.get("value")
        if not var_name:
            _warnings.append("[skill-bus] WARNING: envEquals missing 'var' field")
            return False
        if expected is None:
            _warnings.append("[skill-bus] WARNING: envEquals missing 'value' field")
            return False
        if not isinstance(expected, str):
            _warnings.append(f"[skill-bus] WARNING: envEquals 'value' must be a string, got {type(expected).__name__}. Use \"3000\" not 3000.")
            return False
        return os.environ.get(var_name, "") == expected

    if cond_type == "fileContains":
        if not isinstance(cond_value, dict):
            _warnings.append(f"[skill-bus] WARNING: fileContains requires {{\"file\": ..., \"pattern\": ...}}, got {type(cond_value).__name__}")
            return False
        file_path = cond_value.get("file", "")
        pattern = cond_value.get("pattern", "")
        if not file_path or not pattern:
            _warnings.append("[skill-bus] WARNING: fileContains missing 'file' or 'pattern' field")
            return False
        use_regex = cond_value.get("regex", False) is True
        # Pre-compile regex to catch errors early
        compiled_re = None
        if use_regex:
            if len(pattern) > 500:
                _warnings.append("[skill-bus] WARNING: fileContains regex pattern too long (>500 chars), skipping")
                return False
            try:
                compiled_re = re.compile(pattern)
            except re.error as e:
                _warnings.append(f"[skill-bus] WARNING: fileContains regex error: {e}")
                return False
        full_path = os.path.expanduser(file_path)
        if not os.path.isabs(full_path):
            full_path = os.path.join(cwd, full_path)
        if os.path.basename(full_path).startswith('.'):
            _warnings.append(f"[skill-bus] WARNING: fileContains references dotfile '{file_path}' — ensure this is intentional")
        if not os.path.isfile(full_path):
            return False
        try:
            # Size guard: skip files > 1MB to avoid timeout within 5s hook window
            if os.path.getsize(full_path) > 1_000_000:
                _warnings.append(f"[skill-bus] WARNING: fileContains skipped — file exceeds 1MB size limit: {file_path}")
                return False
            with open(full_path, "r", errors="replace") as f:
                for line in f:
                    if use_regex:
                        if compiled_re.search(line):
                            return True
                    else:
                        if pattern in line:
                            return True
            return False
        except OSError:
            return False

    _warnings.append(f"[skill-bus] WARNING: unknown condition type '{cond_type}', treating as false")
    return False


def evaluate_conditions(conditions, cwd):
    """Evaluate all conditions for a subscription. Returns True if all pass (AND)."""
    if not conditions:
        return True
    for condition in conditions:
        if not evaluate_condition(condition, cwd):
            return False
    return True


def resolve_effective_conditions(sub, inserts_map):
    """Resolve the effective conditions for a subscription by stacking insert-level
    and subscription-level conditions.

    Returns a list of condition objects to evaluate (may be empty = unconditional).

    Stacking rules:
    - Insert conditions are inherited by default
    - "inheritConditions": false on subscription opts out of insert conditions
    - Subscription conditions are AND-stacked after insert conditions
    - "conditions": [] or omitted conditions on subscription = no sub-level conditions
    """
    insert_name = sub.get("insert", "unnamed")
    sub_conditions = sub.get("conditions")
    opt_out = sub.get("inheritConditions") is False

    # Get insert-level conditions (if inserts_map provided and not opted out)
    insert_conditions = []
    if not opt_out and inserts_map is not None:
        insert_def = inserts_map.get(insert_name)
        if insert_def and isinstance(insert_def, dict):
            insert_conditions = insert_def.get("conditions", []) or []

    # Stack: insert conditions first, then subscription conditions
    effective = list(insert_conditions)
    if sub_conditions:
        effective.extend(sub_conditions)

    return effective


def match_subscriptions(skill_name, timing, subscriptions, max_matches, cwd=None, settings=None, inserts_map=None):
    """Find subscriptions matching this skill and timing, with condition evaluation.

    Condition stacking: insert-level conditions are evaluated first (if present),
    then subscription-level conditions. Both must pass (AND). A subscription with
    "inheritConditions": false opts out of insert-level conditions.
    """
    matched = []
    total_matching = 0
    condition_skips = []
    for sub in subscriptions:
        when = sub.get("when", "pre")
        if when not in VALID_TIMINGS:
            _warnings.append(f"[skill-bus] WARNING: subscription '{sub.get('insert', 'unnamed')}' has invalid 'when' value: {repr(when)}. Use 'pre', 'post', or 'complete'.")
            continue
        if when != timing:
            continue
        pattern = sub.get("on", "")
        if fnmatch.fnmatch(skill_name, pattern):
            insert_name = sub.get("insert", "unnamed")
            effective_conditions = resolve_effective_conditions(sub, inserts_map)

            if effective_conditions:
                if not cwd:
                    _warnings.append("[skill-bus] WARNING: conditions present but no CWD, skipping subscription")
                    condition_skips.append(insert_name)
                    if log_event and settings and settings.get("telemetry", False):
                        log_event("condition_skip", cwd, settings=settings,
                                  skill=skill_name, insert=insert_name,
                                  pattern=pattern)
                    continue
                if not evaluate_conditions(effective_conditions, cwd):
                    condition_skips.append(insert_name)
                    if log_event and settings and settings.get("telemetry", False):
                        log_event("condition_skip", cwd, settings=settings,
                                  skill=skill_name, insert=insert_name,
                                  pattern=pattern)
                    continue
            total_matching += 1
            if len(matched) < max_matches:
                matched.append(sub)
    if total_matching > max_matches:
        _warnings.append(f"[skill-bus] {total_matching} subs matched but maxMatchesPerSkill={max_matches}, showing first {max_matches}")
    # Debug logging for condition skips (opt-in via config or env var)
    show_skips = (settings and settings.get("showConditionSkips", False)) or os.environ.get("SKILL_BUS_DEBUG") == "1"
    if condition_skips and show_skips:
        _warnings.append(f"[skill-bus] conditions not met, skipped: {', '.join(condition_skips)}")
    return matched


def match_subscriptions_prompt(cmd_name, subscriptions, max_matches, cwd=None, settings=None, inserts_map=None):
    """Match subscriptions for prompt-sourced slash commands, with condition evaluation.

    Condition stacking: insert-level conditions are evaluated first (if present),
    then subscription-level conditions. Both must pass (AND). A subscription with
    "inheritConditions": false opts out of insert-level conditions.
    """
    matched = []
    total_matching = 0
    condition_skips = []

    has_prefix = ":" in cmd_name

    for sub in subscriptions:
        when = sub.get("when", "pre")
        if when != "pre":
            continue

        pattern = sub.get("on", "")
        pattern_matched = False

        if has_prefix:
            if fnmatch.fnmatch(cmd_name, pattern):
                pattern_matched = True
        else:
            if ":" in pattern:
                pattern_suffix = pattern.split(":", 1)[1]
                if pattern_suffix in ("*", "**"):
                    continue
                if fnmatch.fnmatch(cmd_name, pattern_suffix):
                    pattern_matched = True
            else:
                if fnmatch.fnmatch(cmd_name, pattern):
                    pattern_matched = True

        if pattern_matched:
            insert_name = sub.get("insert", "unnamed")
            effective_conditions = resolve_effective_conditions(sub, inserts_map)

            if effective_conditions:
                if not cwd:
                    _warnings.append("[skill-bus] WARNING: conditions present but no CWD, skipping subscription")
                    condition_skips.append(insert_name)
                    if log_event and settings and settings.get("telemetry", False):
                        log_event("condition_skip", cwd, settings=settings,
                                  skill=cmd_name, insert=insert_name,
                                  pattern=pattern, source="prompt")
                    continue
                if not evaluate_conditions(effective_conditions, cwd):
                    condition_skips.append(insert_name)
                    if log_event and settings and settings.get("telemetry", False):
                        log_event("condition_skip", cwd, settings=settings,
                                  skill=cmd_name, insert=insert_name,
                                  pattern=pattern, source="prompt")
                    continue
            total_matching += 1
            if len(matched) < max_matches:
                matched.append(sub)

    if total_matching > max_matches:
        _warnings.append(f"[skill-bus] {total_matching} subs matched but maxMatchesPerSkill={max_matches}, showing first {max_matches}")
    show_skips = (settings and settings.get("showConditionSkips", False)) or os.environ.get("SKILL_BUS_DEBUG") == "1"
    if condition_skips and show_skips:
        _warnings.append(f"[skill-bus] conditions not met, skipped: {', '.join(condition_skips)}")
    return matched


def build_output(matched, timing, settings, source="tool", inserts_map=None, cwd=None):
    """Build the hookSpecificOutput JSON for Claude."""
    if not matched:
        return None

    context_parts = []
    sub_labels = []
    seen_inserts = set()
    for sub in matched:
        insert_name = sub.get("insert")
        if insert_name and inserts_map is not None:
            if insert_name in seen_inserts:
                continue
            seen_inserts.add(insert_name)
            insert_def = inserts_map.get(insert_name)
            if insert_def:
                text = insert_def.get("text", "")

                # Dynamic insert resolution
                dynamic_type = insert_def.get("dynamic")
                if dynamic_type:
                    handler = _dynamic_handlers.get(dynamic_type)
                    if handler:
                        try:
                            dynamic_text = handler(cwd, settings)
                            if dynamic_text:
                                text = dynamic_text
                        except Exception as e:
                            _warnings.append(f"[skill-bus] WARNING: dynamic handler '{dynamic_type}' failed: {e}")
                    else:
                        _warnings.append(f"[skill-bus] WARNING: unknown dynamic handler '{dynamic_type}', using static text")

                if text:
                    context_parts.append(text)
                    on_short = sub.get("on", "?").split(":")[-1]
                    sub_labels.append(f"{insert_name} -> {on_short} [{sub.get('when', 'pre')}]")
            else:
                _warnings.append(f"[skill-bus] WARNING: dangling insert reference '{insert_name}' — skipping")
        else:
            # No insert reference — malformed or old inject format
            if sub.get("inject"):
                _warnings.append("[skill-bus] WARNING: subscription uses old 'inject' format — skipped")
            continue

    if not context_parts:
        return None

    combined_context = "\n\n".join(context_parts)

    # Map source + timing to correct hookEventName
    if source == "prompt":
        event_name = "UserPromptSubmit"
    elif timing in ("pre", "complete"):
        event_name = "PreToolUse"
    else:
        event_name = "PostToolUse"

    result = {
        "hookSpecificOutput": {
            "hookEventName": event_name,
            "additionalContext": combined_context
        }
    }

    # Console echo + any warnings via systemMessage
    messages = list(_warnings)
    if settings.get("showConsoleEcho", True) and context_parts:
        label = "[skill-bus] prompt-monitor:" if source == "prompt" else "[skill-bus]"
        messages.append(f"{label} {len(sub_labels)} sub(s) matched ({', '.join(sub_labels)})")
    if messages:
        result["systemMessage"] = " | ".join(messages)

    return result


def _main():
    _condition_cache.clear()  # Fresh cache per dispatch invocation
    _warnings.clear()
    _start = time.monotonic()

    parser = argparse.ArgumentParser(description="Skill Bus Dispatcher")
    parser.add_argument("--timing", choices=["pre", "post", "complete"], required=True)
    parser.add_argument("--cwd", default=os.getcwd())
    parser.add_argument("--source", choices=["tool", "prompt"], default="tool")
    args = parser.parse_args()

    # Skill name from env var (avoids shell injection via command args)
    skill_name = os.environ.get("SKILL_BUS_SKILL", "")
    if not skill_name:
        sys.exit(0)

    global_path = os.environ.get("SKILL_BUS_GLOBAL_CONFIG", "~/.claude/skill-bus.json")
    global_config = load_config(global_path)
    project_config_path = os.path.join(args.cwd, ".claude", "skill-bus.json")
    project_config = load_config(project_config_path)

    settings, subscriptions = merge_configs(global_config, project_config)
    inserts_map, _ = merge_inserts(global_config, project_config)

    # Detect and skip old-format subscriptions
    old_format = [s for s in subscriptions if "inject" in s and "insert" not in s]
    if old_format:
        _warnings.append(
            f"[skill-bus] ERROR: {len(old_format)} subscription(s) use old 'inject' format — skipped. "
            "Migrate: extract inject text into an insert, replace 'inject' with 'insert' reference."
        )
        subscriptions = [s for s in subscriptions if not ("inject" in s and "insert" not in s)]

    if not settings.get("enabled", True):
        print(json.dumps({"systemMessage": "[skill-bus] Disabled via settings. Run /skill-bus:unpause-subs to re-enable."}))
        sys.exit(0)

    # Gate: complete timing requires completionHooks setting (experimental)
    if args.timing == "complete" and not settings.get("completionHooks", False):
        sys.exit(0)

    max_matches = settings.get("maxMatchesPerSkill", 3)
    if not isinstance(max_matches, int) or max_matches < 1:
        _warnings.append(f"[skill-bus] WARNING - invalid maxMatchesPerSkill={repr(max_matches)}, using default 3")
        max_matches = 3
    if args.source == "prompt":
        matched = match_subscriptions_prompt(skill_name, subscriptions, max_matches, cwd=args.cwd, settings=settings, inserts_map=inserts_map)
    else:
        matched = match_subscriptions(skill_name, args.timing, subscriptions, max_matches, cwd=args.cwd, settings=settings, inserts_map=inserts_map)

    # Auto-inject completion instruction if skill has any "when": "complete" subscriptions
    # This check MUST run before the "if not matched" early exit below,
    # because a skill may have zero pre-subs but still need the instruction.
    completion_instruction = None
    if args.timing == "pre" and args.source in ("tool", "prompt") and settings.get("completionHooks", False):
        has_complete_subs = False
        for sub in subscriptions:
            if sub.get("when") == "complete":
                pattern = sub.get("on", "")
                if fnmatch.fnmatch(skill_name, pattern):
                    has_complete_subs = True
                    break
        if has_complete_subs:
            # Include chain depth from env var (set by dispatch.sh on recursive completions)
            try:
                chain_depth = int(os.environ.get("_SB_CHAIN_DEPTH", "0"))
            except (ValueError, TypeError):
                _warnings.append(f"[skill-bus] WARNING: invalid _SB_CHAIN_DEPTH={os.environ.get('_SB_CHAIN_DEPTH')!r}, defaulting to 0")
                chain_depth = 0
            depth_arg = f" --depth {chain_depth}" if chain_depth > 0 else ""
            completion_instruction = (
                f"\n\n---\n[skill-bus] COMPLETION TRIGGER: When you have FULLY completed "
                f"the work described by this skill — not begun it, FULLY delivered all "
                f"outputs — you MUST invoke the Skill tool with skill: \"skill-bus:complete\" "
                f"and args: \"{skill_name}{depth_arg}\" to trigger "
                f"downstream subscriptions. Do NOT skip this step."
            )

    # Telemetry: log match events (opt-in)
    if log_event and settings.get("telemetry", False):
        for sub in matched:
            log_event("match", args.cwd, settings=settings,
                      skill=skill_name, insert=sub.get("insert", ""),
                      timing=args.timing, source=args.source)

    # Telemetry: log skill_complete event (for complete timing)
    if args.timing == "complete" and matched and log_event and settings.get("telemetry", False):
        log_event("skill_complete", args.cwd, settings=settings,
                  skill=skill_name, timing="complete", source=args.source)

    if not matched:
        if log_event and settings.get("telemetry", False) and settings.get("observeUnmatched", False):
            log_event("no_match", args.cwd, settings=settings,
                      skill=skill_name, timing=args.timing, source=args.source)
        if not _warnings and not completion_instruction:
            sys.exit(0)

    elapsed = time.monotonic() - _start
    if elapsed > 4.0:
        _warnings.append(f"[skill-bus] WARNING: dispatch took {elapsed:.1f}s (5s timeout), context may be incomplete")

    output = build_output(matched, args.timing, settings, source=args.source, inserts_map=inserts_map, cwd=args.cwd)

    # Inject truncation note into context so the model knows inserts were omitted
    truncation_note = [w for w in _warnings if "maxMatchesPerSkill" in w]
    if truncation_note and output:
        output["hookSpecificOutput"]["additionalContext"] += f"\n\n[Note: {truncation_note[0]}]"

    # Append completion instruction to output if needed
    if completion_instruction:
        if output:
            # Append to existing additionalContext
            output["hookSpecificOutput"]["additionalContext"] += completion_instruction
        else:
            # No matched pre-subs but completion subs exist — create output just for the instruction
            # Use correct hookEventName based on source (prompt → UserPromptSubmit, tool → PreToolUse)
            hook_event = "UserPromptSubmit" if args.source == "prompt" else "PreToolUse"
            output = {
                "hookSpecificOutput": {
                    "hookEventName": hook_event,
                    "additionalContext": completion_instruction.lstrip("\n")
                }
            }
            messages = list(_warnings)
            if messages:
                output["systemMessage"] = " | ".join(messages)

    if output:
        print(json.dumps(output))
    elif _warnings:
        print(json.dumps({"systemMessage": " | ".join(_warnings)}))


if __name__ == "__main__":
    try:
        _main()
    except Exception as e:
        print(json.dumps({"systemMessage": f"[skill-bus] ERROR - {type(e).__name__}: {e}"}))
    finally:
        sys.exit(0)
