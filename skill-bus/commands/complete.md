---
description: Signal that a skill's work is complete. Triggers downstream subscriptions with "when": "complete" timing. Automatically invoked — do not run manually.
---

# Skill Bus: Completion Signal (Experimental)

**IMPORTANT:** If the PreToolUse hook above injected downstream context or instructions, those are your PRIMARY task. Follow them. This command markdown is just the signal carrier — the real payload was delivered by the hook.

This command is a **signal**, not an interactive command. It is automatically invoked by Claude when a skill finishes its work, if that skill has downstream `"when": "complete"` subscriptions.

## How It Works

When skill-bus detects that a skill (e.g. `superpowers:writing-plans`) has subscriptions with `"when": "complete"`, it injects an instruction during the pre-hook:

> "When you have FULLY completed the work described by this skill, you MUST run `/skill-bus:complete superpowers:writing-plans`"

Claude runs this command when done. The PreToolUse hook intercepts it and fires the downstream subscriptions, injecting their context ABOVE this command markdown.

## Arguments

`$ARGUMENTS` should contain the fully-namespaced skill name that was completed (e.g. `superpowers:writing-plans`), optionally followed by `--depth N` for chain tracking.

If no arguments are provided: "[skill-bus] complete signal received but no skill name provided. Nothing to trigger."

If arguments are provided but the hook above injected no additional context: the completed skill had no matching downstream subscriptions (conditions may have filtered them out). No action needed.
