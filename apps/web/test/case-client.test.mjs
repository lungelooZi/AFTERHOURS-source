import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCaseClient, rejectionMessage } from '../src/case-client.ts';

function fakeFetch(table) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    const answer = table[`${init.method} ${url}`];
    if (answer instanceof Error) throw answer;
    const [status, body] = answer ?? [404, { error: { code: 'not_found' } }];
    return new Response(JSON.stringify(body), { status });
  };
  fn.calls = calls;
  return fn;
}
const view = { caseId: 'case-001', progress: { found: 0 } };

test('load, act and restart call the case endpoints', async () => {
  const f = fakeFetch({
    'GET /api/cases/case-001': [200, { view }],
    'POST /api/cases/case-001/actions': [200, { view, outcome: { accepted: false, reason: 'wrong_password' } }],
    'POST /api/cases/case-001/restart': [200, { view }],
  });
  const client = createCaseClient(f);
  assert.deepEqual(await client.load(), { ok: true, value: view });
  const acted = await client.act({ type: 'unlock', password: '0000' });
  assert.deepEqual(acted.value.outcome, { accepted: false, reason: 'wrong_password' });
  assert.deepEqual(f.calls[1].body, { type: 'unlock', password: '0000' });
  assert.equal((await client.restart()).ok, true);
});

test('an offline API, a 502 from the proxy and a rate limit become readable errors', async () => {
  assert.equal((await createCaseClient(fakeFetch({ 'GET /api/cases/case-001': new TypeError('down') })).load()).code, 'api_unavailable');
  const proxy502 = await createCaseClient(fakeFetch({ 'GET /api/cases/case-001': [502, { error: { code: 'api_unavailable' } }] })).load();
  assert.match(proxy502.message, /npm run dev/);
  const limited = await createCaseClient(fakeFetch({ 'GET /api/cases/case-001': [429, { error: { code: 'rate_limited' } }] })).load();
  assert.equal(limited.code, 'rate_limited');
});

test('rejections map to messages that do not reveal which part was wrong', () => {
  assert.equal(rejectionMessage({ accepted: true }), '');
  assert.match(rejectionMessage({ accepted: false, reason: 'not_established' }), /select all supporting documents/);
  assert.equal(rejectionMessage({ accepted: false, reason: 'something new' }), 'That did not work. Please try again.');
});
