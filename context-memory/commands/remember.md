---
allowed-tools: Bash(python:*)
description: "Save the current session to persistent context memory"
argument-hint: "[note]"
---

# /remember Command

Save the current session to context memory with an optional annotation.

## Usage

```
/remember [note]
```

**Arguments:**
- `note` (optional): A personal annotation or tag to help find this session later

## Workflow

When the user runs `/remember`:

1. **Generate Session Summary** - Analyze the conversation and create a structured summary (brief, detailed, key decisions, problems solved, technologies, outcome)
2. **Extract Topics** - Identify 3-8 relevant topics (lowercase terms)
3. **Identify Key Code** - Extract significant code snippets with language and context
4. **Extract Key Messages** - Select 5-15 important messages
5. **Save via JSON stdin** - Pipe complete JSON to `db_save.py --json -`
6. **Confirm to User** - Report summary, topics, counts

## Installation

Requires the full context-memory plugin:
```bash
git clone https://github.com/ErebusEnigma/context-memory.git
cd context-memory
python install.py
```
