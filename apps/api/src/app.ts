import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { adminRoutes } from './admin/routes.ts';
import { authRoutes, registerAuthentication } from './auth/routes.ts';
import type { AuthService } from './auth/service.ts';
import type { AuthStore } from './auth/types.ts';
import { AppError } from './errors.ts';
import { healthRoutes } from './health/routes.ts';

export const VERSION = '0.3.0';

export type AppDependencies = {
  auth: AuthService;
  store: AuthStore;
  checkDatabase: () => Promise<boolean>;
  secureCookies: boolean;
  trustProxy?: boolean;
  logger?: boolean;
};

/**
 * Builds the HTTP application from its dependencies without opening a port, so tests
 * can drive it with `app.inject()` and production wiring lives in server.ts.
 */
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ? { redact: ['req.headers.authorization', 'req.headers.cookie'] } : false,
    trustProxy: deps.trustProxy ?? false,
    bodyLimit: 64 * 1024,
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.status === 429) {
        const retry = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
        if (retry) reply.header('Retry-After', String(retry));
      }
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      // Fastify's own client errors: malformed JSON, unsupported content type, body too large.
      return reply.code(status).send({ error: { code: 'bad_request', message: (err as Error).message } });
    }
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'internal', message: 'Something went wrong.' } });
  });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
  });

  await app.register(cookie);
  registerAuthentication(app, deps.auth);
  await app.register(healthRoutes(deps.checkDatabase, VERSION));
  await app.register(authRoutes(deps.auth, { secureCookies: deps.secureCookies }));
  await app.register(adminRoutes(deps.auth, deps.store));
  return app;
}
