import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, case001 as c, freshRun, toPlayerView } from '../src/index.ts';

const play = (run, ...actions) => actions.reduce((r, a) => apply(r, c, a).run, run);
const solve = (run, d) => play(run, { type: 'deduce', deductionId: d.id, answer: d.answer, supporting: d.requires });
const json = (run) => JSON.stringify(toPlayerView(run, c));

test('a new player sees questions and options, but no evidence text, answers or endings', () => {
  const view = toPlayerView(freshRun(), c);
  const text = JSON.stringify(view);
  assert.ok(!text.includes(c.archive.password), 'no archive password');
  for (const e of c.evidence) assert.ok(!text.includes(e.text), `no text of ${e.id}`);
  for (const d of c.deductions) assert.ok(!text.includes(d.explanation), `no explanation for ${d.id}`);
  assert.ok(!/"answer"|"requires"/.test(text), 'no answer or requires fields');
  assert.ok(!text.includes(c.resolve.prompt));
  for (const ending of Object.values(c.endings)) assert.ok(!text.includes(ending.text));
  assert.deepEqual(view.deductions[0], { id: 'location', question: 'Where is Maya waiting?', solved: false, options: c.deductions[0].options });
  assert.deepEqual(view.timeline, [{ known: false }, { known: false }, { known: false }]);
  assert.deepEqual(view.hints, { revealed: [], remaining: 3 });
});

test('evidence text appears only once found; the ledger only once unlocked', () => {
  let run = play(freshRun(), { type: 'open', app: 'messages' }, { type: 'open', app: 'archive' });
  let view = toPlayerView(run, c);
  assert.deepEqual(view.apps.messages.map((e) => e.id), ['message', 'boat']);
  assert.deepEqual(view.apps.archive, []);
  assert.ok(!json(run).includes('1998'), 'the draft (with the password) is not found yet');
  run = play(run, { type: 'unlock', password: '1998' });
  view = toPlayerView(run, c);
  assert.deepEqual(view.apps.archive.map((e) => e.id), ['ledger']);
  assert.equal(view.timeline[0].known, true, 'the 22:10 event needs the ledger');
});

test('a solved deduction shows its answer and explanation, an unsolved one never does', () => {
  const run = solve(play(freshRun(), { type: 'open', app: 'messages' }, { type: 'open', app: 'files' }), c.deductions[0]);
  const [location, signature] = toPlayerView(run, c).deductions;
  assert.deepEqual(location, { id: 'location', question: c.deductions[0].question, solved: true, answer: c.deductions[0].answer, explanation: c.deductions[0].explanation });
  assert.equal('answer' in signature, false);
});

test('the final prompt appears only when ready, and the ending only once chosen', () => {
  let run = play(freshRun(), { type: 'open', app: 'messages' }, { type: 'open', app: 'files' }, { type: 'unlock', password: '1998' });
  assert.deepEqual(toPlayerView(run, c).resolve, { ready: false });
  run = c.deductions.reduce(solve, run);
  assert.deepEqual(toPlayerView(run, c).resolve, { ready: true, prompt: c.resolve.prompt, channels: [{ id: 'private', label: 'Send privately to Nia' }, { id: 'company', label: 'Call the company emergency line' }] });
  run = play(run, { type: 'decide', channel: 'company' });
  const view = toPlayerView(run, c);
  assert.deepEqual(view.resolve, { ready: false });
  assert.deepEqual(view.ending, c.endings.intercepted);
  assert.equal(view.progress.closed, true);
});

test('pinned evidence and progress counts', () => {
  const run = play(freshRun(), { type: 'open', app: 'files' }, { type: 'pin', evidenceId: 'inspection' });
  const view = toPlayerView(run, c);
  assert.deepEqual(view.pinned.map((e) => e.id), ['inspection']);
  assert.deepEqual(view.progress, { found: 2, totalEvidence: 5, solved: 0, totalDeductions: 3, closed: false });
});
