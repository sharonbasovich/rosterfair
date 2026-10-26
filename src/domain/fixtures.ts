import { createSession } from './state'
import type { DemoFixture, Roster } from './types'

const baseRoster: Roster = {
  id: 'repair-day', title: 'Campus repair café', date: '2026-11-07', revision: 0,
  volunteers: [
    { id: 'maya', name: 'Maya Chen', capabilities: ['welcome'], availability: [{ start: 600, end: 840 }], preferredMinutes: 120 },
    { id: 'noor', name: 'Noor Ali', capabilities: ['welcome', 'repair'], availability: [{ start: 600, end: 840 }], preferredMinutes: 240 },
    { id: 'eli', name: 'Eli Parker', capabilities: ['welcome', 'logistics'], availability: [{ start: 600, end: 840 }], preferredMinutes: 120 },
    { id: 'alex', name: 'Alex Rivera', capabilities: ['repair'], availability: [{ start: 600, end: 720 }], preferredMinutes: 60 },
    { id: 'bea', name: 'Bea Morgan', capabilities: ['logistics'], availability: [{ start: 600, end: 720 }], preferredMinutes: 120 },
    { id: 'jun', name: 'Jun Lee', capabilities: ['photography'], availability: [{ start: 660, end: 780 }], preferredMinutes: 120 },
  ],
  shifts: [
    { id: 'welcome', title: 'Welcome desk', start: 600, end: 720, requires: ['welcome'], volunteerId: 'maya', pinned: false },
    { id: 'repair-am', title: 'Repair bench', start: 600, end: 720, requires: ['repair'], volunteerId: 'noor', pinned: false },
    { id: 'logistics', title: 'Tool station', start: 600, end: 720, requires: ['logistics'], volunteerId: 'eli', pinned: false },
    { id: 'photos', title: 'Event photography', start: 660, end: 780, requires: ['photography'], volunteerId: 'jun', pinned: true },
    { id: 'repair-pm', title: 'Afternoon repairs', start: 720, end: 840, requires: ['repair'], volunteerId: 'noor', pinned: false },
  ],
  absences: [],
}

export const CHAIN_FIXTURE: DemoFixture = {
  id: 'chain', name: 'Two-person repair', cancelShiftId: 'welcome',
  description: 'Maya cancels the welcome desk. Both qualified substitutes already have a shift. Move one, then cover the slot they leave behind.',
  roster: structuredClone(baseRoster),
}

const impossibleRoster = structuredClone(baseRoster)
impossibleRoster.shifts.find(s => s.id === 'logistics')!.pinned = true
impossibleRoster.volunteers.find(v => v.id === 'alex')!.availability = [{ start: 720, end: 840 }]
export const IMPOSSIBLE_FIXTURE: DemoFixture = {
  id: 'impossible', name: 'No complete repair', cancelShiftId: 'welcome',
  description: 'The tool station is pinned, and Alex is unavailable in the morning. After Maya cancels, no feasible plan can cover all five slots.',
  roster: impossibleRoster,
}

const conflictRoster = structuredClone(baseRoster)
Object.assign(conflictRoster.shifts.find(s => s.id === 'welcome')!, { volunteerId: 'noor', pinned: true })
conflictRoster.shifts.find(s => s.id === 'repair-am')!.pinned = true
export const PIN_CONFLICT_FIXTURE: DemoFixture = {
  id: 'pin-conflict', name: 'Contradictory pins', cancelShiftId: 'welcome',
  description: 'Noor is pinned to two overlapping morning shifts. Resolve one pin explicitly before a repair can be calculated.',
  roster: conflictRoster,
}

export const DEMO_FIXTURES: DemoFixture[] = [CHAIN_FIXTURE, IMPOSSIBLE_FIXTURE, PIN_CONFLICT_FIXTURE]
export const FIXTURES = DEMO_FIXTURES
export function loadFixture(id = 'chain') {
  return createSession((DEMO_FIXTURES.find(fixture => fixture.id === id) ?? CHAIN_FIXTURE).roster)
}

export function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60}m`
}
