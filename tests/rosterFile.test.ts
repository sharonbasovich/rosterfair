import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEMO_FIXTURES, applyRepair, applyRosterImport, cancelAssignment, createSession, solveRepairs, undoEdit, updateShift, updateVolunteer, type EditResult, type RosterSession } from '../src/domain/index'
import { MAX_ROSTER_FILE_BYTES, exportRosterFile, parseRosterFile } from '../src/domain/rosterFile'

/** An independently authored external document, not output of the codec. */
function fileDocument() {
  return {
    format: 'rosterfair-roster', version: 1,
    roster: {
      id: 'synthetic-club', title: 'Synthetic student club', date: '2026-11-07',
      volunteers: [
        { id: 'a', name: 'Volunteer A', capabilities: ['welcome', 'tech'], availability: [{ start: 0, end: 120 }], preferredMinutes: 60 },
        { id: 'b', name: 'Volunteer B', capabilities: ['welcome'], availability: [{ start: 0, end: 120 }], preferredMinutes: 60 },
      ],
      shifts: [
        { id: 'tech', title: 'Tech desk', start: 0, end: 60, requires: ['tech'], volunteerId: 'a', pinned: false },
        { id: 'welcome', title: 'Welcome desk', start: 0, end: 60, requires: ['welcome'], volunteerId: 'b', pinned: false },
      ],
      absences: [{ volunteerId: 'a', start: 60, end: 120, reason: 'Synthetic absence' }],
    },
  }
}

type FileDocument = ReturnType<typeof fileDocument>
type Path = (string | number)[]

function objectAt(source: unknown, path: Path): object {
  let current: unknown = source
  for (const key of path) {
    assert.ok(typeof current === 'object' && current !== null, `fixture path ${path.join('.')} must exist`)
    current = Reflect.get(current, String(key))
  }
  assert.ok(typeof current === 'object' && current !== null)
  return current
}

function set(source: unknown, path: Path, value: unknown): void {
  const key = path.at(-1)
  assert.notEqual(key, undefined)
  Reflect.set(objectAt(source, path.slice(0, -1)), String(key), value)
}

function remove(source: unknown, path: Path): void {
  Reflect.deleteProperty(objectAt(source, path.slice(0, -1)), String(path.at(-1)))
}

function success(result: EditResult): RosterSession {
  if (!result.ok) assert.fail(result.error)
  return result.session
}

function accepted(source: unknown) {
  const result = parseRosterFile(source)
  if (!result.ok) assert.fail(result.error)
  return result
}

function rejected(source: unknown, label: string): void {
  let result: ReturnType<typeof parseRosterFile> | undefined
  assert.doesNotThrow(() => { result = parseRosterFile(source) }, `${label}: malformed data must return an error, not throw`)
  assert.ok(result && !result.ok, `${label}: must be rejected`)
  assert.ok(result.error.trim().length > 0, `${label}: actionable error required`)
  assert.ok(Array.isArray(result.issues), `${label}: structured issues required`)
}

function rejectEdit(label: string, edit: (document: FileDocument) => void): void {
  const document = fileDocument()
  edit(document)
  rejected(JSON.stringify(document), label)
}

test('version 1 accepts an independently authored valid document and resets runtime revision', () => {
  const document = fileDocument()
  const source = JSON.stringify(document)
  const result = accepted(source)
  assert.deepEqual(result.roster, { ...document.roster, revision: 0 })
  assert.deepEqual(result.warnings, [])
  assert.equal(result.byteLength, Buffer.byteLength(source, 'utf8'))
  assert.deepEqual(document, fileDocument(), 'parsing must not mutate source data')
})

test('malformed JSON and non-string primitive/object inputs fail without throwing', () => {
  for (const [index, source] of [undefined, null, true, false, 0, 1, NaN, Infinity, {}, [], new String('{}'), '', ' ', '{', '{} trailing', '{"format":', '[1,2,]', 'NaN', 'Infinity', '-Infinity', 'null', 'true', '123', '"text"', '[]'].entries()) {
    rejected(source, `malformed source ${index}`)
  }
})

test('envelope identity, version, mandatory fields and object kinds are strict', () => {
  for (const version of [0, -1, 2, 1.5, '1', true, null, {}, []]) rejectEdit(`version ${JSON.stringify(version)}`, (document) => set(document, ['version'], version))
  for (const format of ['', 'rosterfair', 'RosterFair-roster', 1, null]) rejectEdit(`format ${JSON.stringify(format)}`, (document) => set(document, ['format'], format))
  const mandatory: Path[] = [
    ['format'], ['version'], ['roster'], ['roster', 'id'], ['roster', 'title'], ['roster', 'date'], ['roster', 'volunteers'], ['roster', 'shifts'], ['roster', 'absences'],
    ...['id', 'name', 'capabilities', 'availability', 'preferredMinutes'].map((key) => ['roster', 'volunteers', 0, key]),
    ...['start', 'end'].map((key) => ['roster', 'volunteers', 0, 'availability', 0, key]),
    ...['id', 'title', 'start', 'end', 'requires', 'volunteerId', 'pinned'].map((key) => ['roster', 'shifts', 0, key]),
    ...['volunteerId', 'start', 'end', 'reason'].map((key) => ['roster', 'absences', 0, key]),
  ]
  for (const path of mandatory) rejectEdit(`missing ${path.join('.')}`, (document) => remove(document, path))
  for (const path of [['roster'], ['roster', 'volunteers', 0], ['roster', 'shifts', 0], ['roster', 'absences', 0], ['roster', 'volunteers', 0, 'availability', 0]] satisfies Path[]) {
    for (const value of [null, [], 'wrong', 3, false]) rejectEdit(`object ${path.join('.')} as ${JSON.stringify(value)}`, (document) => set(document, path, value))
  }
})

test('unknown fields, including hostile object keys, are rejected at every object level', () => {
  const paths: Path[] = [[], ['roster'], ['roster', 'volunteers', 0], ['roster', 'volunteers', 0, 'availability', 0], ['roster', 'shifts', 0], ['roster', 'absences', 0]]
  for (const path of paths) {
    for (const key of ['unexpected', 'revision', '__proto__', 'constructor', 'prototype']) {
      rejectEdit(`${path.join('.')}.${key}`, (document) => {
        Object.defineProperty(objectAt(document, path), key, { enumerable: true, value: { polluted: true } })
      })
    }
  }
  assert.equal(Reflect.get(Object.prototype, 'polluted'), undefined)
})

test('IDs are bounded, unique per collection, ASCII-safe and cannot name prototype properties', () => {
  for (const id of ['', 'with space', ' slash/', '../path', '-leading', '_leading', 'é', 'a'.repeat(49), '__proto__', 'prototype', 'constructor', 'CONSTRUCTOR', 'toString', 'hasOwnProperty', '__defineGetter__', 'valueOf']) {
    for (const path of [['roster', 'id'], ['roster', 'volunteers', 0, 'id'], ['roster', 'shifts', 0, 'id']] satisfies Path[]) {
      rejectEdit(`${path.join('.')}=${id}`, (document) => set(document, path, id))
    }
  }
  rejectEdit('duplicate volunteer IDs', (document) => { document.roster.volunteers[1].id = 'a' })
  rejectEdit('duplicate shift IDs', (document) => { document.roster.shifts[1].id = 'tech' })
})

test('calendar dates are real Gregorian YYYY-MM-DD dates with bounded years', () => {
  for (const date of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '0000-01-01', '10000-01-01', '2026-1-01', '2026-01-1', '2026-11-07T00:00:00Z', ' 2026-11-07', '2026-11-07 ', 'not-a-date']) {
    rejectEdit(`date ${date}`, (document) => { document.roster.date = date })
  }
  for (const date of ['0001-01-01', '2024-02-29', '2000-02-29', '9999-12-31']) {
    const document = fileDocument()
    document.roster.date = date
    assert.equal(accepted(JSON.stringify(document)).roster.date, date)
  }
})

test('all interval values and workload preferences are finite bounded integers', () => {
  const rangePaths: Path[] = [['roster', 'shifts', 0], ['roster', 'volunteers', 0, 'availability', 0], ['roster', 'absences', 0]]
  for (const path of rangePaths) {
    for (const value of [-1, 0.5, 1441, '0', true, null, {}, []]) {
      for (const field of ['start', 'end']) rejectEdit(`${path.join('.')}.${field}=${JSON.stringify(value)}`, (document) => set(document, [...path, field], value))
    }
    for (const [start, end] of [[60, 60], [61, 60], [1440, 1440]]) {
      rejectEdit(`empty/reversed interval ${path.join('.')}`, (document) => { set(document, [...path, 'start'], start); set(document, [...path, 'end'], end) })
    }
  }
  for (const value of [-1, 0.5, 1441, '60', true, null, {}, []]) rejectEdit(`workload ${JSON.stringify(value)}`, (document) => set(document, ['roster', 'volunteers', 0, 'preferredMinutes'], value))
  for (const token of ['NaN', 'Infinity', '-Infinity', '1e400', '-1e400']) {
    const source = JSON.stringify(fileDocument()).replace('"preferredMinutes":60', `"preferredMinutes":${token}`)
    rejected(source, `nonfinite workload ${token}`)
  }
  const boundary = fileDocument()
  boundary.roster.volunteers[0].availability = [{ start: 0, end: 1440 }]
  boundary.roster.volunteers[0].preferredMinutes = 1440
  assert.equal(accepted(JSON.stringify(boundary)).roster.volunteers[0].preferredMinutes, 1440)
})

test('array kinds, maximum counts and capability strings are bounded without coercion', () => {
  const arrays: Path[] = [['roster', 'volunteers'], ['roster', 'shifts'], ['roster', 'absences'], ['roster', 'volunteers', 0, 'availability'], ['roster', 'volunteers', 0, 'capabilities'], ['roster', 'shifts', 0, 'requires']]
  for (const path of arrays) for (const value of [null, {}, '[]', 0, false]) rejectEdit(`array ${path.join('.')} as ${JSON.stringify(value)}`, (document) => set(document, path, value))
  rejectEdit('zero volunteers', (document) => { document.roster.volunteers = [] })
  rejectEdit('zero slots', (document) => { document.roster.shifts = [] })
  rejectEdit('13 volunteers', (document) => {
    document.roster.volunteers.push(...Array.from({ length: 11 }, (_, index) => ({ ...structuredClone(document.roster.volunteers[0]), id: `v${index}` })))
  })
  rejectEdit('13 slots', (document) => {
    document.roster.shifts.push(...Array.from({ length: 11 }, (_, index) => ({ ...structuredClone(document.roster.shifts[0]), id: `s${index}` })))
  })
  rejectEdit('7 availability windows', (document) => { document.roster.volunteers[0].availability = Array.from({ length: 7 }, () => ({ start: 0, end: 120 })) })
  rejectEdit('13 volunteer capabilities', (document) => { document.roster.volunteers[0].capabilities = ['tech', 'welcome', ...Array.from({ length: 11 }, (_, index) => `skill${index}`)] })
  rejectEdit('13 slot requirements', (document) => { document.roster.shifts[0].requires = Array.from({ length: 13 }, (_, index) => `skill${index}`) })
  rejectEdit('145 absences', (document) => { document.roster.absences = Array.from({ length: 145 }, () => ({ volunteerId: 'a', start: 60, end: 120, reason: 'Synthetic absence' })) })
  for (const path of [['roster', 'volunteers', 0, 'capabilities'], ['roster', 'shifts', 0, 'requires']] satisfies Path[]) {
    for (const value of [[''], [' skill'], ['skill '], ['x'.repeat(49)], ['same', 'same'], [1], [true], [null], [{}], ['bad\u0000cap'], ['bad\u0085cap']]) {
      rejectEdit(`capability strings ${JSON.stringify(value)}`, (document) => set(document, path, value))
    }
  }
})

test('document and string count limits accept their stated maxima', () => {
  const document = fileDocument()
  document.roster.title = 'x'.repeat(120)
  document.roster.volunteers[0].name = 'x'.repeat(120)
  document.roster.volunteers[0].capabilities = ['welcome', 'tech', ...Array.from({ length: 10 }, (_, index) => `skill${index}`)]
  document.roster.volunteers[0].availability = Array.from({ length: 6 }, () => ({ start: 0, end: 120 }))
  document.roster.volunteers.push(...Array.from({ length: 10 }, (_, index) => ({ ...structuredClone(document.roster.volunteers[0]), id: `v${index}` })))
  document.roster.shifts[0].requires = Array.from({ length: 12 }, (_, index) => `cap${index}`)
  document.roster.shifts.push(...Array.from({ length: 10 }, (_, index) => ({ ...structuredClone(document.roster.shifts[0]), id: `s${index}` })))
  document.roster.absences = Array.from({ length: 144 }, () => ({ volunteerId: 'a', start: 60, end: 120, reason: 'x'.repeat(160) }))
  const parsed = accepted(JSON.stringify(document))
  assert.equal(parsed.roster.volunteers.length, 12)
  assert.equal(parsed.roster.shifts.length, 12)
  assert.equal(parsed.roster.absences.length, 144)
  const capabilityBoundary = fileDocument()
  capabilityBoundary.roster.volunteers[0].capabilities.push('x'.repeat(48), 'WELCOME')
  assert.ok(accepted(JSON.stringify(capabilityBoundary)).roster.volunteers[0].capabilities.includes('x'.repeat(48)))
})

test('display strings are trim-stable, bounded and free of control characters', () => {
  const fields: { path: Path; max: number }[] = [
    { path: ['roster', 'title'], max: 120 }, { path: ['roster', 'volunteers', 0, 'name'], max: 120 },
    { path: ['roster', 'shifts', 0, 'title'], max: 120 }, { path: ['roster', 'absences', 0, 'reason'], max: 160 },
  ]
  for (const { path, max } of fields) {
    for (const value of ['', ' ', ' Leading', 'Trailing ', 'bad\u0000text', 'bad\ntext', 'bad\u007ftext', 'bad\u0085text', 'bad\u061ctext', 'bad\u200etext', 'bad\u202etext', 'bad\u2069text', 'x'.repeat(max + 1), null, 9, true, []]) {
      rejectEdit(`string ${path.join('.')} as ${JSON.stringify(value)}`, (document) => set(document, path, value))
    }
  }
})

test('assignment and absence references must exist, while boolean pins remain strict', () => {
  for (const value of ['missing', '', '__proto__', 0, false, {}, []]) rejectEdit(`assignment ${JSON.stringify(value)}`, (document) => set(document, ['roster', 'shifts', 0, 'volunteerId'], value))
  for (const value of ['missing', '', '__proto__', null, 0, false, {}, []]) rejectEdit(`absence reference ${JSON.stringify(value)}`, (document) => set(document, ['roster', 'absences', 0, 'volunteerId'], value))
  for (const value of [0, 1, 'false', 'true', null, {}, []]) rejectEdit(`pin ${JSON.stringify(value)}`, (document) => set(document, ['roster', 'shifts', 0, 'pinned'], value))
  const open = fileDocument()
  set(open, ['roster', 'shifts', 0, 'volunteerId'], null)
  open.roster.shifts[0].pinned = true
  assert.equal(accepted(JSON.stringify(open)).roster.shifts[0].volunteerId, null)
})

test('raw UTF-8 byte cap accepts its exact boundary and rejects one byte more', () => {
  const document = fileDocument()
  document.roster.volunteers[0].name = 'É'.repeat(60)
  const source = JSON.stringify(document)
  const padding = MAX_ROSTER_FILE_BYTES - Buffer.byteLength(source, 'utf8')
  assert.ok(padding > 0)
  const exact = source + ' '.repeat(padding)
  assert.equal(Buffer.byteLength(exact, 'utf8'), MAX_ROSTER_FILE_BYTES)
  assert.equal(accepted(exact).byteLength, MAX_ROSTER_FILE_BYTES)
  rejected(exact + ' ', 'one byte above maximum')
  rejected(' '.repeat(MAX_ROSTER_FILE_BYTES + 1), 'oversized whitespace input')
})

test('dense structured Unicode documents near and at the byte cap can be exported and reimported losslessly', (context) => {
  const glyph = '\u754c'
  const capabilities = Array.from({ length: 12 }, (_, index) => glyph.repeat(45) + index)
  const document = fileDocument()
  document.roster.volunteers = Array.from({ length: 12 }, (_, index) => ({
    id: `v${index}`, name: glyph.repeat(120), capabilities: [...capabilities],
    availability: Array.from({ length: 6 }, () => ({ start: 0, end: 120 })), preferredMinutes: 60,
  }))
  document.roster.shifts = Array.from({ length: 12 }, (_, index) => ({
    id: `s${index}`, title: glyph.repeat(120), start: 0, end: 60,
    requires: [...capabilities], volunteerId: `v${index}`, pinned: false,
  }))
  document.roster.absences = Array.from({ length: 144 }, () => ({ volunteerId: 'v0', start: 60, end: 120, reason: glyph.repeat(159) }))
  const nearSource = JSON.stringify(document)
  const nearBytes = Buffer.byteLength(nearSource, 'utf8')
  assert.ok(nearBytes >= 125 * 1024 && nearBytes < MAX_ROSTER_FILE_BYTES)
  assert.ok(Buffer.byteLength(JSON.stringify(document, null, 2) + '\n', 'utf8') > MAX_ROSTER_FILE_BYTES, 'fixture must exercise pretty-format expansion')

  function roundTrip(source: string, expected: FileDocument): void {
    const parsed = accepted(source)
    const exported = exportRosterFile(parsed.roster)
    if (!exported.ok) assert.fail(exported.error)
    assert.ok(exported.byteLength <= MAX_ROSTER_FILE_BYTES)
    assert.equal(exported.byteLength, Buffer.byteLength(exported.text, 'utf8'))
    assert.deepEqual(accepted(exported.text).roster, { ...expected.roster, revision: 0 })
    assert.deepEqual(parsed.roster, { ...expected.roster, revision: 0 }, 'export must not modify the accepted roster')
  }
  roundTrip(nearSource, document)

  // Fill only declared, bounded string fields. Each appended character adds
  // exactly its UTF-8 width; no whitespace padding or unknown fields are used.
  let remaining = MAX_ROSTER_FILE_BYTES - nearBytes
  function grow(value: string, maximum: number): string {
    while (remaining > 0 && value.length < maximum) {
      const character = remaining >= 3 ? glyph : remaining === 2 ? '\u00e9' : 'a'
      value += character
      remaining -= Buffer.byteLength(character, 'utf8')
    }
    return value
  }
  for (const volunteer of document.roster.volunteers) volunteer.capabilities = volunteer.capabilities.map((capability) => grow(capability, 48))
  for (const shift of document.roster.shifts) shift.requires = shift.requires.map((capability) => grow(capability, 48))
  for (const absence of document.roster.absences) absence.reason = grow(absence.reason, 160)
  document.roster.title = grow(document.roster.title, 120)
  assert.equal(remaining, 0, 'fixture must contain enough valid string capacity to reach the exact cap')
  const exactSource = JSON.stringify(document)
  assert.equal(Buffer.byteLength(exactSource, 'utf8'), MAX_ROSTER_FILE_BYTES)
  roundTrip(exactSource, document)
  context.diagnostic(`Structured compact Unicode round trips: ${nearBytes} bytes and exactly ${MAX_ROSTER_FILE_BYTES} bytes.`)
})

test('exports round-trip all synthetic fixtures, absences and contradictory drafts without internal metadata', () => {
  for (const fixture of DEMO_FIXTURES) {
    const snapshot = structuredClone(fixture.roster)
    const runtime = { ...snapshot, revision: 987654, history: [snapshot], solverResult: { privateRuntimeMarker: true }, selectedPlan: 'runtime-only' }
    const exported = exportRosterFile(runtime)
    if (!exported.ok) assert.fail(exported.error)
    assert.equal(exported.byteLength, Buffer.byteLength(exported.text, 'utf8'))
    assert.ok(exported.fileName.endsWith('.json'))
    assert.ok(!exported.fileName.includes('/') && !exported.fileName.includes('\\'))
    assert.ok(!Array.from(exported.fileName).some((character) => character.charCodeAt(0) <= 31))
    const envelope = JSON.parse(exported.text) as Record<string, unknown>
    assert.deepEqual(Object.keys(envelope).sort(), ['format', 'roster', 'version'])
    assert.equal(envelope.format, 'rosterfair-roster')
    assert.equal(envelope.version, 1)
    assert.deepEqual(Object.keys(envelope.roster as object).sort(), ['absences', 'date', 'id', 'shifts', 'title', 'volunteers'])
    for (const marker of ['revision', 'history', 'solverResult', 'privateRuntimeMarker', 'selectedPlan']) assert.ok(!exported.text.includes(`"${marker}"`), `runtime field ${marker} must not be exported`)
    const parsed = accepted(exported.text)
    assert.deepEqual(parsed.roster, { ...fixture.roster, revision: 0 })
    assert.deepEqual(fixture.roster, snapshot)
    if (fixture.id === 'pin-conflict') {
      assert.ok(parsed.warnings.some((warning) => warning.code === 'overlap'))
      assert.equal(solveRepairs(parsed.roster).status, 'invalid', 'import preserves contradictory pins as a warned draft')
    }
  }
  const document = fileDocument()
  const imported = accepted(JSON.stringify(document))
  const exported = exportRosterFile(imported.roster)
  if (!exported.ok) assert.fail(exported.error)
  assert.deepEqual(accepted(exported.text).roster.absences, document.roster.absences)
})

test('schema-valid capability, availability, absence and overlap contradictions remain warned drafts', () => {
  const edits: { label: string; code: string; change: (document: FileDocument) => void }[] = [
    { label: 'capability', code: 'capability', change: (document) => { document.roster.shifts[0].requires = ['missing-skill'] } },
    { label: 'availability', code: 'availability', change: (document) => { document.roster.volunteers[0].availability = [] } },
    { label: 'absence', code: 'absence', change: (document) => { document.roster.absences[0].start = 0 } },
    { label: 'overlap', code: 'overlap', change: (document) => { document.roster.shifts[1].volunteerId = 'a' } },
  ]
  for (const { label, code, change } of edits) {
    const document = fileDocument()
    change(document)
    const parsed = accepted(JSON.stringify(document))
    assert.deepEqual(parsed.roster, { ...document.roster, revision: 0 }, `${label}: no silent repair at import`)
    assert.ok(parsed.warnings.some((warning) => warning.code === code), `${label}: contradiction warning required`)
  }
})

test('exports reject invalid selected state without throwing instead of silently dropping bad data', () => {
  for (const source of [undefined, null, true, 1, [], {}, { roster: {} }]) {
    let result: ReturnType<typeof exportRosterFile> | undefined
    assert.doesNotThrow(() => { result = exportRosterFile(source) })
    assert.ok(result && !result.ok)
  }
  const invalid = accepted(JSON.stringify(fileDocument())).roster
  invalid.shifts[0].end = Infinity
  assert.equal(exportRosterFile(invalid).ok, false)
  for (const path of [['volunteers', 0], ['volunteers', 0, 'availability', 0], ['shifts', 0], ['absences', 0]] satisfies Path[]) {
    const nestedMetadata = accepted(JSON.stringify(fileDocument())).roster
    Reflect.set(objectAt(nestedMetadata, path), 'unexpected', 'not part of the file schema')
    assert.equal(exportRosterFile(nestedMetadata).ok, false, 'nested unknown properties are rejected under the strict export policy')
  }
  for (const path of [['volunteers', 0, 'capabilities'], ['volunteers', 0, 'availability'], ['shifts', 0, 'requires']] satisfies Path[]) {
    const sparseState = accepted(JSON.stringify(fileDocument())).roster
    set(sparseState, path, new Array(1))
    assert.equal(exportRosterFile(sparseState).ok, false, 'sparse JavaScript arrays must not become null entries in an exported file')
  }
})

test('rejected imports preserve roster, history, revision and existing plan applicability', () => {
  let session = createSession(DEMO_FIXTURES[0].roster)
  session = success(cancelAssignment(session, DEMO_FIXTURES[0].cancelShiftId))
  session = success(updateVolunteer(session, session.roster.volunteers[0].id, { preferredMinutes: 60 }))
  const before = structuredClone(session)
  const plan = solveRepairs(session.roster).options[0]
  for (const source of ['{', JSON.stringify({ ...fileDocument(), version: 2 }), '{}', null, ' '.repeat(MAX_ROSTER_FILE_BYTES + 1)]) {
    const result = applyRosterImport(session, source)
    assert.equal(result.ok, false)
    assert.deepEqual(session, before, 'a failed import must not clear undo history or advance revision')
    assert.equal(applyRepair(session, plan).ok, true, 'failed import cannot invalidate an existing preview')
  }
})

test('successful import is an undoable atomic change and invalidates pre-import previews', () => {
  let session = success(cancelAssignment(createSession(DEMO_FIXTURES[0].roster), DEMO_FIXTURES[0].cancelShiftId))
  const before = structuredClone(session)
  const preview = solveRepairs(session.roster).options[0]
  session = success(applyRosterImport(session, JSON.stringify(fileDocument())))
  assert.equal(session.roster.revision, before.roster.revision + 1)
  assert.equal(session.history.length, before.history.length + 1)
  assert.deepEqual({ ...session.roster, revision: 0 }, { ...fileDocument().roster, revision: 0 })
  assert.equal(applyRepair(session, preview).ok, false)
  session = success(undoEdit(session))
  assert.deepEqual({ ...session.roster, revision: before.roster.revision }, before.roster)
  assert.deepEqual(session.history, before.history)
  assert.equal(applyRepair(session, preview).ok, false, 'undo does not reactivate an old preview')
})

test('repeated import, cancel and undo flows keep absences scoped and revisions monotonic', () => {
  let session = createSession(DEMO_FIXTURES[0].roster)
  const source = JSON.stringify(fileDocument())
  for (let iteration = 0; iteration < 12; iteration++) {
    const before = structuredClone(session)
    session = success(applyRosterImport(session, source))
    const imported = structuredClone(session)
    session = success(cancelAssignment(session, 'tech'))
    assert.equal(session.roster.absences.length, 2)
    assert.equal(session.roster.shifts[0].volunteerId, null)
    session = success(undoEdit(session))
    assert.deepEqual({ ...session.roster, revision: imported.roster.revision }, imported.roster)
    session = success(undoEdit(session))
    assert.deepEqual({ ...session.roster, revision: before.roster.revision }, before.roster)
    assert.deepEqual(session.history, before.history)
    assert.equal(session.roster.revision, before.roster.revision + 4)
  }
})

test('ordinary edits cannot exceed file bounds and rejected edits preserve history and previews', () => {
  const document = fileDocument()
  document.roster.absences = Array.from({ length: 144 }, () => ({ volunteerId: 'a', start: 60, end: 120, reason: 'Synthetic absence' }))
  let session = success(applyRosterImport(createSession(DEMO_FIXTURES[0].roster), JSON.stringify(document)))
  session = success(updateVolunteer(session, 'a', { preferredMinutes: 30 }))
  const before = structuredClone(session)
  const preview = solveRepairs(session.roster).options[0]
  const edits: { label: string; run: () => EditResult }[] = [
    { label: '145th absence from cancellation', run: () => cancelAssignment(session, 'tech') },
    { label: '13 capabilities', run: () => updateVolunteer(session, 'a', { capabilities: ['welcome', 'tech', ...Array.from({ length: 11 }, (_, index) => `skill${index}`)] }) },
    { label: '13 requirements', run: () => updateShift(session, 'tech', { requires: Array.from({ length: 13 }, (_, index) => `skill${index}`) }) },
    { label: '7 availability windows', run: () => updateVolunteer(session, 'a', { availability: Array.from({ length: 7 }, () => ({ start: 0, end: 120 })) }) },
    { label: 'overlong name', run: () => updateVolunteer(session, 'a', { name: 'x'.repeat(121) }) },
    { label: 'overlong title', run: () => updateShift(session, 'tech', { title: 'x'.repeat(121) }) },
    { label: 'out-of-range workload preference', run: () => updateVolunteer(session, 'a', { preferredMinutes: 1441 }) },
  ]
  for (const { label, run } of edits) {
    assert.equal(run().ok, false, label)
    assert.deepEqual(session, before, `${label}: rejected edit must preserve roster, revision and history`)
    assert.equal(applyRepair(session, preview).ok, true, `${label}: existing preview remains applicable`)
  }
})

test('ordinary edits may preserve schema-valid contradictions as warned drafts', () => {
  let session = success(applyRosterImport(createSession(DEMO_FIXTURES[0].roster), JSON.stringify(fileDocument())))
  const revision = session.roster.revision
  session = success(updateVolunteer(session, 'a', { availability: [] }))
  session = success(updateShift(session, 'welcome', { volunteerId: 'a', pinned: true }))
  session = success(updateShift(session, 'tech', { pinned: true }))
  assert.equal(session.roster.revision, revision + 3)
  const exported = exportRosterFile(session.roster)
  if (!exported.ok) assert.fail(exported.error)
  assert.ok(exported.warnings.some((warning) => warning.code === 'availability'))
  assert.ok(exported.warnings.some((warning) => warning.code === 'overlap'))
  assert.equal(solveRepairs(accepted(exported.text).roster).status, 'invalid', 'contradictory pins remain explicit; no constraint is silently relaxed')
})
