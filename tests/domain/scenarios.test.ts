/* Gli scenari di reference/test/logic.js: stessi input, valori attesi presi dall'uscita del codice originale. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as P from '../../src/domain/plan';
import * as E from '../../src/domain/engine';
import type { Change, Core, SOp, State, Workout } from '../../src/domain/types';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-11T13:33:04.574Z')); });
afterAll(() => { vi.useRealTimers(); });

const today = '2026-11-09', goal = 14400;
const PAIN_REC = 'Niente corsa finché fa male. Se dura oltre 48–72 ore o cambia l’appoggio: fisioterapista o medico.';

function fresh(): State {
  const paces = P.pacesFromRef(2970, goal);
  const core: Core = { profile: { name: 'Paolo', age: 22, baseKm: 15 }, race: { name: 'Maratona di Madrid', date: '2027-04-25' }, goal: { sec: goal, history: [] }, paces, paceHistory: [], ref: { dist: 10, sec: 2970, date: today, source: 'dichiarato' } };
  return { core, plan: { v: 1, sessions: P.generate({ raceDate: '2027-04-25', startDate: today }) }, workouts: [], checkins: [], changes: [] };
}
function log(st: State, w: Workout): Workout { const s = w.sid ? E.sessionById(st, w.sid) : null; w.eval = E.evaluate(w, s, st, w.date); st.workouts.push(w); if (s) { s.st = 'done'; s.wid = w.id; } return w; }
const opLines = (c: Change) => c.ops.map(o => { const s = o as SOp; return s.label + ': ' + s.a + ' → ' + s.b; });

describe('scenari di logic.js', () => {
  it('piano di 24 settimane dal 9 novembre', () => {
    const st = fresh(), ss = st.plan.sessions;
    expect(ss.length).toBe(168); expect(ss[0].d).toBe('2026-11-09'); expect(ss[ss.length - 1].d).toBe('2027-04-25'); expect(ss[ss.length - 1].s).toBe('race');
    expect(E.allWeeks(st, today).map(w => `W${w.wk} ${w.mon} ${w.ph}${w.down ? '↓' : ''} ${w.planKm}km L${w.longPlan}`)).toEqual([
      'W1 2026-11-09 base 23km L12', 'W2 2026-11-16 base 26km L14', 'W3 2026-11-23 base 29km L16', 'W4 2026-11-30 base↓ 25.5km L12',
      'W5 2026-12-07 base 32km L17', 'W6 2026-12-14 base 34km L19', 'W7 2026-12-21 base 36km L20', 'W8 2026-12-28 base↓ 27km L14',
      'W9 2027-01-04 build 41km L20', 'W10 2027-01-11 build 44km L22', 'W11 2027-01-18 build 48km L24', 'W12 2027-01-25 build↓ 30km L15',
      'W13 2027-02-01 build 51km L25', 'W14 2027-02-08 build 54km L27', 'W15 2027-02-15 spec 58km L29', 'W16 2027-02-22 spec↓ 39km L24',
      'W17 2027-03-01 spec↓ 46km L22', 'W18 2027-03-08 spec 62km L32', 'W19 2027-03-15 spec↓ 45km L22', 'W20 2027-03-22 spec 63km L35',
      'W21 2027-03-29 spec↓ 45km L22', 'W22 2027-04-05 taper↓ 40km L18', 'W23 2027-04-12 taper↓ 31km L12', 'W24 2027-04-19 race↓ 57.195km L42.195'
    ]);
    // logic.js stampa «plan bytes 19399» dopo aver segnato come fatte le tre corse della prima settimana (8 caratteri in più ciascuna)
    expect(JSON.stringify({ v: 1, sessions: ss }).length).toBe(19375);
    ['w01-q', 'w01-e', 'w01-long'].forEach((id, i) => { const x = E.sessionById(st, id)!; x.st = 'done'; x.wid = 'a' + (i + 1); });
    expect(JSON.stringify({ v: 1, sessions: ss }).length).toBe(19399);
  });

  it('ritmi dal riferimento di 49:30 sui 10 km e obiettivo 4:00', () => {
    const paces = P.pacesFromRef(2970, goal);
    expect(Object.fromEntries(Object.entries(paces).map(([k, v]) => [k, P.range(v)]))).toEqual({ easy: '6:00–6:30/km', long: '6:05–6:35/km', mp: '5:35–5:40/km', hm: '5:15–5:20/km', tempo: '5:00–5:10/km', interval: '4:40–4:50/km' });
  });

  it('stima iniziale della maratona', () => {
    const pr = E.predict(fresh(), today);
    expect({ now: P.fmtTime(pr.now), plan: P.fmtTime(pr.plan), low: P.fmtTime(pr.low), high: P.fmtTime(pr.high), conf: pr.conf, level: pr.levelLabel, needPct: pr.needPct.toFixed(3), volPlan: pr.volPlan.toFixed(1) })
      .toEqual({ now: '4:21:54', plan: '4:07:05', low: '3:56:02', high: '4:20:31', conf: 'bassa', level: 'Ambizioso', needPct: '0.029', volPlan: '43.9' });
    expect(Object.fromEntries(Object.entries(pr.rec).map(([k, v]) => [k, P.fmtTime(v)]))).toEqual({ amb: '3:55:00', real: '4:05:00', cons: '4:25:00' });
    expect(Object.fromEntries(Object.entries(pr.need).map(([k, v]) => [k, P.fmtTime(v)]))).toEqual({ k10: '48:05', k5: '23:04', hm: '1:46:05' });
    expect(pr.used).toEqual([
      'Riferimento: 10 km in 49:30 (dato dichiarato, non un test massimale)',
      'Volume recente: 15 km a settimana (valore di partenza dichiarato)',
      'Volume atteso nelle 12 settimane prima dello scarico: 44 km a settimana (ipotesi: 90% del piano completato)',
      'Percorso di Madrid: circa 400 m di salita, +2,5% sul tempo (stima)',
      'Corsa più lunga registrata: nessuna ancora'
    ]);
    expect(pr.pos).toEqual(['24 settimane a disposizione: c’è tempo per costruire volume e velocità.']);
    expect(pr.neg).toEqual([
      'Nessun test ancora: la stima si basa su un dato dichiarato.',
      'Volume attuale basso per una maratona (15 km a settimana): è il fattore che pesa di più sulla stima.',
      'Percorso mosso con finale in salita e possibile caldo di fine aprile.'
    ]);
    expect(pr.tests.map(t => t.title + ' ' + t.d + ' ' + P.fmtTime(t.thr))).toEqual(['Test 5 km 2026-12-01 23:04', 'Test 10 km 2027-01-31 48:05', 'Test mezza maratona 2027-02-28 1:46:05']);
  });

  it('descrizione delle sessioni', () => {
    const st = fresh(), paces = st.core.paces;
    const FUEL_GEN = 'Prova generale di gara: 60 g di carboidrati l’ora (un gel ogni 25–30 minuti), 400–700 ml di liquidi l’ora con elettroliti, stessa colazione e stessi prodotti che userai a Madrid.';
    const rows: [string, string, string, number | null, string, string | null, string | null, string | null, string | null, string | null][] = [
      ['w01-q', '2026-11-10', 'Corsa facile', 6, '38 min', '6:00–6:30/km', 'RPE 2–4, conversazionale', null, 'Libero, meglio pianeggiante.', null],
      ['w03-q', '2026-11-24', 'Salite', 7, '42 min', 'A sensazione', 'RPE 7–8 in salita', '15′ facili · 6 × 30″ in salita (5–7%), recupero in discesa · 10′ facili', 'Circa 30–40 m nelle ripetute, su una salita al 4–7%.', null],
      ['w06-q', '2026-12-15', 'Ritmo soglia', 8, '48 min', '5:00–5:10/km', 'RPE 6–7, “comodamente duro”', '15′ facili · 2 × 8′ a soglia, recupero 3′ · 10′ facili', 'Pianeggiante o leggermente mosso.', null],
      ['w14-long', '2027-02-14', 'Lungo', 27, '2 h 51', '6:05–6:35/km', 'RPE 3–5', 'Finale in salita.', '160–240 m: percorso mosso, simile a Madrid (circa 9–10 m per km).', FUEL_GEN],
      ['w18-long', '2027-03-14', 'Lungo', 32, '3 h 23', '6:05–6:35/km', 'RPE 3–5, può salire a 6 nel finale', 'Ultimi 5 km in progressione.', '260–320 m: percorso mosso, simile a Madrid (circa 9–10 m per km).', FUEL_GEN],
      ['w20-long', '2027-03-28', 'Lungo', 35, '3 h 42', '6:05–6:35/km', 'RPE 3–5, può salire a 6 nel finale', 'Da confermare: altrimenti 32 km.', '280–350 m: percorso mosso, simile a Madrid (circa 9–10 m per km).', FUEL_GEN],
      ['w16-long', '2027-02-28', 'Test mezza maratona', 24, '2 h 10', '5:15–5:20/km', 'RPE 8–9', '2 km facili · 21,1 km a ritmo mezza · 1 km al passo', 'Il più piatto possibile, per un tempo confrontabile.', 'Gel ai km 6, 12 e 17 con acqua. Colazione di gara 3 ore prima.'],
      ['w24-long', '2027-04-25', 'Maratona di Madrid', 42.195, '4 h 00', '5:35–5:40/km', 'Sforzo regolare: RPE 5–6 fino al km 30', 'Km 0–3 in salita: 5–10″/km più lento. Discesa fino al km 7: lascia correre. Dal km 37 conta lo sforzo, non il ritmo.', 'Circa 400 m di salita totale, concentrati nel finale.', 'Colazione 3 ore prima (1–3 g di carboidrati per kg). Un gel ogni 25–30 minuti dal km 5, circa 60 g l’ora, acqua a ogni ristoro.'],
      ['w01-str', '2026-11-11', 'Forza generale', null, '50 min', null, 'RPE 6–7, mai a cedimento sulle gambe', 'Squat o goblet squat 3 × 8–10 · affondi indietro 3 × 8 per gamba · ponte glutei su una gamba 3 × 10 · calf raise a ginocchio teso 3 × 12 e a ginocchio piegato (soleo) 3 × 12 · plank 3 × 40 secondi e side plank 2 × 30 secondi · trazioni e piegamenti a piacere.', null, null],
      ['w10-x', '2027-01-15', 'Corsa facile', 5, '31 min', '6:00–6:30/km', 'RPE 2–4, conversazionale', null, 'Libero, meglio pianeggiante.', null],
      ['w24-sat', '2027-04-24', 'Sgambata pre-gara', 3, '19 min', '6:00–6:30/km', 'RPE 2, molto facile', '15–20′ lenti + 3 allunghi. Facoltativa.', 'Libero, meglio pianeggiante.', 'Carico di carboidrati in corso: 8–10 g per kg di peso nella giornata, poche fibre, acqua regolare.']
    ];
    for (const [id, date, title, km, dur, pace, intensity, structure, gain, fuel] of rows) {
      const s = E.sessionById(st, id)!, d = P.describe(s, paces, goal);
      expect([id, s.d, d.title, d.km, P.fmtDur(d.dur), d.pace, d.intensity, d.structure, d.gain, d.fuel]).toEqual([id, date, title, km, dur, pace, intensity, structure, gain, fuel]);
    }
  });

  it('prima settimana: tre analisi, una proposta per il dolore, applica e annulla', () => {
    const st = fresh();
    const w1 = log(st, { id: 'a1', date: '2026-11-10', k: 'run', sub: 'easy', sid: 'w01-q', km: 6, sec: 6 * 330, rpe: 6, hrAvg: 168, fatigue: 3 });
    expect(w1.eval!.rating).toBe('da rivedere');
    expect(w1.eval!.analysis).toEqual(['6 km · 33:00 · 5:30/km', 'Previsti 6 km: 100%', 'FC 168 bpm = 87% della max stimata', 'RPE 6 (atteso 2–4)']);
    expect(w1.eval!.good).toEqual(['Distanza centrata']);
    expect(w1.eval!.improve).toEqual(['Troppo veloce per una corsa facile (30 s/km): rallenta', 'FC sopra la zona facile', 'Sforzo molto sopra l’atteso']);
    expect(w1.eval!.recovery).toEqual(['Recupero normale.', 'Punta a 8 ore di sonno.']);
    expect(w1.eval!.next).toEqual(['gio 12 nov · Corsa facile + allunghi 5 km']);

    const w2 = log(st, { id: 'a2', date: '2026-11-12', k: 'run', sub: 'easy', sid: 'w01-e', km: 5, sec: 5 * 372, rpe: 3, hrAvg: 142, up: 40 });
    expect(w2.eval!.rating).toBe('ottimo');
    expect(w2.eval!.analysis).toEqual(['5 km · 31:00 · 6:12/km', 'Previsti 5 km: 100%', '+40 m: in piano ≈ 6:09/km (stima)', 'FC 142 bpm = 74% della max stimata', 'RPE 3 (atteso 2–4)', 'Rispetto alle simili: ritmo +39 s/km, FC −26 bpm, RPE −3']);
    expect(w2.eval!.good).toEqual(['Distanza centrata', 'Ritmo nell’intervallo', 'FC in zona facile', 'Sforzo coerente']);
    expect(w2.eval!.improve).toEqual([]);

    const w3 = log(st, { id: 'a3', date: '2026-11-15', k: 'run', sub: 'long', sid: 'w01-long', km: 12, sec: 12 * 380, rpe: 4, gels: 1, waterMl: 300, pain: { lvl: 2, area: 'ginocchio' } });
    expect(w3.eval!.rating).toBe('attenzione');
    expect(w3.eval!.analysis).toEqual(['12 km · 1:16:00 · 6:20/km', 'Previsti 12 km: 100%', 'RPE 4 (atteso 3–5)', 'Dolore moderato · ginocchio']);
    expect(w3.eval!.improve).toEqual(['Dolore: niente intensità']);
    expect(w3.eval!.recovery).toEqual([PAIN_REC, 'Domani riposo o mobilità.']);

    const props = E.propose(st, '2026-11-15');
    expect(props).toEqual([{
      id: 'pain2-2026-11-15', key: 'pain2-2026-11-15', date: '2026-11-15', at: '2026-11-11T13:33:04.574Z', kind: 'proposal', status: 'pending', cat: 'alert',
      ops: [{ t: 's', id: 'w02-q', from: { s: 'easy', km: 6, x: { strides: 6 }, title: null }, to: { s: 'easy', km: 4, x: null, title: null }, label: 'mar 17 nov', a: 'Corsa facile + allunghi 6 km', b: 'Corsa facile 4 km' }],
      why: ['Dolore moderato (ginocchio) il dom 15 nov'],
      impact: 'Solo i prossimi 5 giorni. Se il dolore torna o non passa in 48–72 ore, fermati e fatti valutare.',
      title: 'Alleggerire le prossime corse per il dolore segnalato'
    }]);

    const before = JSON.stringify(st.plan.sessions);
    props.forEach(c => E.applyOps(st, c, 'apply', '2026-11-15'));
    expect(JSON.stringify(E.sessionById(st, 'w02-q'))).toBe('{"id":"w02-q","d":"2026-11-17","wk":2,"ph":"base","slot":"q","k":"run","s":"easy","km":4,"st":"planned","orig":{"k":"run","s":"easy","km":6,"d":"2026-11-17"},"mod":"coach"}');
    props.forEach(c => E.applyOps(st, c, 'undo', '2026-11-15'));
    expect(JSON.stringify(st.plan.sessions)).toBe(before);
  });

  it('settimana 2 saltata: si riparte dal carico reale; poi test dei 5 km, criteri e stato', () => {
    const st = fresh();
    ['2026-11-10', '2026-11-12', '2026-11-15'].forEach((d, i) => log(st, { id: 'b' + i, date: d, k: 'run', sub: i === 2 ? 'long' : 'easy', sid: ['w01-q', 'w01-e', 'w01-long'][i], km: [6, 5, 12][i], sec: [6, 5, 12][i] * 375, rpe: 3 }));
    st.plan.sessions.filter(s => s.wk === 2 && s.k === 'run').forEach(s => { s.st = 'skipped'; });

    const cap = E.propose(st, '2026-11-23');
    expect(cap.map(c => ({ t: c.title, why: c.why, ops: opLines(c) }))).toEqual([{
      t: 'Ripartire dal carico reale: settimana 3 a circa 22 km',
      why: ['Km registrati nelle ultime settimane (dalla più recente): 0, 23', 'Programmati per la settimana 3: 29 km', 'Dopo una settimana quasi ferma riparto dal 95% del carico più alto delle ultime settimane: 22 km'],
      ops: ['mar 24 nov: Salite 7 km → Corsa facile 5,5 km', 'gio 26 nov: Corsa facile 6 km → Corsa facile 4,5 km', 'dom 29 nov: Lungo 16 km → Lungo 12 km']
    }]);

    log(st, { id: 't5', date: '2026-12-01', k: 'run', sub: 'test5', sid: 'w04-q', km: 5, sec: 23 * 60 + 5, rpe: 9 });
    const pace = E.propose(st, '2026-12-01').filter(c => c.cat === 'pace');
    expect(pace.length).toBe(1);
    expect(pace[0].title).toBe('Aggiornare i ritmi dopo il test 5 km');
    expect(pace[0].why).toEqual(['5 km in 23:05, RPE 9', 'Equivalente sui 10 km: 48:08 contro 49:30 del riferimento (−3%)', 'Uso il risultato del test come nuovo riferimento']);
    expect(pace[0].ops).toEqual([
      { t: 'ref', from: { dist: 10, sec: 2970, date: '2026-11-09', source: 'dichiarato' }, to: { dist: 5, sec: 1385, date: '2026-12-01', source: 'test', rpe: 9, eq10: 2888, wid: 't5' } },
      { t: 'pace', z: 'easy', from: [360, 390], to: [350, 380] },
      { t: 'pace', z: 'long', from: [365, 395], to: [355, 385] },
      { t: 'pace', z: 'hm', from: [315, 320], to: [305, 310] },
      { t: 'pace', z: 'tempo', from: [300, 310], to: [290, 300] },
      { t: 'pace', z: 'interval', from: [280, 290], to: [270, 280] }
    ]);

    expect(E.run4Criteria(st, '2026-12-30')).toEqual({ list: [
      { label: 'Costanza ≥ 85% (4 settimane)', met: false, detail: '0%' },
      { label: 'Media ≥ 28 km a settimana', met: false, detail: '0 km' },
      { label: 'Nessun dolore (21 giorni)', met: true, detail: 'nessuno' },
      { label: 'RPE delle corse facili ≤ 4', met: null, detail: 'senza dati' }
    ], ok: false });
    expect(E.long35Criteria(st, '2027-03-15').list.map(c => [c.met, c.detail])).toEqual([[false, '0 km'], [false, 'finora 12 km'], [null, 'da verificare'], [false, '0%'], [true, 'nessuno'], [true, '3 h 42 (stima)']]);
    expect(E.prepStatus(st, '2026-12-01')).toEqual({ label: 'In ritardo', tone: 'crit', text: 'Solo 29% dei km programmati: il piano va riallineato al carico reale.' });
    expect(E.fatigueStatus(st, '2026-12-01').label).toBe('Equilibrato');
    expect(E.alerts(st, '2026-12-01')).toEqual([{ lvl: 'info', text: '3 corse da confermare', act: 'stale', ids: ['w03-q', 'w03-e', 'w03-long'] }]);
  });
});
