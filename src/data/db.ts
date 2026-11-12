/* IndexedDB tramite Dexie. L'app legge e scrive sempre qui; la rete serve solo a sincronizzare. */
import Dexie, { type Table } from 'dexie';

export type Coll = 'app' | 'workouts' | 'checkins' | 'changes' | 'versions';
export const COLLS: Coll[] = ['app', 'workouts', 'checkins', 'changes', 'versions'];

/** Un documento: stessa forma della tabella `docs` di Supabase. */
export interface DocRow { coll: Coll; id: string; data: unknown; at: number }
/** Una scrittura in attesa di essere inviata. data null = documento eliminato. */
export interface OutRow { path: string; coll: Coll; id: string; data: unknown | null; at: number }
export interface MetaRow { k: string; v: unknown }

export const DB_NAME = 'madrid27';

export class MMDb extends Dexie {
  docs!: Table<DocRow, [string, string]>;
  outbox!: Table<OutRow, string>;
  meta!: Table<MetaRow, string>;
  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({ docs: '[coll+id], coll', outbox: 'path', meta: 'k' });
  }
  async getMeta<T>(k: string): Promise<T | undefined> { const r = await this.meta.get(k); return r ? (r.v as T) : undefined; }
  async setMeta(k: string, v: unknown): Promise<void> { await this.meta.put({ k, v }); }
}

let device: MMDb | null = null;
/** Archivio delle impostazioni del dispositivo (promemoria): sempre lo stesso, qualunque account sia in uso. */
export function deviceDb(): MMDb { return device || (device = new MMDb(DB_NAME)); }

export function splitPath(path: string): [Coll, string] { const i = path.indexOf('/'); return [path.slice(0, i) as Coll, path.slice(i + 1)]; }
