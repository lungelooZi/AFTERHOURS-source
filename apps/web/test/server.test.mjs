import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createWebServer } from '../server.mjs';

// A fake API that records what it receives and answers like the real one.
let seen;
const fakeApi = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen = { method: req.method, url: req.url, headers: req.headers, body };
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/slow') return; // never answers
    if (path === '/auth/login') {
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'ah_session=abc; HttpOnly; Path=/; SameSite=Lax' });
      return res.end(JSON.stringify({ user: { email: 'a@b.co' } }));
    }
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'unauthenticated' } }));
  });
});

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
let web, webBase, apiPort;

before(async () => {
  apiPort = await listen(fakeApi);
  web = createWebServer({ apiUrl: `http://127.0.0.1:${apiPort}`, proxyTimeoutMs: 300 });
  webBase = `http://127.0.0.1:${await listen(web)}`;
});
after(() => {
  web.close();
  fakeApi.closeAllConnections();
  fakeApi.close();
});

test('serves the game files and strips TypeScript', async () => {
  const page = await fetch(`${webBase}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /data-app="account"/);
  const js = await fetch(`${webBase}/account.js`);
  assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.doesNotMatch(await js.text(), /: Promise<Result<User>>/);
});

test('unknown paths are 404, including paths that only look like /api', async () => {
  assert.equal((await fetch(`${webBase}/secret.ts`)).status, 404);
  assert.equal((await fetch(`${webBase}/apix/auth/me`)).status, 404);
});

test('forwards /api/* with method, path, query, body and cookies, and returns Set-Cookie', async () => {
  const res = await fetch(`${webBase}/api/auth/login?x=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'ah_session=old' },
    body: JSON.stringify({ email: 'a@b.co', password: 'pw' }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /ah_session=abc; HttpOnly/);
  assert.deepEqual(seen, { ...seen, method: 'POST', url: '/auth/login?x=1', body: '{"email":"a@b.co","password":"pw"}' });
  assert.equal(seen.headers.cookie, 'ah_session=old');
});

test('passes API error statuses through unchanged', async () => {
  const res = await fetch(`${webBase}/api/auth/me`);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'unauthenticated');
});

test('overwrites X-Forwarded-For so clients cannot spoof their IP', async () => {
  await fetch(`${webBase}/api/auth/me`, { headers: { 'x-forwarded-for': '6.6.6.6' } });
  assert.equal(seen.headers['x-forwarded-for'], '127.0.0.1');
  assert.equal(seen.headers['x-forwarded-proto'], 'http');
});

test('answers 504 when the API is too slow', async () => {
  const res = await fetch(`${webBase}/api/slow`);
  assert.equal(res.status, 504);
  assert.equal((await res.json()).error.code, 'api_unavailable');
});

test('answers 502 when the API is down', async () => {
  const dead = createWebServer({ apiUrl: 'http://127.0.0.1:1' });
  const base = `http://127.0.0.1:${await listen(dead)}`;
  const res = await fetch(`${base}/api/auth/me`);
  dead.close();
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: { code: 'api_unavailable', message: 'The API is not reachable.' } });
});
