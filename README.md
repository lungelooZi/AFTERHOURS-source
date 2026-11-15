# AFTERHOURS

A mystery inside a missing person's laptop. Original project by Lungelo Zikalala.

## Run

Requires Node.js 24 or later. No package installation is required for this first slice.

```sh
node server.mjs
```

Open http://localhost:3000. Run tests with `node --test tests/*.test.mjs`.

## First playable slice

Read two conversations, recover files, decrypt an archive, pin evidence and choose a rescue channel. Five clues, three named suspects, two endings. The browser saves progress locally. Restart erases only this game's save after confirmation. All people and records are fictional.

## Architecture and scope

`src/case.ts` contains the typed case model, guarded progression, save validation and ending logic. `src/app.ts` renders the fictional desktop and draggable application window. `server.mjs` serves an explicit allowlist of assets and strips TypeScript with Node's built-in support. Tests cover evidence gating, password checks, save recovery and both endings.

This initial vertical slice uses native DOM rendering and a built-in Node server so it runs without a package manager. The agreed production stack remains React/TypeScript, Express, PostgreSQL and Socket.IO. Multiplayer, authentication, server-authoritative clues, cloud saves, voice notes and a case creator are planned, not implemented. Current puzzle answers ship to the client: appropriate for a solo prototype, not competitive play. This compact case is not yet the planned 15-minute experience.

## Next milestones

1. Expand the story into a timed 15-minute investigation with deductions and branching conversations.
2. Move the interface to React components and add browser interaction tests.
3. Add Express/PostgreSQL persistence and two-player Socket.IO rooms with private clues.
4. Add authoring tools, accessibility review and deployment.

## GitHub

## Version 0.2 investigation upgrade

Four new desktop apps are available: Deductions, Timeline, Notebook and Hints.
Verify three conclusions using the correct answers and their supporting recovered
documents before making contact. Timeline events appear when their source clues
are found. Notes (up to 4,000 characters), deductions and revealed hints save on
this device, alongside the original case progress. Restart clears both saves.

`src/investigation.ts` contains the pure deduction and journal recovery rules;
`src/journal-ui.ts` renders the new tools. GitHub Actions runs tests on Node 24
for pushes and pull requests. No dependencies need to be installed.

Validation: seven rule and save-recovery tests pass. All served assets passed
HTTP smoke checks, and all browser modules passed JavaScript syntax checks.
Full browser interaction and visual testing remain pending.

This remains a solo prototype with local saves and client-visible puzzle answers.
Accounts, multiplayer and cloud saves are not implemented.

The source is initialized locally with Git. A GitHub remote has not yet been connected. Do not commit credentials; `.env` is ignored.
