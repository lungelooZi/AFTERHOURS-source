import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient, messageFor, resetTokenFromHash } from '../src/account.ts';

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
