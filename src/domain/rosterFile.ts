import { validateAssignments } from './solver'
import type { Absence, Roster, Shift, TimeRange, Violation, Volunteer } from './types'

export const ROSTER_FILE_FORMAT = 'rosterfair-roster' as const
export const ROSTER_FILE_VERSION = 1 as const
export const MAX_ROSTER_FILE_BYTES = 128 * 1024

/** String limits count UTF-16 code units; file size counts UTF-8 encoded bytes. */
export const ROSTER_FILE_LIMITS = Object.freeze({
  volunteers: 12,
  shifts: 12,
  availabilityWindows: 6,
  capabilities: 12,
  absences: 144,
  idLength: 48,
  nameLength: 120,
  titleLength: 120,
  capabilityLength: 48,
  reasonLength: 160,
  maxMinutes: 1440,
})

export interface RosterFileEnvelope {
  format: typeof ROSTER_FILE_FORMAT
  version: typeof ROSTER_FILE_VERSION
  roster: Omit<Roster, 'revision'>
}

export interface RosterFileIssue { path: string; message: string }
export interface RosterFileFailure { ok: false; error: string; issues: RosterFileIssue[] }
export type RosterImportResult = RosterFileFailure | {
  ok: true
  roster: Roster
  warnings: Violation[]
  byteLength: number
}
export type RosterExportResult = RosterFileFailure | {
  ok: true
  text: string
  fileName: string
  byteLength: number
  warnings: Violation[]
}

class SchemaError extends Error {
  constructor(readonly path: string, message: string) { super(message) }
}

const forbiddenIds = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype'].map(value => value.toLowerCase()))
// eslint-disable-next-line no-control-regex -- Deliberately reject C0/C1 and bidi controls in imported display text.
const unreadableCharacters = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const utf8Bytes = (text: string): number => new TextEncoder().encode(text).byteLength

function failure(path: string, message: string): RosterFileFailure {
  return { ok: false, error: `${path}: ${message}`, issues: [{ path, message }] }
}

function readObject(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new SchemaError(path, 'Expected a plain object.')
  }
  const object = value as Record<string, unknown>
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) throw new SchemaError(path, `Unknown property ${JSON.stringify(key)}.`)
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) throw new SchemaError(`${path}.${key}`, 'Required property is missing.')
  }
  return object
}

function readArray(value: unknown, path: string, maximum: number, minimum = 0): unknown[] {
  if (!Array.isArray(value)) throw new SchemaError(path, 'Expected an array.')
  if (value.length < minimum) throw new SchemaError(path, `At least ${minimum} item is required.`)
  if (value.length > maximum) throw new SchemaError(path, `At most ${maximum} items are supported.`)
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) throw new SchemaError(path, 'Sparse arrays are not supported.')
  }
  return value
}

function readText(value: unknown, path: string, maximum: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    throw new SchemaError(path, `Expected a string of 1–${maximum} UTF-16 code units.`)
  }
  if (value.trim() !== value || unreadableCharacters.test(value)) {
    throw new SchemaError(path, 'Text must be trimmed and contain no control or bidirectional formatting characters.')
  }
  return value
}

function readId(value: unknown, path: string): string {
  const id = readText(value, path, ROSTER_FILE_LIMITS.idLength)
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(id) || forbiddenIds.has(id.toLowerCase())) {
    throw new SchemaError(path, 'Use a safe ID beginning with a letter or number, followed by letters, numbers, hyphens or underscores; prototype property names are forbidden.')
  }
  return id
}

function readMinute(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)
    || value < 0 || value > ROSTER_FILE_LIMITS.maxMinutes) {
    throw new SchemaError(path, 'Expected a finite integer from 0 to 1440 minutes.')
  }
  return value
}

function readRange(value: unknown, path: string): TimeRange {
  const range = readObject(value, path, ['start', 'end'])
  const start = readMinute(range.start, `${path}.start`)
  const end = readMinute(range.end, `${path}.end`)
  if (start >= end) throw new SchemaError(path, 'The start must be earlier than the end on the same day.')
  return { start, end }
}

function readCapabilities(value: unknown, path: string): string[] {
  const capabilities = readArray(value, path, ROSTER_FILE_LIMITS.capabilities)
    .map((capability, index) => readText(capability, `${path}[${index}]`, ROSTER_FILE_LIMITS.capabilityLength))
  if (new Set(capabilities).size !== capabilities.length) throw new SchemaError(path, 'Duplicate capabilities are not allowed; matching is exact and case-sensitive.')
  return capabilities
}

function readVolunteer(value: unknown, path: string): Volunteer {
  const v = readObject(value, path, ['id', 'name', 'capabilities', 'availability', 'preferredMinutes'])
  return {
    id: readId(v.id, `${path}.id`),
    name: readText(v.name, `${path}.name`, ROSTER_FILE_LIMITS.nameLength),
    capabilities: readCapabilities(v.capabilities, `${path}.capabilities`),
    availability: readArray(v.availability, `${path}.availability`, ROSTER_FILE_LIMITS.availabilityWindows)
      .map((range, index) => readRange(range, `${path}.availability[${index}]`)),
    preferredMinutes: readMinute(v.preferredMinutes, `${path}.preferredMinutes`),
  }
}

function readShift(value: unknown, path: string): Shift {
  const s = readObject(value, path, ['id', 'title', 'start', 'end', 'requires', 'volunteerId', 'pinned'])
  const range = readRange({ start: s.start, end: s.end }, path)
  if (typeof s.pinned !== 'boolean') throw new SchemaError(`${path}.pinned`, 'Expected a boolean.')
  return {
    id: readId(s.id, `${path}.id`),
    title: readText(s.title, `${path}.title`, ROSTER_FILE_LIMITS.titleLength),
    ...range,
    requires: readCapabilities(s.requires, `${path}.requires`),
    volunteerId: s.volunteerId === null ? null : readId(s.volunteerId, `${path}.volunteerId`),
    pinned: s.pinned,
  }
}

function readAbsence(value: unknown, path: string): Absence {
  const absence = readObject(value, path, ['volunteerId', 'start', 'end', 'reason'])
  return {
    volunteerId: readId(absence.volunteerId, `${path}.volunteerId`),
    ...readRange({ start: absence.start, end: absence.end }, path),
    reason: readText(absence.reason, `${path}.reason`, ROSTER_FILE_LIMITS.reasonLength),
  }
}

function readDate(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value)) throw new SchemaError(path, 'Expected a real date in YYYY-MM-DD format.')
  const [year, month, day] = value.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) {
    throw new SchemaError(path, 'Expected a real Gregorian date with a year from 0001 to 9999.')
  }
  return value
}

const rosterKeys = ['id', 'title', 'date', 'volunteers', 'shifts', 'absences'] as const

function readRoster(value: unknown): Roster {
  const r = readObject(value, 'roster', rosterKeys)
  const volunteers = readArray(r.volunteers, 'roster.volunteers', ROSTER_FILE_LIMITS.volunteers, 1)
    .map((volunteer, index) => readVolunteer(volunteer, `roster.volunteers[${index}]`))
  const shifts = readArray(r.shifts, 'roster.shifts', ROSTER_FILE_LIMITS.shifts, 1)
    .map((shift, index) => readShift(shift, `roster.shifts[${index}]`))
  const absences = readArray(r.absences, 'roster.absences', ROSTER_FILE_LIMITS.absences)
    .map((absence, index) => readAbsence(absence, `roster.absences[${index}]`))
  const volunteerIds = new Set(volunteers.map(v => v.id))
  if (volunteerIds.size !== volunteers.length) throw new SchemaError('roster.volunteers', 'Volunteer IDs must be unique.')
  if (new Set(shifts.map(s => s.id)).size !== shifts.length) throw new SchemaError('roster.shifts', 'Slot IDs must be unique.')
  for (const [index, shift] of shifts.entries()) {
    if (shift.volunteerId !== null && !volunteerIds.has(shift.volunteerId)) throw new SchemaError(`roster.shifts[${index}].volunteerId`, 'Assignment must refer to a known volunteer ID or be null.')
  }
  for (const [index, absence] of absences.entries()) {
    if (!volunteerIds.has(absence.volunteerId)) throw new SchemaError(`roster.absences[${index}].volunteerId`, 'Absence must refer to a known volunteer ID.')
  }
  return {
    id: readId(r.id, 'roster.id'),
    title: readText(r.title, 'roster.title', ROSTER_FILE_LIMITS.titleLength),
    date: readDate(r.date, 'roster.date'),
    revision: 0,
    volunteers, shifts, absences,
  }
}

function constraintWarnings(roster: Roster): Violation[] {
  return validateAssignments(roster, Object.fromEntries(roster.shifts.map(shift => [shift.id, shift.volunteerId])))
}

function caughtFailure(error: unknown): RosterFileFailure {
  return error instanceof SchemaError
    ? failure(error.path, error.message)
    : failure('file', 'The roster file could not be validated.')
}

/** Pure and atomic: either a newly constructed roster or an error, never a partial import. */
export function parseRosterFile(source: unknown): RosterImportResult {
  if (typeof source !== 'string') return failure('file', 'Expected JSON text.')
  // UTF-8 bytes are never fewer than UTF-16 code units, so this avoids an
  // unnecessary encoding allocation for obviously oversized input.
  if (source.length > MAX_ROSTER_FILE_BYTES) return failure('file', 'The file exceeds the 128 KiB UTF-8 size limit.')
  const byteLength = utf8Bytes(source)
  if (byteLength > MAX_ROSTER_FILE_BYTES) return failure('file', 'The file exceeds the 128 KiB UTF-8 size limit.')
  let json: unknown
  try { json = JSON.parse(source) as unknown } catch { return failure('file', 'Invalid JSON. Choose a version 1 RosterFair roster file.') }
  try {
    const envelope = readObject(json, 'file', ['format', 'version', 'roster'])
    if (envelope.format !== ROSTER_FILE_FORMAT) throw new SchemaError('file.format', 'Expected "rosterfair-roster".')
    if (envelope.version !== ROSTER_FILE_VERSION) throw new SchemaError('file.version', 'Unsupported version. Only version 1 is supported.')
    const roster = readRoster(envelope.roster)
    return { ok: true, roster, warnings: constraintWarnings(roster), byteLength }
  } catch (error) { return caughtFailure(error) }
}

/**
 * Export only the current roster. Runtime metadata is excluded explicitly;
 * nested roster fields remain strict and no contradiction is silently repaired.
 */
export function exportRosterFile(source: unknown): RosterExportResult {
  try {
    if (source === null || typeof source !== 'object' || Array.isArray(source)) throw new SchemaError('roster', 'Expected a roster object.')
    const sourceRecord = source as Record<string, unknown>
    const selected = Object.fromEntries(rosterKeys.map(key => [key, sourceRecord[key]]))
    const roster = readRoster(selected)
    const { id, title, date, volunteers, shifts, absences } = roster
    const envelope: RosterFileEnvelope = { format: ROSTER_FILE_FORMAT, version: ROSTER_FILE_VERSION, roster: { id, title, date, volunteers, shifts, absences } }
    let text = `${JSON.stringify(envelope, null, 2)}\n`
    let byteLength = utf8Bytes(text)
    // Indentation is optional; do not strand an accepted compact roster merely
    // because its human-readable presentation would cross the file-size cap.
    if (byteLength > MAX_ROSTER_FILE_BYTES) {
      text = JSON.stringify(envelope)
      byteLength = utf8Bytes(text)
    }
    if (byteLength > MAX_ROSTER_FILE_BYTES) return failure('file', 'The roster exceeds the 128 KiB UTF-8 size limit.')
    return { ok: true, text, fileName: `${id}-${date}.rosterfair.json`, byteLength, warnings: constraintWarnings(roster) }
  } catch (error) { return caughtFailure(error) }
}
