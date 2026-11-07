import { rosterSignature, type Roster, type SolveResult } from './domain';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const list = (value: unknown, accepts: (item: unknown) => boolean): boolean => Array.isArray(value) && value.every(accepts);

/** Check the worker protocol before any reply reaches components that dereference roster IDs. */
export function isSolveResult(value: unknown, roster: Roster): value is SolveResult {
  const shift = (id: unknown) => typeof id === 'string' && roster.shifts.some(s => s.id === id);
  const person = (id: unknown) => typeof id === 'string' && roster.volunteers.some(v => v.id === id);
  const assignment = (id: unknown) => id === null || person(id);
  const signature = rosterSignature(roster);
  return record(value) && typeof value.status === 'string' && ['optimal', 'limited', 'invalid'].includes(value.status) &&
    value.baseSignature === signature && value.totalSlots === roster.shifts.length &&
    nonnegative(value.explored) && nonnegative(value.elapsedMs) && nonnegative(value.bestCoverage) && value.bestCoverage <= roster.shifts.length &&
    list(value.conflicts, c => record(c) && typeof c.message === 'string' && list(c.shiftIds, shift)) &&
    list(value.diagnostics, d => record(d) && shift(d.shiftId) && list(d.eligibleVolunteerIds, person) &&
      list(d.candidates, c => record(c) && person(c.volunteerId) && typeof c.eligible === 'boolean' &&
        list(c.reasons, r => typeof r === 'string') && list(c.currentConflictShiftIds, shift))) &&
    list(value.options, o => record(o) && typeof o.id === 'string' && o.baseSignature === signature &&
      record(o.assignments) && roster.shifts.every(s => assignment((o.assignments as Record<string, unknown>)[s.id])) &&
      record(o.score) && nonnegative(o.score.covered) && nonnegative(o.score.changed) && nonnegative(o.score.workload) &&
      list(o.changes, c => record(c) && shift(c.shiftId) && assignment(c.from) && assignment(c.to)) &&
      list(o.loads, l => record(l) && person(l.volunteerId) && nonnegative(l.minutes) && nonnegative(l.preferredMinutes) && nonnegative(l.overageMinutes)) &&
      list(o.unfilledShiftIds, shift));
}

export function readWorkerReply(data: unknown, roster: Roster): { result: SolveResult } | { error: string } {
  if (record(data) && isSolveResult(data.result, roster)) return { result: data.result };
  if (record(data) && typeof data.error === 'string' && data.error.trim()) return { error: data.error };
  return { error: 'The local search returned an invalid response.' };
}
