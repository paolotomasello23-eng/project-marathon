import { defineConfig } from '@playwright/test';

/* I test girano sulla build di produzione (vite preview): è quella che ha il service worker. */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    viewport: { width: 390, height: 844 },
    trace: 'off'
  },
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 120000 }
});
