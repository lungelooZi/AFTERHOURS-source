import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/routes.ts';
import { alice, makeApp } from './helpers.ts';

const cookieFrom = (res: { cookies: { name: string; value: string }[] }) => {
  const c = res.cookies.find((c) => c.name === SESSION_COOKIE);
  return c ? `${c.name}=${c.value}` : '';
};

describe('HTTP: health', () => {
  it('reports liveness and readiness separately', async () => {
    const { app } = await makeApp({ dbUp: false });
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: 'unavailable', checks: { database: false } });
  });
});

describe('HTTP: auth flow', () => {
  it('register sets an httpOnly session cookie that authenticates /auth/me', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    expect(res.statusCode).toBe(201);
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(res.json().user).not.toHaveProperty('passwordHash');

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieFrom(res) } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('alice@example.com');
  });

  it('accepts a Bearer token for API clients', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    const token = res.cookies.find((c) => c.name === SESSION_COOKIE)!.value;
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
  });

  it('logout clears the cookie and the old cookie stops working', async () => {
    const { app } = await makeApp();
    const cookie = cookieFrom(await app.inject({ method: 'POST', url: '/auth/register', payload: alice }));
    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    expect(out.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('');
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('returns structured errors with stable codes', async () => {
    const { app } = await makeApp();
    const bad = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'x' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('validation_failed');
    expect(bad.json().error.details).toHaveProperty('password');

    const anon = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(anon.json()).toEqual({ error: { code: 'unauthenticated', message: 'You need to sign in.' } });
  });

  it('rejects non-JSON bodies on state-changing routes (CSRF hardening)', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'email=a%40b.c&password=x',
    });
    expect(res.statusCode).toBe(415);
  });

  it('sends Retry-After when login is rate limited', async () => {
    const { app } = await makeApp({ maxAttempts: 2 });
    await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    for (let i = 0; i < 2; i++) await app.inject({ method: 'POST', url: '/auth/login', payload: { email: alice.email, password: 'wrong!' } });
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: alice.email, password: alice.password } });
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('HTTP: admin', () => {
  it('admin routes require authentication, then the admin role', async () => {
    const { app, store } = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/admin/audit' })).statusCode).toBe(401);

    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    const cookie = cookieFrom(reg);
    expect((await app.inject({ method: 'GET', url: '/admin/audit', headers: { cookie } })).statusCode).toBe(403);

    await store.setUserRole(reg.json().user.id, 'admin');
    const audit = await app.inject({ method: 'GET', url: '/admin/audit?limit=5', headers: { cookie } });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().entries.map((e: { action: string }) => e.action)).toContain('user.registered');
  });

  it('admins can promote a player to creator', async () => {
    const { app, store } = await makeApp();
    const admin = await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    await store.setUserRole(admin.json().user.id, 'admin');
    const bob = await app.inject({ method: 'POST', url: '/auth/register', payload: { ...alice, email: 'bob@example.com', displayName: 'Bob' } });

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${bob.json().user.id}/role`,
      headers: { cookie: cookieFrom(admin) },
      payload: { role: 'creator' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe('creator');
  });
});
