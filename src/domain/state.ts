import { rosterSignature, validateAssignments, validateRosterData } from './solver'
import { exportRosterFile, parseRosterFile } from './rosterFile'
import type { EditResult, RepairOption, Roster, RosterSession, Shift, Volunteer } from './types'

const clone = <T>(value: T): T => structuredClone(value)
export const createSession = (roster: Roster): RosterSession => ({ roster: clone(roster), history: [] })

/** Explicit confirmation reparses the original bounded file, then makes one undoable edit. */
export function applyRosterImport(session: RosterSession, source: unknown): EditResult {
  const parsed = parseRosterFile(source)
  return parsed.ok ? commit(session, parsed.roster) : { ok: false, error: `Roster import failed: ${parsed.error}` }
}

function commit(session: RosterSession, roster: Roster): EditResult {
  const issues = validateRosterData(roster)
  if (issues.length) return { ok: false, error: issues[0].message }
  const saveable = exportRosterFile(roster)
  if (!saveable.ok) return { ok: false, error: `This change cannot be saved as a roster file: ${saveable.error}` }
  return { ok: true, session: { roster: { ...clone(roster), revision: session.roster.revision + 1 }, history: [...session.history.slice(-49), clone(session.roster)] } }
}

export function cancelAssignment(session: RosterSession, shiftId: string): EditResult {
  const shift = session.roster.shifts.find(s => s.id === shiftId)
  if (!shift?.volunteerId) return { ok: false, error: 'Choose an occupied slot to cancel.' }
  if (shift.pinned) return { ok: false, error: 'Unpin this assignment explicitly before recording its cancellation.' }
  const roster = clone(session.roster)
  roster.absences.push({ volunteerId: shift.volunteerId, start: shift.start, end: shift.end, reason: `Cancelled ${shift.title}` })
  roster.shifts.find(s => s.id === shiftId)!.volunteerId = null
  return commit(session, roster)
}

export function applyRepair(session: RosterSession, option: RepairOption): EditResult {
  if (option.baseSignature !== rosterSignature(session.roster)) return { ok: false, error: 'The roster changed after this plan was calculated. Find repairs again.' }
  const issues = validateAssignments(session.roster, option.assignments)
  if (issues.length) return { ok: false, error: `Plan cannot be applied: ${issues[0].message}` }
  const roster = clone(session.roster)
  roster.shifts = roster.shifts.map(s => ({ ...s, volunteerId: option.assignments[s.id] }))
  return commit(session, roster)
}

export function undoEdit(session: RosterSession): EditResult {
  const previous = session.history.at(-1)
  if (!previous) return { ok: false, error: 'There is no change to undo.' }
  return { ok: true, session: { roster: { ...clone(previous), revision: session.roster.revision + 1 }, history: session.history.slice(0, -1) } }
}

export function updateVolunteer(session: RosterSession, volunteerId: string, patch: Partial<Omit<Volunteer, 'id'>>): EditResult {
  if (!session.roster.volunteers.some(v => v.id === volunteerId)) return { ok: false, error: 'Volunteer does not exist.' }
  const roster = clone(session.roster)
  roster.volunteers = roster.volunteers.map(v => v.id === volunteerId ? { ...v, ...clone(patch), id: v.id } : v)
  return commit(session, roster)
}

export function updateShift(session: RosterSession, shiftId: string, patch: Partial<Omit<Shift, 'id'>>): EditResult {
  if (!session.roster.shifts.some(s => s.id === shiftId)) return { ok: false, error: 'Slot does not exist.' }
  const roster = clone(session.roster)
  roster.shifts = roster.shifts.map(s => s.id === shiftId ? { ...s, ...clone(patch), id: s.id } : s)
  return commit(session, roster)
}

export function togglePin(session: RosterSession, shiftId: string): EditResult {
  const shift = session.roster.shifts.find(s => s.id === shiftId)
  return shift ? updateShift(session, shiftId, { pinned: !shift.pinned }) : { ok: false, error: 'Slot does not exist.' }
}
