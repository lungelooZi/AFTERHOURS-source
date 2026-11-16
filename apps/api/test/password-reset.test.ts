import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors.ts';
import { alice, ctx, makeApp, makeService, tokenFromEmail } from './helpers.ts';

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'no error';
  } catch (err) {
    return err instanceof AppError ? err.code : `unexpected: ${(err as Error).message}`;
  }
};
const NEW_PASSWORD = 'a brand new passphrase';

describe('requestPasswordReset', () => {
  it('emails a single link with a token in the URL fragment', async () => {
    const { auth, mailer } = makeService();
    await auth.register(alice, ctx);
    await auth.requestPasswordReset({ email: ' ALICE@example.com ' }, ctx);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: 'alice@example.com', subject: 'Reset your AFTERHOURS password' });
    expect(mailer.sent[0]!.text).toMatch(/^http:\/\/localhost:3000\/#reset=[\w-]{43}$/m);
    expect(mailer.sent[0]!.text).toContain('within 30 minutes');
  });

  it('behaves identically for unknown emails, but sends nothing', async () => {
    const { auth, mailer, store } = makeService();
    await expect(auth.requestPasswordReset({ email: 'nobody@example.com' }, ctx)).resolves.toBeUndefined();
    expect(mailer.sent).toHaveLength(0);
    expect((await store.listAudit(1))[0]).toMatchObject({ action: 'password.reset_requested', actorId: null, metadata: { reason: 'unknown_email' } });
  });

  it('limits requests to 3 per email and IP per hour', async () => {
    const { auth, mailer, clock } = makeService();
    await auth.register(alice, ctx);
    for (let i = 0; i < 3; i++) await auth.requestPasswordReset({ email: alice.email }, ctx);
    expect(await codeOf(auth.requestPasswordReset({ email: alice.email }, ctx))).toBe('rate_limited');
    expect(mailer.sent).toHaveLength(3);
    clock.advance(60 * 60_000 + 1);
    expect(await codeOf(auth.requestPasswordReset({ email: alice.email }, ctx))).toBe('no error');
  });
});

describe('resetPassword', () => {
  async function withResetToken() {
    const svc = makeService();
    const session = await svc.auth.register(alice, ctx);
    await svc.auth.requestPasswordReset({ email: alice.email }, ctx);
    return { ...svc, session, token: tokenFromEmail(svc.mailer) };
  }

  it('changes the password: new one works, old one does not', async () => {
    const { auth, token } = await withResetToken();
    await auth.resetPassword({ token, password: NEW_PASSWORD }, ctx);
    expect(await codeOf(auth.login({ email: alice.email, password: NEW_PASSWORD }, ctx))).toBe('no error');
    expect(await codeOf(auth.login({ email: alice.email, password: alice.password }, ctx))).toBe('invalid_credentials');
  });

  it('signs the user out of every existing session', async () => {
    const { auth, token, session } = await withResetToken();
    const other = await auth.login(alice, ctx);
    await auth.resetPassword({ token, password: NEW_PASSWORD }, ctx);
    expect(await auth.authenticate(session.token)).toBeNull();
    expect(await auth.authenticate(other.token)).toBeNull();
  });

  it('tokens are single use', async () => {
    const { auth, token } = await withResetToken();
    await auth.resetPassword({ token, password: NEW_PASSWORD }, ctx);
    expect(await codeOf(auth.resetPassword({ token, password: 'yet another passphrase' }, ctx))).toBe('invalid_reset_token');
  });

  it('using one token invalidates the user’s other outstanding tokens', async () => {
    const { auth, mailer, token: first } = await withResetToken();
    await auth.requestPasswordReset({ email: alice.email }, ctx);
    const second = tokenFromEmail(mailer);
    await auth.resetPassword({ token: second, password: NEW_PASSWORD }, ctx);
    expect(await codeOf(auth.resetPassword({ token: first, password: 'yet another passphrase' }, ctx))).toBe('invalid_reset_token');
  });

  it('tokens expire after 30 minutes', async () => {
    const { auth, token, clock } = await withResetToken();
    clock.advance(30 * 60_000);
    expect(await codeOf(auth.resetPassword({ token, password: NEW_PASSWORD }, ctx))).toBe('invalid_reset_token');
  });

  it('a weak new password is rejected without burning the token', async () => {
    const { auth, token } = await withResetToken();
    expect(await codeOf(auth.resetPassword({ token, password: 'short' }, ctx))).toBe('validation_failed');
    expect(await codeOf(auth.resetPassword({ token, password: NEW_PASSWORD }, ctx))).toBe('no error');
  });

  it('made-up or malformed tokens get the same error', async () => {
    const { auth } = await withResetToken();
    for (const token of ['x'.repeat(43), 'short', undefined]) {
      expect(await codeOf(auth.resetPassword({ token, password: NEW_PASSWORD }, ctx))).toBe('invalid_reset_token');
    }
  });

  it('is recorded in the audit log', async () => {
    const { auth, token, store } = await withResetToken();
    await auth.resetPassword({ token, password: NEW_PASSWORD }, ctx);
    expect((await store.listAudit(1))[0]?.action).toBe('password.reset_completed');
  });
});

describe('HTTP: password reset', () => {
  it('request returns the same 202 body for known and unknown emails', async () => {
    const { app } = await makeApp();
    await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    const known = await app.inject({ method: 'POST', url: '/auth/password-reset', payload: { email: alice.email } });
    const unknown = await app.inject({ method: 'POST', url: '/auth/password-reset', payload: { email: 'nobody@example.com' } });
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.body).toBe(unknown.body);
  });

  it('confirm sets the password and clears the session cookie', async () => {
    const { app, mailer } = await makeApp();
    await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    await app.inject({ method: 'POST', url: '/auth/password-reset', payload: { email: alice.email } });
    const res = await app.inject({ method: 'POST', url: '/auth/password-reset/confirm', payload: { token: tokenFromEmail(mailer), password: NEW_PASSWORD } });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === 'ah_session')?.value).toBe('');
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: alice.email, password: NEW_PASSWORD } });
    expect(login.statusCode).toBe(200);
  });

  it('confirm with a bad token is a 400 with a stable code', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/auth/password-reset/confirm', payload: { token: 'x'.repeat(43), password: NEW_PASSWORD } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_reset_token');
  });
});
