import { randomUUID } from 'node:crypto';
import {
  EmailTakenError,
  type AuditEntry,
  type AuthStore,
  type NewAuditEntry,
  type NewPasswordReset,
  type NewSession,
  type NewUser,
  type Role,
  type Session,
  type User,
  type UserWithSecret,
} from './types.ts';

/** In-memory AuthStore for unit tests and local experiments. Mirrors the SQL semantics. */
export class MemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, UserWithSecret>();
  private readonly sessions = new Map<string, Session>();
  private readonly audit: AuditEntry[] = [];
  private readonly resets = new Map<string, NewPasswordReset & { usedAt: Date | null }>();

  private static publicUser({ passwordHash: _omit, ...user }: UserWithSecret): User {
    return { ...user };
  }

  async createUser(input: NewUser): Promise<User> {
    const email = input.email.toLowerCase();
    if ([...this.users.values()].some((u) => u.email === email)) throw new EmailTakenError();
    const user: UserWithSecret = { id: randomUUID(), createdAt: new Date(), ...input, email };
    this.users.set(user.id, user);
    return MemoryAuthStore.publicUser(user);
  }

  async findUserByEmail(email: string): Promise<UserWithSecret | null> {
    const wanted = email.toLowerCase();
    const user = [...this.users.values()].find((u) => u.email === wanted);
    return user ? { ...user } : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? MemoryAuthStore.publicUser(user) : null;
  }

  async setUserRole(id: string, role: Role): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    user.role = role;
    return MemoryAuthStore.publicUser(user);
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const user = this.users.get(id);
    if (user) user.passwordHash = passwordHash;
  }

  async createSession(input: NewSession): Promise<void> {
    this.sessions.set(input.tokenHash, { ...input, id: randomUUID(), lastUsedAt: input.createdAt, revokedAt: null });
  }

  async findActiveSession(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    const user = this.users.get(session.userId);
    return user ? { session: { ...session }, user: MemoryAuthStore.publicUser(user) } : null;
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session && !session.revokedAt) session.revokedAt = now;
  }

  async revokeSessionById(userId: string, sessionId: string, now: Date): Promise<boolean> {
    const session = [...this.sessions.values()].find((s) => s.id === sessionId && s.userId === userId && !s.revokedAt && s.expiresAt > now);
    if (!session) return false;
    session.revokedAt = now;
    return true;
  }

  async touchSession(tokenHash: string, now: Date): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session) session.lastUsedAt = now;
  }

  async listActiveSessions(userId: string, now: Date): Promise<Session[]> {
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId && !s.revokedAt && s.expiresAt > now)
      .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
      .map((s) => ({ ...s }));
  }

  async revokeAllSessions(userId: string, now: Date): Promise<number> {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.userId === userId && !s.revokedAt) {
        s.revokedAt = now;
        count++;
      }
    }
    return count;
  }

  async createPasswordReset(reset: NewPasswordReset): Promise<void> {
    this.resets.set(reset.tokenHash, { ...reset, usedAt: null });
  }

  async completePasswordReset(tokenHash: string, passwordHash: string, now: Date): Promise<string | null> {
    const reset = this.resets.get(tokenHash);
    if (!reset || reset.usedAt || reset.expiresAt <= now) return null;
    for (const r of this.resets.values()) if (r.userId === reset.userId && !r.usedAt) r.usedAt = now;
    await this.updatePasswordHash(reset.userId, passwordHash);
    await this.revokeAllSessions(reset.userId, now);
    return reset.userId;
  }

  async recordAudit(entry: NewAuditEntry): Promise<void> {
    this.audit.push({ ...entry, id: randomUUID(), createdAt: new Date() });
  }

  async listAudit(limit: number): Promise<AuditEntry[]> {
    return this.audit.slice(-limit).reverse();
  }
}
