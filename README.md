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
| [`apps/web`](apps/web) | The player client: Case 001 in a desktop-style interface, plus accounts; forwards `/api/*` to the API | Playable |
| [`packages/game-engine`](packages/game-engine) | Pure case rules: evidence gating, deductions, timeline, endings, save validation | Tested |
| [`apps/api`](apps/api) | Platform API: accounts, sessions, roles, audit log | Phase 2 in progress |
| [`docs/`](docs) | [Architecture](docs/architecture/overview.md), [decisions](docs/decisions), [OpenAPI](docs/api/openapi.yaml) | |

## Quick start

Requires **Node.js 24** (Node 22.18+ also works) and, for the API, **Docker**.

~~~
git clone https://github.com/lungelooZi/AFTERHOURS-source.git
cd AFTERHOURS-source
npm install
~~~

### Play Case 001

~~~
npm start
~~~

Open http://localhost:3000. To use another port: `PORT=3001 npm start`
(PowerShell: `$env:PORT=3001; npm start`).

### Run the API

~~~
docker compose up -d db
cp .env.example apps/api/.env        # PowerShell: Copy-Item .env.example apps/api/.env
npm run dev:api
~~~

The API listens on http://localhost:4000 and applies database migrations on start.
With both running (`npm start` in one terminal, `npm run dev:api` in another), open
http://localhost:3000 and use the **Account** app to create an account. The game server
forwards `/api/*` to the API ([ADR-0007](docs/decisions/0007-same-origin-api-proxy.md));
set `API_URL` if the API runs elsewhere.

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
npm test                   # game-engine, web server + account client (node:test), API (Vitest)
npm run test:integration   # API against real Postgres
~~~

Integration tests need `DATABASE_URL`, for example
`postgres://afterhours:afterhours@localhost:5432/afterhours_test` (created by Docker Compose).
CI runs all three on every push and pull request.

## Engineering highlights

- **Rules separate from interfaces.** The game's rules are pure functions shared by the
  client and (next) the server; the API's rules are services that don't know about HTTP
  or SQL. Both are tested directly.
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
Next up: a devices page (#4), then moving case progress and rule enforcement to the
server (#5).

## Known limitations

- Case progress is still saved only in the browser, and puzzle answers ship to the client
  (fixed in Phase 3).
- Login rate limits are per process; multiple API instances need Redis (ADR-0005).
- No browser (Playwright) tests yet.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under the [MIT License](LICENSE).

## Changelog

- **v0.3** - Monorepo; game rules extracted to `packages/game-engine`; new platform API
  with accounts, sessions, roles, rate limiting and audit log; Postgres migrations;
  CI with integration tests; architecture docs, ADRs and OpenAPI spec; MIT license.
- **v0.2** - Deductions, Timeline, Notebook and Hints; the rescue decision now requires
  verified deductions; tests run in GitHub Actions.
- **v0.1** - First playable slice: messages, files, encrypted archive, evidence board and two endings.
