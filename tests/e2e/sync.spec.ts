/* Fase 4: un allenamento registrato sul telefono compare sul computer; uno registrato offline si sincronizza
   al ritorno della rete. Due browser separati (ognuno con il suo IndexedDB), un Supabase finto in mezzo. */
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { CODE, FakeSupabase } from './fakeSupabase';
import { BACKUP, dayRow, toast } from './helpers';

const EMAIL = 'paolo@example.com';
interface Dev { ctx: BrowserContext; page: Page }

async function open(browser: Browser, fake: FakeSupabase, wide = false): Promise<Dev> {
  const ctx = await browser.newContext({ viewport: wide ? { width: 1280, height: 900 } : { width: 390, height: 844 }, locale: 'it-IT', timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
  await fake.attach(ctx);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-11-17T08:00:00+01:00') });
  await page.goto('http://localhost:4174/');
  await expect(page.getByRole('heading', { name: 'Crea il piano' })).toBeVisible();
  return { ctx, page };
}
async function importBackup(page: Page): Promise<void> {
  await page.setInputFiles('#imp-file', BACKUP);
  await page.getByRole('button', { name: 'Ripristina questo backup' }).click();
  await expect(page.getByRole('heading', { name: 'Oggi', level: 1 })).toBeVisible();
}
/** Accesso dalla scheda Account: email, poi il codice a 6 cifre ricevuto nella stessa email del link. */
async function signIn(page: Page): Promise<void> {
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Account' }) });
  await card.getByLabel('Email').fill(EMAIL);
  await card.getByRole('button', { name: 'Invia link' }).click();
  await expect(card).toContainText('Link inviato a ' + EMAIL);
  await card.getByLabel('Codice').fill(CODE);
  await card.getByRole('button', { name: 'Accedi' }).click();
}
const sync = (page: Page) => page.locator('#sync');
const online = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('online'))); // il ritorno della rete

test('telefono e computer: accesso, primo allineamento, allenamento che passa da uno all’altro, offline e ritorno', async ({ browser }) => {
  const fake = new FakeSupabase();
  const phone = await open(browser, fake), laptop = await open(browser, fake, true);

  // telefono: dati importati, ancora solo locale
  await importBackup(phone.page);
  await expect(sync(phone.page)).toHaveText('Solo locale');
  await phone.page.goto('http://localhost:4174/profilo');
  await signIn(phone.page);
  await expect(sync(phone.page)).toHaveText('Sincronizzato');
  await expect(phone.page.locator('.card').filter({ hasText: 'Account' })).toContainText(EMAIL);
  expect(fake.otp).toEqual([{ email: EMAIL, redirect: 'http://localhost:4174/profilo' }]);
  expect(fake.of(EMAIL).length).toBe(11); // profilo, piano e 9 modifiche
  expect((fake.doc(EMAIL, 'app/plan') as { sessions: unknown[] }).sessions.length).toBe(161);

  // computer: nessun dato, accesso dalla schermata iniziale → arriva tutto
  await signIn(laptop.page);
  await expect(laptop.page.locator('.card.today')).toContainText('Corsa facile + allunghi');
  await expect(sync(laptop.page)).toHaveText('Sincronizzato');
  await expect(laptop.page.locator('.strip')).toContainText('1 di 23 · Base');

  // un allenamento registrato sul telefono…
  await phone.page.goto('http://localhost:4174/registra?sid=bw01-q');
  await phone.page.locator('#f-m').fill('37'); await phone.page.locator('#f-s').fill('30');
  await phone.page.locator('input[name="f-rpe"][value="3"]').check({ force: true });
  await phone.page.getByRole('button', { name: 'Salva' }).click();
  await toast(phone.page, 'Salvato.');
  await expect.poll(() => fake.of(EMAIL).filter(r => r.coll === 'workouts').length).toBe(1); // inviato da solo, senza toccare nulla
  await expect(sync(phone.page)).toHaveText('Sincronizzato');

  // …compare sul computer
  await laptop.page.locator('#rail').getByRole('link', { name: 'Profilo' }).click();
  await laptop.page.getByRole('button', { name: 'Sincronizza' }).click();
  await laptop.page.locator('#rail').getByRole('link', { name: 'Analisi' }).click();
  await expect(laptop.page.locator('.list .item')).toContainText('Corsa facile · 6 km'); await expect(laptop.page.locator('.list .item')).toContainText('Ottimo');
  await laptop.page.locator('#rail').getByRole('link', { name: 'Calendario' }).click();
  await expect(dayRow(laptop.page, 17)).toContainText('Fatti 6 km · 6:15/km'); await expect(dayRow(laptop.page, 17)).toContainText('Fatta');

  // telefono senza rete: registro lo stesso, resta in coda
  fake.setOffline(phone.ctx, true);
  await phone.page.locator('#tabs').getByRole('link', { name: 'Registra' }).click();
  await phone.page.locator('input[name="f-k"][value="strength"]').check({ force: true });
  await phone.page.locator('#f-date').fill('2026-11-17'); await phone.page.locator('#f-min').fill('45');
  await phone.page.locator('input[name="f-rpe"][value="6"]').check({ force: true });
  await phone.page.getByRole('button', { name: 'Salva' }).click();
  await toast(phone.page, 'Salvato.');
  await expect(phone.page.locator('.card.an')).toContainText('Forza'); // offline l'app analizza e salva comunque
  await expect(sync(phone.page)).toHaveText(/^\d da inviare$/, { timeout: 20000 }); // il client riprova qualche volta prima di arrendersi
  expect(fake.of(EMAIL).filter(r => r.coll === 'workouts').length).toBe(1);

  // torna la rete: la coda si svuota da sola
  fake.setOffline(phone.ctx, false);
  await online(phone.page);
  await expect(sync(phone.page)).toHaveText('Sincronizzato');
  expect(fake.of(EMAIL).filter(r => r.coll === 'workouts').length).toBe(2);
  await laptop.page.locator('#rail').getByRole('link', { name: 'Profilo' }).click();
  await laptop.page.getByRole('button', { name: 'Sincronizza' }).click();
  await laptop.page.locator('#rail').getByRole('link', { name: 'Analisi' }).click();
  await expect(laptop.page.locator('.list .item')).toHaveCount(2);

  // la sessione resta dopo aver ricaricato la pagina; uscendo l'app torna locale e i dati restano sul dispositivo
  await laptop.page.reload();
  await expect(sync(laptop.page)).toHaveText('Sincronizzato'); await expect(laptop.page.locator('.list .item')).toHaveCount(2);
  await laptop.page.goto('http://localhost:4174/profilo');
  await laptop.page.getByRole('button', { name: 'Esci' }).click();
  await expect(sync(laptop.page)).toHaveText('Solo locale');
  await laptop.page.goto('http://localhost:4174/analisi'); await expect(laptop.page.locator('.list .item')).toHaveCount(2);
  await phone.ctx.close(); await laptop.ctx.close();
});

test('dispositivo con un piano diverso da quello dell’account: l’app chiede quale tenere', async ({ browser }) => {
  const fake = new FakeSupabase();
  const phone = await open(browser, fake), other = await open(browser, fake);
  await importBackup(phone.page); await phone.page.goto('http://localhost:4174/profilo'); await signIn(phone.page);
  await expect(sync(phone.page)).toHaveText('Sincronizzato');

  await importBackup(other.page);
  await other.page.goto('http://localhost:4174/obiettivi');
  await other.page.locator('.card').first().getByRole('button', { name: 'Modifica' }).click();
  await other.page.locator('#g-h').fill('3'); await other.page.locator('#g-m').fill('45'); await other.page.locator('#sheet').getByRole('button', { name: 'Salva' }).click();
  await other.page.goto('http://localhost:4174/profilo');
  await signIn(other.page);
  const card = other.page.locator('.card').filter({ has: other.page.getByRole('heading', { name: 'Account' }) });
  await expect(card).toContainText('Questo dispositivo e l’account hanno piani diversi.');
  await expect(sync(other.page)).toHaveText('Da scegliere');
  expect((fake.doc(EMAIL, 'app/core') as { goal: { sec: number } }).goal.sec).toBe(14400); // finché non scelgo, nulla viene sovrascritto
  await card.getByRole('button', { name: 'Usa l’account' }).click();
  await expect(sync(other.page)).toHaveText('Sincronizzato');
  await other.page.goto('http://localhost:4174/obiettivi');
  await expect(other.page.locator('.card').first()).toContainText('4:00');
  await phone.ctx.close(); await other.ctx.close();
});

test('codice sbagliato: nessun accesso, l’app resta locale', async ({ browser }) => {
  const fake = new FakeSupabase(), d = await open(browser, fake);
  const card = d.page.locator('.card').filter({ has: d.page.getByRole('heading', { name: 'Account' }) });
  await card.getByLabel('Email').fill(EMAIL); await card.getByRole('button', { name: 'Invia link' }).click();
  await card.getByLabel('Codice').fill('000000'); await card.getByRole('button', { name: 'Accedi' }).click();
  await toast(d.page, 'Token has expired or is invalid');
  await expect(sync(d.page)).toHaveText('Solo locale'); expect(fake.of(EMAIL).length).toBe(0);
  await d.ctx.close();
});
