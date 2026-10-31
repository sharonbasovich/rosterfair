# RosterFair

Repair a volunteer roster after a cancellation, with changes an organizer can inspect before applying.

RosterFair is a small local workbench for adult student clubs. It checks explicit capabilities and availability, considers reassignment chains when a direct replacement fails, and compares coverage, disruption and stated workload preferences. The organizer chooses whether to apply a proposal and can undo it.

Version **0.3.0** adds an interactive before/after roster preview to the manual JSON save and restore workflow. The original application code is free to use under the [MIT license](LICENSE). Dependencies retain their own licenses; see [attribution](THIRD-PARTY.md) and [runtime notices](THIRD_PARTY_NOTICES.txt).

## Browser demo

[Try RosterFair in your browser](https://sharonbasovich.github.io/rosterfair/).

The static browser build runs the same repair engine and synthetic examples without installing Node.js. It does not require an account. The downloadable local version remains available and unchanged.

The hosting service receives ordinary requests for the page, JavaScript, styles and worker. Roster edits and repair calculations happen in browser memory; the app has no upload API, analytics or remote storage. Dedicated Chromium tests observe same-origin static GET requests only during cancellation, comparison, apply, undo and edits. Reloading resets the unsaved roster. Use synthetic data for a public demo; use the downloadable local version when offline operation matters.

To reproduce the project-prefix build and browser checks:

```text
npm ci
npm run build:hosted
node scripts/serve-hosted.mjs
# In another terminal:
npm run test:hosted
```

Open **http://127.0.0.1:4174/rosterfair/**. Publish the **contents** of `hosted-site/rosterfair/` at the GitHub Pages project prefix `/rosterfair/`; do not publish its parent directory at that prefix. The build includes application and third-party notices.

## Run locally

Use **Node.js 22.14 or newer** and a modern browser. The CI workflow targets Node 24. No account is required.

For the compiled release ZIP:

1. Extract the whole ZIP into a folder.
2. Run `node server.mjs` from that folder. On Windows, you can also double-click `Start-RosterFair.cmd`.
3. Open **http://127.0.0.1:4173/**. Stop the server with Ctrl+C.

The ZIP includes `dist/`, so running it needs no npm installation or external network connection. The server binds to this computer only. Set the `ROSTERFAIR_PORT` environment variable to another port from 1024 through 65535 if 4173 is occupied. Opening `dist/index.html` directly does not support the module worker; use the local server.

For a source checkout, build first:

```text
npm ci
npm run build
node server.mjs
```

Dependency installation requires network access. The built app makes no external runtime network requests and does not upload roster files. Rebuild after source changes: `server.mjs` serves the existing `dist/`, not live source files. For development, `npm run dev` serves **http://127.0.0.1:5173/**.

## Try the repair workflow

1. In **Two-person repair**, review the current roster and its pinned photography assignment.
2. Select **Record demo cancellation**. The welcome slot opens and the canceled volunteer is unavailable for that time window.
3. Select **Find feasible repairs**. A direct replacement cannot cover the gap without another change. Option A moves Eli from tools to welcome and Bea into tools. Option B moves Noor from repair to welcome and Alex into repair.
4. Use **Compare repair** in the preview or the option radios at the repair desk. Both controls select the same proposal. The preview starts with **Changes only** enabled; turn it off to inspect every role, including preserved pins and gaps. Open a role to inspect its requirements, stated availability and the proposed assignees of the volunteer's current roles. Both A and B cover all five slots and move one existing assignment; their soft preference costs differ.
5. Explicitly apply an option. **Undo last change** restores the previous roster. Searching or selecting an option alone never changes assignments.

Try **No complete repair** to see a proven coverage shortfall, or **Contradictory pins** to see a fixed-assignment conflict. The app does not silently relax a pin. Volunteer inputs and role requirements can be edited; saved changes invalidate old repair proposals.

**Preview only** and **Not applied** distinguish a proposal from the current roster below it. Timeline bars show role times, not volunteer availability. A gap left open says **Still open**; a currently assigned slot that a proposal empties says **Becomes open**. The current roster and undo history do not change while comparing or inspecting. On small screens, the preview and repair desk appear together before the saved roster, in the same order as keyboard navigation.

## Ranking and hard constraints

The solver uses this ordered objective:

1. Cover as many slots as possible.
2. Change as few previously occupied slots as possible. Filling an open slot does not count as disruption.
3. Minimize the sum of squared minutes above each volunteer's stated preferred workload.

Availability, capabilities, absences, non-overlap and pins are hard constraints. Preferred workload is soft and may be exceeded. This is an explicit workload policy, not a claim of objective social fairness. The app does not infer sensitive traits, obtain volunteer agreement or notify anyone.

Bounded exact backtracking runs in a Web Worker for one event-local day, with at most **12 volunteers and 12 shifts**. The UI search budget is **200,000 nodes or 1.5 seconds**. Results state their limits:

| Status | Meaning |
| --- | --- |
| `optimal` | Search completed and the best ranking is proven for the supplied roster and constraints. A partial result proves the maximum achievable coverage for that instance. |
| `limited` | The budget was reached. Feasible options found so far may be shown, but optimality or impossibility is not claimed. |
| `invalid` | Malformed data or contradictory fixed assignments prevent a valid search. Resolve the stated conflict explicitly. |

The app offers up to four repair options. Apply rechecks the constraints and rejects proposals calculated before a roster edit or undo. Times use same-day half-open intervals `[start, end)`: touching shifts do not overlap, and adjacent availability windows can jointly cover a shift.

## Keep a roster between visits

The working roster lives in memory. There is **no automatic persistence**: refreshing or reopening starts a demo.

Save open volunteer forms, then select **Export roster JSON**. Role requirements update immediately. Export includes the saved event, volunteer inputs, shifts, assignments, pins and absences. It excludes unsaved form input, repair previews, undo history and session metadata.

On a later visit, choose the JSON file and review its preview. **Cancel** or Escape keeps the current roster. **Import roster** replaces it and discards unsaved form inputs. Undo can restore the previous saved roster and event context across imports and demo changes, within the current session's **50-snapshot** history. That history is not stored in files.

The format is strict version 1 JSON, capped at **131,072 UTF-8 bytes (128 KiB)**. Unknown properties, invalid references, unsupported versions and malformed data are rejected without changing the saved roster or undo history. Valid drafts with unresolved hard constraints show warnings and require explicit acknowledgment before import. Their assignments and pins are preserved; acknowledgment does not bypass constraints. Saved edits also pass the file-capacity checks, and export never truncates data to fit.

Start with the [synthetic example](examples/one-day-roster.json) and read the [file format and complete limits](examples/README.md). Built-in examples and tests use synthetic information. Imported files and exports may contain names, availability and capabilities; share copies carefully. The app reads and prepares files on the device without uploading them.

## Verification

Version 0.3.0 passed **35 domain/state tests**, **21 production Chrome browser tests**, lint, TypeScript checks and the production build. Coverage includes an independent tiny-instance oracle, impossible and conflicting schedules, repeated apply/undo flows, file round trips after closing a tab, rejection atomicity, keyboard focus, responsive layouts, reduced motion and automated accessibility checks. See [VERIFICATION.md](VERIFICATION.md) for reproduction commands and limits.

## Scope and attribution

This prototype supports a single local day. It has no multiuser collaboration, notifications, timezone conversion, overnight shifts, travel/rest rules or qualification expiry. It is not designed for employment, emergency or medical staffing. No real organizer study, real volunteer-data evaluation or measured social-impact claim has been made. Safari, Firefox, physical devices and screen readers remain untested; automated checks are not accessibility certification.

Original source, synthetic fixtures and custom icons were created by **Sharon Basovich with Codex AI assistance on October 25-27, 2026**. AI assistance included design, implementation and verification; Claude through Kiro provided bounded static review for v0.3.0. See [THIRD-PARTY.md](THIRD-PARTY.md) for dependency attribution and [release notes](release-notes-v0.3.0.md) for this version.

