/* Sincronizzazione tra dispositivi.
   L'app scrive sempre in locale (IndexedDB + coda `outbox`). Qui la coda si svuota quando c'è rete e si scaricano
   i documenti cambiati. Conflitto sullo stesso documento: vince la scrittura più recente.

   Come si riconosce che cosa è cambiato. `updated_at` è l'orario in cui il documento è stato scritto sul
   dispositivo (corretto sull'orologio del server, se noto): serve a decidere i conflitti. Non può fare anche da
   "cursore" di scaricamento: una corsa registrata offline alle 10 e inviata alle 12 ha un orario più vecchio di
   quello a cui un altro dispositivo si è già allineato, e non verrebbe mai vista. Per questo a ogni giro si legge
   l'elenco (coll, id, updated_at) dell'account, lo si confronta con quello locale e si scaricano solo i documenti
   il cui orario è diverso.

   Il motore parla con un'interfaccia (RemoteDocs, RemoteAuth): l'adattatore Supabase sta in remote.ts. */
import type { Session, Workout } from '../domain/types';
import { type Coll, type DocRow, type OutRow } from './db';
import { getPath, type Store } from './store';

export interface DocKey { coll: Coll; id: string }
export interface DocHead extends DocKey { updated_at: string }
export interface RemoteRow extends DocHead { data: unknown | null }
export interface RemoteDocs {
  /** Elenco di tutti i documenti dell'utente: chiave e orario, senza contenuto. */
  heads(): Promise<DocHead[]>;
  /** Contenuto dei documenti indicati. */
  get(keys: DocKey[]): Promise<RemoteRow[]>;
  /** Scrive i documenti (crea o sostituisce) e restituisce l'updated_at che hanno sul server. */
  push(rows: RemoteRow[]): Promise<DocHead[]>;
  /** Orologio del server meno orologio del dispositivo, in ms (0 se non è noto). */
  offset?(): number;
}
export interface AuthUser { id: string; email: string | null }
export interface RemoteAuth {
  user(): Promise<AuthUser | null>;
  onChange(cb: (u: AuthUser | null) => void): () => void;
  /** Invia il link di accesso via email. */
  signIn(email: string): Promise<void>;
  /** Accesso con il codice a 6 cifre contenuto nella stessa email (serve nell'app installata su iPhone). */
  verifyCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
}
export interface Remote { auth: RemoteAuth; docs(userId: string): RemoteDocs }

export interface SyncStatus {
  /** URL e chiave di Supabase presenti nella build. */
  configured: boolean;
  /** Email dell'account collegato, se c'è. */
  email: string | null;
  busy: boolean;
  /** Scritture ancora da inviare. */
  pending: number;
  error: string | null;
  /** Primo allineamento con il server completato. */
  first: boolean;
  /** Dispositivo e account hanno piani diversi: serve una scelta. */
  choice: boolean;
}
export const LOCAL_ONLY: SyncStatus = { configured: false, email: null, busy: false, pending: 0, error: null, first: false, choice: false };

/** rev: orario (ms) che il documento ha sul server nell'ultima versione nota a questo dispositivo. */
type DocRowRev = DocRow & { rev?: number };
const ms = (t: string) => Date.parse(t);
const key = (r: { coll: string; id: string }) => r.coll + '/' + r.id;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class Sync {
  private status: SyncStatus;
  private subs = new Set<() => void>();
  private user: AuthUser | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Documenti dell'account in attesa della scelta al primo collegamento. */
  private held: RemoteRow[] | null = null;
  private stops: (() => void)[] = [];

  private remote: Remote | null = null;
  private readonly now: () => number;
  private readonly auto: boolean;

  /**
   * loadRemote: crea il collegamento al server (null = app non configurata, resta solo locale).
   * auto: false disattiva i giri automatici (scritture, ritorno della rete, intervallo): lo usano i test.
   */
  constructor(private readonly store: Store, private readonly loadRemote: (() => Promise<Remote | null>) | null, opts: { now?: () => number; auto?: boolean } = {}) {
    this.now = opts.now || Date.now; this.auto = opts.auto !== false;
    this.status = Object.assign({}, LOCAL_ONLY, { configured: !!loadRemote });
  }

  subscribe = (f: () => void): (() => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getStatus = (): SyncStatus => this.status;
  private set(p: Partial<SyncStatus>): void { this.status = Object.assign({}, this.status, p); this.subs.forEach(f => f()); }

  /** Collega il motore: sessione esistente, cambi di accesso, scritture in coda, ritorno della rete. */
  async start(): Promise<void> {
    if (!this.loadRemote) return;
    try { this.remote = await this.loadRemote(); } catch (e) { this.set({ error: msg(e) }); return; }
    if (!this.remote) { this.set({ configured: false }); return; }
    this.store.onQueued = () => { void this.refreshPending(); if (this.auto) this.schedule(800); };
    this.stops.push(this.remote.auth.onChange(u => { void this.setUser(u); }));
    if (this.auto && typeof window !== 'undefined') {
      const kick = () => this.schedule(0), vis = () => { if (!document.hidden) this.schedule(0); };
      window.addEventListener('online', kick); document.addEventListener('visibilitychange', vis);
      const id = window.setInterval(() => { if (!document.hidden) this.schedule(0); }, 60000);
      this.stops.push(() => { window.removeEventListener('online', kick); document.removeEventListener('visibilitychange', vis); window.clearInterval(id); });
    }
    await this.setUser(await this.remote.auth.user().catch(() => null));
  }
  stop(): void { this.stops.forEach(f => f()); this.stops = []; if (this.timer) clearTimeout(this.timer); this.store.onQueued = null; }

  private async setUser(u: AuthUser | null): Promise<void> {
    if ((u && u.id) === (this.user && this.user.id)) return;
    this.user = u; this.held = null;
    this.set({ email: u ? (u.email || '') : null, first: false, choice: false, error: null });
    await this.refreshPending();
    if (u) await this.syncNow();
  }
  private async refreshPending(): Promise<void> { const n = await this.store.db.outbox.count(); if (n !== this.status.pending) this.set({ pending: n }); }

  schedule(ms: number): void {
    if (!this.user) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.syncNow(); }, ms);
  }

  async signIn(email: string): Promise<string | null> {
    if (!this.remote) return 'Accesso non configurato.';
    try { await this.remote.auth.signIn(email); return null; } catch (e) { return msg(e); }
  }
  async verifyCode(email: string, code: string): Promise<string | null> {
    if (!this.remote) return 'Accesso non configurato.';
    try { await this.remote.auth.verifyCode(email, code); await this.setUser(await this.remote.auth.user()); return null; } catch (e) { return msg(e); }
  }
  async signOut(): Promise<void> { if (this.remote) { try { await this.remote.auth.signOut(); } catch { /* offline: la sessione locale viene comunque chiusa */ } await this.setUser(null); } }

  /** Un giro di sincronizzazione: scarica, risolve i conflitti, invia la coda. Mai due giri insieme. */
  syncNow(): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    const run = async () => {
      do { this.again = false; await this.cycle(); } while (this.again);
    };
    this.running = run().finally(() => { this.running = null; });
    return this.running;
  }

  private async cycle(): Promise<void> {
    const u = this.user, remote = this.remote;
    if (!u || !remote || this.status.choice) return;
    const db = this.store.db, docs = remote.docs(u.id);
    // senza rete non si prova nemmeno: la coda resta e l'interfaccia lo dice subito
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { await this.refreshPending(); this.set({ error: 'Senza rete' }); return; }
    this.set({ busy: true });
    try {
      await this.store.idle();
      const linked = await db.getMeta<string>('sync:user'), heads = await docs.heads();
      if (linked !== u.id) { if (!(await this.firstLink(u, docs, heads))) return; }
      else {
        const local = new Map((await db.docs.toArray() as DocRowRev[]).map(r => [key(r), r.rev]));
        const changed = heads.filter(h => local.get(key(h)) !== ms(h.updated_at));
        if (changed.length) await this.merge(await docs.get(changed), off(docs));
      }
      await this.pushOutbox(docs);
      this.set({ error: null, first: true });
    } catch (e) {
      this.set({ error: msg(e) });
    } finally {
      await this.refreshPending();
      this.set({ busy: false });
    }
  }

  /** Primo collegamento di questo dispositivo a questo account. false = serve una scelta dell'utente. */
  private async firstLink(u: AuthUser, docs: RemoteDocs, heads: DocHead[]): Promise<boolean> {
    const rows = heads.length ? await docs.get(heads) : [], S = this.store.S;
    const rCore = rows.find(r => key(r) === 'app/core' && r.data != null), rPlan = rows.find(r => key(r) === 'app/plan' && r.data != null);
    if (rCore && this.store.ready() && !(same(rCore.data, S.core) && same(rPlan ? rPlan.data : null, S.plan))) {
      this.held = rows; this.set({ choice: true, busy: false });
      return false;
    }
    await this.adopt(u, rows, rCore ? 'remote' : 'local');
    return true;
  }

  /** Scelta al primo collegamento: tenere i dati dell'account oppure quelli di questo dispositivo. */
  async resolve(keep: 'local' | 'remote'): Promise<void> {
    const u = this.user, rows = this.held;
    if (!u || !rows) return;
    await this.adopt(u, rows, keep);
    this.held = null; this.set({ choice: false });
    await this.syncNow();
  }

  /**
   * Unisce dispositivo e account. Dove un documento esiste da entrambe le parti vince la parte scelta;
   * quelli presenti da una sola parte si conservano sempre (nessun allenamento va perso).
   */
  private async adopt(u: AuthUser, rows: RemoteRow[], keep: 'local' | 'remote'): Promise<void> {
    const db = this.store.db, local = await db.docs.toArray() as DocRowRev[], lmap = new Map(local.map(r => [key(r), r])), rmap = new Map(rows.map(r => [key(r), r]));
    const apply: DocRowRev[] = [], queue: OutRow[] = [], unqueue: string[] = [], rev: DocRowRev[] = [], now = this.now();
    for (const r of rows) {
      const l = lmap.get(key(r));
      if (!l || l.data == null || keep === 'remote') { apply.push({ coll: r.coll, id: r.id, data: r.data, at: ms(r.updated_at), rev: ms(r.updated_at) }); unqueue.push(key(r)); }
      else if (same(l.data, r.data)) { rev.push(Object.assign({}, l, { rev: ms(r.updated_at) })); unqueue.push(key(r)); }
      else queue.push({ path: key(r), coll: l.coll, id: l.id, data: l.data, at: now });
    }
    for (const l of local) if (!rmap.has(key(l)) && l.data != null) queue.push({ path: key(l), coll: l.coll, id: l.id, data: l.data, at: l.at });
    await db.transaction('rw', db.docs, db.outbox, db.meta, async () => {
      await db.outbox.bulkDelete(unqueue);
      for (const q of queue) { const cur = await db.outbox.get(q.path); if (!cur || keep === 'local') await db.outbox.put(cur && cur.at > q.at ? cur : q); }
      for (const r of rev) await db.docs.put(r);
      await db.meta.put({ k: 'sync:user', v: u.id });
    });
    await this.store.applyRemote(apply);
    if (apply.length) this.reconcile();
  }

  /** Applica i documenti scaricati. Se lo stesso documento ha una scrittura locale in coda vince la più recente. */
  private async merge(rows: RemoteRow[], offset: number): Promise<void> {
    if (!rows.length) return;
    const db = this.store.db, apply: DocRowRev[] = [], drop: string[] = [], rev: DocRowRev[] = [];
    for (const r of rows) {
      const k = key(r), at = ms(r.updated_at), pend = await db.outbox.get(k);
      if (pend) {
        if (same(pend.data, r.data)) { drop.push(k); const cur = await db.docs.get([r.coll, r.id]) as DocRowRev | undefined; if (cur) rev.push(Object.assign({}, cur, { rev: at })); continue; }
        if (at <= pend.at + offset) continue; // la nostra scrittura è più recente: verrà inviata e sostituirà quella sul server
        drop.push(k); // sul server c'è una scrittura più recente della nostra
      }
      apply.push({ coll: r.coll, id: r.id, data: r.data, at, rev: at });
    }
    if (drop.length || rev.length) await db.transaction('rw', db.docs, db.outbox, async () => { await db.outbox.bulkDelete(drop); for (const r of rev) await db.docs.put(r); });
    await this.store.applyRemote(apply);
    if (apply.length) this.reconcile();
  }

  private async pushOutbox(docs: RemoteDocs): Promise<void> {
    const db = this.store.db;
    for (;;) {
      await this.store.idle();
      const batch = (await db.outbox.toArray()).sort((a, b) => a.at - b.at).slice(0, 40);
      if (!batch.length) return;
      const offset = off(docs);
      const saved = await docs.push(batch.map(o => ({ coll: o.coll, id: o.id, data: o.data, updated_at: new Date(o.at + offset).toISOString() })));
      const revs = new Map(saved.map(h => [key(h), ms(h.updated_at)]));
      await db.transaction('rw', db.docs, db.outbox, async () => {
        for (const o of batch) {
          const cur = await db.outbox.get(o.path);
          if (cur && cur.at === o.at) await db.outbox.delete(o.path); // se nel frattempo è stato riscritto resta in coda
          const d = await db.docs.get([o.coll, o.id]) as DocRowRev | undefined, rv = revs.get(o.path);
          if (rv == null) continue;
          if (d) await db.docs.put(Object.assign({}, d, { rev: rv }));
          else if (o.data === null) await db.docs.put({ coll: o.coll, id: o.id, data: null, at: o.at, rev: rv } as DocRowRev); // eliminato: resta il segnaposto con l'orario
        }
      });
    }
  }

  /** Dopo un'unione: un allenamento collegato a una sessione la rende fatta anche se il piano è arrivato da un altro dispositivo. */
  private reconcile(): void {
    const S = this.store.S; if (!S.plan || !S.plan.sessions) return;
    let dirty = false;
    const byId = new Map<string, Session>(S.plan.sessions.map(s => [s.id, s]));
    Object.keys(S.workouts).forEach(id => {
      const w: Workout = S.workouts[id], s = w.sid ? byId.get(w.sid) : undefined;
      if (!s) return;
      if (!w.deleted && s.st === 'planned' && !s.wid) { s.st = 'done'; s.wid = w.id; dirty = true; }
      else if (w.deleted && s.wid === w.id && s.st === 'done') { s.st = 'planned'; delete s.wid; dirty = true; }
    });
    if (dirty && getPath(S, 'app/plan')) this.store.put('app/plan', S.plan);
  }
}

function off(docs: RemoteDocs): number { const o = docs.offset ? docs.offset() : 0; return isFinite(o) ? o : 0; }
function msg(e: unknown): string { return e instanceof Error ? e.message : typeof e === 'string' ? e : 'Errore di rete'; }
