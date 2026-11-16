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
  /** Public identifier, safe to show to the user. */
  id: string;
  /** SHA-256 of the bearer token. The raw token is never stored. Never sent to clients. */
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date;
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
  | 'session.revoked_device'
  | 'user.role_changed'
  | 'password.reset_requested'
  | 'password.reset_completed';

export type NewPasswordReset = { tokenHash: string; userId: string; expiresAt: Date; ip: string | null };

export type NewUser = { email: string; displayName: string; passwordHash: string; role: Role };
/** `createdAt` comes from the service's clock and also seeds `lastUsedAt`. */
export type NewSession = Omit<Session, 'id' | 'revokedAt' | 'lastUsedAt'>;
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
  /** Revokes one of `userId`'s own active sessions. False if no such session belongs to them. */
  revokeSessionById(userId: string, sessionId: string, now: Date): Promise<boolean>;
  touchSession(tokenHash: string, now: Date): Promise<void>;
  /** Unrevoked, unexpired sessions for the user, most recently used first. */
  listActiveSessions(userId: string, now: Date): Promise<Session[]>;
  revokeAllSessions(userId: string, now: Date): Promise<number>;

  createPasswordReset(reset: NewPasswordReset): Promise<void>;
  /**
   * In one atomic step: marks the token used (only if unused and unexpired at `now`),
   * marks the user's other open tokens used, sets the new password hash and revokes all
   * of the user's sessions. Returns the user id, or null if the token was not usable.
   */
  completePasswordReset(tokenHash: string, passwordHash: string, now: Date): Promise<string | null>;

  recordAudit(entry: NewAuditEntry): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;
}

export class EmailTakenError extends Error {
  constructor() {
    super('email already registered');
    this.name = 'EmailTakenError';
  }
}
