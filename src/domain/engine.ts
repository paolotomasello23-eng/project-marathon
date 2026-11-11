/* engine.ts — analisi degli allenamenti, stime e adattamento del piano (logica pura, senza DOM).
   Port 1:1 di reference/src/engine.js: numeri, soglie e testi sono quelli dell'originale. */
import * as P from './plan';
import type {
  Acwr, Alert, Change, Checkin, Core, Criterion, EvalCalc, Evaluation, FatigueStatus, Iso, Op, PaceOp, PaceRange, PainReport, Plan,
  Prediction, Profile, Session, SessionPatch, SOp, State, Status, WeekStats, Workout, Zone
} from './types';

const { addDays, mondayOf, diffDays, dow, nf, fmtPace, fmtTime, mid, r5 } = P;

const MAR = 42.195, LN = Math.log(MAR / 10);
export const WD = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
export const MO = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export function dshort(s: Iso): string { const d = P.parse(s); return WD[dow(s)].slice(0, 3) + ' ' + d.getDate() + ' ' + MO[d.getMonth()]; }

type Num = number | null | undefined;
function sum<T>(a: T[], f?: (x: T) => Num): number { let t = 0; for (let i = 0; i < a.length; i++) t += (f ? f(a[i]) : (a[i] as unknown as number)) || 0; return t; }
function mean(a: number[]): number | null { return a.length ? sum(a) / a.length : null; }
function clamp(x: number, a: number, b: number): number { return Math.max(a, Math.min(b, x)); }
function half(x: number): number { return Math.round(x * 2) / 2; }
function sgn(x: number, unit?: string): string { return (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(Math.round(x)) + (unit || ''); }
/** Confronto come nell'originale: un valore mancante non supera mai la soglia. */
function n(x: Num): number { return x == null ? NaN : x; }

export function eq10(dist: number, sec: number): number { return sec * Math.pow(10 / dist, 1.06); }
export function refEq10(core: Pick<Core, 'ref'>): number { const r: Partial<Core['ref']> = core.ref || {}; return r.eq10 || (r.sec && r.dist ? eq10(r.dist, r.sec) : 2970); }
export function hrMaxOf(profile?: Profile | null): { v: number; est: boolean } {
  if (profile && profile.hrMax) return { v: profile.hrMax, est: false };
  return { v: Math.round(208 - 0.7 * ((profile && profile.age) || 25)), est: true };
}

// sforzo e frequenza attesi per tipo di corsa
const EXP: Record<string, { rpe: [number, number]; hr: number }> = {
  easy: { rpe: [2, 4], hr: 0.78 }, shake: { rpe: [1, 3], hr: 0.75 }, long: { rpe: [3, 5], hr: 0.80 },
  hills: { rpe: [6, 8], hr: 0.90 }, fartlek: { rpe: [5, 7], hr: 0.88 }, tempo: { rpe: [6, 7], hr: 0.90 },
  mp: { rpe: [5, 6], hr: 0.86 }, hmp: { rpe: [5, 7], hr: 0.88 },
  test5: { rpe: [9, 10], hr: 1 }, test10: { rpe: [9, 10], hr: 1 }, testhm: { rpe: [8, 10], hr: 0.95 }, race: { rpe: [8, 10], hr: 0.95 }
};
type SLike = Pick<Session, 'x'> | null | undefined;
export function expFor(w: Pick<Workout, 'sub' | 'km'>, s?: SLike): { rpe: number[]; hr: number } {
  const e = EXP[w.sub as string] || EXP.easy;
  let r: number[] = e.rpe.slice();
  if (w.sub === 'long') { if (s && s.x && s.x.mp) r = [4, 6]; else if ((w.km || 0) >= 28) r = [3, 7]; else if ((w.km || 0) >= 22) r = [3, 6]; }
  return { rpe: r, hr: e.hr };
}
const DEF_RPE: Record<string, number> = { run: 4, strength: 5, swim: 3, mobility: 2, other: 4 };
export function isTest(sub: string | undefined): boolean { return sub === 'test5' || sub === 'test10' || sub === 'testhm' || sub === 'race'; }
function isPlainEasy(w: Workout, s?: SLike): boolean { return w.k === 'run' && (w.sub === 'easy' || w.sub === 'shake' || (w.sub === 'long' && !(s && s.x && (s.x.mp || s.x.prog)))); }
export function runKm(w: Pick<Workout, 'km' | 'extraKm'>): number { return (w.km || 0) + (w.extraKm || 0); }
export function minutesOf(w: Pick<Workout, 'sec' | 'min'>): number { return w.sec ? w.sec / 60 : (w.min || 0); }
export function loadOf(w: Workout): { v: number; est: boolean } {
  let m = minutesOf(w); if (!m && w.k === 'run' && w.km) m = w.km * 6.2;
  if (!m) m = w.k === 'strength' ? 45 : w.k === 'swim' ? 30 : 20;
  const r = w.rpe || DEF_RPE[w.k === 'run' ? 'run' : w.k] || 4;
  return { v: Math.round(m * r), est: !w.rpe || !minutesOf(w) };
}

export function live(st: Pick<State, 'workouts'>): Workout[] { return st.workouts.filter(function (w) { return !w.deleted; }); }
export function sessionById(st: { plan: Plan }, id: string): Session | null { const a = st.plan.sessions; for (let i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
export function planMondays(st: { plan: Plan }): Iso[] {
  const a = st.plan.sessions; if (!a.length) return [];
  const first = mondayOf(a[0].d), last = mondayOf(a[a.length - 1].d), out: Iso[] = [];
  for (let m = first; m <= last; m = addDays(m, 7)) out.push(m);
  return out;
}

// ---------- statistiche settimanali ----------
export function weekOf(st: State, mon: Iso, today?: Iso | null): WeekStats {
  const end = addDays(mon, 6);
  const ss = st.plan.sessions.filter(function (s) { return s.d >= mon && s.d <= end; });
  const ws = live(st).filter(function (w) { return w.date >= mon && w.date <= end; });
  const rp = ss.filter(function (s) { return s.k === 'run'; }), rd = ws.filter(function (w) { return w.k === 'run'; });
  const key = ss.filter(function (s) { return s.k === 'run' || s.k === 'strength'; });
  const due = key.filter(function (s) { return !today || s.d <= today; });
  const longP = rp.filter(function (s) { return s.slot === 'long' || s.s === 'long'; }).sort(function (a, b) { return n(b.km) - n(a.km); })[0];
  let easyMin = 0, modMin = 0, hardMin = 0;
  const home = ss.filter(function (s) { return s.wk && !(s.orig && s.orig.d !== s.d); })[0] || ss.filter(function (s) { return s.wk; })[0] || null;
  rd.forEach(function (w) { const m = minutesOf(w) || (w.km || 0) * 6.2, b = bucket(w); if (b === 0) easyMin += m; else if (b === 1) modMin += m; else hardMin += m; });
  return {
    mon: mon, wk: home ? home.wk : null, ph: home ? home.ph : null, down: ss.some(function (s) { return !!s.down; }),
    planKm: sum(rp, function (s) { return s.km; }), doneKm: sum(rd, runKm), planRuns: rp.length, runWorkouts: rd.length,
    keyDue: due.length, keyDone: due.filter(function (s) { return s.st === 'done'; }).length, keySkipped: due.filter(function (s) { return s.st === 'skipped'; }).length,
    stale: rp.filter(function (s) { return today && s.d < today && s.st === 'planned'; }).length,
    longPlan: longP ? (longP.km as number) : 0, longDone: rd.length ? Math.max.apply(null, rd.map(function (w) { return w.km || 0; })) : 0,
    load: sum(ws, function (w) { return loadOf(w).v; }), up: sum(rd, function (w) { return w.up; }), min: sum(ws, minutesOf),
    easyMin: easyMin, modMin: modMin, hardMin: hardMin, complete: !!today && end < today
  };
}
export function bucket(w: Pick<Workout, 'rpe' | 'sub'>): 0 | 1 | 2 {
  if (w.rpe) return w.rpe <= 4 ? 0 : w.rpe <= 6 ? 1 : 2;
  if (w.sub === 'easy' || w.sub === 'long' || w.sub === 'shake') return 0;
  if (w.sub === 'mp' || w.sub === 'hmp' || w.sub === 'fartlek') return 1;
  return 2;
}
export function allWeeks(st: State, today?: Iso | null): WeekStats[] { return planMondays(st).map(function (m) { return weekOf(st, m, today); }); }

export function acwrAt(st: State, day: Iso): Acwr | null {
  const ws = live(st); if (!ws.length) return null;
  const first = ws.reduce(function (m, w) { return w.date < m ? w.date : m; }, ws[0].date);
  let a = 0, c = 0;
  const d7 = addDays(day, -6), d28 = addDays(day, -27);
  ws.forEach(function (w) { if (w.date > day) return; const l = loadOf(w).v; if (w.date >= d7) a += l; if (w.date >= d28) c += l; });
  if (diffDays(first, day) < 20 || c <= 0) return { acute: a, chronic: c / 4, r: null };
  return { acute: a, chronic: c / 4, r: a / (c / 4) };
}

export function adherence(st: State, today: Iso, days: number): number | null {
  const from = addDays(today, -days);
  const due = st.plan.sessions.filter(function (s) { return s.k === 'run' && s.d >= from && s.d < today && !s.cond; });
  if (due.length < 4) return null;
  return due.filter(function (s) { return s.st === 'done'; }).length / due.length;
}
export function painReports(st: Pick<State, 'workouts' | 'checkins'>, from: Iso, to: Iso): PainReport[] {
  const out: PainReport[] = [];
  live(st).forEach(function (w) { if (w.pain && w.pain.lvl > 0 && w.date >= from && w.date <= to) out.push({ date: w.date, lvl: w.pain.lvl, area: w.pain.area || 'non indicata', src: 'allenamento' }); });
  (st.checkins || []).forEach(function (c) { if (c.pain && c.pain.lvl > 0 && c.date >= from && c.date <= to) out.push({ date: c.date, lvl: c.pain.lvl, area: c.pain.area || 'non indicata', src: 'segnalazione' }); });
  return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}
export const PAIN_LBL = ['nessuno', 'lieve', 'moderato', 'forte'];

// ---------- valutazione di un allenamento ----------
const PAIN_REC = 'Niente corsa finché fa male. Se dura oltre 48–72 ore o cambia l’appoggio: fisioterapista o medico.';
/** today non è usato dal calcolo (come nell'originale): resta nella firma per compatibilità. */
export function evaluate(w: Workout, s: Session | null | undefined, st: State, _today?: Iso): Evaluation {
  const pc = st.core.paces, prof: Profile = st.core.profile || {};
  const ev: Evaluation = { at: new Date().toISOString(), calc: {}, analysis: [], good: [], improve: [], recovery: [], next: [], impact: [], flags: {}, rating: 'buono' };
  const min = minutesOf(w), ld = loadOf(w);
  ev.calc.load = ld.v; ev.calc.loadEst = ld.est;
  const pain = (w.pain && w.pain.lvl) || 0;

  if (w.k !== 'run') {
    ev.analysis.push(P.KIND_LABEL[w.k] + (min ? ' · ' + P.fmtDur(min) : '') + (w.rpe ? ' · RPE ' + w.rpe : ''));
    if (s) { ev.calc.completion = 1; ev.good.push('Sessione completata'); }
    if (w.k === 'strength' && n(w.rpe) >= 8) { ev.improve.push('Forza troppo intensa: gambe lontane dal cedimento'); ev.flags.hard = 1; }
    if (n(w.fatigue) >= 4) { ev.flags.fatigue = 1; ev.improve.push('Fatica alta (' + w.fatigue + '/5)'); }
    painBlock(ev, w);
    ev.recovery.push(pain >= 2 ? PAIN_REC : w.k === 'strength' ? 'Proteine nel pasto successivo.' : 'Recupero normale.');
    nextBlock(ev, w, st);
    ev.rating = pain >= 2 ? 'attenzione' : (ev.flags.hard || ev.flags.fatigue || pain === 1) ? 'da rivedere' : 'buono';
    return ev;
  }

  const km = n(w.km), up = n(w.up);
  const e = expFor(w, s), fam = P.family({ k: 'run', s: w.sub });
  const pace = (w.sec && w.km) ? w.sec / w.km : null;
  if (pace) { ev.calc.pace = pace; ev.calc.speed = 3600 / pace; }
  ev.analysis.push(nf(w.km) + ' km' + (w.sec ? ' · ' + fmtTime(w.sec) : '') + (pace ? ' · ' + fmtPace(pace) + '/km' : ''));

  // confronto con il programma
  if (s && s.km) {
    const target = (isTest(w.sub) && s.s === w.sub) ? ({ test5: 5, test10: 10, testhm: 21.1, race: s.km } as Record<string, number>)[w.sub as string] : s.km;
    const comp = km / target; ev.calc.completion = comp; ev.calc.plannedKm = target;
    ev.analysis.push('Previsti ' + nf(target) + ' km: ' + Math.round(comp * 100) + '%' + (s.s !== w.sub ? ' · tipo diverso' : ''));
    if (comp < 0.85) { ev.flags.incomplete = 1; ev.improve.push('Accorciata di ' + nf(target - km) + ' km'); }
    else if (comp > 1.15 && fam !== 'race') { ev.flags.extra = 1; ev.improve.push(nf(km - target) + ' km oltre il previsto'); }
    else ev.good.push('Distanza centrata');
  } else ev.analysis.push('Fuori programma');

  // dislivello e caldo
  let adj: number | null = pace;
  if (pace && up > 0) {
    const dn = w.down != null ? w.down : up; ev.calc.downEst = w.down == null;
    adj = pace - 0.6 * (up / km) + 0.25 * (dn / km);
    ev.analysis.push('+' + Math.round(up) + ' m: in piano ≈ ' + fmtPace(adj) + '/km (stima)');
  }
  if (pace && w.temp != null && w.temp >= 20) {
    const heat = clamp((w.temp - 15) * 0.004, 0, 0.08); adj = (adj as number) / (1 + heat); ev.calc.heat = heat;
    ev.analysis.push(w.temp + ' °C: −' + nf(heat * 100, 0) + '% atteso');
  }
  if (pace) ev.calc.adj = adj;

  // ritmo rispetto al riferimento (solo corse a ritmo uniforme)
  const plain = isPlainEasy(w, s);
  if (pace && plain) {
    const a = adj as number;
    const z = w.sub === 'long' ? pc.long : pc.easy, m = mid(z);
    ev.calc.target = z; ev.calc.dev = (a - m) / m;
    if (a < z[0] - 8) {
      const hot = (w.rpe && w.rpe >= e.rpe[1] + 1) || hrPct(w, prof) > e.hr + 0.02;
      if (hot) { ev.flags.tooFast = 1; ev.improve.push('Troppo veloce per una corsa facile (' + Math.round(z[0] - a) + ' s/km): rallenta'); }
      else if (w.rpe && w.rpe <= e.rpe[1]) { ev.flags.fastEasy = 1; ev.good.push('Più veloce a sforzo basso'); }
      else ev.improve.push('Più veloce dell’intervallo: registra l’RPE');
    } else if (a > z[1] + 12) ev.analysis.push('Più lento dell’intervallo: va bene, conta lo sforzo');
    else ev.good.push('Ritmo nell’intervallo');
  }

  // test e gare
  if (isTest(w.sub) && pace) {
    const eq = eq10(km, n(w.sec)), ref = refEq10(st.core), dl = (eq - ref) / ref;
    ev.calc.eq10 = eq; ev.calc.refDelta = dl;
    ev.analysis.push('≈ ' + fmtTime(eq) + ' sui 10 km (stima) · riferimento ' + fmtTime(ref));
    if (dl < -0.012) ev.good.push('Progresso: ' + nf(-dl * 100, 1) + '% più veloce');
    if (w.rpe && w.rpe < 8) ev.improve.push('Test non massimale: risultato sottostimato');
  }

  // frequenza cardiaca
  if (w.hrAvg) {
    const hm = hrMaxOf(prof), pct = w.hrAvg / hm.v; ev.calc.hrPct = pct; ev.calc.hrMaxEst = hm.est;
    ev.analysis.push('FC ' + w.hrAvg + ' bpm = ' + Math.round(pct * 100) + '% della max' + (hm.est ? ' stimata' : ''));
    if (plain && pct > e.hr + 0.02) { ev.flags.hrHigh = 1; ev.improve.push('FC sopra la zona facile'); }
    else if (plain) ev.good.push('FC in zona facile');
    if (w.hrMax && !hm.est && w.hrMax > hm.v) ev.analysis.push('FC max sopra quella del profilo: aggiornala');
  }

  // sforzo percepito
  if (w.rpe) {
    ev.analysis.push('RPE ' + w.rpe + ' (atteso ' + e.rpe[0] + '–' + e.rpe[1] + ')');
    if (w.rpe >= e.rpe[1] + 2) { ev.flags.hard = 1; ev.improve.push('Sforzo molto sopra l’atteso'); }
    else if (w.rpe > e.rpe[1]) ev.improve.push('Sforzo un po’ sopra l’atteso');
    else if (w.rpe >= e.rpe[0] - 1) ev.good.push('Sforzo coerente');
  } else ev.analysis.push('RPE mancante: carico stimato');

  // confronto con allenamenti simili
  const sim = live(st).filter(function (o) { return o.id !== w.id && o.k === 'run' && o.sub === w.sub && o.date <= w.date && o.sec && o.km && Math.abs(o.km - km) <= Math.max(2, km * 0.25); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 3);
  if (sim.length && pace) {
    const a = adj as number;
    const sp = mean(sim.map(function (o) { return (o.eval && o.eval.calc && o.eval.calc.adj) || n(o.sec) / n(o.km); })) as number;
    const parts = ['ritmo ' + sgn(a - sp, ' s/km')];
    const sh = sim.filter(function (o) { return o.hrAvg; }); if (w.hrAvg && sh.length) parts.push('FC ' + sgn(w.hrAvg - (mean(sh.map(function (o) { return o.hrAvg as number; })) as number), ' bpm'));
    const sr = sim.filter(function (o) { return o.rpe; }); if (w.rpe && sr.length) parts.push('RPE ' + sgn(w.rpe - (mean(sr.map(function (o) { return o.rpe as number; })) as number), ''));
    ev.calc.vsSimilar = { n: sim.length, pace: a - sp };
    ev.analysis.push('Rispetto alle simili: ' + parts.join(', '));
    if (plain && a - sp < -5 && w.rpe && sr.length && w.rpe <= (mean(sr.map(function (o) { return o.rpe as number; })) as number)) ev.good.push('Stesso sforzo, ritmo migliore');
  }

  // alimentazione nei lunghi
  if (min >= 90) {
    const carbs = w.carbsG != null ? w.carbsG : (w.gels ? w.gels * 25 : null), h = min / 60;
    if (carbs != null) {
      const gph = carbs / h, tg = min >= 150 ? [50, 90] : [30, 60]; ev.calc.carbsH = gph; ev.calc.carbsEst = w.carbsG == null;
      ev.analysis.push('Carboidrati ' + Math.round(gph) + ' g/h' + (w.carbsG == null ? ' (stima)' : '') + ' · riferimento ' + tg[0] + '–' + tg[1]);
      if (gph < tg[0] - 5) ev.improve.push('Pochi carboidrati: punta a ' + tg[0] + '–' + tg[1] + ' g/h'); else ev.good.push('Alimentazione adeguata');
    } else ev.improve.push('Oltre 90 minuti: registra gel e carboidrati');
    if (w.waterMl != null) { const mlh = w.waterMl / h; ev.calc.waterH = mlh; if (mlh < 250 && (w.temp == null || w.temp >= 12)) ev.improve.push('Pochi liquidi (' + Math.round(mlh) + ' ml/h)'); }
  }

  // segnali di fatica e sonno
  if (n(w.fatigue) >= 4) { ev.flags.fatigue = 1; ev.improve.push('Fatica alta (' + w.fatigue + '/5)'); }
  if (w.sleep && w.sleep <= 2) { ev.flags.sleep = 1; ev.analysis.push('Sonno scarso la notte prima'); }
  if (w.feel && w.feel >= 4 && !ev.flags.hard) ev.good.push('Buone sensazioni');
  painBlock(ev, w);

  // recupero
  const big = km >= 26 || min >= 150;
  if (pain >= 2) ev.recovery.push(PAIN_REC);
  if (big) ev.recovery.push('Domani niente corsa. Carboidrati e 20–30 g di proteine entro 2 ore.');
  else if (fam === 'quality' || fam === 'race') ev.recovery.push('24–48 ore senza intensità.');
  else if (fam === 'long') ev.recovery.push('Domani riposo o mobilità.');
  else if (pain < 2) ev.recovery.push('Recupero normale.');
  if (ev.flags.hard || ev.flags.fatigue || ev.flags.sleep) ev.recovery.push('Punta a 8 ore di sonno.');

  nextBlock(ev, w, st);

  const severe = pain >= 2 || (w.rpe && w.rpe >= e.rpe[1] + 3) || (ev.calc.completion != null && ev.calc.completion < 0.6);
  const warn = ev.flags.tooFast || ev.flags.incomplete || ev.flags.hard || ev.flags.fatigue || ev.flags.hrHigh || pain === 1;
  const great = !warn && !severe && (ev.calc.completion == null || ev.calc.completion >= 0.97) && !!w.rpe && w.rpe <= e.rpe[1];
  ev.rating = severe ? 'attenzione' : warn ? 'da rivedere' : great ? 'ottimo' : 'buono';
  return ev;
}
function hrPct(w: Workout, prof: Profile): number { return w.hrAvg ? w.hrAvg / hrMaxOf(prof).v : 0; }
function painBlock(ev: Evaluation, w: Workout): void {
  const p = w.pain; if (!p || !p.lvl) return;
  ev.flags.pain = p.lvl;
  ev.analysis.push('Dolore ' + PAIN_LBL[p.lvl] + (p.area ? ' · ' + p.area : ''));
  ev.improve.push(p.lvl === 1 ? 'Fastidio lieve: da monitorare' : 'Dolore: niente intensità');
}
function nextBlock(ev: Evaluation, w: Workout, st: State): void {
  const nx = st.plan.sessions.filter(function (s) { return s.k === 'run' && s.st === 'planned' && s.d > w.date; })[0];
  if (!nx) { ev.next.push('Nessuna corsa in programma.'); return; }
  (ev.calc as EvalCalc).nextId = nx.id;
  ev.next.push(dshort(nx.d) + ' · ' + P.title(nx) + (nx.km ? ' ' + nf(nx.km) + ' km' : ''));
}

// ---------- previsione e fattibilità ----------
function expo(v: number): number { return clamp(1.14 - (v - 15) * 0.0014, 1.07, 1.14); }
export function predict(st: State, today: Iso): Prediction {
  const core = st.core, G = core.goal.sec, e10 = refEq10(core), ref: Partial<Core['ref']> = core.ref || {};
  const weeks = allWeeks(st, today), done = weeks.filter(function (w) { return w.complete; });
  const last4 = done.slice(-4), baseKm = (core.profile && core.profile.baseKm) || 15;
  const volNow = last4.length >= 2 ? (mean(last4.map(function (w) { return w.doneKm; })) as number) : baseKm;
  const pl = sum(last4, function (w) { return w.planKm; }), adh = last4.length >= 2 && pl > 0 ? clamp(sum(last4, function (w) { return w.doneKm; }) / pl, 0.6, 1) : 0.9;
  const nW = weeks.length, win = weeks.slice(Math.max(0, nW - 15), Math.max(0, nW - 3));
  const volPlan = win.length ? (mean(win.map(function (w) { return w.complete ? w.doneKm : w.planKm * adh; })) as number) : volNow;
  const course = 1.025;
  function t(ex: number, c: number): number { return e10 * Math.exp(LN * ex) * c; }
  const ep = expo(volPlan);
  const out = { eq10: e10, ref: ref, volNow: volNow, volPlan: volPlan, adh: adh, weeksDone: done.length,
    now: t(expo(volNow), course), plan: t(ep, course), low: t(Math.max(1.06, ep - 0.025), 1.015), high: t(ep + 0.03, 1.035) } as Prediction;
  // dati disponibili → confidenza
  let pts = 0;
  const age = ref.date ? diffDays(ref.date, today) : 999;
  if (ref.source === 'test' && age <= 56) pts += (n(ref.dist) >= 20 ? 3 : 2);
  if (done.length >= 4) pts++; if (done.length >= 10) pts++;
  const longest = Math.max.apply(null, [0].concat(live(st).filter(function (w) { return w.k === 'run'; }).map(function (w) { return w.km || 0; })));
  if (longest >= 28) pts++;
  out.longest = longest; out.conf = pts >= 4 ? 'alta' : pts >= 2 ? 'media' : 'bassa';
  // soglie dei test perché la stima centrale scenda sotto l'obiettivo
  const need10 = G / (Math.exp(LN * ep) * course), wksLeft = Math.max(0, Math.round(diffDays(today, core.race.date) / 7));
  out.need = { k10: need10, k5: need10 / Math.pow(2, 1.06), hm: need10 * Math.pow(2.10975, 1.06) };
  out.needPct = (e10 - need10) / e10; out.weeksLeft = wksLeft;
  // il livello pesa il miglioramento richiesto sul tempo che resta (stima prudente: 0,4% a settimana, massimo 4%)
  out.level = out.plan <= G - 180 ? 'realistico' : out.needPct <= Math.min(0.04, 0.004 * wksLeft) ? 'ambizioso' : out.needPct <= Math.min(0.07, 0.007 * wksLeft) ? 'molto ambizioso' : 'fuori portata';
  out.levelLabel = { 'realistico': 'Alla portata', 'ambizioso': 'Ambizioso', 'molto ambizioso': 'Molto ambizioso', 'fuori portata': 'Fuori portata' }[out.level];
  function up5(x: number): number { return Math.ceil(x / 300) * 300; } function rd5(x: number): number { return Math.round(x / 300) * 300; }
  out.rec = { amb: rd5(out.low), real: rd5(out.plan), cons: up5(out.high) };
  // elementi usati, positivi, criticità
  out.used = [
    'Riferimento: ' + nf(ref.dist) + ' km in ' + fmtTime(ref.sec) + ' (' + (ref.source === 'test' ? 'test del ' + dshort(ref.date as Iso) : 'dato dichiarato, non un test massimale') + ')',
    'Volume recente: ' + (last4.length >= 2 ? nf(volNow, 0) + ' km a settimana (media delle ultime ' + last4.length + ' settimane concluse)' : nf(baseKm, 0) + ' km a settimana (valore di partenza dichiarato)'),
    'Volume atteso nelle 12 settimane prima dello scarico: ' + nf(volPlan, 0) + ' km a settimana' + (last4.length >= 2 ? ' (costanza reale ' + Math.round(adh * 100) + '%)' : ' (ipotesi: 90% del piano completato)'),
    'Percorso di Madrid: circa 400 m di salita, +2,5% sul tempo (stima)',
    'Corsa più lunga registrata: ' + (longest ? nf(longest) + ' km' : 'nessuna ancora')
  ];
  out.pos = []; out.neg = [];
  if (wksLeft >= 12) out.pos.push(wksLeft + ' settimane a disposizione: c’è tempo per costruire volume e velocità.');
  if (done.length >= 3 && adh >= 0.9) out.pos.push('Costanza alta: ' + Math.round(adh * 100) + '% dei km programmati nelle ultime settimane.');
  if (ref.source === 'test' && e10 <= need10) out.pos.push('L’ultimo test è già al livello richiesto per il sub-4.');
  if (longest >= 28) out.pos.push('Lunghi oltre i 28 km già completati.');
  if (ref.source !== 'test') out.neg.push('Nessun test ancora: la stima si basa su un dato dichiarato.');
  if (volNow < 35) out.neg.push('Volume attuale basso per una maratona (' + nf(volNow, 0) + ' km a settimana): è il fattore che pesa di più sulla stima.');
  if (done.length >= 3 && adh < 0.8) out.neg.push('Costanza sotto l’80%: senza continuità la stima peggiora.');
  if (longest < 24 && wksLeft <= 10) out.neg.push('Nessun lungo oltre i 24 km a ' + wksLeft + ' settimane dalla gara.');
  out.neg.push('Percorso mosso con finale in salita e possibile caldo di fine aprile.');
  if (painReports(st, addDays(today, -21), today).some(function (r) { return r.lvl >= 2; })) out.neg.push('Dolori segnalati nelle ultime tre settimane.');
  out.tests = st.plan.sessions.filter(function (s) { return s.k === 'run' && (s.s === 'test5' || s.s === 'test10' || s.s === 'testhm') && s.st === 'planned' && s.d >= today; }).map(function (s) {
    const thr = s.s === 'test5' ? out.need.k5 : s.s === 'test10' ? out.need.k10 : out.need.hm;
    return { id: s.id, d: s.d, title: P.title(s), thr: thr };
  });
  return out;
}

// ---------- criteri: quarta corsa e lungo da 35 km ----------
export function run4Criteria(st: State, today: Iso): { list: Criterion[]; ok: boolean } {
  const weeks = allWeeks(st, today).filter(function (w) { return w.complete; }).slice(-3);
  const adh = adherence(st, today, 28), vol = weeks.length >= 2 ? mean(weeks.map(function (w) { return w.doneKm; })) : null;
  const pain = painReports(st, addDays(today, -21), today).some(function (r) { return r.lvl >= 2; });
  const easy = live(st).filter(function (w) { return w.k === 'run' && w.sub === 'easy' && w.rpe && w.date >= addDays(today, -28); });
  const rpe = easy.length >= 3 ? mean(easy.map(function (w) { return w.rpe as number; })) : null;
  const c: Criterion[] = [
    { label: 'Costanza ≥ 85% (4 settimane)', met: adh == null ? null : adh >= 0.85, detail: adh == null ? 'dati insufficienti' : Math.round(adh * 100) + '%' },
    { label: 'Media ≥ 28 km a settimana', met: vol == null ? null : vol >= 28, detail: vol == null ? 'dati insufficienti' : nf(vol, 0) + ' km' },
    { label: 'Nessun dolore (21 giorni)', met: !pain, detail: pain ? 'segnalato' : 'nessuno' },
    { label: 'RPE delle corse facili ≤ 4', met: rpe == null ? null : rpe <= 4, detail: rpe == null ? 'senza dati' : nf(rpe, 1) }
  ];
  return { list: c, ok: c[0].met === true && c[1].met === true && c[2].met === true && c[3].met !== false };
}
export function long35Criteria(st: State, today: Iso): { list: Criterion[]; ok: boolean; longest: number; dur: number; metCount: number } {
  const pc = st.core.paces, runs = live(st).filter(function (w) { return w.k === 'run'; });
  const weeks = allWeeks(st, today).filter(function (w) { return w.complete; }).slice(-4).map(function (w) { return w.doneKm; }).sort(function (a, b) { return b - a; }).slice(0, 3);
  const vol = weeks.length >= 3 ? mean(weeks) : null;
  const big = runs.filter(function (w) { return n(w.km) >= 30 && w.date >= addDays(today, -35); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
  const longest = Math.max.apply(null, [0].concat(runs.map(function (w) { return w.km || 0; })));
  let rec: boolean | null = null;
  if (big) {
    const after = painReports(st, big.date, addDays(big.date, 3)).some(function (r) { return r.lvl >= 2; });
    const nx = st.plan.sessions.filter(function (s) { return s.k === 'run' && s.d > big.date && s.d <= today; })[0];
    rec = !after && (!big.rpe || big.rpe <= 7) && (!nx || nx.st !== 'skipped');
  }
  const adh = adherence(st, today, 42), pain = painReports(st, addDays(today, -21), today).some(function (r) { return r.lvl >= 2; });
  const dur = 35 * mid(pc.long) / 60;
  const c: Criterion[] = [
    { label: '≥ 52 km a settimana', met: vol == null ? null : vol >= 52, detail: vol == null ? 'dati insufficienti' : nf(vol, 0) + ' km' },
    { label: 'Un lungo ≥ 30 km', met: !!big, detail: big ? nf(big.km) + ' km · ' + dshort(big.date) : 'finora ' + nf(longest) + ' km' },
    { label: 'Recupero regolare dopo quel lungo', met: rec, detail: rec == null ? 'da verificare' : rec ? 'sì' : 'no' },
    { label: 'Costanza ≥ 85% (6 settimane)', met: adh == null ? null : adh >= 0.85, detail: adh == null ? 'dati insufficienti' : Math.round(adh * 100) + '%' },
    { label: 'Nessun dolore (21 giorni)', met: !pain, detail: pain ? 'segnalato' : 'nessuno' },
    { label: 'Durata ≤ 3 h 45', met: dur <= 225, detail: P.fmtDur(dur) + ' (stima)' }
  ];
  return { list: c, ok: c.every(function (x) { return x.met === true; }), longest: longest, dur: dur, metCount: c.filter(function (x) { return x.met === true; }).length };
}

// ---------- stato generale, fatica, avvisi ----------
export function prepStatus(st: State, today: Iso): Status {
  const done = allWeeks(st, today).filter(function (w) { return w.complete; }).slice(-4);
  const pain = painReports(st, addDays(today, -7), today).some(function (r) { return r.lvl >= 2; });
  if (pain) return { label: 'Da monitorare', tone: 'crit', text: 'Dolore segnalato negli ultimi 7 giorni: la priorità è risolverlo.' };
  if (!done.length) return { label: 'Avvio', tone: 'info', text: 'Prima settimana: servono un paio di settimane di dati per valutare.' };
  const pl = sum(done, function (w) { return w.planKm; }), r = pl ? sum(done, function (w) { return w.doneKm; }) / pl : 1;
  if (r >= 0.9) return { label: 'In linea', tone: 'ok', text: Math.round(r * 100) + '% dei km programmati nelle ultime ' + done.length + ' settimane.' };
  if (r >= 0.7) return { label: 'Leggero ritardo', tone: 'warn', text: Math.round(r * 100) + '% dei km programmati: recuperabile con continuità, senza rincorrere.' };
  return { label: 'In ritardo', tone: 'crit', text: 'Solo ' + Math.round(r * 100) + '% dei km programmati: il piano va riallineato al carico reale.' };
}
export function fatigueStatus(st: State, today: Iso): FatigueStatus {
  const a = acwrAt(st, today), from = addDays(today, -6), f: number[] = [];
  live(st).forEach(function (w) { if (w.date >= from && w.date <= today && w.fatigue) f.push(w.fatigue); });
  (st.checkins || []).forEach(function (c) { if (c.date >= from && c.date <= today && c.fatigue) f.push(c.fatigue); });
  const fa = mean(f), r = a ? a.r : null;
  if (r == null && fa == null) return { label: 'Dati insufficienti', tone: 'info', pos: null, text: 'Servono circa tre settimane di allenamenti registrati per stimare il rapporto tra carico recente e abituale.', acwr: a };
  let lvl = 0;
  if (r != null) lvl = r > 1.5 ? 3 : r > 1.3 ? 2 : r < 0.8 ? 0 : 1; else lvl = 1;
  if (fa != null && fa >= 4) lvl = Math.max(lvl, 3); else if (fa != null && fa >= 3.3) lvl = Math.max(lvl, 2);
  const L = ([{ label: 'Fresco', tone: 'ok' }, { label: 'Equilibrato', tone: 'ok' }, { label: 'Carico alto', tone: 'warn' }, { label: 'Sovraccarico', tone: 'crit' }] as const)[lvl];
  const txt = (r != null ? 'Carico degli ultimi 7 giorni pari a ' + nf(r, 2) + ' volte quello abituale (zona prudente 0,8–1,3).' : 'Rapporto di carico non ancora calcolabile.') + (fa != null ? ' Fatica media segnalata ' + nf(fa, 1) + ' su 5.' : '');
  return { label: L.label, tone: L.tone, pos: lvl, text: txt, acwr: a };
}
export function alerts(st: State, today: Iso): Alert[] {
  const out: Alert[] = [], pr = painReports(st, addDays(today, -5), today).filter(function (r) { return r.lvl >= 2; });
  if (pr.length) out.push({ lvl: 'crit', text: 'Dolore ' + PAIN_LBL[pr[pr.length - 1].lvl] + ' (' + pr[pr.length - 1].area + '): niente intensità. Se dura 48–72 ore, fatti valutare.' });
  const stale = st.plan.sessions.filter(function (s) { return s.k === 'run' && s.st === 'planned' && s.d < today && s.d >= addDays(today, -21); });
  if (stale.length) out.push({ lvl: 'info', text: stale.length === 1 ? '1 corsa da confermare' : stale.length + ' corse da confermare', act: 'stale', ids: stale.map(function (s) { return s.id; }) });
  const a = acwrAt(st, today); if (a && n(a.r) > 1.5) out.push({ lvl: 'warn', text: 'Carico molto sopra l’abituale (' + nf(a.r, 2) + '×)' });
  const easy = live(st).filter(function (w) { return w.k === 'run' && (w.sub === 'easy' || w.sub === 'long') && w.eval; }).sort(function (x, y) { return x.date < y.date ? 1 : -1; }).slice(0, 4);
  if (easy.length >= 3 && easy.filter(function (w) { return w.eval!.flags && w.eval!.flags.tooFast; }).length >= 3) out.push({ lvl: 'warn', text: 'Corse facili troppo veloci: rallenta' });
  const soon = st.plan.sessions.filter(function (s) { return s.k === 'run' && (s.s === 'test5' || s.s === 'test10' || s.s === 'testhm') && s.st === 'planned' && s.d >= today && diffDays(today, s.d) <= 6; })[0];
  if (soon) out.push({ lvl: 'info', text: P.title(soon) + ' ' + (soon.d === today ? 'oggi' : dshort(soon.d)) });
  return out;
}

// ---------- proposte di modifica ----------
function cid(key: string): string { return key.replace(/[^A-Za-z0-9_\-.~:@+]/g, '-'); }
export function mk(key: string, today: Iso, o: Partial<Change> & Pick<Change, 'title'>): Change {
  return Object.assign({ id: cid(key), key: key, date: today, at: new Date().toISOString(), kind: 'proposal', status: 'pending', cat: 'session', ops: [], why: [], impact: '' } as Omit<Change, 'title'>, o) as Change;
}
function sdesc(o: P.SessionLike): string {
  if (o.k && o.k !== 'run') return P.title(o);
  return P.title(o) + (o.km ? ' ' + nf(o.km) + ' km' : '');
}
export function sop(s: Session, patch: SessionPatch): SOp {
  const from: Record<string, unknown> = {}, src = s as unknown as Record<string, unknown>, after: Record<string, unknown> = Object.assign({}, src), p = patch as Record<string, unknown>;
  Object.keys(p).forEach(function (k) { from[k] = src[k] === undefined ? null : src[k]; if (p[k] === null) delete after[k]; else after[k] = p[k]; });
  return { t: 's', id: s.id, from: from as SessionPatch, to: patch, label: dshort(s.d), a: sdesc(s), b: sdesc(after as unknown as Session) };
}
function toEasy(s: Session, f: number): SOp { const km = Math.max(4, half(n(s.km) * f)); return sop(s, { s: 'easy', km: km, x: null, title: null }); }
function toRest(s: Session, why?: string): SOp { return sop(s, { k: 'rest', s: 'std', km: null, x: null, title: 'Riposo' + (why ? ' (' + why + ')' : ''), cond: null }); }
function upcoming(st: State, from: Iso, days: number): Session[] {
  const to = addDays(from, days);
  return st.plan.sessions.filter(function (s) { return s.k === 'run' && s.st === 'planned' && s.d >= from && s.d <= to && s.s !== 'race'; });
}
function isQ(s: P.SessionLike): boolean { const f = P.family(s); return f === 'quality'; }
function doneToday(st: State, today: Iso): boolean { return live(st).some(function (w) { return w.date === today && w.k === 'run'; }); }

export function propose(st: State, today: Iso): Change[] {
  const out: Change[] = [];
  function has(key: string): boolean { return st.changes.some(function (c) { return c.key === key; }) || out.some(function (c) { return c.key === key; }); }
  function add(c: Change | null): void { if (c && !has(c.key) && (c.ops.length || c.status === 'info')) out.push(c); }
  const start = doneToday(st, today) ? addDays(today, 1) : today;

  // 1. dolore
  const rep = painReports(st, addDays(today, -14), today), last3 = rep.filter(function (r) { return r.date >= addDays(today, -3); });
  const maxL = last3.reduce(function (m, r) { return Math.max(m, r.lvl); }, 0), l2 = rep.filter(function (r) { return r.date >= addDays(today, -7) && r.lvl >= 2; });
  let painAuto = false;
  if (maxL >= 3 || l2.length >= 2) {
    const key = 'pain-' + last3.concat(l2).slice(-1)[0].date, runs = upcoming(st, start, 7), ops: Op[] = [];
    runs.forEach(function (s, i) { if (i === 0) ops.push(toRest(s, 'dolore segnalato')); else if (i === 1) ops.push(toEasy(s, 0.5)); else if (isQ(s) || s.s === 'long') ops.push(toEasy(s, 0.7)); });
    painAuto = true;
    add(mk(key, today, { kind: 'auto', status: 'applied', title: 'Carico ridotto per dolore', cat: 'alert', ops: ops,
      why: rep.filter(function (r) { return r.lvl >= 2; }).map(function (r) { return 'Dolore ' + PAIN_LBL[r.lvl] + ' (' + r.area + ') il ' + dshort(r.date); }),
      impact: 'Applicata subito per sicurezza: puoi annullarla. Le settimane successive restano invariate e le rivaluto quando segnali che il dolore è passato. Ti consiglio una valutazione da un fisioterapista o da un medico dello sport prima di riprendere i carichi.' }));
  } else if (maxL === 2) {
    const r2 = upcoming(st, start, 5), o2: Op[] = [];
    r2.forEach(function (s, i) { if (i === 0) o2.push(toEasy(s, 0.7)); else if (isQ(s)) o2.push(toEasy(s, 1)); });
    add(mk('pain2-' + last3.slice(-1)[0].date, today, { title: 'Alleggerire le prossime corse per il dolore segnalato', cat: 'alert', ops: o2,
      why: last3.map(function (r) { return 'Dolore ' + PAIN_LBL[r.lvl] + ' (' + r.area + ') il ' + dshort(r.date); }),
      impact: 'Solo i prossimi 5 giorni. Se il dolore torna o non passa in 48–72 ore, fermati e fatti valutare.' }));
  } else {
    const areas: Record<string, number> = {}; rep.forEach(function (r) { areas[r.area] = (areas[r.area] || 0) + 1; });
    Object.keys(areas).forEach(function (a) {
      if (areas[a] < 3) return;
      const q = upcoming(st, start, 7).filter(isQ)[0]; if (!q) return;
      add(mk('painrep-' + a + '-' + mondayOf(today), today, { title: 'Fastidio ricorrente (' + a + '): togliere l’intensità per una settimana', cat: 'alert', ops: [toEasy(q, 1)],
        why: [areas[a] + ' segnalazioni nella stessa zona in 14 giorni'], impact: 'Una sola seduta di qualità diventa corsa facile. Se il fastidio continua, serve una valutazione professionale.' }));
    });
  }

  // 2. malattia
  const ill: Checkin | undefined = (st.checkins || []).filter(function (c) { return c.ill && c.date >= addDays(today, -2); }).slice(-1)[0];
  if (ill) {
    const ri = upcoming(st, start, 6), oi: Op[] = [];
    let back = false;
    ri.forEach(function (s) { if (s.d <= addDays(ill.date, 3)) oi.push(toRest(s, 'malattia')); else if (!back) { back = true; oi.push(toEasy(s, 0.7)); } else if (isQ(s)) oi.push(toEasy(s, 1)); });
    add(mk('ill-' + ill.date, today, { kind: 'auto', status: 'applied', title: 'Stop per malattia', cat: 'alert', ops: oi, why: ['Malattia o febbre segnalata il ' + dshort(ill.date)],
      impact: 'Tre giorni senza corsa, poi ripresa facile e più corta. Con febbre o sintomi sotto il collo non ci si allena. Applicata subito: puoi annullarla.' }));
  }

  // 3. fatica
  if (!painAuto && !ill) {
    const f0 = addDays(today, -6), ws = live(st).filter(function (w) { return w.date >= f0 && w.date <= today; });
    const hard = ws.filter(function (w) { return w.eval && w.eval.flags && w.eval.flags.hard; }).length;
    const fat = ws.filter(function (w) { return n(w.fatigue) >= 4; }).length + (st.checkins || []).filter(function (c) { return c.date >= f0 && c.date <= today && n(c.fatigue) >= 4; }).length;
    const slp = ws.filter(function (w) { return w.sleep && w.sleep <= 2; }).length + (st.checkins || []).filter(function (c) { return c.date >= f0 && c.date <= today && c.sleep && c.sleep <= 2; }).length;
    const ac = acwrAt(st, today), acHigh = ac && n(ac.r) > 1.5;
    if (hard >= 2 || fat >= 2 || (acHigh && (fat >= 1 || hard >= 1)) || (fat >= 1 && slp >= 2)) {
      const rf = upcoming(st, start, 7), of: Op[] = [];
      rf.forEach(function (s) { if (P.family(s) === 'race') return; of.push(isQ(s) ? toEasy(s, 0.8) : sop(s, { km: Math.max(4, half(n(s.km) * 0.8)) })); });
      const why: string[] = []; if (hard) why.push(hard + ' sedut' + (hard === 1 ? 'a' : 'e') + ' con sforzo molto sopra l’atteso negli ultimi 7 giorni'); if (fat) why.push(fat + ' segnalazion' + (fat === 1 ? 'e' : 'i') + ' di fatica alta'); if (slp >= 2) why.push('Sonno scarso in ' + slp + ' occasioni'); if (acHigh) why.push('Carico recente ' + nf(ac!.r, 2) + ' volte quello abituale');
      add(mk('fatigue-' + mondayOf(today), today, { title: 'Settimana alleggerita', cat: 'week', ops: of, why: why,
        impact: 'Nei prossimi 7 giorni le sedute di qualità diventano corse facili e il volume scende del 20%. La progressione riprende dalla settimana successiva; eventuali test restano in calendario ma valuta di rinviarli.' }));
    }
  }

  // 4. limite al carico della settimana in arrivo
  (function () {
    const cur = mondayOf(today), d = dow(today);
    let target: Iso | null = null;
    const curLong = st.plan.sessions.filter(function (s) { return s.d >= cur && s.d <= addDays(cur, 6) && s.slot === 'long'; })[0];
    if (d === 6 && (!curLong || curLong.st !== 'planned')) target = addDays(cur, 7);
    else if (d <= 2 && !live(st).some(function (w) { return w.k === 'run' && w.date >= cur; })) target = cur;
    if (!target) return;
    const tg = target;
    const wT = weekOf(st, tg, today); if (!wT.planKm || wT.ph === 'race') return;
    if (st.plan.sessions.some(function (x) { return x.rec && x.d >= tg && x.d <= addDays(tg, 6); })) return; // settimana già tarata da un recupero
    const mons = planMondays(st), first = mons[0], prev: WeekStats[] = [];
    for (let i = 1; i <= 6; i++) { const m = addDays(tg, -7 * i); if (m >= first) prev.push(weekOf(st, m, today)); }
    if (!prev.length || prev[0].stale) return;
    const A = prev.map(function (w) { return w.doneKm; }), A3 = A.slice(0, 3);
    let missed = 0;
    while (missed < prev.length && prev[missed].planKm > 0 && prev[missed].doneKm < 0.5 * prev[missed].planKm) missed++;
    let cap: number, capWhy: string;
    if (missed === 0) { const ref = prev[0].down ? Math.max.apply(null, A3) : Math.max(A[0], mean(A3) as number); cap = ref * 1.15 + 2; capWhy = 'Limite prudente rispetto al carico reale (+15% circa): ' + nf(cap, 0) + ' km'; }
    else { const best = Math.max.apply(null, A), k = [0, 0.95, 0.8, 0.65, 0.5][Math.min(missed, 4)]; cap = Math.max(12, best * k); capWhy = (missed === 1 ? 'Dopo una settimana quasi ferma' : 'Dopo ' + missed + ' settimane quasi ferme') + ' riparto dal ' + Math.round(k * 100) + '% del carico più alto delle ultime settimane: ' + nf(cap, 0) + ' km'; }
    if (wT.planKm <= cap + 1) return;
    const runs = st.plan.sessions.filter(function (s) { return s.k === 'run' && s.st === 'planned' && s.d >= tg && s.d <= addDays(tg, 6) && P.family(s) !== 'race'; });
    const fixed = wT.planKm - sum(runs, function (s) { return s.km; }), f = Math.max(0.4, (cap - fixed) / Math.max(1, wT.planKm - fixed));
    const maxLong = Math.max.apply(null, [0].concat(live(st).filter(function (w) { return w.k === 'run' && w.date >= addDays(tg, -42); }).map(function (w) { return w.km || 0; })));
    const ops: Op[] = [];
    let tot = fixed;
    runs.forEach(function (s) {
      const skm = n(s.km);
      let km = Math.max(4, half(skm * f));
      if (s.slot === 'long' && maxLong) km = Math.min(km, Math.max(10, maxLong + 4));
      const q2e = isQ(s) && (missed > 0 || f < 0.75);
      if (skm - km >= 1 || q2e) { tot += km; ops.push(q2e ? sop(s, { s: 'easy', km: km, x: null }) : sop(s, { km: km })); } else tot += skm;
    });
    add(mk('cap-' + tg, today, { title: (missed ? 'Ripartire dal carico reale: settimana ' : 'Ridurre la settimana ') + wT.wk + ' a circa ' + nf(tot, 0) + ' km', cat: 'week', ops: ops,
      why: ['Km registrati nelle ultime settimane (dalla più recente): ' + A.slice(0, 4).map(function (x) { return nf(x, 0); }).join(', '), 'Programmati per la settimana ' + wT.wk + ': ' + nf(wT.planKm, 0) + ' km', capWhy],
      impact: 'Non recupero i km saltati: riparto da quello che hai fatto davvero' + (missed ? ', con sole corse facili' : '') + '. La progressione dei lunghi slitta di circa una settimana; il lungo da 35 km resta possibile solo se i criteri saranno rispettati.' }));
  })();

  // 5. ritmo delle corse facili (tendenza su più uscite)
  (function () {
    const lastPace = st.changes.filter(function (c) { return c.cat === 'pace' && c.status === 'applied'; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
    if (lastPace && lastPace.kind !== 'setup' && diffDays(lastPace.date, today) < 21) return;
    const runs = live(st).filter(function (w) { return w.k === 'run' && (w.sub === 'easy' || w.sub === 'long') && w.rpe && w.eval && w.eval.calc && w.eval.calc.adj && w.eval.calc.target && w.date >= addDays(today, -28); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 5);
    if (runs.length < 4) return;
    const pc = st.core.paces, av = mean(runs.map(function (w) { return (w.eval!.calc.adj as number) - (w.sub === 'long' ? pc.long[0] - pc.easy[0] : 0); })) as number, rp = mean(runs.map(function (w) { return w.rpe as number; })) as number;
    const hr = runs.filter(function (w) { return w.eval!.calc.hrPct; }), hp = hr.length >= 3 ? mean(hr.map(function (w) { return w.eval!.calc.hrPct as number; })) : null;
    const why = ['Ultime ' + runs.length + ' corse facili: ritmo medio equivalente ' + fmtPace(av) + '/km, RPE medio ' + nf(rp, 1) + (hp ? ', frequenza media ' + Math.round(hp * 100) + '% della massima' : '')];
    function shift(d: number): PaceOp[] { return [{ t: 'pace', z: 'easy', from: pc.easy, to: [pc.easy[0] + d, pc.easy[1] + d] }, { t: 'pace', z: 'long', from: pc.long, to: [pc.long[0] + d, pc.long[1] + d] }]; }
    if (av < pc.easy[0] - 8 && rp <= 3.5 && (hp == null || hp <= 0.77))
      add(mk('easy-fast-' + mondayOf(today), today, { title: 'Corse facili 5 secondi al km più veloci', cat: 'pace', ops: shift(-5), why: why, impact: 'Aggiornamento prudente: 5 secondi alla volta, non più di una volta ogni tre settimane. I ritmi di qualità cambiano solo con i test.' }));
    else if (rp >= 5 && av >= pc.easy[0] - 3)
      add(mk('easy-slow-' + mondayOf(today), today, { title: 'Corse facili 10 secondi al km più lente', cat: 'pace', ops: shift(10), why: why, impact: 'Le corse facili ti costano troppo a questo ritmo: rallentare migliora il recupero e la qualità delle sedute chiave.' }));
  })();

  // 6. risultati dei test
  live(st).filter(function (w) { return w.k === 'run' && isTest(w.sub) && w.sec && n(w.km) >= 3 && n(w.km) < 40 && w.date >= addDays(today, -10); }).forEach(function (w) {
    const core = st.core, wkm = w.km as number, wsec = w.sec as number, eq = eq10(wkm, wsec), ref = refEq10(core), dl = (eq - ref) / ref, maximal = !w.rpe || w.rpe >= 8;
    let nw: number;
    if (dl < -0.012) nw = Math.max(eq, ref * 0.95); else if (dl > 0.015 && maximal) nw = (eq + ref) / 2; else return;
    const np = P.pacesFromRef(nw, core.goal.sec), ops: Op[] = [{ t: 'ref', from: core.ref, to: { dist: wkm, sec: wsec, date: w.date, source: 'test', rpe: w.rpe || null, eq10: Math.round(nw), wid: w.id } }];
    (['easy', 'long', 'hm', 'tempo', 'interval'] as Zone[]).forEach(function (z) { const o = core.paces[z]; if (o[0] !== np[z][0] || o[1] !== np[z][1]) ops.push({ t: 'pace', z: z, from: o, to: np[z] }); });
    add(mk('test-' + w.id, today, { title: 'Aggiornare i ritmi dopo il ' + (P.RUN_TITLE[w.sub as string] || 'test').toLowerCase(), cat: 'pace', ops: ops, src: { wid: w.id },
      why: [nf(w.km) + ' km in ' + fmtTime(w.sec) + (w.rpe ? ', RPE ' + w.rpe : ''), 'Equivalente sui 10 km: ' + fmtTime(eq) + ' contro ' + fmtTime(ref) + ' del riferimento (' + sgn(dl * 100, '%') + ')', dl < 0 ? (eq < ref * 0.95 ? 'Aggiornamento limitato al 5% per prudenza' : 'Uso il risultato del test come nuovo riferimento') : 'Risultato più lento: faccio la media con il riferimento precedente, può essere stata una giornata storta'],
      impact: 'Cambiano i ritmi di corsa facile, lungo, soglia e ripetute da oggi in poi. Il ritmo maratona dipende dall’obiettivo e viene rivalutato a parte.' }));
  });

  // 7. quarta corsa
  (function () {
    const cond = st.plan.sessions.filter(function (s) { return s.cond === 'run4' && s.st === 'planned' && s.d >= today; });
    if (!cond.length || diffDays(today, cond[0].d) > 10) return;
    const cp = mondayOf(cond[0].d), cr = run4Criteria(st, today), why = cr.list.map(function (c) { return (c.met === true ? 'Sì' : c.met === false ? 'No' : 'Non valutabile') + ' · ' + c.label + ' (' + c.detail + ')'; });
    if (cr.ok) add(mk('run4-' + cp, today, { title: 'Introdurre la quarta corsa settimanale', cat: 'plan', ops: cond.map(function (s) { return sop(s, { cond: null }); }).map(function (o) { o.b = o.a + ' confermata'; return o; }), why: why,
      impact: 'Dal ' + dshort(cond[0].d) + ' quattro corse a settimana: quella del venerdì è breve e sempre facile. Il nuoto diventa facoltativo il lunedì.' }));
    else {
      const lim = addDays(cp, 13), ops = cond.filter(function (s) { return s.d <= lim; }).map(function (s) { return sop(s, { k: 'swim', s: 'opt', km: null, x: null, cond: null }); });
      add(mk('run4-' + cp, today, { title: 'Rinviare la quarta corsa di due settimane', cat: 'plan', ops: ops, why: why,
        impact: 'Per due settimane il venerdì resta nuoto leggero o riposo e il volume previsto scende di circa ' + nf(sum(cond.filter(function (s) { return s.d <= lim; }), function (s) { return s.km; }), 0) + ' km. Rivaluto i criteri tra due settimane.' }));
    }
  })();

  // 8. lungo da 35 km
  (function () {
    const s35 = st.plan.sessions.filter(function (s) { return s.cond === 'long35' && s.st === 'planned' && s.d >= today; })[0];
    if (!s35 || diffDays(today, s35.d) > 14) return;
    const cr = long35Criteria(st, today), why = cr.list.map(function (c) { return (c.met === true ? 'Sì' : c.met === false ? 'No' : 'Non valutabile') + ' · ' + c.label + ' (' + c.detail + ')'; });
    if (cr.ok) { const o = sop(s35, { cond: null }); o.b = o.a + ' confermato'; add(mk('long35-check', today, { title: 'Confermare il lungo da 35 km', cat: 'plan', ops: [o], why: why, impact: 'Corri a ritmo lungo, senza tratti veloci, con la strategia di alimentazione di gara. La settimana successiva è di recupero.' })); }
    else { const nk = cr.longest >= 28 ? 32 : 30; add(mk('long35-check', today, { title: 'Fermare il lungo massimo a ' + nk + ' km', cat: 'plan', ops: [sop(s35, { km: nk, cond: null })], why: why, impact: 'Tra 32 e 35 km il guadagno è soprattutto mentale, mentre il costo di recupero e il rischio di infortunio crescono molto: senza tutti i criteri rispettati non conviene. La preparazione resta completa.' })); }
  })();

  // 9. obiettivo cronometrico
  (function () {
    const core = st.core, G = core.goal.sec, wk = (weekOf(st, mondayOf(today), today).wk || 0);
    const t = live(st).filter(function (w) { return (w.sub === 'test10' || w.sub === 'testhm') && w.date >= addDays(today, -10); }).slice(-1)[0];
    const key = t ? 'goal-test-' + t.id : (wk >= 5 && wk % 4 === 1 ? 'goal-wk' + wk : null); if (!key) return;
    const pr = predict(st, today); if (pr.conf === 'bassa') return;
    let ng: number | null = null, title = '', imp = '';
    if (pr.plan > G + 600) { ng = Math.ceil(pr.plan / 300) * 300; title = 'Rivedere l’obiettivo a ' + fmtTime(ng); imp = 'L’obiettivo attuale resta possibile solo nello scenario più favorevole. Un obiettivo realistico rende più sicura la gestione di gara; lo rivaluto dopo il prossimo test.'; }
    else if (pr.high < G - 300) { ng = G - 300; title = 'Obiettivo più ambizioso: ' + fmtTime(ng); imp = 'Anche la stima prudente è sotto l’obiettivo attuale. Proposta facoltativa: per una prima maratona tenere margine è una scelta sensata.'; }
    if (!ng) return;
    const gp = ng / MAR, mp: PaceRange = [r5(gp - 7), r5(gp - 1)];
    add(mk(key, today, { title: title, cat: 'goal', ops: [{ t: 'goal', from: G, to: ng }, { t: 'pace', z: 'mp', from: core.paces.mp, to: mp }],
      why: ['Stima centrale ' + fmtTime(pr.plan) + ' (tra ' + fmtTime(pr.low) + ' e ' + fmtTime(pr.high) + '), confidenza ' + pr.conf].concat(pr.used.slice(0, 3)), impact: imp + ' Il ritmo maratona di riferimento diventa ' + P.range(mp) + '.' }));
  })();

  return out;
}

// ---------- recupero di una sessione saltata ----------
// Una corsa saltata viene spostata nel primo giorno adatto e il resto si tara attorno:
// niente qualità il giorno dopo un recupero impegnativo, forza leggera nello stesso giorno,
// corse facili ridotte se la settimana di arrivo supera di oltre il 15% i km previsti.
function isHard(s: P.SessionLike): boolean { const f = P.family(s); return f === 'quality' || f === 'race' || f === 'long'; }
function isKey(s: P.SessionLike): boolean { const f = P.family(s); return f === 'race' || f === 'long'; }
function plannedRuns(st: State, d: Iso, exceptId: string): Session[] { return st.plan.sessions.filter(function (x) { return x.k === 'run' && x.d === d && x.st !== 'skipped' && x.id !== exceptId; }); }
function doneRuns(st: State, d: Iso): Workout[] { return live(st).filter(function (w) { return w.k === 'run' && w.date === d; }); }
function anyOn(st: State, d: Iso, exceptId: string, test: (s: P.SessionLike) => boolean): boolean { return plannedRuns(st, d, exceptId).some(test) || doneRuns(st, d).some(function (w) { return test({ k: 'run', s: w.sub || 'easy' }); }); }

export function recoveryBlocked(st: State, s: Session | null | undefined, today: Iso, why?: string | null): string | null {
  if (!s || s.k !== 'run') return 'Si recuperano solo le corse.';
  if (s.s === 'race' || s.s === 'shake') return 'La gara non si recupera.';
  if (why === 'Dolore o fastidio' || why === 'Malattia') return 'Con dolore o malattia non si recupera.';
  if (s.rec && s.rec.n >= 2) return 'Già rinviata due volte: viene assorbita.';
  if (diffDays(today, st.core.race.date) <= 10) return 'Negli ultimi 10 giorni non si recupera.';
  const recent = st.plan.sessions.filter(function (x) { return x.id !== s.id && x.rec && x.rec.at >= addDays(today, -6); }).length;
  if (recent >= 2) return 'Già due recuperi in 7 giorni: viene assorbita.';
  const lost = st.plan.sessions.filter(function (x) { return x.id !== s.id && x.k === 'run' && x.st === 'skipped' && x.d >= addDays(today, -7); }).length;
  if (lost >= 2) return 'Troppe corse saltate in 7 giorni: riparto dal carico reale.';
  return null;
}
export function recoveryOptions(st: State, s: Session, today: Iso): Iso[] {
  const start = s.d >= today ? addDays(s.d, 1) : today, hard = isHard(s), key = isKey(s), lim = addDays(st.core.race.date, -6), strict: Iso[] = [], loose: Iso[] = [];
  for (let i = 0; i < 8; i++) {
    const d = addDays(start, i); if (d >= lim) break;
    if (plannedRuns(st, d, s.id).length || doneRuns(st, d).length) continue;
    const p1 = addDays(d, -1), n1 = addDays(d, 1);
    if (hard) {
      if (anyOn(st, p1, s.id, isHard) || anyOn(st, n1, s.id, isKey)) continue;
      if (key) { // lunghi e test: almeno tre giorni da un altro lungo o test
        let near = false; for (let k = 2; k <= 3; k++) if (anyOn(st, addDays(d, -k), s.id, isKey) || anyOn(st, addDays(d, k), s.id, isKey)) near = true;
        if (near) continue;
      }
      strict.push(d);
    } else {
      const beforeKey = plannedRuns(st, n1, s.id).some(function (x) { return P.family(x) === 'race' || (P.family(x) === 'long' && n(x.km) >= 20); });
      (beforeKey ? loose : strict).push(d);
    }
  }
  return (strict.length ? strict : loose).slice(0, 4);
}
export function recoveryChange(st: State, s: Session, today: Iso, d: Iso, why?: string | null): Change {
  const cnt = ((s.rec && s.rec.n) || 0) + 1, from0 = (s.rec && s.rec.from) || s.d, patches: Record<string, { s: Session; p: Record<string, unknown> }> = {}, order: string[] = [];
  const skm = n(s.km);
  function patch(x: Session, p: SessionPatch): void { if (!patches[x.id]) { patches[x.id] = { s: x, p: {} }; order.push(x.id); } Object.keys(p).forEach(function (k) { patches[x.id].p[k] = (p as Record<string, unknown>)[k]; }); }
  function kmOf(x: Session): number { const q = patches[x.id]; return q && q.p.km != null ? (q.p.km as number) : (x.km || 0); }
  function easyNow(x: Session): boolean { const q = patches[x.id]; return P.family(x) === 'easy' || !!(q && q.p.s === 'easy'); }
  // 1. il giorno dopo un recupero impegnativo niente qualità
  if (isHard(s)) plannedRuns(st, addDays(d, 1), s.id).forEach(function (x) { if (x.st === 'planned' && P.family(x) === 'quality') patch(x, { s: 'easy', km: Math.max(4, half(n(x.km) * 0.8)), x: null, title: null }); });
  // 2. forza nello stesso giorno: leggera
  st.plan.sessions.forEach(function (x) { if (x.d === d && x.k === 'strength' && x.st === 'planned' && x.s !== 'C') patch(x, { s: 'C' }); });
  // 3. settimana di arrivo: al massimo +15% sui km previsti, togliendo fino al 30% dalle corse facili
  const mon = mondayOf(d), end = addDays(mon, 6), same = mon === mondayOf(s.d);
  const wk = st.plan.sessions.filter(function (x) { return x.k === 'run' && x.st !== 'skipped' && x.id !== s.id && x.d >= mon && x.d <= end; });
  const before = sum(wk, function (x) { return x.km; }) + (same ? skm : 0);
  if (!same) {
    if (P.family(s) === 'long') wk.forEach(function (x) { if (x.st === 'planned' && x.d > d && P.family(x) === 'long' && x.x && (x.x.mp || x.x.prog)) patch(x, { x: null }); });
    const trim = wk.filter(function (x) { return x.st === 'planned' && x.d >= today && easyNow(x); });
    const over = sum(wk, kmOf) + skm - before * 1.15, room = sum(trim, kmOf);
    if (over > 0 && room > 0) { const f = Math.max(0.7, 1 - over / room); trim.forEach(function (x) { const km = Math.max(4, half(kmOf(x) * f)); if (kmOf(x) - km >= 0.5) patch(x, { km: km }); }); }
    // 4. un lungo recuperato non deve creare la settimana più pesante del piano: si accorcia il lungo successivo (fino al 40%)
    const peak = Math.max.apply(null, allWeeks(st, today).map(function (w) { return w.ph === 'race' ? 0 : w.planKm; }));
    let tot = sum(wk, kmOf) + skm;
    if (P.family(s) === 'long') wk.forEach(function (x) { if (tot > peak && x.st === 'planned' && x.d > d && P.family(x) === 'long') { const km = Math.max(half(n(x.km) * 0.6), half(kmOf(x) - (tot - peak))); if (kmOf(x) - km >= 1) { tot -= kmOf(x) - km; patch(x, { km: km }); } } });
  }
  const after = sum(wk, kmOf) + skm;
  const ref = st.plan.sessions.filter(function (x) { return x.id !== s.id && x.wk && x.d >= mon && x.d <= end && !(x.orig && x.orig.d !== x.d); })[0];
  const p0: SessionPatch = { d: d, st: 'planned', why: null, rec: { from: from0, n: cnt, at: today } };
  if (ref && ref.wk !== s.wk) { p0.wk = ref.wk; p0.ph = ref.ph; }
  const main = sop(s, p0);
  main.force = 1; main.label = 'recupero'; main.a = sdesc(s) + ' · ' + dshort(s.d); main.b = sdesc(s) + ' · ' + dshort(d);
  const ops: Op[] = ([main] as Op[]).concat(order.map(function (id) { return sop(patches[id].s, patches[id].p as SessionPatch); }));
  return mk('recover-' + s.id + '-' + cnt + '-' + d, today, { kind: 'auto', status: 'pending', cat: 'plan', rec: 1, day: d, title: 'Recupero: ' + sdesc(s) + ' → ' + dshort(d), ops: ops,
    why: ['Saltata ' + dshort(s.d) + (why && why !== 'Non indicato' ? ' · ' + why.toLowerCase() : '')],
    impact: 'Settimana di arrivo: ' + nf(after, 0) + ' km (previsti ' + nf(before, 0) + ').' });
}

// ---------- applicazione e annullamento ----------
export function patchSession(s: Session, patch: SessionPatch, by?: 'user' | 'coach'): void {
  const keys = Object.keys(patch), only = keys.length === 1 && keys[0] === 'cond';
  const rec = s as unknown as Record<string, unknown>, p = patch as Record<string, unknown>;
  if (!only && !s.orig) s.orig = { k: s.k, s: s.s, km: s.km == null ? null : s.km, d: s.d };
  keys.forEach(function (k) { if (p[k] === null) delete rec[k]; else rec[k] = p[k]; });
  if (!only) s.mod = by || 'coach';
}
export function applyOps(st: { core: Core; plan: Plan }, ch: Pick<Change, 'id' | 'kind' | 'ops'>, dir: 'apply' | 'undo', today: Iso): { plan?: 1; core?: 1 } {
  const touched: { plan?: 1; core?: 1 } = {};
  ch.ops.forEach(function (op) {
    if (op.t === 's') {
      const v = dir === 'undo' ? op.from : op.to;
      const s = sessionById(st, op.id); if (!s) return;
      patchSession(s, v, ch.kind === 'manual' ? 'user' : 'coach');
      if (dir === 'undo' && s.orig && s.orig.k === s.k && s.orig.s === s.s && (s.orig.km == null ? s.km == null : s.orig.km === s.km) && s.orig.d === s.d) { delete s.mod; delete s.orig; }
      touched.plan = 1;
    }
    else if (op.t === 'pace') { const v = dir === 'undo' ? op.from : op.to; st.core.paces[op.z] = v.slice() as PaceRange; st.core.paceHistory = (st.core.paceHistory || []).concat([{ date: today, z: op.z, from: (dir === 'undo' ? op.to : op.from), to: v, cid: ch.id, undo: dir === 'undo' }]); touched.core = 1; }
    else if (op.t === 'goal') { const v = dir === 'undo' ? op.from : op.to; st.core.goal.sec = v; st.core.goal.history = (st.core.goal.history || []).concat([{ date: today, sec: v, from: (dir === 'undo' ? op.to : op.from), by: ch.kind === 'manual' ? 'utente' : 'coach', cid: ch.id }]); touched.core = 1; }
    else if (op.t === 'ref') { const v = dir === 'undo' ? op.from : op.to; st.core.ref = Object.assign({}, v); touched.core = 1; }
  });
  return touched;
}
