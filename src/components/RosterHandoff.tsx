import { useId, useState } from 'react';
import type { Roster, Shift } from '../domain';
import { validateAssignments } from '../domain';
import { person, time } from '../format';
import './RosterHandoff.css';

/** Read-only view of saved data. Never accepts a RepairOption or form draft. */
export function RosterHandoff({ roster, hasPendingEdits }: { roster: Roster; hasPendingEdits: boolean }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [printError, setPrintError] = useState(false);
  const shifts = [...roster.shifts].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const unfilled = shifts.filter(shift => shift.volunteerId === null);
  const assigned = shifts.filter(shift => shift.volunteerId !== null);
  const issues = validateAssignments(roster, Object.fromEntries(shifts.map(shift => [shift.id, shift.volunteerId])));
  const conflicted = new Set(issues.flatMap(issue => issue.shiftIds));
  function print() {
    setPrintError(false);
    try { window.print(); } catch { setPrintError(true); }
  }
  function rows(items: Shift[]) {
    return items.map(shift => <tr key={shift.id}>
      <td className="handoff-time">{time(shift.start)}–{time(shift.end)}</td>
      <th scope="row">{shift.title}<small>Role ID: {shift.id}</small></th>
      <td>{shift.volunteerId === null ? <strong>UNFILLED</strong> : <>{person(roster, shift.volunteerId)}<small>Volunteer ID: {shift.volunteerId}</small></>}</td>
      <td>{conflicted.has(shift.id) ? <strong>Needs review</strong> : '—'}{shift.pinned && <small>Pinned{shift.volunteerId === null ? ' open' : ''}</small>}</td>
    </tr>);
  }
  return <section className="roster-handoff" aria-labelledby={`${id}-heading`}>
    <div className="handoff-controls">
      <div><h2 id={`${id}-heading`}>Take the roster with you</h2><p>A readable one-day handoff from saved assignments in this tab.</p></div>
      <button type="button" className="secondary" aria-expanded={expanded} aria-controls={`${id}-sheet`} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide printable roster' : 'Review printable roster'}</button>
      <p>Review before printing or saving a PDF. Names and role assignments are included; personal availability, capabilities and absence reasons are omitted. Choose the destination carefully in your browser.</p>
      {expanded && <div className="handoff-actions"><button type="button" className="secondary" onClick={print}>Print saved roster</button><span>Printing does not save an editable roster. Use Export roster JSON to keep working later.</span></div>}
      {printError && <p role="alert">The browser could not open printing. Use its Print command or try again. Your roster has not changed.</p>}
    </div>
    <article id={`${id}-sheet`} className={`handoff-sheet${expanded ? ' is-expanded' : ''}`} aria-label="Printable saved roster">
      <header><p className="handoff-eyebrow">RosterFair · One-day handoff</p><h2>{roster.title}</h2><p><strong>{roster.date}</strong> · All times are event-local (24-hour). No timezone conversion.</p><p className="handoff-source"><strong>Saved assignments only</strong> · Repair previews are NOT applied or included. Saved means saved in this tab, not saved to a file.</p></header>
      {hasPendingEdits && <p className="handoff-warning"><strong>Unsaved volunteer edits are NOT included.</strong> Save or discard those edits, then review this handoff again.</p>}
      {issues.length > 0 && <p className="handoff-warning"><strong>DRAFT — unresolved assignment conflicts.</strong> Rows marked “Needs review” conflict with saved constraints. Resolve them in Current roster before relying on this handoff. Names remain as saved; this is not a feasible repair.</p>}
      <p className="handoff-summary"><strong>{assigned.length} of {shifts.length} roles assigned · {unfilled.length} unfilled</strong><br/>Assignments are a record, not confirmation that volunteers have agreed.</p>
      <table><caption>Unfilled roles ({unfilled.length})</caption><thead><tr><th scope="col">Time</th><th scope="col">Role</th><th scope="col">Assignment</th><th scope="col">Status</th></tr></thead><tbody>{unfilled.length ? rows(unfilled) : <tr><td colSpan={4}>No unfilled roles.</td></tr>}</tbody></table>
      <table><caption>Saved assignments ({assigned.length})</caption><thead><tr><th scope="col">Time</th><th scope="col">Role</th><th scope="col">Volunteer</th><th scope="col">Status</th></tr></thead><tbody>{assigned.length ? rows(assigned) : <tr><td colSpan={4}>No assigned roles.</td></tr>}</tbody></table>
      <footer>Review the event date and latest saved roster before use. This copy can become outdated. No volunteers have been contacted. Share names and assignments carefully.</footer>
    </article>
  </section>;
}
