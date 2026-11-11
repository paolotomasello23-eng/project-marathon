/* Una regola, almeno un test. Ogni scenario gira anche sul codice originale (both) e deve dare lo stesso risultato. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as P from '../../src/domain/plan';
import * as E from '../../src/domain/engine';
import type { Change, Session, State, Workout } from '../../src/domain/types';
import { both, labels, logWorkout, mkState, runAll, TS } from './helpers';
import type { Impl } from './simulate';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-11T09:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

const gen = (startDate: string, raceDate = '2027-04-25', extra: object = {}) => both(i => i.P.generate({ raceDate, startDate, ...extra })) as Session[];
const byWeek = (ss: Session[], f: (w: Session[]) => unknown) => { const out: unknown[] = []; for (let w = 1; ss.some(s => s.wk === w); w++) out.push(f(ss.filter(s => s.wk === w))); return out; };
const ev = (w: Partial<Workout>, sid?: string | null, mut?: (st: any, i: Impl) => void) => both(i => { const st = mkState(i); if (mut) mut(st, i); const x: any = { id: 'x1', date: '2026-11-17', k: 'run', sub: 'easy', ...w }; return i.E.evaluate(x, sid ? i.E.sessionById(st, sid) : null, st, x.date); });
const find = (cs: Change[], prefix: string) => cs.filter(c => c.key.indexOf(prefix) === 0);

// ───────────────────────────── 1. Piano ─────────────────────────────
describe('piano', () => {
  it('schema di 24 settimane allineato all’indietro dalla gara: fasi base, costruzione, specifico, scarico, gara', () => {
    const ss = gen('2026-11-09');
    expect(ss.length).toBe(24 * 7);
    expect(byWeek(ss, w => w[0].ph)).toEqual([...Array(8).fill('base'), ...Array(6).fill('build'), ...Array(7).fill('spec'), 'taper', 'taper', 'race']);
    expect(ss[ss.length - 1]).toMatchObject({ d: '2027-04-25', s: 'race', km: 42.195, wk: 24, slot: 'long' });
    expect(byWeek(ss, w => w.length).every(n => n === 7)).toBe(true);
  });

  it('con meno settimane disponibili si tagliano le prime (dal 16 novembre: 23 settimane, la prima è la seconda dello schema)', () => {
    const ss = gen('2026-11-16', '2027-04-25', { idp: 'b' });
    expect(ss.length).toBe(161);
    expect(byWeek(ss, w => w[0].ph)).toEqual([...Array(7).fill('base'), ...Array(6).fill('build'), ...Array(7).fill('spec'), 'taper', 'taper', 'race']);
    expect(ss.filter(s => s.wk === 1 && s.k === 'run').map(s => [s.d, P.title(s), s.km])).toEqual([['2026-11-17', 'Corsa facile + allunghi', 6], ['2026-11-19', 'Corsa facile', 6], ['2026-11-22', 'Lungo', 14]]);
    const late = gen('2027-02-15'); // 10 settimane: si parte dalla quindicesima dello schema
    expect(byWeek(late, w => w[0].ph)).toEqual([...Array(7).fill('spec'), 'taper', 'taper', 'race']);
    expect(late.filter(s => s.wk === 1 && s.k === 'run').reduce((t, s) => t + (s.km || 0), 0)).toBe(58);
  });

  it('con più di 24 settimane si antepongono settimane di avvio', () => {
    const ss = gen('2026-11-02');
    expect(byWeek(ss, w => w[0].ph).slice(0, 2)).toEqual(['pre', 'base']);
    expect(ss.filter(s => s.wk === 1 && s.k === 'run').map(s => s.km)).toEqual([5, 5, 10]);
  });

  it('settimane di scarico', () => {
    const ss = gen('2026-11-09');
    expect(byWeek(ss, w => w.some(s => s.down)).map((d, i) => d ? i + 1 : 0).filter(Boolean)).toEqual([4, 8, 12, 16, 17, 19, 21, 22, 23, 24]);
  });

  it('test dei 5 km, 10 km e mezza, con riposo il venerdì prima dei test della domenica', () => {
    const ss = gen('2026-11-16', '2027-04-25', { idp: 'b' });
    expect(ss.filter(s => /^test/.test(s.s)).map(s => [s.s, s.d, s.km, s.slot])).toEqual([['test5', '2026-12-01', 8.5, 'q'], ['test10', '2027-01-31', 15, 'long'], ['testhm', '2027-02-28', 24, 'long']]);
    expect(ss.filter(s => s.s === 'pretest').map(s => [s.d, s.k])).toEqual([['2027-01-29', 'rest'], ['2027-02-26', 'rest'], ['2027-04-23', 'rest']]);
  });

  it('quarta corsa e lungo da 35 km sono sessioni condizionali', () => {
    const ss = gen('2026-11-16', '2027-04-25', { idp: 'b' });
    const r4 = ss.filter(s => s.cond === 'run4');
    expect(r4.length).toBe(13); expect(r4[0]).toMatchObject({ d: '2027-01-08', wk: 8, slot: 'x', k: 'run', s: 'easy', km: 5 });
    expect(r4.every(s => P.dow(s.d) === 4 && s.s === 'easy')).toBe(true);
    expect(ss.filter(s => s.cond === 'long35')).toMatchObject([{ d: '2027-03-28', km: 35, s: 'long', wk: 19 }]);
    expect(ss.filter(s => s.wk === 1).map(s => s.k)).toEqual(['mobility', 'run', 'strength', 'run', 'swim', 'rest', 'run']); // prima della quarta corsa: venerdì nuoto o riposo
  });

  it('settimana di gara: riposo, richiami brevi, sgambata il sabato, gara nel giorno indicato', () => {
    const ss = gen('2026-11-16', '2027-04-25', { idp: 'b' }).filter(s => s.ph === 'race');
    expect(ss.map(s => [s.d, s.k, s.s, s.km ?? null])).toEqual([['2027-04-19', 'rest', 'std', null], ['2027-04-20', 'run', 'mp', 7], ['2027-04-21', 'mobility', 'race', null], ['2027-04-22', 'run', 'easy', 5], ['2027-04-23', 'rest', 'pretest', null], ['2027-04-24', 'run', 'shake', 3], ['2027-04-25', 'run', 'race', 42.195]]);
    const sat = gen('2026-11-16', '2027-04-24'); // gara di sabato: la sessione di gara cade nella data di gara
    expect(sat.filter(s => s.k === 'run' && s.s === 'race')[0].d).toBe('2027-04-24');
  });

  it('forza: generale in base, specifica in costruzione e specifico, leggera nello scarico', () => {
    const ss = gen('2026-11-09');
    expect(byWeek(ss, w => w.find(s => s.slot === 'str')!.s).join('')).toBe('AAAAAAAABBBBBBBBBBBBBCCrace');
  });

  it('giorni della settimana modificabili', () => {
    const ss = gen('2026-11-16', '2027-04-25', { days: { q: 0, e: 2, long: 5, x: 3, str: 1, sat: 4, mon: 6 } });
    expect(ss.filter(s => s.wk === 2).map(s => [P.dow(s.d), s.slot])).toEqual([[0, 'q'], [1, 'str'], [2, 'e'], [3, 'x'], [4, 'sat'], [5, 'long'], [6, 'mon']]);
  });
});

// ───────────────────────────── 2. Ritmi ─────────────────────────────
describe('ritmi', () => {
  it('derivati dal tempo equivalente sui 10 km e dall’obiettivo, arrotondati a 5 secondi', () => {
    expect(both(i => i.P.pacesFromRef(2970, 14400))).toEqual({ easy: [360, 390], long: [365, 395], mp: [335, 340], hm: [315, 320], tempo: [300, 310], interval: [280, 290] });
    expect(both(i => i.P.pacesFromRef(2888, 14400))).toEqual({ easy: [350, 380], long: [355, 385], mp: [335, 340], hm: [305, 310], tempo: [290, 300], interval: [270, 280] });
    expect(both(i => i.P.pacesFromRef(2970, 13500)).mp).toEqual([315, 320]); // il ritmo maratona dipende solo dall'obiettivo
  });
  it('equivalente sui 10 km con esponente 1,06', () => {
    expect(Math.round(both(i => i.E.eq10(5, 1385)))).toBe(2888);
    expect(both(i => i.E.eq10(10, 2970))).toBe(2970);
    expect(Math.round(both(i => i.E.eq10(21.0975, 6365)))).toBe(2885);
  });
});

// ───────────────────────────── 3. Analisi ─────────────────────────────
describe('analisi di un allenamento', () => {
  it('completamento: centrata, accorciata (< 85%), oltre il previsto (> 115%), molto incompleta (< 60%)', () => {
    const ok = ev({ km: 6, sec: 6 * 375, rpe: 3 }, 'bw01-q'); expect(ok.calc.completion).toBe(1); expect(ok.good).toContain('Distanza centrata'); expect(ok.rating).toBe('ottimo');
    const short = ev({ km: 5, sec: 5 * 375, rpe: 3 }, 'bw01-q'); expect(short.flags.incomplete).toBe(1); expect(short.improve).toContain('Accorciata di 1 km'); expect(short.rating).toBe('da rivedere'); expect(short.analysis[1]).toBe('Previsti 6 km: 83%');
    const more = ev({ km: 7, sec: 7 * 375, rpe: 3 }, 'bw01-q'); expect(more.flags.extra).toBe(1); expect(more.improve).toContain('1 km oltre il previsto'); expect(more.rating).toBe('ottimo'); // segnalato, ma non abbassa il giudizio
    const cut = ev({ km: 3.5, sec: 3.5 * 375, rpe: 3 }, 'bw01-q'); expect(cut.rating).toBe('attenzione');
  });

  it('test: il completamento si misura sulla distanza del test, non sui km totali della seduta', () => {
    const t = ev({ date: '2026-12-01', sub: 'test5', km: 5, sec: 1385, rpe: 9 }, 'bw03-q');
    expect(t.calc.plannedKm).toBe(5); expect(t.calc.completion).toBe(1);
    expect(t.analysis).toContain('≈ 48:08 sui 10 km (stima) · riferimento 49:30'); expect(t.good).toContain('Progresso: 2,8% più veloce');
    expect(t.recovery).toEqual(['24–48 ore senza intensità.']);
    expect(ev({ date: '2026-12-01', sub: 'test5', km: 5, sec: 1385, rpe: 7 }, 'bw03-q').improve).toContain('Test non massimale: risultato sottostimato');
  });

  it('fuori programma e tipo diverso dal previsto', () => {
    expect(ev({ km: 6, sec: 2250, rpe: 3 }, null).analysis[1]).toBe('Fuori programma');
    expect(ev({ sub: 'tempo', km: 6, sec: 1900, rpe: 6 }, 'bw01-q').analysis[1]).toBe('Previsti 6 km: 100% · tipo diverso');
  });

  it('ritmo corretto per il dislivello: −0,6 s/km per metro di salita al km, +0,25 per la discesa', () => {
    const a = ev({ km: 10, sec: 3600, rpe: 3, up: 100, down: 60 }); expect(a.calc.adj).toBeCloseTo(355.5, 6); expect(a.calc.downEst).toBe(false); expect(a.analysis).toContain('+100 m: in piano ≈ 5:56/km (stima)');
    const b = ev({ km: 10, sec: 3600, rpe: 3, up: 100 }); expect(b.calc.adj).toBeCloseTo(356.5, 6); expect(b.calc.downEst).toBe(true); // discesa non inserita: stimata uguale alla salita
  });

  it('ritmo corretto per il caldo: da 20 °C, 0,4% per grado sopra i 15, al massimo 8%', () => {
    const a = ev({ km: 10, sec: 3600, rpe: 3, temp: 25 }); expect(a.calc.heat).toBeCloseTo(0.04, 9); expect(a.calc.adj).toBeCloseTo(360 / 1.04, 6); expect(a.analysis).toContain('25 °C: −4% atteso');
    expect(ev({ km: 10, sec: 3600, rpe: 3, temp: 19 }).calc.heat).toBeUndefined();
    expect(ev({ km: 10, sec: 3600, rpe: 3, temp: 40 }).calc.heat).toBe(0.08);
  });

  it('ritmo rispetto all’intervallo: troppo veloce, più veloce a sforzo basso, più lento, senza RPE', () => {
    const fast = ev({ km: 6, sec: 6 * 330, rpe: 6 }, 'bw01-q'); expect(fast.flags.tooFast).toBe(1); expect(fast.improve[0]).toBe('Troppo veloce per una corsa facile (30 s/km): rallenta');
    const easyFast = ev({ km: 6, sec: 6 * 345, rpe: 3 }, 'bw01-q'); expect(easyFast.flags.fastEasy).toBe(1); expect(easyFast.good).toContain('Più veloce a sforzo basso');
    expect(ev({ km: 6, sec: 6 * 345 }, 'bw01-q').improve).toContain('Più veloce dell’intervallo: registra l’RPE');
    expect(ev({ km: 6, sec: 6 * 410, rpe: 3 }, 'bw01-q').analysis).toContain('Più lento dell’intervallo: va bene, conta lo sforzo');
    const inz = ev({ km: 6, sec: 6 * 353, rpe: 3 }, 'bw01-q'); expect(inz.good).toContain('Ritmo nell’intervallo'); expect(inz.calc.target).toEqual([360, 390]); expect(inz.calc.dev).toBeCloseTo((353 - 375) / 375, 9);
    expect(ev({ sub: 'tempo', km: 8, sec: 8 * 300, rpe: 7 }, 'bw05-q').calc.target).toBeUndefined(); // le sedute a ritmi misti non si confrontano con l'intervallo
  });

  it('frequenza cardiaca sulla massima: stimata dall’età (208 − 0,7 × età) oppure dal profilo', () => {
    const a = ev({ km: 6, sec: 2250, rpe: 3, hrAvg: 150 }, 'bw01-q'); expect(a.calc.hrMaxEst).toBe(true); expect(a.calc.hrPct).toBeCloseTo(150 / 193, 9); expect(a.analysis).toContain('FC 150 bpm = 78% della max stimata'); expect(a.good).toContain('FC in zona facile');
    const hi = ev({ km: 6, sec: 2250, rpe: 3, hrAvg: 160 }, 'bw01-q'); expect(hi.flags.hrHigh).toBe(1); expect(hi.improve).toContain('FC sopra la zona facile'); expect(hi.rating).toBe('da rivedere');
    const prof = ev({ km: 6, sec: 2250, rpe: 3, hrAvg: 160, hrMax: 205 }, 'bw01-q', st => { st.core.profile.hrMax = 200; });
    expect(prof.calc.hrMaxEst).toBe(false); expect(prof.analysis).toContain('FC 160 bpm = 80% della max'); expect(prof.analysis).toContain('FC max sopra quella del profilo: aggiornala'); expect(prof.flags.hrHigh).toBeUndefined();
    expect(both(i => i.E.hrMaxOf({ age: 40 }))).toEqual({ v: 180, est: true });
  });

  it('RPE atteso per tipo di seduta', () => {
    const exp = (w: any, s?: any) => both(i => i.E.expFor(w, s)).rpe;
    expect(exp({ sub: 'easy' })).toEqual([2, 4]); expect(exp({ sub: 'shake' })).toEqual([1, 3]); expect(exp({ sub: 'long', km: 14 })).toEqual([3, 5]);
    expect(exp({ sub: 'long', km: 22 })).toEqual([3, 6]); expect(exp({ sub: 'long', km: 28 })).toEqual([3, 7]); expect(exp({ sub: 'long', km: 22 }, { x: { mp: 12 } })).toEqual([4, 6]);
    expect(exp({ sub: 'hills' })).toEqual([6, 8]); expect(exp({ sub: 'fartlek' })).toEqual([5, 7]); expect(exp({ sub: 'tempo' })).toEqual([6, 7]); expect(exp({ sub: 'mp' })).toEqual([5, 6]); expect(exp({ sub: 'hmp' })).toEqual([5, 7]);
    expect(exp({ sub: 'test5' })).toEqual([9, 10]); expect(exp({ sub: 'test10' })).toEqual([9, 10]); expect(exp({ sub: 'testhm' })).toEqual([8, 10]); expect(exp({ sub: 'race' })).toEqual([8, 10]);
    const a = ev({ km: 6, sec: 2250, rpe: 5 }, 'bw01-q'); expect(a.analysis).toContain('RPE 5 (atteso 2–4)'); expect(a.improve).toContain('Sforzo un po’ sopra l’atteso'); expect(a.rating).toBe('buono');
    const b = ev({ km: 6, sec: 2250, rpe: 6 }, 'bw01-q'); expect(b.flags.hard).toBe(1); expect(b.rating).toBe('da rivedere'); expect(b.recovery).toContain('Punta a 8 ore di sonno.');
    expect(ev({ km: 6, sec: 2250, rpe: 7 }, 'bw01-q').rating).toBe('attenzione'); // tre punti sopra l'atteso
  });

  it('dato inserito, calcolato e stimato restano distinti (carico, FC massima, discesa, carboidrati)', () => {
    const a = ev({ km: 6, sec: 2400, rpe: 5 }, 'bw01-q'); expect(a.calc.load).toBe(200); expect(a.calc.loadEst).toBe(false); expect(a.calc.pace).toBe(400); expect(a.calc.speed).toBe(9);
    const b = ev({ km: 6, sec: 2400 }, 'bw01-q'); expect(b.calc.load).toBe(160); expect(b.calc.loadEst).toBe(true); expect(b.analysis).toContain('RPE mancante: carico stimato'); expect(b.rating).toBe('buono');
    const c = ev({ sub: 'long', km: 20, sec: 20 * 380, rpe: 4, gels: 3 }, 'bw06-long'); expect(c.calc.carbsEst).toBe(true); expect(c.analysis.some((x: string) => /Carboidrati \d+ g\/h \(stima\)/.test(x))).toBe(true);
  });

  it('confronto con gli allenamenti simili (stesso tipo, distanza vicina, ultimi tre)', () => {
    const r = both(i => {
      const st = mkState(i);
      logWorkout(i, st, { id: 'a', date: '2026-11-17', k: 'run', sub: 'easy', sid: 'bw01-q', km: 6, sec: 6 * 380, rpe: 4, hrAvg: 150 });
      logWorkout(i, st, { id: 'l', date: '2026-11-22', k: 'run', sub: 'long', sid: 'bw01-long', km: 14, sec: 14 * 385, rpe: 4 }); // tipo diverso: non conta
      return logWorkout(i, st, { id: 'b', date: '2026-11-24', k: 'run', sub: 'easy', sid: 'bw02-e', km: 6, sec: 6 * 370, rpe: 3, hrAvg: 146 }).eval;
    });
    expect(r.calc.vsSimilar).toEqual({ n: 1, pace: -10 });
    expect(r.analysis).toContain('Rispetto alle simili: ritmo −10 s/km, FC −4 bpm, RPE −1'); expect(r.good).toContain('Stesso sforzo, ritmo migliore');
  });

  it('alimentazione nei lunghi: da 90 minuti, 30–60 g/h; da 150 minuti, 50–90 g/h; liquidi sotto 250 ml/h', () => {
    const base = { sub: 'long', km: 16, sec: 6000, rpe: 4 }; // 100 minuti
    const ok = ev({ ...base, carbsG: 60 }, 'bw02-long'); expect(ok.calc.carbsH).toBeCloseTo(36, 9); expect(ok.calc.carbsEst).toBe(false); expect(ok.analysis).toContain('Carboidrati 36 g/h · riferimento 30–60'); expect(ok.good).toContain('Alimentazione adeguata');
    const gel = ev({ ...base, gels: 2 }, 'bw02-long'); expect(gel.analysis).toContain('Carboidrati 30 g/h (stima) · riferimento 30–60'); // un gel = 25 g
    expect(ev({ ...base, carbsG: 20 }, 'bw02-long').improve).toContain('Pochi carboidrati: punta a 30–60 g/h');
    expect(ev({ ...base }, 'bw02-long').improve).toContain('Oltre 90 minuti: registra gel e carboidrati');
    const dry = ev({ ...base, carbsG: 60, waterMl: 300 }, 'bw02-long'); expect(dry.calc.waterH).toBeCloseTo(180, 9); expect(dry.improve).toContain('Pochi liquidi (180 ml/h)');
    expect(ev({ ...base, carbsG: 60, waterMl: 300, temp: 5 }, 'bw02-long').improve).not.toContain('Pochi liquidi (180 ml/h)'); // con il freddo non è un problema
    const big = ev({ sub: 'long', km: 27, sec: 27 * 380, rpe: 5, carbsG: 100 }, 'bw13-long'); expect(big.improve).toContain('Pochi carboidrati: punta a 50–90 g/h'); expect(big.recovery[0]).toBe('Domani niente corsa. Carboidrati e 20–30 g di proteine entro 2 ore.');
    expect(ev({ km: 6, sec: 2250, rpe: 3, gels: 0 }, 'bw01-q').calc.carbsH).toBeUndefined(); // sotto i 90 minuti non si valuta
  });

  it('dolore: lieve da monitorare, moderato o forte niente intensità e invito a una valutazione', () => {
    const l = ev({ km: 6, sec: 2250, rpe: 3, pain: { lvl: 1, area: 'polpaccio' } }, 'bw01-q'); expect(l.flags.pain).toBe(1); expect(l.improve).toContain('Fastidio lieve: da monitorare'); expect(l.rating).toBe('da rivedere'); expect(l.analysis).toContain('Dolore lieve · polpaccio');
    const m = ev({ km: 6, sec: 2250, rpe: 3, pain: { lvl: 3, area: 'tibia' } }, 'bw01-q'); expect(m.rating).toBe('attenzione'); expect(m.improve).toContain('Dolore: niente intensità');
    expect(m.recovery).toEqual(['Niente corsa finché fa male. Se dura oltre 48–72 ore o cambia l’appoggio: fisioterapista o medico.']);
  });

  it('fatica, sonno e sensazioni', () => {
    const a = ev({ km: 6, sec: 2250, rpe: 3, fatigue: 4, sleep: 2, feel: 4 }, 'bw01-q');
    expect(a.flags).toMatchObject({ fatigue: 1, sleep: 1 }); expect(a.improve).toContain('Fatica alta (4/5)'); expect(a.analysis).toContain('Sonno scarso la notte prima'); expect(a.good).toContain('Buone sensazioni'); expect(a.recovery).toContain('Punta a 8 ore di sonno.'); expect(a.rating).toBe('da rivedere');
  });

  it('giudizio finale: ottimo, buono, da rivedere, attenzione', () => {
    expect(ev({ km: 6, sec: 2250, rpe: 3 }, 'bw01-q').rating).toBe('ottimo');
    expect(ev({ km: 6, sec: 2250 }, 'bw01-q').rating).toBe('buono');
    expect(ev({ km: 6, sec: 6 * 330, rpe: 6 }, 'bw01-q').rating).toBe('da rivedere');
    expect(ev({ km: 6, sec: 2250, rpe: 3, pain: { lvl: 2 } }, 'bw01-q').rating).toBe('attenzione');
  });

  it('recupero consigliato e prossima corsa', () => {
    const a = ev({ km: 6, sec: 2250, rpe: 3 }, 'bw01-q'); expect(a.recovery).toEqual(['Recupero normale.']); expect(a.next).toEqual(['gio 19 nov · Corsa facile 6 km']); expect(a.calc.nextId).toBe('bw01-e');
    expect(ev({ date: '2026-11-22', sub: 'long', km: 14, sec: 14 * 380, rpe: 4 }, 'bw01-long').recovery).toEqual(['Domani riposo o mobilità.']);
    expect(ev({ date: '2026-11-24', sub: 'hills', km: 7, sec: 7 * 360, rpe: 7 }, 'bw02-q').recovery).toEqual(['24–48 ore senza intensità.']);
    expect(ev({ date: '2027-04-25', sub: 'race', km: 42.195, sec: 14400, rpe: 9 }, 'bw23-long').next).toEqual(['Nessuna corsa in programma.']);
  });

  it('forza, nuoto e mobilità', () => {
    const s = ev({ k: 'strength', sub: undefined, min: 50, rpe: 6, date: '2026-11-18' }, 'bw01-str'); expect(s.analysis).toEqual(['Forza · 50 min · RPE 6']); expect(s.good).toEqual(['Sessione completata']); expect(s.recovery).toEqual(['Proteine nel pasto successivo.']); expect(s.rating).toBe('buono'); expect(s.calc.load).toBe(300);
    const h = ev({ k: 'strength', sub: undefined, min: 50, rpe: 8, date: '2026-11-18' }, 'bw01-str'); expect(h.improve).toEqual(['Forza troppo intensa: gambe lontane dal cedimento']); expect(h.rating).toBe('da rivedere');
    const sw = ev({ k: 'swim', sub: undefined, date: '2026-11-20' }, 'bw01-x'); expect(sw.calc.load).toBe(90); expect(sw.calc.loadEst).toBe(true); expect(sw.recovery).toEqual(['Recupero normale.']);
  });
});

// ───────────────────────────── 4. Stima ─────────────────────────────
describe('stima della maratona', () => {
  it('intervallo: favorevole < centrale < prudente, con percorso di Madrid a +2,5%', () => {
    const pr = both(i => i.E.predict(mkState(i), '2026-11-16'));
    expect(pr.low).toBeLessThan(pr.plan); expect(pr.plan).toBeLessThan(pr.high); expect(pr.now).toBeGreaterThan(pr.plan); // oggi, con 15 km a settimana, andrebbe peggio
    expect(P.fmtTime(pr.plan)).toBe('4:07:05'); expect(pr.low / pr.plan).toBeLessThan(0.97); expect(pr.high / pr.plan).toBeGreaterThan(1.04); expect(pr.weeksLeft).toBe(23);
  });

  it('confidenza: bassa senza test, media con un test recente, alta con test, settimane concluse e un lungo oltre i 28 km', () => {
    const r = both(i => {
      const st = mkState(i), out: string[] = [i.E.predict(st, '2026-11-16').conf];
      st.core.ref = { dist: 5, sec: 1385, date: '2026-12-01', source: 'test', eq10: 2888 };
      out.push(i.E.predict(st, '2026-12-02').conf, i.E.predict(st, '2027-02-01').conf); // test recente; poi test vecchio di oltre 56 giorni ma 11 settimane concluse
      st.core.ref = { dist: 21.0975, sec: 6365, date: '2027-02-28', source: 'test', eq10: 2885 };
      st.workouts.push({ id: 'L', date: '2027-03-14', k: 'run', sub: 'long', km: 32, sec: 32 * 380 });
      out.push(i.E.predict(st, '2027-03-15').conf);
      return out;
    });
    expect(r).toEqual(['bassa', 'media', 'media', 'alta']);
  });

  it('livello di fattibilità: alla portata, ambizioso, molto ambizioso, fuori portata', () => {
    const lvl = (eq: number, day = '2026-11-16') => both(i => { const st = mkState(i); st.core.ref = { dist: 10, sec: eq, date: '2026-11-10', source: 'dichiarato', eq10: eq }; const p = i.E.predict(st, day); return [p.level, p.levelLabel]; });
    expect(lvl(2800)).toEqual(['realistico', 'Alla portata']);
    expect(lvl(2970)).toEqual(['ambizioso', 'Ambizioso']);
    expect(lvl(3080)).toEqual(['molto ambizioso', 'Molto ambizioso']);
    expect(lvl(3300)).toEqual(['fuori portata', 'Fuori portata']);
    // lo stesso margine pesa di più man mano che la gara si avvicina (piano seguito per intero, stesso riferimento)
    const late = (day: string) => both(i => { const st = mkState(i); runAll(i, st, '2026-11-16', i.P.addDays(day, -1)); const p = i.E.predict(st, day); return [p.weeksLeft, p.level]; });
    expect(late('2027-03-15')).toEqual([6, 'ambizioso']); expect(late('2027-03-29')).toEqual([4, 'molto ambizioso']); expect(late('2027-04-12')).toEqual([2, 'fuori portata']);
  });

  it('soglie dei test perché la stima centrale scenda sotto l’obiettivo', () => {
    const pr = both(i => i.E.predict(mkState(i), '2026-11-16'));
    expect(pr.need.k5).toBeCloseTo(pr.need.k10 / Math.pow(2, 1.06), 9); expect(pr.need.hm).toBeCloseTo(pr.need.k10 * Math.pow(2.10975, 1.06), 9);
    expect(pr.tests.map((t: any) => [t.id, P.fmtTime(t.thr)])).toEqual([['bw03-q', '23:04'], ['bw11-long', '48:05'], ['bw15-long', '1:46:05']]);
    expect(pr.rec).toEqual({ amb: 14100, real: 14700, cons: 15900 }); // obiettivi consigliati arrotondati a 5 minuti
  });

  it('il volume reale sposta la stima: con costanza bassa peggiora', () => {
    const r = both(i => {
      const st = mkState(i); runAll(i, st, '2026-11-16', '2026-12-13', { kmFactor: 0.65 });
      const p = i.E.predict(st, '2026-12-14'); return { adh: p.adh, plan: p.plan, neg: p.neg, used: p.used[1] };
    });
    expect(r.adh).toBeCloseTo(0.65, 2); expect(r.plan).toBeGreaterThan(14825);
    expect(r.neg).toContain('Costanza sotto l’80%: senza continuità la stima peggiora.');
    expect(r.used).toMatch(/^Volume recente: \d+ km a settimana \(media delle ultime 4 settimane concluse\)$/);
  });
});

// ───────────────────────────── 5. Proposte ─────────────────────────────
describe('proposte di modifica', () => {
  it('dolore forte: carico ridotto subito, annullabile, con invito a farsi valutare', () => {
    const cs = both(i => { const st = mkState(i); st.checkins.push({ id: 'c1', date: '2026-11-17', pain: { lvl: 3, area: 'tibia' } }); return i.E.propose(st, '2026-11-17'); });
    expect(cs.length).toBe(1);
    expect(cs[0]).toMatchObject({ key: 'pain-2026-11-17', kind: 'auto', status: 'applied', cat: 'alert', title: 'Carico ridotto per dolore', why: ['Dolore forte (tibia) il mar 17 nov'] });
    expect(labels(cs[0])).toEqual(['mar 17 nov: Corsa facile + allunghi 6 km → Riposo (dolore segnalato)', 'gio 19 nov: Corsa facile 6 km → Corsa facile 4 km', 'dom 22 nov: Lungo 14 km → Corsa facile 10 km', 'mar 24 nov: Salite 7 km → Corsa facile 5 km']);
    expect(cs[0].impact).toMatch(/puoi annullarla.*fisioterapista o da un medico dello sport/);
  });

  it('dolore moderato una volta: proposta da accettare; due volte in 7 giorni: riduzione automatica', () => {
    const one = both(i => { const st = mkState(i); st.checkins.push({ id: 'c1', date: '2026-11-18', pain: { lvl: 2, area: 'ginocchio' } }); return i.E.propose(st, '2026-11-18'); });
    expect(one[0]).toMatchObject({ key: 'pain2-2026-11-18', kind: 'proposal', status: 'pending' }); expect(labels(one[0])).toEqual(['gio 19 nov: Corsa facile 6 km → Corsa facile 4 km']);
    const two = both(i => { const st = mkState(i); st.checkins.push({ id: 'c1', date: '2026-11-18', pain: { lvl: 2, area: 'ginocchio' } }, { id: 'c2', date: '2026-11-23', pain: { lvl: 2, area: 'ginocchio' } }); return i.E.propose(st, '2026-11-23'); });
    expect(find(two, 'pain-')[0]).toMatchObject({ kind: 'auto', status: 'applied', why: ['Dolore moderato (ginocchio) il mer 18 nov', 'Dolore moderato (ginocchio) il lun 23 nov'] });
  });

  it('fastidio lieve ricorrente nella stessa zona (3 volte in 14 giorni): una seduta di qualità diventa facile', () => {
    const cs = both(i => { const st = mkState(i); ['2026-11-12', '2026-11-18', '2026-11-22'].forEach((d, n) => st.checkins.push({ id: 'c' + n, date: d, pain: { lvl: 1, area: 'polpaccio' } })); return i.E.propose(st, '2026-11-23'); });
    const c = find(cs, 'painrep-')[0];
    expect(c).toMatchObject({ key: 'painrep-polpaccio-2026-11-23', kind: 'proposal', status: 'pending', title: 'Fastidio ricorrente (polpaccio): togliere l’intensità per una settimana', why: ['3 segnalazioni nella stessa zona in 14 giorni'] });
    expect(labels(c)).toEqual(['mar 24 nov: Salite 7 km → Corsa facile 7 km']);
  });

  it('malattia: tre giorni senza corsa, poi ripresa facile e più corta; applicata subito', () => {
    const cs = both(i => { const st = mkState(i); st.checkins.push({ id: 'c1', date: '2026-11-23', ill: true }); return i.E.propose(st, '2026-11-23'); });
    const c = find(cs, 'ill-')[0];
    expect(c).toMatchObject({ key: 'ill-2026-11-23', kind: 'auto', status: 'applied', title: 'Stop per malattia', why: ['Malattia o febbre segnalata il lun 23 nov'] });
    expect(labels(c)).toEqual(['mar 24 nov: Salite 7 km → Riposo (malattia)', 'gio 26 nov: Corsa facile 6 km → Riposo (malattia)', 'dom 29 nov: Lungo 16 km → Corsa facile 11 km']);
    expect(find(cs, 'fatigue-').length).toBe(0); // con malattia non si aggiunge la proposta per la fatica
  });

  it('fatica: due segnali in 7 giorni alleggeriscono la settimana (qualità → facile, volume −20%)', () => {
    const cs = both(i => { const st = mkState(i); st.checkins.push({ id: 'c1', date: '2026-11-21', fatigue: 4 }, { id: 'c2', date: '2026-11-23', fatigue: 5 }); return i.E.propose(st, '2026-11-23'); });
    const c = find(cs, 'fatigue-')[0];
    expect(c).toMatchObject({ key: 'fatigue-2026-11-23', kind: 'proposal', status: 'pending', cat: 'week', title: 'Settimana alleggerita', why: ['2 segnalazioni di fatica alta'] });
    expect(labels(c)).toEqual(['mar 24 nov: Salite 7 km → Corsa facile 5,5 km', 'gio 26 nov: Corsa facile 6 km → Corsa facile 5 km', 'dom 29 nov: Lungo 16 km → Lungo 13 km']);
    const single = both(i => { const st = mkState(i); st.checkins.push({ id: 'c1', date: '2026-11-23', fatigue: 5 }); return i.E.propose(st, '2026-11-23'); });
    expect(find(single, 'fatigue-').length).toBe(0); // un solo segnale non basta
  });

  it('tetto al carico settimanale: al massimo +15% circa sui km fatti davvero', () => {
    const cs = both(i => { const st = mkState(i); runAll(i, st, '2026-11-16', '2026-11-22', { kmFactor: 0.6 }); return i.E.propose(st, '2026-11-23'); });
    const c = find(cs, 'cap-')[0];
    expect(c).toMatchObject({ key: 'cap-2026-11-23', kind: 'proposal', status: 'pending', cat: 'week', title: 'Ridurre la settimana 2 a circa 20 km' });
    expect(c.why).toEqual(['Km registrati nelle ultime settimane (dalla più recente): 16', 'Programmati per la settimana 2: 29 km', 'Limite prudente rispetto al carico reale (+15% circa): 20 km']);
    expect(labels(c)).toEqual(['mar 24 nov: Salite 7 km → Corsa facile 5 km', 'gio 26 nov: Corsa facile 6 km → Corsa facile 4 km', 'dom 29 nov: Lungo 16 km → Lungo 11 km']);
    const full = both(i => { const st = mkState(i); runAll(i, st, '2026-11-16', '2026-11-22'); return i.E.propose(st, '2026-11-23'); });
    expect(find(full, 'cap-').length).toBe(0); // settimana completata: 29 km stanno nel +15% di 26
  });

  it('ritmi facili: mai per una sola corsa, solo su tendenza di almeno 4 uscite e non più di una volta ogni 3 settimane', () => {
    const r = both(i => {
      const st = mkState(i), out: any = {};
      const fast = (id: string, sid: string, date: string, sub = 'easy') => { const s = i.E.sessionById(st, sid); logWorkout(i, st, { id, date, k: 'run', sub, sid, km: s.km, sec: s.km * (sub === 'long' ? 350 : 345), rpe: 3 }); };
      fast('f1', 'bw01-q', '2026-11-17'); out.one = i.E.propose(st, '2026-11-17').filter((c: any) => c.cat === 'pace' || c.cat === 'goal').length;
      fast('f2', 'bw01-e', '2026-11-19'); fast('f3', 'bw01-long', '2026-11-22', 'long'); out.three = i.E.propose(st, '2026-11-22').filter((c: any) => c.cat === 'pace').length;
      fast('f4', 'bw02-e', '2026-11-26'); const cs = i.E.propose(st, '2026-11-26'); out.four = cs.filter((c: any) => c.cat === 'pace');
      const c = out.four[0]; i.E.applyOps(st, c, 'apply', '2026-11-26'); c.status = 'applied'; st.changes.push(c); out.paces = JSON.parse(JSON.stringify(st.core.paces));
      fast('f5', 'bw03-e', '2026-12-03'); out.soon = i.E.propose(st, '2026-12-03').filter((x: any) => x.cat === 'pace' && /^easy/.test(x.key)).length;
      fast('f6', 'bw04-e', '2026-12-10'); fast('f7', 'bw05-e', '2026-12-17'); out.later = i.E.propose(st, '2026-12-17').filter((x: any) => x.cat === 'pace' && /^easy/.test(x.key)).map((x: any) => x.key);
      return out;
    });
    expect(r.one).toBe(0); expect(r.three).toBe(0);
    expect(r.four.length).toBe(1);
    expect(r.four[0]).toMatchObject({ key: 'easy-fast-2026-11-23', kind: 'proposal', title: 'Corse facili 5 secondi al km più veloci', why: ['Ultime 4 corse facili: ritmo medio equivalente 5:45/km, RPE medio 3,0'] });
    expect(r.four[0].ops).toEqual([{ t: 'pace', z: 'easy', from: [360, 390], to: [355, 385] }, { t: 'pace', z: 'long', from: [365, 395], to: [360, 390] }]);
    expect(r.paces.easy).toEqual([355, 385]); expect(r.paces.tempo).toEqual([300, 310]); // i ritmi di qualità non cambiano
    expect(r.soon).toBe(0); // 7 giorni dopo: troppo presto
    expect(r.later).toEqual(['easy-fast-2026-12-14']); // 21 giorni dopo si può rivalutare
  });

  it('ritmi facili più lenti se lo sforzo è alto nell’intervallo previsto', () => {
    const cs = both(i => {
      const st = mkState(i);
      [['bw01-q', '2026-11-17'], ['bw01-e', '2026-11-19'], ['bw02-e', '2026-11-26'], ['bw03-e', '2026-12-03']].forEach(([sid, date], n) => { const s = i.E.sessionById(st, sid); logWorkout(i, st, { id: 's' + n, date, k: 'run', sub: 'easy', sid, km: s.km, sec: s.km * 370, rpe: 5 }); });
      return i.E.propose(st, '2026-12-03').filter((c: any) => c.cat === 'pace');
    });
    expect(cs[0]).toMatchObject({ key: 'easy-slow-2026-11-30', title: 'Corse facili 10 secondi al km più lente' });
    expect(cs[0].ops).toEqual([{ t: 'pace', z: 'easy', from: [360, 390], to: [370, 400] }, { t: 'pace', z: 'long', from: [365, 395], to: [375, 405] }]);
  });

  it('dopo un test: miglioramento limitato al 5%; peggioramento mediato col riferimento solo se il test era massimale', () => {
    const t = (sec: number, rpe: number | undefined) => both(i => { const st = mkState(i); logWorkout(i, st, { id: 't5', date: '2026-12-01', k: 'run', sub: 'test5', sid: 'bw03-q', km: 5, sec, rpe }); return i.E.propose(st, '2026-12-01').filter((c: any) => c.key === 'test-t5'); });
    const best = t(1200, 10)[0]; // 20:00: oltre il 5% di miglioramento
    expect((best.ops[0] as any).to.eq10).toBe(2822); expect(best.why[2]).toBe('Aggiornamento limitato al 5% per prudenza'); expect(best.src).toEqual({ wid: 't5' });
    const worse = t(1500, 9)[0]; // 25:00 a tutta
    expect((worse.ops[0] as any).to.eq10).toBe(3049); expect(worse.why[2]).toBe('Risultato più lento: faccio la media con il riferimento precedente, può essere stata una giornata storta');
    expect(worse.ops.slice(1)).toContainEqual({ t: 'pace', z: 'easy', from: [360, 390], to: [370, 400] });
    expect(t(1500, 6).length).toBe(0); // più lento ma non massimale: nessuna modifica
    expect(t(1425, 9).length).toBe(0); // entro la tolleranza: nessuna modifica
    expect(best.ops.some((o: any) => o.t === 'pace' && o.z === 'mp')).toBe(false); // il ritmo maratona non dipende dal test
  });

  it('quarta corsa: introdotta se tutti i criteri sono rispettati, altrimenti rinviata di due settimane', () => {
    const ok = both(i => { const st = mkState(i); runAll(i, st, '2026-11-16', '2026-12-31'); return { cr: i.E.run4Criteria(st, '2027-01-01'), c: i.E.propose(st, '2027-01-01').filter((c: any) => /^run4/.test(c.key)) }; });
    expect(ok.cr).toEqual({ list: [
      { label: 'Costanza ≥ 85% (4 settimane)', met: true, detail: '100%' }, { label: 'Media ≥ 28 km a settimana', met: true, detail: '34 km' },
      { label: 'Nessun dolore (21 giorni)', met: true, detail: 'nessuno' }, { label: 'RPE delle corse facili ≤ 4', met: true, detail: '3,0' }], ok: true });
    expect(ok.c[0]).toMatchObject({ key: 'run4-2027-01-04', title: 'Introdurre la quarta corsa settimanale', cat: 'plan', status: 'pending' });
    expect(ok.c[0].ops.length).toBe(13); expect(ok.c[0].ops[0]).toMatchObject({ id: 'bw08-x', from: { cond: 'run4' }, to: { cond: null }, a: 'Corsa facile 5 km', b: 'Corsa facile 5 km confermata' });
    const no = both(i => { const st = mkState(i); runAll(i, st, '2026-11-16', '2026-12-31', { kmFactor: 0.7 }); st.workouts[st.workouts.length - 1].pain = { lvl: 2, area: 'tibia' }; return i.E.propose(st, '2027-01-01').filter((c: any) => /^run4/.test(c.key)); });
    expect(no[0]).toMatchObject({ key: 'run4-2027-01-04', title: 'Rinviare la quarta corsa di due settimane' });
    expect(labels(no[0])).toEqual(['ven 8 gen: Corsa facile 5 km → Nuoto o riposo', 'ven 15 gen: Corsa facile 5 km → Nuoto o riposo']);
    expect(no[0].why).toContain('No · Nessun dolore (21 giorni) (segnalato)'); expect(no[0].impact).toMatch(/scende di circa 10 km/);
    expect(both(i => i.E.propose(mkState(i), '2026-12-28')).some((c: any) => /^run4/.test(c.key))).toBe(false); // a più di 10 giorni non si valuta ancora
  });

  it('lungo da 35 km: confermato solo con tutti i criteri; altrimenti 32 km (o 30 se manca un lungo da 28)', () => {
    const ok = both(i => { const st = mkState(i); runAll(i, st, '2026-11-16', '2027-03-14'); return { cr: i.E.long35Criteria(st, '2027-03-15'), c: i.E.propose(st, '2027-03-15').filter((c: any) => c.key === 'long35-check') }; });
    expect(ok.cr.list.map((c: any) => [c.met, c.detail])).toEqual([[true, '55 km'], [true, '32 km · dom 14 mar'], [true, 'sì'], [true, '100%'], [true, 'nessuno'], [true, '3 h 42 (stima)']]);
    expect(ok.c[0]).toMatchObject({ title: 'Confermare il lungo da 35 km', cat: 'plan' }); expect(ok.c[0].ops[0]).toMatchObject({ id: 'bw19-long', to: { cond: null }, b: 'Lungo 35 km confermato' });
    const no32 = both(i => { const st = mkState(i); runAll(i, st, '2026-11-16', '2027-03-14', { skipCond: true }); return i.E.propose(st, '2027-03-15').filter((c: any) => c.key === 'long35-check'); });
    expect(no32[0].title).toBe('Fermare il lungo massimo a 32 km'); expect(labels(no32[0])).toEqual(['dom 28 mar: Lungo 35 km → Lungo 32 km']); expect(no32[0].why[0]).toBe('No · ≥ 52 km a settimana (49 km)');
    const no30 = both(i => i.E.propose(mkState(i), '2027-03-15').filter((c: any) => c.key === 'long35-check'));
    expect(no30[0].title).toBe('Fermare il lungo massimo a 30 km'); expect(no30[0].ops[0]).toMatchObject({ to: { km: 30, cond: null } });
    expect(both(i => i.E.propose(mkState(i), '2027-03-13')).some((c: any) => c.key === 'long35-check')).toBe(false); // a più di 14 giorni non si decide
  });

  it('lungo da 35 km: il recupero dopo il lungo da 30 conta (dolore nei 3 giorni successivi, RPE oltre 7, corsa successiva saltata)', () => {
    const rec = (mut: (st: any, i: Impl) => void) => both(i => { const st = mkState(i); runAll(i, st, '2026-11-16', '2027-03-14'); mut(st, i); return i.E.long35Criteria(st, '2027-03-17').list[2]; });
    expect(rec(() => { })).toMatchObject({ met: true, detail: 'sì' });
    expect(rec(st => { st.checkins.push({ id: 'p', date: '2027-03-16', pain: { lvl: 2, area: 'ginocchio' } }); })).toMatchObject({ met: false, detail: 'no' });
    expect(rec(st => { st.workouts.find((w: any) => w.km === 32).rpe = 8; })).toMatchObject({ met: false });
    expect(rec((st, i) => { i.E.sessionById(st, 'bw18-q').st = 'skipped'; })).toMatchObject({ met: false });
  });

  it('obiettivo: rivalutato dopo il test dei 10 km o della mezza, mai con confidenza bassa', () => {
    const goal = (eq: number) => both(i => {
      const st = mkState(i); st.core.ref = { dist: 10, sec: eq, date: '2026-11-10', source: 'dichiarato', eq10: eq }; st.core.paces = i.P.pacesFromRef(eq, 14400);
      runAll(i, st, '2026-11-16', '2027-01-30'); logWorkout(i, st, { id: 't10', date: '2027-01-31', k: 'run', sub: 'test10', sid: 'bw11-long', km: 10, sec: eq, rpe: 9 });
      return i.E.propose(st, '2027-01-31').filter((c: any) => c.cat === 'goal');
    });
    const down = goal(3150);
    expect(down[0]).toMatchObject({ key: 'goal-test-t10', kind: 'proposal', status: 'pending', title: 'Rivedere l’obiettivo a 4:20:00' });
    expect(down[0].ops).toEqual([{ t: 'goal', from: 14400, to: 15600 }, { t: 'pace', z: 'mp', from: [335, 340], to: [365, 370] }]);
    const up = goal(2600);
    expect(up[0]).toMatchObject({ title: 'Obiettivo più ambizioso: 3:55:00' }); expect(up[0].ops[0]).toEqual({ t: 'goal', from: 14400, to: 14100 }); expect(up[0].impact).toMatch(/Proposta facoltativa/);
    expect(goal(2970).length).toBe(0); // stima vicina all'obiettivo: nessuna proposta
    const early = both(i => { const st = mkState(i); st.core.ref = { dist: 10, sec: 3300, date: '2026-11-10', source: 'dichiarato', eq10: 3300 }; runAll(i, st, '2026-11-16', '2026-12-13'); return i.E.propose(st, '2026-12-14').filter((c: any) => c.cat === 'goal'); });
    expect(early.length).toBe(0); // settimana 5, 4 settimane concluse, nessun test: confidenza bassa
  });

  it('obiettivo: anche ogni 4 settimane (settimane 5, 9, 13…), quando la confidenza lo consente', () => {
    const r = both(i => {
      const st = mkState(i); st.core.ref = { dist: 10, sec: 3300, date: '2026-11-10', source: 'dichiarato', eq10: 3300 }; runAll(i, st, '2026-11-16', '2027-01-24'); // fino alla vigilia della settimana del test dei 10 km
      return { wk12: i.E.propose(st, '2027-02-01').filter((c: any) => c.cat === 'goal').length, wk13: i.E.propose(st, '2027-02-08').filter((c: any) => c.cat === 'goal').map((c: any) => c.key) };
    });
    expect(r.wk12).toBe(0); expect(r.wk13).toEqual(['goal-wk13']);
  });

  it('la stessa proposta non viene ripetuta', () => {
    const r = both(i => { const st = mkState(i); st.checkins.push({ id: 'c1', date: '2026-11-18', pain: { lvl: 2, area: 'ginocchio' } }); const a = i.E.propose(st, '2026-11-18'); st.changes.push(...a); return [a.length, i.E.propose(st, '2026-11-18').length]; });
    expect(r).toEqual([1, 0]);
  });
});

// ───────────────────────────── 7. Modifiche ─────────────────────────────
describe('modifiche: valore precedente, valore nuovo, applica e annulla', () => {
  const st0 = (): State => mkState(TS);

  it('una modifica a una sessione conserva i valori originali e si annulla senza lasciare tracce', () => {
    const st = st0(), s = E.sessionById(st, 'bw02-q')!, snap = JSON.stringify(st.plan.sessions);
    const op = E.sop(s, { s: 'easy', km: 5, x: null });
    expect(op).toEqual({ t: 's', id: 'bw02-q', from: { s: 'hills', km: 7, x: { reps: 6, sec: 30 } }, to: { s: 'easy', km: 5, x: null }, label: 'mar 24 nov', a: 'Salite 7 km', b: 'Corsa facile 5 km' });
    const c = E.mk('prova', '2026-11-20', { title: 'Prova', ops: [op] });
    expect(E.applyOps(st, c, 'apply', '2026-11-20')).toEqual({ plan: 1 });
    expect(s).toMatchObject({ s: 'easy', km: 5, mod: 'coach', orig: { k: 'run', s: 'hills', km: 7, d: '2026-11-24' } }); expect(s.x).toBeUndefined();
    E.applyOps(st, c, 'undo', '2026-11-20');
    expect(s.orig).toBeUndefined(); expect(s.mod).toBeUndefined(); expect(JSON.stringify(st.plan.sessions)).toBe(snap);
  });

  it('le modifiche manuali sono marcate come tue; confermare una sessione condizionale non la marca come modificata', () => {
    const st = st0(), s = E.sessionById(st, 'bw02-e')!;
    E.applyOps(st, E.mk('m', '2026-11-20', { title: 'M', kind: 'manual', ops: [E.sop(s, { d: '2026-11-27' })] }), 'apply', '2026-11-20');
    expect(s.mod).toBe('user'); expect(s.orig!.d).toBe('2026-11-26');
    const x = E.sessionById(st, 'bw08-x')!;
    E.applyOps(st, E.mk('c', '2026-11-20', { title: 'C', ops: [E.sop(x, { cond: null })] }), 'apply', '2026-11-20');
    expect(x.cond).toBeUndefined(); expect(x.mod).toBeUndefined(); expect(x.orig).toBeUndefined();
  });

  it('ritmi, obiettivo e riferimento: ogni cambio finisce nello storico con il valore precedente', () => {
    const st = st0(), ref0 = st.core.ref;
    const c = E.mk('k', '2026-12-01', { title: 'K', ops: [{ t: 'pace', z: 'easy', from: [360, 390], to: [350, 380] }, { t: 'goal', from: 14400, to: 14100 }, { t: 'ref', from: ref0, to: { dist: 5, sec: 1385, date: '2026-12-01', source: 'test', eq10: 2888 } }] });
    expect(E.applyOps(st, c, 'apply', '2026-12-01')).toEqual({ core: 1 });
    expect(st.core.paces.easy).toEqual([350, 380]); expect(st.core.goal.sec).toBe(14100); expect(st.core.ref.source).toBe('test');
    expect(st.core.paceHistory).toEqual([{ date: '2026-12-01', z: 'easy', from: [360, 390], to: [350, 380], cid: 'k', undo: false }]);
    expect(st.core.goal.history).toEqual([{ date: '2026-12-01', sec: 14100, from: 14400, by: 'coach', cid: 'k' }]);
    E.applyOps(st, c, 'undo', '2026-12-02');
    expect(st.core.paces.easy).toEqual([360, 390]); expect(st.core.goal.sec).toBe(14400); expect(st.core.ref).toEqual(ref0);
    expect(st.core.paceHistory![1]).toEqual({ date: '2026-12-02', z: 'easy', from: [350, 380], to: [360, 390], cid: 'k', undo: true });
    expect(st.core.goal.history![1]).toMatchObject({ sec: 14400, from: 14100 });
  });

  it('ogni proposta porta motivo e impatto, e un identificativo stabile', () => {
    const c = E.mk('painrep-tendine d’Achille-2026-11-23', '2026-11-23', { title: 'T' });
    expect(c).toMatchObject({ id: 'painrep-tendine-d-Achille-2026-11-23', key: 'painrep-tendine d’Achille-2026-11-23', date: '2026-11-23', kind: 'proposal', status: 'pending', cat: 'session', ops: [], why: [], impact: '', at: '2026-11-11T09:00:00.000Z' });
  });
});

// ───────────────────────────── stato, carico e avvisi ─────────────────────────────
describe('stato della preparazione, carico e avvisi', () => {
  it('preparazione: avvio, in linea, leggero ritardo, in ritardo, da monitorare', () => {
    const s = (f: number | null, day: string, pain = false) => both(i => { const st = mkState(i); if (f != null) runAll(i, st, '2026-11-16', '2026-12-13', { kmFactor: f }); if (pain) st.checkins.push({ id: 'p', date: day, pain: { lvl: 2 } }); return i.E.prepStatus(st, day).label; });
    expect(s(null, '2026-11-17')).toBe('Avvio'); expect(s(1, '2026-12-14')).toBe('In linea'); expect(s(0.8, '2026-12-14')).toBe('Leggero ritardo'); expect(s(0.5, '2026-12-14')).toBe('In ritardo'); expect(s(1, '2026-12-14', true)).toBe('Da monitorare');
  });

  it('carico recente su abituale: serve uno storico di almeno 20 giorni; la fatica segnalata alza il livello', () => {
    const r = both(i => {
      const st = mkState(i), out: any[] = [i.E.fatigueStatus(st, '2026-11-17').label];
      runAll(i, st, '2026-11-16', '2026-12-13'); out.push(i.E.acwrAt(st, '2026-11-30').r, i.E.fatigueStatus(st, '2026-12-13').label);
      st.checkins.push({ id: 'f', date: '2026-12-13', fatigue: 5 }, { id: 'g', date: '2026-12-12', fatigue: 4 }); out.push(i.E.fatigueStatus(st, '2026-12-13').label);
      return out;
    });
    expect(r[0]).toBe('Dati insufficienti'); expect(r[1]).toBeNull(); expect(r[2]).toBe('Equilibrato'); expect(r[3]).toBe('Sovraccarico');
  });

  it('avvisi: dolore recente, corse da confermare, test in arrivo, corse facili troppo veloci', () => {
    const a = both(i => { const st = mkState(i); st.checkins.push({ id: 'p', date: '2026-11-29', pain: { lvl: 2, area: 'ginocchio' } }); return i.E.alerts(st, '2026-11-30'); });
    expect(a).toEqual([
      { lvl: 'crit', text: 'Dolore moderato (ginocchio): niente intensità. Se dura 48–72 ore, fatti valutare.' },
      { lvl: 'info', text: '6 corse da confermare', act: 'stale', ids: ['bw01-q', 'bw01-e', 'bw01-long', 'bw02-q', 'bw02-e', 'bw02-long'] },
      { lvl: 'info', text: 'Test 5 km mar 1 dic' }
    ]);
    const fast = both(i => { const st = mkState(i); ['bw01-q', 'bw01-e', 'bw02-e'].forEach((sid, n) => { const s = i.E.sessionById(st, sid); logWorkout(i, st, { id: 'f' + n, date: s.d, k: 'run', sub: 'easy', sid, km: s.km, sec: s.km * 330, rpe: 6 }); }); return i.E.alerts(st, '2026-11-26').map((x: any) => x.text); });
    expect(fast).toContain('Corse facili troppo veloci: rallenta');
  });

  it('costanza: quota di corse fatte tra quelle previste, escluse le condizionali', () => {
    const r = both(i => { const st = mkState(i); runAll(i, st, '2026-11-16', '2026-11-29'); i.E.sessionById(st, 'bw02-long').st = 'skipped'; return [i.E.adherence(st, '2026-11-30', 28), i.E.adherence(st, '2026-11-18', 28)]; });
    expect(r[0]).toBeCloseTo(5 / 6, 9); expect(r[1]).toBeNull(); // meno di 4 corse previste: non valutabile
  });
});
