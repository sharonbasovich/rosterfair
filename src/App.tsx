import { useEffect, useRef, useState } from 'react';
import { applyRepair, applyRosterImport, cancelAssignment, DEMO_FIXTURES, loadFixture, togglePin, undoEdit, updateShift, updateVolunteer } from './domain';
import { exportRosterFile } from './domain/rosterFile';
import type { EditResult, RepairOption, SolveResult } from './domain';
import { Icon } from './components/Icon';
import { Schedule } from './components/Schedule';
import { RepairPanel } from './components/RepairPanel';
import { VolunteerEditor } from './components/VolunteerEditor';
import { ShiftEditor } from './components/ShiftEditor';
import { RosterFiles } from './components/RosterFiles';
import { time } from './format';
import { RepairPreview } from './components/RepairPreview';

export default function App() {
  const [fixtureId,setFixtureId]=useState('chain');
  const [session,setSession]=useState(()=>loadFixture('chain'));
  const [result,setResult]=useState<SolveResult|null>(null);
  const [selected,setSelected]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState('Synthetic roster loaded. Start by recording a cancellation.');
  const [editorEpoch,setEditorEpoch]=useState(0);
  const [viewHistory,setViewHistory]=useState<string[]>([]);
  const worker=useRef<Worker|null>(null);
  const noticeRef=useRef<HTMLDivElement>(null);
  const roster=session.roster;
  const fixture=DEMO_FIXTURES.find(f=>f.id===fixtureId);
  const open=roster.shifts.filter(s=>!s.volunteerId).length;
  useEffect(()=>()=>worker.current?.terminate(),[]);
  function invalidate() {worker.current?.terminate();worker.current=null;setBusy(false);setResult(null);setSelected(0);setError(null);}
  function edit(change:EditResult,message:string,focusNotice=false) {if(!change.ok){setNotice(change.error);if(focusNotice)requestAnimationFrame(()=>noticeRef.current?.focus());return;}invalidate();setSession(change.session);setViewHistory(h=>[...h.slice(-49),fixtureId]);setNotice(message);if(focusNotice)requestAnimationFrame(()=>noticeRef.current?.focus());}
  function undoLastChange() {
    const change=undoEdit(session);
    if(!change.ok){setNotice(change.error);return;}
    invalidate();setSession(change.session);setFixtureId(viewHistory.at(-1)??'custom');setViewHistory(h=>h.slice(0,-1));setEditorEpoch(n=>n+1);
    setNotice('Last local change undone. Find repairs again to refresh your options.');requestAnimationFrame(()=>noticeRef.current?.focus());
  }
  function chooseFixture(id:string) {
    const file=exportRosterFile(loadFixture(id).roster);
    if(!file.ok){setNotice(file.error);return;}
    const change=applyRosterImport(session,file.text);
    if(!change.ok){setNotice(change.error);return;}
    edit(change,'Demo loaded. Undo restores the previous roster.');setFixtureId(id);setEditorEpoch(n=>n+1);
  }
  function importRoster(source:string) {
    const change=applyRosterImport(session,source);
    if(!change.ok){setNotice(change.error);return false;}
    edit(change,'Roster imported locally. Undo restores the previous roster. Export JSON to keep future saved edits.');
    setFixtureId('custom');setEditorEpoch(n=>n+1);return true;
  }
  function findRepairs() {
    invalidate();setBusy(true);setNotice('Searching. Your roster will change only when you apply an option.');
    const next=new Worker(new URL('./solver.worker.ts',import.meta.url),{type:'module'});worker.current=next;
    next.onmessage=(event:MessageEvent<{result?:SolveResult;error?:string}>)=>{if(worker.current!==next)return;setBusy(false);next.terminate();worker.current=null;if(event.data.result){setResult(event.data.result);setNotice('Search complete. Compare the changes before applying a repair.');}else setError(event.data.error??'Unexpected search error.');};
    next.onerror=()=>{if(worker.current!==next)return;next.terminate();worker.current=null;setBusy(false);setError('The local search worker could not run.');};
    next.postMessage({roster});
  }
  function apply(option:RepairOption){edit(applyRepair(session,option),'Repair applied to this local roster. Undo restores the previous assignments.',true);}
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to roster</a>
    <aside className="event-rail">
      <a className="brand" href="#main" aria-label="RosterFair home"><span className="brand-mark"><span/><span/><span/></span>RosterFair</a>
      <div className="rail-content"><p className="rail-caption">Your event</p><h2>{roster.title}</h2><p className="event-date"><time dateTime={roster.date}>{roster.date}</time><br/>{time(Math.min(...roster.shifts.map(s=>s.start)))}–{time(Math.max(...roster.shifts.map(s=>s.end)))} · Event-local time</p><div className="event-rule"/>
      <nav aria-label="Workspace"><a href="#schedule-heading" className="rail-link active"><Icon name="branch"/>Repair roster</a><a href="#inputs-heading" className="rail-link">Volunteer inputs<span>{roster.volunteers.length}</span></a><a href="#policy" className="rail-link">How ranking works</a></nav>
      <div className="demo-selector"><label htmlFor="demo">Try a scenario</label><select id="demo" value={fixtureId} onChange={e=>chooseFixture(e.target.value)}>{!fixture&&<option value="custom">Loaded roster</option>}{DEMO_FIXTURES.map(f=><option value={f.id} key={f.id}>{f.name}</option>)}</select><p>{fixture?.description??'Your loaded one-day roster. Load a demo to explore; Undo can restore this plan.'}</p>{fixture&&<button className="rail-reset" onClick={()=>chooseFixture(fixtureId)}>Reset this demo</button>}</div></div>
      <div className="rail-footer"><span className="local-dot"/>Local prototype<p>Examples are synthetic.<br/>No accounts or messages.</p></div>
    </aside>
    <main id="main">
      <header className="page-header"><div><h1>One cancellation.<br/><span>A smaller ripple.</span></h1><p>Repair volunteer coverage while keeping existing commitments in view.</p></div><button className="secondary undo-button" disabled={session.history.length===0} onClick={undoLastChange}><Icon name="undo"/>Undo last change</button></header>
      <ol className="workflow" aria-label="Repair workflow"><li className="done"><span>1</span><a href="#inputs-heading">Review constraints</a></li><li className={open?'done':'current'}><span>2</span><a href="#schedule-heading">Record cancellation</a></li><li className={open?'current':''}><span>3</span><a href="#repair-heading">Compare & apply</a></li></ol>
      <div className="notice" role="status" aria-live="polite" ref={noticeRef} tabIndex={-1}><span className={`status-dot ${open?'amber':''}`}/>{notice}</div>
      <RosterFiles roster={roster} onImport={importRoster} onNotice={setNotice}/>
      <div className="workspace-grid"><div className="roster-column">
        {fixture?<div className="demo-action"><div><strong>{fixtureId==='pin-conflict'?'Some commitments contradict each other.':roster.absences.length&&!open?'The roster is assigned again.':'A volunteer can no longer make it.'}</strong><p>{fixtureId==='pin-conflict'?'Find repairs to inspect the pinned conflict. Unpin a conflicting assignment to resolve it.':roster.absences.length&&!open?'Undo to compare another repair, or reset the demo.':`Record the cancellation, then find a feasible repair.`}</p></div>{fixtureId!=='pin-conflict'&&<button className="secondary" disabled={roster.absences.some(a=>a.reason===`Cancelled ${roster.shifts.find(s=>s.id===fixture.cancelShiftId)?.title}`)||!roster.shifts.find(s=>s.id===fixture.cancelShiftId)?.volunteerId||Boolean(roster.shifts.find(s=>s.id===fixture.cancelShiftId)?.pinned)} onClick={()=>edit(cancelAssignment(session,fixture.cancelShiftId),'Cancellation recorded, with an absence for that time window. Find repairs to compare your options.',true)}>Record demo cancellation<Icon name="arrow"/></button>}</div>:<div className="demo-action"><div><strong>Your roster is ready to inspect.</strong><p>{roster.date} · Cancel a specific assignment below, or find repairs for open or conflicting slots.</p></div></div>}
        {result?.options[selected]&&<RepairPreview roster={roster} option={result.options[selected]} options={result.options} onSelect={setSelected} label={String.fromCharCode(65+selected)}/>}
        <RepairPanel roster={roster} result={result} selected={selected} onSelect={setSelected} busy={busy} error={error} onSolve={findRepairs} onApply={apply}/>
        <Schedule roster={roster} onCancel={id=>edit(cancelAssignment(session,id),'Cancellation recorded. That volunteer is unavailable for the canceled time window.',true)} onPin={id=>edit(togglePin(session,id),'Pin updated. Previous proposals cleared; find repairs again.')} />
        <section className="policy" id="policy"><h2>A policy you can inspect.</h2><ol><li><strong>Cover as many slots as possible.</strong><span>Capabilities, full availability, absences, no overlaps and pins are hard constraints.</span></li><li><strong>Move fewer existing commitments.</strong><span>Filling the canceled slot does not count as a disruption.</span></li><li><strong>Respect stated workload preferences.</strong><span>Break ties using squared minutes over each preferred workload. Preferences can be exceeded.</span></li></ol><p>No inferred personal traits. No claim of objective social fairness. An organizer makes the final choice.</p></section>
      </div></div>
      <section className="inputs-section" aria-labelledby="inputs-heading"><div className="section-heading"><div><h2 id="inputs-heading">The inputs behind every repair</h2><p>Explicit availability and capabilities. Workload preferences stay soft.</p></div><span className="count">Editable roster data</span></div><VolunteerEditor key={editorEpoch} roster={roster} onUpdate={(id,patch)=>edit(updateVolunteer(session,id,patch),'Volunteer inputs saved. Previous proposals cleared; find repairs again.')} /><ShiftEditor roster={roster} onSave={(id,patch)=>edit(updateShift(session,id,patch),'Role requirements updated. Previous proposals cleared; find repairs again.')} /></section>
      <footer className="page-footer"><strong>Small roster. Clear tradeoffs.</strong><p>One-day student-club prototype · Search budget 200,000 nodes / 1.5 seconds · Export JSON to retain saved edits</p></footer>
    </main>
  </div>;
}
