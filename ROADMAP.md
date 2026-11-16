# Roadmap

AFTERHOURS grows from a single-player mystery into a platform for playing, hosting and
creating mysteries. Each phase ships something usable and keeps the game working.

## Phase 1: Foundation ✅ (v0.3)

- npm-workspaces monorepo: `apps/web`, `apps/api`, `packages/game-engine`
- TypeScript type-checked in strict mode, run without a build step
- Postgres via Docker Compose, forward-only SQL migrations with an advisory lock
- CI: typecheck, unit tests, integration tests against a Postgres service container
- MIT license, contributing guide, architecture overview, ADRs, OpenAPI spec

## Phase 2: Identity ✅ (v0.4)

- [x] Registration and sign-in with scrypt-hashed passwords
- [x] Opaque, hashed, revocable sessions (cookie + Bearer)
- [x] Roles: player, creator, admin; admin role management
- [x] Login rate limiting (per account+IP and per IP)
- [x] Audit log of security events
- [x] Sign-in / sign-up screens in the web client, served same-origin through an `/api` proxy (#2)
- [x] Password reset by email: single-use, expiring, hashed tokens; development emails print to the terminal (#3)
- [x] See and sign out individual devices from the Account window (#4)

## Phase 3: Cases on the server (v0.5) 🚧

- [x] Case progress saved on the server, per account or per guest; guest progress moves into the account on sign-up (#5)
- [x] The API applies every action with `game-engine` and returns a redacted view, so answers no longer ship to the browser (#5)
- [x] Run without a database (`npm run dev:memory`) for quick play and end-to-end tests
- [ ] Playwright tests for the core flows, in CI
- [ ] Case catalogue: more than one case, listed from the server
- [ ] Player client moves to React/Next.js

## Phase 4: Play together (v0.6)

- Two-to-four player case rooms over WebSockets; each player holds private clues
- Presence, room chat and shared evidence board
- Redis for pub/sub, presence and the distributed rate limiter (ADR-0005)
- Background worker for notifications, with idempotent retries

## Phase 5: Community and case nights (v0.7)

- Communities (clubs) with members, moderators and channels
- Scheduled live case nights: RSVPs, capacity, waitlists, reminders, time zones
- Analytics: completion rates, where players get stuck, hint usage per case

## Phase 6: Creators and the developer API (v0.8)

- Case editor: evidence, deductions, timeline, endings, with validation that a case is solvable
- Versioned case publishing and moderation queue
- Public API with API keys, scopes and per-key rate limits
- Discovery: search and recommendations for cases and case nights (Python service)

## Phase 7: Hardening (v1.0)

- Threat model and security review, dependency scanning
- Load tests for rooms and case nights
- Accessibility review of the player client
- Deployment, backups, monitoring and an operations runbook
