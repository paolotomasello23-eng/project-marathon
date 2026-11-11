/* Promemoria locali: una notifica il giorno dell'allenamento. Nessun server di push.
   Quello che una web app può fare davvero senza server:
   - mentre l'app è aperta e alla prima apertura della giornata: sempre, se le notifiche sono permesse;
   - ad app chiusa: solo dove il sistema concede il controllo periodico in background (Android con l'app
     installata), a un orario che decide il sistema. Su iPhone la notifica arriva solo aprendo l'app. */
import * as P from '../domain/plan';
import type { Actions } from '../data/actions';
import type { MMDb } from '../data/db';
import type { Iso, Session } from '../domain/types';

export interface Reminder { d: Iso; title: string; body: string }
export type ReminderState = 'unsupported' | 'blocked' | 'on' | 'off';
export const REM_TAG = 'madrid27-promemoria';
/** Nessuna notifica prima di quest'ora (si può cambiare scrivendo `rem:hour` nell'archivio locale). */
export const FROM_HOUR = 6;
export async function fromHour(db: MMDb): Promise<number> { const h = await db.getMeta<number>('rem:hour'); return typeof h === 'number' ? h : FROM_HOUR; }

/** La sessione da ricordare in un giorno: tra quelle ancora da fare, prima la corsa, poi la forza, poi il resto. */
function mainOn(app: Actions, d: Iso): Session | null {
  const todo = app.sessionsOn(d).filter(x => x.k !== 'rest' && x.st === 'planned');
  return todo.filter(x => x.k === 'run')[0] || todo.filter(x => x.k === 'strength')[0] || todo[0] || null;
}
export function reminderFor(app: Actions, d: Iso): Reminder | null {
  if (!app.ready()) return null;
  const s = mainOn(app, d); if (!s) return null;
  const x = app.describe(s), body = [s.km ? P.nf(s.km) + ' km' : null, x.pace, x.dur ? P.fmtDur(x.dur) : null].filter(Boolean).join(' · ');
  return { d, title: 'Oggi: ' + x.title, body };
}
/** I promemoria dei prossimi giorni, letti dal service worker quando il sistema lo sveglia. */
export function reminderSchedule(app: Actions, from: Iso, days = 21): Reminder[] {
  const out: Reminder[] = [];
  for (let i = 0; i < days; i++) { const r = reminderFor(app, P.addDays(from, i)); if (r) out.push(r); }
  return out;
}

export function remindersSupported(): boolean { return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator; }
export async function reminderState(db: MMDb): Promise<ReminderState> {
  if (!remindersSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && (await db.getMeta<boolean>('rem:on')) ? 'on' : 'off';
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try { return (await navigator.serviceWorker.getRegistration()) || null; } catch { return null; }
}
/** Chiede al sistema di svegliare il service worker circa una volta al giorno, dove è possibile. */
async function periodic(on: boolean): Promise<void> {
  const reg = await registration() as (ServiceWorkerRegistration & { periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void>; unregister(tag: string): Promise<void> } }) | null;
  if (!reg || !reg.periodicSync) return;
  try { if (on) await reg.periodicSync.register(REM_TAG, { minInterval: 12 * 3600 * 1000 }); else await reg.periodicSync.unregister(REM_TAG); } catch { /* non concesso: restano i promemoria ad app aperta */ }
}

/** Attiva i promemoria: chiede il permesso e mostra subito quello di oggi, se c'è. */
export async function enableReminders(app: Actions, t: Iso): Promise<ReminderState> {
  if (!remindersSupported()) return 'unsupported';
  const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (p !== 'granted') return p === 'denied' ? 'blocked' : 'off';
  await app.store.db.setMeta('rem:on', true);
  await periodic(true);
  await checkReminder(app, t, true);
  return 'on';
}
export async function disableReminders(db: MMDb): Promise<ReminderState> {
  await db.setMeta('rem:on', false); await periodic(false);
  return 'off';
}

/**
 * Da chiamare all'avvio, quando l'app torna in primo piano e a ogni cambio del piano: aggiorna l'elenco per il
 * service worker e, se oggi c'è un allenamento non ancora notificato, mostra la notifica. now = forza l'orario.
 */
export async function checkReminder(app: Actions, t: Iso, now = false): Promise<boolean> {
  const db = app.store.db;
  if (!remindersSupported() || Notification.permission !== 'granted' || !(await db.getMeta<boolean>('rem:on'))) return false;
  await db.setMeta('rem:plan', reminderSchedule(app, t));
  const r = reminderFor(app, t);
  if (!r || (await db.getMeta<string>('rem:last')) === t || (!now && new Date().getHours() < await fromHour(db))) return false;
  const reg = await registration();
  try {
    if (reg) await reg.showNotification(r.title, { body: r.body, tag: REM_TAG, icon: '/icon-192.png', badge: '/maskable-192.png', lang: 'it', data: { url: '/' } });
    else new Notification(r.title, { body: r.body, tag: REM_TAG, icon: '/icon-192.png', lang: 'it' });
  } catch { return false; }
  await db.setMeta('rem:last', t);
  return true;
}
