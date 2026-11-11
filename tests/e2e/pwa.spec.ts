/* Fase 3: l'app è installabile e, senza rete, si apre e salva un allenamento. */
import { expect, type Page, test } from '@playwright/test';
import { dayRow, start, toast } from './helpers';

/** Aspetta che il service worker controlli la pagina e abbia finito di mettere in cache la shell. */
async function swReady(page: Page): Promise<void> {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async () => { const ks = await caches.keys(); let n = 0; for (const k of ks) n += (await (await caches.open(k)).keys()).length; return n; })).toBeGreaterThanOrEqual(17);
}

test('manifest: nome, icone 192/512 e maskable, display standalone, colori del tema; icona e meta per iOS', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const m = await (await request.get(href as string)).json();
  expect(m).toMatchObject({ name: 'Madrid 27', short_name: 'Madrid 27', display: 'standalone', start_url: '/', scope: '/', lang: 'it', theme_color: '#18212C', background_color: '#18212C' });
  expect(m.icons.map((i: { sizes: string; purpose: string }) => i.sizes + ' ' + i.purpose).sort()).toEqual(['192x192 any', '192x192 maskable', '512x512 any', '512x512 maskable']);
  for (const i of m.icons) { const r = await request.get('/' + i.src); expect(r.status()).toBe(200); expect(r.headers()['content-type']).toBe('image/png'); }
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('/apple-touch-icon.png');
  expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);
  expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')).toBe('yes');
  expect(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe('Madrid 27');
  expect(await page.locator('meta[name="theme-color"]').first().getAttribute('content')).toBe('#18212C');
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
});

test('Chrome la considera installabile (nessun errore di installabilità)', async ({ page }) => {
  await page.goto('/');
  await swReady(page);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
  const { errors } = await cdp.send('Page.getAppManifest');
  expect(errors).toEqual([]);
});

test('modalità aereo: l’app si apre, salva un allenamento e lo ritrova', async ({ page, context }) => {
  await start(page);
  await swReady(page);
  await context.setOffline(true);

  await page.reload(); // riapertura senza rete
  await expect(page.locator('.card.today')).toContainText('Corsa facile + allunghi');
  await page.locator('.card.today').getByRole('button', { name: 'Registra' }).click();
  await page.locator('#f-m').fill('37'); await page.locator('#f-s').fill('30');
  await page.locator('input[name="f-rpe"][value="3"]').check({ force: true });
  await page.getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Salvato.');
  await expect(page.locator('.card.an .chip').first()).toHaveText('Ottimo');

  // ogni indirizzo dell'app si apre offline, grafici compresi
  await page.goto('/calendario');
  await expect(dayRow(page, 17)).toContainText('Fatti 6 km · 6:15/km');
  await page.goto('/progressi');
  await expect(page.locator('#charts canvas').first()).toBeVisible();
  await page.goto('/analisi');
  await expect(page.locator('.list .item')).toHaveCount(1);
  // i caratteri arrivano dalla cache, non dalla rete
  expect(await page.evaluate(() => document.fonts.check('600 16px Barlow'))).toBe(true);
  await context.setOffline(false);
});
