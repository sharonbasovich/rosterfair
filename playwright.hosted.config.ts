import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'hosted.browser.spec.ts', workers: 1,
  outputDir: 'hosted-results',
  reporter: [['list'], ['json', { outputFile: 'hosted-results/results.json' }]],
  use: {
    baseURL: process.env.ROSTERFAIR_HOSTED_URL ?? 'http://127.0.0.1:4174/rosterfair/',
    browserName: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
  },
});
