/** A failure the client is allowed to see. Anything else becomes a generic 500. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  validation: (details: unknown) => new AppError(400, 'validation_failed', 'The request body is invalid.', details),
  unauthenticated: () => new AppError(401, 'unauthenticated', 'You need to sign in.'),
  invalidCredentials: () => new AppError(401, 'invalid_credentials', 'Email or password is incorrect.'),
  forbidden: () => new AppError(403, 'forbidden', 'You do not have permission to do that.'),
  notFound: (what: string) => new AppError(404, 'not_found', `${what} was not found.`),
  emailTaken: () => new AppError(409, 'email_taken', 'An account with that email already exists.'),
  invalidResetToken: () => new AppError(400, 'invalid_reset_token', 'This reset link is invalid, already used or expired.'),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(429, 'rate_limited', 'Too many attempts. Try again later.', { retryAfterSeconds }),
};
