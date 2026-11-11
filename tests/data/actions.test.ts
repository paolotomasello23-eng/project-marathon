/* Azioni dell'app su IndexedDB (fake-indexeddb): backup, allenamenti, salti e recuperi, modifiche, versioni. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import backup from '../../reference/data/backup.json';
import * as P from '../../src/domain/plan';
import * as E from '../../src/domain/engine';
import type { Change, SOp } from '../../src/domain/types';
import { Actions, type Backup, isBackup } from '../../src/data/actions';
import { MMDb } from '../../src/data/db';
import { Store } from '../../src/data/store';

let clock = '2026-11-17';
let seq = 0;
const at = (day: string, time = '08:00:00') => { clock = day; vi.setSystemTime(new Date(day + 'T' + time + '+01:00')); };

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); at('2026-11-17'); });
afterAll(() => { vi.useRealTimers(); });

async function fresh(withBackup = true): Promise<{ app: Actions; store: Store; db: MMDb }> {
  const db = new MMDb('test-' + (++seq)), store = new Store(db), app = new Actions(store, () => clock);
  await store.load();
  if (withBackup) { app.importObject(backup); await store.idle(); }
  return { app, store, db };
}
const run = (app: Actions, sid: string, extra: object = {}) => { const s = app.session(sid)!; return app.saveWorkout({ date: s.d, k: 'run', sub: s.s, sid, km: s.km as number, sec: Math.round((s.km as number) * 375), rpe: 3, ...extra }); };

describe('backup: importazione ed esportazione', () => {
  it('importa reference/data/backup.json: piano dal 16 novembre 2026, 23 settimane, storico delle modifiche', async () => {
    at('2026-11-17');
    const { app, store } = await fresh();
    expect(isBackup(backup)).toBe(true);
    expect(app.ready()).toBe(true);
    const ss = store.S.plan!.sessions;
    expect(ss.length).toBe(161); expect(ss[0].d).toBe('2026-11-16'); expect(ss[ss.length - 1]).toMatchObject({ d: '2027-04-25', s: 'race' });
    expect(E.planMondays({ plan: store.S.plan! }).length).toBe(23);
    expect(store.S.core!.goal.sec).toBe(14400); expect(store.S.core!.paces.easy).toEqual([360, 390]); expect(store.S.core!.profile.name).toBe('Paolo');
    const titles = Object.values(store.S.changes).map(c => c.title);
    expect(titles).toContain('Inizio spostato a lunedì 16 novembre'); expect(titles).toContain('Nuova regola: le corse saltate si recuperano');
    expect(titles.filter(t => /^Dati ripristinati da un backup del 11 nov, 06:25$/.test(t)).length).toBe(1);
    expect(Object.keys(store.S.changes).length).toBe(9); // 8 del backup + la nota del ripristino
  });

  it('i dati importati restano su disco: un nuovo avvio li ritrova', async () => {
    const { store, db } = await fresh();
    const again = new Store(db); await again.load();
    expect(JSON.stringify(again.S.plan)).toBe(JSON.stringify(store.S.plan)); expect(JSON.stringify(again.S.core)).toBe(JSON.stringify(store.S.core));
    expect(Object.keys(again.S.changes).sort()).toEqual(Object.keys(store.S.changes).sort());
    expect(await db.outbox.count()).toBe(2 + 9); // core, plan e 9 modifiche in coda per la sincronizzazione
  });

  it('esporta nello stesso formato e il file esportato si reimporta identico', async () => {
    at('2026-11-17');
    const a = await fresh(); run(a.app, 'bw01-q'); a.app.saveCheckin({ date: '2026-11-17', fatigue: 2 });
    const out = a.app.exportObject();
    expect(Object.keys(out)).toEqual(['app', 'v', 'exportedAt', 'core', 'plan', 'workouts', 'checkins', 'changes']); expect(out.app).toBe('marathon-project-madrid'); expect(out.v).toBe(1);
    const file = JSON.parse(JSON.stringify(out)) as Backup;
    const b = await fresh(false); b.app.importObject(file); await b.store.idle();
    expect(b.store.S.plan).toEqual(file.plan); expect(b.store.S.workouts).toEqual(file.workouts); expect(b.store.S.checkins).toEqual(file.checkins);
    expect(b.store.S.core!.goal).toEqual(file.core.goal); expect(b.store.S.core!.paces).toEqual(file.core.paces);
  });

  it('rifiuta un file che non è un backup', async () => {
    const { app } = await fresh(false);
    expect(() => app.importObject({ app: 'altro', core: {}, plan: { sessions: [] } })).toThrow('Il file non è un backup di questa app.');
    expect(() => app.importObject({ app: 'marathon-project-madrid', core: {}, plan: {} })).toThrow();
    expect(app.ready()).toBe(false);
  });

  it('ripristinare un backup su dati esistenti salva prima una copia del piano e non cancella gli allenamenti registrati dopo', async () => {
    at('2026-11-17');
    const { app, store } = await fresh(); const w = run(app, 'bw01-q');
    app.importObject(backup); await store.idle();
    expect(store.S.workouts[w.id]).toBeTruthy();
    expect(store.S.core!.versions!.map(v => v.label)).toContain('Prima del ripristino da backup');
    expect(Object.values(store.S.versions).some(v => v.label === 'Prima del ripristino da backup' && v.sessions.find(s => s.id === 'bw01-q')!.st === 'done')).toBe(true);
  });

  it('CSV degli allenamenti', async () => {
    at('2026-11-17');
    const { app } = await fresh(); run(app, 'bw01-q', { hrAvg: 150, notes: 'giro; con "amici"' });
    const lines = app.csv().split('\n');
    expect(lines[0]).toBe('﻿data;attivita;tipo;km;tempo;ritmo_min_km;fc_media;fc_max;dislivello_pos;dislivello_neg;rpe;sensazioni;fatica;dolore;zona_dolore;sonno;temperatura;acqua_ml;gel;carboidrati_g;carico;valutazione;note');
    expect(lines[1]).toBe('2026-11-17;Corsa;Corsa facile;6,00;37:30;6:15;150;;;;3;;;;;;;;;;113;ottimo;"giro; con ""amici"""');
  });
});

describe('allenamenti', () => {
  it('registrare una corsa la analizza subito e segna la sessione come fatta', async () => {
    at('2026-11-17');
    const { app, store } = await fresh(), w = run(app, 'bw01-q', { hrAvg: 150 });
    expect(w.id).toMatch(/^w/); expect(w.eval!.rating).toBe('ottimo'); expect(w.eval!.analysis[0]).toBe('6 km · 37:30 · 6:15/km');
    expect(w.eval!.impact).toEqual(['Nessuna modifica.']); expect(w.eval!.cids).toEqual([]);
    expect(app.session('bw01-q')).toMatchObject({ st: 'done', wid: w.id });
    await store.idle();
    const again = new Store(store.db); await again.load();
    expect(again.S.workouts[w.id].eval!.rating).toBe('ottimo'); expect(again.S.plan!.sessions.find(s => s.id === 'bw01-q')!.st).toBe('done');
  });

  it('correggere un risultato conserva la correzione con valore precedente e nuovo', async () => {
    at('2026-11-17');
    const { app } = await fresh(), w = run(app, 'bw01-q'), id = w.id, created = w.at;
    const e = app.saveWorkout({ date: '2026-11-17', k: 'run', sub: 'easy', sid: 'bw01-q', km: 6.5, sec: 2250, rpe: 4 }, id);
    expect(e.id).toBe(id); expect(e.at).toBe(created); expect(e.edits!.length).toBe(1);
    expect(e.edits![0].diff).toEqual({ km: [6, 6.5], rpe: [3, 4] });
    expect(Object.keys(app.S.workouts).length).toBe(1);
  });

  it('spostare un risultato su un’altra sessione libera quella precedente', async () => {
    at('2026-11-19');
    const { app } = await fresh(), w = run(app, 'bw01-q');
    app.saveWorkout({ date: '2026-11-19', k: 'run', sub: 'easy', sid: 'bw01-e', km: 6, sec: 2250, rpe: 3 }, w.id);
    expect(app.session('bw01-q')!.st).toBe('planned'); expect(app.session('bw01-q')!.wid).toBeUndefined(); expect(app.session('bw01-e')).toMatchObject({ st: 'done', wid: w.id });
  });

  it('eliminare un allenamento lo marca come eliminato e resta ripristinabile', async () => {
    at('2026-11-17');
    const { app, store } = await fresh(), w = run(app, 'bw01-q');
    app.deleteWorkout(w.id);
    expect(store.S.workouts[w.id].deleted).toBe(true); expect(store.S.workouts[w.id].km).toBe(6); expect(app.liveWorkouts().length).toBe(0); expect(app.deletedWorkouts().length).toBe(1);
    expect(app.session('bw01-q')!.st).toBe('planned');
    await store.idle(); expect((await store.db.docs.get(['workouts', w.id]))!.data).toMatchObject({ deleted: true, km: 6 }); // il documento resta, non viene cancellato
    app.restoreWorkout(w.id);
    expect(store.S.workouts[w.id].deleted).toBeUndefined(); expect(app.session('bw01-q')).toMatchObject({ st: 'done', wid: w.id });
  });

  it('un allenamento con dolore forte riduce subito il carico e lo scrive nell’analisi', async () => {
    at('2026-11-17');
    const { app } = await fresh(), w = run(app, 'bw01-q', { pain: { lvl: 3, area: 'tibia' } });
    expect(w.eval!.rating).toBe('attenzione'); expect(w.eval!.impact).toEqual(['Applicata: Carico ridotto per dolore']);
    const c = app.S.changes[w.eval!.cids![0]];
    expect(c).toMatchObject({ kind: 'auto', status: 'applied' }); expect(app.session('bw01-e')).toMatchObject({ k: 'rest', title: 'Riposo (dolore segnalato)', mod: 'coach' });
    app.applyChange(c, 'undo');
    expect(app.session('bw01-e')).toMatchObject({ k: 'run', s: 'easy', km: 6 }); expect(app.session('bw01-e')!.mod).toBeUndefined(); expect(c.status).toBe('undone');
  });

  it('segnalazione "Come stai?": salva e fa passare il coach', async () => {
    at('2026-11-18');
    const { app, store } = await fresh(), props = app.saveCheckin({ date: '2026-11-18', pain: { lvl: 2, area: 'ginocchio' } });
    expect(props.map(c => [c.kind, c.status, c.title])).toEqual([['proposal', 'pending', 'Alleggerire le prossime corse per il dolore segnalato']]);
    expect(app.pendingChanges().length).toBe(1); expect(Object.keys(store.S.checkins).length).toBe(1);
    app.rejectChange(props[0].id); expect(app.pendingChanges().length).toBe(0); expect(store.S.changes[props[0].id].status).toBe('rejected');
  });
});

describe('saltare e recuperare', () => {
  it('una corsa saltata finisce nel primo giorno adatto; annullando torna saltata nel giorno originale', async () => {
    at('2026-11-17');
    const { app, store } = await fresh(), v0 = store.S.plan!.v;
    const r = app.skipSession('bw01-e', 'Impegni', null);
    expect(r.day).toBe('2026-11-20'); expect(r.blocked).toBeFalsy(); // giovedì 19 → venerdì 20
    expect(app.session('bw01-e')).toMatchObject({ d: '2026-11-20', st: 'planned', rec: { from: '2026-11-19', n: 1, at: '2026-11-17' } });
    expect(r.change).toMatchObject({ kind: 'auto', status: 'applied', title: 'Recupero: Corsa facile 6 km → ven 20 nov' });
    expect(store.S.plan!.v).toBe(v0 + 1); expect(store.S.core!.versions!.slice(-1)[0].label).toBe('Prima di: Recupero: Corsa facile 6 km → ven 20 nov');
    expect(app.sessionsOn('2026-11-20').map(s => s.id)).toContain('bw01-e');
    app.applyChange(r.change!, 'undo');
    expect(app.session('bw01-e')).toMatchObject({ d: '2026-11-19', st: 'skipped', why: 'Impegni' }); expect(app.session('bw01-e')!.rec).toBeUndefined();
    expect(store.S.core!.versions!.slice(-1)[0].label).toBe('Prima di annullare: Recupero: Corsa facile 6 km → ven 20 nov');
    app.setPlanned('bw01-e'); expect(app.session('bw01-e')!.st).toBe('planned'); expect(app.session('bw01-e')!.why).toBeUndefined();
  });

  it('si può scegliere un altro giorno tra quelli adatti, oppure non recuperare', async () => {
    at('2026-11-17');
    const a = await fresh(); expect(a.app.skipSession('bw01-e', 'Meteo', '2026-11-21').day).toBe('2026-11-21');
    const b = await fresh(), r = b.app.skipSession('bw01-e', 'Meteo', 'none');
    expect(r.change).toBeNull(); expect(r.blocked).toBe('Non recuperata.'); expect(b.app.session('bw01-e')).toMatchObject({ d: '2026-11-19', st: 'skipped', why: 'Meteo' });
  });

  it('con dolore o malattia non si recupera; forza e nuoto si saltano e basta', async () => {
    at('2026-11-17');
    const { app } = await fresh();
    expect(app.skipSession('bw01-e', 'Dolore o fastidio', null)).toMatchObject({ change: null, blocked: 'Con dolore o malattia non si recupera.' });
    expect(app.skipSession('bw01-str', 'Impegni', null)).toMatchObject({ change: null, blocked: '' }); expect(app.session('bw01-str')!.st).toBe('skipped');
  });

  it('nessun giorno adatto: la corsa viene assorbita', async () => {
    at('2026-11-26');
    const { app } = await fresh();
    expect(app.skipSession('bw01-long', 'Impegni', null)).toMatchObject({ change: null, blocked: 'Nessun giorno adatto: viene assorbita.' });
  });
});

describe('modifiche e versioni del piano', () => {
  it('rinviare, modificare, aggiungere ed eliminare una sessione sono modifiche tue, annullabili', async () => {
    at('2026-11-17');
    const { app, store } = await fresh(), snap = JSON.stringify(store.S.plan!.sessions);
    const mv = app.moveSession('bw01-e', '2026-11-20')!;
    expect(mv).toMatchObject({ kind: 'manual', status: 'applied', cat: 'plan', title: 'Sessione rinviata: Corsa facile', why: ['Modifica inserita da te'] });
    expect(app.session('bw01-e')).toMatchObject({ d: '2026-11-20', mod: 'user', orig: { d: '2026-11-19' } });
    const ed = app.editSession('bw02-q', { km: 6, sub: 'easy', note: 'gambe stanche' })!;
    expect((ed.ops[0] as SOp)).toMatchObject({ from: { km: 7, s: 'hills', x: { reps: 6, sec: 30 }, title: null, note: null }, to: { km: 6, s: 'easy', x: null, title: null, note: 'gambe stanche' }, a: 'Salite 7 km', b: 'Corsa facile 6 km' });
    const ad = app.addSession({ d: '2026-11-21', k: 'run', sub: 'easy', km: 4, title: 'Giro con amici' });
    const added = store.S.plan!.sessions.find(s => s.user)!;
    expect(added).toMatchObject({ d: '2026-11-21', wk: 1, ph: 'base', slot: 'user', k: 'run', s: 'easy', km: 4, title: 'Giro con amici', st: 'planned' });
    const dl = app.deleteSession(added.id)!; expect(app.session(added.id)).toBeNull();
    expect(app.editSession('bw02-e', { km: 6, sub: 'easy', note: '' })).toBeNull(); // nessun cambiamento: nessuna modifica registrata
    [dl, ad, ed, mv].forEach(c => app.applyChange(c, 'undo'));
    expect(JSON.stringify(store.S.plan!.sessions)).toBe(snap);
  });

  it('prima di ogni modifica al calendario si salva una copia del piano; si conservano le ultime 40', async () => {
    at('2026-11-17');
    const { app, store } = await fresh();
    expect(store.S.core!.versions!.length).toBe(1); // la versione 1 elencata nel backup (senza sessioni)
    for (let i = 0; i < 45; i++) app.moveSession('bw02-e', i % 2 ? '2026-11-26' : '2026-11-27');
    await store.idle();
    expect(store.S.core!.versions!.length).toBe(40); expect(Object.keys(store.S.versions).length).toBe(40);
    expect(await store.db.docs.where('coll').equals('versions').count()).toBe(40);
    expect(store.S.core!.versions![39]).toMatchObject({ n: 46, label: 'Prima di: Sessione rinviata: Corsa facile' }); expect(store.S.plan!.v).toBe(47);
    const purged = await store.db.outbox.where('path').startsWith('versions/').filter(o => o.data === null).count();
    expect(purged).toBe(6); // la versione 1 del backup e le 5 più vecchie create qui: eliminate anche dal server alla prossima sincronizzazione
    // un cambio di ritmi non tocca il calendario: nessuna copia in più
    app.setPaces({ easy: [355, 385] }); expect(store.S.core!.versions!.length).toBe(40); expect(store.S.plan!.v).toBe(47);
  });

  it('ripristinare una versione: le sessioni già fatte restano fatte; se la versione non è su questo dispositivo lo dice', async () => {
    at('2026-11-17');
    const { app, store } = await fresh();
    expect(app.restoreVersion('v0001')).toBe(false); // elencata nel backup, ma il formato di esportazione non ne contiene le sessioni
    app.moveSession('bw01-e', '2026-11-20'); const vid = store.S.core!.versions!.slice(-1)[0].id;
    const w = run(app, 'bw01-q');
    expect(app.restoreVersion(vid)).toBe(true);
    expect(app.session('bw01-e')!.d).toBe('2026-11-19'); expect(app.session('bw01-q')).toMatchObject({ st: 'done', wid: w.id });
    expect(Object.values(store.S.changes).some(c => c.title === 'Ripristinata la versione 2 del piano' && c.kind === 'event')).toBe(true);
  });

  it('obiettivo e ritmi: valore precedente e nuovo nello storico, annullabili', async () => {
    at('2026-11-17');
    const { app, store } = await fresh();
    const g = app.setGoal(13500)!;
    expect(g).toMatchObject({ title: 'Obiettivo portato a 3:45:00', cat: 'goal', kind: 'manual' }); expect(g.ops).toEqual([{ t: 'goal', from: 14400, to: 13500 }, { t: 'pace', z: 'mp', from: [335, 340], to: [315, 320] }]);
    expect(store.S.core!.goal.sec).toBe(13500); expect(store.S.core!.goal.history!.slice(-1)[0]).toMatchObject({ sec: 13500, from: 14400, by: 'utente' }); expect(store.S.core!.paces.mp).toEqual([315, 320]);
    expect(app.setGoal(13500)).toBeNull();
    const p = app.setPaces({ easy: [365, 395], long: [365, 395] })!; expect(p.ops).toEqual([{ t: 'pace', z: 'easy', from: [360, 390], to: [365, 395] }]);
    app.applyChange(p, 'undo'); app.applyChange(g, 'undo');
    expect(store.S.core!.goal.sec).toBe(14400); expect(store.S.core!.paces).toEqual(backup.core.paces);
  });

  it('nuovi giorni della settimana: sposta solo le sessioni future ancora pianificate', async () => {
    at('2026-11-19');
    const { app, store } = await fresh(); run(app, 'bw01-e');
    const n = app.saveDays({ q: 1, e: 3, long: 5, x: 4, str: 2 }); // lungo al sabato
    expect(n).toBe(22 + 21 + 21); // 22 lunghi, più riposo e mobilità delle 21 settimane non ancora iniziate; la settimana di gara non si tocca
    expect(app.session('bw01-long')!.d).toBe('2026-11-21'); expect(app.session('bw23-long')!.d).toBe('2027-04-25'); expect(app.session('bw01-e')!.d).toBe('2026-11-19');
    expect(store.S.core!.profile.days).toEqual({ q: 1, e: 3, long: 5, x: 4, str: 2, sat: 0, mon: 6 }); // venerdì è occupato dalla quarta corsa: il riposo va al primo giorno libero
    expect(app.saveDays({ q: 1, e: 3, long: 5, x: 4, str: 2 })).toBe(0);
  });

  it('il coach passa una volta al giorno: stima nello storico ogni settimana, proposte scadute archiviate', async () => {
    at('2026-11-18');
    const { app, store } = await fresh();
    const p = app.saveCheckin({ date: '2026-11-18', pain: { lvl: 2, area: 'ginocchio' } })[0];
    expect(store.S.core!.predHistory!.map(x => x.d)).toEqual(['2026-11-10', '2026-11-11', '2026-11-18']); // l'ultima voce del backup è dell'11: passati 7 giorni
    at('2026-11-19'); app.coachPass(); expect(store.S.core!.predHistory!.length).toBe(3);
    at('2026-11-25'); app.coachPass();
    expect(store.S.core!.predHistory!.map(x => x.d)).toEqual(['2026-11-10', '2026-11-11', '2026-11-18', '2026-11-25']);
    expect(store.S.changes[p.id].status).toBe('expired'); // riguardava il 19 novembre, ormai passato
  });

  it('una proposta del coach non tocca le sessioni già fatte', async () => {
    at('2026-11-18');
    const { app } = await fresh(), p = app.saveCheckin({ date: '2026-11-18', pain: { lvl: 2, area: 'ginocchio' } })[0] as Change;
    at('2026-11-19'); const w = run(app, 'bw01-e');
    app.applyChange(p, 'apply');
    expect(app.session('bw01-e')).toMatchObject({ km: 6, st: 'done', wid: w.id }); expect(app.session('bw01-e')!.mod).toBeUndefined();
  });

  it('creare un piano da zero: profilo, ritmi dal 10 km dichiarato, piano fino alla gara', async () => {
    at('2026-11-17');
    const { app, store } = await fresh(false);
    app.createPlan({ name: 'Paolo', age: 22, raceName: 'Maratona di Madrid', raceDate: '2027-04-25', refDist: 10, refSec: 2970, goalSec: 14400, baseKm: 15 });
    expect(app.ready()).toBe(true); expect(store.S.core!.paces).toEqual(P.pacesFromRef(2970, 14400)); expect(store.S.core!.ref).toMatchObject({ dist: 10, sec: 2970, source: 'dichiarato', eq10: 2970 });
    expect(store.S.plan!.sessions[0].d).toBe('2026-11-16'); expect(store.S.core!.predHistory!.length).toBe(1);
    expect(app.nextSession('2026-11-17')).toMatchObject({ d: '2026-11-17', k: 'run' });
  });
});

describe('registro sincrono delle scritture', () => {
  class Mem { m = new Map<string, string>(); get length() { return this.m.size; } key(i: number) { return [...this.m.keys()][i] ?? null; } getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

  it('ogni scrittura è nel registro prima che IndexedDB risponda e ne esce quando è confermata', async () => {
    at('2026-11-17');
    const db = new MMDb('test-' + (++seq)), j = new Mem(), store = new Store(db, j), app = new Actions(store, () => clock);
    await store.load(); app.importObject(backup);
    expect(j.length).toBe(11); expect(JSON.parse(j.getItem(db.name + '.j:app/plan')!).data.sessions.length).toBe(161); // subito, in modo sincrono
    expect(await db.docs.count()).toBe(0);
    await store.idle();
    expect(await db.docs.count()).toBe(11); expect(j.length).toBe(0);
  });

  it('se la pagina si chiude prima della conferma, al prossimo avvio le scritture vengono riapplicate e rimesse in coda', async () => {
    at('2026-11-17');
    const db = new MMDb('test-' + (++seq)), j = new Mem(), a = new Store(db, j), app = new Actions(a, () => clock);
    await a.load(); app.importObject(backup); await a.idle();
    const w = app.saveWorkout({ date: '2026-11-17', k: 'run', sub: 'easy', sid: 'bw01-q', km: 6, sec: 2250, rpe: 3 });
    const left = new Mem(); j.m.forEach((v, k) => left.m.set(k, v)); // ciò che resta nel registro se la pagina muore adesso
    expect([...left.m.keys()].sort()).toEqual([db.name + '.j:app/plan', db.name + '.j:workouts/' + w.id]);
    await a.idle(); await db.docs.delete(['workouts', w.id]); await db.outbox.clear(); // simula la transazione mai arrivata in fondo
    const b = new Store(db, left); await b.load();
    expect(b.S.workouts[w.id]).toMatchObject({ km: 6, sid: 'bw01-q' }); expect(b.S.plan!.sessions.find(s => s.id === 'bw01-q')!.st).toBe('done');
    expect((await db.outbox.toArray()).map(o => o.path).sort()).toEqual(['app/plan', 'workouts/' + w.id]);
    expect(left.length).toBe(0);
  });

  it('una voce del registro più vecchia di ciò che è su disco non sovrascrive', async () => {
    const db = new MMDb('test-' + (++seq)), j = new Mem();
    await db.docs.put({ coll: 'checkins', id: 'c1', data: { id: 'c1', date: '2026-11-17', fatigue: 5 }, at: 2000 });
    j.setItem(db.name + '.j:checkins/c1', JSON.stringify({ at: 1000, data: { id: 'c1', date: '2026-11-17', fatigue: 1 } }));
    const s = new Store(db, j); await s.load();
    expect(s.S.checkins.c1.fatigue).toBe(5); expect(await db.outbox.count()).toBe(0);
  });
});
