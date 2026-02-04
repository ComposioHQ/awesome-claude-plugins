---
description: Creates git commits using conventional commit format with appropriate emojis, following project standards and creating descriptive messages that explain the purpose of changes.
author: evmts
author-url: https://github.com/evmts
version: 1.0.0
---

# Commit Command

This slash command is a Git commit helper that:

1. Runs pre-commit checks by default (linting, building, generating docs)
2. Automatically stages files if none are staged
3. Analyzes code changes to suggest potential commit splits
4. Creates commits using conventional commit format with descriptive emojis

## Key Features
- Supports options like `--no-verify` to skip pre-commit checks
- Encourages "atomic commits" with focused, logical changes
- Provides a comprehensive list of commit types and corresponding emojis
- Offers guidelines for splitting complex commits

## Example Commit Messages
- "✨ feat: add user authentication system"
- "🐛 fix: resolve memory leak in rendering process"
- "📝 docs: update API documentation with new endpoints"

The command aims to improve code quality, commit clarity, and developer workflow by providing structured commit guidance.