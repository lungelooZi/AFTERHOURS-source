# @afterhours/api

The AFTERHOURS platform API (Fastify, PostgreSQL). See the root README for setup and
[docs/architecture/overview.md](../../docs/architecture/overview.md) for the design.

~~~
src/
  app.ts                 buildApp(deps): HTTP app without a port, used by server and tests
  server.ts              production wiring: config, pool, migrations, limiters, listen
  config.ts              environment validation (zod)
  errors.ts              AppError + stable error codes
  auth/
    service.ts           identity rules: register, login, sessions, roles
    routes.ts            HTTP routes, cookie handling, requireUser / requireRole
    types.ts             domain types and the AuthStore interface
    postgres-store.ts    AuthStore on Postgres
    memory-store.ts      AuthStore in memory (tests)
    password.ts          scrypt hashing
    tokens.ts            session token generation and hashing
    rate-limiter.ts      sliding-window attempt limiter
  admin/routes.ts        role management, audit log
  health/routes.ts       /health and /ready
  db/                    pool, migration runner, SQL migrations
  scripts/               migrate, promote (CLI)
test/                    unit + HTTP tests (Vitest, no database)
test/integration/        tests against real Postgres
~~~
