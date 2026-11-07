import { expect, test, type Page } from '@playwright/test';

async function orphanDraftCapability(page: Page, volunteerFirst = false) {
  await page.goto('./');
  await page.locator('#volunteer-summary-maya').click();
  const maya = page.getByRole('form', { name: 'Edit Maya Chen constraints', exact: true });
  await maya.getByRole('checkbox', { name: 'photography', exact: true }).check();
  await maya.getByRole('spinbutton', { name: /Preferred workload/ }).fill('90');
  await page.getByText('Edit role requirements', { exact: true }).click();
  await page.locator('.shift-editor select').selectOption('photos');
  const removeRoleSource = async () => {
    const checkbox = page.locator('.shift-editor').getByRole('checkbox', { name: 'photography', exact: true });
    await expect(checkbox).toBeChecked();
    // The last saved source disappears after this click; uncheck() expects the
    // target to remain attached while it verifies the changed checked state.
    await checkbox.click();
  };
  const removeVolunteerSource = async () => {
    await page.locator('#volunteer-summary-jun').click();
    const jun = page.getByRole('form', { name: 'Edit Jun Lee constraints', exact: true });
    await jun.getByRole('checkbox', { name: 'photography', exact: true }).uncheck();
    await jun.getByRole('button', { name: 'Save constraints', exact: true }).click();
  };
  if (volunteerFirst) { await removeVolunteerSource(); await removeRoleSource(); }
  else { await removeRoleSource(); await removeVolunteerSource(); }
  await expect(page.getByRole('button', { name: 'Find feasible repairs', exact: true })).toBeDisabled();
  await expect(maya.getByRole('spinbutton', { name: /Preferred workload/ })).toHaveValue('90');
  return maya;
}

for (const { width, volunteerFirst } of [{ width: 320, volunteerFirst: false }, { width: 1280, volunteerFirst: true }]) {
  test(`orphaned draft capability remains visible and keyboard-reversible at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const maya = await orphanDraftCapability(page, volunteerFirst);
    const photography = maya.getByRole('checkbox', { name: 'photography', exact: true });
    await expect(photography).toBeChecked();
    await expect(photography).toBeVisible();
    await photography.focus();
    await page.screenshot({ path: testInfo.outputPath(`draft-capability-${width}.png`) });
    await page.keyboard.press('Space');
    await expect(photography).not.toBeChecked();
    await expect(photography).toBeFocused();
    await page.keyboard.press('Space');
    await expect(photography).toBeChecked();
    await page.keyboard.press('Space');
    await expect(photography).not.toBeChecked();
    await expect(photography).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(maya.getByRole('checkbox', { name: 'repair', exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(maya.getByRole('spinbutton', { name: /Preferred workload/ })).toHaveValue('90');
    await maya.getByRole('button', { name: 'Save constraints', exact: true }).click();
    await expect(page.locator('#volunteer-summary-maya')).toBeFocused();
    await expect(photography).toHaveCount(0);
    await expect(maya.getByRole('spinbutton', { name: /Preferred workload/ })).toHaveValue('90');
    await expect(page.getByRole('button', { name: 'Find feasible repairs', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
    await page.locator('#volunteer-summary-maya').click();
    await expect(maya.getByRole('spinbutton', { name: /Preferred workload/ })).toHaveValue('120');
    await expect(photography).toHaveCount(0);
  });
}

test('saving a visible orphaned capability retains exactly that choice and workload', async ({ page }) => {
  const maya = await orphanDraftCapability(page);
  const photography = maya.getByRole('checkbox', { name: 'photography', exact: true });
  await expect(photography).toBeChecked();
  await maya.getByRole('button', { name: 'Save constraints', exact: true }).click();
  await expect(photography).toBeChecked();
  await expect(maya.getByRole('checkbox', { name: 'welcome', exact: true })).toBeChecked();
  await expect(maya.getByRole('spinbutton', { name: /Preferred workload/ })).toHaveValue('90');
  await expect(maya.getByRole('button', { name: 'Save constraints', exact: true })).toBeDisabled();
  await expect(page.locator('.shift-editor').getByRole('checkbox', { name: 'photography', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await expect(page.locator('.search-summary')).toContainText('Full coverage is possible');
  await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
  await page.locator('#volunteer-summary-maya').click();
  await expect(photography).toHaveCount(0);
  await expect(maya.getByRole('spinbutton', { name: /Preferred workload/ })).toHaveValue('120');
});

test('discarding a visible orphaned capability clears draft choices without changing other saved edits', async ({ page }) => {
  const maya = await orphanDraftCapability(page);
  const photography = maya.getByRole('checkbox', { name: 'photography', exact: true });
  await expect(photography).toBeChecked();
  await maya.getByRole('button', { name: 'Discard unsaved changes', exact: true }).click();
  await expect(photography).toHaveCount(0);
  await expect(maya.getByRole('spinbutton', { name: /Preferred workload/ })).toHaveValue('120');
  await expect(page.getByRole('button', { name: 'Find feasible repairs', exact: true })).toBeEnabled();
  await expect(page.locator('#volunteer-summary-jun')).toContainText('0 capabilities');
  await expect(page.locator('.shift-editor').getByRole('checkbox', { name: 'photography', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
  await expect(page.locator('#volunteer-summary-jun')).toContainText('1 capability');
  await page.locator('#volunteer-summary-maya').click();
  await expect(photography).not.toBeChecked();
  await expect(page.locator('.shift-editor').getByRole('checkbox', { name: 'photography', exact: true })).not.toBeChecked();
});
