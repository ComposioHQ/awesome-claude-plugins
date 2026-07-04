<div align="center">

<h1>claude-bionify</h1>

<p>
  <strong>Bionic reading for Claude Code. Bold the front of every word so your eyes move faster.</strong><br>
  <sub>So <b>Bio</b>nify <b>mak</b>es <b>Cla</b>ude's <b>repl</b>ies <b>eas</b>ier to <b>re</b>ad.</sub>
</p>

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-d97757)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![Version](https://img.shields.io/badge/version-1.0.1-success)

</div>

---

claude-bionify restyles Claude's responses as they stream into your terminal, bolding the
leading part of each word so your eye gets a fixation point per word. That is the
bionic-reading technique, inspired by eye-movement research showing we read by fixating a single
convenient position toward the start of each word, where the opening letters carry the most
information ([Rayner, 1979](https://doi.org/10.1068/p080021);
[O'Regan et al., 1984](https://doi.org/10.1037/0096-1523.10.2.250)).

## Install

```shell
/plugin marketplace add abullard1/claude-bionify
/plugin install claude-bionify@claude-bionify
```

claude-bionify is active right away. Turn it off or on with `/claude-bionify:off` / `/claude-bionify:on`.

## Configure

When you enable the plugin, Claude Code prompts for these (all optional):

| Setting | Default | Meaning |
| :------ | :------ | :------ |
| **Bold boundary** | `fraction` | `fraction` bolds by Fixation strength; `syllable` ends each word at its first syllable (e.g. **stri**ng); `log` grows logarithmically so long words are bolded less. |
| **Fixation strength** | `0.5` | Fraction of each word to bold (`0.1`–`0.9`). Higher is bolder. Applies to `fraction` mode only. |
| **Minimum word length** | `4` | Words shorter than this are left unbolded. |
| **Skip acronyms** | `on` | Leave ALL-CAPS acronyms like `API` or `JSON` whole. |
| **Protect URLs, paths, files** | `on` | Don't bold inside URLs, emails, file paths, or filenames. |
| **Skip headings** | `on` | Leave markdown headings (`#` lines) unbolded. |

## Control it live

Change claude-bionify mid-session without a reload. The next reply reflects it instantly:

- `/claude-bionify:toggle` · `/claude-bionify:on` · `/claude-bionify:off`
- `/claude-bionify:set strength 0.7` · `/claude-bionify:set boundary syllable` · `/claude-bionify:set minlen 5` · `/claude-bionify:set acronyms off` · `/claude-bionify:set urls off` · `/claude-bionify:set headings off`
- `/claude-bionify:status` · `/claude-bionify:reset`

## Themes

claude-bionify also ships seven color themes for Claude Code's `/theme` picker: Nord, Dracula,
Gruvbox, Solarized Dark, Solarized Light, Sepia, and Focus Dark. Optional and independent of
the bolding. See the [project README](https://github.com/abullard1/claude-bionify#themes) for
the palette gallery.

## What it touches

- **Bolded:** ordinary prose words, in any language (Unicode-aware).
- **Left alone:** inline `` `code` ``, fenced code blocks (even across streamed chunks),
  markdown link/image targets, URLs, emails, file paths and filenames, ALL-CAPS acronyms,
  and existing `**bold**`.
- **Never touched:** your input and tool output.

## How it works

```
Claude streams a reply ▸ claude-bionify ▸ bolded text in your terminal
```

claude-bionify bolds each batch of Claude's reply just before it reaches your screen, so only
what you see changes — what's saved to the transcript and what Claude reads stay the original
text. It runs entirely on your machine with no dependencies, and if anything ever goes wrong it
falls back to the original.

## Requirements

- Claude Code with plugin support · `python3` on your `PATH` · a terminal that renders markdown bold

## Terminal compatibility

claude-bionify emits standard markdown bold, which virtually every terminal renders correctly:
Alacritty, kitty, WezTerm, iTerm2, GNOME Terminal, foot, and the rest.

The one known exception is the COSMIC desktop terminal (`cosmic-term`), which currently ignores
the code that *ends* a bold span, so bold leaks across the whole word instead of stopping after
the front.
That is a terminal bug, not a claude-bionify or Claude Code issue. A future release may add an
optional Unicode-glyph bold mode that avoids ANSI entirely and sidesteps it.

For the full write-up, demo, and development guide, see the
[project README](https://github.com/abullard1/claude-bionify#readme).

## License

[MIT](./LICENSE) © 2026 [Samuel Ruairí Bullard](https://github.com/abullard1).
