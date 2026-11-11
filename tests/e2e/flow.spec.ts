/* Fase 2: con i dati importati vedo il piano dal 16 novembre, registro una corsa, la vedo analizzata,
   salto una sessione, la ritrovo recuperata nel giorno giusto, annullo la modifica. */
import { expect, test } from '@playwright/test';
import { dayRow, start, tab, toast } from './helpers';

test('importo i dati, registro, salto, ritrovo il recupero, annullo', async ({ page }) => {
  await start(page);

  // il piano dal 16 novembre 2026
  await expect(page.locator('.strip')).toContainText('159giorni');
  await expect(page.locator('.strip')).toContainText('1 di 23 · Base');
  await expect(page.locator('.card.today')).toContainText('Corsa facile + allunghi');
  await expect(page.locator('.card.today')).toContainText('6 km · 6:00–6:30/km · 38 min');
  await tab(page, 'Calendario');
  await expect(page.getByRole('heading', { name: 'Settimana 1 · Base' })).toBeVisible();
  await expect(page.locator('.nav-row .lbl')).toHaveText('16 nov – 22 nov');
  await expect(dayRow(page, 22)).toContainText('Lungo'); await expect(dayRow(page, 22)).toContainText('14km');
  await page.getByRole('button', { name: 'Mese' }).click();
  await expect(page.locator('.nav-row .lbl')).toHaveText('Novembre 2026');
  await expect(page.getByRole('button', { name: /^domenica 15 novembre: nessuna sessione$/ })).toBeVisible(); // prima del 16 non c'è nulla
  await expect(page.getByRole('button', { name: /^lunedì 16 novembre: Mobilità$/ })).toBeVisible();

  // registro la corsa di oggi
  await tab(page, 'Oggi');
  await page.locator('.card.today').getByRole('button', { name: 'Registra' }).click();
  await expect(page.getByRole('heading', { name: 'Registra', level: 1 })).toBeVisible();
  await expect(page.locator('#f-km')).toHaveValue('6');
  await expect(page.locator('#f-sid')).toHaveValue('bw01-q');
  await page.getByLabel('Minuti').fill('33');
  await expect(page.locator('#f-calc')).toContainText('5:30/km');
  await page.locator('input[name="f-rpe"][value="6"]').check({ force: true });
  await page.getByText('FC e dislivello').click();
  await page.getByLabel('FC media').fill('168');
  await page.getByRole('button', { name: 'Salva' }).click();

  // la vedo analizzata
  await toast(page, 'Salvato.');
  await expect(page).toHaveURL(/\/analisi\/w/);
  const an = page.locator('.card.an');
  await expect(an.locator('.chip').first()).toHaveText('Da rivedere');
  await expect(an.getByRole('heading', { name: 'Corsa facile · 6 km' })).toBeVisible();
  await expect(an.locator('.tiles')).toContainText('Ritmo5:30'); await expect(an.locator('.tiles')).toContainText('FC87%'); await expect(an.locator('.tiles')).toContainText('Carico198');
  await expect(an).toContainText('Distanza centrata');
  await expect(an).toContainText('Troppo veloce per una corsa facile (30 s/km): rallenta');
  await expect(an).toContainText('gio 19 nov · Corsa facile 6 km');
  await expect(an).toContainText('Nessuna modifica.');
  await an.getByText('Analisi e dati').click();
  await expect(an).toContainText('FC 168 bpm = 87% della max stimata');
  await expect(an.locator('table.data')).toContainText('FC sulla max87%stima'); // dato stimato, distinto da quelli inseriti

  // nel calendario risulta fatta
  await tab(page, 'Calendario');
  await expect(dayRow(page, 17)).toContainText('Fatti 6 km · 5:30/km'); await expect(dayRow(page, 17)).toContainText('Fatta');
  await expect(page.locator('.card').first()).toContainText('6 / 26 km');

  // salto la corsa di giovedì: recupero venerdì
  await dayRow(page, 19).getByRole('button', { name: /Corsa facile/ }).click();
  await page.locator('#sheet').getByRole('button', { name: 'Salta' }).click();
  await expect(page.locator('#sk-day option')).toHaveText(['Venerdì 20 novembre', 'Sabato 21 novembre', 'Lunedì 23 novembre', 'Mercoledì 25 novembre', 'Non recuperare']);
  await page.locator('#sheet').getByRole('button', { name: 'Salta' }).click();
  await toast(page, 'Saltata. Recupero ven 20 nov.');
  await expect(dayRow(page, 19)).not.toContainText('Corsa facile');
  await expect(dayRow(page, 20)).toContainText('Corsa facile'); await expect(dayRow(page, 20)).toContainText('Recupero');
  await dayRow(page, 20).getByRole('button', { name: /Corsa facile/ }).click();
  await expect(page.locator('#sheet')).toContainText('Recupero della corsa di gio 19 nov');
  await page.getByRole('button', { name: 'Chiudi' }).click();

  // annullo la modifica dal Coach
  await tab(page, 'Altro'); await page.getByRole('link', { name: 'Coach' }).click();
  const rec = page.locator('.tl > li').filter({ has: page.locator('h3', { hasText: 'Recupero: Corsa facile 6 km → ven 20 nov' }) });
  await expect(rec).toContainText('Corsa facile 6 km · gio 19 nov'); await expect(rec).toContainText('Corsa facile 6 km · ven 20 nov');
  await rec.getByRole('button', { name: 'Perché' }).click();
  await expect(rec).toContainText('Saltata gio 19 nov · impegni'); await expect(rec).toContainText('Settimana di arrivo: 26 km (previsti 26).');
  await rec.getByRole('button', { name: 'Annulla' }).click();
  await toast(page, 'Annullata.');
  await expect(rec).toContainText('Annullata');
  await page.getByText(/^Versioni del piano \(3\)$/).click(); // versione 1 del backup, prima del recupero, prima dell'annullamento
  await expect(page.locator('details').filter({ hasText: 'Versioni del piano' })).toContainText('Prima di annullare: Recupero: Corsa facile 6 km → ven 20 nov');
  await tab(page, 'Calendario');
  await expect(dayRow(page, 19)).toContainText('Corsa facile'); await expect(dayRow(page, 19)).toContainText('Saltata');
  await expect(dayRow(page, 20)).not.toContainText('Corsa facile');

  // tutto resta dopo aver ricaricato la pagina
  await page.reload();
  await expect(dayRow(page, 17)).toContainText('Fatta'); await expect(dayRow(page, 19)).toContainText('Saltata');
});
