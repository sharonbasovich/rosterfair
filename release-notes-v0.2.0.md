# RosterFair v0.2.0

Released October 26, 2026. A local volunteer-shift repair prototype for adult student clubs, with source and a compiled ZIP. No hosted app or account is required.

## Changes

- Explicit JSON export and import for the saved event, volunteer inputs, assignments, pins and absences.
- A preview before replacement, initial Cancel focus, Escape cancellation, scrollable details and keyboard-contained confirmation.
- Strict version 1 files with a 128 KiB cap, bounded collections and validated IDs, references, dates and times.
- Warnings and a separate acknowledgment before importing a draft with unresolved hard constraints; pins remain intact.
- Undo across imports and demo changes, restoring both saved roster data and event context.
- Atomic save-capacity checks, compact export when indentation would exceed the byte cap, canceled-read guards and same-file reselection.
- Responsive, reduced-motion and accessibility refinements for the file workflow and repair results.

The repair policy remains explicit: maximize covered slots, then minimize changes to existing commitments, then minimize squared minutes over stated workload preferences. One-day solving supports at most 12 volunteers and 12 shifts with a 200,000-node / 1.5-second budget. Only `optimal` proves the best ranking; `limited` reports a bounded result without an optimality or infeasibility claim. Contradictory pins are reported rather than relaxed.

## Run

Extract the compiled ZIP and run `node server.mjs` with Node.js 22 or newer. Open **http://127.0.0.1:4173/**. The included build requires no npm installation or external runtime network connection. A source checkout needs `npm ci` and `npm run build` first. See [README.md](README.md).

## Verification

The final release checks passed: **35 domain/state tests**, **12 production Chrome browser scenarios**, lint, TypeScript and build. Tests include an independent tiny-instance oracle, rejected-file atomicity, cross-tab file restoration, draft acknowledgment, keyboard focus, responsive layouts, reduced motion and automated accessibility. See [VERIFICATION.md](VERIFICATION.md) for scope, commands and unverified environments.

## Save and privacy notes

JSON is manual save/restore, not automatic persistence. Save open volunteer forms before export; role requirements update immediately. Files exclude unsaved form input, repair previews, undo history and session metadata. Confirming import discards unsaved form drafts. Undo history is limited to 50 snapshots in the current session and is not restored from a file.

The app does not upload files or send messages. Exported files can contain names, availability and capabilities, so share them carefully. Built-in examples and tests are synthetic. Applying a roster repair does not obtain volunteer agreement.

This is a prototype without real organizer research, real-data evaluation or measured impact. Safari, Firefox, physical devices and screen readers remain untested. Workload ranking is an explicit preference policy, not a universal fairness claim. The original application code is MIT-licensed by Sharon Basovich; dependency licenses and AI assistance are documented in [THIRD-PARTY.md](THIRD-PARTY.md).
