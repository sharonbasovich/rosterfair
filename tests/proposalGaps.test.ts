import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describePlan, solveRepairs } from '../src/domain/solver';
import { explainProposalGaps } from '../src/domain/proposalGaps';
import type { Roster } from '../src/domain/types';

const roster = (): Roster => ({id:'test',title:'Synthetic',date:'2026-11-14',revision:0,absences:[],
  volunteers:[{id:'v',name:'Synthetic volunteer',capabilities:['welcome'],availability:[{start:600,end:720}],preferredMinutes:0}],
  shifts:[{id:'a',title:'Role A',start:600,end:660,requires:['welcome'],volunteerId:null,pinned:false},
    {id:'b',title:'Role B',start:600,end:660,requires:['welcome'],volunteerId:null,pinned:false}]});

test('gaps and competing allocations follow each proposal, not saved assignments',()=>{
  const r=roster();const before=JSON.stringify(r);
  const a=describePlan(r,{a:null,b:'v'}),b=describePlan(r,{a:'v',b:null});
  const first=explainProposalGaps(r,a);assert.equal(first[0].shift.id,'a');
  assert.deepEqual(first[0].candidates[0].competingRoles.map(s=>s.id),['b']);
  assert.deepEqual(first[0].candidates[0].reasons,[]);
  assert.equal(explainProposalGaps(r,b)[0].shift.id,'b');
  assert.deepEqual(explainProposalGaps(r,b)[0].candidates[0].competingRoles.map(s=>s.id),['a']);
  assert.equal(JSON.stringify(r),before);assert.equal(a.assignments.a,null);
});

test('newly opened roles retain capability, availability, absence and pin exclusions',()=>{
  const r=roster();r.shifts[0].volunteerId='v';r.shifts[0].requires=['repair'];
  r.volunteers[0].availability=[];r.absences=[{volunteerId:'v',start:600,end:660,reason:'Synthetic absence'}];
  const gap=explainProposalGaps(r,describePlan(r,{a:null,b:null}))[0];
  assert.equal(gap.shift.volunteerId,'v');assert.equal(gap.candidates[0].reasons.length,3);
  r.shifts[0].volunteerId=null;r.shifts[0].pinned=true;r.shifts[1].volunteerId='v';r.shifts[1].pinned=true;
  const pinned=explainProposalGaps(r,describePlan(r,{a:null,b:'v'}))[0];
  assert.ok(pinned.candidates[0].reasons.includes('This slot is pinned to its current assignment.'));
  assert.ok(pinned.candidates[0].reasons.includes('Overlaps another pinned assignment.'));
});

test('touching proposed roles do not compete; full coverage has no gap explanations',()=>{
  const r=roster();r.shifts[1].start=660;r.shifts[1].end=720;
  assert.deepEqual(explainProposalGaps(r,describePlan(r,{a:null,b:'v'}))[0].candidates[0].competingRoles,[]);
  assert.deepEqual(explainProposalGaps(r,describePlan(r,{a:'v',b:'v'})),[]);
});

test('limited incumbent can leave an individually feasible candidate, without declaring impossibility',()=>{
  const r=roster();r.shifts=r.shifts.slice(0,1);
  const result=solveRepairs(r,{maxNodes:0});assert.equal(result.status,'limited');
  const candidate=explainProposalGaps(r,result.options[0])[0].candidates[0];
  assert.deepEqual(candidate.reasons,[]);assert.deepEqual(candidate.competingRoles,[]);
});

test('derived gaps ignore missing, duplicate or incorrectly assigned metadata',()=>{
  const r=roster();const option=describePlan(r,{a:null,b:'v'});
  for(const ids of [[],['b'],['a','a','b']]){
    option.unfilledShiftIds=ids;
    assert.deepEqual(explainProposalGaps(r,option).map(g=>g.shift.id),['a']);
  }
});
