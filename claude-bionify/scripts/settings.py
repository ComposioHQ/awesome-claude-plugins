"""Settings model and the single source of truth for claude-bionify's options.

Every option is declared once in SETTINGS: its canonical name, its plugin.json
manifest key, the keys the `set` command accepts, default, parser, and how it
renders in the status line. The formatting core, the hook, and the control CLI
all read from here, so adding or changing an option happens in one place rather
than across several modules.
"""

from collections.abc import Callable
from dataclasses import dataclass
import re
from typing import NamedTuple

DEFAULT_FIXATION = 0.5
DEFAULT_MIN_WORD_LENGTH = 4
DEFAULT_BOUNDARY = "fraction"
DEFAULT_SKIP_ACRONYMS = True
DEFAULT_PROTECT_URLS = True
DEFAULT_SKIP_HEADINGS = True
BOUNDARIES = ("fraction", "syllable", "log")
_TRUTHY = ("1", "true", "yes", "on", "enable", "enabled")
_FALSY = ("0", "false", "no", "off", "disable", "disabled")


class Style(NamedTuple):
    """Resolved formatting settings, threaded through the formatting functions."""
    fixation: float = DEFAULT_FIXATION
    min_length: int = DEFAULT_MIN_WORD_LENGTH
    boundary: str = DEFAULT_BOUNDARY
    skip_acronyms: bool = DEFAULT_SKIP_ACRONYMS
    protect_urls: bool = DEFAULT_PROTECT_URLS
    skip_headings: bool = DEFAULT_SKIP_HEADINGS


def clamp_fixation(value: float) -> float:
    """Constrain a fixation strength to the usable 0.1 to 0.9 range."""
    return max(0.1, min(0.9, value))


def clamp_min_length(value: int) -> int:
    """Constrain a minimum word length to at least 1."""
    return max(1, value)


def valid_boundary(value: str) -> bool:
    """Whether `value` names a known boundary strategy."""
    return str(value).strip().lower() in BOUNDARIES


def as_bool(value: object) -> bool:
    """Read an env string or JSON boolean as a bool, rejecting typos."""
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in _TRUTHY:
        return True
    if normalized in _FALSY:
        return False
    raise ValueError(value)


def parse_min_length(value: object) -> int:
    """Read a whole-number minimum word length."""
    if isinstance(value, bool):
        raise ValueError(value)
    if isinstance(value, int):
        return clamp_min_length(value)
    if isinstance(value, float):
        if not value.is_integer():
            raise ValueError(value)
        return clamp_min_length(int(value))
    text = str(value).strip()
    if not re.fullmatch(r"[+-]?\d+", text):
        raise ValueError(value)
    return clamp_min_length(int(text))


def _parse_boundary(value: str) -> str:
    if not valid_boundary(value):
        raise ValueError(value)
    return str(value).strip().lower()


@dataclass(frozen=True)
class Setting:
    """One option, declared once: its names, default, parser, and renderer."""
    name: str                          # canonical Style field
    manifest_key: str                  # plugin.json userConfig key
    cli_keys: tuple[str, ...]          # accepted by /claude-bionify:set
    default: object
    parse: Callable[[object], object]  # raises ValueError on an invalid value
    render: Callable[[object], str]    # value -> status-line fragment
    invalid: Callable[[str], str]      # message when set is given a bad value


SETTINGS = (
    Setting(
        "fixation", "fixation", ("fixation", "strength"), DEFAULT_FIXATION,
        parse=lambda v: clamp_fixation(float(v)),
        render=lambda v: f"strength={v}",
        invalid=lambda v: f"'{v}' is not a number between 0.1 and 0.9",
    ),
    Setting(
        "min_length", "min_word_length", ("minlen",),
        DEFAULT_MIN_WORD_LENGTH,
        parse=parse_min_length,
        render=lambda v: f"minlen={v}",
        invalid=lambda v: f"'{v}' is not a whole number",
    ),
    Setting(
        "boundary", "boundary", ("boundary",), DEFAULT_BOUNDARY,
        parse=_parse_boundary,
        render=lambda v: f"boundary={v}",
        invalid=lambda v: f"boundary must be one of {', '.join(BOUNDARIES)}",
    ),
    Setting(
        "skip_acronyms", "skip_acronyms", ("acronyms",), DEFAULT_SKIP_ACRONYMS,
        parse=as_bool,
        render=lambda v: f"acronyms={'on' if v else 'off'}",
        invalid=lambda v: f"'{v}' is not on or off",
    ),
    Setting(
        "protect_urls", "protect_urls", ("urls",), DEFAULT_PROTECT_URLS,
        parse=as_bool,
        render=lambda v: f"urls={'on' if v else 'off'}",
        invalid=lambda v: f"'{v}' is not on or off",
    ),
    Setting(
        "skip_headings", "skip_headings", ("headings",), DEFAULT_SKIP_HEADINGS,
        parse=as_bool,
        render=lambda v: f"headings={'on' if v else 'off'}",
        invalid=lambda v: f"'{v}' is not on or off",
    ),
)

RAW_KEYS = tuple(s.name for s in SETTINGS)
_BY_CLI = {key: s for s in SETTINGS for key in s.cli_keys}


def by_cli_key(key: str) -> Setting | None:
    """The Setting a `set` command key refers to, or None if unknown."""
    return _BY_CLI.get(key)


def build_style(raw: dict) -> Style:
    """Resolve a raw settings dict (from env or an override) into a Style.

    A missing value falls back to the default; a present but invalid value is
    parsed, and if parsing fails it also falls back rather than raising.
    """
    values = {}
    for setting in SETTINGS:
        given = raw.get(setting.name)
        if given is None:
            values[setting.name] = setting.default
            continue
        try:
            values[setting.name] = setting.parse(given)
        except (TypeError, ValueError):
            values[setting.name] = setting.default
    return Style(**values)


def from_env(read: Callable[[str], object]) -> dict:
    """Collect the userConfig values via `read(manifest_key)` into a raw dict."""
    return {s.name: read(s.manifest_key) for s in SETTINGS}


def render_state(state: dict) -> str:
    """Render the active overrides as a single status line."""
    if not state:
        return "claude-bionify: ON · using your configured defaults"
    parts = [s.render(state[s.name]) for s in SETTINGS if s.name in state]
    tail = (" · " + " · ".join(parts)) if parts else ""
    state_word = "OFF" if state.get("enabled") is False else "ON"
    return f"claude-bionify: {state_word}{tail}"
