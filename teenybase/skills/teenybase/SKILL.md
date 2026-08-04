---
name: teenybase
description: Set up and develop backends with Teenybase — a TypeScript-configured backend framework for Cloudflare Workers + D1. Use when creating new backends, adding tables, configuring auth, writing row-level security rules, or deploying to production.
---

# Teenybase Backend Development

You are setting up a **teenybase** backend — a backend-as-a-service on Cloudflare Workers. The entire backend is defined in a single `teenybase.ts` config file. No backend code, no ORM, no route files.

**Prerequisite:** Ensure the teeny CLI is installed globally before running any commands. Install it with `npm install -g teenybase`. Requires Node.js >= 18.14.1.

## Before You Start

Before modifying `teenybase.ts`, understand what the user is building. If the user has not provided clear instructions, ask them to describe what they're building and what their backend needs to do.

Users will typically answer with intentions, not technical specs: "I need login", "I need a database for my recipes", "I need to process Stripe payments and track subscribers." Infer the required tables, auth setup, and access rules from their description. Don't ask for schema details upfront — translate their intent into config.

Determine whether this is a **new project** or **adding teenybase to an existing project**. Infer from context (e.g., existing `package.json` or "add a backend to my app" means existing project). If unclear, ask: "Are we starting a new project or adding teenybase to an existing one?"

## Non-Interactive Flags

Always pass these flags when running commands non-interactively. Without them, commands launch arrow-key prompts that hang when stdin is not a TTY.

| Flag | What it does |
|---|---|
| `-t, --template <template>` | Template: `with-auth` (users + auth + rules) or `blank` (empty). |
| `-y, --yes` | Skip all confirmation prompts, use defaults. |

## Option A: New Project

```bash
teeny create my-app -t with-auth -y
cd my-app
```

Creates the directory, scaffolds all files, runs `npm install`. The `with-auth` template includes a `users` table with email/password auth and row-level security. Use `-t blank` for an empty project.

## Option B: Add to Existing Project

```bash
npm install teenybase hono
npm install -D wrangler @cloudflare/workers-types typescript
teeny init -y
```

`teeny init` detects existing files and only creates what is missing. It will not overwrite `package.json` or `tsconfig.json` (only patches in the `"virtual:teenybase"` path alias). Since it does not modify `package.json`, install deps yourself with the `npm install` lines above.

## Key Files

| File | Purpose |
|---|---|
| `teenybase.ts` | Backend config — tables, fields, auth, rules, actions. The main file you edit. |
| `src/index.ts` | Worker entry point. Usually unchanged unless you need custom routes or R2 storage. |
| `wrangler.jsonc` | Cloudflare Workers config, D1/R2 bindings. |
| `.dev.vars` | Local secrets (JWT_SECRET, JWT_SECRET_USERS, ADMIN_JWT_SECRET, ADMIN_SERVICE_TOKEN, POCKET_UI_VIEWER_PASSWORD, POCKET_UI_EDITOR_PASSWORD). |
| `.prod.vars` | Production secrets (same keys, strong values). Not auto-created — copy from `.dev.vars`. |
| `migrations/` | Auto-generated SQL. Do not edit manually. |

## CLI Quick Reference

```bash
teeny create <name> [-t <tpl>] [-y]  # Scaffold new project (runs npm install)
teeny init [-t <tpl>] [-y]           # Add teenybase to existing project
teeny generate --local               # Generate migrations from config changes
teeny deploy --local                 # Apply migrations to local database
teeny dev --local                    # Start local dev server (port 8787)
teeny deploy --remote                # Deploy to Teenybase Cloud
teeny register                       # Create Teenybase Cloud account (free)
teeny login                          # Log in
teeny status                         # Show deployed URL and status
teeny secrets --remote --upload      # Upload .prod.vars to production
teeny list                           # List deployed workers
teeny delete [name]                  # Delete a deployed worker
teeny logs                           # Stream production logs
teeny inspect [--table <n>] [--validate]  # Dump resolved config as JSON
teeny --help                         # List commands and options
```

## How It Works

Everything about the backend lives in one file: `teenybase.ts`. Edit this file, apply the changes, and the API updates automatically — tables, auth, rules, docs, admin panel, everything.

```
Edit teenybase.ts  -->  teeny deploy --local --yes  -->  teeny dev --local  -->  Test  -->  Repeat or deploy
```

No build step, no ORM, no route files. Change the config, deploy, done.

## Understanding the Config

`teenybase.ts` is the entire backend definition:

```typescript
import { DatabaseSettings, TableAuthExtensionData,
         TableRulesExtensionData } from 'teenybase'
import { baseFields, authFields,
         createdTrigger, updatedTrigger } from 'teenybase/scaffolds/fields'

export default {
    appUrl: 'http://localhost:8787',
    jwtSecret: '$JWT_SECRET',
    tables: [{
        name: 'users',
        autoSetUid: true,
        fields: [
            ...baseFields,       // id + created + updated
            ...authFields,       // username, email, password, name, avatar, role, meta, etc.
        ],
        triggers: [createdTrigger, updatedTrigger],
        extensions: [
            { name: 'auth',
              jwtSecret: '$JWT_SECRET_USERS',
              jwtTokenDuration: 3600,
              maxTokenRefresh: 5,
            } as TableAuthExtensionData,
            { name: 'rules',
              listRule: 'auth.uid == id',
              viewRule: 'auth.uid == id',
              createRule: 'true',
              updateRule: 'auth.uid == id',
              deleteRule: 'auth.uid == id',
            } as TableRulesExtensionData,
        ],
    }],
} satisfies DatabaseSettings
```

**Key concepts:**
- `$` prefix resolves env vars from `.dev.vars` / `.prod.vars`
- Rules are expressions — `auth.uid == id` becomes a SQL WHERE clause
- Extensions add behavior (auth, rules, crud)
- Everything else is auto-generated: REST API, Swagger docs, admin panel

## Local Development Workflow

After setup (Option A or B):

```bash
teeny generate --local    # Generate migrations from your config
teeny deploy --local      # Apply migrations to local SQLite database
teeny dev --local         # Start dev server at http://localhost:8787
```

Available endpoints: health check (`/api/v1/health`), Swagger UI (`/api/v1/doc/ui`), admin panel (`/api/v1/pocket/`).

### Iterating

1. Edit `teenybase.ts`
2. `teeny generate --local` + `teeny deploy --local` (generate and apply migrations)
3. `teeny dev --local` (start server)
4. Test with curl / Swagger / PocketUI
5. Iterate (back to step 1) or `teeny deploy --remote` (production)

## Adding Tables

Add a new table to the `tables` array. Example — a `posts` table linked to `users`:

```typescript
{
    name: 'posts',
    autoSetUid: true,
    fields: [
        ...baseFields,
        { name: 'author_id', type: 'relation', sqlType: 'text', notNull: true,
          foreignKey: { table: 'users', column: 'id' } },
        { name: 'title', type: 'text', sqlType: 'text', notNull: true },
        { name: 'body', type: 'text', sqlType: 'text' },
        { name: 'published', type: 'bool', sqlType: 'boolean', default: sqlValue(false) },
    ],
    triggers: [createdTrigger, updatedTrigger],
    extensions: [
        { name: 'rules',
          listRule: 'published == true | auth.uid == author_id',
          viewRule: 'published == true | auth.uid == author_id',
          createRule: 'auth.uid != null & author_id == auth.uid',
          updateRule: 'auth.uid == author_id',
          deleteRule: 'auth.uid == author_id',
        } as TableRulesExtensionData,
    ],
}
```

Then run `teeny generate --local && teeny deploy --local && teeny dev --local`.

## Row-Level Security (Rules)

The `rules` extension injects SQL WHERE clauses:

```typescript
{ name: 'rules',
  listRule: 'auth.uid == owner_id',
  viewRule: 'auth.uid == owner_id',
  createRule: 'auth.uid != null',
  updateRule: 'auth.uid == owner_id',
  deleteRule: 'auth.uid == owner_id',
} as TableRulesExtensionData
```

**Variables:** `auth.uid` (authenticated user's ID, null if not logged in), any column name, `true`/`false` (allow/deny all), `null` (deny all).

**Operators:** `==`, `!=`, `>`, `<`, `>=`, `<=`, `~` (LIKE), `!~` (NOT LIKE), `in`, `@@` (FTS), `&` (AND), `|` (OR).

## API Endpoints

Base URL: `http://localhost:8787/api/v1` (local). For deployed apps: `teeny status` prints the URL, append `/api/v1`.

**CRUD:**
```
POST   /table/{table}/insert      { "values": {...}, "returning": "*" }
GET    /table/{table}/select      ?where=...&order=...&limit=...
GET    /table/{table}/list        Same as select but returns { items, total }
GET    /table/{table}/view/{id}
POST   /table/{table}/update      { "where": "id == '...'", "setValues": {...} }
POST   /table/{table}/edit/{id}   { "field": "value" }
POST   /table/{table}/delete      { "where": "id == '...'" }
```

**Auth:**
```
POST   /table/{table}/auth/sign-up              { "username", "email", "password", "name" }
POST   /table/{table}/auth/login-password       { "identity", "password" }
POST   /table/{table}/auth/refresh-token        { "refresh_token" }
POST   /table/{table}/auth/request-password-reset   { "email" }
POST   /table/{table}/auth/confirm-password-reset   { "token", "password" }
POST   /table/{table}/auth/request-verification     Authorization: Bearer <token>
POST   /table/{table}/auth/confirm-verification     { "token" }
POST   /table/{table}/auth/logout                   Authorization: Bearer <token>
```

**Auth header:** `Authorization: Bearer <token>`

**Other:** `GET /health`, `GET /doc/ui` (Swagger), `GET /doc` (OpenAPI JSON)

## Environment Variables (Secrets)

`$`-prefixed values in `teenybase.ts` resolve from `.dev.vars` (local) or `.prod.vars` (production).

Default `.dev.vars` (generated by `teeny create`):
```env
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_SECRET_USERS=dev-users-jwt-secret-change-in-production
ADMIN_JWT_SECRET=dev-admin-jwt-secret-change-in-production
ADMIN_SERVICE_TOKEN=dev-admin-token
POCKET_UI_VIEWER_PASSWORD=viewer
POCKET_UI_EDITOR_PASSWORD=editor
```

Upload production secrets with `teeny secrets --remote --upload`.

## Deploy to Production (Teenybase Cloud)

```bash
teeny register                # create account (one-time, free)
teeny deploy --remote --yes   # deploy
teeny status                  # see live URL
```

On first deploy, secrets are auto-generated and saved to `.prod.vars`.

## Testing with curl

```bash
# Sign up
curl -X POST http://localhost:8787/api/v1/table/users/auth/sign-up \
  -H 'Content-Type: application/json' \
  -d '{ "username": "testuser", "email": "test@example.com", "password": "mypassword", "name": "Test User" }'

# Login
curl -X POST http://localhost:8787/api/v1/table/users/auth/login-password \
  -H 'Content-Type: application/json' \
  -d '{ "identity": "test@example.com", "password": "mypassword" }'

# Query data (authenticated)
curl http://localhost:8787/api/v1/table/users/select \
  -H 'Authorization: Bearer <token-from-login>'
```

## Field Scaffolds

Import from `teenybase/scaffolds/fields`:

| Scaffold | Fields |
|---|---|
| `baseFields` | `id` (text PK, auto-UID), `created` (auto-set), `updated` (auto-set) |
| `authFields` | `username`, `email`, `email_verified`, `password` (hidden), `password_salt` (hidden), `name`, `avatar` (R2 file), `role`, `meta` (json) |
| `createdTrigger` | Prevents updating `created` after insert |
| `updatedTrigger` | Auto-updates `updated` on every update |

## Extensions (OpenAPI & PocketUI)

Both are added in `src/index.ts`:

```typescript
import { OpenApiExtension, PocketUIExtension } from 'teenybase/worker'
db.extensions.push(new OpenApiExtension(db))    // /api/v1/doc + /api/v1/doc/ui
db.extensions.push(new PocketUIExtension(db))   // /api/v1/pocket/
```

**PocketUI:** login with `POCKET_UI_VIEWER_PASSWORD` (read-only) or `POCKET_UI_EDITOR_PASSWORD` (read+write) from `.dev.vars`/`.prod.vars`.

## Email & OAuth

Add `email` and `authProviders` to the config:

```typescript
email: {
    from: 'noreply@yourdomain.com',
    mock: true,                       // logs to console in dev
    variables: { company_name: 'My App', company_url: 'http://localhost:8787',
                 company_address: '', company_copyright: '2025 My App',
                 support_email: 'support@yourdomain.com' },
},
authProviders: [
    { name: 'google', clientId: '$GOOGLE_CLIENT_ID', clientSecret: '$GOOGLE_CLIENT_SECRET' },
],
```

`email` enables verification and password reset endpoints. `authProviders` enables OAuth login.

## Resources

- [Teenybase GitHub](https://github.com/teenybase/teenybase)
- [npm package](https://www.npmjs.com/package/teenybase)
- [Website](https://teenybase.com)
