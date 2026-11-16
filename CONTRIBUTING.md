# Contributing to AFTERHOURS

## Workflow

1. Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>` or `chore/<short-name>`.
2. Keep each commit focused and describe *why* in the message body when it is not obvious.
3. Run the checks before pushing:
   ~~~
   npm run typecheck
   npm test
   npm run test:integration   # needs Postgres, see README
   ~~~
4. Open a pull request. CI must pass. Describe the behaviour change and how it was tested.

## Bugs

When fixing a bug, first add a test that fails because of it, then fix it. Mention the
issue number in the commit (`Fixes #12`).

## Architectural changes

Decisions that are expensive to reverse (a new service, a new datastore, a change to the
auth model) get a short record in `docs/decisions/`. Copy the format of an existing ADR
and number it sequentially.

## Code style

- TypeScript, strict mode, run directly by Node's type stripping: only erasable syntax
  (no `enum`, no `namespace`, no constructor parameter properties).
- Import local files with their `.ts` extension.
- Business rules stay out of HTTP handlers: handlers parse input and call a service.
- Every SQL query is parameterised.

## AI-assisted development

AI coding assistants are welcome. You remain responsible for the change: read and
understand every line, make sure tests cover it, and be able to explain the design.
