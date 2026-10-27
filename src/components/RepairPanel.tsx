import { useEffect, useRef } from 'react';
import type { RepairOption, Roster, SolveResult } from '../domain';
import { Icon } from './Icon';
import { person, time } from '../format';

type Props = {roster:Roster;result:SolveResult|null;selected:number;onSelect:(index:number)=>void;busy:boolean;error:string|null;onSolve:()=>void;onApply:(option:RepairOption)=>void};
export function RepairPanel({roster,result,selected,onSelect,busy,error,onSolve,onApply}:Props) {
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{if(result)summaryRef.current?.focus();},[result]);
  const option = result?.options[selected];
  const vacancies = roster.shifts.filter(s=>!s.volunteerId);
  const shift = (id:string) => roster.shifts.find(s=>s.id===id)!;
  return <aside className="repair-panel" aria-labelledby="repair-heading" aria-busy={busy}>
    <div className="panel-top"><div className="branch-symbol"><Icon name="branch" size={24}/></div><div><h2 id="repair-heading">Repair desk</h2><p>See the ripple before you commit.</p></div></div>
    <div className="repair-body">
      {!result&&!busy&&!error&&<div className="repair-empty"><h3>{vacancies.length?`${vacancies.length} open ${vacancies.length===1?'slot':'slots'}. Let's trace a repair.`:'Ready for the unexpected.'}</h3><p>{vacancies.length?'A direct replacement may fail. We also check reassignments that unlock coverage.':'Cancel an assignment in the roster to explore a small, explainable repair.'}</p><div className="empty-chain"><span>Open role</span><Icon name="arrow"/><span>Reassign</span><Icon name="arrow"/><span>Cover</span></div></div>}
      {busy&&<div className="search-state" role="status"><span className="search-indicator"/><h3>Checking feasible repairs…</h3><p>Availability, capabilities, overlaps and pins stay fixed. You can keep using the page.</p></div>}
      {error&&<div className="constraint-alert" role="alert"><h3>Search could not finish</h3><p>{error}</p><p>The roster has not changed. Try finding repairs again.</p></div>}
      {result&&!busy&&<>
        <div className={`search-summary ${result.status==='invalid'?'invalid':result.bestCoverage<result.totalSlots?'partial':'complete'}`} role="status" ref={summaryRef} tabIndex={-1}><Icon name={result.status==='invalid'?'close':'check'}/><div><strong>{result.status==='invalid'?'Conflicting fixed constraints':result.status==='limited'?'Search limit reached':result.bestCoverage<result.totalSlots?'Full coverage is impossible':'Full coverage is possible'}</strong><span>{result.status==='invalid'?'Resolve the conflicts below before searching again.':result.status==='limited'?'Best found so far; optimality is not proven.':result.bestCoverage<result.totalSlots?`Proven maximum: ${result.bestCoverage} of ${result.totalSlots} slots. No hard rule was relaxed.`:'Exact search completed for this roster.'}</span></div></div>
        {result.conflicts.length>0&&<ul className="conflicts">{result.conflicts.map((c,i)=><li key={i}>{c.message}</li>)}</ul>}
        {result.options.length>0&&<>
          <fieldset className="options"><legend>Compare {result.options.length} {result.options.length===1?'option':'options'}</legend>
            {result.options.map((o,i)=><label key={o.id} className={`option ${option?.id===o.id?'selected':''}`}><input type="radio" name="repair-option" value={i} checked={option?.id===o.id} onChange={()=>onSelect(i)}/><span className="option-content"><strong>Option {String.fromCharCode(65+i)}{i===0?' · Ranked first':''}</strong><span>{o.score.covered}/{result.totalSlots} covered <span className="metric-divider">/</span> {o.score.changed} existing {o.score.changed===1?'assignment':'assignments'} moved</span><small>Workload preference cost: {o.score.workload.toLocaleString()} min²</small></span></label>)}
          </fieldset>
          {option&&<div className="plan-detail">
            <h3>What would change</h3>
            {option.changes.length===0?<p>No feasible improvement to the current assignments.</p>:<ol className="change-list">{option.changes.map(c=><li key={c.shiftId}><span className="change-marker"/><div><strong>{shift(c.shiftId).title}</strong><small>{time(shift(c.shiftId).start)}–{time(shift(c.shiftId).end)}</small><span className="change-people"><span className={c.from?'old-person':''}>{person(roster,c.from)}</span><Icon name="arrow" size={15}/><b>{person(roster,c.to)}</b></span></div></li>)}</ol>}
            {option.unfilledShiftIds.length>0&&<div className="unfilled"><strong>Still open</strong><p>{option.unfilledShiftIds.map(id=>shift(id).title).join(', ')}. Review capabilities, availability or fixed assignments; the solver will not bypass them.</p></div>}
            <details className="load-details"><summary>Inspect workload & ranking</summary><p>First maximize coverage, then minimize changes to occupied slots, then minimize squared minutes over stated preferences. Filling an open slot is not counted as disruption.</p><div className="load-table">{option.loads.map(l=><div key={l.volunteerId}><span>{person(roster,l.volunteerId)}</span><strong>{l.minutes} min</strong><small>{l.overageMinutes?`${l.overageMinutes} over preference`:`Preference ${l.preferredMinutes} min`}</small></div>)}</div><p>Preferences are soft. This score expresses a chosen workload policy, not objective social fairness.</p></details>
            <button className="primary apply-button" disabled={option.changes.length===0} onClick={()=>onApply(option)}><Icon name="check"/>{option.unfilledShiftIds.length?'Apply partial repair':`Apply option ${String.fromCharCode(65+result.options.indexOf(option))}`}</button><p className="apply-note">Only this local roster changes. Undo is available.</p>
          </div>}
        </>}
        <details className="candidate-details"><summary>Why a direct replacement may fail</summary><p>Eligibility checks capabilities, availability and recorded absences. Existing overlapping assignments can move only when unpinned.</p>{result.diagnostics.filter(d=>!shift(d.shiftId).volunteerId).map(d=><div key={d.shiftId}><h4>{shift(d.shiftId).title}</h4><ul>{d.candidates.map(c=><li key={c.volunteerId}><strong>{person(roster,c.volunteerId)}</strong><span>{c.reasons.length?c.reasons.join(' '):c.currentConflictShiftIds.length?`Already assigned to ${c.currentConflictShiftIds.map(id=>shift(id).title).join(', ')}.`:'Available directly.'}</span></li>)}</ul></div>)}</details>
        <p className="search-meta">{result.explored.toLocaleString()} search nodes · {Math.round(result.elapsedMs)} ms · {result.status==='optimal'?'Proven best ranking':result.status==='limited'?'Bounded search, not proven optimal':'No repair applied'}</p>
      </>}
      <button className="primary find-button" disabled={busy} onClick={onSolve}><Icon name="branch"/>{busy?'Finding repairs…':result?'Find repairs again':'Find feasible repairs'}</button>
      <p className="hard-rule-note">Hard rules are never traded for better coverage.</p>
    </div>
  </aside>;
}
