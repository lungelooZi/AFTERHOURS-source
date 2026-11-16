# 0002. Run TypeScript directly with Node type stripping

Date: 2026-11-16 · Status: Accepted

## Context

v0.2 already served `.ts` files by stripping types at request time, so the project had no
build step. Adding an API raised the question of introducing `tsc` output, `tsx`, or a
bundler.

## Decision

The API runs `.ts` files directly with Node's built-in type stripping (Node ≥ 22.18; CI
uses Node 24). `tsc --noEmit` is used only as a type checker. Code is limited to erasable
syntax (`erasableSyntaxOnly` in `tsconfig.base.json`).

## Consequences

- No `dist/` folder, no source maps to manage, and stack traces point at real lines.
- No `enum`, `namespace` or constructor parameter properties; we use union types and
  explicit fields instead.
- Decorator-heavy frameworks are a poor fit (see ADR-0006).
- If we later need a production bundle (cold-start time, a serverless target), we can add
  one without changing source code.
