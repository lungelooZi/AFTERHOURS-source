import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, case001 as c, freshRun, ready, restoreRun } from '../src/index.ts';

/** Applies actions in order, asserting each is accepted. */
function play(run, ...actions) {
  for (const action of actions) {
    const result = apply(run, c, action);
    assert.equal(result.outcome.accepted, true, `${JSON.stringify(action)} → ${JSON.stringify(result.outcome)}`);
    run = result.run;
  }
  return run;
}
const solveAll = (run) =>
  play(run, ...c.deductions.map((d) => ({ type: 'deduce', deductionId: d.id, answer: d.answer, supporting: d.requires })));
const everything = () => play(freshRun(), { type: 'open', app: 'messages' }, { type: 'open', app: 'files' }, { type: 'unlock', password: '1998' });

test('opening an app discovers its evidence, once', () => {
  let run = play(freshRun(), { type: 'open', app: 'messages' }, { type: 'open', app: 'messages' });
  assert.deepEqual(run.found, ['message', 'boat']);
  run = play(run, { type: 'open', app: 'archive' });
  assert.deepEqual(run.found, ['message', 'boat'], 'archive reveals nothing while locked');
});

test('the archive needs the right password; a wrong one changes nothing', () => {
  const run = freshRun();
  assert.deepEqual(apply(run, c, { type: 'unlock', password: '1234' }), { run, outcome: { accepted: false, reason: 'wrong_password' } });
  const unlocked = play(run, { type: 'unlock', password: ' 1998 ' });
  assert.equal(unlocked.unlocked, true);
  assert.deepEqual(unlocked.found, ['ledger']);
});

test('only found evidence can be pinned', () => {
  assert.equal(apply(freshRun(), c, { type: 'pin', evidenceId: 'ledger' }).outcome.reason, 'not_found_yet');
  const run = play(freshRun(), { type: 'open', app: 'messages' }, { type: 'pin', evidenceId: 'boat' }, { type: 'pin', evidenceId: 'boat' });
  assert.deepEqual(run.pinned, ['boat']);
  assert.deepEqual(play(run, { type: 'unpin', evidenceId: 'boat' }).pinned, []);
});

test('a deduction needs the right answer AND every supporting document, found and selected', () => {
  const d = c.deductions.find((x) => x.id === 'location');
  const run = everything();
  const attempt = (r, answer, supporting) => apply(r, c, { type: 'deduce', deductionId: d.id, answer, supporting }).outcome;
  assert.deepEqual(attempt(run, d.options[1], d.requires), { accepted: false, reason: 'not_established' });
  assert.deepEqual(attempt(run, d.answer, ['message']), { accepted: false, reason: 'not_established' });
  assert.deepEqual(attempt(freshRun(), d.answer, d.requires), { accepted: false, reason: 'not_established' }, 'evidence not found yet');
  assert.equal(attempt(run, d.answer, d.requires).accepted, true);
});

test('the final decision is blocked until ready, then closes the case for good', () => {
  let run = everything();
  assert.equal(apply(run, c, { type: 'decide', channel: 'private' }).outcome.reason, 'not_ready');
  run = solveAll(run);
  assert.equal(ready(run, c), true);
  assert.equal(apply(run, c, { type: 'decide', channel: 'carrier pigeon' }).outcome.reason, 'unknown');
  const safe = play(run, { type: 'decide', channel: 'private' });
  assert.equal(safe.ending, 'safe');
  assert.equal(play(run, { type: 'decide', channel: 'company' }).ending, 'intercepted');
  assert.equal(apply(safe, c, { type: 'decide', channel: 'company' }).outcome.reason, 'case_closed');
  assert.equal(apply(safe, c, { type: 'notes', text: 'after the case' }).outcome.accepted, true, 'notes stay editable');
});

test('hints run out; notes are capped', () => {
  let run = play(freshRun(), { type: 'hint' }, { type: 'hint' }, { type: 'hint' });
  assert.equal(apply(run, c, { type: 'hint' }).outcome.reason, 'no_more_hints');
  run = play(run, { type: 'notes', text: 'x'.repeat(5000) });
  assert.equal(run.notes.length, 4000);
});

test('actions never mutate the run they were given', () => {
  const run = everything();
  const before = JSON.stringify(run);
  apply(run, c, { type: 'pin', evidenceId: 'ledger' });
  solveAll(run);
  assert.equal(JSON.stringify(run), before);
});

test('restoreRun keeps valid saves and repairs tampered ones', () => {
  const run = solveAll(everything());
  assert.deepEqual(restoreRun(JSON.parse(JSON.stringify(run)), c), run);
  for (const bad of [null, 'nope', { version: 1 }, { version: 3 }]) assert.deepEqual(restoreRun(bad, c), freshRun());
  const tampered = restoreRun(
    { version: 2, found: ['message', 'ledger', 'fake', 'message'], pinned: ['boat'], unlocked: false, solved: ['location', 'signature'], hints: 99, notes: 5, ending: 'victory' },
    c,
  );
  assert.deepEqual(tampered, { ...freshRun(), found: ['message'], hints: 3 });
});
