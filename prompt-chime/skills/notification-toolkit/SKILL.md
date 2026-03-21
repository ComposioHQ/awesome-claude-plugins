---
name: notification-toolkit
description: Manage Prompt Chime notification sounds, profiles, quiet hours, and per-project overrides. Use when the user asks about notifications, sounds, alerts, or wants to customize what happens when a prompt completes.
---

# Prompt Chime Notification Toolkit

You have access to a notification management CLI at `${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh`.

## Available Commands

Run these via bash:

| Command | Description |
|---------|-------------|
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" list` | List available sounds |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" preview <sound>` | Play a sound |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" set <event> <sound>` | Set sound for event (stop\|error\|long_running) |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" profile list` | List profiles |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" profile use <name>` | Switch active profile |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" profile create <name> [sound] [volume]` | Create a profile |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" project set <path> <sound>` | Set per-project sound |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" project remove <path>` | Remove project override |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" volume <0-100>` | Set volume |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" quiet on\|off [start] [end]` | Toggle quiet hours |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" toast on\|off` | Toggle toast notifications |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" status` | Show current settings |
| `bash "${CLAUDE_PLUGIN_ROOT}/scripts/manage.sh" test` | Fire a test notification |

## How It Works

- A **Stop hook** fires `notify.sh` every time the assistant finishes responding
- `notify.sh` reads config, detects the OS, and plays the appropriate sound + toast
- Works on **Windows** (PowerShell MCI + WinRT toast), **macOS** (afplay + osascript), and **Linux** (paplay/aplay + notify-send)
- Users can drop custom `.wav`/`.mp3` files in `sounds/custom/`

## When Users Ask About Notifications

- "Change my notification sound" → `manage.sh set stop <sound>` or `manage.sh profile use <name>`
- "Turn off notifications" → `manage.sh toast off` or edit config `enabled: false`
- "Make it quieter at night" → `manage.sh quiet on 22:00 08:00`
- "Different sound for this project" → `manage.sh project set <path> <sound>`
- "What sounds are available?" → `manage.sh list`
