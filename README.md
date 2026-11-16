# AFTERHOURS

[![CI](https://github.com/lungelooZi/AFTERHOURS-source/actions/workflows/ci.yml/badge.svg)](https://github.com/lungelooZi/AFTERHOURS-source/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A mystery-game platform. It starts with **Case 001: The Missing Hour**, a browser mystery
set inside a missing person's laptop, and is growing into a place to investigate cases
together, host live case nights for your community, and publish your own mysteries.

Original project by Lungelo Zikalala. All people, places and records in the cases are fictional.

## What's in the repo

| Path | What it is | Status |
|------|------------|--------|
| [`apps/web`](apps/web) | The player client: renders the case and sends moves; holds no answers. Forwards `/api/*` to the API | Playable |
| [`packages/game-engine`](packages/game-engine) | Server-only case rules: a pure reducer and a redacted player view | Tested |
| [`apps/api`](apps/api) | Platform API: cases (players and guests), accounts, sessions and devices, password reset, roles, audit log | Phase 3 |
| [`docs/`](docs) | [Architecture](docs/architecture/overview.md), [decisions](docs/decisions), [OpenAPI](docs/api/openapi.yaml) | |

## Quick start

Requires **Node.js 24** (Node 22.18+ also works) and, for the API, **Docker**.

~~~
git clone https://github.com/lungelooZi/AFTERHOURS-source.git
cd AFTERHOURS-source
npm install
~~~

### Play Case 001 (no database needed)

~~~
npm run dev:memory
~~~

Open http://localhost:3000. This starts the API without a database and the game server
together; everything is forgotten when you press Ctrl+C. The browser never receives the
answers: every move is checked by the API ([ADR-0009](docs/decisions/0009-run-cases-on-the-server.md)).

### Run with Postgres (progress and accounts are kept)

~~~
docker compose up -d db
cp .env.example apps/api/.env        # PowerShell: Copy-Item .env.example apps/api/.env
npm run dev
~~~

`npm run dev` starts the API (http://localhost:4000, migrations run on start) and the
game server (http://localhost:3000) together. Play as a guest, or use the **Account** app:
guest progress moves into your account when you sign up. The game server forwards
`/api/*` to the API ([ADR-0007](docs/decisions/0007-same-origin-api-proxy.md)); set
`API_URL` if the API runs elsewhere. You can also run them separately with
`npm run dev:api` and `npm start`.

**Forgot your password?** In development no email is sent: the reset email, with its
link, is printed in the terminal running the API. Open the link to choose a new password.

Or call the API directly:

~~~
curl -c jar.txt -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"a long passphrase","displayName":"You"}' \
  http://localhost:4000/auth/register
curl -b jar.txt http://localhost:4000/auth/me
~~~

Make yourself an admin: `npm run promote -w @afterhours/api -- you@example.com admin`

## Tests

~~~
npm run typecheck          # strict TypeScript across api and game-engine
npm test                   # game-engine, web server + clients + spoiler check (node:test), API (Vitest)
npm run test:integration   # API against real Postgres
npm run test:e2e           # Playwright: plays Case 001 in a real browser (no database needed)
~~~

The first time you run the end-to-end tests, install the browser with
`npx playwright install chromium`.

Integration tests need `DATABASE_URL`, for example
`postgres://afterhours:afterhours@localhost:5432/afterhours_test` (created by Docker Compose).
CI runs all four on every push and pull request.

## Engineering highlights

- **No answers in the browser.** The game runs on the server as a pure reducer; players get
  a redacted view that reveals each answer only once it is earned. A crawler test fails if
  any answer appears in what the page downloads
  ([ADR-0009](docs/decisions/0009-run-cases-on-the-server.md)).
- **Guests and accounts, one model.** Every player has a server-side run; guest progress
  moves into the account on sign-up. Saves use optimistic locking, so two tabs can't
  overwrite each other.
- **Rules separate from interfaces.** Game rules and API services know nothing about HTTP
  or SQL, and are tested directly.
- **Sessions you can actually revoke.** Opaque random tokens, stored only as SHA-256
  hashes, in httpOnly cookies; sign-out and role changes apply instantly
  ([ADR-0003](docs/decisions/0003-opaque-server-side-sessions.md)).
- **Password safety without native deps.** scrypt with self-describing parameters,
  automatic upgrade on login, and constant-work responses for unknown emails
  ([ADR-0004](docs/decisions/0004-scrypt-password-hashing.md)).
- **Account recovery without enumeration.** Password reset answers the same for every
  email, uses single-use hashed tokens carried in the URL fragment, and completes in one
  transaction that also signs out every device
  ([ADR-0008](docs/decisions/0008-password-reset-tokens.md)).
- **Brute-force protection.** Sliding-window limits per account+IP and per IP, with
  `Retry-After` ([ADR-0005](docs/decisions/0005-in-memory-rate-limiting-until-we-scale.md)).
- **Database as a second line of defence.** Case-insensitive unique emails, role `CHECK`
  constraints, cascading sessions, append-only audit log, concurrency-safe migrations.
- **One origin, no CORS.** The game server proxies `/api/*`, overwriting
  `X-Forwarded-For` so clients can't spoof the IP the rate limiter sees
  ([ADR-0007](docs/decisions/0007-same-origin-api-proxy.md)).
- **No build step.** TypeScript runs directly on Node's type stripping and is checked by
  `tsc --noEmit` ([ADR-0002](docs/decisions/0002-typescript-without-a-build-step.md)).

## Roadmap

See [ROADMAP.md](ROADMAP.md) and the [open issues](https://github.com/lungelooZi/AFTERHOURS-source/issues).
Next up: Phase 4, playing together: multiplayer case rooms over WebSockets.

## Known limitations

- Login and guess rate limits are per process; multiple API instances need Redis (ADR-0005).
- Guest runs are never cleaned up yet (needs the Phase 4 job queue).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).

## Changelog

- **v0.5.1** - End-to-end tests: Playwright plays the whole case, carries guest progress
  into an account, signs one device out from another, and checks no answers are
  downloaded. Runs in CI against the API in memory mode.
- **v0.5** - Cases run on the server (#5): the browser no longer receives any answers.
  Progress is saved per account or per guest, moves into your account when you sign up,
  and is protected by optimistic locking; wrong archive passwords are rate limited.
  `npm run dev` / `npm run dev:memory` start everything with one command, the second
  without a database. Old browser-saved progress is reset. ADR-0009.
- **v0.4** - Phase 2 complete. Sign-in and sign-up in the game through a same-origin
  `/api` proxy (#2); password reset with single-use hashed tokens (#3); see and sign out
  individual devices (#4). ADR-0007 and ADR-0008.
- **v0.3** - Monorepo; game rules extracted to `packages/game-engine`; new platform API
  with accounts, sessions, roles, rate limiting and audit log; Postgres migrations;
  CI with integration tests; architecture docs, ADRs and OpenAPI spec; MIT license.
- **v0.2** - Deductions, Timeline, Notebook and Hints; the rescue decision now requires
  verified deductions; tests run in GitHub Actions.
- **v0.1** - First playable slice: messages, files, encrypted archive, evidence board and two endings.
