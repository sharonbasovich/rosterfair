import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const sample=await readFile('examples/one-day-roster.json','utf8');
const exitProtected=(page:Page)=>page.evaluate(()=>{
  const event=new Event('beforeunload',{cancelable:true});
  window.dispatchEvent(event);
  return event.defaultPrevented;
});
const form=(page:Page)=>page.getByRole('form',{name:'Edit Eli Parker constraints'});
const undo=(page:Page)=>page.getByRole('button',{name:'Undo last change',exact:true});

test('pristine demos stay quiet; pending, invalid and saved volunteer edits are protected',async({page})=>{
  await page.goto('/');
  expect(await exitProtected(page)).toBe(false);
  await page.getByLabel('Try a scenario').selectOption('impossible');
  expect(await exitProtected(page)).toBe(false);
  await page.getByLabel('Try a scenario').selectOption('chain');
  await page.locator('#volunteer-summary-eli').click();
  await form(page).getByRole('spinbutton').fill('');
  await expect(page.locator('.rf-exit-warning')).toBeVisible();
  expect(await exitProtected(page)).toBe(true);
  await form(page).getByRole('button',{name:'Save constraints',exact:true}).click();
  await expect(form(page).getByRole('alert')).toBeVisible();
  expect(await exitProtected(page)).toBe(true);
  await form(page).getByRole('button',{name:'Discard unsaved changes',exact:true}).click();
  await expect(page.locator('.rf-exit-warning')).toHaveCount(0);
  expect(await exitProtected(page)).toBe(false);
  await form(page).getByRole('spinbutton').fill('90');
  await form(page).getByRole('button',{name:'Save constraints',exact:true}).click();
  await expect(page.locator('#volunteer-summary-eli')).toContainText('90 min preferred');
  expect(await exitProtected(page)).toBe(true);
  await undo(page).click();
  await expect(page.locator('.rf-exit-warning')).toHaveCount(0);
  expect(await exitProtected(page)).toBe(false);
});

test('cancellation, apply and export remain protected; undo to the built-in roster clears it',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();
  expect(await exitProtected(page)).toBe(true);
  await page.getByRole('button',{name:'Find feasible repairs',exact:true}).click();
  await page.getByRole('button',{name:'Apply option A',exact:true}).click();
  await expect(page.locator('.notice')).toBeFocused();
  expect(await exitProtected(page)).toBe(true);
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export roster JSON',exact:true}).click();
  await downloaded;
  await expect(page.locator('.rf-export-note')).toContainText('Export prepared');
  expect(await exitProtected(page)).toBe(true);
  await undo(page).click();expect(await exitProtected(page)).toBe(true);
  await undo(page).click();
  await expect(page.locator('.rf-exit-warning')).toHaveCount(0);
  expect(await exitProtected(page)).toBe(false);
});

test('canceled or failed imports preserve protection; imported data and undo use the retained file',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();
  const picker=page.getByLabel('Choose roster JSON file',{exact:true});
  const payload=(text:string)=>({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(text)});
  await picker.setInputFiles(payload('{'));
  await expect(page.locator('.rf-file-error')).toBeVisible();
  expect(await exitProtected(page)).toBe(true);
  await picker.setInputFiles(payload(sample));
  const preview=page.getByRole('dialog');
  await expect(preview).toBeVisible();await preview.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await exitProtected(page)).toBe(true);
  await picker.setInputFiles(payload(sample));
  await expect(preview).toBeVisible();await preview.getByRole('button',{name:'Import roster',exact:true}).click();
  await expect(preview).not.toBeVisible();
  await expect(page.locator('.rf-exit-warning')).toHaveCount(0);
  expect(await exitProtected(page)).toBe(false);
  await page.getByRole('button',{name:'Pin Welcome desk',exact:true}).click();
  expect(await exitProtected(page)).toBe(true);
  await undo(page).click();expect(await exitProtected(page)).toBe(false);
  await undo(page).click();expect(await exitProtected(page)).toBe(true);
});

test('actual reload warning can be canceled without losing a draft and accepted deliberately',async({page})=>{
  await page.goto('/');
  await page.locator('#volunteer-summary-eli').click();
  await form(page).getByRole('spinbutton').fill('90');
  await expect(page.locator('.rf-exit-warning')).toBeVisible();
  const canceled=page.waitForEvent('dialog');
  // A dismissed CDP reload can stay pending until its navigation timeout.
  // A page-initiated reload exercises Cancel without awaiting that promise.
  await page.evaluate(()=>{setTimeout(()=>location.reload(),0);});
  const first=await canceled;expect(first.type()).toBe('beforeunload');await first.dismiss();
  await expect(form(page).getByRole('spinbutton')).toHaveValue('90');
  expect(await exitProtected(page)).toBe(true);
  const allowed=page.waitForEvent('dialog');
  const reload=page.waitForEvent('load');
  await page.evaluate(()=>{setTimeout(()=>location.reload(),0);});
  const second=await allowed;expect(second.type()).toBe('beforeunload');await second.accept();await reload;
  await expect(page.locator('#volunteer-summary-eli')).toContainText('120 min preferred');
  expect(await exitProtected(page)).toBe(false);
});

test('failed download does not imply a saved file, and warning remains readable at narrow widths',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();
  await page.evaluate(()=>{URL.createObjectURL=()=>{throw new Error('Synthetic download failure');};});
  await page.getByRole('button',{name:'Export roster JSON',exact:true}).click();
  await expect(page.locator('.rf-file-error')).toContainText('could not start');
  expect(await exitProtected(page)).toBe(true);
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});
    await expect(page.locator('.rf-exit-warning')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(audit.violations.map(violation=>violation.id)).toEqual([]);
});
