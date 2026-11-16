# 0006. Fastify with plain modules instead of NestJS

Date: 2026-11-16 · Status: Accepted

## Context

The first stack proposal listed NestJS for the API. NestJS relies on legacy decorators and
`emitDecoratorMetadata`, which require a compile step and do not work with Node's type
stripping (ADR-0002). Our API is currently a handful of modules.

## Decision

Use Fastify 5 with explicit dependency injection: `buildApp(deps)` receives the services
it needs, and each feature exports a route plugin plus a framework-free service.

## Consequences

- Services are plain classes that tests construct directly with fakes (`MemoryAuthStore`,
  a fake clock), and HTTP tests use `app.inject()` without opening a port.
- We write a little wiring by hand in `server.ts` that NestJS would generate.
- If the API grows to many teams and modules, NestJS can be reconsidered; services would
  move over largely unchanged because they do not depend on Fastify.
