# @afterhours/game-engine

Pure, dependency-free rules for AFTERHOURS cases. No DOM, no network, no storage:
every function takes state and returns new state, so the same rules can run in the
browser and on the server.

- `src/case.ts`: evidence, discovery gating, archive unlock, endings, save validation
- `src/investigation.ts`: deductions, timeline, hints, notebook, readiness check

~~~
npm test -w @afterhours/game-engine
~~~
