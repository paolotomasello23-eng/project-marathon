/* Recupero delle sessioni saltate: i casi A–I di reference/test/recovery.js, stessi input e stessi risultati. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as P from '../../src/domain/plan';
import * as E from '../../src/domain/engine';
import type { Change, Session, State } from '../../src/domain/types';
import { both, mkState, skip as skipOn, sortPlan, TS } from './helpers';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-11T09:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

const mk = (): State => mkState(TS);
const S = (st: State, id: string): Session => E.sessionById(st, id)!;
const skip = (st: State, id: string, t: string, why?: string): { blocked?: string; c?: Change; opts?: string[] } => skipOn(TS, st, id, t, why);

describe('recupero di una corsa saltata (reference/test/recovery.js)', () => {
  it('A. corsa facile di martedì → mercoledì, forza leggera, stessi km in settimana; annulla riporta il piano identico', () => {
    const st = mk(), snap = JSON.stringify(st.plan.sessions);
    const r = skip(st, 'bw01-q', '2026-11-17');
    expect(S(st, 'bw01-q').d).toBe('2026-11-18'); expect(S(st, 'bw01-q').st).toBe('planned'); expect(S(st, 'bw01-q').rec!.from).toBe('2026-11-17'); expect(S(st, 'bw01-str').s).toBe('C');
    expect(E.weekOf(st, '2026-11-16', '2026-11-17').planKm).toBe(26);
    E.applyOps(st, r.c!, 'undo', '2026-11-17'); sortPlan(st); expect(S(st, 'bw01-q').st).toBe('skipped');
    S(st, 'bw01-q').st = 'planned'; delete S(st, 'bw01-q').why;
    expect(JSON.stringify(st.plan.sessions)).toBe(snap);
  });

  it('B. lungo di domenica → lunedì; la qualità del martedì diventa facile; il lungo successivo resta; il coach non taglia la settimana', () => {
    const st = mk(); skip(st, 'bw01-long', '2026-11-22');
    expect(S(st, 'bw01-long').d).toBe('2026-11-23'); expect(S(st, 'bw02-q').s).toBe('easy'); expect(S(st, 'bw02-long').km).toBe(16);
    expect(E.weekOf(st, '2026-11-23', '2026-11-23').wk).toBe(2); // numero di settimana corretto anche con una sessione spostata
    expect(E.propose(st, '2026-11-23').some(c => /Ridurre|Ripartire/.test(c.title))).toBe(false);
  });

  it('C. lungo saltato scoperto giovedì: nessun giorno adatto', () => {
    const st = mk(); expect(skip(st, 'bw01-long', '2026-11-26').blocked).toBe('none');
  });

  it('D. dolore e malattia: niente recupero', () => {
    let st = mk(); expect(skip(st, 'bw01-e', '2026-11-19', 'Dolore o fastidio').blocked).toMatch(/dolore/);
    st = mk(); expect(skip(st, 'bw01-e', '2026-11-19', 'Malattia').blocked).toBe('Con dolore o malattia non si recupera.');
  });

  it('E. terzo salto in 7 giorni: assorbito', () => {
    const st = mk(); skip(st, 'bw01-q', '2026-11-17'); skip(st, 'bw01-e', '2026-11-19');
    expect(skip(st, 'bw01-long', '2026-11-22').blocked).toMatch(/due recuperi/);
  });

  it('F. 32 km del picco → lunedì; la settimana non supera il picco del piano', () => {
    const st = mk(), L = st.plan.sessions.find(s => s.km === 32)!, peak = Math.max(...E.allWeeks(st, L.d).map(w => w.ph === 'race' ? 0 : w.planKm));
    const day = L.d; skip(st, L.id, day);
    const wk = E.weekOf(st, P.addDays(P.mondayOf(day), 7), day);
    expect(peak).toBe(63); expect(wk.planKm).toBe(63); // «RECOVERY_OK (settimana dopo il 32 km: 63 km, picco 63)»
    expect(wk.planKm).toBeLessThanOrEqual(peak + 0.5);
  });

  it('G. qualità con quarta corsa → mercoledì', () => {
    const st = mk(), Q = st.plan.sessions.find(s => s.d === '2027-01-12')!; skip(st, Q.id, Q.d);
    expect(S(st, Q.id).d).toBe('2027-01-13');
  });

  it('H. ultimi 10 giorni e gara', () => {
    const st = mk(), T = st.plan.sessions.find(s => s.d === '2027-04-20')!;
    expect(skip(st, T.id, '2027-04-20').blocked).toBe('Negli ultimi 10 giorni non si recupera.');
  });

  it('I. stessa sessione recuperata due volte, la terza no', () => {
    const st = mk(); skip(st, 'bw03-e', '2026-12-03'); const d1 = S(st, 'bw03-e').d; skip(st, 'bw03-e', d1); expect(S(st, 'bw03-e').rec!.n).toBe(2);
    st.plan.sessions.forEach(s => { if (s.rec && s.id !== 'bw03-e') delete s.rec; }); S(st, 'bw03-e').rec!.at = '2026-11-01';
    expect(skip(st, 'bw03-e', S(st, 'bw03-e').d).blocked).toMatch(/due volte/);
  });
});

describe('recupero: le regole una per una', () => {
  it('si recuperano solo le corse; gara e sgambata no', () => {
    const st = mk();
    expect(E.recoveryBlocked(st, S(st, 'bw01-str'), '2026-11-18', 'Impegni')).toBe('Si recuperano solo le corse.');
    expect(E.recoveryBlocked(st, S(st, 'bw23-long'), '2027-03-01', 'Impegni')).toBe('La gara non si recupera.');
    expect(E.recoveryBlocked(st, S(st, 'bw23-sat'), '2027-03-01', 'Impegni')).toBe('La gara non si recupera.');
    expect(E.recoveryBlocked(st, S(st, 'bw01-q'), '2026-11-17', 'Impegni')).toBeNull();
  });

  it('ultimi 10 giorni: bloccato a 10 giorni dalla gara, permesso a 11', () => {
    const st = mk(), s = S(st, 'bw21-e');
    expect(E.recoveryBlocked(st, s, '2027-04-14', '')).toBeNull();
    expect(E.recoveryBlocked(st, s, '2027-04-15', '')).toBe('Negli ultimi 10 giorni non si recupera.');
  });

  it('due corse già perse in 7 giorni: si riparte dal carico reale', () => {
    const st = mk(); S(st, 'bw01-q').st = 'skipped'; S(st, 'bw01-e').st = 'skipped';
    expect(E.recoveryBlocked(st, S(st, 'bw01-long'), '2026-11-22', 'Impegni')).toBe('Troppe corse saltate in 7 giorni: riparto dal carico reale.');
  });

  it('primo giorno adatto: mai un giorno con un’altra corsa; una facile evita la vigilia di un lungo ≥ 20 km se c’è alternativa', () => {
    const r = both(impl => {
      const st = mkState(impl), a = impl.E.recoveryOptions(st, impl.E.sessionById(st, 'bw01-e'), '2026-11-17');
      const b = impl.E.recoveryOptions(st, impl.E.sessionById(st, 'bw06-e'), '2026-12-24');
      return { a, b };
    });
    expect(r.a).toEqual(['2026-11-20', '2026-11-21', '2026-11-23', '2026-11-25']); // giovedì saltato: venerdì, sabato, poi i giorni liberi della settimana dopo
    expect(r.b[0]).toBe('2026-12-25'); expect(r.b).not.toContain('2026-12-26'); // sabato è la vigilia del lungo da 20 km
  });

  it('un lungo sta ad almeno tre giorni da un altro lungo o test e mai il giorno dopo una seduta impegnativa', () => {
    const r = both(impl => { const st = mkState(impl); return impl.E.recoveryOptions(st, impl.E.sessionById(st, 'bw01-long'), '2026-11-22'); });
    // lunedì 23 sì; mercoledì 25 no (martedì ci sono le salite); venerdì 27 e sabato 28 no (domenica 29 c'è il lungo)
    expect(r).toEqual(['2026-11-23']);
    // lungo del 29 novembre: martedì 1 dicembre c'è il test dei 5 km e domenica 6 un altro lungo → nessun giorno adatto
    expect(both(impl => { const st = mkState(impl); return impl.E.recoveryOptions(st, impl.E.sessionById(st, 'bw02-long'), '2026-11-29'); })).toEqual([]);
  });

  it('niente qualità il giorno dopo un recupero impegnativo: diventa facile all’80%, minimo 4 km', () => {
    const r = both(impl => { const st = mkState(impl); const x = skip_(impl, st, 'bw01-long', '2026-11-22'); return { c: x.c, q: impl.E.sessionById(st, 'bw02-q'), e: impl.E.sessionById(st, 'bw02-e') }; });
    // salite 7 km → facile 5,5 km (80%), poi il taglio del 30% per il carico della settimana: 4 km
    expect(r.q).toMatchObject({ s: 'easy', km: 4, d: '2026-11-24', mod: 'coach', orig: { k: 'run', s: 'hills', km: 7, d: '2026-11-24' } });
    expect(r.q.x).toBeUndefined();
    expect(r.e.km).toBe(4);
    expect(r.c.impact).toBe('Settimana di arrivo: 38 km (previsti 29).');
  });

  it('settimana di arrivo oltre il +15%: le corse facili scendono fino al 30%, mai sotto i 4 km', () => {
    const r = both(impl => {
      const st = mkState(impl), x = skip_(impl, st, 'bw05-long', '2026-12-20');
      return { impact: x.c.impact, ops: x.c.ops.map((o: any) => [o.id, o.to.km ?? null, o.to.s ?? null]), wk: impl.E.weekOf(st, '2026-12-21', '2026-12-20').planKm };
    });
    // 19 km spostati a lunedì 21: salite del martedì 8 → facile 6,5 → 4,5 (−30%); facile del giovedì 8 → 5,5 (−30%); lungo da 20 km invariato
    expect(r.ops).toEqual([['bw05-long', null, null], ['bw06-q', 4.5, 'easy'], ['bw06-e', 5.5, null]]);
    expect(r.impact).toBe('Settimana di arrivo: 49 km (previsti 36).');
    expect(r.wk).toBe(49);
  });

  it('il recupero è una modifica con valore precedente e nuovo, motivo e impatto', () => {
    const st = mk(), r = skip(st, 'bw01-q', '2026-11-17', 'Meteo'), c = r.c!;
    expect(c).toMatchObject({ id: 'recover-bw01-q-1-2026-11-18', kind: 'auto', cat: 'plan', rec: 1, day: '2026-11-18', title: 'Recupero: Corsa facile + allunghi 6 km → mer 18 nov', why: ['Saltata mar 17 nov · meteo'], impact: 'Settimana di arrivo: 26 km (previsti 26).' });
    expect(c.ops[0]).toMatchObject({ t: 's', id: 'bw01-q', force: 1, label: 'recupero', a: 'Corsa facile + allunghi 6 km · mar 17 nov', b: 'Corsa facile + allunghi 6 km · mer 18 nov', from: { d: '2026-11-17', st: 'skipped', why: 'Meteo', rec: null }, to: { d: '2026-11-18', st: 'planned', why: null, rec: { from: '2026-11-17', n: 1, at: '2026-11-17' } } });
    expect(c.ops[1]).toMatchObject({ t: 's', id: 'bw01-str', from: { s: 'A' }, to: { s: 'C' }, a: 'Forza generale', b: 'Forza leggera' });
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function skip_(impl: any, st: any, id: string, t: string): any { return skipOn(impl, st, id, t); }
