/* Parità tra il codice originale (reference/src) e il port TypeScript: stessi input, stessi risultati. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as P from '../../src/domain/plan';
import * as E from '../../src/domain/engine';
import { RE, RP } from './reference';
import { simulate } from './simulate';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-11T09:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

const json = (x: unknown) => JSON.stringify(x);

describe('parità: date e formati', () => {
  it('date', () => {
    for (const d of ['2026-11-09', '2026-12-31', '2027-01-01', '2027-02-28', '2027-03-27', '2027-03-28', '2027-03-29', '2027-04-25', '2028-02-29']) {
      expect(P.mondayOf(d)).toBe(RP.mondayOf(d)); expect(P.dow(d)).toBe(RP.dow(d));
      for (const n of [-400, -7, -1, 0, 1, 6, 7, 30, 365]) expect(P.addDays(d, n)).toBe(RP.addDays(d, n));
      expect(P.diffDays('2026-11-16', d)).toBe(RP.diffDays('2026-11-16', d));
      expect(E.dshort(d)).toBe(RE.dshort(d));
    }
  });
  it('numeri, ritmi, tempi, durate', () => {
    for (const x of [null, undefined, NaN, 0, 0.0004, 0.5, 5.25, 6, 12.04, 42.195, 1234.56]) {
      expect(P.nf(x as number)).toBe(RP.nf(x)); expect(P.nf(x as number, 0)).toBe(RP.nf(x, 0)); expect(P.nf(x as number, 2)).toBe(RP.nf(x, 2));
      expect(P.fmtPace(x as number)).toBe(RP.fmtPace(x)); expect(P.fmtTime(x as number)).toBe(RP.fmtTime(x)); expect(P.fmtDur(x as number)).toBe(RP.fmtDur(x));
    }
    for (const x of [59.5, 60, 299.6, 3599.5, 3600, 14400, 14825.4, Infinity]) { expect(P.fmtPace(x)).toBe(RP.fmtPace(x)); expect(P.fmtTime(x)).toBe(RP.fmtTime(x)); expect(P.fmtDur(x)).toBe(RP.fmtDur(x)); }
    expect(P.range([300, 300])).toBe(RP.range([300, 300])); expect(P.range([335, 340])).toBe(RP.range([335, 340]));
  });
  it('costanti e testi fissi', () => {
    for (const k of ['ZONE_LABEL', 'PHASE', 'DEF_DAYS', 'RUN_TITLE', 'KIND_LABEL', 'SUB_OPTIONS'] as const) expect(json(P[k])).toBe(json(RP[k]));
    expect(json(E.WD)).toBe(json(RE.WD)); expect(json(E.MO)).toBe(json(RE.MO)); expect(json(E.PAIN_LBL)).toBe(json(RE.PAIN_LBL));
  });
});

describe('parità: ritmi e piano', () => {
  it('pacesFromRef', () => {
    for (const eq of [2400, 2700, 2888, 2970, 3100, 3600]) for (const g of [12600, 13500, 14400, 15300, 18000]) expect(json(P.pacesFromRef(eq, g))).toBe(json(RP.pacesFromRef(eq, g)));
  });
  it('generate: date di inizio, date di gara e giorni diversi', () => {
    const cases = [
      { raceDate: '2027-04-25', startDate: '2026-11-09' }, { raceDate: '2027-04-25', startDate: '2026-11-16', idp: 'b' },
      { raceDate: '2027-04-25', startDate: '2026-11-11' }, { raceDate: '2027-04-25', startDate: '2026-09-01' },
      { raceDate: '2027-04-25', startDate: '2027-02-01' }, { raceDate: '2027-04-24', startDate: '2026-11-16' },
      { raceDate: '2027-05-09', startDate: '2026-11-16', idp: 'c' }, { raceDate: '2027-04-25', startDate: '2026-11-16', days: { q: 0, e: 2, long: 5, x: 3, str: 1, sat: 4, mon: 6 } },
      { raceDate: '2027-04-25', startDate: '2027-04-19' }
    ];
    for (const c of cases) expect(json(P.generate(c))).toBe(json(RP.generate(c)));
  });
  it('title, family, durMin, describe per ogni sessione del piano e per i casi limite', () => {
    const sessions = RP.generate({ raceDate: '2027-04-25', startDate: '2026-09-07' });
    const odd = [{ k: 'run', s: 'hills', km: 8 }, { k: 'run', s: 'mp', km: 8 }, { k: 'run', s: 'boh', km: 5 }, { k: 'other', s: 'x' }, { k: 'run', s: 'easy', km: 5, title: 'Giro con amici', dur: 33 }, { k: 'run', s: 'long', km: 30, ph: null }, { k: 'run', s: 'easy' }];
    for (const [eq, g] of [[2970, 14400], [2700, 13500], [3300, 16200]]) {
      const pc = RP.pacesFromRef(eq, g);
      for (const s of sessions.concat(odd)) {
        expect(P.title(s)).toBe(RP.title(s)); expect(P.family(s)).toBe(RP.family(s));
        expect(json(P.durMin(s, pc, g))).toBe(json(RP.durMin(s, pc, g)));
        expect(json(P.describe(s, pc, g))).toBe(json(RP.describe(s, pc, g)));
      }
    }
    for (const m of [0, 74, 75, 119, 120, 164, 165, 300]) expect(P.fuelFor(m)).toBe(RP.fuelFor(m));
  });
});

describe('parità: stagioni simulate (analisi, stime, proposte, recuperi, applica e annulla)', () => {
  const runs = [
    { seed: 1, start: '2026-11-16', race: '2027-04-25', skip: 0.06, pain: 0.02 },
    { seed: 2, start: '2026-11-16', race: '2027-04-25', skip: 0.18, pain: 0.05 },
    { seed: 3, start: '2026-11-09', race: '2027-04-25', skip: 0.02, pain: 0.0 },
    { seed: 4, start: '2026-11-16', race: '2027-04-25', skip: 0.35, pain: 0.1 },
    { seed: 5, start: '2026-10-05', race: '2027-04-25', skip: 0.1, pain: 0.03, hrMax: 196 },
    { seed: 6, start: '2027-01-18', race: '2027-04-25', skip: 0.1, pain: 0.03 },
    { seed: 7, start: '2026-11-16', race: '2027-04-25', skip: 0.12, pain: 0.04, days: { q: 0, e: 2, long: 5, x: 3, str: 1, sat: 4, mon: 6 } },
    { seed: 8, start: '2026-11-16', race: '2027-04-25', skip: 0.0, pain: 0.0 },
    { seed: 9, start: '2026-11-16', race: '2027-04-25', skip: 0.08, pain: 0.25 },
    { seed: 10, start: '2026-11-16', race: '2027-04-25', skip: 0.5, pain: 0.0 }
  ];
  for (const o of runs) {
    it('seme ' + o.seed + ' (salti ' + o.skip + ', dolore ' + o.pain + ', inizio ' + o.start + ')', () => {
      const a = simulate({ P: RP, E: RE }, o), b = simulate({ P, E }, o);
      expect(b.log.length).toBe(a.log.length);
      for (let i = 0; i < a.log.length; i++) expect(json(b.log[i]), 'voce ' + i + ' del diario: ' + json(a.log[i]).slice(0, 80)).toBe(json(a.log[i]));
      expect(json(b.st)).toBe(json(a.st));
    });
  }
  it('la simulazione esercita davvero le regole (non è un confronto a vuoto)', () => {
    const kinds = new Set<string>(), keys = new Set<string>();
    for (const o of runs) { const a = simulate({ P: RP, E: RE }, o); for (const l of a.log) { kinds.add(l[1]); if (l[1] === 'propose') for (const c of l[2]) keys.add(String(c.key).split('-')[0]); } }
    for (const k of ['eval', 'recover', 'skip', 'propose', 'state']) expect(kinds.has(k), k).toBe(true);
    for (const k of ['pain', 'pain2', 'ill', 'fatigue', 'cap', 'easy', 'test', 'run4', 'long35', 'goal']) expect(keys.has(k), 'proposta ' + k + ' mai generata: ' + [...keys].join(',')).toBe(true);
  });
});
