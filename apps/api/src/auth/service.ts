import { z } from 'zod';
import { errors } from '../errors.ts';
import { dummyHash, hashPassword, needsRehash, verifyPassword, type ScryptParams, DEFAULT_PARAMS } from './password.ts';
import type { AttemptLimiter } from './rate-limiter.ts';
import { generateSessionToken, hashToken } from './tokens.ts';
import { EmailTakenError, ROLES, type AuthStore, type Role, type User } from './types.ts';

export const registerSchema = z.object({
  email: z.email().max(254).transform((e) => e.trim().toLowerCase()),
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
  displayName: z.string().trim().min(2).max(40),
});

export const loginSchema = z.object({
  email: z.string().max(254).transform((e) => e.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});

export const roleSchema = z.object({ role: z.enum(ROLES) });

export type RequestContext = { ip: string | null; userAgent: string | null };
export type IssuedSession = { user: User; token: string; expiresAt: Date };

export type AuthServiceOptions = {
  store: AuthStore;
  /** `account` limits one IP guessing one email; `ip` (looser) limits one IP spraying many emails. */
  limiters: { account: AttemptLimiter; ip: AttemptLimiter };
  sessionTtlMs: number;
  now?: () => Date;
  hashParams?: ScryptParams;
};

/**
 * Identity rules live here, independent of HTTP. Routes translate requests into these
 * calls; tests exercise them directly with an in-memory store and a fake clock.
 */
export class AuthService {
  private readonly store: AuthStore;
  private readonly accountLimiter: AttemptLimiter;
  private readonly ipLimiter: AttemptLimiter;
  private readonly ttl: number;
  private readonly now: () => Date;
  private readonly hashParams: ScryptParams;

  constructor(options: AuthServiceOptions) {
    this.store = options.store;
    this.accountLimiter = options.limiters.account;
    this.ipLimiter = options.limiters.ip;
    this.ttl = options.sessionTtlMs;
    this.now = options.now ?? (() => new Date());
    this.hashParams = options.hashParams ?? DEFAULT_PARAMS;
  }

  async register(input: unknown, ctx: RequestContext): Promise<IssuedSession> {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) throw errors.validation(z.flattenError(parsed.error).fieldErrors);
    const { email, password, displayName } = parsed.data;

    const passwordHash = await hashPassword(password, this.hashParams);
    let user: User;
    try {
      user = await this.store.createUser({ email, displayName, passwordHash, role: 'player' });
    } catch (err) {
      if (err instanceof EmailTakenError) throw errors.emailTaken();
      throw err;
    }
    await this.store.recordAudit({ actorId: user.id, action: 'user.registered', targetId: user.id, ip: ctx.ip, metadata: {} });
    return this.issueSession(user, ctx);
  }

  async login(input: unknown, ctx: RequestContext): Promise<IssuedSession> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw errors.validation(z.flattenError(parsed.error).fieldErrors);
    const { email, password } = parsed.data;

    const accountKey = `${ctx.ip ?? 'unknown'}:${email}`;
    const ipKey = ctx.ip ?? 'unknown';
    const wait = Math.max(this.accountLimiter.retryAfter(accountKey), this.ipLimiter.retryAfter(ipKey));
    if (wait > 0) throw errors.rateLimited(wait);

    const user = await this.store.findUserByEmail(email);
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash(this.hashParams)));
    if (!user || !ok) {
      this.accountLimiter.recordFailure(accountKey);
      this.ipLimiter.recordFailure(ipKey);
      await this.store.recordAudit({
        actorId: user?.id ?? null,
        action: 'session.login_failed',
        targetId: user?.id ?? null,
        ip: ctx.ip,
        metadata: { reason: user ? 'bad_password' : 'unknown_email' },
      });
      throw errors.invalidCredentials();
    }

    // Only the account key resets; resetting the IP key would let an attacker clear it
    // by signing in to an account they own between guesses.
    this.accountLimiter.reset(accountKey);
    if (needsRehash(user.passwordHash, this.hashParams)) {
      // Opportunistic upgrade to current parameters; a failure here never blocks login.
      await hashPassword(password, this.hashParams)
        .then((upgraded) => this.store.updatePasswordHash(user.id, upgraded))
        .catch(() => undefined);
    }
    const { passwordHash: _secret, ...publicUser } = user;
    return this.issueSession(publicUser, ctx);
  }

  /** Sessions read the user's role live on every request, so role changes apply immediately. */
  async authenticate(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    const found = await this.store.findActiveSession(hashToken(token), this.now());
    return found?.user ?? null;
  }

  async logout(token: string | undefined, actor: User, ctx: RequestContext): Promise<void> {
    if (!token) return;
    await this.store.revokeSession(hashToken(token), this.now());
    await this.store.recordAudit({ actorId: actor.id, action: 'session.revoked', targetId: actor.id, ip: ctx.ip, metadata: {} });
  }

  async logoutEverywhere(actor: User, ctx: RequestContext): Promise<number> {
    const count = await this.store.revokeAllSessions(actor.id, this.now());
    await this.store.recordAudit({ actorId: actor.id, action: 'session.revoked_all', targetId: actor.id, ip: ctx.ip, metadata: { count } });
    return count;
  }

  async changeRole(actor: User, targetId: string, input: unknown, ctx: RequestContext): Promise<User> {
    if (actor.role !== 'admin') throw errors.forbidden();
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) throw errors.validation(z.flattenError(parsed.error).fieldErrors);
    if (actor.id === targetId && parsed.data.role !== 'admin') {
      // Prevents the last admin from locking everyone out by accident.
      throw errors.validation({ role: ['Admins cannot remove their own admin role.'] });
    }
    const before = await this.store.findUserById(targetId);
    if (!before) throw errors.notFound('User');
    const after = await this.store.setUserRole(targetId, parsed.data.role);
    if (!after) throw errors.notFound('User');
    await this.store.recordAudit({
      actorId: actor.id,
      action: 'user.role_changed',
      targetId,
      ip: ctx.ip,
      metadata: { from: before.role, to: after.role },
    });
    return after;
  }

  private async issueSession(user: User, ctx: RequestContext): Promise<IssuedSession> {
    const token = generateSessionToken();
    const expiresAt = new Date(this.now().getTime() + this.ttl);
    await this.store.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt, ip: ctx.ip, userAgent: ctx.userAgent });
    await this.store.recordAudit({ actorId: user.id, action: 'session.created', targetId: user.id, ip: ctx.ip, metadata: {} });
    return { user, token, expiresAt };
  }
}

export function hasRole(user: User, allowed: readonly Role[]): boolean {
  return allowed.includes(user.role);
}
