import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient, describeDevice, messageFor, resetTokenFromHash, timeAgo } from '../src/account.ts';

/** A fake fetch that answers from a table and records each call. */
function fakeFetch(table) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init, body: init.body && JSON.parse(init.body) });
    const answer = table[`${init.method} ${url}`];
    if (answer instanceof Error) throw answer;
    const [status, body] = answer ?? [404, {}];
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  };
  fn.calls = calls;
  return fn;
}

const user = { id: 'u1', email: 'maya@example.com', displayName: 'Maya', role: 'player', createdAt: '2026-11-16T00:00:00Z' };

test('signIn posts JSON to /api/auth/login and returns the user', async () => {
  const f = fakeFetch({ 'POST /api/auth/login': [200, { user }] });
  const result = await createAccountClient(f).signIn('maya@example.com', 'pw');
  assert.deepEqual(result, { ok: true, value: user });
  assert.deepEqual(f.calls[0].body, { email: 'maya@example.com', password: 'pw' });
  assert.equal(f.calls[0].headers['content-type'], 'application/json');
  assert.equal(f.calls[0].credentials, 'same-origin');
});

test('signUp sends display name, email and password', async () => {
  const f = fakeFetch({ 'POST /api/auth/register': [201, { user }] });
  assert.equal((await createAccountClient(f).signUp('Maya', 'maya@example.com', 'long password!')).ok, true);
  assert.deepEqual(f.calls[0].body, { displayName: 'Maya', email: 'maya@example.com', password: 'long password!' });
});

test('me() returns null for guests and when the API is unreachable', async () => {
  assert.equal(await createAccountClient(fakeFetch({ 'GET /api/auth/me': [401, { error: { code: 'unauthenticated' } }] })).me(), null);
  assert.equal(await createAccountClient(fakeFetch({ 'GET /api/auth/me': new TypeError('network') })).me(), null);
  assert.deepEqual(await createAccountClient(fakeFetch({ 'GET /api/auth/me': [200, { user }] })).me(), user);
});

test('signOut sends no body and handles 204', async () => {
  const f = fakeFetch({ 'POST /api/auth/logout': [204] });
  assert.deepEqual(await createAccountClient(f).signOut(), { ok: true, value: null });
  assert.equal(f.calls[0].body, undefined);
  assert.deepEqual(f.calls[0].headers, {});
});

test('API errors become readable messages', async () => {
  const f = fakeFetch({
    'POST /api/auth/login': [429, { error: { code: 'rate_limited', details: { retryAfterSeconds: 61 } } }],
    'POST /api/auth/register': [400, { error: { code: 'validation_failed', details: { password: ['Use at least 12 characters.'], email: ['Invalid email address'] } } }],
  });
  const client = createAccountClient(f);
  assert.deepEqual(await client.signIn('a', 'b'), { ok: false, code: 'rate_limited', message: 'Too many attempts. Try again in 2 minutes.' });
  const signUp = await client.signUp('Maya', 'x', 'short');
  assert.equal(signUp.message, 'Password: Use at least 12 characters. Email: Invalid email address');
});

test('a down API or a non-JSON error page is reported as api_unavailable', async () => {
  const offline = await createAccountClient(fakeFetch({ 'POST /api/auth/login': new TypeError('failed') })).signIn('a', 'b');
  assert.equal(offline.code, 'api_unavailable');
  const htmlError = async () => new Response('<h1>Bad gateway</h1>', { status: 502 });
  assert.equal((await createAccountClient(htmlError).signIn('a', 'b')).code, 'api_unavailable');
});

test('messageFor covers every code the API returns', () => {
  for (const code of ['invalid_reset_token', 'invalid_credentials', 'email_taken', 'rate_limited', 'validation_failed', 'unauthenticated', 'api_unavailable']) {
    assert.notEqual(messageFor(code), messageFor('something_new'), code);
  }
  assert.equal(messageFor('rate_limited', { retryAfterSeconds: 30 }), 'Too many attempts. Try again in 1 minute.');
});

test('password reset: request and confirm call the right endpoints', async () => {
  const f = fakeFetch({
    'POST /api/auth/password-reset': [202, { message: 'If an account exists for that email, a reset link is on its way.' }],
    'POST /api/auth/password-reset/confirm': [204],
  });
  const client = createAccountClient(f);
  assert.equal((await client.requestPasswordReset('maya@example.com')).ok, true);
  assert.deepEqual(await client.resetPassword('tok'.repeat(10), 'a new passphrase!'), { ok: true, value: null });
  assert.deepEqual(f.calls.map((c) => c.body), [{ email: 'maya@example.com' }, { token: 'tok'.repeat(10), password: 'a new passphrase!' }]);
});

test('reset tokens are read only from a well-formed #reset= fragment', () => {
  const token = 'Abc_def-123456789012345678901234567890123';
  assert.equal(resetTokenFromHash(`#reset=${token}`), token);
  for (const hash of ['', '#', '#reset=', '#reset=short', `#reset=${token}&x=1`, `#other=${token}`, `#reset=${token}<script>`]) {
    assert.equal(resetTokenFromHash(hash), null, hash);
  }
});

test('devices: list and sign out one device by id', async () => {
  const devices = [{ id: 'abc', userAgent: 'x', ip: null, createdAt: '', lastUsedAt: '', expiresAt: '', current: true }];
  const f = fakeFetch({ 'GET /api/auth/sessions': [200, { sessions: devices }], 'DELETE /api/auth/sessions/a%2Fb': [204] });
  const client = createAccountClient(f);
  assert.deepEqual(await client.listDevices(), { ok: true, value: devices });
  assert.equal((await client.signOutDevice('a/b')).ok, true, 'ids are URL-encoded');
});

test('describeDevice names common browsers and systems', () => {
  const cases = {
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36': 'Chrome on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0': 'Edge on Windows',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15': 'Safari on macOS',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1': 'Safari on iOS',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36': 'Chrome on Android',
    'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0': 'Firefox on Linux',
    'curl/8.5.0': 'API client',
  };
  for (const [ua, expected] of Object.entries(cases)) assert.equal(describeDevice(ua), expected, ua);
  assert.equal(describeDevice(null), 'Unknown device');
});

test('timeAgo gives short human times', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  const ago = (s) => timeAgo(new Date(now.getTime() - s * 1000).toISOString(), now);
  assert.deepEqual([ago(5), ago(60), ago(150), ago(3600), ago(7200), ago(86400 + 5), ago(3 * 86400), ago(-30)],
    ['just now', '1 minute ago', '2 minutes ago', '1 hour ago', '2 hours ago', 'yesterday', '3 days ago', 'just now']);
});
