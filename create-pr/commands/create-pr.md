---
description: Streamlines pull request creation by handling the entire workflow: creating a new branch, committing changes, formatting modified files with Biome, and submitting the PR.
author: toyamarinyon
author-url: https://github.com/toyamarinyon
version: 1.0.0
---

# Create Pull Request Command

This command automates the process of creating a pull request with several key features:

## Key Behaviors
- Creates a new branch from current changes
- Formats files using Biome
- Automatically splits changes into logical commits
- Generates descriptive commit messages
- Pushes branch to remote repository
- Creates a pull request with summary and test plan

## Commit Splitting Guidelines
- Split commits by feature, component, or concern
- Keep related file changes together
- Separate refactoring from new features
- Ensure each commit is independently understandable
- Separate unrelated changes into distinct commits

The command aims to streamline the code contribution process by providing intelligent commit and pull request creation.