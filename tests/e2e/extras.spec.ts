/* Fase 5: esportazione .ics, promemoria locali, cambio della data di gara. */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { dayRow, start, tab, toast } from './helpers';

test('esporto il piano in un file .ics valido', async ({ page }) => {
  await start(page);
  await page.goto('/profilo');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Calendario (.ics)' }).click()]);
  expect(dl.suggestedFilename()).toBe('madrid27-piano.ics');
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true); expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(135); expect((ics.match(/END:VEVENT/g) || []).length).toBe(135);
  expect(ics).toContain('UID:bw01-q@madrid27\r\nDTSTAMP:20261117T07'); expect(ics).toContain('DTSTART;VALUE=DATE:20261117\r\nDTEND;VALUE=DATE:20261118\r\nSUMMARY:Corsa facile + allunghi 6 km');
  expect(ics).toContain('X-WR-CALNAME:Maratona di Madrid');
});

test('promemoria: senza permesso restano spenti e l’app lo dice', async ({ page }) => {
  await start(page);
  await page.goto('/profilo');
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Promemoria' }) });
  await expect(card.locator('.chip')).toHaveText(/Spenti|Bloccati/);
  if (await card.getByRole('button', { name: 'Attiva' }).count()) { await card.getByRole('button', { name: 'Attiva' }).click(); await expect(card.locator('.chip')).toHaveText(/Spenti|Bloccati/); }
  expect(await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length)).toBe(0);
});

test('sposto la gara di due settimane: conto alla rovescia, calendario riallineato, modifica annullabile', async ({ page }) => {
  await start(page);
  await page.goto('/profilo');
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Gara' }) });
  await expect(card.getByRole('button', { name: 'Sposta' })).toBeDisabled();
  await card.getByLabel('Data').fill('2027-05-09');
  await card.getByRole('button', { name: 'Sposta' }).click();
  await card.getByRole('button', { name: 'Conferma: riallinea il piano' }).click(); // due tocchi: è una modifica grossa
  await toast(page, 'Gara spostata: calendario riallineato.');
  await expect(page.locator('.strip')).toContainText('173giorni'); await expect(page.locator('.strip')).toContainText('9 mag'); await expect(page.locator('.strip')).toContainText('1 di 25');
  await page.goto('/calendario?vista=settimana&data=2027-05-09');
  await expect(page.getByRole('heading', { name: 'Settimana 25 · Settimana di gara' })).toBeVisible();
  await expect(dayRow(page, 9)).toContainText('Maratona di Madrid');
  await page.goto('/calendario?vista=settimana&data=2027-04-25');
  await expect(dayRow(page, 25)).not.toContainText('Maratona di Madrid');
  await page.goto('/coach');
  const li = page.locator('.tl > li').filter({ has: page.locator('h3', { hasText: 'Gara spostata al 9 maggio 2027' }) });
  await expect(li).toContainText('Tua'); await expect(li).toContainText('25 aprile 2027'); await expect(li).toContainText('9 maggio 2027'); await expect(li).toContainText(/\d+ sessioni riallineate/);
  await expect(li.locator('.op')).toHaveCount(2); // la data e una riga di riepilogo, non l'elenco di tutte le sessioni
  await page.getByText(/^Versioni del piano/).click();
  await expect(page.locator('details').filter({ hasText: 'Versioni del piano' })).toContainText('Prima di: Gara spostata al 9 maggio 2027');
  await li.getByRole('button', { name: 'Annulla' }).click();
  await toast(page, 'Annullata.');
  await expect(page.locator('.strip')).toContainText('159giorni'); await expect(page.locator('.strip')).toContainText('1 di 23');
  await tab(page, 'Calendario');
  await expect(dayRow(page, 19)).toContainText('Corsa facile'); await expect(dayRow(page, 22)).toContainText('14km');
});
