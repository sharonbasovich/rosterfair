import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_FIXTURES, solveRepairs } from '../src/domain';
import { isSolveResult, readWorkerReply } from '../src/workerReply';

test('worker protocol accepts real solver output for every synthetic scenario', () => {
  for (const fixture of DEMO_FIXTURES) {
    const result = solveRepairs(fixture.roster);
    assert.equal(isSolveResult(result, fixture.roster), true, fixture.id);
    assert.deepEqual(readWorkerReply({ result }, fixture.roster), { result });
  }
});

test('worker protocol rejects malformed envelopes, partial results and broken render references', () => {
  const roster = DEMO_FIXTURES[0].roster;
  for (const data of [null, undefined, [], 42, {}, { error: 42 }, { error: '' }, { result: {} }, { result: { options: [] } }]) {
    assert.deepEqual(readWorkerReply(data, roster), { error: 'The local search returned an invalid response.' });
  }
  const result = solveRepairs(roster);
  const malformed = structuredClone(result);
  malformed.diagnostics[0].shiftId = 'missing-shift';
  assert.equal(isSolveResult(malformed, roster), false);
  const partial = structuredClone(result);
  delete (partial.options[0] as Partial<typeof partial.options[0]>).score;
  assert.equal(isSolveResult(partial, roster), false);
  assert.equal(isSolveResult(result, { ...roster, revision: roster.revision + 1 }), false);
  assert.deepEqual(readWorkerReply({ error: 'Search failed.' }, roster), { error: 'Search failed.' });
});
