import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import type { RosterFileEnvelope } from '../src/domain/rosterFile';

const sample = JSON.parse(await readFile('examples/one-day-roster.json','utf8')) as RosterFileEnvelope;
const payload = (value:unknown,name='roster.json') => ({name,mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});
const picker = (page:Page)=>page.getByLabel('Choose roster JSON file',{exact:true});
const dialog = (page:Page)=>page.getByRole('dialog',{name:'Replace the current roster?',exact:true});
async function stage(page:Page,value:unknown=sample) {await picker(page).setInputFiles(payload(value));await expect(dialog(page)).toBeVisible();await expect(dialog(page).getByRole('button',{name:'Cancel',exact:true})).toBeFocused();}
async function confirm(page:Page) {await dialog(page).getByRole('button',{name:'Import roster',exact:true}).click();await expect(dialog(page)).not.toBeVisible();}

test('download a repaired edited roster, close the tab, import the actual file and undo replacement',async({page,context},testInfo)=>{
  const externalRequests:string[]=[];
  page.on('request',request=>{const url=new URL(request.url());if(url.protocol.startsWith('http')&&!['127.0.0.1','localhost'].includes(url.hostname))externalRequests.push(request.url());});
  await page.goto('/');
  await page.locator('#volunteer-summary-alex').click();
  await page.getByRole('form',{name:'Edit Alex Rivera constraints'}).getByRole('spinbutton').fill('90');
  await page.getByRole('form',{name:'Edit Alex Rivera constraints'}).getByRole('button',{name:'Save constraints'}).click();
  await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();
  await page.getByRole('button',{name:'Find feasible repairs',exact:true}).click();
  await page.getByRole('button',{name:'Apply option A',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export roster JSON',exact:true}).press('Enter');
  const download=await downloadPromise;
  const savedPath=testInfo.outputPath('saved.rosterfair.json');await download.saveAs(savedPath);
  const saved=JSON.parse(await readFile(savedPath,'utf8')) as RosterFileEnvelope;
  expect(Object.keys(saved).sort()).toEqual(['format','roster','version']);
  expect(Object.keys(saved.roster).sort()).toEqual(['absences','date','id','shifts','title','volunteers']);
  expect(saved.roster.volunteers.find(v=>v.id==='alex')?.preferredMinutes).toBe(90);
  expect(saved.roster.shifts.find(s=>s.id==='welcome')?.volunteerId).toBe('eli');
  expect(saved.roster.shifts.find(s=>s.id==='logistics')?.volunteerId).toBe('bea');
  expect(saved.roster.absences).toHaveLength(1);expect(externalRequests).toEqual([]);
  await page.close();const reopened=await context.newPage();await reopened.goto('/');
  await picker(reopened).setInputFiles(savedPath);await expect(dialog(reopened)).toBeVisible();
  await reopened.screenshot({path:'test-results/screenshots/local-file-preview.png'});
  await expect(reopened.getByRole('row').filter({hasText:'Welcome desk'})).toContainText('Maya Chen');
  await confirm(reopened);
  await expect(reopened.getByRole('row').filter({hasText:'Welcome desk'})).toContainText('Eli Parker');
  await expect(reopened.getByRole('row').filter({hasText:'Tool station'})).toContainText('Bea Morgan');
  await expect(reopened.locator('#volunteer-summary-alex')).toContainText('90 min preferred');
  await expect(reopened.getByRole('button',{name:'Record demo cancellation',exact:true})).toHaveCount(0);
  await expect(picker(reopened)).toBeFocused();
  await reopened.getByRole('button',{name:'Undo last change',exact:true}).click();
  await expect(reopened.getByRole('row').filter({hasText:'Welcome desk'})).toContainText('Maya Chen');
  await expect(reopened.getByRole('button',{name:'Record demo cancellation',exact:true})).toBeEnabled();
});

test('rejected files preserve current assignments, preview, undo history and unsaved form drafts',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();
  await page.getByRole('button',{name:'Find feasible repairs',exact:true}).click();await expect(page.getByRole('radio')).toHaveCount(4);
  await page.locator('#volunteer-summary-alex').click();
  const preference=page.getByRole('form',{name:'Edit Alex Rivera constraints'}).getByRole('spinbutton');await preference.fill('95');
  const unknown=structuredClone(sample);unknown.roster.shifts[0].volunteerId='missing-volunteer';
  const duplicate=structuredClone(sample);duplicate.roster.volunteers[1].id=duplicate.roster.volunteers[0].id;
  const badTime=structuredClone(sample);badTime.roster.shifts[0].end=badTime.roster.shifts[0].start;
  const files=[payload('{'),payload({...sample,version:2}),payload(unknown),payload(duplicate),payload(badTime),payload(' '.repeat(131073)),{name:'bad.json',mimeType:'application/json',buffer:Buffer.from([0xff,0xfe,0xfd])}];
  for(const file of files) {
    await picker(page).setInputFiles(file);await expect(page.locator('.rf-file-error')).toBeVisible();await expect(dialog(page)).not.toBeVisible();
    await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');await expect(page.getByRole('radio')).toHaveCount(4);
    await expect(preference).toHaveValue('95');await expect(picker(page)).toHaveValue('');
  }
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();await expect(page.locator('.count').first()).toHaveText('5 / 5 assigned');
  await expect(page.getByRole('button',{name:'Undo last change',exact:true})).toBeDisabled();
});

test('same file can be canceled with Escape, imported repeatedly and undone without demo metadata drift',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();
  for(let i=0;i<3;i++) {
    await stage(page);await page.keyboard.press('Escape');await expect(dialog(page)).not.toBeVisible();await expect(picker(page)).toBeFocused();
    await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
    await stage(page);await confirm(page);
    await expect(page.locator('.rail-content h2')).toHaveText(sample.roster.title);await expect(page.locator('.event-date')).toContainText('2026-11-14');
    await expect(page.locator('.event-date')).not.toContainText('Student commons');
    await page.getByLabel('Try a scenario').selectOption('chain');await expect(page.locator('.rail-content h2')).toHaveText('Campus repair café');
    await page.getByRole('button',{name:'Undo last change',exact:true}).click();
    await expect(page.locator('.rail-content h2')).toHaveText(sample.roster.title);await expect(page.getByLabel('Try a scenario')).toHaveValue('custom');
    await expect(page.getByRole('button',{name:'Record demo cancellation',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Undo last change',exact:true}).click();await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
    await expect(page.getByLabel('Try a scenario')).toHaveValue('chain');
  }
});

test('contradictory pins require explicit draft acknowledgement and remain unrelaxed',async({page})=>{
  const draft=structuredClone(sample);draft.roster.shifts[0].volunteerId='noor';draft.roster.shifts[0].pinned=true;draft.roster.shifts[1].pinned=true;
  await page.goto('/');await stage(page,draft);
  await expect(dialog(page).getByRole('button',{name:'Import roster',exact:true})).toBeDisabled();
  await expect(dialog(page)).toContainText('Unresolved hard constraints');
  const warningAudit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(warningAudit.violations.map(v=>v.id)).toEqual([]);
  await dialog(page).getByLabel('Import this draft with unresolved hard constraints',{exact:true}).press('Space');
  await confirm(page);await expect(page.locator('.roster-warning')).toContainText('overlapping shifts');
  await page.getByRole('button',{name:'Find feasible repairs',exact:true}).click();await expect(page.locator('.search-summary')).toContainText('Conflicting fixed constraints');
  await expect(page.getByRole('button',{name:'Unpin Welcome desk',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Unpin Repair bench',exact:true})).toHaveAttribute('aria-pressed','true');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export roster JSON',exact:true}).click();await download;
  await expect(page.locator('.rf-export-note')).toContainText('Draft export prepared');
});

test('canceling a delayed file read ignores late completion and permits another read',async({page})=>{
  type TestWindow=Window & {rfRelease?:()=>void};
  await page.addInitScript(()=>{const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){const data=await original.call(this);await new Promise<void>(resolve=>{(window as TestWindow).rfRelease=resolve;});return data;};});
  await page.goto('/');await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();
  await picker(page).setInputFiles(payload(sample));await expect(page.getByRole('button',{name:'Cancel file read'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>typeof(window as TestWindow).rfRelease)).toBe('function');
  await page.getByRole('button',{name:'Cancel file read'}).click();await page.evaluate(()=>{(window as TestWindow).rfRelease?.();});
  await expect(dialog(page)).not.toBeVisible();await expect(picker(page)).toBeEnabled();await expect(picker(page)).toBeFocused();
  await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
  await picker(page).setInputFiles(payload(sample));await expect(page.getByRole('button',{name:'Cancel file read'})).toBeVisible();
  await page.evaluate(()=>{(window as TestWindow).rfRelease?.();});await expect(dialog(page)).toBeVisible();await confirm(page);
  await expect(page.locator('.rail-content h2')).toHaveText(sample.roster.title);
});

test('read failures and a native chooser cancellation leave saved edits intact',async({page})=>{
  await page.addInitScript(()=>{File.prototype.arrayBuffer=async()=>{throw new DOMException('Synthetic read failure','NotReadableError');};});
  await page.goto('/');await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();
  await picker(page).setInputFiles([]);await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
  await picker(page).setInputFiles(payload(sample));await expect(page.locator('.rf-file-error')).toContainText('could not read');
  await expect(dialog(page)).not.toBeVisible();await page.getByRole('button',{name:'Undo last change',exact:true}).click();await expect(page.locator('.count').first()).toHaveText('5 / 5 assigned');
});

test('import confirmation is keyboard-contained, mobile-sized and accessible with reduced motion',async({page})=>{
  const long=structuredClone(sample);long.roster.title='T'.repeat(120);long.roster.volunteers[0].name='N'.repeat(120);
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:844});await page.goto('/');await stage(page,long);
    const preview=dialog(page).getByRole('region',{name:'Roster file preview details',exact:true});
    await page.keyboard.press('Shift+Tab');await expect(preview).toBeFocused();
    const scrollable=await preview.evaluate(el=>el.scrollHeight>el.clientHeight);
    if(scrollable){await page.keyboard.press('End');await expect.poll(()=>preview.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);await page.keyboard.press('Home');await expect.poll(()=>preview.evaluate(el=>el.scrollTop)).toBe(0);}
    await page.keyboard.press('Shift+Tab');await expect(dialog(page).getByRole('button',{name:'Import roster',exact:true})).toBeFocused();
    await page.keyboard.press('Tab');await expect(preview).toBeFocused();
    await page.keyboard.press('Tab');await expect(dialog(page).getByRole('button',{name:'Cancel',exact:true})).toBeFocused();
    await page.keyboard.press('Tab');await expect(dialog(page).getByRole('button',{name:'Import roster',exact:true})).toBeFocused();
    await page.keyboard.press('Tab');await expect(preview).toBeFocused();
    const rect=await dialog(page).boundingBox();expect(rect).not.toBeNull();expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.width).toBeLessThanOrEqual(width);
    expect(await dialog(page).evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
    if(width===390)await page.screenshot({path:'test-results/screenshots/import-mobile.png'});
    if(width===1440)await page.screenshot({path:'test-results/screenshots/import-desktop.png'});
    await confirm(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.rf-picker').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  }
});
