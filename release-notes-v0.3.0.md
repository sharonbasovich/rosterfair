# RosterFair v0.3.0

An organizer can now inspect a proposed repair in the roster itself before applying it. This release adds a focused interactive projection, without changing the solver or saved-file format.

- Compare options through a native selector beside the preview or the repair desk's radios. Selection stays synchronized.
- Inspect current and proposed assignees, role times, capabilities and stated availability. Follow existing roles to see who covers them in the proposal.
- Start with changed roles; turn off **Changes only** to include unchanged roles, preserved pins and unfilled slots. Counts distinguish existing assignments changed, gaps filled and slots unchanged.
- Distinguish **Still open** from **Becomes open** when a proposal vacates a currently assigned slot.
- Compare without changing assignments or undo history. Apply remains explicit; saved edits, confirmed imports, scenario changes and undo clear old previews.
- Use native keyboard controls, polite count announcements, mobile layouts and reduced-motion support. The narrow layout follows the DOM order: preview, repair desk, current roster.

There are no new application dependencies or external runtime services. The compiled ZIP runs with Node.js 22.14+ using `node server.mjs`; see [README.md](README.md). Manual version-1 JSON files remain the persistence mechanism.

The solver still supports at most 12 volunteers and 12 shifts, with a 200,000-node / 1.5-second search budget. Only a completed `optimal` search proves the defined ranking for that supplied instance. No objective social-fairness, organizer-validation or measured-impact claim is made. All verification uses synthetic data. Safari, Firefox, physical devices and screen readers remain untested. See [verification](VERIFICATION.md) for exact checks and their limits.

Version 0.2.0 remains available as a separate release.
