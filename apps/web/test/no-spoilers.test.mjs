import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createWebServer } from '../server.mjs';

// Regression test for #5: everything the browser downloads must be free of puzzle
// answers. A player should only learn these by solving the case.
const SECRETS = [
  ['archive password', '1998'],
  ['ledger contents', 'reset Eli’s password'],
  ['answer to "Where is Maya waiting?"', 'North lighthouse service tunnel'],
  ['answer to "Which route…?"', 'maintenance tunnel to Pier 4'],
  ['answer to the signature deduction', 'his credentials were reset by Daniel'],
  ['deduction explanation', 'A credential signature cannot establish who used it'],
];

let server, base;
before(async () => {
  server = createWebServer({ apiUrl: 'http://127.0.0.1:1' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/** Fetches the page and every script and stylesheet it loads, following imports. */
async function everythingTheBrowserLoads() {
  const files = new Map();
  const queue = ['/'];
  while (queue.length) {
    const path = queue.shift();
    if (files.has(path)) continue;
    const res = await fetch(base + path);
    assert.equal(res.status, 200, `${path} should load`);
    const body = await res.text();
    files.set(path, body);
    const refs = [
      ...body.matchAll(/(?:src|href)="(\/[^"]*)"/g),
      ...body.matchAll(/from\s*['"](\/[^'"]+)['"]/g),
      ...body.matchAll(/import\(\s*['"](\/[^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]);
    queue.push(...refs);
  }
  return files;
}

test('the files served to the browser contain no puzzle answers', async () => {
  const files = await everythingTheBrowserLoads();
  assert.ok(files.size >= 3, 'crawler found the app scripts');
  const leaks = [];
  for (const [path, body] of files) {
    for (const [what, secret] of SECRETS) if (body.includes(secret)) leaks.push(`${path} reveals the ${what}`);
  }
  assert.deepEqual(leaks, []);
});
