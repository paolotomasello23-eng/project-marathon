/* Stato in memoria (stessa forma del prototipo) e salvataggio locale con coda di scrittura. */
import type { Change, Checkin, Core, Plan, PlanVersion, State, Workout } from '../domain/types';
import { type DocRow, MMDb, type OutRow, splitPath } from './db';

export interface AppState {
  core: Core | null;
  plan: Plan | null;
  workouts: Record<string, Workout>;
  checkins: Record<string, Checkin>;
  changes: Record<string, Change>;
  versions: Record<string, PlanVersion>;
}
export const emptyState = (): AppState => ({ core: null, plan: null, workouts: {}, checkins: {}, changes: {}, versions: {} });

type Bag = Record<string, Record<string, unknown> | unknown>;
export function setPath(S: AppState, path: string, data: unknown | null): void {
  const [coll, id] = splitPath(path), bag = S as unknown as Bag;
  if (coll === 'app') bag[id] = data;
  else if (data === null) delete (bag[coll] as Record<string, unknown>)[id];
  else (bag[coll] as Record<string, unknown>)[id] = data;
}
export function getPath(S: AppState, path: string): unknown {
  const [coll, id] = splitPath(path), bag = S as unknown as Bag;
  return coll === 'app' ? bag[id] : (bag[coll] as Record<string, unknown>)[id];
}
function byAt<T extends { at?: string; id: string }>(o: Record<string, T>): T[] {
  return Object.keys(o).map(k => o[k]).sort((a, b) => (a.at || '') < (b.at || '') ? -1 : (a.at || '') > (b.at || '') ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Archivio sincrono per il registro delle scritture non ancora confermate (in pratica localStorage). */
export interface JournalStorage { readonly length: number; key(i: number): string | null; getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
function defaultJournal(): JournalStorage | null { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }

export class Store {
  S: AppState = emptyState();
  loaded = false;
  lastError: unknown = null;
  /** Chiamata dopo ogni scrittura accodata: la usa la sincronizzazione. */
  onQueued: (() => void) | null = null;
  private rev = 0;
  private subs = new Set<() => void>();
  private dirty = new Map<string, { at: number; json: string | null }>();
  private scheduled = false;
  private chain: Promise<void> = Promise.resolve();
  private lastAt = 0;
  private journalAt = new Map<string, number>();
  private readonly jp: string;

  /**
   * IndexedDB è asincrono: se la pagina viene chiusa un istante dopo un salvataggio la transazione può non
   * arrivare in fondo. Per questo ogni scrittura finisce prima, in modo sincrono, in un registro (localStorage)
   * che viene svuotato quando IndexedDB conferma e riapplicato al prossimo avvio se qualcosa è rimasto.
   */
  constructor(readonly db: MMDb = new MMDb(), private readonly journal: JournalStorage | null = defaultJournal(), private readonly now: () => number = Date.now) { this.jp = db.name + '.j:'; }

  subscribe = (fn: () => void): (() => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  getRev = (): number => this.rev;
  emit(): void { this.rev++; this.subs.forEach(f => f()); }

  /** Riapplica le scritture rimaste nel registro da una sessione chiusa prima della conferma di IndexedDB. */
  private async replayJournal(): Promise<void> {
    const j = this.journal; if (!j) return;
    const items: OutRow[] = [], keys: string[] = [];
    try {
      for (let i = 0; i < j.length; i++) { const k = j.key(i); if (k && k.indexOf(this.jp) === 0) keys.push(k); }
      for (const k of keys) { const o = JSON.parse(j.getItem(k) || 'null') as { at: number; data: unknown } | null; if (!o) continue; const path = k.slice(this.jp.length), [coll, id] = splitPath(path); items.push({ path, coll, id, at: o.at, data: o.data == null ? null : o.data }); }
    } catch { return; }
    if (!items.length) return;
    const db = this.db;
    await db.transaction('rw', db.docs, db.outbox, async () => {
      for (const it of items) {
        const cur = await db.docs.get([it.coll, it.id]);
        if (cur && cur.at > it.at) continue; // su disco c'è già qualcosa di più recente
        if (it.data === null) await db.docs.delete([it.coll, it.id]); else await db.docs.put({ coll: it.coll, id: it.id, data: it.data, at: it.at });
        await db.outbox.put(it);
      }
    });
    try { keys.forEach(k => j.removeItem(k)); } catch { /* niente */ }
  }

  async load(): Promise<void> {
    await this.replayJournal();
    const rows = await this.db.docs.toArray(), S = emptyState();
    for (const r of rows) if (r.data != null) setPath(S, r.coll + '/' + r.id, r.data);
    this.S = S; this.loaded = true; this.emit();
  }

  ready(): boolean { return !!(this.S.core && this.S.plan && this.S.plan.sessions); }

  /** Stato nella forma letta dal motore: liste ordinate per momento di creazione. */
  st(): State {
    const S = this.S;
    return { core: S.core as Core, plan: S.plan as Plan, workouts: byAt(S.workouts), checkins: byAt(S.checkins), changes: byAt(S.changes) };
  }

  /** Scrive un documento: subito in memoria, poi in IndexedDB e nella coda di invio (stessa transazione). */
  put(path: string, data: unknown | null): void {
    setPath(this.S, path, data);
    const at = this.lastAt = Math.max(this.now(), this.lastAt + 1), cur = getPath(this.S, path), json = cur == null ? null : JSON.stringify(cur);
    this.dirty.set(path, { at, json });
    if (this.journal) { try { this.journal.setItem(this.jp + path, '{"at":' + at + ',"data":' + (json === null ? 'null' : json) + '}'); this.journalAt.set(path, at); } catch { /* spazio esaurito o archivio bloccato: resta la scrittura su IndexedDB */ } }
    if (!this.scheduled) { this.scheduled = true; queueMicrotask(() => this.flushDirty()); }
    this.emit();
  }

  private journalDone(items: OutRow[]): void {
    const j = this.journal; if (!j) return;
    for (const it of items) if (this.journalAt.get(it.path) === it.at) { this.journalAt.delete(it.path); try { j.removeItem(this.jp + it.path); } catch { /* niente */ } }
  }

  private flushDirty(): void {
    this.scheduled = false;
    const items: OutRow[] = [];
    this.dirty.forEach((d, path) => { const [coll, id] = splitPath(path); items.push({ path, coll, id, at: d.at, data: d.json === null ? null : JSON.parse(d.json) }); });
    this.dirty.clear();
    if (!items.length) return;
    const db = this.db;
    this.chain = this.chain.then(() => db.transaction('rw', db.docs, db.outbox, async () => {
      for (const it of items) {
        if (it.data === null) await db.docs.delete([it.coll, it.id]); else await db.docs.put({ coll: it.coll, id: it.id, data: it.data, at: it.at });
        await db.outbox.put(it);
      }
    })).then(() => { this.journalDone(items); if (this.onQueued) this.onQueued(); }, e => { this.lastError = e; if (typeof console !== 'undefined') console.error('Salvataggio locale non riuscito', e); });
  }

  /** Si risolve quando tutte le scritture richieste finora sono su disco. */
  async idle(): Promise<void> { do { await Promise.resolve(); await this.chain; } while (this.scheduled || this.dirty.size); }

  /** Applica documenti arrivati dal server: memoria e IndexedDB, senza rimetterli in coda. */
  async applyRemote(rows: DocRow[]): Promise<void> {
    if (!rows.length) return;
    await this.idle();
    for (const r of rows) setPath(this.S, r.coll + '/' + r.id, r.data === null || r.data === undefined ? null : r.data);
    const db = this.db;
    await db.transaction('rw', db.docs, async () => {
      // un documento eliminato resta su disco come segnaposto (data null) con il suo orario: così non viene riscaricato
      for (const r of rows) await db.docs.put(r.data === undefined ? Object.assign({}, r, { data: null }) : r);
    });
    this.emit();
  }
}
