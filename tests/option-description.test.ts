import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancelAssignment, loadFixture, solveRepairs } from '../src/domain';

test('an unchanged limited incumbent does not establish that improvement is impossible', () => {
  const edit = cancelAssignment(loadFixture('chain'), 'welcome');
  assert.ok(edit.ok);
  const roster = edit.session.roster;
  for (const maxNodes of [0, 1, 2]) {
    const result = solveRepairs(roster, { maxNodes, maxMs: 1500 });
    assert.equal(result.status, 'limited');
    assert.equal(result.bestCoverage, 4);
    assert.equal(result.options[0].changes.length, 0);
  }
  const complete = solveRepairs(roster, { maxNodes: 100000, maxMs: 1500 });
  assert.equal(complete.status, 'optimal');
  assert.equal(complete.bestCoverage, 5);
  assert.equal(complete.options[0].changes.length, 2);
});
