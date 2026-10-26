import { useState } from 'react';
import type { Roster, Shift } from '../domain';
export function ShiftEditor({roster,onSave}:{roster:Roster;onSave:(id:string,patch:Partial<Shift>)=>void}) {
  const [shiftId,setShiftId]=useState(roster.shifts[0].id);
  const shift=roster.shifts.find(s=>s.id===shiftId) ?? roster.shifts[0];
  const skills=Array.from(new Set([...roster.volunteers.flatMap(v=>v.capabilities),...roster.shifts.flatMap(s=>s.requires)])).sort();
  return <details className="shift-editor"><summary>Edit role requirements</summary><p>Every selected capability is required. Changes invalidate previously calculated plans.</p><label className="field-label">Role<select value={shift.id} onChange={e=>setShiftId(e.target.value)}>{roster.shifts.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><fieldset><legend>Required capabilities (hard)</legend><div className="capability-checks">{skills.map(skill=><label key={skill}><input type="checkbox" checked={shift.requires.includes(skill)} onChange={e=>onSave(shift.id,{requires:e.target.checked?[...shift.requires,skill]:shift.requires.filter(s=>s!==skill)})}/>{skill}</label>)}</div></fieldset><p className="muted">Requirements update immediately; Undo restores the previous edit.</p></details>;
}
