# 0009. Run cases on the server; the browser gets a redacted view

Date: 2026-11-16 · Status: Accepted · Issue: #5

## Context

Until v0.4 the browser downloaded `case.ts` and `investigation.ts`, which contained the
archive password, every deduction's answer and explanation, and the endings. Anyone
could open developer tools and read them. Progress lived in `localStorage`, so it was
also trivially editable and could not follow a player between devices.

## Decision

- **`packages/game-engine` is server-only.** It now has three parts:
  - `cases/case-001.ts`: the case definition, including every answer.
  - `rules.ts`: a pure reducer, `apply(run, case, action) → { run, outcome }`.
  - `view.ts`: `toPlayerView(run, case)`, which includes each piece of text only once the
    player has earned it (evidence once found, an answer once its deduction is solved,
    the final prompt once ready, the ending once chosen).
- **The browser sends actions and renders views.** `GET /cases/:id`,
  `POST /cases/:id/actions`, `POST /cases/:id/restart`. A refused move (wrong password,
  unsupported deduction) is a normal `200` with `outcome.accepted = false` and a coarse
  reason that never says which part was wrong.
- **Everyone has a server-side run** in `case_runs`, owned by a user or by a guest. Guests
  are identified by a random `ah_guest` cookie, stored only as a hash. The first time a
  signed-in request still carries a guest cookie, that guest run moves to the account
  (unless the account already has one) and the cookie is cleared.
- **Concurrency**: every save names the version it read (`UPDATE … WHERE version = $n`).
  If another tab saved first, the action is re-applied to the fresh state, up to three
  times, then `409 conflict`.
- **Abuse limits**: 30 new guests per IP per hour; 10 wrong archive passwords per run per
  10 minutes (the key is a 4-digit year, so it would otherwise be brute-forceable).
- **No-database mode**: `STORE=memory` runs the API with in-memory stores, so the game can
  be played (and end-to-end tested) without Docker. `npm run dev:memory` starts both apps.
- **Regression test**: `apps/web/test/no-spoilers.test.mjs` crawls everything the page
  loads and fails if any answer appears. It was committed first, failing, then fixed.

## Consequences

- Playing now needs the API running. `npm run dev:memory` keeps that to one command.
- Every move is a network round trip (~1 ms locally). Fine for a turn-based mystery; real
  time multiplayer (Phase 4) will add WebSockets on top of the same reducer.
- Guest rows accumulate. A cleanup job for guest runs untouched for 180 days belongs with
  the job queue planned for Phase 4.
- Old `localStorage` progress is discarded on first load: it could not be trusted, and
  importing it would let anyone forge a solved case.
- The multiple-choice options are still visible before solving (that's the puzzle);
  which option is right, and why, is not.
