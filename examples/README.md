# Local roster files

`one-day-roster.json` is a fictional roster for an adult student makers club on November 14, 2026. It contains no real people's information. Load it to replace the working roster explicitly, or edit a copy in a text editor. Recording the welcome-desk cancellation creates the same inspectable two-person repair as the built-in example.

Files stay on your device. Import does not contact volunteers, publish a schedule, accept event terms, or upload anything. Export includes the current roster, including absences and pins. It omits undo history, revision numbers, computed repairs, browser state, and session metadata.

## Version 1 envelope

```json
{
  "format": "rosterfair-roster",
  "version": 1,
  "roster": {
    "id": "my-event",
    "title": "Student club volunteer day",
    "date": "2026-11-14",
    "volunteers": [
      {"id":"volunteer-a","name":"Synthetic Volunteer A","capabilities":["welcome"],"availability":[{"start":600,"end":720}],"preferredMinutes":120}
    ],
    "shifts": [
      {"id":"welcome","title":"Welcome desk","start":600,"end":720,"requires":["welcome"],"volunteerId":"volunteer-a","pinned":false}
    ],
    "absences": []
  }
}
```

All fields shown are required. Unknown properties are rejected at every level on import. Export selects only the six roster fields shown; unknown nested fields are rejected. Export reconstructs the nested objects from their validated fields. Import reconstructs the internal revision and does not trust a revision from a file.

| Object | Required fields |
| --- | --- |
| Volunteer | `id`, `name`, `capabilities` (string array), `availability` (time-range array), `preferredMinutes` |
| Shift | `id`, `title`, `start`, `end`, `requires` (string array), `volunteerId` (known volunteer ID or `null`), `pinned` (boolean) |
| Time range | `start`, `end` |
| Absence | `volunteerId` (known volunteer ID), `start`, `end`, `reason` |

Times and preferred workload are finite integer minutes from 0 through 1440 on the event date. Every time range must have `start < end`. For example, 10:00–12:00 is `{"start":600,"end":720}`. Intervals exclude their end, so adjacent shifts do not overlap. Preferred minutes are a soft workload preference, never permission to violate availability or another hard constraint. Availability may have up to six windows; overlapping or adjacent windows are treated as their union.

The date must be a real Gregorian `YYYY-MM-DD` date, with year 0001–9999. This format represents one local day. It has no timezone conversion or overnight-shift support.

## Exact limits

The whole JSON text may contain at most **131,072 UTF-8 bytes (128 KiB)**. Text length limits below count UTF-16 code units, as JavaScript does. Text must be non-empty, trimmed, and contain no C0/C1 control characters or bidirectional formatting controls (`U+061C`, `U+200E–U+200F`, `U+202A–U+202E`, `U+2066–U+2069`). Nothing is silently trimmed or renamed.

| Field or collection | Limit |
| --- | --- |
| Volunteers / shifts | 1–12 each |
| Availability windows per volunteer | 6 |
| Capabilities per volunteer / required capabilities per shift | 12 each |
| Absences | 144 |
| IDs | 1–48 characters; `[A-Za-z0-9][A-Za-z0-9_-]*` |
| Volunteer names / event and shift titles | 1–120 code units |
| Capability strings | 1–48 code units |
| Absence reasons | 1–160 code units |
| Preferred minutes | Integer 0–1440 |

Volunteer IDs must be unique within the volunteer collection; shift IDs must be unique within the shift collection. IDs matching an `Object.prototype` property name or `prototype`, ignoring case, are forbidden. References must match existing volunteer IDs exactly. Capability matching and duplicate detection are exact and case-sensitive. Duplicate capability entries are rejected. Empty capability lists are allowed; empty availability means the volunteer is unavailable for any shift.

## Drafts with unresolved constraints

Well-formed data can still describe an impossible schedule: a volunteer may be assigned outside availability, lack a required capability, have an overlapping absence, or be assigned to two overlapping pinned shifts. Such files are **drafts with warnings**, rather than corrupt files. They can be saved and loaded without losing the unresolved work. The preview lists warnings and requires explicit acknowledgement before loading a conflicting draft. Solving and applying a repair still enforce hard constraints; importing does not grant a bypass or silently change assignments or pins.

Malformed data, unknown volunteer references, duplicate IDs, unsupported versions, excess sizes, and unknown properties are rejected before the working roster changes. A confirmed successful import is one undoable edit: undo restores the previous event as well as its roster. Revisions increase internally so plans calculated before an import or undo cannot overwrite the new state. Up to 50 edits are retained during the current session; files do not contain that history.
