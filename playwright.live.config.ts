import { defineConfig } from '@playwright/test';

/* Controlli sull'app pubblicata: DEPLOY_URL=https://… npm run test:deploy
   Non fanno l'accesso e non toccano i dati dell'account: usano un browser pulito e il backup di riferimento. */
export default defineConfig({
  testDir: 'tests/live',
  testMatch: /deploy\.spec\.ts/,
  timeout: 120000,
  reporter: [['list']],
  use: {
    baseURL: process.env.DEPLOY_URL,
    locale: 'it-IT', timezoneId: 'Europe/Rome', viewport: { width: 390, height: 844 }, trace: 'off',
    // dove la rete passa da un proxy (come nell'ambiente di sviluppo in cloud) lo usa anche il browser
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined
  }
});
