/* Fase 5: calendario .ics, promemoria, cambio della data di gara. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import backup from '../../reference/data/backup.json';
import * as P from '../../src/domain/plan';
import * as E from '../../src/domain/engine';
import type { PlanVersion } from '../../src/domain/types';
import { Actions } from '../../src/data/actions';
import { MMDb } from '../../src/data/db';
import { Store } from '../../src/data/store';
import { icsFold, icsText, planIcs } from '../../src/lib/ics';
import { reminderFor, reminderSchedule } from '../../src/lib/reminders';
import { toWorkoutDraft } from '../../src/ext/activityImport';
import { aiCoach, aiPrompt, registerAiCoach } from '../../src/ext/aiCoach';

let clock = '2026-11-17', seq = 0;
const at = (day: string) => { clock = day; vi.setSystemTime(new Date(day + 'T08:00:00+01:00')); };
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); at('2026-11-17'); });
afterAll(() => { vi.useRealTimers(); });
async function fresh(): Promise<{ app: Actions; store: Store }> {
  const store = new Store(new MMDb('extra-' + (++seq)), null), app = new Actions(store, () => clock);
  await store.load(); app.importObject(backup); await store.idle();
  return { app, store };
}
const run = (app: Actions, sid: string) => { const s = app.session(sid)!; return app.saveWorkout({ date: s.d, k: 'run', sub: s.s, sid, km: s.km as number, sec: Math.round((s.km as number) * 375), rpe: 3 }); };

describe('calendario esterno (.ics)', () => {
  it('un evento di giornata intera per ogni sessione non di riposo, con ritmo e schema nella descrizione', async () => {
    at('2026-11-17');
    const { app, store } = await fresh();
    const ics = planIcs(store.S.plan!.sessions, s => app.describe(s), new Date('2026-11-17T07:00:00Z'), 'Maratona di Madrid');
    const lines = ics.replace(/\r\n /g, '').split('\r\n');
    expect(lines.slice(0, 6)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Madrid 27//Piano di allenamento//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Maratona di Madrid']);
    expect(lines[lines.length - 2]).toBe('END:VCALENDAR'); expect(ics.endsWith('\r\n')).toBe(true); expect(/[^\r]\n/.test(ics)).toBe(false); // solo a capo CRLF
    const n = store.S.plan!.sessions.filter(s => s.k !== 'rest').length;
    expect(lines.filter(l => l === 'BEGIN:VEVENT').length).toBe(n); expect(n).toBe(161 - 26); // senza i riposi: 22 sabati, il lunedì di gara e i 3 venerdì prima di test dei 10 km, mezza e gara
    const i = lines.indexOf('UID:bw01-q@madrid27');
    expect(lines.slice(i - 1, i + 9)).toEqual(['BEGIN:VEVENT', 'UID:bw01-q@madrid27', 'DTSTAMP:20261117T070000Z', 'DTSTART;VALUE=DATE:20261117', 'DTEND;VALUE=DATE:20261118', 'SUMMARY:Corsa facile + allunghi 6 km',
      'DESCRIPTION:Ritmo: 6:00–6:30/km\\nSforzo: RPE 2–4\\, conversazionale\\nSchema: Nel finale 6 allunghi da 20″\\, recupero 60–90″.\\nDurata: 38 min\\nObiettivo: Costruire base aerobica senza accumulare fatica.',
      'CATEGORIES:Corsa', 'TRANSP:TRANSPARENT', 'END:VEVENT']);
    const r = lines.indexOf('UID:bw23-long@madrid27');
    expect(lines[r + 2]).toBe('DTSTART;VALUE=DATE:20270425'); expect(lines[r + 4]).toBe('SUMMARY:Maratona di Madrid 42\\,2 km');
  });

  it('le sessioni saltate non vengono esportate; quelle spostate escono nel giorno nuovo', async () => {
    at('2026-11-17');
    const { app, store } = await fresh();
    app.skipSession('bw01-e', 'Impegni', 'none'); app.moveSession('bw02-e', '2026-11-27');
    const ics = planIcs(store.S.plan!.sessions, s => app.describe(s), new Date()).replace(/\r\n /g, '');
    expect(ics).not.toContain('UID:bw01-e@madrid27');
    expect(ics).toContain('UID:bw02-e@madrid27\r\nDTSTAMP:20261117T070000Z\r\nDTSTART;VALUE=DATE:20261127');
  });

  it('righe mai oltre i 75 byte, anche con lettere accentate; il testo ripiegato si ricompone identico', async () => {
    const { app, store } = await fresh();
    const ics = planIcs(store.S.plan!.sessions, s => app.describe(s), new Date());
    const enc = new TextEncoder();
    for (const l of ics.split('\r\n')) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    const long = 'DESCRIPTION:' + 'è già così — più giù '.repeat(12);
    expect(icsFold(long).split('\r\n ').join('')).toBe(long); expect(icsFold(long).split('\r\n').every(l => enc.encode(l).length <= 75)).toBe(true);
    expect(icsFold('SUMMARY:Lungo 14 km')).toBe('SUMMARY:Lungo 14 km');
    expect(icsText('a;b,c\\d\ne')).toBe('a\;b\\,c\\\\d\\ne');
  });
});

describe('promemoria', () => {
  it('il promemoria del giorno è la sessione ancora da fare: prima la corsa, poi la forza, poi il resto', async () => {
    at('2026-11-17');
    const { app } = await fresh();
    expect(reminderFor(app, '2026-11-17')).toEqual({ d: '2026-11-17', title: 'Oggi: Corsa facile + allunghi', body: '6 km · 6:00–6:30/km · 38 min' });
    expect(reminderFor(app, '2026-11-18')).toEqual({ d: '2026-11-18', title: 'Oggi: Forza generale', body: '50 min' });
    expect(reminderFor(app, '2026-11-21')).toBeNull(); // sabato: riposo
    expect(reminderFor(app, '2026-11-10')).toBeNull(); // prima dell'inizio del piano
    run(app, 'bw01-q'); expect(reminderFor(app, '2026-11-17')).toBeNull(); // già fatta: nessun promemoria
    app.skipSession('bw01-e', 'Impegni', null); expect(reminderFor(app, '2026-11-19')).toBeNull();
    expect(app.sessionsOn('2026-11-20').map(s => s.k).sort()).toEqual(['run', 'swim']); expect(reminderFor(app, '2026-11-20')!.title).toBe('Oggi: Corsa facile'); // recuperata al venerdì: vince sul nuoto
  });

  it('elenco dei prossimi giorni per il service worker: segue le modifiche del piano', async () => {
    at('2026-11-17');
    const { app } = await fresh();
    expect(reminderSchedule(app, '2026-11-17', 7).map(r => r.d + ' ' + r.title)).toEqual(['2026-11-17 Oggi: Corsa facile + allunghi', '2026-11-18 Oggi: Forza generale', '2026-11-19 Oggi: Corsa facile', '2026-11-20 Oggi: Nuoto o riposo', '2026-11-22 Oggi: Lungo', '2026-11-23 Oggi: Mobilità']);
    app.moveSession('bw01-long', '2026-11-21');
    expect(reminderSchedule(app, '2026-11-21', 2).map(r => r.d + ' ' + r.title + ' | ' + r.body)).toEqual(['2026-11-21 Oggi: Lungo | 14 km · 6:05–6:35/km · 1 h 29']);
  });
});

describe('cambio della data di gara', () => {
  it('gara due settimane dopo: le sessioni future si riallineano, quelle fatte restano, il piano precedente è salvato', async () => {
    at('2026-11-17');
    const { app, store } = await fresh(), w = run(app, 'bw01-q'), before = JSON.stringify(store.S.plan!.sessions), v0 = store.S.plan!.v;
    const c = app.changeRaceDate('2027-05-09')!;
    expect(store.S.core!.race.date).toBe('2027-05-09');
    expect(c).toMatchObject({ kind: 'manual', status: 'applied', cat: 'plan', title: 'Gara spostata al 9 maggio 2027', why: ['Modifica inserita da te'] });
    expect(c.ops[0]).toEqual({ t: 'race', from: '2027-04-25', to: '2027-05-09' });
    const ss = store.S.plan!.sessions, last = ss[ss.length - 1];
    expect(last).toMatchObject({ d: '2027-05-09', s: 'race', km: 42.195, wk: 25 }); expect(E.planMondays({ plan: store.S.plan! }).length).toBe(25);
    expect(ss.filter(s => s.k === 'run' && s.s === 'race').length).toBe(1);
    // passato e fatto: intatti
    expect(ss.filter(s => s.d <= '2026-11-17').map(s => s.id)).toEqual(['bw01-mon', 'bw01-q']); expect(app.session('bw01-q')).toMatchObject({ st: 'done', wid: w.id });
    // lo schema è allineato all'indietro dalla nuova data: il lungo da 35 km resta a quattro settimane dalla gara, i test si spostano di conseguenza
    expect(ss.filter(s => s.cond === 'long35').map(s => s.d)).toEqual(['2027-04-11']);
    expect(ss.filter(s => /^test/.test(s.s)).map(s => s.d)).toEqual(['2026-12-15', '2027-02-14', '2027-03-14']);
    expect(E.allWeeks(app.st(), clock).slice(-1)[0]).toMatchObject({ ph: 'race', wk: 25 });
    expect(new Set(ss.map(s => s.id)).size).toBe(ss.length); // nessun identificativo doppio
    // copia del piano precedente, con la data di gara di allora
    const ver = Object.values(store.S.versions).find(v => v.label === 'Prima di: Gara spostata al 9 maggio 2027') as PlanVersion & { race?: string };
    expect(ver.n).toBe(v0); expect(ver.race).toBe('2027-04-25'); expect(JSON.stringify(ver.sessions)).toBe(before);
    // annullabile: torna tutto com'era
    app.applyChange(c, 'undo');
    expect(store.S.core!.race.date).toBe('2027-04-25'); expect(JSON.stringify(store.S.plan!.sessions)).toBe(before); expect(c.status).toBe('undone');
  });

  it('gara anticipata: lo schema salta in avanti e termina nella nuova data', async () => {
    at('2026-11-17');
    const { app, store } = await fresh();
    app.changeRaceDate('2027-04-11');
    const ss = store.S.plan!.sessions;
    expect(ss[ss.length - 1]).toMatchObject({ d: '2027-04-11', s: 'race', wk: 21 }); expect(ss.some(s => s.d > '2027-04-11')).toBe(false);
    expect(ss.filter(s => s.cond === 'long35').map(s => s.d)).toEqual(['2027-03-14']);
    expect(E.recoveryBlocked(app.st(), app.session(ss.filter(s => s.k === 'run' && s.d === '2027-04-06')[0].id)!, '2027-04-06', 'Impegni')).toBe('Negli ultimi 10 giorni non si recupera.');
  });

  it('gara di sabato: la sessione di gara cade nella data indicata', async () => {
    const { app, store } = await fresh();
    app.changeRaceDate('2027-04-24');
    expect(store.S.plan!.sessions.filter(s => s.k === 'run' && s.s === 'race')[0].d).toBe('2027-04-24');
  });

  it('restano le sessioni aggiunte a mano, quelle saltate e i giorni scelti nel profilo', async () => {
    at('2026-11-17');
    const { app, store } = await fresh();
    app.addSession({ d: '2026-12-05', k: 'run', sub: 'easy', km: 4, title: 'Giro con amici' });
    app.skipSession('bw02-e', 'Impegni', 'none');
    app.saveDays({ q: 1, e: 3, long: 5, x: 4, str: 2 }); // lungo al sabato
    app.changeRaceDate('2027-05-09');
    const ss = store.S.plan!.sessions;
    expect(ss.filter(s => s.user).map(s => [s.d, s.title])).toEqual([['2026-12-05', 'Giro con amici']]);
    expect(app.session('bw02-e')).toMatchObject({ d: '2026-11-26', st: 'skipped' });
    expect(ss.filter(s => s.slot === 'long' && s.d > clock && s.s !== 'race').every(s => P.dow(s.d) === 5)).toBe(true);
  });

  it('dati non validi: stessa data o data passata non cambiano nulla', async () => {
    at('2026-11-17');
    const { app, store } = await fresh(), n = Object.keys(store.S.changes).length;
    expect(app.changeRaceDate('2027-04-25')).toBeNull(); expect(app.changeRaceDate('2026-11-17')).toBeNull(); expect(app.changeRaceDate('2026-01-01')).toBeNull();
    expect(Object.keys(store.S.changes).length).toBe(n); expect(store.S.core!.race.date).toBe('2027-04-25');
  });

  it('ripristinare la versione salvata prima del cambio riporta anche la data di gara', async () => {
    at('2026-11-17');
    const { app, store } = await fresh(), before = JSON.stringify(store.S.plan!.sessions);
    app.changeRaceDate('2027-05-09');
    const id = store.S.core!.versions!.find(v => v.label === 'Prima di: Gara spostata al 9 maggio 2027')!.id;
    expect(app.restoreVersion(id)).toBe(true);
    expect(store.S.core!.race.date).toBe('2027-04-25'); expect(JSON.stringify(store.S.plan!.sessions)).toBe(before);
  });

  it('se la gara si avvicina e il carico salta in avanti, il coach propone di ripartire dai km fatti davvero', async () => {
    at('2026-11-16');
    const { app } = await fresh();
    ['bw01-q', 'bw01-e', 'bw01-long'].forEach(id => { at(app.session(id)!.d); run(app, id); });
    at('2026-11-22'); app.changeRaceDate('2027-03-14'); // sei settimane prima: la settimana successiva passa da 29 a 34 km… o più
    at('2026-11-23');
    const cap = app.coachPass().concat(app.pendingChanges()).find(c => /^cap-/.test(c.key));
    expect(E.weekOf(app.st(), '2026-11-23', clock).planKm).toBeGreaterThan(26 * 1.15 + 2);
    expect(cap).toBeTruthy(); expect(cap!.title).toMatch(/^Ridurre la settimana 2 a circa \d+ km$/);
  });
});

describe('punti di estensione (solo interfacce)', () => {
  it('nessun fornitore AI registrato; il testo del prompt è quello del prototipo', async () => {
    at('2026-11-17');
    const { app } = await fresh(), w = run(app, 'bw01-q');
    expect(aiCoach()).toBeNull();
    const p = aiPrompt(app, clock, w);
    expect(p.startsWith('Sei un allenatore di maratona esperto, pragmatico e prudente. Rispondi in italiano, in testo semplice senza markdown né elenchi puntati, al massimo 230 parole.\nAnalizza l’allenamento indicato in "allenamento".')).toBe(true);
    expect(p).toContain('niente prescrizioni mediche e, con dolore sospetto, consiglia una valutazione professionale');
    const data = JSON.parse(p.slice(p.indexOf('DATI (JSON):\n') + 13));
    expect(data).toMatchObject({ oggi: '2026-11-17', obiettivo: '4:00:00', gara: { data: '2027-04-25', giorniMancanti: 159 }, allenamento: { km: 6, ritmo: '6:15/km', giudizio: 'ottimo' }, sessioneProgrammata: { titolo: 'Corsa facile + allunghi', km: 6 }, valutazioneARegole: { giudizio: 'ottimo' } });
    expect(aiPrompt(app, clock, null, 'Posso correre domani?')).toContain('DOMANDA: Posso correre domani?\nDATI (JSON):');
    const fake = { ask: async () => ({ text: 'ok' }) }; registerAiCoach(fake); expect(aiCoach()).toBe(fake); registerAiCoach(null);
  });

  it('un’attività importata diventa una bozza con i soli dati misurati', () => {
    expect(toWorkoutDraft({ source: 'gpx', start: '2026-11-17T07:30:00+01:00', kind: 'run', km: 6.014, sec: 2251.4, hrAvg: 149.6, up: 41.2, name: 'Corsa mattutina' }))
      .toEqual({ date: '2026-11-17', k: 'run', sub: 'easy', km: 6.01, sec: 2251, up: 41, hrAvg: 150, notes: 'Corsa mattutina' });
    expect(toWorkoutDraft({ source: 'strava', start: '2026-11-18T18:00:00+01:00', kind: 'swim', sec: 1800 })).toEqual({ date: '2026-11-18', k: 'swim', min: 30 });
  });
});
