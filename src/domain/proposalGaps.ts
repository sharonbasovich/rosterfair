import { explainCandidate, overlaps } from './solver';
import type { RepairOption, Roster } from './types';

/** Per-person checks for this proposal, not a proof about all possible repairs. */
export function explainProposalGaps(roster: Roster, option: RepairOption) {
  return roster.shifts.filter(shift => option.assignments[shift.id] === null).map(shift => {
    return {
      shift,
      candidates: roster.volunteers.map(volunteer => {
        const { reasons } = explainCandidate(roster, shift, volunteer);
        const competingRoles = roster.shifts.filter(other => other.id !== shift.id
          && option.assignments[other.id] === volunteer.id && overlaps(other, shift));
        return { volunteer, reasons, competingRoles };
      }),
    };
  });
}
