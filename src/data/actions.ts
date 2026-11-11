/* Azioni dell'app: registrare, saltare, accettare e annullare modifiche, versioni del piano, backup.
   Portate da reference/src/app1.js e dai moduli di app4.js; la logica di allenamento resta in src/domain. */
import * as P from '../domain/plan';
import * as E from '../domain/engine';
import type { Change, ChangeCat, Checkin, Core, DayMap, Iso, Op, PaceRange, Plan, PlanVersion, Session, SessionPatch, Workout, Zone } from '../domain/types';
import { nowISO, today as realToday, uid } from '../lib/clock';
import { clone, dfull, dstamp } from '../lib/format';
import type { AppState, Store } from './store';

export const BACKUP_APP = 'marathon-project-madrid';
export interface Backup {
  app: string; v: number; exportedAt?: string;
  core: Core; plan: Plan;
  workouts?: Record<string, Workout>; checkins?: Record<string, Checkin>; changes?: Record<string, Change>;
}
export interface NewPlan { name?: string; age?: number | null; raceName?: string; raceDate: Iso; refDist: number; refSec: number; goalSec: number; baseKm?: number }
export interface NewSession { d: Iso; k: 'run' | 'strength' | 'swim' | 'mobility'; sub?: string; km?: number | null; title?: string; note?: string }
export interface SkipResult { change?: Change | null; blocked?: string | null; day?: Iso | null }
/** Versione del piano con la data di gara di quel momento (serve a ripristinare dopo un cambio di data). */
type Version = PlanVersion & { race?: Iso };

const MAX_VERSIONS = 40;
const WORKOUT_FIELDS = ['date', 'k', 'sub', 'km', 'extraKm', 'sec', 'min', 'hrAvg', 'hrMax', 'up', 'down', 'rpe', 'feel', 'fatigue', 'sleep', 'sleepH', 'temp', 'weather', 'waterMl', 'gels', 'carbsG', 'notes', 'sid'] as const;

function vals<T>(o: Record<string, T> | null | undefined): T[] { return Object.keys(o || {}).map(k => (o as Record<string, T>)[k]); }
export function touchesPlan(c: Pick<Change, 'ops'>): boolean { return c.ops.some(o => o.t === 's' || o.t === 'add' || o.t === 'del'); }
export function isBackup(o: unknown): o is Backup {
  const b = o as Backup | null;
  return !!b && b.app === BACKUP_APP && !!b.core && !!b.plan && Array.isArray(b.plan.sessions);
}

export class Actions {
  constructor(readonly store: Store, readonly today: () => Iso = realToday) { }

  get S(): AppState { return this.store.S; }
  private get core(): Core { return this.S.core as Core; }
  private get plan(): Plan { return this.S.plan as Plan; }
  private put(path: string, data: unknown | null): void { this.store.put(path, data); }

  ready(): boolean { return this.store.ready(); }
  st() { return this.store.st(); }
  session(id: string | null | undefined): Session | null { return this.ready() && id ? E.sessionById({ plan: this.plan }, id) : null; }
  sortPlan(): void { this.plan.sessions.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0); }
  liveWorkouts(): Workout[] { return vals(this.S.workouts).filter(w => !w.deleted).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : ((a.at || '') < (b.at || '') ? 1 : -1)); }
  deletedWorkouts(): Workout[] { return vals(this.S.workouts).filter(w => w.deleted); }
  pendingChanges(): Change[] { return vals(this.S.changes).filter(c => c.status === 'pending').sort((a, b) => a.at < b.at ? 1 : -1); }

  // ---------- versioni del piano ----------
  /** Salva una copia del piano prima di una modifica al calendario. Si conservano le ultime 40. */
  snapshotVersion(label: string): string {
    const n = this.plan.v || 1, id = 'v' + String(n).padStart(4, '0');
    const v: Version = { id, n, at: nowISO(), label, sessions: clone(this.plan.sessions), race: this.core.race.date };
    this.put('versions/' + id, v);
    this.core.versions = (this.core.versions || []).concat([{ id, n, at: v.at, label }]);
    while (this.core.versions.length > MAX_VERSIONS) { const old = this.core.versions.shift()!; this.put('versions/' + old.id, null); }
    this.plan.v = n + 1;
    return id;
  }

  /** Ripristina una versione: le sessioni già completate o saltate restano tali. false = versione non presente. */
  restoreVersion(id: string): boolean {
    const v = this.S.versions[id] as Version | undefined;
    if (!v) return false;
    this.snapshotVersion('Prima del ripristino della versione ' + v.n);
    const cur: Record<string, Session> = {}; this.plan.sessions.forEach(s => { cur[s.id] = s; });
    const out = v.sessions.map(s => { const c = cur[s.id], r = clone(s); if (c && (c.st === 'done' || c.st === 'skipped')) { r.st = c.st; if (c.wid) r.wid = c.wid; if (c.stAt) r.stAt = c.stAt; if (c.why) r.why = c.why; } return r; });
    this.plan.sessions.forEach(s => { if (s.st === 'done' && !out.some(x => x.id === s.id)) out.push(s); });
    this.plan.sessions = out; this.sortPlan();
    if (v.race && v.race !== this.core.race.date) this.core.race.date = v.race;
    this.put('app/plan', this.plan); this.put('app/core', this.core);
    const c = E.mk('vrestore-' + uid(''), this.today(), { kind: 'event', status: 'info', cat: 'plan', title: 'Ripristinata la versione ' + v.n + ' del piano', why: [v.label || ''], impact: 'Le sessioni già completate o saltate sono rimaste tali.' });
    this.put('changes/' + c.id, c);
    return true;
  }

  // ---------- coach: proposte e storico delle stime ----------
  applyChange(c: Change, dir: 'apply' | 'undo'): void {
    if (touchesPlan(c)) this.snapshotVersion((dir === 'undo' ? 'Prima di annullare: ' : 'Prima di: ') + c.title);
    const t = this.today();
    let race = false;
    c.ops.forEach(op => {
      if (op.t === 'add') { if (dir === 'undo') this.plan.sessions = this.plan.sessions.filter(s => s.id !== op.s.id); else if (!this.session(op.s.id)) this.plan.sessions.push(clone(op.s)); }
      else if (op.t === 'del') { if (dir === 'undo') { if (!this.session(op.s.id)) this.plan.sessions.push(clone(op.s)); } else this.plan.sessions = this.plan.sessions.filter(s => s.id !== op.s.id); }
      else if (op.t === 'race') { this.core.race.date = dir === 'undo' ? op.from : op.to; race = true; }
    });
    const rest: Op[] = c.ops.filter(o => {
      if (o.t === 'add' || o.t === 'del' || o.t === 'race') return false;
      if (o.t === 's' && !o.force && dir !== 'undo' && c.kind !== 'manual') { const s = this.session(o.id); if (s && s.st !== 'planned') return false; }
      return true;
    });
    const touched = E.applyOps({ core: this.core, plan: this.plan }, { id: c.id, kind: c.kind, ops: rest }, dir, t);
    this.sortPlan();
    c.status = dir === 'undo' ? 'undone' : 'applied'; c.decidedAt = nowISO();
    this.put('changes/' + c.id, c);
    if (touchesPlan(c)) { this.put('app/plan', this.plan); this.put('app/core', this.core); } else if (touched.core || race) this.put('app/core', this.core);
  }

  rejectChange(id: string): void {
    const c = this.S.changes[id]; if (!c) return;
    c.status = 'rejected'; c.decidedAt = nowISO(); this.put('changes/' + c.id, c);
  }

  coachPass(): Change[] {
    if (!this.ready()) return [];
    const t = this.today();
    vals(this.S.changes).forEach(c => {
      if (c.status !== 'pending' || !c.ops.length) return;
      const dead = c.ops.every(op => { if (op.t !== 's') return false; const s = this.session(op.id); return !s || s.st !== 'planned' || s.d < t; });
      if (dead) { c.status = 'expired'; c.decidedAt = nowISO(); this.put('changes/' + c.id, c); }
    });
    const props = E.propose(this.st(), t);
    props.forEach(c => {
      this.S.changes[c.id] = c;
      if (c.kind === 'auto') this.applyChange(c, 'apply'); else this.put('changes/' + c.id, c);
    });
    // storico delle stime: una voce a settimana o dopo un cambio di riferimento
    const ph = this.core.predHistory || [], last = ph[ph.length - 1];
    if (!last || P.diffDays(last.d, t) >= 7 || last.goal !== this.core.goal.sec || last.eq !== Math.round(E.refEq10(this.core))) {
      const pr = E.predict(this.st(), t);
      this.core.predHistory = ph.filter(x => x.d !== t).concat([{ d: t, low: Math.round(pr.low), plan: Math.round(pr.plan), high: Math.round(pr.high), goal: this.core.goal.sec, eq: Math.round(pr.eq10) }]);
      this.put('app/core', this.core);
    }
    return props;
  }

  // ---------- allenamenti ----------
  saveWorkout(input: Omit<Workout, 'id'> & { id?: string }, prevId?: string | null): Workout {
    const w = input as Workout, old = prevId ? this.S.workouts[prevId] : null;
    let dirty = false;
    if (old) {
      const diff: Record<string, [unknown, unknown]> = {}, a = old as unknown as Record<string, unknown>, b = w as unknown as Record<string, unknown>;
      WORKOUT_FIELDS.forEach(f => { if (JSON.stringify(a[f] == null ? null : a[f]) !== JSON.stringify(b[f] == null ? null : b[f])) diff[f] = [a[f] == null ? null : a[f], b[f] == null ? null : b[f]]; });
      if (JSON.stringify(old.pain || null) !== JSON.stringify(w.pain || null)) diff.pain = [old.pain || null, w.pain || null];
      w.id = old.id; w.at = old.at; w.edits = (old.edits || []).concat([{ at: nowISO(), diff }]);
      if (old.sid && old.sid !== w.sid) { const os = this.session(old.sid); if (os && os.wid === old.id) { os.st = 'planned'; delete os.wid; dirty = true; } }
    } else { w.id = uid('w'); w.at = nowISO(); }
    this.S.workouts[w.id] = w;
    const s = w.sid ? this.session(w.sid) : null;
    w.eval = E.evaluate(w, s, this.st(), this.today());
    if (s && (s.st !== 'done' || s.wid !== w.id)) { s.st = 'done'; s.wid = w.id; s.stAt = nowISO(); dirty = true; }
    const props = this.coachPass();
    w.eval.impact = props.length ? props.map(c => (c.status === 'applied' ? 'Applicata: ' : 'Proposta: ') + c.title) : ['Nessuna modifica.'];
    w.eval.cids = props.map(c => c.id);
    this.put('workouts/' + w.id, w);
    if (dirty) this.put('app/plan', this.plan);
    return w;
  }

  /** Eliminare un allenamento lo marca come eliminato: resta nello storico e si può ripristinare. */
  deleteWorkout(id: string): void {
    const w = this.S.workouts[id]; if (!w) return;
    w.deleted = true; w.deletedAt = nowISO();
    const s = w.sid ? this.session(w.sid) : null;
    if (s && s.wid === id) { s.st = 'planned'; delete s.wid; this.put('app/plan', this.plan); }
    this.put('workouts/' + id, w);
  }
  restoreWorkout(id: string): void {
    const w = this.S.workouts[id]; if (!w) return;
    delete w.deleted; delete w.deletedAt;
    const s = w.sid ? this.session(w.sid) : null;
    if (s && s.st === 'planned') { s.st = 'done'; s.wid = id; this.put('app/plan', this.plan); }
    this.put('workouts/' + id, w);
  }

  /** Salta una sessione e, se è una corsa e nulla lo sconsiglia, la recupera spostandola nel primo giorno adatto. */
  skipSession(id: string, why?: string | null, day?: Iso | 'none' | null): SkipResult {
    const s = this.session(id); if (!s) return {};
    s.st = 'skipped'; s.stAt = nowISO(); s.why = why || 'Non indicato';
    const t = this.today();
    let c: Change | null = null, blocked: string | null = s.k === 'run' ? (day === 'none' ? 'Non recuperata.' : E.recoveryBlocked(this.st(), s, t, why)) : '';
    if (s.k === 'run' && !blocked) {
      const opts = E.recoveryOptions(this.st(), s, t), d = day && opts.indexOf(day) >= 0 ? day : opts[0];
      if (d) { c = E.recoveryChange(this.st(), s, t, d, why); this.S.changes[c.id] = c; this.applyChange(c, 'apply'); }
      else blocked = 'Nessun giorno adatto: viene assorbita.';
    }
    if (!c) this.put('app/plan', this.plan);
    this.coachPass();
    return { change: c, blocked, day: c ? c.day : null };
  }
  setPlanned(id: string): void {
    const s = this.session(id); if (!s) return;
    s.st = 'planned'; delete s.why; s.stAt = nowISO();
    this.put('app/plan', this.plan);
  }

  manualChange(title: string, ops: Op[], cat?: ChangeCat): Change {
    const c = E.mk('manual-' + uid(''), this.today(), { kind: 'manual', status: 'pending', cat: cat || 'session', title, ops, why: ['Modifica inserita da te'], impact: '' });
    this.S.changes[c.id] = c; this.applyChange(c, 'apply'); return c;
  }

  saveCheckin(input: Omit<Checkin, 'id'>): Change[] {
    const c = input as Checkin;
    c.id = uid('c'); c.at = nowISO();
    this.put('checkins/' + c.id, c);
    return this.coachPass();
  }

  // ---------- sessioni: sposta, modifica, aggiungi, elimina ----------
  moveSession(id: string, d: Iso): Change | null {
    const s = this.session(id); if (!s || !d || d === s.d) return null;
    return this.manualChange('Sessione rinviata: ' + P.title(s), [E.sop(s, { d })], 'plan');
  }
  editSession(id: string, e: { km?: number | null; sub?: string; note: string }): Change | null {
    const s = this.session(id); if (!s) return null;
    const patch: SessionPatch = {};
    if (s.k === 'run') { if (e.km != null && e.km !== s.km) patch.km = e.km; if (e.sub && e.sub !== s.s) { patch.s = e.sub; patch.x = null; patch.title = null; } }
    if ((s.note || '') !== e.note) patch.note = e.note || null;
    if (!Object.keys(patch).length) return null;
    return this.manualChange('Sessione modificata: ' + P.title(s) + ' del ' + E.dshort(s.d), [E.sop(s, patch)], 'plan');
  }
  addSession(o: NewSession): Change {
    const ref = this.plan.sessions.filter(x => P.mondayOf(x.d) === P.mondayOf(o.d) && x.wk)[0];
    const s: Session = { id: uid('u'), d: o.d, wk: ref ? ref.wk : null, ph: ref ? ref.ph : null, slot: 'user', k: o.k, s: o.k === 'run' ? (o.sub || 'easy') : (o.k === 'strength' ? 'A' : 'opt'), st: 'planned', user: 1 };
    if (o.k === 'run') s.km = o.km; if (o.title) s.title = o.title; if (o.note) s.note = o.note;
    return this.manualChange('Sessione aggiunta: ' + P.title(s) + ' del ' + E.dshort(o.d), [{ t: 'add', s }], 'plan');
  }
  deleteSession(id: string): Change | null {
    const s = this.session(id); if (!s) return null;
    return this.manualChange('Sessione eliminata: ' + P.title(s) + ' del ' + E.dshort(s.d), [{ t: 'del', s: clone(s) }], 'plan');
  }

  // ---------- obiettivo, ritmi, profilo, giorni ----------
  setGoal(sec: number): Change | null {
    const old = this.core.goal.sec; if (sec === old) return null;
    const gp = sec / 42.195;
    const c = this.manualChange('Obiettivo portato a ' + P.fmtTime(sec), [{ t: 'goal', from: old, to: sec }, { t: 'pace', z: 'mp', from: this.core.paces.mp, to: [P.r5(gp - 7), P.r5(gp - 1)] }], 'goal');
    this.coachPass();
    return c;
  }
  setPaces(next: Partial<Record<Zone, PaceRange>>): Change | null {
    const pc = this.core.paces, ops: Op[] = [];
    (['easy', 'long', 'mp', 'hm', 'tempo', 'interval'] as Zone[]).forEach(z => { const n = next[z]; if (n && (n[0] !== pc[z][0] || n[1] !== pc[z][1])) ops.push({ t: 'pace', z, from: pc[z], to: n }); });
    return ops.length ? this.manualChange('Ritmi di riferimento modificati', ops, 'pace') : null;
  }
  saveProfile(p: { name: string; age: number | null; hrMax: number | null; weight: number | null; notes: string }): void {
    Object.assign(this.core.profile, p);
    this.put('app/core', this.core);
  }
  /** Nuova disponibilità settimanale: sposta le sessioni future sui nuovi giorni. Restituisce quante ne ha spostate. */
  saveDays(sel: Pick<DayMap, 'q' | 'e' | 'long' | 'x' | 'str'>): number {
    const nd: Partial<DayMap> = { q: sel.q, e: sel.e, long: sel.long, x: sel.x, str: sel.str }, runs = [sel.q, sel.e, sel.long, sel.x];
    let free = [0, 1, 2, 3, 4, 5, 6].filter(d => runs.indexOf(d) < 0 && d !== sel.str);
    const before = (sel.long + 6) % 7;
    nd.sat = free.indexOf(before) >= 0 ? before : (free[0] != null ? free[0] : P.DEF_DAYS.sat); free = free.filter(d => d !== nd.sat); nd.mon = free[0] != null ? free[0] : P.DEF_DAYS.mon;
    const t = this.today(), ops: Op[] = [], map = nd as Record<string, number | undefined>;
    this.plan.sessions.forEach(s => { if (s.st !== 'planned' || s.d <= t || s.ph === 'race' || map[s.slot] == null) return; const d = P.addDays(P.mondayOf(s.d), map[s.slot] as number); if (d !== s.d && d > t) ops.push(E.sop(s, { d })); });
    this.core.profile.days = nd;
    if (ops.length) this.manualChange('Nuova disponibilità settimanale', ops, 'plan'); else this.put('app/core', this.core);
    return ops.length;
  }

  /**
   * Cambio della data di gara: le sessioni future ancora pianificate vengono sostituite da quelle dello schema
   * riallineato all'indietro dalla nuova data. Restano quelle passate, fatte, saltate e quelle aggiunte a mano.
   * È una modifica come le altre: copia del piano, valore precedente e nuovo, annullabile.
   */
  changeRaceDate(date: Iso): Change | null {
    const old = this.core.race.date, t = this.today();
    if (!date || date === old || date <= t || !this.plan.sessions.length) return null;
    const first = P.mondayOf(this.plan.sessions[0].d);
    const gen = P.generate({ raceDate: date, startDate: first, days: this.core.profile.days, idp: 'p' + (this.plan.v || 1) });
    const drop = this.plan.sessions.filter(s => s.d > t && s.st === 'planned' && !s.user);
    const add = gen.filter(s => s.d > t);
    const ops: Op[] = ([{ t: 'race', from: old, to: date }] as Op[]).concat(drop.map(s => ({ t: 'del', s: clone(s) } as Op)), add.map(s => ({ t: 'add', s } as Op)));
    const c = E.mk('manual-' + uid(''), t, { kind: 'manual', status: 'pending', cat: 'plan', title: 'Gara spostata al ' + dfull(date), ops, why: ['Modifica inserita da te'], impact: 'Sessioni future riallineate alla nuova data. Quelle già fatte o saltate restano com’erano.' });
    this.S.changes[c.id] = c; this.applyChange(c, 'apply');
    this.coachPass();
    return c;
  }

  // ---------- creazione del piano ----------
  makeCore(o: NewPlan): Core {
    const eq = E.eq10(o.refDist, o.refSec), goal = o.goalSec, t = this.today();
    return { v: 1, createdAt: nowISO(), profile: { name: o.name || '', age: o.age || null, hrMax: null, baseKm: o.baseKm || 15, runs: 3, strength: '1–2', days: clone(P.DEF_DAYS), notes: '' },
      race: { name: o.raceName || 'Maratona', date: o.raceDate, km: 42.195 }, goal: { sec: goal, history: [{ date: t, sec: goal, by: 'utente' }] },
      ref: { dist: o.refDist, sec: o.refSec, date: t, source: 'dichiarato', eq10: Math.round(eq) }, paces: P.pacesFromRef(eq, goal), paceHistory: [], versions: [], predHistory: [] };
  }
  createPlan(o: NewPlan): void {
    const core = this.makeCore(o), sessions = P.generate({ raceDate: o.raceDate, startDate: this.today() });
    this.put('app/core', core); this.put('app/plan', { v: 1, createdAt: nowISO(), sessions });
    this.coachPass();
  }

  // ---------- backup ----------
  exportObject(): Backup {
    const S = this.S;
    return { app: BACKUP_APP, v: 1, exportedAt: nowISO(), core: S.core as Core, plan: S.plan as Plan, workouts: S.workouts, checkins: S.checkins, changes: S.changes };
  }
  importObject(input: unknown): void {
    if (!isBackup(input)) throw new Error('Il file non è un backup di questa app.');
    const o = clone(input);
    if (this.ready()) this.snapshotVersion('Prima del ripristino da backup');
    const vers = (this.S.core && this.S.core.versions) || [];
    o.core.versions = vers.concat((o.core.versions || []).filter(v => !vers.some(x => x.id === v.id)));
    o.plan.v = Math.max(o.plan.v || 1, (this.S.plan && this.S.plan.v) || 1);
    this.put('app/core', o.core); this.put('app/plan', o.plan);
    (['workouts', 'checkins', 'changes'] as const).forEach(col => { const m = (o[col] || {}) as Record<string, unknown>; Object.keys(m).forEach(id => this.put(col + '/' + id, m[id])); });
    const c = E.mk('restore-' + uid(''), this.today(), { kind: 'event', status: 'info', cat: 'data', title: 'Dati ripristinati da un backup del ' + dstamp(o.exportedAt || nowISO()), why: [], impact: 'Profilo, obiettivi e piano sostituiti; gli allenamenti del backup reinseriti. Quelli registrati dopo il backup sono rimasti.' });
    this.put('changes/' + c.id, c);
  }
  csv(): string {
    const head = ['data', 'attivita', 'tipo', 'km', 'tempo', 'ritmo_min_km', 'fc_media', 'fc_max', 'dislivello_pos', 'dislivello_neg', 'rpe', 'sensazioni', 'fatica', 'dolore', 'zona_dolore', 'sonno', 'temperatura', 'acqua_ml', 'gel', 'carboidrati_g', 'carico', 'valutazione', 'note'];
    const q = (v: unknown): string => { const x = v == null ? '' : String(v); return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const rows = this.liveWorkouts().reverse().map(w => [w.date, P.KIND_LABEL[w.k] || w.k, w.k === 'run' ? (P.RUN_TITLE[w.sub as string] || w.sub) : '', w.km != null ? P.nf(w.km, 2) : '', w.sec ? P.fmtTime(w.sec) : (w.min ? w.min + ' min' : ''), w.sec && w.km ? P.fmtPace(w.sec / w.km) : '', w.hrAvg, w.hrMax, w.up, w.down, w.rpe, w.feel, w.fatigue, w.pain ? E.PAIN_LBL[w.pain.lvl] : '', w.pain ? w.pain.area : '', w.sleep, w.temp, w.waterMl, w.gels, w.carbsG, w.eval ? w.eval.calc.load : '', w.eval ? w.eval.rating : '', w.notes].map(q).join(';'));
    return '﻿' + head.join(';') + '\n' + rows.join('\n') + '\n';
  }

  // ---------- dati derivati per le viste ----------
  sessionsOn(d: Iso): Session[] { return this.ready() ? this.plan.sessions.filter(s => s.d === d) : []; }
  extrasOn(d: Iso): Workout[] { return this.liveWorkouts().filter(w => { const s = this.session(w.sid); return w.date === d && (!w.sid || !s || s.d !== d); }); }
  nextSession(fromIncl: Iso): Session | null { return this.ready() ? this.plan.sessions.filter(s => s.st === 'planned' && s.d >= fromIncl && s.k !== 'rest' && s.k !== 'mobility' && !(s.k === 'swim'))[0] || null : null; }
  describe(s: Session) { return P.describe(s, this.core.paces, this.core.goal.sec); }
}
