import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyRosterImport, cancelAssignment, DEMO_FIXTURES, loadFixture, solveRepairs, undoEdit, updateVolunteer, type EditResult } from '../src/domain';
import { exportRosterFile } from '../src/domain/rosterFile';
import { needsExitWarning, retainedRosterKey, warnBeforeExit } from '../src/exitWarning';

const demoKeys=DEMO_FIXTURES.map(fixture=>retainedRosterKey(fixture.roster));
function success(change:EditResult){assert.ok(change.ok);return change.session;}

test('unchanged demos, session revisions and repair previews do not request exit warnings',()=>{
  for(const fixture of DEMO_FIXTURES){
    const roster=structuredClone(fixture.roster);
    assert.equal(needsExitWarning(roster,demoKeys,false),false);
    roster.revision+=99;
    solveRepairs(roster);
    assert.equal(needsExitWarning(roster,demoKeys,false),false);
  }
});

test('pending input is protected even when saved roster is recoverable',()=>{
  const roster=loadFixture('chain').roster;
  assert.equal(needsExitWarning(roster,demoKeys,true),true);
  assert.equal(needsExitWarning(roster,demoKeys,false),false);
});

test('cancellation, saved edits and undo compare content rather than history length',()=>{
  const original=loadFixture('chain');
  const fixture=DEMO_FIXTURES.find(f=>f.id==='chain')!;
  const canceled=success(cancelAssignment(original,fixture.cancelShiftId));
  assert.equal(needsExitWarning(canceled.roster,demoKeys,false),true);
  const restored=success(undoEdit(canceled));
  assert.equal(needsExitWarning(restored.roster,demoKeys,false),false);
  const changed=success(updateVolunteer(restored,'eli',{preferredMinutes:0}));
  assert.equal(needsExitWarning(changed.roster,demoKeys,false),true);
  assert.equal(needsExitWarning(success(undoEdit(changed)).roster,demoKeys,false),false);
});

test('imported source is recoverable, but later changes and unknown old imports are not',()=>{
  const custom=loadFixture('chain').roster;
  custom.title='Synthetic imported club';
  const file=exportRosterFile(custom);assert.ok(file.ok);
  const imported=success(applyRosterImport(loadFixture('chain'),file.text));
  const keys=[...demoKeys,retainedRosterKey(imported.roster)];
  assert.equal(needsExitWarning(imported.roster,keys,false),false);
  assert.equal(needsExitWarning(imported.roster,demoKeys,false),true);
  const edited=success(updateVolunteer(imported,'eli',{preferredMinutes:0}));
  assert.equal(needsExitWarning(edited.roster,keys,false),true);
  assert.equal(needsExitWarning(success(undoEdit(edited)).roster,keys,false),false);
});

test('export preparation alone does not clear exit protection or mutate recoverable keys',()=>{
  const session=success(updateVolunteer(loadFixture('chain'),'eli',{preferredMinutes:0}));
  const before=[...demoKeys];
  assert.ok(exportRosterFile(session.roster).ok);
  assert.equal(needsExitWarning(session.roster,demoKeys,false),true);
  assert.deepEqual(demoKeys,before);
});

test('every retained roster field contributes, revision alone does not',()=>{
  const roster=loadFixture('chain').roster;
  const key=retainedRosterKey(roster);
  const mutations: ((copy: typeof roster)=>void)[]=[
    copy=>{copy.id+='x';},copy=>{copy.title+='x';},copy=>{copy.date='2026-11-30';},
    copy=>{copy.volunteers[0].name+='x';},copy=>{copy.shifts[0].pinned=!copy.shifts[0].pinned;},
    copy=>{copy.absences.push({volunteerId:copy.volunteers[0].id,start:0,end:1,reason:'Synthetic'});},
  ];
  for(const mutate of mutations){const copy=structuredClone(roster);mutate(copy);assert.notEqual(retainedRosterKey(copy),key);}
  const cloned=structuredClone(roster);cloned.revision+=100;
  assert.equal(retainedRosterKey(cloned),retainedRosterKey(roster));
});

test('beforeunload handler requests the standard browser warning',()=>{
  const event=new Event('beforeunload',{cancelable:true});
  // Node's generic Event exposes a getter only; browsers use BeforeUnloadEvent.
  Object.defineProperty(event,'returnValue',{value:'initial',writable:true});
  warnBeforeExit(event as BeforeUnloadEvent);
  assert.equal(event.defaultPrevented,true);
  assert.equal(event.returnValue,'');
});
