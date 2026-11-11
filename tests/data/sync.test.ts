/* Sincronizzazione: due dispositivi (IndexedDB separati) contro un server finto che si comporta come la tabella `docs`. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import backup from '../../reference/data/backup.json';
import { Actions } from '../../src/data/actions';
import { MMDb } from '../../src/data/db';
import { Store } from '../../src/data/store';
import { type AuthUser, type DocKey, type Remote, type RemoteRow, Sync } from '../../src/data/sync';

let seq = 0;
const T0 = Date.parse('2026-11-17T08:00:00+01:00');
const tick = (ms: number) => vi.setSystemTime(Date.now() + ms);

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
afterAll(() => { vi.useRealTimers(); });

/** Il server: una mappa per utente, come la tabella `docs`. Con trigger = true riscrive updated_at con il proprio orologio. */
class Server {
  rows = new Map<string, Map<string, RemoteRow>>();
  online = true; trigger = false; listed = 0; fetched: string[] = []; pushes = 0;
  /** Postgres restituisce gli orari in questo formato. */
  private fmt(t: string): string { return new Date(Date.parse(t)).toISOString().replace('Z', '+00:00'); }
  docs(user: string) {
    const mine = () => { if (!this.rows.has(user)) this.rows.set(user, new Map()); return this.rows.get(user)!; };
    const up = () => { if (!this.online) throw new Error('Failed to fetch'); };
    return {
      heads: async () => { up(); this.listed++; return [...mine().values()].map(r => ({ coll: r.coll, id: r.id, updated_at: r.updated_at })); },
      get: async (keys: DocKey[]): Promise<RemoteRow[]> => { up(); keys.forEach(k => this.fetched.push(k.coll + '/' + k.id)); return keys.map(k => mine().get(k.coll + '/' + k.id)).filter(Boolean).map(r => JSON.parse(JSON.stringify(r))); },
      push: async (rows: RemoteRow[]) => {
        up(); this.pushes++;
        return rows.map(r => { const row = { coll: r.coll, id: r.id, data: JSON.parse(JSON.stringify(r.data)), updated_at: this.fmt(this.trigger ? new Date(Date.now()).toISOString() : r.updated_at) }; mine().set(r.coll + '/' + r.id, row); return { coll: row.coll, id: row.id, updated_at: row.updated_at }; });
      }
    };
  }
  get(user: string, path: string) { const r = this.rows.get(user)?.get(path); return r ? r.data as Record<string, any> : undefined; } // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface Device { db: MMDb; store: Store; app: Actions; sync: Sync; login(u: AuthUser | null): Promise<void>; skew: number }
/** Un dispositivo con il suo archivio locale; skew = quanto il suo orologio è avanti (+) o indietro (−) rispetto al server. */
async function device(server: Server, skew = 0): Promise<Device> {
  const db = new MMDb('sync-' + (++seq)), now = () => Date.now() + skew, store = new Store(db, null, now), app = new Actions(store, () => '2026-11-17');
  let user: AuthUser | null = null; const subs: ((u: AuthUser | null) => void)[] = [];
  const remote: Remote = {
    auth: { user: async () => user, onChange: cb => { subs.push(cb); return () => { }; }, signIn: async () => { }, verifyCode: async () => { }, signOut: async () => { user = null; } },
    docs: id => Object.assign(server.docs(id), { offset: () => -skew })
  };
  const sync = new Sync(store, async () => remote, { now, auto: false });
  await store.load(); await sync.start();
  return { db, store, app, sync, skew, login: async u => { user = u; subs.forEach(f => f(u)); await new Promise(r => setTimeout(r, 0)); await sync.syncNow(); } };
}
const paolo: AuthUser = { id: 'u-paolo', email: 'paolo@example.com' };
const run = (d: Device, sid: string, extra: object = {}) => { const s = d.app.session(sid)!; return d.app.saveWorkout({ date: s.d, k: 'run', sub: s.s, sid, km: s.km as number, sec: Math.round((s.km as number) * 375), rpe: 3, ...extra }); };
async function pair(): Promise<{ server: Server; phone: Device; laptop: Device }> {
  vi.setSystemTime(T0);
  const server = new Server(), phone = await device(server), laptop = await device(server);
  phone.app.importObject(backup); await phone.store.idle();
  await phone.login(paolo); await laptop.login(paolo);
  return { server, phone, laptop };
}

describe('primo collegamento', () => {
  it('telefono con i dati, account vuoto: tutto sale sul server; il computer vuoto li riceve', async () => {
    const { server, phone, laptop } = await pair();
    expect(phone.sync.getStatus()).toMatchObject({ configured: true, email: 'paolo@example.com', pending: 0, error: null, first: true, choice: false });
    expect(server.rows.get('u-paolo')!.size).toBe(11); // core, plan, 9 modifiche
    expect(server.get('u-paolo', 'app/plan')!.sessions.length).toBe(161);
    expect(laptop.app.ready()).toBe(true); expect(laptop.sync.getStatus().choice).toBe(false);
    expect(laptop.store.S.plan).toEqual(phone.store.S.plan); expect(laptop.store.S.core).toEqual(phone.store.S.core);
    expect(Object.keys(laptop.store.S.changes).sort()).toEqual(Object.keys(phone.store.S.changes).sort());
    expect(await laptop.db.outbox.count()).toBe(0);
    // i dati scaricati sono su disco: un nuovo avvio del computer li ritrova senza rete
    const again = new Store(laptop.db, null); await again.load(); expect(again.S.plan!.sessions.length).toBe(161);
  });

  it('senza accesso non parte nulla e l’app resta locale', async () => {
    vi.setSystemTime(T0);
    const server = new Server(), d = await device(server);
    d.app.importObject(backup); await d.store.idle(); await d.sync.syncNow();
    expect(d.sync.getStatus()).toMatchObject({ email: null, first: false }); expect(server.listed).toBe(0); expect(server.pushes).toBe(0);
    expect(await d.db.outbox.count()).toBe(11); // resta in coda per quando ci sarà un account
    const none = new Sync(d.store, null); await none.start(); expect(none.getStatus().configured).toBe(false);
  });

  it('dispositivo e account con piani diversi: l’app chiede; "usa l’account" tiene gli allenamenti presenti solo qui', async () => {
    const { server, phone } = await pair(); tick(1000);
    run(phone, 'bw01-q'); await phone.sync.syncNow();
    const other = await device(server);
    other.app.importObject(backup); other.app.setGoal(13500); const mine = other.app.saveWorkout({ date: '2026-11-17', k: 'strength', min: 40, rpe: 5 }); await other.store.idle();
    await other.login(paolo);
    expect(other.sync.getStatus()).toMatchObject({ choice: true, first: false }); expect(server.pushes).toBe(2); // niente è stato inviato né sovrascritto
    expect(other.store.S.core!.goal.sec).toBe(13500);
    await other.sync.resolve('remote');
    expect(other.sync.getStatus()).toMatchObject({ choice: false, first: true, pending: 0 });
    expect(other.store.S.core!.goal.sec).toBe(14400); expect(other.app.session('bw01-q')!.st).toBe('done'); // piano e profilo dell'account
    expect(Object.keys(other.store.S.workouts).length).toBe(2); expect(server.get('u-paolo', 'workouts/' + mine.id)).toMatchObject({ k: 'strength', min: 40 }); // l'allenamento locale non si perde
  });

  it('"usa questo dispositivo": i dati locali sostituiscono quelli dell’account, gli allenamenti dell’account restano', async () => {
    const { server, phone } = await pair(); tick(1000);
    const w = run(phone, 'bw01-q'); await phone.sync.syncNow();
    const other = await device(server);
    other.app.importObject(backup); other.app.setGoal(13500); await other.store.idle();
    await other.login(paolo); expect(other.sync.getStatus().choice).toBe(true);
    await other.sync.resolve('local');
    expect(server.get('u-paolo', 'app/core')!.goal.sec).toBe(13500); expect(other.store.S.core!.goal.sec).toBe(13500);
    expect(other.store.S.workouts[w.id]).toMatchObject({ km: 6 }); expect(other.app.session('bw01-q')).toMatchObject({ st: 'done', wid: w.id }); // l'allenamento arrivato dall'account segna la sessione come fatta
    await phone.sync.syncNow(); expect(phone.store.S.core!.goal.sec).toBe(13500);
  });

  it('gli stessi dati importati su due dispositivi prima dell’accesso non richiedono una scelta', async () => {
    vi.setSystemTime(T0);
    const server = new Server(), a = await device(server), b = await device(server);
    a.app.importObject(backup); b.app.importObject(backup); await a.store.idle(); await b.store.idle();
    await a.login(paolo); await b.login(paolo);
    expect(b.sync.getStatus()).toMatchObject({ choice: false, first: true, pending: 0 });
    expect(server.rows.get('u-paolo')!.size).toBe(12); // la nota "dati ripristinati" è diversa sui due dispositivi: restano entrambe
  });

  it('un altro account sullo stesso dispositivo riparte dal primo collegamento', async () => {
    const { server, phone } = await pair();
    await phone.sync.signOut(); expect(phone.sync.getStatus().email).toBeNull();
    await phone.login({ id: 'u-altro', email: 'altro@example.com' });
    expect(server.rows.get('u-altro')!.size).toBe(11); expect(server.rows.get('u-paolo')!.size).toBe(11);
  });
});

describe('sincronizzazione tra telefono e computer', () => {
  it('un allenamento registrato sul telefono compare sul computer', async () => {
    const { phone, laptop } = await pair(); tick(60000);
    const w = run(phone, 'bw01-q', { hrAvg: 150 }); await phone.sync.syncNow();
    tick(1000); await laptop.sync.syncNow();
    expect(laptop.store.S.workouts[w.id]).toMatchObject({ km: 6, hrAvg: 150, eval: { rating: 'ottimo' } });
    expect(laptop.app.session('bw01-q')).toMatchObject({ st: 'done', wid: w.id });
    expect(laptop.app.liveWorkouts().length).toBe(1); expect(await laptop.db.outbox.count()).toBe(0);
  });

  it('uno registrato offline resta in coda e si sincronizza al ritorno della rete', async () => {
    const { server, phone, laptop } = await pair(); tick(60000);
    server.online = false;
    const w = run(phone, 'bw01-q'); await phone.sync.syncNow();
    expect(phone.sync.getStatus()).toMatchObject({ error: 'Failed to fetch', pending: 2 }); // l'allenamento e il piano con la sessione segnata come fatta
    expect(phone.store.S.workouts[w.id].eval!.rating).toBe('ottimo'); // offline l'app funziona comunque
    expect(server.get('u-paolo', 'workouts/' + w.id)).toBeUndefined();
    tick(3600000); server.online = true; await phone.sync.syncNow();
    expect(phone.sync.getStatus()).toMatchObject({ error: null, pending: 0 });
    expect(server.get('u-paolo', 'workouts/' + w.id)).toMatchObject({ km: 6 });
    await laptop.sync.syncNow(); expect(laptop.store.S.workouts[w.id]).toBeTruthy(); expect(laptop.app.session('bw01-q')!.st).toBe('done');
  });

  it('si scaricano solo i documenti cambiati dopo l’ultimo allineamento', async () => {
    const { server, phone, laptop } = await pair(); tick(60000);
    const w = run(phone, 'bw01-q'); await phone.sync.syncNow();
    server.fetched = []; tick(1000);
    const before = JSON.stringify(laptop.store.S.changes); await laptop.sync.syncNow();
    expect(server.fetched.sort()).toEqual(['app/plan', 'workouts/' + w.id]); // non il profilo né le modifiche già allineate
    expect(JSON.stringify(laptop.store.S.changes)).toBe(before);
    server.fetched = []; const n = server.pushes; tick(1000); await laptop.sync.syncNow(); await phone.sync.syncNow();
    expect(server.fetched).toEqual([]); expect(server.pushes).toBe(n); // niente di nuovo: nessun contenuto scaricato, nessuna scrittura a vuoto
  });

  it('una corsa registrata offline prima che l’altro dispositivo si allineasse viene vista lo stesso', async () => {
    const { server, phone, laptop } = await pair(); tick(60000);
    server.online = false; const w = run(phone, 'bw01-q'); await phone.store.idle(); // ore 8:01, telefono senza rete
    server.online = true; tick(1800000);
    laptop.app.saveCheckin({ date: '2026-11-17', fatigue: 2 }); await laptop.store.idle(); await laptop.sync.syncNow(); // ore 8:31, il computer scrive e si allinea
    server.online = true; tick(1800000); await phone.sync.syncNow(); // ore 9:01, il telefono torna in rete: la corsa ha ancora l'orario delle 8:01
    tick(1000); await laptop.sync.syncNow();
    expect(laptop.store.S.workouts[w.id]).toMatchObject({ km: 6 }); expect(laptop.app.session('bw01-q')!.st).toBe('done');
    const at = Date.parse(server.rows.get('u-paolo')!.get('workouts/' + w.id)!.updated_at);
    expect(at).toBeGreaterThanOrEqual(T0 + 60000); expect(at).toBeLessThan(T0 + 61000); // orario di scrittura (8:01), non di arrivo (9:01)
  });

  it('conflitto sullo stesso documento: vince la scrittura più recente, su entrambi i dispositivi', async () => {
    const { server, phone, laptop } = await pair(); tick(60000);
    server.online = false;
    phone.app.saveProfile({ name: 'Paolo', age: 22, hrMax: 190, weight: 70, notes: 'dal telefono' }); await phone.store.idle();
    tick(600000);
    laptop.app.saveProfile({ name: 'Paolo', age: 22, hrMax: 196, weight: 71, notes: 'dal computer, dopo' }); await laptop.store.idle();
    tick(600000); server.online = true;
    await laptop.sync.syncNow(); // arriva prima la più recente…
    await phone.sync.syncNow();  // …e la più vecchia, arrivando dopo, non la sovrascrive
    expect(phone.store.S.core!.profile.notes).toBe('dal computer, dopo'); expect(server.get('u-paolo', 'app/core')!.profile.hrMax).toBe(196);
    expect(await phone.db.outbox.count()).toBe(0);
    await laptop.sync.syncNow(); expect(laptop.store.S.core!.profile.notes).toBe('dal computer, dopo');
  });

  it('conflitto, ordine inverso: la più recente arriva per seconda e sostituisce quella sul server', async () => {
    const { server, phone, laptop } = await pair(); tick(60000);
    server.online = false;
    phone.app.saveProfile({ name: 'Paolo', age: 22, hrMax: 190, weight: 70, notes: 'prima' }); await phone.store.idle();
    tick(600000);
    laptop.app.saveProfile({ name: 'Paolo', age: 22, hrMax: 196, weight: 71, notes: 'dopo' }); await laptop.store.idle();
    tick(600000); server.online = true;
    await phone.sync.syncNow(); await laptop.sync.syncNow();
    expect(server.get('u-paolo', 'app/core')!.profile.notes).toBe('dopo');
    await phone.sync.syncNow(); expect(phone.store.S.core!.profile.notes).toBe('dopo');
  });

  it('documenti diversi modificati sui due dispositivi si uniscono senza perdite', async () => {
    const { phone, laptop } = await pair(); tick(60000);
    const w = run(phone, 'bw01-q'); const c = laptop.app.saveCheckin({ date: '2026-11-17', fatigue: 2 }); void c;
    await phone.sync.syncNow(); tick(1000); await laptop.sync.syncNow(); tick(1000); await phone.sync.syncNow();
    for (const d of [phone, laptop]) { expect(Object.keys(d.store.S.workouts)).toEqual([w.id]); expect(Object.keys(d.store.S.checkins).length).toBe(1); expect(d.app.session('bw01-q')!.st).toBe('done'); }
  });

  it('orologio del telefono indietro di due minuti: gli orari vengono corretti su quello del server e l’ordine vero resta', async () => {
    vi.setSystemTime(T0);
    const server = new Server(), phone = await device(server, -120000), laptop = await device(server);
    phone.app.importObject(backup); await phone.store.idle(); await phone.login(paolo); await laptop.login(paolo);
    tick(60000);
    phone.app.saveProfile({ name: 'Paolo', age: 22, hrMax: 190, weight: 70, notes: 'uno' }); await phone.store.idle(); await phone.sync.syncNow();
    expect(Math.abs(Date.parse(server.rows.get('u-paolo')!.get('app/core')!.updated_at) - Date.now())).toBeLessThan(10); // orario del server, non quello sbagliato del telefono
    tick(5000);
    phone.app.saveProfile({ name: 'Paolo', age: 22, hrMax: 190, weight: 70, notes: 'due' }); await phone.store.idle(); await phone.sync.syncNow();
    tick(1000); await laptop.sync.syncNow(); expect(laptop.store.S.core!.profile.notes).toBe('due');
    server.online = false;
    laptop.app.saveProfile({ name: 'Paolo', age: 22, hrMax: 190, weight: 70, notes: 'computer, prima' }); await laptop.store.idle();
    tick(30000);
    phone.app.saveProfile({ name: 'Paolo', age: 22, hrMax: 190, weight: 70, notes: 'telefono, dopo' }); await phone.store.idle();
    tick(1000); server.online = true; await laptop.sync.syncNow(); await phone.sync.syncNow(); tick(1000); await laptop.sync.syncNow();
    expect(server.get('u-paolo', 'app/core')!.profile.notes).toBe('telefono, dopo'); expect(laptop.store.S.core!.profile.notes).toBe('telefono, dopo');
  });

  it('eliminare un allenamento arriva all’altro dispositivo come "eliminato", non come cancellazione', async () => {
    const { server, phone, laptop } = await pair(); tick(60000);
    const w = run(phone, 'bw01-q'); await phone.sync.syncNow(); tick(1000); await laptop.sync.syncNow();
    tick(1000); laptop.app.deleteWorkout(w.id); await laptop.store.idle(); await laptop.sync.syncNow();
    tick(1000); await phone.sync.syncNow();
    expect(server.get('u-paolo', 'workouts/' + w.id)).toMatchObject({ deleted: true, km: 6 });
    expect(phone.store.S.workouts[w.id].deleted).toBe(true); expect(phone.app.session('bw01-q')!.st).toBe('planned'); expect(phone.app.deletedWorkouts().length).toBe(1);
    tick(1000); phone.app.restoreWorkout(w.id); await phone.store.idle(); await phone.sync.syncNow(); tick(1000); await laptop.sync.syncNow();
    expect(laptop.store.S.workouts[w.id].deleted).toBeUndefined(); expect(laptop.app.session('bw01-q')!.st).toBe('done');
  });

  it('le versioni del piano si sincronizzano; quelle oltre le 40 diventano righe vuote (data null) e spariscono dall’altro dispositivo', async () => {
    const { server, phone, laptop } = await pair(); tick(60000);
    phone.app.moveSession('bw02-e', '2026-11-27'); await phone.store.idle(); await phone.sync.syncNow(); tick(1000); await laptop.sync.syncNow();
    expect(Object.keys(laptop.store.S.versions)).toEqual(['v0002']); expect(laptop.app.session('bw02-e')!.d).toBe('2026-11-27');
    for (let i = 0; i < 41; i++) { tick(10); phone.app.moveSession('bw02-e', i % 2 ? '2026-11-27' : '2026-11-26'); }
    await phone.store.idle(); await phone.sync.syncNow(); tick(1000); await laptop.sync.syncNow();
    expect(server.rows.get('u-paolo')!.get('versions/v0002')!.data).toBeNull();
    expect(Object.keys(laptop.store.S.versions).length).toBe(40); expect(laptop.store.S.versions.v0002).toBeUndefined();
    expect((await laptop.db.docs.get(['versions', 'v0002']))!.data).toBeNull(); // su disco resta il segnaposto, così non viene riscaricato
    const again = new Store(laptop.db, null); await again.load(); expect(Object.keys(again.S.versions).length).toBe(40);
    expect(laptop.app.restoreVersion('v0010')).toBe(true); // una versione creata sul telefono si ripristina dal computer
  });

  it('una modifica fatta mentre l’invio è in corso non viene persa', async () => {
    const { server, phone } = await pair(); tick(60000);
    phone.app.saveProfile({ name: 'Paolo', age: 22, hrMax: 190, weight: 70, notes: 'uno' }); await phone.store.idle();
    const real = server.docs.bind(server); let once = true;
    server.docs = (u: string) => { const d = real(u); return Object.assign({}, d, { push: async (rows: RemoteRow[]) => { const r = await d.push(rows); if (once) { once = false; tick(10); phone.app.saveProfile({ name: 'Paolo', age: 22, hrMax: 190, weight: 70, notes: 'due, durante l’invio' }); await phone.store.idle(); } return r; } }); };
    await phone.sync.syncNow();
    server.docs = real;
    expect(server.get('u-paolo', 'app/core')!.profile.notes).toBe('due, durante l’invio'); expect(await phone.db.outbox.count()).toBe(0);
  });

  it('funziona anche se sul server un trigger riscrive updated_at (vince l’ultima scrittura arrivata)', async () => {
    vi.setSystemTime(T0);
    const server = new Server(); server.trigger = true;
    const phone = await device(server), laptop = await device(server);
    phone.app.importObject(backup); await phone.store.idle(); await phone.login(paolo); await laptop.login(paolo);
    tick(60000); const w = run(phone, 'bw01-q'); await phone.sync.syncNow(); tick(1000); await laptop.sync.syncNow();
    expect(laptop.store.S.workouts[w.id]).toBeTruthy(); expect(laptop.app.session('bw01-q')!.st).toBe('done');
    server.fetched = []; tick(1000); await phone.sync.syncNow(); await laptop.sync.syncNow(); expect(server.fetched).toEqual([]);
  });
});
