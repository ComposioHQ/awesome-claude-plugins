---
name: add-sub
description: Subscribe to a skill event. Adds a subscription that injects context before or after a skill runs. Supports optional conditions at both insert-level (inherited by all subscriptions) and subscription-level (AND-stacked). Conditions include fileExists, gitBranch, envSet, envEquals, fileContains (with optional regex).
---

# Subscribe to Skill Event

This skill delegates to the `/skill-bus:add-sub` command for the full interactive process.

Run the command directly: `/skill-bus:add-sub`
