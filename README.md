# AFTERHOURS

A browser mystery game set inside a missing person's laptop. Read her messages, recover files, crack an encrypted archive, prove your deductions - then make one call you cannot take back.

Original project by Lungelo Zikalala. All people, places and records are fictional.

## Play it locally

Requires Node.js 24 or later. There are no packages to install and no build step.

~~~
git clone https://github.com/lungelooZi/AFTERHOURS-source.git
cd AFTERHOURS-source
node server.mjs
~~~

Then open http://localhost:3000. If port 3000 is busy, pick another one:

- Windows PowerShell: `$env:PORT=3001; node server.mjs`
- macOS / Linux: `PORT=3001 node server.mjs`

## How to play

You have Maya's laptop. She left it behind the night she disappeared.

1. Open **Messages** and **Files** to recover traces.
2. Unlock the **Archive** - the password is hidden in what you recover.
3. Pin documents to the **Evidence board** and watch the **Timeline** fill in.
4. Prove three conclusions in **Deductions** by choosing the right answer *and* the documents that support it.
5. **Make contact** - choose who receives Maya's location. There are two endings.

The **Notebook** keeps your theories and **Hints** gives progressively stronger nudges. Progress saves in your browser; **Restart case** clears it.

## Features (v0.2)

- Nine desktop apps in a draggable window interface
- Evidence gating: locked documents cannot be read before they are unlocked
- Deductions checked against both the answer and the supporting evidence
- A timeline that only reveals events once their source document is found
- Validated local saves: corrupted or tampered save data recovers safely
- Game rules enforced in pure, tested logic - not only in the interface

## How it is built

- `src/case.ts` - evidence, progression, save validation and endings (pure logic)
- `src/investigation.ts` - deductions, timeline, hints and notebook rules (pure logic)
- `src/app.ts`, `src/journal-ui.ts` - the desktop interface, written with native DOM APIs
- `server.mjs` - a small Node HTTP server that serves an explicit allowlist of files and strips TypeScript types with Node's built-in support, so the project needs no build step
- `tests/` - Node's built-in test runner; GitHub Actions runs the tests on every push

Design choices: the prototype has zero dependencies so it runs anywhere Node does, and the game rules are kept separate from the interface so they can be tested directly and later moved to a server.

## Tests

~~~
node --test tests/*.test.mjs
~~~

8 tests cover evidence gating, the archive password, deductions, the rescue decision and save recovery.

## Known limitations

- Single-player prototype; progress is saved only in the browser.
- Puzzle answers ship to the browser - fine for solo play, not for competitive play.
- The case takes a few minutes; the target is a 15-minute investigation.
- No automated browser (interface) tests yet.

## Roadmap

1. Expand the story into a timed 15-minute investigation with branching conversations.
2. Move the interface to React components and add browser interaction tests.
3. Add Express/PostgreSQL persistence and two-player Socket.IO rooms with private clues.
4. Add a case editor, an accessibility review and deployment.

## Changelog

- **v0.2** - Deductions, Timeline, Notebook and Hints; the rescue decisionnow requires verified deductions; tests run in GitHub Actions.
- **v0.1** - First playable slice: messages, files, encrypted archive, evidence board and two endings.