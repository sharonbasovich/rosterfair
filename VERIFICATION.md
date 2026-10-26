# RosterFair v0.2.0 verification

Checks completed October 26, 2026 against synthetic rosters and the compiled production build. These results describe finite tests of a local prototype, not a production reliability or accessibility certification.

## Results

| Check | Result |
| --- | --- |
| Domain and state suite | 35 tests passed, including 21 file/state regressions. |
| Independent solver oracle | 240 deterministic tiny fixtures compared against a separate exhaustive implementation; 14,359 complete assignments enumerated, including 69 partial optima and 10 conflicting-pin fixtures. |
| Production browser suite | 12 Chrome scenarios passed against `dist/`; no skipped, retried or flaky results in the final run. |
| Source lint | Passed. |
| TypeScript | Passed. |
| Production build | Passed. |

## Coverage

The domain suite checks capabilities, complete availability and interval unions, explicit absences, touching and overlapping shifts, pinned assignments and pinned vacancies, contradictory pins, impossible coverage, search budgets and stale or tampered plans. Repeated apply/undo/edit flows verify that undo and edits invalidate older repair previews.

File tests cover strict versioning and fields, IDs and references, text and collection limits, multibyte UTF-8 and the exact 131,072-byte boundary. They verify that files omit runtime metadata and that rejected imports or over-capacity saved edits leave the saved roster, history and revision unchanged. Drafts with hard-constraint conflicts retain their assignments and pins, with warnings.

Production browser checks cover:

- Cancellation, option comparison, explicit apply, undo and repeated repair flows.
- Impossible coverage and explicit resolution of contradictory pins.
- Invalid input, saved constraints, requirement edits and stale-preview clearing.
- An actual JSON download, closing the tab, opening a fresh tab and restoring assignments, preferences and absences from that file.
- Invalid JSON, unsupported versions, bad references, duplicate IDs, invalid times, oversize files and invalid UTF-8 without replacement or lost form drafts.
- Same-file selection, Escape cancellation, repeated imports, demo changes and matching undo context.
- A conflicting draft that requires acknowledgment, preserves pins, remains invalid to solve and can be exported with warnings.
- A canceled delayed file read whose late completion is ignored, an empty selection and a simulated read failure.
- Keyboard focus and complete forward/reverse dialog traversal, scrollable preview details, mobile touch targets and long imported display strings.
- Layouts at 320, 390, 768, 1024 and 1440 pixels, with reduced-motion emulation.

No external HTTP requests were observed in the tested download/reopen/import flow. Automated axe checks reported zero WCAG 2 A/AA and 2.1 AA violations in the tested final states. Mobile row actions and file/dialog controls met 44px touch targets. These findings do not establish behavior in every browser or with every assistive technology.

## Reproduce

Use Node.js 22.14 or newer (Node 24 in CI). A clean `npm ci` from the committed lockfile was verified before publication. Install the locked development dependencies, then run:

```text
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

For browser checks, Google Chrome must be installed. Start the compiled app in one terminal:

```text
node server.mjs
```

In a second terminal, set `ROSTERFAIR_TEST_URL` to `http://127.0.0.1:4173` and run `npm run test:browser`. For example, in PowerShell:

```powershell
$env:ROSTERFAIR_TEST_URL = 'http://127.0.0.1:4173'
npm run test:browser
```

The browser suite uses a temporary headless Chrome profile. Alternatively, run `npm run dev` and use the default test URL at port 5173. Dependency installation needs network access; running the compiled app and tests uses the local server. Stop the local server with Ctrl+C.

Relevant test sources are [solver.test.ts](tests/solver.test.ts), [oracle.ts](tests/oracle.ts), [state.test.ts](tests/state.test.ts), [rosterFile.test.ts](tests/rosterFile.test.ts), [browser.spec.ts](tests/browser.spec.ts) and [rosterFiles.browser.spec.ts](tests/rosterFiles.browser.spec.ts).

## Limits of the evidence

The independent oracle and edge cases do not cover every possible supported 12×12 roster or constitute a universal proof of correctness. A bounded search proves the best ranking only when its status is `optimal`; `limited` does not prove optimality or infeasibility.

Safari, Firefox, physical mobile devices and screen readers were not tested. There has been no real organizer study, evaluation with real volunteer data, production security audit or larger-scale reliability benchmark. Workload preference cost expresses a chosen policy and is not a measure of objective social fairness. No hosted deployment is included in this verification.
