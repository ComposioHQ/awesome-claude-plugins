"""Runtime-override persistence: the live settings the /claude-bionify commands write
and the hook reads.

This is the shared contract between the control CLI (writer) and the hook
(reader): one place that owns where the override file lives and how it is read,
written, and cleared. The schema is just a JSON object of Style fields plus an
optional `enabled` flag; this module stays agnostic about its contents.
"""

import json
import os


def path() -> str:
    """Location of the override file (overridable via CLAUDE_BIONIFY_STATE_FILE)."""
    return (os.environ.get("CLAUDE_BIONIFY_STATE_FILE")
            or os.path.expanduser("~/.claude/claude-bionify/runtime.json"))


def load() -> dict:
    """Current overrides, or {} when none exist or the file is unreadable."""
    try:
        with open(path(), encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save(state: dict) -> None:
    """Persist the override dict atomically, creating the parent directory if needed.

    Writes to a temp file and renames it into place so the hook never reads a
    half-written file if a control command lands while a message is streaming.
    """
    target = path()
    tmp = f"{target}.tmp"
    try:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f)
        os.replace(tmp, target)
    except OSError:
        pass


def clear() -> None:
    """Remove the override file, reverting to the configured defaults."""
    try:
        os.remove(path())
    except OSError:
        pass
