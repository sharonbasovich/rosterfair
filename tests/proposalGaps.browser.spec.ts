import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {solveRepairs} from '../src/domain/solver';

test.setTimeout(60_000);

const synthetic={format:'rosterfair-roster',version:1,roster:{id:'gap-test',title:'Synthetic gap roster',date:'2026-11-14',absences:[],
  volunteers:[{id:'v',name:'Synthetic volunteer',capabilities:['welcome'],availability:[{start:600,end:720}],preferredMinutes:60}],
  shifts:[{id:'a',title:'Role A',start:600,end:660,requires:['welcome'],volunteerId:null as string|null,pinned:false},
    {id:'b',title:'Role B',start:600,end:660,requires:['welcome'],volunteerId:null as string|null,pinned:false}]}};

test.beforeEach(({page})=>{page.on('dialog',async d=>{expect(d.type()).toBe('beforeunload');await d.accept();});});

test('selected-gap explanations follow competing proposals without changing the roster',async({page})=>{
  await page.goto('./');
  await page.getByLabel('Choose roster JSON file',{exact:true}).setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(synthetic))});
  await page.getByRole('dialog').getByRole('button',{name:'Import roster',exact:true}).click();
  const current=page.getByRole('table',{name:'Current assignments',exact:true});const saved=await current.innerText();
  await page.getByRole('button',{name:'Find feasible repairs',exact:true}).click();
  await expect(page.locator('.search-summary')).toContainText('Proven maximum: 1 of 2');
  const gaps=page.locator('.proposal-gaps');await gaps.locator('summary').press('Enter');
  await expect(gaps).toContainText('not whether a different complete repair exists');
  for(const index of ['0','1','0']){
    await page.getByLabel('Compare repair',{exact:true}).selectOption(index);
    const heading=await gaps.locator('h4').innerText();const competing=heading.includes('Role A')?'Role B':'Role A';
    await expect(gaps).toContainText(`Assigned in this option to overlapping ${competing} (10:00`);
    await expect(gaps).not.toContainText('Passes the individual checks');
    expect(await current.innerText()).toBe(saved);
  }
  await page.screenshot({path:'test-results/screenshots/proposal-gaps-desktop.png',fullPage:true});
  await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:'test-results/screenshots/proposal-gaps-320.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Apply partial repair',exact:true}).click();await expect(gaps).toHaveCount(0);
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();expect(await current.innerText()).toBe(saved);
});

test('newly opened roles and pinned-open roles receive explanations; full coverage hides them',async({page})=>{
  const value=structuredClone(synthetic);value.roster.shifts[0].volunteerId='v';value.roster.shifts[0].requires=['repair'];value.roster.shifts[1].start=660;value.roster.shifts[1].end=720;
  await page.goto('./');await page.getByLabel('Choose roster JSON file',{exact:true}).setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Import this draft with unresolved hard constraints',{exact:true}).check();await dialog.getByRole('button',{name:'Import roster',exact:true}).click();
  await page.getByRole('button',{name:'Find feasible repairs',exact:true}).click();const gaps=page.locator('.proposal-gaps');await gaps.locator('summary').click();
  await expect(gaps).toContainText('Role A · Becomes open');await expect(gaps).toContainText('Missing capability: repair.');
  await page.screenshot({path:'test-results/screenshots/proposal-gaps-newly-open.png',fullPage:true});
  await page.getByRole('button',{name:'Apply partial repair',exact:true}).click();
  await page.getByRole('button',{name:'Pin Role A',exact:true}).click();await page.getByRole('button',{name:'Find feasible repairs',exact:true}).click();await gaps.locator('summary').click();
  await expect(gaps).toContainText('This slot is pinned open.');await expect(gaps).toContainText('This slot is pinned to its current assignment.');
  await page.getByLabel('Try a scenario').selectOption('chain');await page.getByRole('button',{name:'Record demo cancellation',exact:true}).click();await page.getByRole('button',{name:'Find feasible repairs',exact:true}).click();
  await expect(page.locator('.search-summary')).toContainText('Full coverage is possible');await expect(gaps).toHaveCount(0);
});


test('limited proposals show actual gaps even with inconsistent metadata and make no impossibility claim',async({page})=>{
  const value=structuredClone(synthetic);value.roster.shifts=value.roster.shifts.slice(0,1);
  const result=solveRepairs({...value.roster,revision:1},{maxNodes:0});
  result.options[0].unfilledShiftIds=[];
  await page.addInitScript(result=>{
    const Original=window.Worker;
    window.Worker=class extends Original {
      postMessage(message:{roster:unknown}){
        const signature=JSON.stringify(message.roster);
        result.baseSignature=signature;result.options.forEach(option=>option.baseSignature=signature);
        setTimeout(()=>this.dispatchEvent(new MessageEvent('message',{data:{result}})),0);
      }
    };
  },result);
  await page.goto('./');await page.getByLabel('Choose roster JSON file',{exact:true}).setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await page.getByRole('dialog').getByRole('button',{name:'Import roster',exact:true}).click();
  await page.getByRole('button',{name:'Find feasible repairs',exact:true}).click();
  await expect(page.locator('.search-summary')).toContainText('Search limit reached');
  const gaps=page.locator('.proposal-gaps');await gaps.locator('summary').click();
  await expect(gaps).toContainText('Role A');await expect(gaps).toContainText('Passes the individual checks');
  await expect(gaps).toContainText('This does not establish a complete repair or a proven ranking.');
  await expect(page.locator('.search-summary')).not.toContainText('impossible');
});
