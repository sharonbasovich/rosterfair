import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('missing worker remains explicit and allows retry without changing assignments', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Record demo cancellation', exact: true }).click();
  await page.route('**/solver.worker-*.js', route => route.abort());
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Search could not finish');
  await expect(page.locator('.notice')).toContainText('Search could not finish.');
  await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
  await expect(page.getByRole('button', { name: 'Find feasible repairs', exact: true })).toBeEnabled();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'hosted-results/worker-error.png', fullPage: true });
  await page.unroute('**/solver.worker-*.js');
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await expect(page.locator('.search-summary')).toContainText('Full coverage is possible');
  await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
});

test('prefixed static app loads its worker and completes repair, compare, apply and undo without data transmission', async ({ page, context, baseURL }) => {
  const requests: { url: string; method: string; body: string | null }[] = [];
  const errors: string[] = [];
  context.on('requestfailed', r => errors.push(`Request failed: ${r.url()}`));
  context.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  context.on('request', r => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('One cancellation.');
  await page.getByRole('button', { name: 'Record demo cancellation', exact: true }).click();
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await expect(page.locator('.search-summary')).toContainText('Full coverage is possible');
  await expect(page.getByRole('radio')).toHaveCount(4);
  await page.getByRole('radio', { name: /Option B 5/ }).check();
  await expect(page.locator('.plan-detail')).toContainText('Alex Rivera');
  await page.getByRole('button', { name: 'Apply option B', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('Repair applied');
  await page.getByRole('button', { name: 'Undo last change', exact: true }).click();
  await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
  await page.locator('#volunteer-summary-maya').click();
  const form = page.getByRole('form', { name: 'Edit Maya Chen constraints' });
  await form.getByLabel('Maya Chen window 1 end', { exact: true }).fill('14:00');
  await form.getByLabel('welcome', { exact: true }).uncheck();
  await form.getByRole('button', { name: 'Save constraints', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('Volunteer inputs saved');
  await page.reload();
  await expect(page.locator('.count').first()).toHaveText('5 / 5 assigned');
  expect(errors).toEqual([]);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(r => r.url.startsWith(baseURL!) && r.method === 'GET' && r.body === null && new URL(r.url).search === '')).toBe(true);
  expect(requests.some(r => /solver\.worker.*\.js/.test(r.url))).toBe(true);
});

for (const width of [390, 1440]) test(`rendered hosted workflow at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('./');
  await page.screenshot({ path: `hosted-results/arrival-${width}.png`, fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to roster' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Record demo cancellation', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).press('Enter');
  await expect(page.locator('.search-summary')).toBeFocused();
  await expect(page.locator('.search-summary')).toContainText('Full coverage is possible');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `hosted-results/repair-${width}.png`, fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  const filter = page.locator('.preview-filter');
  expect(await filter.evaluate(e => getComputedStyle(e).transitionProperty)).toBe('transform');
  await filter.press('Enter');
  await page.locator('.repair-preview summary').first().press('Enter');
  await page.screenshot({ path: `hosted-results/expanded-${width}.png`, fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.plan-detail').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
  expect(await page.locator('.apply-button').evaluate(e => getComputedStyle(e).transitionDuration)).toBe('0s');
  await page.getByLabel('Try a scenario').selectOption('impossible');
  await page.getByRole('button', { name: 'Record demo cancellation', exact: true }).click();
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await expect(page.locator('.search-summary')).toContainText('Full coverage is impossible');
  await page.screenshot({ path: `hosted-results/impossible-${width}.png`, fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

// Only the first search is substituted. A retry must use the real bundled worker.
for (const failure of ['worker-error', 'message-error', 'error-reply', 'null-reply', 'partial-reply', 'timeout'] as const) {
  test(`${failure} ends the live status and permits a real retry`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(mode => {
      const NativeWorker = window.Worker;
      let first = true;
      window.Worker = class extends EventTarget {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: ErrorEvent) => void) | null = null;
        onmessageerror: ((event: MessageEvent) => void) | null = null;
        constructor(url: string | URL, options?: WorkerOptions) {
          super();
          if (!first) return new NativeWorker(url, options);
          first = false;
        }
        postMessage(message: unknown) { void message;
          queueMicrotask(() => {
            if (mode === 'worker-error') this.onerror?.(new ErrorEvent('error'));
            if (mode === 'message-error') this.onmessageerror?.(new MessageEvent('messageerror'));
            if (mode === 'error-reply') this.onmessage?.(new MessageEvent('message', { data: { error: 'Synthetic search failure.' } }));
            if (mode === 'null-reply') this.onmessage?.(new MessageEvent('message', { data: null }));
            if (mode === 'partial-reply') this.onmessage?.(new MessageEvent('message', { data: { result: { options: [] } } }));
          });
        }
        terminate() { /* Synthetic worker has no background work. */ }
      } as unknown as typeof Worker;
    }, failure);
    await page.goto('./');
    await page.getByRole('button', { name: 'Record demo cancellation', exact: true }).click();
    const savedRoster = await page.locator('.schedule-section').textContent();
    if (failure === 'timeout') await page.clock.install();
    await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
    if (failure === 'timeout') {
      await expect(page.locator('.notice')).toContainText('Searching.');
      await page.clock.fastForward(10_001);
    }
    await expect(page.getByRole('alert')).toContainText('Search could not finish');
    await expect(page.locator('.notice')).toHaveText('Search could not finish. Your roster has not changed; you can try again.');
    await expect(page.locator('.repair-panel')).toHaveAttribute('aria-busy', 'false');
    expect(await page.locator('.schedule-section').textContent()).toBe(savedRoster);
    await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
    await expect(page.getByRole('button', { name: 'Find feasible repairs', exact: true })).toBeEnabled();
    if (failure === 'timeout') {
      await page.screenshot({ path: 'hosted-results/worker-timeout.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 900 });
      await page.screenshot({ path: 'hosted-results/worker-timeout-390.png', fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    }
    await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
    await expect(page.locator('.search-summary')).toContainText('Full coverage is possible');
    await expect(page.locator('.notice')).toHaveText('Search complete. Compare the changes before applying a repair.');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await page.locator('.schedule-section').textContent()).toBe(savedRoster);
    await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
    if (failure === 'timeout') {
      await page.clock.fastForward(20_000);
      await expect(page.locator('.notice')).toContainText('Search complete.');
    }
    expect(errors).toEqual([]);
  });
}

test('editing cancels a stalled search and ignores its late failure and timeout', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let first = true;
    window.Worker = class extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      constructor(url: string | URL, options?: WorkerOptions) {
        super();
        if (!first) return new NativeWorker(url, options);
        first = false;
      }
      postMessage(message: unknown) { void message; setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: null })), 2_000); }
      terminate() { /* Deliberately deliver an already-queued stale event. */ }
    } as unknown as typeof Worker;
  });
  await page.goto('./');
  await page.clock.install();
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await page.getByLabel('Try a scenario').selectOption('impossible');
  await expect(page.locator('.notice')).toContainText('Demo loaded.');
  await page.clock.fastForward(20_000);
  await expect(page.locator('.notice')).toContainText('Demo loaded.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.repair-panel')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Record demo cancellation', exact: true }).click();
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await expect(page.locator('.search-summary')).toContainText('Full coverage is impossible');
});

test('immediate pointer export after apply downloads the repaired roster', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Record demo cancellation', exact: true }).click();
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await page.getByRole('button', { name: 'Apply option A', exact: true }).click();
  // Deliberately do not wait for Apply's notice-focus transition before clicking.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export roster JSON', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  expect(await download.failure()).toBeNull();
  await expect(page.locator('.count').first()).toHaveText('5 / 5 assigned');
});

// Use an actual bounded solver result, then let retry run the real browser worker.
test('unchanged limited option does not claim improvement is impossible', async ({ page }) => {
  const { cancelAssignment, loadFixture, solveRepairs } = await import('../src/domain');
  const edit = cancelAssignment(loadFixture('chain'), 'welcome');
  if (!edit.ok) throw new Error(edit.error);
  const result = solveRepairs(edit.session.roster, { maxNodes: 2, maxMs: 1500 });
  expect(result.status).toBe('limited');
  expect(result.options[0].changes).toEqual([]);
  await page.addInitScript(result => {
    const NativeWorker = window.Worker;
    let first = true;
    window.Worker = class extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(url: string | URL, options?: WorkerOptions) {
        super();
        if (!first) return new NativeWorker(url, options);
        first = false;
      }
      postMessage() { queueMicrotask(() => this.onmessage?.(new MessageEvent('message', { data: { result } }))); }
      terminate() { /* The bounded result is computed before browser startup. */ }
    } as unknown as typeof Worker;
  }, result);
  await page.goto('./');
  await page.getByRole('button', { name: 'Record demo cancellation', exact: true }).click();
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await expect(page.locator('.search-summary')).toContainText('Search limit reached');
  await expect(page.locator('.search-summary')).toContainText('optimality is not proven');
  await expect(page.locator('.plan-detail')).toContainText('This option keeps the current assignments unchanged.');
  await expect(page.locator('.plan-detail')).not.toContainText('No feasible improvement');
  await expect(page.locator('.apply-button')).toBeDisabled();
  await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `hosted-results/limited-unchanged-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Find repairs again', exact: true }).click();
  await expect(page.locator('.search-summary')).toContainText('Full coverage is possible');
  await expect(page.locator('.apply-button')).toBeEnabled();
  await expect(page.locator('.change-list li')).toHaveCount(2);
  await expect(page.locator('.count').first()).toHaveText('4 / 5 assigned');
});

test('unchanged optimal option states only what this option does', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Find feasible repairs', exact: true }).click();
  await expect(page.locator('.search-summary')).toContainText('Full coverage is possible');
  await expect(page.locator('.plan-detail')).toContainText('This option keeps the current assignments unchanged.');
  await expect(page.locator('.apply-button')).toBeDisabled();
  await expect(page.locator('.count').first()).toHaveText('5 / 5 assigned');
});
