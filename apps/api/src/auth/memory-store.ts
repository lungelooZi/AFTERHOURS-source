import { randomUUID } from 'node:crypto';
import {
  EmailTakenError,
  type AuditEntry,
  type AuthStore,
  type NewAuditEntry,
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
    this.sessions.set(input.tokenHash, { ...input, createdAt: new Date(), revokedAt: null });
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

  async recordAudit(entry: NewAuditEntry): Promise<void> {
    this.audit.push({ ...entry, id: randomUUID(), createdAt: new Date() });
  }

  async listAudit(limit: number): Promise<AuditEntry[]> {
    return this.audit.slice(-limit).reverse();
  }
}
