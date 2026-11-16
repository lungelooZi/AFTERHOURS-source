import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { contextOf, requireRole, requireUser } from '../auth/routes.ts';
import type { AuthService } from '../auth/service.ts';
import type { AuthStore } from '../auth/types.ts';
import { errors } from '../errors.ts';

const idParams = z.object({ id: z.uuid() });
const auditQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export function adminRoutes(auth: AuthService, store: AuthStore) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.addHook('preHandler', requireRole('admin'));

    app.patch('/admin/users/:id/role', async (req) => {
      const params = idParams.safeParse(req.params);
      if (!params.success) throw errors.notFound('User');
      const user = await auth.changeRole(requireUser(req), params.data.id, req.body, contextOf(req));
      return { user };
    });

    app.get('/admin/audit', async (req) => {
      const query = auditQuery.safeParse(req.query);
      if (!query.success) throw errors.validation(z.flattenError(query.error).fieldErrors);
      return { entries: await store.listAudit(query.data.limit) };
    });
  };
}
