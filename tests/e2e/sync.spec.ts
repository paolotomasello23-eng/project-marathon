/* Fase 4: account e sincronizzazione. Un allenamento registrato sul telefono compare sul computer; uno registrato
   offline si sincronizza al ritorno della rete. Due browser separati (ognuno con il suo archivio), un Supabase
   finto in mezzo: il client è quello vero, le risposte sono simulate. */
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { CODE, FakeSupabase } from './fakeSupabase';
import { BACKUP, dayRow, toast } from './helpers';

const EMAIL = 'paolo@example.com', PASSWORD = 'maratona27';
const URL = 'http://localhost:4174';
interface Dev { ctx: BrowserContext; page: Page }

async function open(browser: Browser, fake: FakeSupabase, wide = false): Promise<Dev> {
  const ctx = await browser.newContext({ viewport: wide ? { width: 1280, height: 900 } : { width: 390, height: 844 }, locale: 'it-IT', timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
  await fake.attach(ctx);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-11-17T08:00:00+01:00') });
  await page.goto(URL + '/');
  await expect(page.getByRole('heading', { name: 'Crea il piano' })).toBeVisible();
  return { ctx, page };
}
async function importBackup(page: Page): Promise<void> {
  await page.setInputFiles('#imp-file', BACKUP);
  await page.getByRole('button', { name: 'Ripristina questo backup' }).click();
  await expect(page.getByRole('heading', { name: 'Oggi', level: 1 })).toBeVisible();
}
const account = (page: Page) => page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Account' }) });
/** Scheda Account: email e password, poi "Crea account" oppure "Accedi". */
async function enter(page: Page, how: 'Crea account' | 'Accedi', email = EMAIL, password = PASSWORD): Promise<void> {
  const card = account(page);
  await card.getByLabel('Email').fill(email); await card.getByLabel('Password', { exact: true }).fill(password);
  await card.getByRole('button', { name: how, exact: true }).click();
}
const sync = (page: Page) => page.locator('#sync');
const online = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('online'))); // il ritorno della rete

test('telefono e computer: creo l’account, entro dall’altro dispositivo, l’allenamento passa; offline e ritorno', async ({ browser }) => {
  const fake = new FakeSupabase();
  const phone = await open(browser, fake), laptop = await open(browser, fake, true);

  // telefono: dati importati, ancora solo locale → creo l'account
  await importBackup(phone.page);
  await expect(sync(phone.page)).toHaveText('Solo locale');
  await phone.page.goto(URL + '/profilo');
  await enter(phone.page, 'Crea account');
  await expect(sync(phone.page)).toHaveText('Sincronizzato');
  await expect(account(phone.page)).toContainText(EMAIL);
  expect(fake.otp).toEqual([]); // nessuna email inviata: non serve un servizio email
  expect(fake.of(EMAIL).length).toBe(11); // profilo, piano e 9 modifiche
  expect((fake.doc(EMAIL, 'app/plan') as { sessions: unknown[] }).sessions.length).toBe(161);

  // computer: nessun dato; dalla schermata iniziale entro con la stessa email e password → arriva tutto
  await enter(laptop.page, 'Accedi');
  await expect(laptop.page.locator('.card.today')).toContainText('Corsa facile + allunghi');
  await expect(sync(laptop.page)).toHaveText('Sincronizzato');
  await expect(laptop.page.locator('.strip')).toContainText('1 di 23 · Base');

  // un allenamento registrato sul telefono…
  await phone.page.goto(URL + '/registra?sid=bw01-q');
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
  await laptop.page.goto(URL + '/profilo');
  await laptop.page.getByRole('button', { name: 'Esci' }).click();
  await expect(sync(laptop.page)).toHaveText('Solo locale');
  await laptop.page.goto(URL + '/analisi'); await expect(laptop.page.locator('.list .item')).toHaveCount(2);
  await phone.ctx.close(); await laptop.ctx.close();
});

test('due persone sullo stesso dispositivo: ogni account ha il suo archivio, i dati non si mescolano', async ({ browser }) => {
  const fake = new FakeSupabase(), d = await open(browser, fake), AMICO = 'amico@example.com';
  await importBackup(d.page); await d.page.goto(URL + '/profilo'); await enter(d.page, 'Crea account');
  await expect(sync(d.page)).toHaveText('Sincronizzato'); expect(fake.of(EMAIL).length).toBe(11);
  await d.page.getByRole('button', { name: 'Esci' }).click();
  await expect(sync(d.page)).toHaveText('Solo locale');

  // un amico crea il suo account sullo stesso telefono: l'app passa a un archivio vuoto, suo
  await enter(d.page, 'Crea account', AMICO, 'altra-password');
  await expect(d.page.getByRole('heading', { name: 'Crea il piano' })).toBeVisible();
  await expect(account(d.page)).toContainText(AMICO); await expect(sync(d.page)).toHaveText('Sincronizzato');
  expect(fake.of(AMICO).length).toBe(0); // niente dei dati di Paolo è finito sul suo account
  await d.page.locator('#ob-name').fill('Amico'); await d.page.locator('#ob-date').fill('2027-04-25'); await d.page.locator('#ob-10k').fill('55'); await d.page.locator('#ob-goal').fill('4:30');
  await d.page.getByRole('button', { name: 'Genera' }).click();
  await toast(d.page, 'Piano creato.');
  await expect.poll(() => (fake.doc(AMICO, 'app/core') as { profile: { name: string } } | undefined)?.profile.name).toBe('Amico');
  await expect(d.page.locator('.stats')).toContainText('Obiettivo4:30');
  expect((fake.doc(EMAIL, 'app/core') as { profile: { name: string }; goal: { sec: number } }).goal.sec).toBe(14400);

  // l'amico esce, Paolo rientra: ritrova i suoi dati, intatti
  await d.page.goto(URL + '/profilo'); await d.page.getByRole('button', { name: 'Esci' }).click();
  await expect(sync(d.page)).toHaveText('Solo locale');
  await enter(d.page, 'Accedi');
  await expect(account(d.page)).toContainText(EMAIL); await expect(sync(d.page)).toHaveText('Sincronizzato');
  await d.page.goto(URL + '/');
  await expect(d.page.locator('.stats')).toContainText('Obiettivo4:00'); await expect(d.page.locator('.card.today')).toContainText('Corsa facile + allunghi');
  expect((fake.doc(EMAIL, 'app/core') as { profile: { name: string } }).profile.name).toBe('Paolo'); expect((fake.doc(AMICO, 'app/core') as { profile: { name: string } }).profile.name).toBe('Amico');
  expect(fake.of(EMAIL).filter(r => r.coll === 'workouts').length).toBe(0);
  await d.ctx.close();
});

test('dispositivo con un piano diverso da quello dell’account: l’app chiede quale tenere', async ({ browser }) => {
  const fake = new FakeSupabase();
  const phone = await open(browser, fake), other = await open(browser, fake);
  await importBackup(phone.page); await phone.page.goto(URL + '/profilo'); await enter(phone.page, 'Crea account');
  await expect(sync(phone.page)).toHaveText('Sincronizzato');

  await importBackup(other.page);
  await other.page.goto(URL + '/obiettivi');
  await other.page.locator('.card').first().getByRole('button', { name: 'Modifica' }).click();
  await other.page.locator('#g-h').fill('3'); await other.page.locator('#g-m').fill('45'); await other.page.locator('#sheet').getByRole('button', { name: 'Salva' }).click();
  await other.page.goto(URL + '/profilo');
  await enter(other.page, 'Accedi');
  await expect(account(other.page)).toContainText('Questo dispositivo e l’account hanno piani diversi.');
  await expect(sync(other.page)).toHaveText('Da scegliere');
  expect((fake.doc(EMAIL, 'app/core') as { goal: { sec: number } }).goal.sec).toBe(14400); // finché non scelgo, nulla viene sovrascritto
  await account(other.page).getByRole('button', { name: 'Usa l’account' }).click();
  await expect(sync(other.page)).toHaveText('Sincronizzato');
  await other.page.goto(URL + '/obiettivi');
  await expect(other.page.locator('.card').first()).toContainText('4:00');
  await phone.ctx.close(); await other.ctx.close();
});

test('errori di accesso in italiano; password sbagliata, email già usata, password corta', async ({ browser }) => {
  const fake = new FakeSupabase(), d = await open(browser, fake);
  await enter(d.page, 'Accedi');
  await toast(d.page, 'Email o password non corretti.');
  await enter(d.page, 'Crea account', EMAIL, 'corta');
  await toast(d.page, 'Password troppo corta: almeno 8 caratteri.');
  expect(fake.passwords.size).toBe(0);
  await enter(d.page, 'Crea account');
  await expect(sync(d.page)).toHaveText('Sincronizzato');
  await account(d.page).getByRole('button', { name: 'Esci' }).click();
  await enter(d.page, 'Crea account');
  await toast(d.page, 'Esiste già un account con questa email: accedi.');
  await expect(sync(d.page)).toHaveText('Solo locale');
  await d.ctx.close();
});

test('cambio la password dall’account e rientro con quella nuova', async ({ browser }) => {
  const fake = new FakeSupabase(), d = await open(browser, fake);
  await enter(d.page, 'Crea account');
  await expect(sync(d.page)).toHaveText('Sincronizzato');
  await account(d.page).getByText('Password', { exact: true }).click();
  await account(d.page).getByLabel('Nuova password').fill('nuova-password-27');
  await account(d.page).getByRole('button', { name: 'Salva' }).click();
  await toast(d.page, 'Password salvata.');
  await account(d.page).getByRole('button', { name: 'Esci' }).click();
  await enter(d.page, 'Accedi');
  await toast(d.page, 'Email o password non corretti.');
  await enter(d.page, 'Accedi', EMAIL, 'nuova-password-27');
  await expect(sync(d.page)).toHaveText('Sincronizzato');
  await d.ctx.close();
});

test('se il progetto chiede la conferma via email, l’app lo dice e non entra', async ({ browser }) => {
  const fake = new FakeSupabase(); fake.confirm = true;
  const d = await open(browser, fake);
  await enter(d.page, 'Crea account');
  await expect(account(d.page)).toContainText('Controlla l’email per confermare l’account.');
  await expect(sync(d.page)).toHaveText('Solo locale');
  await d.ctx.close();
});

test('accesso con il link via email: nell’app installata si entra con il codice della stessa email', async ({ browser }) => {
  const fake = new FakeSupabase(), d = await open(browser, fake), card = account(d.page);
  await card.getByLabel('Email').fill(EMAIL);
  await card.getByRole('button', { name: 'Accedi con un link via email' }).click();
  await expect(card).toContainText('Link inviato a ' + EMAIL);
  expect(fake.otp).toEqual([{ email: EMAIL, redirect: URL + '/profilo' }]);
  await card.getByLabel('Codice').fill('000000'); await card.getByRole('button', { name: 'Accedi', exact: true }).click();
  await toast(d.page, 'Codice scaduto o non valido.');
  await expect(sync(d.page)).toHaveText('Solo locale');
  await card.getByLabel('Codice').fill(CODE); await card.getByRole('button', { name: 'Accedi', exact: true }).click();
  await expect(sync(d.page)).toHaveText('Sincronizzato');
  await d.ctx.close();
});
