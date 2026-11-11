/* Stagione simulata, deterministica dato il seme. Gira identica sul codice originale e sul port:
   se le due implementazioni divergono anche di un solo valore, il diario finale è diverso. */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Impl { P: any; E: any }

function rng(seed: number) {
  let a = seed >>> 0;
  return function (): number { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface SimOptions { seed: number; start: string; race: string; skip: number; pain: number; days?: Record<string, number>; hrMax?: number | null }

export function simulate(impl: Impl, o: SimOptions) {
  const { P, E } = impl, r = rng(o.seed), goal = 14400;
  const st: any = {
    core: { profile: { name: 'Test', age: 22, baseKm: 15, hrMax: o.hrMax ?? null }, race: { name: 'Maratona di Madrid', date: o.race }, goal: { sec: goal, history: [] }, paces: P.pacesFromRef(2970, goal), paceHistory: [], ref: { dist: 10, sec: 2970, date: o.start, source: 'dichiarato' } },
    plan: { v: 1, sessions: P.generate({ raceDate: o.race, startDate: o.start, idp: 'b', days: o.days }) }, workouts: [], checkins: [], changes: []
  };
  const log: any[] = [];
  const sort = () => st.plan.sessions.sort((a: any, b: any) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  const first = st.plan.sessions[0].d, last = o.race;
  let wn = 0, cn = 0;
  const SKIP_WHY = ['Impegni', 'Stanchezza', 'Meteo', 'Dolore o fastidio', 'Malattia', 'Altro'];
  for (let day = first; day <= last; day = P.addDays(day, 1)) {
    const todays = st.plan.sessions.filter((s: any) => s.d === day && s.st === 'planned').map((s: any) => s.id);
    for (const id of todays) {
      const s = E.sessionById(st, id); if (!s || s.st !== 'planned' || s.d !== day) continue;
      if (s.k === 'rest') continue;
      const u = r();
      if (u < o.skip && s.k === 'run') {
        const why = SKIP_WHY[Math.floor(r() * SKIP_WHY.length)];
        s.st = 'skipped'; s.why = why;
        const blocked = E.recoveryBlocked(st, s, day, why);
        if (blocked) { log.push([day, 'skip', id, blocked]); continue; }
        const opts = E.recoveryOptions(st, s, day);
        if (!opts.length) { log.push([day, 'skip', id, 'none']); continue; }
        const c = E.recoveryChange(st, s, day, opts[Math.floor(r() * opts.length)], why);
        E.applyOps(st, c, 'apply', day); c.status = 'applied'; st.changes.push(c); sort();
        log.push([day, 'recover', id, opts, c]);
        continue;
      }
      if (u < o.skip + 0.04) continue; // dimenticata: resta "da confermare"
      const w: any = { id: 'w' + (++wn), date: day, k: s.k, sid: s.id };
      if (s.k === 'run') {
        const pc = st.core.paces, z = s.s === 'long' ? pc.long : s.s === 'tempo' ? pc.tempo : s.s === 'mp' ? pc.mp : pc.easy;
        w.sub = s.s;
        const full = r() > 0.12;
        w.km = E.isTest(s.s) ? ({ test5: 5, test10: 10, testhm: 21.1, race: 42.195 } as any)[s.s] : Math.round(s.km * (full ? 1 : 0.5 + r() * 0.4) * 10) / 10;
        if (E.isTest(s.s) && s.s !== 'race') w.extraKm = Math.round((s.km - w.km) * 10) / 10;
        const pace = E.isTest(s.s) ? (st.core.ref.eq10 || 2970) / 10 * (0.93 + r() * 0.12) * (s.s === 'testhm' ? 1.06 : s.s === 'race' ? 1.14 : s.s === 'test5' ? 0.96 : 1) : P.mid(z) + (r() - 0.6) * 40;
        w.sec = Math.round(w.km * pace);
        if (r() > 0.15) w.rpe = Math.max(1, Math.min(10, Math.round((E.expFor(w, s).rpe[0] + E.expFor(w, s).rpe[1]) / 2 + (r() - 0.4) * 4)));
        if (r() > 0.4) { w.hrAvg = Math.round(130 + r() * 45); if (r() > 0.5) w.hrMax = w.hrAvg + Math.round(r() * 25); }
        if (r() > 0.6) { w.up = Math.round(r() * w.km * 12); if (r() > 0.5) w.down = Math.round(r() * w.km * 12); }
        if (r() > 0.7) w.temp = Math.round(4 + r() * 24);
        if (w.sec / 60 >= 75) { if (r() > 0.3) w.gels = Math.floor(r() * 6); if (r() > 0.6) w.carbsG = Math.round(r() * 200); if (r() > 0.4) w.waterMl = Math.round(r() * 1500); }
      } else { w.min = Math.round(20 + r() * 40); if (r() > 0.3) w.rpe = Math.round(3 + r() * 6); }
      if (r() > 0.5) w.feel = 1 + Math.floor(r() * 5);
      if (r() > 0.5) w.fatigue = 1 + Math.floor(r() * 5);
      if (r() > 0.6) w.sleep = 1 + Math.floor(r() * 5);
      if (r() < o.pain) w.pain = { lvl: 1 + Math.floor(r() * 3), area: ['ginocchio', 'polpaccio', 'tibia'][Math.floor(r() * 3)] };
      w.eval = E.evaluate(w, s, st, day);
      st.workouts.push(w); s.st = 'done'; s.wid = w.id;
      log.push([day, 'eval', w]);
    }
    if (r() < 0.05) {
      const c: any = { id: 'c' + (++cn), date: day };
      if (r() > 0.4) c.fatigue = 1 + Math.floor(r() * 5);
      if (r() > 0.5) c.sleep = 1 + Math.floor(r() * 5);
      if (r() < o.pain * 2) c.pain = { lvl: 1 + Math.floor(r() * 3), area: ['ginocchio', 'polpaccio'][Math.floor(r() * 2)] };
      if (r() < 0.15) c.ill = true;
      st.checkins.push(c);
    }
    // passaggio del coach: le automatiche si applicano, le proposte si accettano o si rifiutano a caso
    const props = E.propose(st, day);
    for (const c of props) {
      st.changes.push(c);
      const u = r();
      if (c.kind === 'auto' || u < 0.6) { E.applyOps(st, c, 'apply', day); c.status = 'applied'; sort(); if (u > 0.97) { E.applyOps(st, c, 'undo', day); c.status = 'undone'; sort(); } }
      else c.status = 'rejected';
    }
    if (props.length) log.push([day, 'propose', props]);
    if (P.dow(day) === 6 || props.length) {
      log.push([day, 'state', E.weekOf(st, P.mondayOf(day), day), E.predict(st, day), E.run4Criteria(st, day), E.long35Criteria(st, day), E.prepStatus(st, day), E.fatigueStatus(st, day), E.alerts(st, day), E.acwrAt(st, day), E.adherence(st, day, 28)]);
    }
  }
  log.push(['end', E.allWeeks(st, last), st.core, st.plan.sessions]);
  return { st, log };
}
