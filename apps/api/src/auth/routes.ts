import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errors } from '../errors.ts';
import type { AuthService, IssuedSession, RequestContext } from './service.ts';
import type { Role, User } from './types.ts';

export const SESSION_COOKIE = 'ah_session';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    sessionToken: string | undefined;
  }
}

export const contextOf = (req: FastifyRequest): RequestContext => ({
  ip: req.ip ?? null,
  userAgent: req.headers['user-agent']?.slice(0, 256) ?? null,
});

/** Browser clients use the httpOnly cookie; API clients may send `Authorization: Bearer <token>`. */
function readToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || undefined;
  return req.cookies[SESSION_COOKIE];
}

/** Resolves the caller once per request so routes and guards can read `req.user`. */
export function registerAuthentication(app: FastifyInstance, auth: AuthService): void {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', undefined);
  app.addHook('onRequest', async (req) => {
    req.sessionToken = readToken(req);
    req.user = await auth.authenticate(req.sessionToken);
  });
}

export function requireUser(req: FastifyRequest): User {
  if (!req.user) throw errors.unauthenticated();
  return req.user;
}

export const requireRole =
  (...roles: Role[]) =>
  async (req: FastifyRequest): Promise<void> => {
    const user = requireUser(req);
    if (!roles.includes(user.role)) throw errors.forbidden();
  };

export function authRoutes(auth: AuthService, opts: { secureCookies: boolean }) {
  const setCookie = (reply: FastifyReply, issued: IssuedSession) =>
    reply.setCookie(SESSION_COOKIE, issued.token, {
      httpOnly: true,
      secure: opts.secureCookies,
      sameSite: 'lax',
      path: '/',
      expires: issued.expiresAt,
    });
  const clearCookie = (reply: FastifyReply) => reply.clearCookie(SESSION_COOKIE, { path: '/' });

  return async function plugin(app: FastifyInstance): Promise<void> {
    app.post('/auth/register', async (req, reply) => {
      const issued = await auth.register(req.body, contextOf(req));
      setCookie(reply, issued);
      return reply.code(201).send({ user: issued.user, expiresAt: issued.expiresAt });
    });

    app.post('/auth/login', async (req, reply) => {
      const issued = await auth.login(req.body, contextOf(req));
      setCookie(reply, issued);
      return { user: issued.user, expiresAt: issued.expiresAt };
    });

    app.post('/auth/logout', async (req, reply) => {
      const user = requireUser(req);
      await auth.logout(req.sessionToken, user, contextOf(req));
      clearCookie(reply);
      return reply.code(204).send();
    });

    app.post('/auth/logout-all', async (req, reply) => {
      const user = requireUser(req);
      await auth.logoutEverywhere(user, contextOf(req));
      clearCookie(reply);
      return reply.code(204).send();
    });

    app.get('/auth/me', async (req) => ({ user: requireUser(req) }));
  };
}
