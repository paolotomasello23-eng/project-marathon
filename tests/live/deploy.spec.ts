/* L'app pubblicata: indirizzi, installabilità, uso offline, configurazione della sincronizzazione. */
import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';

test.skip(!process.env.DEPLOY_URL, 'manca DEPLOY_URL');
const BACKUP = path.resolve('reference/data/backup.json');

async function swReady(page: Page): Promise<void> {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => { const ks = await caches.keys(); let n = 0; for (const k of ks) n += (await (await caches.open(k)).keys()).length; return n; }), { timeout: 60000 }).toBeGreaterThanOrEqual(17);
}

test('indirizzi: ogni pagina dell’app risponde, manifest e service worker non restano in cache', async ({ request }) => {
  for (const p of ['/', '/calendario', '/analisi/qualcosa', '/profilo']) { const r = await request.get(p); expect(r.status(), p).toBe(200); expect(r.headers()['content-type']).toContain('text/html'); }
  const m = await request.get('/manifest.webmanifest'); expect(m.status()).toBe(200); expect((await m.json()).display).toBe('standalone');
  const sw = await request.get('/sw.js'); expect(sw.status()).toBe(200); expect(sw.headers()['cache-control']).toContain('no-cache');
  for (const p of ['/icon-192.png', '/icon-512.png', '/maskable-512.png', '/apple-touch-icon.png']) expect((await request.get(p)).headers()['content-type'], p).toBe('image/png');
});

test('installabile; senza rete si apre, mostra calendario e grafici e salva un allenamento', async ({ page, context }) => {
  await page.goto('/');
  await swReady(page);
  const cdp = await context.newCDPSession(page);
  expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
  await page.setInputFiles('#imp-file', BACKUP);
  await page.getByRole('button', { name: 'Ripristina questo backup' }).click();
  await expect(page.getByRole('heading', { name: 'Oggi', level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Oggi', level: 1 })).toBeVisible();
  await page.goto('/calendario?vista=settimana&data=2026-11-16');
  await expect(page.getByRole('heading', { name: 'Settimana 1 · Base' })).toBeVisible();
  await page.goto('/progressi');
  await expect(page.locator('#charts canvas').first()).toBeVisible();
  await page.goto('/registra');
  await page.locator('input[name="f-k"][value="strength"]').check({ force: true }); await page.locator('#f-min').fill('40');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('.card.an')).toContainText('Forza');
  await page.reload();
  await expect(page.locator('.card.an')).toContainText('Forza');
  await context.setOffline(false);
});

test('sincronizzazione configurata: la build contiene l’indirizzo di Supabase e mostra la scheda Account', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Crea il piano' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account' }), 'la build è stata fatta senza VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY: aggiungile nelle variabili d’ambiente dell’hosting e ripubblica').toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible(); await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accedi', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Crea account' })).toBeVisible();
});
