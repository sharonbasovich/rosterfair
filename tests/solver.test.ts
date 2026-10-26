import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHAIN_FIXTURE, solveRepairs, type Roster } from '../src/domain/index'
import { bruteForceOracle, independentFeasible, independentScore } from './oracle'

function roster(overrides: Partial<Roster> = {}): Roster {
  return {
    id: 'test', title: 'Synthetic student-club roster', date: '2026-11-01', revision: 1,
    volunteers: [
      { id: 'a', name: 'Volunteer A', capabilities: ['desk', 'tech'], availability: [{ start: 0, end: 240 }], preferredMinutes: 120 },
      { id: 'b', name: 'Volunteer B', capabilities: ['desk'], availability: [{ start: 0, end: 240 }], preferredMinutes: 120 },
      { id: 'c', name: 'Volunteer C', capabilities: ['desk', 'tech'], availability: [{ start: 0, end: 240 }], preferredMinutes: 120 },
    ],
    shifts: [{ id: 's1', title: 'Welcome desk', start: 0, end: 60, requires: ['desk'], volunteerId: null, pinned: false }],
    absences: [],
    ...overrides,
  }
}

function assertMatchesOracle(input: Roster): void {
  const snapshot = structuredClone(input)
  const oracle = bruteForceOracle(input)
  const result = solveRepairs(input, { maxNodes: 1_000_000, maxMs: 5_000, maxOptions: 5 })
  assert.deepEqual(input, snapshot, 'search must not mutate roster')
  if (oracle.score === null) {
    assert.equal(result.status, 'invalid')
    return
  }
  assert.equal(result.status, 'optimal', JSON.stringify(input))
  assert.ok(result.options.length > 0, 'every valid bounded tiny instance has at least an all-open feasible schedule')
  assert.deepEqual(result.options[0].score, oracle.score, JSON.stringify(input))
  assert.equal(result.bestCoverage, oracle.score.covered)
  const signatures = new Set<string>()
  for (const option of result.options) {
    assert.ok(independentFeasible(input, option.assignments), `returned infeasible assignment: ${JSON.stringify(option)}`)
    assert.deepEqual(option.score, independentScore(input, option.assignments))
    const signature = JSON.stringify(input.shifts.map((shift) => option.assignments[shift.id]))
    assert.ok(!signatures.has(signature), 'comparison options must be distinct')
    signatures.add(signature)
  }
}

test('cancellation needs a two-person reassignment when a direct replacement is impossible', () => {
  const input = roster({
    shifts: [
      { id: 's1', title: 'Tech desk', start: 0, end: 60, requires: ['tech'], volunteerId: null, pinned: false },
      { id: 's2', title: 'Welcome desk', start: 0, end: 60, requires: ['desk'], volunteerId: 'c', pinned: false },
      { id: 's3', title: 'Pack down', start: 60, end: 120, requires: ['desk'], volunteerId: 'b', pinned: false },
    ],
    absences: [{ volunteerId: 'a', start: 0, end: 60, reason: 'Synthetic cancellation' }],
  })
  assertMatchesOracle(input)
  const best = solveRepairs(input).options[0]
  assert.deepEqual(best.assignments, { s1: 'c', s2: 'b', s3: 'b' })
  assert.equal(best.score.covered, 3)
  assert.equal(best.score.changed, 1)
})

test('coverage wins before disruption, which wins before workload preference', () => {
  const input = roster({
    volunteers: [
      { id: 'a', name: 'Volunteer A', capabilities: ['desk', 'tech'], availability: [{ start: 0, end: 120 }], preferredMinutes: 0 },
      { id: 'b', name: 'Volunteer B', capabilities: ['desk'], availability: [{ start: 0, end: 120 }], preferredMinutes: 120 },
    ],
    shifts: [
      { id: 's1', title: 'Tech', start: 0, end: 60, requires: ['tech'], volunteerId: null, pinned: false },
      { id: 's2', title: 'Desk', start: 0, end: 60, requires: ['desk'], volunteerId: 'a', pinned: false },
    ],
  })
  assertMatchesOracle(input)
  assert.deepEqual(solveRepairs(input).options[0].score, { covered: 2, changed: 1, workload: 3600 })
  const unchanged = roster({ volunteers: input.volunteers })
  unchanged.shifts[0].volunteerId = 'a'
  assertMatchesOracle(unchanged)
  assert.equal(solveRepairs(unchanged).options[0].assignments.s1, 'a', 'lower workload cannot justify changing an existing feasible assignment')
})

test('impossible capability remains uncovered and is explained honestly', () => {
  const input = roster()
  input.shifts[0].requires = ['unavailable-capability']
  assertMatchesOracle(input)
  const result = solveRepairs(input)
  assert.equal(result.bestCoverage, 0)
  assert.equal(result.options[0].assignments.s1, null)
  assert.ok(result.diagnostics.length > 0)
})

test('all required capabilities must be explicit; availability must contain the whole shift', () => {
  const input = roster({
    volunteers: [
      { id: 'a', name: 'A', capabilities: ['desk'], availability: [{ start: 0, end: 60 }], preferredMinutes: 60 },
      { id: 'b', name: 'B', capabilities: ['desk', 'tech'], availability: [{ start: 0, end: 30 }], preferredMinutes: 60 },
      { id: 'c', name: 'C', capabilities: ['desk', 'tech'], availability: [{ start: 0, end: 60 }], preferredMinutes: 60 },
    ],
  })
  input.shifts[0].requires = ['desk', 'tech']
  assertMatchesOracle(input)
  assert.equal(solveRepairs(input).options[0].assignments.s1, 'c')
  input.volunteers[2].availability = [{ start: 0, end: 30 }, { start: 40, end: 60 }]
  assertMatchesOracle(input)
  assert.equal(solveRepairs(input).bestCoverage, 0, 'separate availability windows cannot bridge a gap')
  input.volunteers[2].availability = [{ start: 30, end: 60 }, { start: 0, end: 30 }]
  assertMatchesOracle(input)
  assert.equal(solveRepairs(input).bestCoverage, 1, 'adjacent windows in any order cover a continuous interval')
})

test('touching intervals are allowed, real overlaps and absences are not', () => {
  const input = roster({
    volunteers: [{ id: 'a', name: 'A', capabilities: ['desk'], availability: [{ start: 0, end: 120 }], preferredMinutes: 120 }],
    shifts: [
      { id: 's1', title: 'Early', start: 0, end: 60, requires: ['desk'], volunteerId: null, pinned: false },
      { id: 's2', title: 'Late', start: 60, end: 120, requires: ['desk'], volunteerId: null, pinned: false },
    ],
  })
  assertMatchesOracle(input)
  assert.equal(solveRepairs(input).bestCoverage, 2)
  input.shifts[1].start = 59
  assertMatchesOracle(input)
  assert.equal(solveRepairs(input).bestCoverage, 1)
  input.shifts[1].start = 60
  input.absences = [{ volunteerId: 'a', start: 60, end: 120, reason: 'Explicit absence' }]
  assertMatchesOracle(input)
  assert.deepEqual(solveRepairs(input).options[0].assignments, { s1: 'a', s2: null })
})

test('pins preserve assignments and pinned vacancies; contradictory pins are reported', () => {
  const input = roster()
  input.shifts[0].pinned = true
  assertMatchesOracle(input)
  assert.equal(solveRepairs(input).bestCoverage, 0, 'a pinned open slot stays open')
  input.shifts[0].volunteerId = 'a'
  input.shifts.push({ ...input.shifts[0], id: 's2' })
  const conflict = solveRepairs(input)
  assert.equal(conflict.status, 'invalid')
  assert.equal(conflict.options.length, 0)
  assert.ok(conflict.conflicts.length > 0)
  input.shifts.pop()
  input.shifts[0].requires = ['missing']
  assert.equal(solveRepairs(input).status, 'invalid', 'a pin cannot bypass capability')
  input.shifts[0].requires = ['desk']
  input.volunteers[0].availability = []
  assert.equal(solveRepairs(input).status, 'invalid', 'a pin cannot bypass availability')
  input.volunteers[0].availability = [{ start: 0, end: 240 }]
  input.absences.push({ volunteerId: 'a', start: 0, end: 60, reason: 'Explicit absence' })
  assert.equal(solveRepairs(input).status, 'invalid', 'a pin cannot bypass an absence')
})

test('a bounded search reports a limit without claiming optimality', () => {
  const input = roster({ shifts: Array.from({ length: 6 }, (_, index) => ({ id: `s${index}`, title: `Slot ${index}`, start: 0, end: 60, requires: ['desk'], volunteerId: null, pinned: false })) })
  const result = solveRepairs(input, { maxNodes: 1, maxMs: 5_000 })
  assert.equal(result.status, 'limited')
  for (const option of result.options) {
    assert.ok(independentFeasible(input, option.assignments))
    assert.deepEqual(option.score, independentScore(input, option.assignments))
  }
})

test('zero time or node budget retains feasible existing work while reporting a limit', () => {
  const input = structuredClone(CHAIN_FIXTURE.roster)
  const canceled = input.shifts.find((shift) => shift.id === CHAIN_FIXTURE.cancelShiftId)!
  input.absences.push({ volunteerId: canceled.volunteerId!, start: canceled.start, end: canceled.end, reason: 'Synthetic cancellation' })
  canceled.volunteerId = null
  for (const budget of [{ maxNodes: 0, maxMs: 5_000 }, { maxNodes: 100_000, maxMs: 0 }]) {
    const result = solveRepairs(input, budget)
    assert.equal(result.status, 'limited')
    assert.equal(result.explored, 0)
    assert.equal(result.bestCoverage, 4)
    assert.deepEqual(result.options[0].score, { covered: 4, changed: 0, workload: 0 })
    assert.ok(independentFeasible(input, result.options[0].assignments))
    assert.deepEqual(result.options[0].assignments, Object.fromEntries(input.shifts.map((shift) => [shift.id, shift.volunteerId])))
  }
})

test('independent brute-force oracle agrees on 240 seeded tiny instances', (context) => {
  let seed = 20261025
  function random(max: number): number {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) % max
  }
  let inspected = 0
  let infeasiblePinned = 0
  let partial = 0
  for (let fixture = 0; fixture < 240; fixture++) {
    const people = Array.from({ length: 1 + random(4) }, (_, index) => ({
      id: `v${index}`, name: `Synthetic ${index}`, capabilities: random(2) ? ['desk', 'tech'] : ['desk'],
      availability: random(3) === 0 ? [{ start: random(3) * 30, end: 120 }] : [{ start: 0, end: 120 }],
      preferredMinutes: random(5) * 30,
    }))
    const shifts = Array.from({ length: random(5) }, (_, index) => {
      const start = random(4) * 30
      return { id: `s${index}`, title: `Slot ${index}`, start, end: start + 30, requires: [random(3) ? 'desk' : 'tech'], volunteerId: random(3) ? people[random(people.length)].id : null, pinned: random(6) === 0 }
    })
    const input = roster({
      id: `seed-${fixture}`, volunteers: people, shifts,
      absences: random(3) === 0 ? [{ volunteerId: people[random(people.length)].id, start: 30, end: 60, reason: 'Synthetic absence' }] : [],
    })
    const oracle = bruteForceOracle(input)
    inspected += oracle.inspected
    if (!oracle.score) infeasiblePinned++
    else if (oracle.score.covered < input.shifts.length) partial++
    assertMatchesOracle(input)
  }
  context.diagnostic(`Independent oracle inspected ${inspected} complete assignments across 240 deterministic fixtures; ${partial} partial-coverage optima and ${infeasiblePinned} contradictory-pin fixtures.`)
})
