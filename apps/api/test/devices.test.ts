import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/routes.ts';
import { TOUCH_INTERVAL_MS } from '../src/auth/service.ts';
import { AppError } from '../src/errors.ts';
import { alice, ctx, makeApp, makeService } from './helpers.ts';

const bob = { ...alice, email: 'bob@example.com', displayName: 'Bob' };
const codeOf = (p: Promise<unknown>) => p.then(() => 'no error', (e) => (e instanceof AppError ? e.code : String(e)));

describe('devices (service)', () => {
  it('lists only the user’s active sessions and marks the current one', async () => {
    const { auth, clock } = makeService();
    const first = await auth.register(alice, { ip: '203.0.113.1', userAgent: 'Laptop' });
    clock.advance(1000);
    const second = await auth.login(alice, { ip: '203.0.113.2', userAgent: 'Phone' });
    await auth.register(bob, ctx);
    const revoked = await auth.login(alice, ctx);
    await auth.logout(revoked.token, revoked.user, ctx);

    const current = await auth.resolveSession(second.token);
    const devices = await auth.listDevices(first.user, current!.sessionId);
    expect(devices.map((d) => [d.userAgent, d.ip, d.current])).toEqual([
      ['Phone', '203.0.113.2', true],
      ['Laptop', '203.0.113.1', false],
    ]);
    expect(JSON.stringify(devices)).not.toMatch(/token/i);
  });

  it('revoking a device signs that device out and nothing else', async () => {
    const { auth } = makeService();
    const laptop = await auth.register(alice, ctx);
    const phone = await auth.login(alice, ctx);
    const phoneId = (await auth.resolveSession(phone.token))!.sessionId;
    await auth.revokeDevice(laptop.user, phoneId, ctx);
    expect(await auth.authenticate(phone.token)).toBeNull();
    expect(await auth.authenticate(laptop.token)).not.toBeNull();
  });

  it('cannot revoke another user’s session: 404, and their session survives', async () => {
    const { auth } = makeService();
    const a = await auth.register(alice, ctx);
    const b = await auth.register(bob, ctx);
    const bobSessionId = (await auth.resolveSession(b.token))!.sessionId;
    expect(await codeOf(auth.revokeDevice(a.user, bobSessionId, ctx))).toBe('not_found');
    expect(await auth.authenticate(b.token)).not.toBeNull();
  });

  it('revoking twice is a 404 the second time', async () => {
    const { auth } = makeService();
    const a = await auth.register(alice, ctx);
    const id = (await auth.resolveSession(a.token))!.sessionId;
    await auth.revokeDevice(a.user, id, ctx);
    expect(await codeOf(auth.revokeDevice(a.user, id, ctx))).toBe('not_found');
  });

  it('updates "last used" at most every 5 minutes', async () => {
    const { auth, store, clock } = makeService();
    const a = await auth.register(alice, ctx);
    const lastUsed = async () => (await store.listActiveSessions(a.user.id, clock.now()))[0]!.lastUsedAt;
    const created = await lastUsed();
    clock.advance(TOUCH_INTERVAL_MS - 1);
    await auth.authenticate(a.token);
    expect(await lastUsed()).toEqual(created);
    clock.advance(1);
    await auth.authenticate(a.token);
    expect((await lastUsed()).getTime()).toBe(clock.now().getTime());
  });
});

describe('devices (HTTP)', () => {
  const cookieOf = (res: { cookies: { name: string; value: string }[] }) =>
    `${SESSION_COOKIE}=${res.cookies.find((c) => c.name === SESSION_COOKIE)!.value}`;

  it('GET /auth/sessions requires sign-in and returns public fields only', async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: 'GET', url: '/auth/sessions' })).statusCode).toBe(401);
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: alice, headers: { 'user-agent': 'TestBrowser/1.0' } });
    const res = await app.inject({ method: 'GET', url: '/auth/sessions', headers: { cookie: cookieOf(reg) } });
    expect(res.statusCode).toBe(200);
    const [session] = res.json().sessions;
    expect(Object.keys(session).sort()).toEqual(['createdAt', 'current', 'expiresAt', 'id', 'ip', 'lastUsedAt', 'userAgent']);
    expect(session).toMatchObject({ current: true, userAgent: 'TestBrowser/1.0' });
  });

  it('DELETE another device returns 204 and keeps the current cookie', async () => {
    const { app } = await makeApp();
    const laptop = await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    const phone = await app.inject({ method: 'POST', url: '/auth/login', payload: alice });
    const list = (await app.inject({ method: 'GET', url: '/auth/sessions', headers: { cookie: cookieOf(laptop) } })).json().sessions;
    const phoneId = list.find((s: { current: boolean }) => !s.current).id;

    const res = await app.inject({ method: 'DELETE', url: `/auth/sessions/${phoneId}`, headers: { cookie: cookieOf(laptop) } });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieOf(phone) } })).statusCode).toBe(401);
  });

  it('DELETE the current device also clears the cookie', async () => {
    const { app } = await makeApp();
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    const [me] = (await app.inject({ method: 'GET', url: '/auth/sessions', headers: { cookie: cookieOf(reg) } })).json().sessions;
    const res = await app.inject({ method: 'DELETE', url: `/auth/sessions/${me.id}`, headers: { cookie: cookieOf(reg) } });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('');
  });

  it('another user’s id or a malformed id is a 404', async () => {
    const { app } = await makeApp();
    const a = await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    const b = await app.inject({ method: 'POST', url: '/auth/register', payload: bob });
    const [bobs] = (await app.inject({ method: 'GET', url: '/auth/sessions', headers: { cookie: cookieOf(b) } })).json().sessions;
    for (const id of [bobs.id, 'not-a-uuid']) {
      const res = await app.inject({ method: 'DELETE', url: `/auth/sessions/${id}`, headers: { cookie: cookieOf(a) } });
      expect(res.statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieOf(b) } })).statusCode).toBe(200);
  });
});
