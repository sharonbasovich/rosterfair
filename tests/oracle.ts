/**
 * Deliberately simple, test-only oracle. Enumerates the complete Cartesian
 * product before validating; shares no feasibility or scoring code with the
 * production branch-and-bound search.
 */
export interface OracleRoster {
  volunteers: {
    id: string
    capabilities: string[]
    availability: { start: number; end: number }[]
    preferredMinutes: number
  }[]
  shifts: {
    id: string
    start: number
    end: number
    requires: string[]
    volunteerId: string | null
    pinned: boolean
  }[]
  absences: { volunteerId: string; start: number; end: number }[]
}

export interface OracleScore {
  covered: number
  changed: number
  workload: number
}

export function compareScore(left: OracleScore, right: OracleScore): number {
  return right.covered - left.covered || left.changed - right.changed || left.workload - right.workload
}

export function independentFeasible(roster: OracleRoster, assignments: Record<string, string | null>): boolean {
  for (let index = 0; index < roster.shifts.length; index++) {
    const shift = roster.shifts[index]
    const personId = assignments[shift.id]
    if (shift.pinned && personId !== shift.volunteerId) return false
    if (personId === null) continue
    const person = roster.volunteers.find((candidate) => candidate.id === personId)
    if (!person) return false
    if (!shift.requires.every((capability) => person.capabilities.includes(capability))) return false
    // The model uses integer minutes. Check each minute independently rather
    // than sharing the production interval-union routine.
    for (let minute = shift.start; minute < shift.end; minute++) {
      if (!person.availability.some((window) => window.start <= minute && window.end >= minute + 1)) return false
    }
    if (roster.absences.some((absence) => absence.volunteerId === personId && absence.start < shift.end && absence.end > shift.start)) return false
    for (let earlier = 0; earlier < index; earlier++) {
      const other = roster.shifts[earlier]
      if (assignments[other.id] === personId && other.start < shift.end && other.end > shift.start) return false
    }
  }
  return true
}

export function independentScore(roster: OracleRoster, assignments: Record<string, string | null>): OracleScore {
  const score = { covered: 0, changed: 0, workload: 0 }
  for (const shift of roster.shifts) {
    if (assignments[shift.id] !== null) score.covered++
    if (shift.volunteerId !== null && assignments[shift.id] !== shift.volunteerId) score.changed++
  }
  for (const person of roster.volunteers) {
    let minutes = 0
    for (const shift of roster.shifts) {
      if (assignments[shift.id] === person.id) minutes += shift.end - shift.start
    }
    score.workload += Math.max(0, minutes - person.preferredMinutes) ** 2
  }
  return score
}

export function bruteForceOracle(roster: OracleRoster): { score: OracleScore | null; optimalAssignments: Record<string, string | null>[]; inspected: number } {
  const choices: (string | null)[] = [null, ...roster.volunteers.map((person) => person.id)]
  const candidate: Record<string, string | null> = {}
  let best: OracleScore | null = null
  let optimalAssignments: Record<string, string | null>[] = []
  let inspected = 0
  function enumerate(position: number): void {
    if (position < roster.shifts.length) {
      for (const id of choices) {
        candidate[roster.shifts[position].id] = id
        enumerate(position + 1)
      }
      return
    }
    inspected++
    if (!independentFeasible(roster, candidate)) return
    const score = independentScore(roster, candidate)
    if (!best || compareScore(score, best) < 0) {
      best = score
      optimalAssignments = [{ ...candidate }]
    } else if (compareScore(score, best) === 0) {
      optimalAssignments.push({ ...candidate })
    }
  }
  enumerate(0)
  return { score: best, optimalAssignments, inspected }
}
