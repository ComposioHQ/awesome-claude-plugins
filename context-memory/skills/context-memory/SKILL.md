---
name: "context-memory"
description: >
  Saves and searches past Claude Code sessions so context, decisions, and
  code persist across conversations.
license: "MIT"
compatibility: "Python >= 3.8"
allowed-tools: "Bash(python:*)"
metadata:
  author: "ErebusEnigma"
  version: "1.3.1"
---

# Context Memory Skill

Saves and searches past Claude Code sessions so context, decisions, and code persist across conversations.

## Trigger Phrases

- "remember this" / "save this session"
- "recall" / "search past sessions"
- "what did we discuss about..."
- "find previous work on..."

## Features

- Cross-session memory with structured AI summaries
- Full-text search with FTS5 and Porter stemming (<50ms)
- Auto-save on exit and pre-compact checkpoints
- Optional web dashboard and MCP server

## Commands

- `/remember [note]` - Save session
- `/recall <query> [--project] [--detailed] [--limit N]` - Search sessions

## Source

https://github.com/ErebusEnigma/context-memory
