"""Formatting core for claude-bionify: pure bionic-reading text transformation.

No I/O lives here. Every function operates only on its arguments and returns a
value. The hook (`bionify.py`) and the control CLI (`control.py`) build on this
module and on `settings`; this module never imports them.
"""

import math
import re
import unicodedata

from settings import Style

# In "syllable" mode the bold span lands on the first-syllable boundary, then is
# clamped into this band so vowel-initial words are not under-bolded and long
# words are not over-bolded.
SYLLABLE_MIN_FRACTION = 0.35
SYLLABLE_MAX_FRACTION = 0.70


# A word is a run of letters in any language. Digits and underscores are
# excluded so numbers and identifiers like `value3` or `api_key` are never
# treated as prose.
_WORD = re.compile(r"[^\W\d_]+")

# Spans within a line that must render verbatim, matched in one pass so prose
# bolding flows around them. The second group (URLs, emails, paths, files) is
# optional, gated by `protect_urls`.
_PROTECTED_PARTS = (
    r"`[^`]*`",         # `inline code`
    r"\*\*.+?\*\*",     # **existing bold**
    r"\]\([^)]*\)",     # ](destination) of a [label](url) link or image
)
# Each rule below triggers only on a signal that prose lacks (a scheme, an `@`,
# a token-anchored or multi-segment path, or a lowercase file extension), so
# words like "and/or", "e.g.", or "3.14" are never caught. Path character
# classes exclude quotes and brackets, so a path stops cleanly at `)` or `"`.
_URL_PARTS = (
    r"https?://\S+",                          # URL with a scheme
    r"www\.\S+",                              # scheme-less www URL
    r"\b[\w.+-]+@[\w-]+\.\w+",                # email address
    r"(?<!\S)(?:\.\.?|~)?/[\w@.~/-]*[\w/]",   # path: /a, ./a, ../a, ~/a
    r"[\w.-]+/[\w.-]+/[\w@./-]+",             # relative path with 3+ segments
    r"[\w-]+/[\w@.-]*\.[A-Za-z0-9]{1,5}\b",   # segment/file.ext, e.g. src/index.ts
    r"\b[\w-]+(?:\.[\w-]+)*\.[a-z]{2,5}\b",   # filename or bare domain, e.g. main.py
)
_PROTECTED = re.compile("|".join(_PROTECTED_PARTS))
_PROTECTED_WITH_URLS = re.compile("|".join(_PROTECTED_PARTS + _URL_PARTS))

_FENCE_PREFIXES = ("```", "~~~")

# A markdown ATX heading: 0 to 3 leading spaces, then 1 to 6 # characters, then
# whitespace or end-of-line. #hashtag and Issue #42 do not match.
_HEADING = re.compile(r"^ {0,3}#{1,6}(?:\s|$)")


def _is_fence(line: str) -> bool:
    """Whether a line is a code-fence marker rather than prose.

    A real marker is ``` or ~~~ alone, or followed immediately by an info string
    with no space. Prose like "``` is the marker" has a space right after the
    backticks, so it does not flip the fence state.
    """
    stripped = line.strip()
    if not stripped.startswith(_FENCE_PREFIXES):
        return False
    return len(stripped) == 3 or not stripped[3:4].isspace()


def _is_vowel(char: str) -> bool:
    """True if `char` is a vowel in any language (diacritics stripped)."""
    return unicodedata.normalize("NFD", char)[:1].lower() in "aeiou"


def _syllable_cut(word: str) -> int:
    """Bold length ending at the word's first syllable, clamped to a sane band.

    Walks onset (leading consonants) to nucleus (first vowel run) to an optional
    single coda consonant, then clamps into [MIN, MAX] of the word length.
    """
    length = len(word)
    cut = 0
    while cut < length and not _is_vowel(word[cut]):  # onset (y reads consonant)
        cut += 1
    while cut < length and (_is_vowel(word[cut]) or word[cut].lower() == "y"):
        cut += 1  # nucleus (y now reads vowel)
    if cut < length - 1 and not _is_vowel(word[cut]) and not _is_vowel(word[cut + 1]):
        cut += 1  # coda: keep a consonant that another consonant follows

    low = max(1, math.ceil(length * SYLLABLE_MIN_FRACTION))
    high = max(low, math.floor(length * SYLLABLE_MAX_FRACTION))
    return min(max(cut, low), high)


def _log_cut(word: str) -> int:
    """Bold length that grows logarithmically, so long words are bolded less."""
    return max(1, min(len(word), math.ceil(math.log2(len(word)))))


def _bold_cut(word: str, style: Style) -> int:
    """How many leading characters of `word` to bold, per the active strategy."""
    if style.boundary == "syllable":
        return _syllable_cut(word)
    if style.boundary == "log":
        return _log_cut(word)
    return max(1, min(len(word), math.ceil(len(word) * style.fixation)))


def bionify_word(word: str, style: Style) -> str:
    """Bold the leading part of a single word."""
    if len(word) < style.min_length:
        return word
    if style.skip_acronyms and word.isupper():
        return word
    cut = _bold_cut(word, style)
    return f"**{word[:cut]}**{word[cut:]}"


def bionify_text(text: str, style: Style) -> str:
    """Bold every prose word in a line, leaving protected spans untouched."""
    def bold(segment: str) -> str:
        return _WORD.sub(lambda m: bionify_word(m.group(), style), segment)

    protected = _PROTECTED_WITH_URLS if style.protect_urls else _PROTECTED
    out = []
    cursor = 0
    for span in protected.finditer(text):
        out.append(bold(text[cursor:span.start()]))
        out.append(span.group())
        cursor = span.end()
    out.append(bold(text[cursor:]))
    return "".join(out)


def transform(delta: str, inside_fence: bool, style: Style) -> tuple[str, bool]:
    """claude-bionify a streamed delta, tracking fenced code blocks across deltas.

    Returns (rendered text, updated inside_fence). Deltas are line-aligned, so
    each line is a ``` / ~~~ fence marker, code inside an open fence, or a prose
    line that gets bionified.
    """
    out = []
    for line in delta.split("\n"):
        if _is_fence(line):
            inside_fence = not inside_fence
            out.append(line)
        elif inside_fence:
            out.append(line)
        elif style.skip_headings and _HEADING.match(line):
            out.append(line)
        else:
            out.append(bionify_text(line, style))
    return "\n".join(out), inside_fence
