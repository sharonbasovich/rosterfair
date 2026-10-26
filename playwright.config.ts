import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:['browser.spec.ts','rosterFiles.browser.spec.ts'],fullyParallel:false,workers:1,
  reporter:[['list'],['json',{outputFile:'test-results/results.json'}]],
  use:{baseURL:process.env.ROSTERFAIR_TEST_URL??'http://127.0.0.1:5173',channel:process.env.CI?'chromium':'chrome',headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure'},
});
