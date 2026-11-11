/* Aiuti per i test del dominio: stesso scenario sul codice originale e sul port. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'vitest';
import * as P from '../../src/domain/plan';
import * as E from '../../src/domain/engine';
import { RE, RP } from './reference';
import type { Impl } from './simulate';

export const TS: Impl = { P, E };
export const REF: Impl = { P: RP, E: RE };

/** Esegue lo scenario su entrambe le implementazioni, verifica che coincidano e restituisce il risultato del port. */
export function both<T>(fn: (impl: Impl) => T): T {
  const a = fn(REF), b = fn(TS);
  expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  return b;
}

export interface MkOptions { start?: string; race?: string; idp?: string; hrMax?: number | null; goal?: number; eq10?: number }

/** Stato iniziale come in reference/test/recovery.js (piano dal 16 novembre, prefisso "b"). */
export function mkState(impl: Impl, o: MkOptions = {}): any {
  const start = o.start || '2026-11-16', race = o.race || '2027-04-25', goal = o.goal || 14400;
  const sessions = impl.P.generate({ raceDate: race, startDate: start, idp: o.idp === undefined ? 'b' : o.idp });
  return { core: { profile: { age: 22, baseKm: 15, hrMax: o.hrMax ?? null }, race: { date: race }, goal: { sec: goal, history: [] }, paces: impl.P.pacesFromRef(o.eq10 || 2970, goal), paceHistory: [], ref: { dist: 10, sec: 2970, date: '2026-11-10', source: 'dichiarato' } }, plan: { v: 1, sessions }, workouts: [], checkins: [], changes: [] };
}

export function sortPlan(st: any): void { st.plan.sessions.sort((a: any, b: any) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0); }

/** Registra un allenamento come fa l'app: valuta, aggiunge, segna la sessione come fatta. */
export function logWorkout(impl: Impl, st: any, w: any): any {
  const s = w.sid ? impl.E.sessionById(st, w.sid) : null;
  w.eval = impl.E.evaluate(w, s, st, w.date);
  st.workouts.push(w);
  if (s) { s.st = 'done'; s.wid = w.id; }
  return w;
}

/** Corre tutte le corse previste tra due date al ritmo e allo sforzo dati. */
export function runAll(impl: Impl, st: any, from: string, to: string, o: { pace?: number; rpe?: number; kmFactor?: number; skipCond?: boolean } = {}): void {
  const ids = st.plan.sessions.filter((s: any) => s.k === 'run' && s.d >= from && s.d <= to && s.st === 'planned' && !(o.skipCond && s.cond)).map((s: any) => s.id);
  ids.forEach((id: string, i: number) => {
    const s = impl.E.sessionById(st, id), km = Math.round(s.km * (o.kmFactor ?? 1) * 10) / 10;
    const z = s.s === 'long' ? st.core.paces.long : st.core.paces.easy;
    logWorkout(impl, st, { id: 'r' + from + '-' + i, date: s.d, k: 'run', sub: s.s, sid: id, km, sec: Math.round(km * (o.pace ?? impl.P.mid(z))), rpe: o.rpe ?? 3 });
  });
}

/** Salta una sessione e la recupera nel primo giorno adatto, come in reference/test/recovery.js. */
export function skip(impl: Impl, st: any, id: string, t: string, why?: string): any {
  const s = impl.E.sessionById(st, id); s.st = 'skipped'; s.why = why || 'Impegni';
  const blocked = impl.E.recoveryBlocked(st, s, t, why); if (blocked) return { blocked };
  const opts = impl.E.recoveryOptions(st, s, t); if (!opts.length) return { blocked: 'none' };
  const c = impl.E.recoveryChange(st, s, t, opts[0], why); impl.E.applyOps(st, c, 'apply', t); sortPlan(st);
  return { c, opts };
}

export const labels = (c: any): string[] => c.ops.map((o: any) => o.label + ': ' + o.a + ' → ' + o.b);
