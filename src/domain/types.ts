/** All times are local wall-clock minutes on the single event date, [start, end). */
export interface TimeRange { start: number; end: number }

export interface Volunteer {
  id: string
  name: string
  capabilities: string[]
  availability: TimeRange[]
  /** A stated workload preference, never a hard maximum. */
  preferredMinutes: number
}

export interface Shift extends TimeRange {
  id: string
  title: string
  requires: string[]
  volunteerId: string | null
  /** Pins preserve this exact assignment, including a deliberately open slot. */
  pinned: boolean
}

export interface Absence extends TimeRange { volunteerId: string; reason: string }

export interface Roster {
  id: string
  title: string
  date: string
  revision: number
  volunteers: Volunteer[]
  shifts: Shift[]
  absences: Absence[]
}

export interface Violation {
  code: 'data' | 'capability' | 'availability' | 'absence' | 'overlap' | 'pin'
  message: string
  shiftIds: string[]
  volunteerId?: string
}

export interface CandidateExplanation {
  volunteerId: string
  eligible: boolean
  reasons: string[]
  currentConflictShiftIds: string[]
}

export interface ShiftDiagnostic {
  shiftId: string
  candidates: CandidateExplanation[]
  eligibleVolunteerIds: string[]
}

export interface RepairScore {
  covered: number
  /** Previously occupied slots changed. Filling a vacancy is not a disruption. */
  changed: number
  /** Sum of squared minutes above each volunteer's stated preference. */
  workload: number
}

export interface AssignmentChange { shiftId: string; from: string | null; to: string | null }
export interface VolunteerLoad {
  volunteerId: string
  minutes: number
  preferredMinutes: number
  overageMinutes: number
}

export interface RepairOption {
  id: string
  baseSignature: string
  assignments: Record<string, string | null>
  score: RepairScore
  changes: AssignmentChange[]
  loads: VolunteerLoad[]
  unfilledShiftIds: string[]
}

export interface SolveOptions { maxNodes?: number; maxMs?: number; maxOptions?: number }
export interface SolveResult {
  status: 'optimal' | 'limited' | 'invalid'
  options: RepairOption[]
  explored: number
  elapsedMs: number
  totalSlots: number
  bestCoverage: number
  conflicts: Violation[]
  diagnostics: ShiftDiagnostic[]
  baseSignature: string
}

export interface RosterSession { roster: Roster; history: Roster[] }
export type EditResult = { ok: true; session: RosterSession } | { ok: false; error: string }

export interface DemoFixture {
  id: string
  name: string
  description: string
  cancelShiftId: string
  roster: Roster
}
