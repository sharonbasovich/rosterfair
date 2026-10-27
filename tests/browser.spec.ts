import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function search(page:Page) {
  await page.getByRole('button',{name:/Find (feasible repairs|repairs again)/}).click();
  await expect(page.locator('.search-summary')).toBeVisible();
  await expect(page.locator('.search-summary')).toBeFocused();
}
test('keyboard cancellation, compare, apply, undo and repeat preserve an inspectable roster',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link',{name:'Skip to roster'})).toBeFocused();
  await page.getByRole('button',{name:'Record demo cancellation',exact:true}).press('Enter');
  await expect(page.locator('.notice')).toBeFocused();
  await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
  for(let i=0;i<3;i++) {
    await search(page);
    await expect(page.getByText('Full coverage is possible',{exact:true})).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(4);
    await page.getByRole('radio',{name:/Option B 5/}).press('Space');
    await expect(page.locator('.plan-detail')).toContainText('Alex Rivera');
    await page.getByText('Inspect workload & ranking',{exact:true}).click();
    await expect(page.locator('.load-details')).toContainText('60 over preference');
    await page.getByRole('button',{name:'Apply option B',exact:true}).press('Enter');
    await expect(page.locator('.notice')).toBeFocused();
    await expect(page.locator('.notice')).toContainText('Repair applied');
    await expect(page.getByRole('row').filter({hasText:'Welcome desk'})).toContainText('Noor Ali');
    await expect(page.getByRole('row').filter({hasText:'Repair bench'})).toContainText('Alex Rivera');
    await expect(page.getByRole('button',{name:'Record demo cancellation',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'Undo last change',exact:true}).press('Enter');
    await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByRole('row').filter({hasText:'Repair bench'})).toContainText('Noor Ali');
  }
  expect(errors).toEqual([]);
});
test('infeasibility and contradictory pins stay explicit, with no silent relaxation',async({page})=>{
  await page.goto('/');await page.getByLabel('Try a scenario').selectOption('impossible');
  await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();await search(page);
  await expect(page.locator('.search-summary')).toContainText('Full coverage is impossible');
  await expect(page.locator('.search-summary')).toContainText('Proven maximum: 4 of 5');
  await expect(page.getByRole('button',{name:'Unpin Tool station',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:'test-results/screenshots/impossible-desktop.png',fullPage:true});
  await page.getByLabel('Try a scenario').selectOption('pin-conflict');
  await expect(page.locator('.roster-warning')).toContainText('overlapping shifts');
  await expect(page.getByRole('button',{name:'Record demo cancellation',exact:true})).toHaveCount(0);
  await search(page);await expect(page.locator('.search-summary')).toContainText('Conflicting fixed constraints');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('button',{name:'Unpin Welcome desk',exact:true}).click();
  await search(page);await expect(page.locator('.search-summary')).toContainText('Full coverage is possible');
});
test('constraint form rejects invalid times, saves explicitly, warns, invalidates plans, and undoes',async({page})=>{
  await page.goto('/');await search(page);
  await page.locator('#volunteer-summary-maya').click();
  const form=page.getByRole('form',{name:'Edit Maya Chen constraints'});
  await form.getByLabel('Maya Chen window 1 end',{exact:true}).fill('09:00');
  await form.getByRole('button',{name:'Save constraints',exact:true}).click();
  await expect(form.getByRole('alert')).toContainText('end must be later');
  await expect(form.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('radio')).toHaveCount(4);
  await form.getByLabel('Maya Chen window 1 end',{exact:true}).fill('14:00');
  await form.getByLabel('welcome',{exact:true}).uncheck();
  await form.getByRole('button',{name:'Save constraints',exact:true}).press('Enter');
  await expect(page.locator('#volunteer-summary-maya')).toBeFocused();
  await expect(page.locator('.roster-warning')).toContainText('Maya Chen does not meet');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();
  await expect(page.locator('.roster-warning')).toHaveCount(0);
  await page.getByText('Edit role requirements',{exact:true}).click();
  await page.locator('.shift-editor').getByLabel('photography',{exact:true}).check();
  await expect(page.locator('.roster-warning')).toContainText('Maya Chen does not meet');
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();
  await expect(page.locator('.roster-warning')).toHaveCount(0);
});
test('responsive layouts, touch targets, reduced motion and automated accessibility',async({page})=>{
  for(const width of [320,390,768,1024,1440]) {
    await page.setViewportSize({width,height:900});await page.goto('/');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();await search(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByRole('radio',{name:/Option A /}).check();
    await expect(page.getByRole('button',{name:'Apply option A',exact:true})).toBeVisible();
    if(width===390) {
      const buttons=await page.locator('.row-actions button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
      expect(buttons.every(h=>h>=44)).toBe(true);
      await page.screenshot({path:'test-results/screenshots/mobile-comparison.png',fullPage:true});
      const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(a11y.violations).toEqual([]);
    }
    if(width===1440) {
      await page.screenshot({path:'test-results/screenshots/desktop-final.png',fullPage:true});
      const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(a11y.violations).toEqual([]);
    }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.plan-detail').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  expect(await page.locator('.apply-button').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
});
test('initial roster, expanded form, impossible case and pin conflicts pass automated accessibility',async({page})=>{
  await page.goto('/');
  const audit=async()=>{const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);};
  await audit();
  await page.locator('#volunteer-summary-maya').click();await audit();
  const form=page.getByRole('form',{name:'Edit Maya Chen constraints'});
  await form.getByLabel('Maya Chen window 1 end',{exact:true}).fill('09:00');
  await form.getByRole('button',{name:'Save constraints',exact:true}).click();await audit();
  await page.getByLabel('Try a scenario').selectOption('impossible');
  await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();await search(page);await audit();
  await page.getByLabel('Try a scenario').selectOption('pin-conflict');await search(page);await audit();
});
