# Changelog

All notable changes to claude-bionify are documented here. This project follows
[semantic versioning](https://semver.org) and [Keep a Changelog](https://keepachangelog.com).

## [1.0.0] - 2026-06-28

Initial release.

### Added
- `MessageDisplay` hook that bolds the leading part of each word in Claude's
  streamed replies as they render. The change is display-only: the saved
  transcript and what Claude reads are never altered.
- Unicode-aware bolding that works in any language, while leaving numbers and
  identifiers like `value3` or `api_key` alone.
- Three bolding strategies via the `boundary` option: `fraction` (default),
  `syllable` (ends at the first syllable), and `log` (long words bolded less).
- Configurable `fixation` strength and `min_word_length`.
- `skip_acronyms` (default on) leaves ALL-CAPS acronyms like `API` whole.
- `protect_urls` (default on) keeps URLs, emails, and file paths unbolded, while
  still bolding prose like `and/or` or `e.g.`.
- `skip_headings` (default on) leaves markdown headings unbolded.
- Inline `` `code` ``, fenced code blocks, markdown links, and existing
  `**bold**` always render verbatim.
- Live control commands (`/claude-bionify:on`, `:off`, `:toggle`,
  `:set <option> <value>`, `:status`, `:reset`) that change settings mid-session
  with no reload.
- Seven color themes (Nord, Dracula, Gruvbox, Solarized Dark, Solarized Light,
  Sepia, Focus Dark) in Claude Code's `/theme` picker as `custom:claude-bionify:<name>`.
- Crash-safe by design: on any error the original text is shown unchanged.
