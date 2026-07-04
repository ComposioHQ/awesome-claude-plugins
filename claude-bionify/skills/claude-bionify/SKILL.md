---
name: claude-bionify
description: Configure and control the claude-bionify bionic reading plugin. Use when the user asks about bionic reading settings (fixation/strength, boundary, minimum word length, acronyms, URLs, headings), wants to turn the bionic display on, off, or toggle it, asks for the current status, or asks how to use the /claude-bionify commands.
when_to_use: User says things like "make bionify bolder", "turn off bionic reading", "set fixation to 0.7", "how do I change the minimum word length", "what bionify commands are there", or "reset bionify to defaults".
user-invocable: false
---

# claude-bionify control

Background knowledge for answering questions about the claude-bionify plugin, which
bolds the leading part of each word in Claude's responses (cosmetic bionic reading).
Use it to recommend the right command and the exact key a user needs.

## When to use

Load this skill when the user wants to:

- Change a setting (boldness, boundary, word length, acronyms, URLs, headings).
- Turn the formatting on, off, or toggle it.
- Check the current state or reset overrides.
- Learn what `/claude-bionify` commands exist.

## Settings

Each setting has a default in `plugin.json` and a short key used by the live
`/claude-bionify:set` command. The set key is what you pass to the command, and it is
shorter than the `plugin.json` field name.

| Setting | `set` key | Default | Values | Meaning |
| :-- | :-- | :-- | :-- | :-- |
| Fixation strength | `fixation` (alias `strength`) | `0.5` | `0.1` to `0.9` | Fraction of each word bolded; higher is bolder. Applies to the `fraction` boundary only. |
| Bold boundary | `boundary` | `fraction` | `fraction`, `syllable`, `log` | `fraction` uses the fixation strength; `syllable` bolds up to the first syllable; `log` grows logarithmically so long words are bolded less. |
| Minimum word length | `minlen` | `4` | `1` or greater | Words shorter than this stay unbolded. |
| Skip acronyms | `acronyms` | `true` | `on`, `off` | Leave ALL-CAPS acronyms such as API or JSON unbolded. |
| Protect URLs, paths, files | `urls` | `true` | `on`, `off` | Do not bold inside URLs, emails, file paths, or filenames. |
| Skip headings | `headings` | `true` | `on`, `off` | Leave markdown headings (lines starting with `#`) unbolded. |

## Commands

All commands live under the `/claude-bionify` namespace.

| Command | Argument | Action |
| :-- | :-- | :-- |
| `/claude-bionify:status` | none | Show the current settings and whether bionify is on. |
| `/claude-bionify:on` | none | Enable bionic formatting. |
| `/claude-bionify:off` | none | Disable bionic formatting. |
| `/claude-bionify:toggle` | none | Flip bionify on or off. |
| `/claude-bionify:set` | `<key> <value>` | Override one setting live. Keys: `fixation` (or `strength`), `boundary`, `minlen`, `acronyms`, `urls`, `headings`. |
| `/claude-bionify:reset` | none | Clear live overrides and restore the `plugin.json` defaults. |

Examples:

- `/claude-bionify:set fixation 0.7`
- `/claude-bionify:set boundary syllable`
- `/claude-bionify:set minlen 5`
- `/claude-bionify:set acronyms off`

Important: `set` only accepts the short keys above, not the longer `plugin.json` field
names. `set minlen 5` works; `set min_word_length 5` does not. Likewise use `acronyms`,
`urls`, and `headings`, not `skip_acronyms`, `protect_urls`, or `skip_headings`.

## Notes

- `set` changes apply to the next response and persist until `/claude-bionify:reset`.
- Changing the `plugin.json` defaults instead takes effect on the next session.
- The formatting is cosmetic: it never alters the underlying text Claude reads or saves.
