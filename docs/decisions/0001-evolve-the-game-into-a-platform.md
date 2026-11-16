# 0001. Evolve the game into a platform, in one monorepo

Date: 2026-11-16 · Status: Accepted

## Context

AFTERHOURS v0.2 is a single-player browser mystery game with pure, tested rule modules
(`case.ts`, `investigation.ts`) and a DOM interface. The product direction is a platform:
accounts, multiplayer case rooms, scheduled live "case nights", a creator case editor and
a public API. We considered starting a new repository for the platform.

## Decision

Keep one repository and grow it into an npm-workspaces monorepo:

- `packages/game-engine`: the existing rules, unchanged, now shared by every app.
- `apps/web`: the existing player client, unchanged in behaviour.
- `apps/api`: the new platform API (identity first).

## Consequences

- The game keeps working at every step and its history stays in one place.
- The API can enforce the same rules as the client by importing `game-engine`, which is
  how we will stop shipping puzzle answers to the browser (a known v0.2 limitation).
- npm workspaces are enough for three packages; we will revisit Turborepo/Nx only if build
  times become a problem.
