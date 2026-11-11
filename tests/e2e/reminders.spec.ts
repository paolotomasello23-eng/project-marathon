/* Promemoria: richiede un browser che mostri davvero le notifiche (progetto "notifiche" in playwright.config.ts). */
import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('promemoria: attivandoli arriva la notifica dell’allenamento di oggi, una sola volta', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await start(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.goto('/profilo');
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Promemoria' }) });
  await expect(card.locator('.chip')).toHaveText('Spenti');
  await card.getByRole('button', { name: 'Attiva' }).click();
  await expect(card.locator('.chip')).toHaveText('Attivi');
  const shown = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => n.title + ' | ' + n.body + ' | ' + n.tag));
  await expect.poll(shown).toEqual(['Oggi: Corsa facile + allunghi | 6 km · 6:00–6:30/km · 38 min | madrid27-promemoria']);
  // riaprendo l'app lo stesso giorno non ne arriva un'altra; l'elenco per il service worker è pronto
  await page.evaluate(async () => { (await (await navigator.serviceWorker.ready).getNotifications()).forEach(n => n.close()); });
  await page.reload(); await page.waitForTimeout(2500);
  expect(await shown()).toEqual([]);
  const meta = await page.evaluate(() => new Promise<Record<string, unknown>>(res => { const r = indexedDB.open('madrid27'); r.onsuccess = () => { const g = r.result.transaction('meta').objectStore('meta').getAll(); g.onsuccess = () => res(Object.fromEntries(g.result.map((x: { k: string; v: unknown }) => [x.k, x.v]))); }; }));
  expect(meta['rem:on']).toBe(true); expect(meta['rem:last']).toBe('2026-11-17');
  expect((meta['rem:plan'] as { d: string; title: string }[]).slice(0, 2)).toEqual([{ d: '2026-11-17', title: 'Oggi: Corsa facile + allunghi', body: '6 km · 6:00–6:30/km · 38 min' }, { d: '2026-11-18', title: 'Oggi: Forza generale', body: '50 min' }]);
  await card.getByRole('button', { name: 'Disattiva' }).click();
  await expect(card.locator('.chip')).toHaveText('Spenti');
});


test('promemoria ad app chiusa: il service worker, svegliato dal sistema, mostra la notifica di oggi', async ({ page, context }) => {
  // qui niente orologio finto: il service worker usa quello vero, quindi il piano parte da oggi
  await context.grantPermissions(['notifications']);
  await page.goto('/');
  const now = new Date(), in20w = new Date(now.getTime() + 140 * 86400000), iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  await page.locator('#ob-date').fill(iso(in20w)); await page.locator('#ob-10k').fill('50'); await page.locator('#ob-goal').fill('4:00');
  await page.getByRole('button', { name: 'Genera' }).click();
  await expect(page.getByRole('heading', { name: 'Oggi', level: 1 })).toBeVisible();
  // una corsa oggi, qualunque giorno della settimana sia
  await page.goto('/calendario');
  await page.getByRole('button', { name: 'Aggiungi' }).click();
  await page.locator('#ad-km').fill('5'); await page.locator('#sheet').getByRole('button', { name: 'Aggiungi' }).click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.goto('/profilo');
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Promemoria' }) });
  await card.getByRole('button', { name: 'Attiva' }).click();
  await expect(card.locator('.chip')).toHaveText('Attivi');
  const shown = () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => n.title + ' | ' + n.body));
  await expect.poll(shown).toHaveLength(1);
  const first = (await shown())[0]; expect(first).toMatch(/^Oggi: Corsa facile \| 5 km · /);

  // domani mattina, app chiusa: tolgo la notifica, azzero "già mostrata oggi" e l'ora minima, poi sveglio il service worker
  await page.evaluate(() => new Promise<void>(res => { void navigator.serviceWorker.ready.then(async reg => { (await reg.getNotifications()).forEach(n => n.close()); const r = indexedDB.open('madrid27'); r.onsuccess = () => { const tx = r.result.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ k: 'rem:last', v: '' }); tx.objectStore('meta').put({ k: 'rem:hour', v: 0 }); tx.oncomplete = () => { r.result.close(); res(); }; }; }); }));
  expect(await shown()).toEqual([]);
  const cdp = await context.newCDPSession(page);
  const regs: { registrationId: string; scopeURL: string }[] = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', e => { regs.push(...e.registrations); });
  await cdp.send('ServiceWorker.enable');
  await expect.poll(() => regs.length).toBeGreaterThan(0);
  const reg = regs.find(r => r.scopeURL.startsWith('http://localhost:4173'))!;
  await cdp.send('ServiceWorker.dispatchPeriodicSyncEvent', { origin: 'http://localhost:4173', registrationId: reg.registrationId, tag: 'madrid27-promemoria' });
  await expect.poll(shown).toEqual([first]);
  // svegliato una seconda volta nello stesso giorno non ripete la notifica
  await page.evaluate(async () => { (await (await navigator.serviceWorker.ready).getNotifications()).forEach(n => n.close()); });
  await cdp.send('ServiceWorker.dispatchPeriodicSyncEvent', { origin: 'http://localhost:4173', registrationId: reg.registrationId, tag: 'madrid27-promemoria' });
  await page.waitForTimeout(1000);
  expect(await shown()).toEqual([]);
});
