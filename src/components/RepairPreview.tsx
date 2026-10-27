import { useState } from 'react';
import type { RepairOption, Roster } from '../domain';
import { person, time } from '../format';
import { Icon } from './Icon';
import './RepairPreview.css';

type Props = {roster:Roster;option:RepairOption;options:RepairOption[];label:string;onSelect:(index:number)=>void};

/** A projection only. All mutations still go through App's checked apply/edit paths. */
export function RepairPreview({roster,option,options,label,onSelect}:Props) {
  const [changesOnly,setChangesOnly]=useState(true);
  const start=Math.min(...roster.shifts.map(s=>s.start));
  const end=Math.max(...roster.shifts.map(s=>s.end));
  const changed=new Set(option.changes.map(c=>c.shiftId));
  const shifts=roster.shifts.filter(s=>!changesOnly||changed.has(s.id));
  const preserved=roster.shifts.length-option.changes.length;
  const filled=option.changes.filter(c=>c.from===null&&c.to!==null).length;
  return <section className="repair-preview" aria-labelledby="preview-heading">
    <div className="preview-heading"><div><p className="preview-eyebrow"><Icon name="branch" size={15}/>Trace the ripple</p><h2 id="preview-heading">Option {label}, in your roster.</h2><p>Preview only. Your current assignments stay unchanged until you apply.</p></div><span className="preview-stamp">Not applied</span></div>
    <div className="preview-toolbar"><div className="preview-selector"><label htmlFor="preview-option">Compare repair</label><select id="preview-option" value={options.indexOf(option)} onChange={e=>onSelect(Number(e.target.value))}>{options.map((o,i)=><option key={o.id} value={i}>Option {String.fromCharCode(65+i)}{i===0?' · Ranked first':''} · {o.score.covered}/{roster.shifts.length} covered · cost {o.score.workload.toLocaleString()}</option>)}</select></div><button className="preview-filter" aria-pressed={changesOnly} onClick={()=>setChangesOnly(v=>!v)}>Changes only<span>{option.changes.length}</span></button></div>
    <dl className="preview-metrics"><div><dt>Covered</dt><dd>{option.score.covered}<span> / {roster.shifts.length}</span></dd></div><div><dt>Existing slots changed</dt><dd>{option.score.changed}</dd></div><div><dt>Gaps filled</dt><dd>{filled}</dd></div><div><dt>Slots unchanged</dt><dd>{preserved}</dd></div></dl>
    <p className="preview-help" id="preview-help"><span role="status" aria-live="polite" aria-atomic="true">Option {label}: showing {shifts.length} of {roster.shifts.length} roles.</span> Open a role to follow the reassignment. Times are event-local; bars show each role's time, not availability.</p>
    <div className="preview-axis" aria-hidden="true"><span>{time(start)}</span><span>{time(end)}</span></div>
    <div className="preview-roles" aria-describedby="preview-help">
      {shifts.map(s=>{
        const to=option.assignments[s.id];
        const isChanged=changed.has(s.id);
        const volunteer=roster.volunteers.find(v=>v.id===to);
        const fromRoles=roster.shifts.filter(other=>other.id!==s.id&&other.volunteerId===to&&to!==null);
        const status=to===null?(s.volunteerId?'Becomes open':'Still open'):isChanged?(s.volunteerId?'Reassigned':'Gap filled'):s.pinned?'Pinned · kept':'Unchanged';
        return <details className={`preview-role ${isChanged?'preview-changed':''} ${to===null?'preview-open':''}`} key={s.id}>
          <summary><span className="preview-role-top"><strong>{s.title}</strong><span className="preview-state">{s.pinned&&<Icon name="pin" size={12}/>} {status}</span></span><span className="preview-time">{time(s.start)}–{time(s.end)}<span className="preview-track" aria-hidden="true"><span style={{left:`${100*(s.start-start)/(end-start)}%`,width:`${100*(s.end-s.start)/(end-start)}%`}}/></span></span><span className="preview-people"><span><small>Current</small><b>{person(roster,s.volunteerId)}</b></span><Icon name="arrow" size={16}/><span><small>Option {label}</small><b>{person(roster,to)}</b></span></span><span className="preview-expand">Inspect role <span aria-hidden="true">+</span></span></summary>
          <div className="preview-explanation"><p><strong>Required capabilities:</strong> {s.requires.join(', ')||'None'}.</p>{volunteer?<><p><strong>{volunteer.name}'s stated availability:</strong> {volunteer.availability.map(w=>`${time(w.start)}–${time(w.end)}`).join(', ')}.</p>{fromRoles.length>0&&<p><strong>Follow their current roles:</strong> {fromRoles.map(other=>`${other.title} → ${person(roster,option.assignments[other.id])}`).join('; ')} in this proposal.</p>}<p>Proposed assignments pass capabilities, full availability, recorded absences, no overlaps and pins. Preferred workload remains soft.</p></>:<p>{s.volunteerId?'This proposal leaves a currently assigned role open. Review the coverage and tradeoffs before applying.':'This role remains uncovered. The proposal does not relax a hard constraint to fill it.'}</p>}{s.pinned&&<p>This pin keeps the exact current assignment, including a pinned open slot.</p>}</div>
        </details>;
      })}
    </div>
    {shifts.length===0&&<p className="preview-no-changes">No assignment changes in this option. Turn off Changes only to inspect the current coverage.</p>}
    <p className="preview-footnote">{roster.shifts.filter(s=>s.pinned).length} pinned {roster.shifts.filter(s=>s.pinned).length===1?'slot':'slots'} preserved. Filling an open slot is separate from moving an existing assignment. Cost is squared minutes over stated workload preferences (min²).</p>
    <a className="preview-review-link" href="#repair-heading">Review tradeoffs & apply at the repair desk <Icon name="arrow" size={15}/></a>
  </section>;
}
