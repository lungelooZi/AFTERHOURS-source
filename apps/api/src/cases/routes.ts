import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CaseResponse, CaseService, Caller } from './service.ts';

export const GUEST_COOKIE = 'ah_guest';
const GUEST_COOKIE_MAX_AGE = 180 * 24 * 60 * 60; // seconds

const callerOf = (req: FastifyRequest): Caller => ({ user: req.user, guestToken: req.cookies[GUEST_COOKIE], ip: req.ip ?? null });

export function caseRoutes(service: CaseService, opts: { secureCookies: boolean }) {
  const send = (reply: FastifyReply, response: CaseResponse, extra: Record<string, unknown> = {}) => {
    if (response.setGuestToken) {
      reply.setCookie(GUEST_COOKIE, response.setGuestToken, {
        httpOnly: true,
        secure: opts.secureCookies,
        sameSite: 'lax',
        path: '/',
        maxAge: GUEST_COOKIE_MAX_AGE,
      });
    }
    if (response.clearGuestToken) reply.clearCookie(GUEST_COOKIE, { path: '/' });
    return reply.send({ view: response.view, ...extra });
  };

  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get<{ Params: { caseId: string } }>('/cases/:caseId', async (req, reply) =>
      send(reply, await service.getView(callerOf(req), req.params.caseId)),
    );

    app.post<{ Params: { caseId: string } }>('/cases/:caseId/actions', async (req, reply) => {
      const result = await service.act(callerOf(req), req.params.caseId, req.body);
      return send(reply, result, { outcome: result.outcome });
    });

    app.post<{ Params: { caseId: string } }>('/cases/:caseId/restart', async (req, reply) =>
      send(reply, await service.restart(callerOf(req), req.params.caseId)),
    );
  };
}
