import type { FastifyInstance } from 'fastify';

/** /health: the process is up (liveness). /ready: it can serve traffic (readiness). */
export function healthRoutes(checkDatabase: () => Promise<boolean>, version: string) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/health', async () => ({ status: 'ok', version }));
    app.get('/ready', async (_req, reply) => {
      const database = await checkDatabase();
      return reply.code(database ? 200 : 503).send({ status: database ? 'ready' : 'unavailable', checks: { database } });
    });
  };
}
