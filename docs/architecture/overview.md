# Architecture overview

AFTERHOURS is a mystery-game platform. Players investigate cases alone or together,
communities gather for scheduled live "case nights", and creators publish their own cases.

## Current system (v0.3)

```mermaid
flowchart LR
  subgraph Browser
    W[apps/web<br/>Case 001 player client]
  end
  subgraph Node
    WS[apps/web/server.mjs<br/>static + type stripping]
    API[apps/api<br/>Fastify]
  end
  GE[(packages/game-engine<br/>pure rules)]
  DB[(PostgreSQL<br/>users · sessions · audit_log)]
  W -- HTTP --> WS
  WS -. serves .-> GE
  WS -- "/api/* proxy" --> API
  API -- SQL --> DB
  API -. will import .-> GE
```

The browser only talks to the web server. It serves the game and forwards `/api/*` to
the API, so the session cookie is same-origin (ADR-0007). Case progress is still saved
in the browser until #5.

## Layers inside the API

| Layer | Example | Depends on |
|-------|---------|-----------|
| Routes | `auth/routes.ts` | Fastify, services |
| Services (business rules) | `auth/service.ts` | the `AuthStore` interface, limiters, a clock |
| Stores (persistence) | `auth/postgres-store.ts`, `auth/memory-store.ts` | `pg` / nothing |
| Infrastructure | `db/pool.ts`, `db/migrate.ts`, `config.ts` | `pg`, `zod` |

Rules never import Fastify or `pg`. That is what lets `auth-service.test.ts` run in
milliseconds with an in-memory store and a fake clock, while
`integration/postgres.test.ts` proves the SQL against a real database.

## Request lifecycle

1. `onRequest` hook reads the session token (cookie or Bearer), hashes it, and loads the
   active session joined to its user into `req.user`.
2. Route-level guards (`requireUser`, `requireRole('admin')`) reject with `401` / `403`.
3. The handler passes the raw body to a service, which validates it with zod.
4. Errors are `AppError`s with stable codes, serialised as
   `{ "error": { "code", "message", "details?" } }`. Anything else is logged and becomes a
   generic `500`.

## Data model

```mermaid
erDiagram
  users ||--o{ sessions : has
  users ||--o{ audit_log : "acts in"
  users {
    uuid id PK
    citext email UK
    text display_name
    text password_hash
    text role "player | creator | admin"
  }
  sessions {
    char64 token_hash PK
    uuid user_id FK
    timestamptz expires_at
    timestamptz revoked_at
    inet ip
  }
  audit_log {
    bigint id PK
    uuid actor_id FK
    text action
    uuid target_id
    jsonb metadata
  }
```

Constraints live in the database as well as the code: case-insensitive unique email
(`citext`), allowed roles (`CHECK`), sessions deleted with their user, audit rows kept
when a user is deleted.

## Where it is going

See [ROADMAP.md](../../ROADMAP.md). The planned shape:

```mermaid
flowchart LR
  Web[Next.js web] --> API
  Admin[Admin console] --> API
  API[API: identity · cases · rooms · events · creator API] --> PG[(Postgres)]
  API --> R[(Redis: presence · pub/sub · queues · rate limits)]
  RT[Realtime gateway<br/>WebSockets] --> R
  Web <--> RT
  Worker[Job worker<br/>reminders · notifications] --> R
  Worker --> PG
  Rec[Python discovery service] --> PG
  API --> Rec
```

Each new box arrives only with the feature that needs it; see the ADRs for the reasoning.
