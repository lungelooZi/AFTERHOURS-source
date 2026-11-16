export const ROLES = ['player', 'creator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: Date;
};

export type UserWithSecret = User & { passwordHash: string };

export type Session = {
  /** SHA-256 of the bearer token. The raw token is never stored. */
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  ip: string | null;
};

export type AuditEntry = {
  id: string;
  actorId: string | null;
  action: AuditAction;
  targetId: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type AuditAction =
  | 'user.registered'
  | 'session.created'
  | 'session.login_failed'
  | 'session.revoked'
  | 'session.revoked_all'
  | 'user.role_changed';

export type NewUser = { email: string; displayName: string; passwordHash: string; role: Role };
export type NewSession = Omit<Session, 'createdAt' | 'revokedAt'>;
export type NewAuditEntry = Omit<AuditEntry, 'id' | 'createdAt'>;

/**
 * Persistence boundary for identity. The service depends on this interface, not on
 * Postgres, so the business rules can be unit-tested against MemoryAuthStore and the
 * SQL can be integration-tested separately against a real database.
 */
export interface AuthStore {
  /** Throws EmailTakenError if the (case-insensitive) email already exists. */
  createUser(user: NewUser): Promise<User>;
  findUserByEmail(email: string): Promise<UserWithSecret | null>;
  findUserById(id: string): Promise<User | null>;
  setUserRole(id: string, role: Role): Promise<User | null>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;

  createSession(session: NewSession): Promise<void>;
  /** Returns the session and its user only if it is neither revoked nor expired at `now`. */
  findActiveSession(tokenHash: string, now: Date): Promise<{ session: Session; user: User } | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
  revokeAllSessions(userId: string, now: Date): Promise<number>;

  recordAudit(entry: NewAuditEntry): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;
}

export class EmailTakenError extends Error {
  constructor() {
    super('email already registered');
    this.name = 'EmailTakenError';
  }
}
