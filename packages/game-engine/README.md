# @afterhours/game-engine

Pure rules for AFTERHOURS cases. **Server-only**: case definitions contain every answer,
so this package must never be served to the browser (see ADR-0009).

- `src/cases/case-001.ts`: Case 001, *The Missing Hour*: evidence, deductions, timeline,
  hints, endings and the archive password
- `src/rules.ts`: `apply(run, case, action)` returns the next run and an outcome; plus
  `freshRun`, `restoreRun` (validates stored JSON) and `ready`
- `src/view.ts`: `toPlayerView(run, case)`, the redacted view a player is allowed to see
- `src/types.ts`: shared types (`CaseDefinition`, `Run`, `Action`, `Outcome`)

No DOM, network, storage, clock or randomness, so every rule is tested directly.

~~~
npm test -w @afterhours/game-engine
~~~
