#!/usr/bin/env python3
"""
Skill Bus Telemetry — JSONL event logging for stats and analysis.

Logs subscription matches, condition skips, unmatched skills, and skill
completions to a project-scoped JSONL file at <cwd>/.claude/skill-bus-telemetry.jsonl.

Session IDs group events within a single dispatch invocation.
"""

import json
import os
import re
import time
import uuid

# Per-process session ID (stable across multiple log_event calls in one dispatch)
_session_id = uuid.uuid4().hex[:8]


def resolve_telemetry_path(cwd, settings=None):
    """Resolve telemetry file path from settings or default.

    Public API — used by both dispatcher.py and cli.py.
    """
    if settings and settings.get("telemetryPath"):
        path = settings["telemetryPath"]
        if not os.path.isabs(path):
            path = os.path.join(cwd, path)
        return path
    return os.path.join(cwd, ".claude", "skill-bus-telemetry.jsonl")


def _maybe_rotate(path, max_size_kb):
    """Truncate log file to newest half if it exceeds max_size_kb."""
    try:
        size_kb = os.path.getsize(path) / 1024
        if size_kb <= max_size_kb:
            return
        with open(path, "r", errors="replace") as f:
            lines = f.readlines()
        keep = lines[len(lines) // 2:]
        if len(keep) == len(lines):
            return  # Single line exceeds limit — can't halve, just keep it
        with open(path, "w") as f:
            f.writelines(keep)
    except OSError:
        pass  # Fail-safe: skip rotation on errors


def log_event(event, cwd, settings=None, **fields):
    """Append a telemetry event to the JSONL log.

    Args:
        event: Event type — "match", "condition_skip", "no_match", or "skill_complete"
        cwd: Working directory (determines log file location)
        settings: Merged settings dict (optional, for telemetryPath override)
        **fields: Event-specific fields (skill, insert, pattern, timing, source)
    """
    path = resolve_telemetry_path(cwd, settings)

    # Ensure parent directory exists
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        try:
            os.makedirs(parent, exist_ok=True)
        except OSError:
            return  # Fail-safe: can't create dir, skip logging

    max_kb = (settings or {}).get("maxLogSizeKB", 512)
    if max_kb > 0:
        _maybe_rotate(path, max_kb)

    entry = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "sessionId": _session_id,
        "event": event,
    }
    entry.update(fields)

    try:
        with open(path, "a") as f:
            f.write(json.dumps(entry, separators=(",", ":")) + "\n")
    except OSError:
        pass  # Fail-safe: logging failure must never break skill dispatch


def read_telemetry(cwd, settings=None, session_filter=None, days_filter=None):
    """Read and parse telemetry JSONL. Returns list of event dicts."""
    path = resolve_telemetry_path(cwd, settings)
    if not os.path.isfile(path):
        return []

    cutoff = None
    if days_filter is not None:
        from datetime import datetime, timedelta, timezone
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_filter)

    events = []
    with open(path, "r", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                if session_filter and entry.get("sessionId") != session_filter:
                    continue
                if cutoff:
                    ts_str = entry.get("ts", "")
                    try:
                        from datetime import datetime, timezone
                        # Normalize %z offset (e.g. +0000 -> +00:00, -0800 -> -08:00)
                        ts_normalized = re.sub(r'([+-])(\d{2})(\d{2})$', r'\1\2:\3', ts_str)
                        ts = datetime.fromisoformat(ts_normalized)
                        if ts < cutoff:
                            continue
                    except (ValueError, TypeError):
                        pass  # Keep events with unparseable timestamps
                events.append(entry)
            except json.JSONDecodeError:
                continue  # Skip malformed lines
    return events
