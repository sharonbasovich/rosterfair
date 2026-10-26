import type {
  CandidateExplanation, RepairOption, Roster, Shift, ShiftDiagnostic,
  SolveOptions, SolveResult, TimeRange, Violation, Volunteer,
} from './types'

const now = () => performance.now()
export const overlaps = (a: TimeRange, b: TimeRange) => a.start < b.end && b.start < a.end
const validRange = (range: TimeRange) => Number.isInteger(range.start) && Number.isInteger(range.end)
  && range.start >= 0 && range.start < range.end && range.end <= 1440

/** Order-independent interval union: adjacent availability windows can cover a shift. */
export function covers(availability: TimeRange[], shift: TimeRange): boolean {
  let cursor = shift.start
  for (const range of [...availability].sort((a, b) => a.start - b.start)) {
    if (range.end <= cursor) continue
    if (range.start > cursor) return false
    cursor = range.end
    if (cursor >= shift.end) return true
  }
  return false
}

/** Used to reject stale plans after every edit, including undo. No persisted hash/secret. */
export const rosterSignature = (roster: Roster): string => JSON.stringify(roster)

export function validateRosterData(roster: Roster): Violation[] {
  const issues: Violation[] = []
  const issue = (message: string, shiftIds: string[] = []) => issues.push({ code: 'data', message, shiftIds })
  if (roster.shifts.length > 12 || roster.volunteers.length > 12) issue('This prototype supports at most 12 slots and 12 volunteers.')
  if (!Number.isInteger(roster.revision) || roster.revision < 0) issue('Roster revision must be a non-negative integer.')
  const volunteerIds = new Set<string>()
  for (const v of roster.volunteers) {
    if (!v.id || volunteerIds.has(v.id)) issue('Volunteer IDs must be unique and non-empty.')
    volunteerIds.add(v.id)
    if (!v.name.trim()) issue('Every volunteer needs a name.')
    if (!Number.isInteger(v.preferredMinutes) || v.preferredMinutes < 0) issue(`${v.name}: preferred minutes must be a non-negative integer.`)
    if (v.availability.some(range => !validRange(range))) issue(`${v.name}: availability must use valid same-day time ranges.`)
  }
  const shiftIds = new Set<string>()
  for (const s of roster.shifts) {
    if (!s.id || shiftIds.has(s.id)) issue('Slot IDs must be unique and non-empty.', [s.id])
    shiftIds.add(s.id)
    if (!validRange(s)) issue(`${s.title}: shift must use a valid same-day time range.`, [s.id])
    if (s.volunteerId !== null && !volunteerIds.has(s.volunteerId)) issue(`${s.title}: assigned volunteer does not exist.`, [s.id])
  }
  for (const absence of roster.absences) {
    if (!volunteerIds.has(absence.volunteerId) || !validRange(absence)) issue('Every absence needs an existing volunteer and a valid same-day time range.')
  }
  return issues
}

export function explainCandidate(roster: Roster, shift: Shift, volunteer: Volunteer): CandidateExplanation {
  const reasons: string[] = []
  const missing = shift.requires.filter(capability => !volunteer.capabilities.includes(capability))
  if (missing.length) reasons.push(`Missing capability: ${missing.join(', ')}.`)
  if (!covers(volunteer.availability, shift)) reasons.push('Availability does not cover the whole shift.')
  if (roster.absences.some(absence => absence.volunteerId === volunteer.id && overlaps(absence, shift))) reasons.push('Explicit absence overlaps this shift.')
  if (shift.pinned && shift.volunteerId !== volunteer.id) reasons.push('This slot is pinned to its current assignment.')
  if (roster.shifts.some(other => other.id !== shift.id && other.pinned && other.volunteerId === volunteer.id && overlaps(other, shift))) reasons.push('Overlaps another pinned assignment.')
  const currentConflictShiftIds = roster.shifts.filter(other => other.id !== shift.id
    && other.volunteerId === volunteer.id && overlaps(other, shift)).map(other => other.id)
  return { volunteerId: volunteer.id, eligible: reasons.length === 0, reasons, currentConflictShiftIds }
}

/** Null means deliberately uncovered. Missing keys are rejected, never silently filled. */
export function validateAssignments(roster: Roster, assignments: Record<string, string | null>, respectPins = true): Violation[] {
  const issues = validateRosterData(roster)
  if (issues.length) return issues
  const byId = new Map(roster.volunteers.map(v => [v.id, v]))
  const expected = new Set(roster.shifts.map(s => s.id))
  if (Object.keys(assignments).length !== expected.size || Object.keys(assignments).some(id => !expected.has(id))) {
    issues.push({ code: 'data', message: 'The plan must contain exactly one assignment for every slot.', shiftIds: [] })
    return issues
  }
  for (const shift of roster.shifts) {
    const assigned = assignments[shift.id]
    if (assigned === undefined || (assigned !== null && !byId.has(assigned))) {
      issues.push({ code: 'data', message: `${shift.title}: assignment is missing or unknown.`, shiftIds: [shift.id] })
      continue
    }
    if (respectPins && shift.pinned && assigned !== shift.volunteerId) issues.push({ code: 'pin', message: `${shift.title}: a pinned assignment cannot change.`, shiftIds: [shift.id] })
    if (assigned === null) continue
    const volunteer = byId.get(assigned)!
    if (!shift.requires.every(capability => volunteer.capabilities.includes(capability))) issues.push({ code: 'capability', message: `${volunteer.name} does not meet ${shift.title}'s capabilities.`, shiftIds: [shift.id], volunteerId: assigned })
    if (!covers(volunteer.availability, shift)) issues.push({ code: 'availability', message: `${volunteer.name} is not available for all of ${shift.title}.`, shiftIds: [shift.id], volunteerId: assigned })
    if (roster.absences.some(a => a.volunteerId === assigned && overlaps(a, shift))) issues.push({ code: 'absence', message: `${volunteer.name} has an explicit absence during ${shift.title}.`, shiftIds: [shift.id], volunteerId: assigned })
  }
  for (let i = 0; i < roster.shifts.length; i++) {
    const left = roster.shifts[i]
    const assigned = assignments[left.id]
    if (!assigned) continue
    for (const right of roster.shifts.slice(i + 1)) {
      if (assignments[right.id] === assigned && overlaps(left, right)) issues.push({ code: 'overlap', message: `${byId.get(assigned)?.name ?? assigned} cannot cover overlapping shifts.`, shiftIds: [left.id, right.id], volunteerId: assigned })
    }
  }
  return issues
}

export function describePlan(roster: Roster, assignments: Record<string, string | null>): RepairOption {
  const loads = roster.volunteers.map(volunteer => {
    const minutes = roster.shifts.reduce((sum, shift) => sum + (assignments[shift.id] === volunteer.id ? shift.end - shift.start : 0), 0)
    return { volunteerId: volunteer.id, minutes, preferredMinutes: volunteer.preferredMinutes, overageMinutes: Math.max(0, minutes - volunteer.preferredMinutes) }
  })
  const changes = roster.shifts.filter(s => s.volunteerId !== assignments[s.id]).map(s => ({ shiftId: s.id, from: s.volunteerId, to: assignments[s.id] }))
  const id = JSON.stringify(roster.shifts.map(s => [s.id, assignments[s.id]]))
  return {
    id, baseSignature: rosterSignature(roster), assignments: { ...assignments }, changes, loads,
    unfilledShiftIds: roster.shifts.filter(s => assignments[s.id] === null).map(s => s.id),
    score: {
      covered: roster.shifts.filter(s => assignments[s.id] !== null).length,
      changed: changes.filter(change => change.from !== null).length,
      workload: loads.reduce((sum, load) => sum + load.overageMinutes ** 2, 0),
    },
  }
}

export function comparePlans(a: RepairOption, b: RepairOption): number {
  return b.score.covered - a.score.covered || a.score.changed - b.score.changed
    || a.score.workload - b.score.workload || a.id.localeCompare(b.id)
}

/**
 * Tiny-instance exact backtracking. Hard constraints are never relaxed. A limited
 * run returns feasible incumbents, without claiming optimality or infeasibility.
 */
export function solveRepairs(roster: Roster, options: SolveOptions = {}): SolveResult {
  const started = now()
  const baseSignature = rosterSignature(roster)
  const maxNodes = Math.max(0, Math.floor(options.maxNodes ?? 250_000))
  const maxMs = Math.max(0, options.maxMs ?? 150)
  const maxOptions = Math.max(1, Math.min(8, Math.floor(options.maxOptions ?? 4)))
  const dataIssues = validateRosterData(roster)
  const emptyResult: SolveResult = {
    status: 'invalid', options: [], explored: 0, elapsedMs: 0, totalSlots: roster.shifts.length,
    bestCoverage: 0, conflicts: dataIssues, diagnostics: [], baseSignature,
  }
  if (dataIssues.length) return { ...emptyResult, elapsedMs: now() - started }
  const diagnostics: ShiftDiagnostic[] = roster.shifts.map(shift => {
    const candidates = roster.volunteers.map(volunteer => explainCandidate(roster, shift, volunteer))
    return { shiftId: shift.id, candidates, eligibleVolunteerIds: candidates.filter(c => c.eligible).map(c => c.volunteerId) }
  })
  const assignment: Record<string, string | null> = Object.fromEntries(roster.shifts.map(s => [s.id, s.pinned ? s.volunteerId : null]))
  const pinnedIssues = validateAssignments(roster, assignment)
  if (pinnedIssues.length) return { ...emptyResult, conflicts: pinnedIssues.map(issue => ({ ...issue, message: `Pinned constraint conflict: ${issue.message}` })), diagnostics, elapsedMs: now() - started }
  const candidateMap = new Map(diagnostics.map(d => [d.shiftId, d.eligibleVolunteerIds]))
  const free = roster.shifts.filter(s => !s.pinned).sort((a, b) => candidateMap.get(a.id)!.length - candidateMap.get(b.id)!.length || a.id.localeCompare(b.id))
  const busy = new Map(roster.volunteers.map(v => [v.id, roster.shifts.filter(s => s.pinned && s.volunteerId === v.id)]))
  // Preserve feasible existing work even when the search budget is zero. If an
  // edit made the baseline inconsistent, retain only assignments that still fit.
  const seed = { ...assignment }
  const seedBusy = new Map([...busy].map(([id, shifts]) => [id, [...shifts]]))
  for (const shift of free) {
    const volunteerId = shift.volunteerId
    if (volunteerId !== null && candidateMap.get(shift.id)!.includes(volunteerId)
      && !seedBusy.get(volunteerId)!.some(other => overlaps(other, shift))) {
      seed[shift.id] = volunteerId
      seedBusy.get(volunteerId)!.push(shift)
    }
  }
  const retained: RepairOption[] = [describePlan(roster, seed)]
  const pinnedCoverage = roster.shifts.filter(s => s.pinned && s.volunteerId !== null).length
  let explored = 0
  let limited = false
  let bestCoverage = retained[0].score.covered
  const remember = () => {
    const plan = describePlan(roster, assignment)
    if (plan.score.covered < bestCoverage) return
    if (plan.score.covered > bestCoverage) {
      retained.length = 0
      bestCoverage = plan.score.covered
    }
    if (retained.some(other => other.id === plan.id)) return
    retained.push(plan)
    retained.sort(comparePlans)
    retained.length = Math.min(retained.length, maxOptions)
  }
  const visit = (depth: number, covered: number) => {
    if (limited) return
    if (explored >= maxNodes || ((explored & 63) === 0 && now() - started >= maxMs)) { limited = true; return }
    explored++
    if (covered + free.length - depth < bestCoverage) return
    if (depth === free.length) { remember(); return }
    const shift = free[depth]
    const choices = [...candidateMap.get(shift.id)!].sort((a, b) => Number(b === shift.volunteerId) - Number(a === shift.volunteerId) || a.localeCompare(b))
    for (const volunteerId of choices) {
      const occupied = busy.get(volunteerId)!
      if (occupied.some(other => overlaps(other, shift))) continue
      assignment[shift.id] = volunteerId
      occupied.push(shift)
      visit(depth + 1, covered + 1)
      occupied.pop()
      if (limited) break
    }
    assignment[shift.id] = null
    if (!limited) visit(depth + 1, covered)
  }
  visit(0, pinnedCoverage)
  return {
    status: limited ? 'limited' : 'optimal', options: retained, explored, elapsedMs: now() - started,
    totalSlots: roster.shifts.length, bestCoverage, conflicts: [], diagnostics, baseSignature,
  }
}
