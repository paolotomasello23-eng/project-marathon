import { defineConfig } from '@playwright/test';

/* I test girano sulla build di produzione (vite preview): è quella che ha il service worker.
   Il progetto "sync" usa una seconda build, configurata con un indirizzo Supabase finto: le richieste vengono
   intercettate dal test (tests/e2e/fakeSupabase.ts), quindi passano dal vero client Supabase ma non escono in rete. */
const SYNC_ENV = 'VITE_SUPABASE_URL=http://localhost:54399 VITE_SUPABASE_ANON_KEY=chiave-pubblica-di-prova';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  timeout: 30000,
  use: { locale: 'it-IT', timezoneId: 'Europe/Rome', viewport: { width: 390, height: 844 }, trace: 'off' },
  projects: [
    { name: 'app', testIgnore: /sync\.spec\.ts/, use: { baseURL: 'http://localhost:4173' } },
    { name: 'sync', testMatch: /sync\.spec\.ts/, use: { baseURL: 'http://localhost:4174', serviceWorkers: 'block' } }
  ],
  webServer: [
    { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 120000 },
    { command: SYNC_ENV + ' npx vite build --outDir dist-sync --emptyOutDir && npx vite preview --outDir dist-sync --port 4174 --strictPort', url: 'http://localhost:4174', reuseExistingServer: !process.env.CI, timeout: 120000 }
  ]
});
