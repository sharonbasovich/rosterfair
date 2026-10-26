import { validateAssignments } from '../domain';
import type { Roster } from '../domain';
import { Icon } from './Icon';
import { person, time } from '../format';
export function Schedule({roster,onCancel,onPin}:{roster:Roster;onCancel:(id:string)=>void;onPin:(id:string)=>void}) {
  const violations = validateAssignments(roster, Object.fromEntries(roster.shifts.map(s=>[s.id,s.volunteerId])));
  return <section className="schedule-section" aria-labelledby="schedule-heading">
    <div className="section-heading"><div><h2 id="schedule-heading">Current roster</h2><p>Pin commitments to keep them fixed during repair.</p></div><span className="count">{roster.shifts.filter(s=>s.volunteerId).length} / {roster.shifts.length} assigned</span></div>
    {violations.length>0&&<div className="roster-warning" role="alert"><strong>Current assignments break hard constraints</strong><ul>{violations.map((v,i)=><li key={i}>{v.message}</li>)}</ul><p>Find repairs to resolve movable assignments. Conflicting pins must be changed explicitly.</p></div>}
    <div className="roster-table" role="table" aria-label="Current assignments">
      <div className="roster-head" role="row"><span role="columnheader">Time & role</span><span role="columnheader">Assigned volunteer</span><span role="columnheader">Actions</span></div>
      {roster.shifts.map(s=><div className={`roster-row ${s.volunteerId?'':'is-open'} ${violations.some(v=>v.shiftIds.includes(s.id))?'is-invalid':''}`} key={s.id} role="row">
        <div role="cell"><span className="shift-time">{time(s.start)}–{time(s.end)}</span><strong>{s.title}</strong><span className="requirement">Requires {s.requires.join(', ') || 'no capabilities'}</span></div>
        <div role="cell" className="assignee"><span className={`avatar ${s.volunteerId?'':'empty'}`}>{s.volunteerId?person(roster,s.volunteerId).split(' ').map(n=>n[0]).join(''):<Icon name="branch"/>}</span><span><strong>{person(roster,s.volunteerId)}</strong><small>{violations.some(v=>v.shiftIds.includes(s.id))?'Constraint conflict':s.pinned?'Pinned commitment':s.volunteerId?'Can move in a repair':'Needs a repair'}</small></span></div>
        <div role="cell" className="row-actions"><button className={`pin-button ${s.pinned?'is-pinned':''}`} aria-label={`${s.pinned?'Unpin':'Pin'} ${s.title}`} aria-pressed={s.pinned} onClick={()=>onPin(s.id)}><Icon name="pin"/><span>{s.pinned?'Pinned':'Pin'}</span></button><button className="text-button cancel-button" disabled={!s.volunteerId||s.pinned} onClick={()=>onCancel(s.id)} aria-label={`Cancel ${s.title} assignment`}>Cancel</button></div>
      </div>)}
    </div>
    {roster.absences.length>0&&<div className="absence-note"><span className="status-dot amber"/><p><strong>Recorded absence</strong>{roster.absences.map((a,i)=><span key={i}>{person(roster,a.volunteerId)} · {time(a.start)}–{time(a.end)}</span>)}</p></div>}
  </section>;
}
