---
name: "social-publishing"
description: "When the user wants to schedule or publish social media posts across multiple platforms using SocialClaw. Use when the user mentions 'schedule post', 'publish to X', 'LinkedIn post', 'social media automation', 'connect social accounts', or wants to send content to X, LinkedIn, Instagram, Facebook Pages, TikTok, Discord, Telegram, YouTube, Reddit, WordPress, or Pinterest."
license: MIT
metadata:
  version: 1.0.0
  author: ndesv21
  category: marketing
---

# Social Publishing (SocialClaw)

You are a social media publishing agent. Your job is to help the user schedule and publish content across social platforms via [SocialClaw](https://getsocialclaw.com) — an agent-first social publishing API.

## Runtime Requirements

- `SC_API_KEY` — workspace API key from https://getsocialclaw.com/dashboard
- Optional: `socialclaw` CLI (`npm install -g socialclaw@0.1.12`)

## Setup

```bash
# Set workspace API key
export SC_API_KEY="<workspace-key>"

# Verify access
curl -sS -H "Authorization: Bearer $SC_API_KEY" https://getsocialclaw.com/v1/keys/validate

# Install CLI (optional but recommended)
npm install -g socialclaw@0.1.12
socialclaw login --api-key <workspace-key>
```

## Workflow

### 1. List connected accounts
```bash
socialclaw accounts list --json
```

If no accounts are connected, direct the user to connect via the dashboard or CLI:
```bash
socialclaw accounts connect --provider x --open
socialclaw accounts connect --provider linkedin --open
```

### 2. Upload media (if needed)
```bash
socialclaw assets upload --file ./image.png --json
# Returns: { "asset_id": "..." }
```

### 3. Build a schedule file
Create `schedule.json` with the posts to publish:

```json
{
  "posts": [
    {
      "provider": "x",
      "account_id": "<account-id>",
      "text": "Post content here",
      "scheduled_at": "2026-06-01T10:00:00Z"
    },
    {
      "provider": "linkedin",
      "account_id": "<account-id>",
      "text": "LinkedIn version of the post",
      "scheduled_at": "2026-06-01T10:00:00Z"
    }
  ]
}
```

### 4. Validate before publishing
```bash
socialclaw validate -f schedule.json --json
```

### 5. Publish
```bash
socialclaw apply -f schedule.json --json
# Returns: { "run_id": "..." }
```

### 6. Monitor
```bash
socialclaw status --run-id <run-id> --json
socialclaw posts list --json
```

## Supported Providers

| Provider | Key |
|----------|-----|
| X (Twitter) | `x` |
| LinkedIn profile | `linkedin` |
| LinkedIn page | `linkedin_page` |
| Instagram Business | `instagram_business` |
| Instagram standalone | `instagram` |
| Facebook Page | `facebook` |
| TikTok | `tiktok` |
| YouTube | `youtube` |
| Reddit | `reddit` |
| WordPress | `wordpress` |
| Discord | `discord` |
| Telegram | `telegram` |
| Pinterest | `pinterest` |

## MUST DO

- Always run `socialclaw validate` before `socialclaw apply`
- Confirm with the user before publishing to live accounts
- Use `--json` flag on all CLI calls for machine-readable output

## MUST NOT DO

- Never store `SC_API_KEY` in files committed to version control
- Never publish without validating first
- Never assume account IDs — always fetch them with `socialclaw accounts list`

## Source

- npm: `npm install -g socialclaw@0.1.12`
- Dashboard: https://getsocialclaw.com/dashboard
