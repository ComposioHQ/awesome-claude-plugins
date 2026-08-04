#!/usr/bin/env python3
"""claude-bionify MessageDisplay hook: bold the leading part of prose words.

Reads a MessageDisplay event as JSON on stdin and prints a `displayContent`
replacement built by the functional `core`. Code, existing bold, markdown links,
bare URLs, and emails render verbatim, and ALL-CAPS acronyms are left whole.

The change is display-only. Claude Code keeps the original text in the
transcript and in the model's context. This shell holds the side effects: it
reads userConfig and live overrides, persists per-message fence state, and
writes to stdout. It is crash-safe: on any error it prints nothing, so Claude
Code falls back to the original text. Set CLAUDE_BIONIFY_DEBUG=1 to re-raise instead.
"""

import json
import os
import re
import sys
from typing import NamedTuple

import core
import overrides
import settings


def _option(name: str) -> str | None:
    """Read a userConfig value from its CLAUDE_PLUGIN_OPTION_* env var."""
    return (os.environ.get(f"CLAUDE_PLUGIN_OPTION_{name.upper()}")
            or os.environ.get(f"CLAUDE_PLUGIN_OPTION_{name}"))


def load_config() -> settings.Style | None:
    """Resolve the active Style from userConfig plus any live overrides.

    Returns None when claude-bionify is turned off via `/claude-bionify:off`, so the hook
    passes the original text through unchanged.
    """
    raw = settings.from_env(_option)
    override = overrides.load()
    if override.get("enabled") is False:
        return None
    for key in settings.RAW_KEYS:
        if key in override:
            raw[key] = override[key]
    return settings.build_style(raw)


def _fence_dir() -> str | None:
    return os.environ.get("CLAUDE_PLUGIN_DATA")


def _fence_path(data_dir: str, message_id: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]", "-", message_id)
    return os.path.join(data_dir, f"fence-{safe}.state")


def _remove_quietly(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


def read_fence_state(message_id: str, index: int | None) -> bool:
    """Whether the previous delta ended inside a code fence.

    A message always begins outside a fence, so the first delta (index 0) starts
    fresh and never trusts a leftover file.
    """
    data_dir = _fence_dir()
    if not data_dir or not message_id or index == 0:
        return False
    try:
        with open(_fence_path(data_dir, message_id), encoding="utf-8") as f:
            return f.read().strip() == "1"
    except OSError:
        return False


def write_fence_state(message_id: str, inside_fence: bool, final: bool) -> None:
    """Persist fence state for the next delta, or clear it when the message ends."""
    data_dir = _fence_dir()
    if not data_dir or not message_id:
        return
    path = _fence_path(data_dir, message_id)
    try:
        if final:
            _remove_quietly(path)
        else:
            os.makedirs(data_dir, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write("1" if inside_fence else "0")
    except OSError:
        pass


def sweep_stale_state(current_message_id: str) -> None:
    """Drop fence files left by earlier messages that never sent a final delta.

    A session streams one message at a time, so when a new message starts every
    other fence file is safe to remove.
    """
    data_dir = _fence_dir()
    if not data_dir:
        return
    keep = (os.path.basename(_fence_path(data_dir, current_message_id))
            if current_message_id else None)
    try:
        for entry in os.listdir(data_dir):
            if (entry.startswith("fence-") and entry.endswith(".state")
                    and entry != keep):
                _remove_quietly(os.path.join(data_dir, entry))
    except OSError:
        pass


class DisplayEvent(NamedTuple):
    """The MessageDisplay payload, parsed from Claude Code's raw hook event.

    Claude Code streams an assistant message as a sequence of these and names its
    fields in camelCase (`messageId`); `parse_event` is the one place that maps
    them onto the names the rest of the module uses.
    """
    delta: str
    message_id: str    # keys the per-message fence state
    index: int | None
    final: bool


def parse_event(raw: dict) -> DisplayEvent:
    """Read the fields the hook needs from a raw MessageDisplay event.

    `messageId` is Claude Code's field; `session_id` is a guaranteed fallback so
    the fence-state key is never empty, since an empty key would let code blocks
    that span streamed deltas get bolded.
    """
    return DisplayEvent(
        delta=raw.get("delta") or "",
        message_id=str(raw.get("messageId") or raw.get("session_id") or ""),
        index=raw.get("index"),
        final=bool(raw.get("final")),
    )


def main() -> None:
    try:
        event = parse_event(json.loads(sys.stdin.read() or "{}"))
        if not event.delta:
            return

        style = load_config()
        if style is None:        # turned off via /claude-bionify:off
            return

        if event.index == 0:
            sweep_stale_state(event.message_id)
        inside_fence = read_fence_state(event.message_id, event.index)
        display, inside_fence = core.transform(event.delta, inside_fence, style)
        write_fence_state(event.message_id, inside_fence, event.final)

        json.dump({
            "hookSpecificOutput": {
                "hookEventName": "MessageDisplay",
                "displayContent": display,
            }
        }, sys.stdout)
    except Exception:
        # Crash-safe: emit nothing so Claude Code renders the original text.
        if os.environ.get("CLAUDE_BIONIFY_DEBUG"):
            raise


if __name__ == "__main__":
    main()
