import {expect,test,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile} from 'node:fs/promises';
import type {RosterFileEnvelope} from '../src/domain/rosterFile';

const example=JSON.parse(await readFile('examples/one-day-roster.json','utf8')) as RosterFileEnvelope;
const preview=(page:Page)=>page.getByRole('region',{name:/Option [A-D], in your roster/});
const current=(page:Page)=>page.getByRole('table',{name:'Current assignments',exact:true});
const picker=(page:Page)=>page.getByLabel('Choose roster JSON file',{exact:true});
async function solve(page:Page){await page.getByRole('button',{name:/Find (feasible repairs|repairs again)/}).click();await expect(page.locator('.search-summary')).toBeVisible();}
async function cancelAndSolve(page:Page){await page.goto('/');await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();await solve(page);}
async function stage(page:Page,value:unknown){await picker(page).setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});}

test('both selectors synchronize; inspecting every proposal never mutates current assignments or history',async({page})=>{
  await cancelAndSolve(page);
  const saved=await current(page).innerText();
  await expect(preview(page)).toContainText('Preview only');
  await expect(preview(page).locator('.preview-role')).toHaveCount(2);
  await page.getByLabel('Compare repair',{exact:true}).press('Home');
  for(const i of [1,3,2,0,1,0]){
    await page.getByLabel('Compare repair',{exact:true}).selectOption(String(i));
    await expect(page.getByLabel('Compare repair',{exact:true})).toBeFocused();
    await expect(page.getByRole('radio').nth(i)).toBeChecked();
    await expect(preview(page).getByRole('heading')).toHaveText(`Option ${String.fromCharCode(65+i)}, in your roster.`);
    expect(await current(page).innerText()).toBe(saved);
  }
  await page.getByRole('radio').nth(1).press('Space');
  await expect(page.getByLabel('Compare repair',{exact:true})).toHaveValue('1');
  await expect(page.getByRole('radio').nth(1)).toBeFocused();
  const welcome=preview(page).locator('details').filter({hasText:'Welcome desk'});
  await welcome.locator('summary').press('Enter');await expect(welcome).toHaveAttribute('open','');
  await expect(welcome).toContainText('Repair bench → Alex Rivera');
  await expect(welcome).toContainText('Preferred workload remains soft');
  await preview(page).getByRole('button',{name:/Changes only/}).click();
  await expect(preview(page).locator('.preview-role')).toHaveCount(5);
  await expect(preview(page).locator('details').filter({hasText:'Event photography'})).toContainText('Pinned · kept');
  expect(await current(page).innerText()).toBe(saved);
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();
  await expect(preview(page)).toHaveCount(0);await expect(page.getByRole('button',{name:'Undo last change',exact:true})).toBeDisabled();
  await expect(current(page)).toContainText('Maya Chen');
});

test('repeated preview, apply, undo and saved edits clear selection and stale projections',async({page})=>{
  await cancelAndSolve(page);
  for(let i=0;i<3;i++){
    await page.getByLabel('Compare repair',{exact:true}).selectOption('1');
    await page.getByRole('button',{name:'Apply option B',exact:true}).click();
    await expect(preview(page)).toHaveCount(0);await expect(current(page).getByRole('row').filter({hasText:'Welcome desk'})).toContainText('Noor Ali');
    await page.getByRole('button',{name:'Undo last change',exact:true}).click();
    await expect(current(page).getByRole('row').filter({hasText:'Welcome desk'})).toContainText('Open slot');
    await solve(page);await expect(page.getByLabel('Compare repair',{exact:true})).toHaveValue('0');
  }
  await page.getByRole('button',{name:'Pin Tool station',exact:true}).click();
  await expect(preview(page)).toHaveCount(0);await solve(page);
  await preview(page).getByRole('button',{name:/Changes only/}).click();
  await expect(preview(page).locator('details').filter({hasText:'Tool station'})).toContainText('Pinned · kept');
  await page.locator('#volunteer-summary-alex').click();
  const form=page.getByRole('form',{name:'Edit Alex Rivera constraints'});
  await form.getByRole('spinbutton').fill('90');await form.getByRole('button',{name:'Save constraints'}).click();
  await expect(preview(page)).toHaveCount(0);await expect(page.getByRole('radio')).toHaveCount(0);
});

test('rejected and canceled imports preserve projection; confirmed imports and demo changes clear it',async({page})=>{
  await cancelAndSolve(page);await page.getByLabel('Compare repair',{exact:true}).selectOption('1');
  const saved=await preview(page).innerText();
  await stage(page,'{');await expect(page.locator('.rf-file-error')).toBeVisible();expect(await preview(page).innerText()).toBe(saved);
  for(let i=0;i<2;i++){
    await stage(page,example);await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
    expect(await preview(page).innerText()).toBe(saved);await expect(picker(page)).toBeFocused();
  }
  await stage(page,example);await page.getByRole('dialog').getByRole('button',{name:'Import roster',exact:true}).click();
  await expect(preview(page)).toHaveCount(0);await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();await solve(page);
  await expect(page.getByLabel('Compare repair',{exact:true})).toHaveValue('0');
  await page.getByLabel('Try a scenario').selectOption('pin-conflict');await solve(page);
  await expect(preview(page)).toHaveCount(0);await expect(page.locator('.search-summary')).toContainText('Conflicting fixed constraints');
});

test('interrupted worker completion cannot restore a preview after switching scenarios',async({page})=>{
  await page.addInitScript(()=>{const RealWorker=window.Worker;window.Worker=class extends RealWorker{postMessage(message:unknown){setTimeout(()=>super.postMessage(message),350);}};});
  await page.goto('/');await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();
  await page.getByRole('button',{name:'Find feasible repairs',exact:true}).click();
  await page.getByLabel('Try a scenario').selectOption('pin-conflict');
  await expect(page.getByRole('button',{name:'Find feasible repairs',exact:true})).toBeEnabled();
  // A fresh search's invalid result must win over the terminated worker's delayed reply.
  await solve(page);await expect(page.locator('.search-summary')).toContainText('Conflicting fixed constraints');await expect(preview(page)).toHaveCount(0);
});

test('partial coverage remains an explicit gap in the projected roster',async({page})=>{
  await page.goto('/');await page.getByLabel('Try a scenario').selectOption('impossible');
  await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();await solve(page);
  await expect(page.locator('.search-summary')).toContainText('Full coverage is impossible');
  await preview(page).getByRole('button',{name:/Changes only/}).click();
  const open=preview(page).locator('.preview-open');await expect(open).toHaveCount(1);await expect(open).toContainText('Still open');
  await open.locator('summary').click();await expect(open).toContainText('does not relax a hard constraint');
  await page.screenshot({path:'test-results/screenshots/preview-partial.png',fullPage:true});
});

test('preview keyboard, narrow layouts, large text names, reduced motion and axe',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [320,390,768,1024,1440]){
    await page.setViewportSize({width,height:900});await cancelAndSolve(page);
    await expect(preview(page)).toBeVisible();
    await preview(page).getByRole('button',{name:/Changes only/}).press('Enter');
    const summary=preview(page).locator('summary').first();await summary.press('Enter');await expect(summary).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(width<=1020){const previewBox=await preview(page).boundingBox();const deskBox=await page.locator('.repair-panel').boundingBox();const rosterBox=await page.locator('.schedule-section').boundingBox();expect(previewBox!.y).toBeLessThan(deskBox!.y);expect(deskBox!.y).toBeLessThan(rosterBox!.y);}
    const controls=await preview(page).locator('summary,select,button,a').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));expect(controls.every(h=>h>=44)).toBe(true);
    if(width===390||width===1440){
      const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
      await page.screenshot({path:`test-results/screenshots/preview-${width}.png`,fullPage:true});
    }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await preview(page).locator('summary').first().evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  expect(await preview(page).locator('summary').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  const long=structuredClone(example);long.roster.volunteers.forEach(v=>v.name='Synthetic volunteer '.repeat(5).trim());long.roster.shifts.forEach(s=>s.title='Synthetic role '.repeat(5).trim());
  await page.setViewportSize({width:320,height:900});await stage(page,long);await page.getByRole('dialog').getByRole('button',{name:'Import roster',exact:true}).click();await solve(page);
  await preview(page).getByRole('button',{name:/Changes only/}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('largest supported roster renders a bounded preview and keeps comparison local',async({page},testInfo)=>{
  const external:string[]=[];page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.hostname!=='127.0.0.1')external.push(r.url());});
  const dense=structuredClone(example);dense.roster.volunteers=Array.from({length:12},(_,i)=>({id:`person-${i}`,name:`Synthetic volunteer ${i}`,capabilities:['welcome'],availability:[{start:600,end:840}],preferredMinutes:120}));
  dense.roster.shifts=Array.from({length:12},(_,i)=>({id:`role-${i}`,title:`Synthetic role ${i}`,start:600+i*10,end:610+i*10,requires:['welcome'],volunteerId:null,pinned:false}));dense.roster.absences=[];
  await page.setViewportSize({width:390,height:900});await page.goto('/');await stage(page,dense);await page.getByRole('dialog').getByRole('button',{name:'Import roster',exact:true}).click();
  const started=Date.now();await solve(page);const searchAndRenderMs=Date.now()-started;
  await expect(preview(page).locator('.preview-role')).toHaveCount(12);
  const before=await current(page).innerText();const interactionStart=Date.now();
  for(let i=0;i<3;i++){await preview(page).getByRole('button',{name:/Changes only/}).click();}
  const threeFilterActionsMs=Date.now()-interactionStart;
  await expect(preview(page).locator('.preview-role')).toHaveCount(12);expect(await current(page).innerText()).toBe(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(external).toEqual([]);
  await testInfo.attach('bounded-roster-timing',{body:JSON.stringify({volunteers:12,roles:12,searchAndRenderMs,threeFilterActionsMs,status:await page.locator('.search-summary').innerText(),externalRequests:external.length}),contentType:'application/json'});
});

test('single-role previews show valid time bars, unchanged work and deliberately pinned vacancies',async({page})=>{
  const single=structuredClone(example);single.roster.volunteers=single.roster.volunteers.slice(0,1);single.roster.shifts=single.roster.shifts.slice(0,1);single.roster.absences=[];
  Object.assign(single.roster.shifts[0],{start:600,end:720,requires:[],volunteerId:single.roster.volunteers[0].id,pinned:false});
  single.roster.volunteers[0].availability=[{start:600,end:720}];
  await page.goto('/');await stage(page,single);await page.getByRole('dialog').getByRole('button',{name:'Import roster',exact:true}).click();await solve(page);
  await expect(preview(page)).toContainText('No assignment changes');await preview(page).getByRole('button',{name:/Changes only/}).click();
  const role=preview(page).locator('.preview-role');await expect(role).toHaveCount(1);await expect(role).toContainText('Unchanged');
  expect(await role.locator('.preview-track>span').evaluate(el=>({left:(el as HTMLElement).style.left,width:(el as HTMLElement).style.width}))).toEqual({left:'0%',width:'100%'});
  single.roster.shifts[0].volunteerId=null;single.roster.shifts[0].pinned=true;
  await stage(page,single);await page.getByRole('dialog').getByRole('button',{name:'Import roster',exact:true}).click();await solve(page);await preview(page).getByRole('button',{name:/Changes only/}).click();
  await expect(preview(page).locator('.preview-open')).toContainText('Still open');
  await preview(page).locator('summary').click();await expect(preview(page)).toContainText('including a pinned open slot');
  await expect(page.locator('.search-summary')).toContainText('Proven maximum: 0 of 1');
});

test('an assigned slot that becomes uncovered is distinguished from an existing gap',async({page})=>{
  const invalid=structuredClone(example);const volunteer=invalid.roster.volunteers[0];volunteer.capabilities=['welcome'];volunteer.availability=[{start:600,end:720}];invalid.roster.volunteers=[volunteer];invalid.roster.absences=[];
  invalid.roster.shifts=[{id:'welcome',title:'Synthetic welcome',start:600,end:720,requires:['welcome'],volunteerId:volunteer.id,pinned:false},{id:'repair',title:'Synthetic repair',start:600,end:720,requires:['repair'],volunteerId:volunteer.id,pinned:false}];
  await page.goto('/');await stage(page,invalid);const dialog=page.getByRole('dialog');await dialog.getByLabel('Import this draft with unresolved hard constraints',{exact:true}).check();await dialog.getByRole('button',{name:'Import roster',exact:true}).click();await solve(page);
  const changed=preview(page).locator('.preview-open');await expect(changed).toContainText('Becomes open');await changed.locator('summary').click();await expect(changed).toContainText('leaves a currently assigned role open');await expect(changed).not.toContainText('remains uncovered');
  await expect(preview(page).getByRole('status')).toContainText('Option A: showing 1 of 2 roles');
  await page.getByRole('button',{name:'Apply partial repair',exact:true}).click();await expect(current(page).getByRole('row').filter({hasText:'Synthetic repair'})).toContainText('Open slot');
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();await expect(current(page).getByRole('row').filter({hasText:'Synthetic repair'})).toContainText(volunteer.name);
});

for (const failure of ['constructor', 'postMessage'] as const) {
  test(`synchronous worker ${failure} failures preserve the roster and allow retry`, async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({failure}) => {
      const OriginalWorker = window.Worker;
      let attempts = 0;
      const state = {terminated: 0};
      Object.assign(window, {workerRecoveryTest: state});
      window.Worker = new Proxy(OriginalWorker, {
        construct(Target, args: ConstructorParameters<typeof Worker>) {
          attempts++;
          if (attempts <= 2 && failure === 'constructor') throw new DOMException('Synthetic worker policy failure', 'SecurityError');
          const instance = new Target(...args);
          const terminate = instance.terminate.bind(instance);
          instance.terminate = () => { state.terminated++; terminate(); };
          if (attempts <= 2) instance.postMessage = () => { throw new DOMException('Synthetic clone failure', 'DataCloneError'); };
          return instance;
        },
      });
    }, {failure});
    await page.goto('/');
    await page.getByRole('button', {name:'Record demo cancellation', exact:true}).click();
    const saved = await current(page).innerText();
    const find = page.getByRole('button', {name:/Find (feasible repairs|repairs again)/});
    for (let attempt = 0; attempt < 2; attempt++) {
      await find.click();
      await expect(page.getByRole('alert')).toContainText('The local search worker could not start.');
      await expect(find).toBeEnabled();
      await expect(page.getByText('Checking feasible repairs…', {exact:true})).toHaveCount(0);
      await expect(preview(page)).toHaveCount(0);
      expect(await current(page).innerText()).toBe(saved);
    }
    expect(await page.evaluate(() => (window as unknown as {workerRecoveryTest:{terminated:number}}).workerRecoveryTest.terminated)).toBe(failure === 'postMessage' ? 2 : 0);
    await solve(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(preview(page)).toBeVisible();
    expect(await current(page).innerText()).toBe(saved);
    // Failed searches must not have added undo snapshots.
    await page.getByRole('button', {name:'Undo last change', exact:true}).click();
    await expect(page.getByRole('button', {name:'Undo last change', exact:true})).toBeDisabled();
    expect(errors).toEqual([]);
  });
}
