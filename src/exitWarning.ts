import type { Roster } from './domain/types';

/** Compare retained data, not the session revision or undo/search history. */
export function retainedRosterKey(roster: Roster): string {
  return JSON.stringify({
    id: roster.id, title: roster.title, date: roster.date,
    volunteers: roster.volunteers, shifts: roster.shifts, absences: roster.absences,
  });
}

export function needsExitWarning(roster: Roster, recoverableKeys: readonly string[], hasPendingEdits: boolean): boolean {
  return hasPendingEdits || !recoverableKeys.includes(retainedRosterKey(roster));
}

/** The browser chooses whether to show its generic prompt. This does not save. */
export function warnBeforeExit(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = '';
}
