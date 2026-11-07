import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const sheet = (page: Page) => page.getByRole('article', { name: 'Printable saved roster' });
const review = (page: Page) => page.getByRole('button', { name: 'Review printable roster', exact: true });
const sample = JSON.parse(await readFile('examples/one-day-roster.json', 'utf8'));
async function importFixture(page: Page, value: unknown, warning = false) {
  await page.getByLabel('Choose roster JSON file', { exact: true }).setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  const dialog = page.getByRole('dialog');
  if (warning) await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Import roster', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test('saved cancellation, unapplied selection, apply and undo without transmission', async ({ page, baseURL }, info) => {
  const requests: string[] = [];
  page.on('request', r => { if (!r.url().startsWith(baseURL!) || r.method() !== 'GET') requests.push(r.url()); });
  await page.goto('./'); await review(page).press('Enter');
  const welcome = sheet(page).getByRole('row').filter({ hasText: 'Role ID: welcome' });
  await expect(welcome).toContainText('Maya Chen');
  await page.getByRole('button', { name: 'Record demo cancellation', exact: true }).click();
  await expect(sheet(page)).toContainText('4 of 5 roles assigned · 1 unfilled');
  await expect(welcome).toContainText('UNFILLED');
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await page.getByRole('radio', { name: /Option B 5/ }).check();
  await expect(welcome).toContainText('UNFILLED');
  await expect(sheet(page)).toContainText('Repair previews are NOT applied or included');
  await page.getByRole('button', { name: 'Apply option B', exact: true }).click();
  await expect(sheet(page)).toContainText('5 of 5 roles assigned · 0 unfilled');
  await expect(welcome).toContainText('Noor Ali');
  await page.emulateMedia({ media: 'print' });
  for (const selector of ['.repair-panel','.rf-files','.inputs-section','.event-rail']) await expect(page.locator(selector)).not.toBeVisible();
  await expect(sheet(page)).toBeVisible();
  const pdf = await page.pdf({ path: info.outputPath('repaired-handoff.pdf'), format: 'A4' });
  expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('repaired-print.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
  await expect(sheet(page)).toContainText('4 of 5 roles assigned · 1 unfilled'); expect(requests).toEqual([]);
});
test('drafts survive repeated review and print returning, then save or discard explicitly', async ({ page }) => {
  await page.goto('./'); await page.locator('#volunteer-summary-maya').click();
  const form = page.getByRole('form', { name: 'Edit Maya Chen constraints', exact: true });
  await form.getByRole('spinbutton').fill('90');
  await form.getByRole('checkbox', { name: 'welcome', exact: true }).uncheck();
  await review(page).press('Enter');
  await expect(sheet(page)).toContainText('Unsaved volunteer edits are NOT included');
  await expect(sheet(page)).not.toContainText('DRAFT — unresolved');
  // No-op exercises return from print, not native print-preview or Cancel.
  await page.evaluate(() => { window.print = () => {}; });
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Print saved roster', exact: true }).press('Enter');
    await expect(page.getByRole('button', { name: 'Print saved roster', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Hide printable roster', exact: true }).press('Enter');
    await expect(review(page)).toBeFocused(); await review(page).press('Enter');
    await expect(form.getByRole('spinbutton')).toHaveValue('90');
  }
  await expect(page.getByRole('button', { name: 'Undo last change', exact: true })).toBeDisabled();
  await form.getByRole('button', { name: 'Save constraints', exact: true }).click();
  await expect(sheet(page)).not.toContainText('Unsaved volunteer edits');
  await expect(sheet(page)).toContainText('DRAFT — unresolved assignment conflicts');
  await expect(sheet(page).getByRole('row').filter({ hasText: 'Role ID: welcome' })).toContainText('Needs review');
  await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
  await expect(sheet(page)).not.toContainText('DRAFT — unresolved');
  await page.locator('#volunteer-summary-maya').click(); await form.getByRole('spinbutton').fill('90');
  await form.getByRole('button', { name: 'Discard unsaved changes', exact: true }).click();
  await expect(sheet(page)).not.toContainText('Unsaved volunteer edits'); await expect(form.getByRole('spinbutton')).toHaveValue('120');
});
test('collapsed browser print excludes import preview and personal input details', async ({ page }, info) => {
  await page.goto('./'); const fixture = structuredClone(sample);
  fixture.roster.absences = [{ volunteerId: fixture.roster.volunteers[0].id, start: 0, end: 1440, reason: 'PRIVATE-REASON-DO-NOT-PRINT' }];
  fixture.roster.volunteers[0].capabilities.push('PRIVATE-CAPABILITY-DO-NOT-PRINT');
  await importFixture(page, fixture, true);
  const staged = { ...fixture, roster: { ...fixture.roster, title: 'UNCONFIRMED-IMPORT-TITLE' } };
  await page.getByLabel('Choose roster JSON file', { exact: true }).setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(staged)) });
  await expect(page.getByRole('dialog')).toBeVisible(); await page.emulateMedia({ media: 'print' });
  await expect(sheet(page)).toBeVisible(); await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(sheet(page)).toContainText('DRAFT — unresolved assignment conflicts');
  await expect(sheet(page)).not.toContainText('PRIVATE-'); await expect(sheet(page)).not.toContainText('UNCONFIRMED-IMPORT-TITLE');
  const pdf = await page.pdf({ path: info.outputPath('conflicted-handoff.pdf'), format: 'Letter' });
  expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
});
for (const width of [320, 1280]) test(`maximum roster and long names at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('./'); const fixture = structuredClone(sample);
  fixture.roster.title = 'Synthetic maximum handoff '.padEnd(120, 'E');
  fixture.roster.volunteers = Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`.padEnd(48, 'v'), name: `Synthetic volunteer ${i} `.padEnd(120, 'N'), capabilities: [], availability: [{ start: 0, end: 1440 }], preferredMinutes: 120 }));
  fixture.roster.shifts = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`.padEnd(48, 's'), title: `Synthetic role ${i} `.padEnd(120, 'R'), start: i * 60, end: i * 60 + 60, requires: [], volunteerId: i < 3 ? null : `v${i}`.padEnd(48, 'v'), pinned: i === 0 || i === 3 })); fixture.roster.absences = [];
  await importFixture(page, fixture); await review(page).press('Enter');
  await expect(sheet(page)).toContainText('9 of 12 roles assigned · 3 unfilled'); await expect(sheet(page).getByRole('row')).toHaveCount(14);
  await expect(sheet(page)).toContainText('Pinned open');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect((await new AxeBuilder({ page }).include('.roster-handoff').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await sheet(page).screenshot({ path: info.outputPath(`maximum-screen-${width}.png`) });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: info.outputPath(`maximum-${width}.pdf`), format: width === 320 ? 'Letter' : 'A4' });
  await page.screenshot({ path: info.outputPath(`maximum-print-${width}.png`), fullPage: true });
  await page.emulateMedia({ media: 'screen' }); await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
  await expect(sheet(page)).toContainText('5 of 5 roles assigned · 0 unfilled');
});
test('print failure reports honestly without roster changes', async ({ page }) => {
  await page.goto('./'); await review(page).click();
  await page.evaluate(() => { window.print = () => { throw new Error('synthetic failure'); }; });
  await page.getByRole('button', { name: 'Print saved roster', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not open printing');
  await expect(sheet(page)).toContainText('5 of 5 roles assigned · 0 unfilled');
  await expect(page.getByRole('button', { name: 'Undo last change', exact: true })).toBeDisabled();
});

test('overlapping saved assignments flag both rows without disclosing input reasons', async ({ page }) => {
  await page.goto('./'); await page.locator('#demo').selectOption('pin-conflict'); await review(page).click();
  await expect(sheet(page)).toContainText('DRAFT — unresolved assignment conflicts');
  expect(await sheet(page).getByRole('row').filter({ hasText: 'Needs review' }).count()).toBeGreaterThanOrEqual(2);
});
