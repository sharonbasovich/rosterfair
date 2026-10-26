import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyRepair, cancelAssignment, createSession, solveRepairs, togglePin, undoEdit, updateShift, updateVolunteer, type EditResult, type Roster, type RosterSession } from '../src/domain/index'
import { independentFeasible } from './oracle'

function fixture(): Roster {
  return {
    id: 'state-fixture', title: 'Synthetic student-club welcome day', date: '2026-11-01', revision: 1,
    volunteers: [
      { id: 'a', name: 'Volunteer A', capabilities: ['desk', 'tech'], availability: [{ start: 0, end: 120 }], preferredMinutes: 60 },
      { id: 'b', name: 'Volunteer B', capabilities: ['desk'], availability: [{ start: 0, end: 120 }], preferredMinutes: 60 },
      { id: 'c', name: 'Volunteer C', capabilities: ['desk', 'tech'], availability: [{ start: 0, end: 120 }], preferredMinutes: 60 },
    ],
    shifts: [
      { id: 'tech', title: 'Tech desk', start: 0, end: 60, requires: ['tech'], volunteerId: 'a', pinned: false },
      { id: 'desk', title: 'Welcome desk', start: 0, end: 60, requires: ['desk'], volunteerId: 'c', pinned: false },
    ],
    absences: [],
  }
}

function success(result: EditResult): RosterSession {
  if (!result.ok) assert.fail(result.error)
  return result.session
}

test('cancellation records the actual interval, plans are previews, apply and undo are explicit', () => {
  const original = fixture()
  let session = createSession(original)
  session = success(cancelAssignment(session, 'tech'))
  assert.equal(session.roster.revision, 2)
  assert.equal(session.roster.shifts[0].volunteerId, null)
  assert.deepEqual(session.roster.absences, [{ volunteerId: 'a', start: 0, end: 60, reason: 'Cancelled Tech desk' }])
  const canceled = structuredClone(session.roster)
  const result = solveRepairs(session.roster)
  assert.deepEqual(session.roster, canceled, 'search does not apply a plan')
  assert.equal(result.options[0].score.covered, 2)
  session = success(applyRepair(session, result.options[0]))
  assert.equal(session.roster.revision, 3)
  assert.equal(session.roster.shifts[0].volunteerId, 'c')
  assert.equal(session.roster.shifts[1].volunteerId, 'b')
  assert.ok(independentFeasible(session.roster, Object.fromEntries(session.roster.shifts.map((shift) => [shift.id, shift.volunteerId]))))
  session = success(undoEdit(session))
  assert.deepEqual({ ...session.roster, revision: 2 }, canceled)
  assert.equal(session.roster.revision, 4)
  session = success(undoEdit(session))
  assert.deepEqual({ ...session.roster, revision: 1 }, original)
  assert.equal(session.roster.revision, 5)
  assert.equal(session.history.length, 0)
  assert.equal(undoEdit(session).ok, false)
  assert.deepEqual(original, fixture(), 'neither session creation nor edits mutate the source fixture')
})

test('stale plans cannot overwrite edits, including after undo restores equivalent content', () => {
  let session = success(cancelAssignment(createSession(fixture()), 'tech'))
  const plan = solveRepairs(session.roster).options[0]
  session = success(updateVolunteer(session, 'b', { preferredMinutes: 30 }))
  const edited = structuredClone(session)
  assert.equal(applyRepair(session, plan).ok, false)
  assert.deepEqual(session, edited)
  session = success(undoEdit(session))
  assert.equal(applyRepair(session, plan).ok, false, 'revision prevents an old preview from reactivating after undo')
  session = success(applyRepair(session, solveRepairs(session.roster).options[0]))
  assert.equal(session.roster.shifts.filter((shift) => shift.volunteerId).length, 2)
})

test('repeated apply, undo, availability edit and undo preserve hard constraints and history', () => {
  let session = success(cancelAssignment(createSession(fixture()), 'tech'))
  for (let iteration = 0; iteration < 25; iteration++) {
    const before = structuredClone(session.roster)
    const revision = session.roster.revision
    const plan = solveRepairs(session.roster).options[0]
    session = success(applyRepair(session, plan))
    assert.equal(session.roster.revision, revision + 1)
    session = success(undoEdit(session))
    assert.deepEqual({ ...session.roster, revision }, before)
    session = success(updateVolunteer(session, 'b', { availability: [] }))
    const constrained = solveRepairs(session.roster)
    assert.equal(constrained.bestCoverage, 1, 'the chain cannot cover both simultaneous slots without B')
    for (const option of constrained.options) assert.ok(independentFeasible(session.roster, option.assignments))
    assert.equal(applyRepair(session, plan).ok, false)
    session = success(undoEdit(session))
    assert.deepEqual({ ...session.roster, revision }, before)
    assert.equal(session.history.length, 1)
  }
})

test('pinned cancellation requires an explicit unpin and contradictory edited pins stay visible', () => {
  let session = createSession(fixture())
  session = success(togglePin(session, 'tech'))
  const snapshot = structuredClone(session)
  assert.equal(cancelAssignment(session, 'tech').ok, false)
  assert.deepEqual(session, snapshot)
  session = success(togglePin(session, 'tech'))
  session = success(cancelAssignment(session, 'tech'))
  session = success(updateShift(session, 'desk', { pinned: true }))
  session = success(updateVolunteer(session, 'c', { availability: [] }))
  const result = solveRepairs(session.roster)
  assert.equal(result.status, 'invalid')
  assert.ok(result.conflicts.length)
  assert.equal(result.options.length, 0)
  assert.equal(session.roster.shifts[1].pinned, true)
  assert.equal(session.roster.shifts[1].volunteerId, 'c', 'search does not silently relax a contradictory pin')
})

test('apply revalidates tampered plans; invalid edits and unknown targets are rejected without mutation', () => {
  const session = success(cancelAssignment(createSession(fixture()), 'tech'))
  const snapshot = structuredClone(session)
  const plan = solveRepairs(session.roster).options[0]
  const forged = { ...plan, assignments: { ...plan.assignments, tech: 'a' } }
  assert.equal(applyRepair(session, forged).ok, false, 'canceled volunteer is unavailable')
  assert.equal(applyRepair(session, { ...plan, assignments: {} }).ok, false)
  assert.equal(updateVolunteer(session, 'b', { preferredMinutes: -1 }).ok, false)
  assert.equal(updateShift(session, 'desk', { end: -1 }).ok, false)
  assert.equal(updateVolunteer(session, 'unknown', { preferredMinutes: 0 }).ok, false)
  assert.equal(updateShift(session, 'unknown', { pinned: true }).ok, false)
  assert.equal(cancelAssignment(session, 'tech').ok, false, 'already open slot cannot be canceled again')
  assert.deepEqual(session, snapshot)
})
