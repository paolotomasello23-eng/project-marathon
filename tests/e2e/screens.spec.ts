/* Le altre azioni e schermate: segnalazioni, proposte, correzioni, calendario, obiettivi, dati, accessibilità. */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { dayRow, start, tab, toast } from './helpers';

test('"Come stai?" con dolore moderato: proposta del coach, accetto, annullo', async ({ page }) => {
  await start(page, '2026-11-18');
  await page.getByRole('button', { name: 'Come stai?' }).click();
  await page.locator('#sheet input[name="ci-pain"][value="2"]').check({ force: true });
  await page.locator('#ci-area').selectOption('ginocchio');
  await page.locator('#sheet').getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Salvato: c’è una proposta.');
  await expect(page).toHaveURL(/\/coach$/);
  const card = page.locator('article.card').filter({ hasText: 'Alleggerire le prossime corse per il dolore segnalato' }).first();
  await expect(card).toContainText('In attesa'); await expect(card).toContainText('Corsa facile 6 km'); await expect(card).toContainText('Corsa facile 4 km');
  await expect(page.locator('#tabs .badge')).toHaveText('1');
  await card.getByRole('button', { name: 'Perché' }).click();
  await expect(card).toContainText('Dolore moderato (ginocchio) il mer 18 nov'); await expect(card).toContainText('fermati e fatti valutare');
  await card.getByRole('button', { name: 'Accetta' }).click();
  await toast(page, 'Applicata.');
  await expect(page.locator('#tabs .badge')).toHaveCount(0);
  await tab(page, 'Oggi');
  await expect(page.locator('.banner.crit')).toContainText('Dolore moderato (ginocchio): niente intensità. Se dura 48–72 ore, fatti valutare.');
  await expect(page.locator('.pair').first()).toContainText('Da monitorare');
  await tab(page, 'Calendario');
  await expect(dayRow(page, 19)).toContainText('4km'); await expect(dayRow(page, 19)).toContainText('Modificata');
  await dayRow(page, 19).getByRole('button').click();
  await expect(page.locator('#sheet')).toContainText('Prima: Corsa facile 6 km · gio 19 nov');
  await page.locator('#sheet').getByText('Modifiche (1)').click();
  await expect(page.locator('#sheet')).toContainText('Corsa facile 6 km → Corsa facile 4 km');
  await page.getByRole('button', { name: 'Chiudi' }).click();
  await page.goto('/coach');
  await page.locator('.tl > li').filter({ hasText: 'Alleggerire le prossime corse' }).getByRole('button', { name: 'Annulla' }).click();
  await toast(page, 'Annullata.');
  await page.goto('/calendario');
  await expect(dayRow(page, 19)).toContainText('6km'); await expect(dayRow(page, 19)).not.toContainText('Modificata');
});

test('salto per malattia: niente recupero, si apre la segnalazione e il coach ferma le corse', async ({ page }) => {
  await start(page, '2026-11-17');
  await page.locator('.card.today').getByRole('button', { name: 'Dettagli' }).click();
  await page.locator('#sheet').getByRole('button', { name: 'Salta' }).click();
  await page.locator('#sk-why').selectOption('Malattia');
  await expect(page.locator('#sk-norec')).toBeVisible(); await expect(page.locator('#sk-rec')).toBeHidden();
  await page.locator('#sheet').getByRole('button', { name: 'Salta' }).click();
  await toast(page, 'Saltata. Con dolore o malattia non si recupera.');
  await expect(page.locator('#sheet-title')).toHaveText('Come stai?'); await expect(page.locator('#ci-ill')).toBeChecked();
  await page.locator('#sheet').getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Salvato: carico ridotto.');
  const li = page.locator('.tl > li').filter({ has: page.locator('h3', { hasText: 'Stop per malattia' }) });
  await expect(li).toContainText('Coach'); await expect(li).toContainText('Riposo (malattia)');
  await li.getByRole('button', { name: 'Perché' }).click();
  await expect(li).toContainText('Con febbre o sintomi sotto il collo non ci si allena.');
});

test('correggo, elimino e ripristino un allenamento', async ({ page }) => {
  await start(page);
  await page.goto('/registra?sid=bw01-q');
  await expect(page.locator('#f-km')).toHaveValue('6');
  await page.locator('#f-m').fill('37'); await page.locator('#f-s').fill('30');
  await page.locator('input[name="f-rpe"][value="3"]').check({ force: true });
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('.card.an .chip').first()).toHaveText('Ottimo');
  await page.getByRole('button', { name: 'Correggi' }).click();
  await expect(page.getByRole('heading', { name: 'Correggi', level: 1 })).toBeVisible();
  await expect(page.locator('#f-m')).toHaveValue('37'); await expect(page.locator('#f-sid')).toHaveValue('bw01-q');
  await page.locator('#f-km').fill('6,5');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.getByRole('heading', { name: 'Corsa facile · 6,5 km' })).toBeVisible();
  await page.getByText('Correzioni (1)').click();
  await expect(page.locator('details').filter({ hasText: 'Correzioni (1)' })).toContainText('km: 6 → 6.5');
  await page.getByRole('button', { name: 'Elimina' }).click();
  await page.getByRole('button', { name: 'Conferma eliminazione' }).click();
  await toast(page, 'Eliminato.');
  await expect(page.locator('.empty')).toContainText('Nessun allenamento');
  await tab(page, 'Calendario'); await expect(dayRow(page, 17)).not.toContainText('Fatta');
  await page.goto('/analisi');
  await page.getByText('Eliminati (1)').click();
  await page.getByRole('button', { name: 'Ripristina' }).click();
  await toast(page, 'Ripristinato.');
  await expect(page.locator('.list .item')).toHaveCount(1);
  await tab(page, 'Calendario'); await expect(dayRow(page, 17)).toContainText('Fatta');
});

test('il modulo segnala i dati mancanti o non plausibili senza salvare', async ({ page }) => {
  await start(page);
  await page.goto('/registra');
  await expect(page.locator('#f-sid')).toHaveValue('bw01-q'); // la sessione di oggi è già collegata
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#f-errsum')).toHaveText('Mancano i km.Manca il tempo.'); await expect(page.locator('#f-km')).toBeFocused(); await expect(page.locator('#f-km')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#f-km').fill('6');
  await expect(page.locator('#f-km')).not.toHaveAttribute('aria-invalid', 'true');
  await page.locator('#f-m').fill('12');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#f-errsum')).toHaveText('Ritmo di 2:00/km: controlla km e tempo.');
  await page.locator('#f-m').fill('36');
  await page.getByText('FC e dislivello').click(); await page.locator('#f-hr').fill('300');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#f-errsum')).toHaveText('FC media: tra 60 e 230.');
  await expect(page).toHaveURL(/\/registra$/);
});

test('corse non confermate: le chiudo dall’avviso', async ({ page }) => {
  await start(page, '2026-11-24');
  await page.getByRole('button', { name: '3 corse da confermare' }).click();
  await expect(page.locator('#sheet-title')).toHaveText('Da confermare');
  await expect(page.locator('#sheet .sheet-b > div')).toHaveCount(3);
  await page.locator('#sheet').getByRole('button', { name: 'Saltata' }).first().click();
  await toast(page, /^Saltata\./);
  await expect(page.locator('#sheet .sheet-b > div')).toHaveCount(2);
  await page.locator('#sheet').getByRole('button', { name: 'Fatta' }).first().click();
  await expect(page).toHaveURL(/\/registra\?sid=bw01-e$/); await expect(page.locator('#f-date')).toHaveValue('2026-11-19');
});

test('calendario: giorno, mese, rinvio, modifica, aggiunta ed eliminazione di una sessione', async ({ page }) => {
  await start(page);
  await page.goto('/calendario?vista=mese&data=2026-12-01');
  await expect(page.locator('.nav-row .lbl')).toHaveText('Dicembre 2026');
  await page.getByRole('button', { name: /^martedì 1 dicembre: Test 5 km 8,5 km$/ }).click();
  await expect(page).toHaveURL(/vista=giorno&data=2026-12-01/);
  await expect(page.getByRole('heading', { name: 'Test 5 km' })).toBeVisible();
  await expect(page.locator('.card')).toContainText('2,5 km facili + allunghi · 5 km a tutta · 1 km facile');
  await page.getByText('Dettagli').click(); await expect(page.locator('.card')).toContainText('Percorso piatto e misurato.');
  await page.getByRole('button', { name: 'Rinvia' }).click();
  await page.locator('#mv-date').fill('2026-12-02'); await page.getByRole('button', { name: 'Sposta' }).click();
  await toast(page, 'Spostata a mer 2 dic.');
  await expect(page.locator('.empty')).toHaveText('Nessuna sessione');
  await page.getByRole('button', { name: 'Successivo' }).click();
  await expect(page.locator('.card').first()).toContainText('Rinviata'); await expect(page.locator('.card').first()).toContainText('Prima: Test 5 km 8,5 km · mar 1 dic');
  await page.locator('.card').first().getByRole('button', { name: 'Modifica' }).click();
  await page.locator('#ed-sub').selectOption('easy'); await page.locator('#ed-km').fill('5'); await page.locator('#ed-note').fill('test rinviato');
  await page.locator('#sheet').getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Modificata.');
  await expect(page.getByRole('heading', { name: 'Corsa facile', exact: true })).toBeVisible(); await expect(page.locator('.card').first()).toContainText('test rinviato');
  await page.getByRole('button', { name: 'Aggiungi' }).click();
  await page.locator('#ad-km').fill('4'); await page.locator('#ad-title').fill('Giro con amici');
  await page.locator('#sheet').getByRole('button', { name: 'Aggiungi' }).click();
  await toast(page, 'Aggiunta.');
  const mine = page.locator('.card').filter({ hasText: 'Giro con amici' });
  await expect(mine).toContainText('Tua');
  await mine.getByRole('button', { name: 'Elimina' }).click();
  await expect(page.locator('#sheet-title')).toHaveText('Eliminare la sessione?');
  await page.locator('#sheet').getByRole('button', { name: 'Elimina' }).click();
  await toast(page, 'Eliminata.');
  await expect(page.locator('.card').filter({ hasText: 'Giro con amici' })).toHaveCount(0);
});

test('obiettivi: stima, criteri, modifica dell’obiettivo e dei ritmi', async ({ page }) => {
  await start(page);
  await page.goto('/obiettivi');
  const cards = page.locator('.card');
  await expect(cards.nth(0)).toContainText('4:00'); await expect(cards.nth(0)).toContainText('5:41/km');
  await expect(cards.nth(1)).toContainText('Ambizioso'); await expect(cards.nth(1)).toContainText('Confidenza bassa'); await expect(cards.nth(1)).toContainText('4:07 (3:56–4:20)');
  await expect(cards.nth(1)).toContainText('10 km in 48:05 (−2,9%)');
  await cards.nth(1).getByText('Su cosa si basa').click();
  await expect(cards.nth(1)).toContainText('Nessun test ancora: la stima si basa su un dato dichiarato.');
  await expect(page.locator('.card').filter({ hasText: 'Lungo da 35 km' }).locator('.checks li')).toHaveCount(6);
  await expect(page.locator('.card').filter({ hasText: 'Quarta corsa' }).locator('.checks li')).toHaveCount(4);
  await cards.nth(0).getByRole('button', { name: 'Modifica' }).click();
  await page.locator('#g-h').fill('3'); await page.locator('#g-m').fill('45');
  await page.locator('#sheet').getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Salvato.');
  await expect(cards.nth(0)).toContainText('3:45');
  await expect(page.locator('.card').filter({ hasText: 'Storico obiettivi' })).toContainText('3:45');
  await page.locator('.card').filter({ hasText: 'Ritmi' }).first().getByRole('button', { name: 'Modifica' }).click();
  await expect(page.locator('#p-mp-0')).toHaveValue('5:15');
  await page.locator('#p-easy-0').fill('7:00');
  await page.locator('#sheet').getByRole('button', { name: 'Salva' }).click();
  await expect(page.locator('#p-err')).toHaveText('Corsa facile: scrivi due ritmi come 5:35 e 5:40, dal più veloce al più lento.');
  await page.locator('#p-easy-0').fill('6:05');
  await page.locator('#sheet').getByRole('button', { name: 'Salva' }).click();
  await tab(page, 'Oggi');
  await expect(page.locator('.stats')).toContainText('Obiettivo3:45'); await expect(page.locator('.stats')).toContainText('Passo gara5:15–5:20');
});

test('progressi: ogni scheda disegna i grafici e offre la tabella', async ({ page }) => {
  await start(page);
  await tab(page, 'Progressi');
  await expect(page.locator('#charts canvas').first()).toBeVisible();
  for (const [name, n] of [['Volume', 3], ['Lunghi', 1], ['Ritmo e FC', 0], ['Carico', 0], ['Costanza', 1], ['Previsione', 2]] as [string, number][]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('#charts canvas')).toHaveCount(n);
  }
  await expect(page).toHaveURL(/g=previsione/);
  await page.locator('details.tbl').first().locator('summary').click();
  await expect(page.locator('details.tbl').first().locator('tbody tr')).toHaveCount(2); // 10 e 11 novembre dal backup: la prossima voce arriva a 7 giorni dall'ultima
  await expect(page.locator('details.tbl').first()).toContainText('4:07');
});

test('profilo: salvo i dati, esporto backup e CSV', async ({ page }) => {
  await start(page);
  await page.goto('/profilo');
  await page.locator('#pr-w').fill('70'); await page.locator('#pr-hr').fill('500');
  await page.locator('.card').filter({ hasText: 'Atleta' }).getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Controlla età, frequenza massima e peso: un valore non è plausibile.');
  await page.locator('#pr-hr').fill('198');
  await page.locator('.card').filter({ hasText: 'Atleta' }).getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Salvato.');
  await page.goto('/guida'); await page.getByText('Prima di correre').click();
  await expect(page.locator('details[open]')).toContainText('1–3 g per kg (70–210 g)');
  await page.goto('/profilo');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Backup', exact: true }).click()]);
  expect(dl.suggestedFilename()).toBe('maratona-madrid-backup-2026-11-17.json');
  const b = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(Object.keys(b)).toEqual(['app', 'v', 'exportedAt', 'core', 'plan', 'workouts', 'checkins', 'changes']);
  expect(b.app).toBe('marathon-project-madrid'); expect(b.plan.sessions.length).toBe(161); expect(b.core.profile.hrMax).toBe(198);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()]);
  expect(csv.suggestedFilename()).toBe('maratona-madrid-allenamenti-2026-11-17.csv');
});

test('un file qualsiasi non viene importato', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#imp-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"altro"}') });
  await expect(page.locator('#imp-box')).toContainText('Il file non è un backup di questa app.');
  await expect(page.getByRole('heading', { name: 'Crea il piano' })).toBeVisible();
});

test('creo un piano da zero dalla schermata iniziale', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T08:00:00+01:00') });
  await page.goto('/');
  await page.locator('#ob-name').fill('Paolo'); await page.locator('#ob-date').fill('2026-12-20'); await page.locator('#ob-10k').fill('49:30'); await page.locator('#ob-goal').fill('4:00');
  await page.getByRole('button', { name: 'Genera' }).click();
  // meno di 8 settimane: il campo data lo rifiuta e il piano non viene creato
  expect(await page.locator('#ob-date').evaluate(el => (el as HTMLInputElement).validity.rangeUnderflow)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Crea il piano' })).toBeVisible();
  await page.locator('#ob-date').fill('2027-04-25');
  await page.getByRole('button', { name: 'Genera' }).click();
  await toast(page, 'Piano creato.');
  await expect(page.locator('.strip')).toContainText('159giorni'); await expect(page.locator('.strip')).toContainText('1 di 23');
  await expect(page.locator('.stats')).toContainText('Passo gara5:35–5:40');
});

test('schermo largo: barra laterale con tutte le sezioni, URL veri che reggono il ricaricamento', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await start(page);
  await expect(page.locator('#tabs')).toBeHidden();
  await expect(page.locator('#rail a')).toHaveText(['Oggi', 'Calendario', 'Registra', 'Analisi', 'Progressi', 'Obiettivi', 'Coach', 'Guida', 'Profilo']);
  for (const [name, url, h1] of [['Obiettivi', '/obiettivi', 'Obiettivi'], ['Coach', '/coach', 'Coach'], ['Guida', '/guida', 'Guida'], ['Profilo', '/profilo', 'Profilo'], ['Analisi', '/analisi', 'Analisi'], ['Calendario', '/calendario', 'Calendario']]) {
    await page.locator('#rail').getByRole('link', { name }).click();
    await expect(page).toHaveURL(new RegExp(url + '$')); await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
    await expect(page.locator('#rail a[aria-current="page"]')).toHaveText(name);
    await page.reload(); await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
  }
  await page.goto('/non-esiste'); await expect(page).toHaveURL(/\/$/); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oggi');
});

test('accessibilità di base: ogni campo ha un’etichetta, i controlli sono alti almeno 44 px, il fuoco si vede', async ({ page }) => {
  await start(page);
  for (const [url, h1] of [['/', 'Oggi'], ['/calendario', 'Calendario'], ['/calendario?vista=mese', 'Calendario'], ['/registra', 'Registra'], ['/analisi', 'Analisi'], ['/progressi', 'Progressi'], ['/obiettivi', 'Obiettivi'], ['/coach', 'Coach'], ['/guida', 'Guida'], ['/profilo', 'Profilo'], ['/altro', 'Altro']]) {
    await page.goto(url); await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
    for (const d of await page.locator('main details').all()) await d.evaluate(el => { (el as HTMLDetailsElement).open = true; });
    const report = await page.evaluate(() => {
      const vis = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const unlabeled = [...document.querySelectorAll<HTMLInputElement>('input, select, textarea')].filter(vis)
        .filter(el => !((el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.closest('fieldset') && el.closest('fieldset')!.querySelector('legend')) || (el.closest('[role=radiogroup]') && el.closest('[role=radiogroup]')!.getAttribute('aria-label'))))
        .map(el => el.id || el.name || el.outerHTML.slice(0, 60));
      const small = [...document.querySelectorAll<HTMLElement>('button, a, summary, select, input:not([type=radio]):not([type=checkbox]), textarea, .opts label, label.check')].filter(vis)
        .filter(el => !el.closest('.prose') && el.getBoundingClientRect().height < 43.5)
        .map(el => (el.textContent || el.id || el.tagName).trim().slice(0, 30) + ' ' + Math.round(el.getBoundingClientRect().height));
      return { unlabeled, small };
    });
    expect(report, url).toEqual({ unlabeled: [], small: [] });
  }
  await page.goto('/');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => { const el = document.activeElement as HTMLElement; return el && el !== document.body ? getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth : 'none'; });
  expect(outline).toBe('solid 3px');
});
