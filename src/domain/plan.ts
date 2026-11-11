/* plan.ts — generatore del piano e descrizione delle sessioni (logica pura, senza DOM).
   Port 1:1 di reference/src/plan.js: numeri, soglie e testi sono quelli dell'originale. */
import type { DayMap, Description, Family, Iso, Kind, Paces, PaceRange, Phase, Session, SessionX, Slot, Zone } from './types';

// ---------- date ----------
export function iso(d: Date): Iso { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function parse(s: Iso): Date { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
export function addDays(s: Iso, n: number): Iso { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
export function mondayOf(s: Iso): Iso { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
export function diffDays(a: Iso, b: Iso): number { return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000); }
/** 0 = lunedì */
export function dow(s: Iso): number { return (parse(s).getDay() + 6) % 7; }

// ---------- formati ----------
export function nf(x: number | null | undefined, d?: number | null): string {
  if (x == null || isNaN(x)) return '–';
  const v = Number(x).toFixed(d == null ? (Math.abs(x % 1) < 0.001 ? 0 : 1) : d);
  return v.replace('.', ',');
}
export function fmtPace(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '–';
  const s = Math.round(sec); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export function fmtTime(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '–';
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0') : m + ':' + String(r).padStart(2, '0');
}
export function fmtDur(min: number | null | undefined): string {
  if (min == null || !isFinite(min)) return '–';
  const m = Math.round(min); if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
}
export function range(z: PaceRange): string { return (z[0] === z[1] ? fmtPace(z[0]) : fmtPace(z[0]) + '–' + fmtPace(z[1])) + '/km'; }
export function mid(z: PaceRange): number { return (z[0] + z[1]) / 2; }
export function r5(x: number): number { return Math.round(x / 5) * 5; }

// ---------- ritmi di riferimento ----------
/** eq10: tempo equivalente sui 10 km (s). goalSec: obiettivo maratona (s). */
export function pacesFromRef(eq10: number, goalSec: number): Paces {
  const p = eq10 / 10, gp = goalSec / 42.195;
  return {
    easy: [r5(p * 1.21), r5(p * 1.31)],
    long: [r5(p * 1.23), r5(p * 1.33)],
    mp: [r5(gp - 7), r5(gp - 1)],
    hm: [r5(p * 1.055), r5(p * 1.08)],
    tempo: [r5(p * 1.01), r5(p * 1.045)],
    interval: [r5(p * 0.94), r5(p * 0.975)]
  };
}
export const ZONE_LABEL: Record<Zone, string> = { easy: 'Corsa facile', long: 'Lungo', mp: 'Ritmo maratona', hm: 'Ritmo mezza', tempo: 'Soglia (tempo)', interval: 'Ripetute brevi' };

// ---------- schema delle 24 settimane (dalla settimana 1 alla gara) ----------
export const PHASE: Record<Phase, string> = { pre: 'Avvio', base: 'Base', build: 'Costruzione', spec: 'Specifico', taper: 'Scarico finale', race: 'Settimana di gara' };

interface RunSpec extends SessionX { s?: string; km: number; cond?: 'run4' | 'long35' }
interface WeekTemplate { ph: Phase; down?: 1; q: RunSpec; e: RunSpec; x?: { km: number }; l: RunSpec }

const W: WeekTemplate[] = [
  { ph: 'base', q: { s: 'easy', km: 6 }, e: { s: 'easy', km: 5, strides: 4 }, l: { km: 12 } },
  { ph: 'base', q: { s: 'easy', km: 6, strides: 6 }, e: { s: 'easy', km: 6 }, l: { km: 14 } },
  { ph: 'base', q: { s: 'hills', km: 7, reps: 6, sec: 30 }, e: { s: 'easy', km: 6 }, l: { km: 16 } },
  { ph: 'base', down: 1, q: { s: 'test5', km: 8.5 }, e: { s: 'easy', km: 5 }, l: { km: 12 } },
  { ph: 'base', q: { s: 'fartlek', km: 8, reps: 6, on: 1, off: 2 }, e: { s: 'easy', km: 7 }, l: { km: 17 } },
  { ph: 'base', q: { s: 'tempo', km: 8, reps: 2, min: 8, rec: 3 }, e: { s: 'easy', km: 7, strides: 4 }, l: { km: 19 } },
  { ph: 'base', q: { s: 'hills', km: 8, reps: 8, sec: 45 }, e: { s: 'easy', km: 8 }, l: { km: 20 } },
  { ph: 'base', down: 1, q: { s: 'easy', km: 7, strides: 6 }, e: { s: 'easy', km: 6 }, l: { km: 14 } },
  { ph: 'build', q: { s: 'easy', km: 8, strides: 6 }, e: { s: 'easy', km: 8 }, x: { km: 5 }, l: { km: 20 } },
  { ph: 'build', q: { s: 'tempo', km: 9, reps: 3, min: 8, rec: 3 }, e: { s: 'easy', km: 8 }, x: { km: 5 }, l: { km: 22 } },
  { ph: 'build', q: { s: 'hills', km: 9, reps: 8, sec: 60 }, e: { s: 'easy', km: 9 }, x: { km: 6 }, l: { km: 24 } },
  { ph: 'build', down: 1, q: { s: 'easy', km: 8, strides: 6 }, e: { s: 'fartlek', km: 7, reps: 4, on: 1, off: 2 }, l: { s: 'test10', km: 15 } },
  { ph: 'build', q: { s: 'tempo', km: 10, reps: 2, min: 12, rec: 3 }, e: { s: 'easy', km: 10 }, x: { km: 6 }, l: { km: 25 } },
  { ph: 'build', q: { s: 'hills', km: 10, reps: 6, sec: 120 }, e: { s: 'easy', km: 11 }, x: { km: 6 }, l: { km: 27, up: 1 } },
  { ph: 'spec', q: { s: 'tempo', km: 11, reps: 1, min: 20, rec: 0 }, e: { s: 'easy', km: 12 }, x: { km: 6 }, l: { km: 29 } },
  { ph: 'spec', down: 1, q: { s: 'easy', km: 8, strides: 6 }, e: { s: 'hmp', km: 7, reps: 3, repKm: 1, rec: 2 }, l: { s: 'testhm', km: 24 } },
  { ph: 'spec', down: 1, q: { s: 'easy', km: 8, soft: 1 }, e: { s: 'mp', km: 10, blocks: [5], rec: 0 }, x: { km: 6 }, l: { km: 22 } },
  { ph: 'spec', q: { s: 'tempo', km: 11, reps: 3, min: 10, rec: 2.5 }, e: { s: 'easy', km: 12 }, x: { km: 7 }, l: { km: 32, prog: 5 } },
  { ph: 'spec', down: 1, q: { s: 'hills', km: 9, reps: 6, sec: 60 }, e: { s: 'easy', km: 9 }, x: { km: 5 }, l: { km: 22, mp: 12 } },
  { ph: 'spec', q: { s: 'tempo', km: 10, reps: 2, min: 10, rec: 3 }, e: { s: 'easy', km: 12 }, x: { km: 6 }, l: { km: 35, cond: 'long35' } },
  { ph: 'spec', down: 1, q: { s: 'easy', km: 8, soft: 1 }, e: { s: 'mp', km: 10, blocks: [4], rec: 0 }, x: { km: 5 }, l: { km: 22, mp: 12, up: 1 } },
  { ph: 'taper', down: 1, q: { s: 'mp', km: 9, blocks: [3, 3], rec: 3 }, e: { s: 'easy', km: 8 }, x: { km: 5 }, l: { km: 18, mp: 6 } },
  { ph: 'taper', down: 1, q: { s: 'mp', km: 8, blocks: [1.5, 1.5, 1.5], rec: 2 }, e: { s: 'easy', km: 7, strides: 4 }, x: { km: 4 }, l: { km: 12 } },
  { ph: 'race', down: 1, q: { s: 'mp', km: 7, blocks: [3], rec: 0 }, e: { s: 'easy', km: 5, strides: 4 }, l: { s: 'race', km: 42.195 } }
];
const PRE: WeekTemplate = { ph: 'pre', q: { s: 'easy', km: 5 }, e: { s: 'easy', km: 5 }, l: { km: 10 } };

/** Numero di settimane dello schema completo. */
export const SCHEMA_WEEKS = W.length;

/** giorni (0 = lunedì) assegnati a ogni slot; modificabili dal profilo */
export const DEF_DAYS: DayMap = { mon: 0, q: 1, str: 2, e: 3, x: 4, sat: 5, long: 6 };

const X_FIELDS = ['strides', 'reps', 'sec', 'on', 'off', 'min', 'rec', 'blocks', 'repKm', 'mp', 'prog', 'up', 'soft'] as const;

function runSession(id: string, date: Iso, wk: number, ph: Phase, slot: Slot, spec: RunSpec, down?: 1): Session {
  const o: Session = { id: id, d: date, wk: wk, ph: ph, slot: slot, k: 'run', s: spec.s || (slot === 'long' ? 'long' : 'easy'), km: spec.km, st: 'planned' };
  const x: Record<string, unknown> = {};
  X_FIELDS.forEach(function (f) { if (spec[f] != null) x[f] = spec[f]; });
  if (Object.keys(x).length) o.x = x as SessionX;
  if (spec.cond) o.cond = spec.cond;
  if (down) o.down = 1;
  return o;
}

export interface GenerateOptions { raceDate: Iso; startDate: Iso; days?: Partial<DayMap>; idp?: string }

/**
 * Genera il piano. opts: { raceDate, startDate, days? }
 * La gara chiude l'ultima settimana; lo schema viene allineato all'indietro.
 */
export function generate(opts: GenerateOptions): Session[] {
  const raceMon = mondayOf(opts.raceDate), startMon = mondayOf(opts.startDate);
  const total = Math.round(diffDays(startMon, raceMon) / 7) + 1;
  const days: DayMap = Object.assign({}, DEF_DAYS, opts.days || {});
  const out: Session[] = [];
  for (let i = 0; i < total; i++) {
    const tIdx = W.length - total + i; // indice nello schema (negativo = settimane di avvio)
    const t = tIdx >= 0 ? W[tIdx] : PRE;
    const wk = i + 1, mon = addDays(startMon, i * 7), id = (opts.idp || '') + 'w' + String(wk).padStart(2, '0') + '-';
    const isRace = t.ph === 'race', hasX = !!t.x;
    const at = (slot: keyof DayMap): Iso => addDays(mon, days[slot]);
    // lunedì
    out.push({ id: id + 'mon', d: at('mon'), wk: wk, ph: t.ph, slot: 'mon', k: isRace ? 'rest' : 'mobility', s: hasX ? 'swimopt' : 'std', st: 'planned' });
    out.push(runSession(id + 'q', at('q'), wk, t.ph, 'q', t.q, t.down));
    // mercoledì: forza
    if (isRace) out.push({ id: id + 'str', d: at('str'), wk: wk, ph: t.ph, slot: 'str', k: 'mobility', s: 'race', st: 'planned' });
    else out.push({ id: id + 'str', d: at('str'), wk: wk, ph: t.ph, slot: 'str', k: 'strength', s: t.ph === 'taper' ? 'C' : (t.ph === 'base' || t.ph === 'pre' ? 'A' : 'B'), st: 'planned' });
    out.push(runSession(id + 'e', at('e'), wk, t.ph, 'e', t.e, t.down));
    // venerdì: nuoto/riposo oppure quarta corsa (condizionale)
    if (hasX) { const xs = runSession(id + 'x', at('x'), wk, t.ph, 'x', { s: 'easy', km: t.x!.km }, t.down); xs.cond = 'run4'; out.push(xs); }
    else if (isRace || (t.l.s && t.l.s.indexOf('test') === 0)) out.push({ id: id + 'x', d: at('x'), wk: wk, ph: t.ph, slot: 'x', k: 'rest', s: 'pretest', st: 'planned' });
    else out.push({ id: id + 'x', d: at('x'), wk: wk, ph: t.ph, slot: 'x', k: 'swim', s: 'opt', st: 'planned' });
    // sabato
    if (isRace) out.push(runSession(id + 'sat', at('sat'), wk, t.ph, 'sat', { s: 'shake', km: 3 }, 1));
    else out.push({ id: id + 'sat', d: at('sat'), wk: wk, ph: t.ph, slot: 'sat', k: 'rest', s: 'prelong', st: 'planned' });
    // domenica
    const L = runSession(id + 'long', isRace ? opts.raceDate : at('long'), wk, t.ph, 'long', t.l, t.down);
    out.push(L);
  }
  out.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  return out;
}

// ---------- titoli e descrizioni ----------
export const RUN_TITLE: Record<string, string> = { easy: 'Corsa facile', shake: 'Sgambata pre-gara', long: 'Lungo', hills: 'Salite', fartlek: 'Fartlek', tempo: 'Ritmo soglia', mp: 'Ritmo maratona', hmp: 'Ritmo mezza', test5: 'Test 5 km', test10: 'Test 10 km', testhm: 'Test mezza maratona', race: 'Maratona di Madrid' };
export const KIND_LABEL: Record<string, string> = { run: 'Corsa', strength: 'Forza', swim: 'Nuoto', mobility: 'Mobilità', rest: 'Riposo', other: 'Altro' };
export const SUB_OPTIONS: [string, string][] = [['easy', 'Corsa facile'], ['long', 'Lungo'], ['tempo', 'Ritmo soglia'], ['hills', 'Salite'], ['fartlek', 'Fartlek'], ['mp', 'Ritmo maratona'], ['hmp', 'Ritmo mezza'], ['test5', 'Test 5 km'], ['test10', 'Test 10 km'], ['testhm', 'Test mezza maratona'], ['race', 'Gara'], ['shake', 'Sgambata']];

/** Il minimo che serve per riconoscere una sessione: tipo e sottotipo. */
export type SessionLike = Pick<Session, 'k' | 's'> & Partial<Session>;

/** famiglia di colore/intensità di una sessione */
export function family(s: { k: Kind | string; s?: string }): Family {
  if (s.k !== 'run') return s.k as Family;
  if (s.s === 'race' || s.s === 'test5' || s.s === 'test10' || s.s === 'testhm') return 'race';
  if (s.s === 'long') return 'long';
  if (s.s === 'easy' || s.s === 'shake') return 'easy';
  return 'quality';
}

export function title(s: SessionLike): string {
  if (s.title) return s.title;
  if (s.k === 'run') {
    let t = RUN_TITLE[s.s] || 'Corsa';
    const x = s.x || {};
    if (s.s === 'easy' && x.strides) t += ' + allunghi';
    if (s.s === 'easy' && x.soft) t = 'Corsa di recupero';
    if (s.s === 'long' && x.mp) t += ' + ritmo gara';
    return t;
  }
  if (s.k === 'strength') return s.s === 'C' ? 'Forza leggera' : s.s === 'B' ? 'Forza specifica' : 'Forza generale';
  if (s.k === 'swim') return 'Nuoto o riposo';
  if (s.k === 'mobility') return 'Mobilità';
  if (s.k === 'rest') return 'Riposo';
  return 'Allenamento';
}

export function durMin(s: SessionLike, pc: Paces, goalSec?: number): number {
  if (s.dur) return s.dur;
  if (s.k === 'strength') return s.s === 'C' ? 30 : s.s === 'B' ? 55 : 50;
  if (s.k === 'swim') return 30;
  if (s.k === 'mobility') return 20;
  if (s.k !== 'run' || !s.km) return 0;
  const x = s.x || {}, e = mid(pc.easy), km = s.km;
  switch (s.s) {
    case 'long': return ((km - (x.mp || 0)) * mid(pc.long) + (x.mp || 0) * mid(pc.mp)) / 60;
    case 'test5': return ((km - 5) * e + 5 * mid(pc.interval)) / 60;
    case 'test10': return ((km - 10) * e + 10 * pc.tempo[0]) / 60;
    case 'testhm': return ((km - 21.1) * e + 21.1 * mid(pc.hm)) / 60;
    case 'race': return (goalSec || mid(pc.mp) * 42.195) / 60;
    case 'easy': case 'shake': return km * e / 60;
    default: return km * (e - 12) / 60;
  }
}

export function fuelFor(min: number): string | null {
  if (min < 75) return null;
  if (min < 120) return 'Dal minuto 30–40: 30–40 g di carboidrati l’ora (circa un gel ogni 40 minuti) con qualche sorso d’acqua. Serve anche ad allenare lo stomaco.';
  if (min < 165) return '40–60 g di carboidrati l’ora: un gel ogni 30 minuti a partire dal minuto 30, con 150–200 ml d’acqua per gel. Colazione ricca di carboidrati 2–3 ore prima.';
  return 'Prova generale di gara: 60 g di carboidrati l’ora (un gel ogni 25–30 minuti), 400–700 ml di liquidi l’ora con elettroliti, stessa colazione e stessi prodotti che userai a Madrid.';
}

function gainFor(s: SessionLike): string | null {
  if (s.k !== 'run') return null;
  // I campi di x mancanti producono NaN, come nell'originale.
  const x = (s.x || {}) as Required<SessionX>;
  if (s.s === 'hills') { const m = Math.round(x.reps * x.sec * 0.17 / 5) * 5; return 'Circa ' + m + '–' + Math.round(m * 1.4 / 5) * 5 + ' m nelle ripetute, su una salita al 4–7%.'; }
  if (s.s === 'test5' || s.s === 'test10') return 'Percorso piatto e misurato.';
  if (s.s === 'testhm') return 'Il più piatto possibile, per un tempo confrontabile.';
  if (s.s === 'race') return 'Circa 400 m di salita totale, concentrati nel finale.';
  if (s.s === 'long') {
    const km = s.km as number;
    const per = s.ph === 'spec' ? [8, 10] : s.ph === 'build' ? [6, 9] : s.ph === 'taper' ? [5, 8] : [3, 6];
    return Math.round(km * per[0] / 10) * 10 + '–' + Math.round(km * per[1] / 10) * 10 + ' m: percorso mosso' + (s.ph === 'spec' || s.ph === 'build' ? ', simile a Madrid (circa 9–10 m per km).' : ', senza cercare salite dure.');
  }
  if (s.s === 'easy' || s.s === 'shake') return 'Libero, meglio pianeggiante.';
  return 'Pianeggiante o leggermente mosso.';
}

/** Descrizione completa di una sessione, con i ritmi attuali. */
export function describe(s: SessionLike, pc: Paces, goalSec?: number): Description {
  const x = (s.x || {}) as Required<SessionX>;
  const d: Description = { title: title(s), kind: KIND_LABEL[s.k] || 'Allenamento', km: s.km || null, dur: durMin(s, pc, goalSec), pace: null, intensity: null, structure: null, gain: gainFor(s), goal: '', fuel: null, tech: '', recovery: '' };
  const WU = '15′ facili', CD = '10′ facili';
  if (s.k === 'run') {
    const km = s.km as number;
    switch (s.s) {
      case 'easy':
        d.pace = range(pc.easy); d.intensity = 'RPE 2–4, conversazionale';
        if (x.soft) { d.goal = 'Smaltire la fatica: gambe sciolte, nessuna ambizione di ritmo.'; d.tech = 'Corri più piano del solito ritmo facile se serve. Se le gambe sono pesanti dopo 15 minuti, accorcia.'; }
        else { d.goal = 'Costruire base aerobica senza accumulare fatica.'; d.tech = 'Devi riuscire a parlare a frasi intere. Se il ritmo scende sotto ' + fmtPace(pc.easy[0]) + '/km, rallenta: non è un test.'; }
        if (x.strides) d.structure = 'Nel finale ' + x.strides + ' allunghi da 20″, recupero 60–90″.';
        if (s.cond === 'run4') d.goal = 'Quarta corsa della settimana: volume in più a basso costo, sempre facile.';
        d.recovery = 'Recupero normale: acqua e un pasto completo entro due ore.';
        break;
      case 'shake':
        d.pace = range(pc.easy); d.intensity = 'RPE 2, molto facile';
        d.structure = '15–20′ lenti + 3 allunghi. Facoltativa.';
        d.goal = 'Sciogliere le gambe e scaricare la tensione della vigilia.'; d.tech = 'Niente di nuovo oggi: scarpe, colazione e gel sono già decisi.';
        d.fuel = 'Carico di carboidrati in corso: 8–10 g per kg di peso nella giornata, poche fibre, acqua regolare.'; d.recovery = 'Gambe in alto, a letto presto.';
        break;
      case 'long': {
        d.pace = range(pc.long); d.intensity = x.mp ? 'RPE 3–4, poi 5–6 nel tratto a ritmo maratona' : (km >= 28 ? 'RPE 3–5, può salire a 6 nel finale' : 'RPE 3–5');
        const parts: string[] = [];
        if (x.mp) parts.push(nf(km - x.mp) + ' km lenti + ' + nf(x.mp) + ' km a ritmo gara (' + range(pc.mp) + ').');
        if (x.prog) parts.push('Ultimi ' + x.prog + ' km in progressione.');
        if (x.up) parts.push('Finale in salita.');
        if (s.cond === 'long35') parts.push('Da confermare: altrimenti 32 km.');
        d.structure = parts.length ? parts.join(' ') : null;
        d.goal = s.ph === 'spec' ? 'Lungo specifico: provare fatica, alimentazione e ritmo di gara.' : s.ph === 'build' ? 'Resistenza: abituare muscoli, tendini e testa alle lunghe durate, su percorso mosso.' : s.ph === 'taper' ? 'Mantenere la confidenza con la distanza mentre scarichi fatica.' : 'Allungare il tempo sulle gambe in modo graduale.';
        d.tech = 'Parti più piano del ritmo previsto per i primi 2–3 km. Sforzo costante: in salita si rallenta, in discesa non si recupera il tempo perso.';
        d.fuel = fuelFor(d.dur) || 'Acqua a piacere: sotto i 75 minuti i carboidrati non servono.';
        d.recovery = km >= 26 ? 'Nelle 24–48 ore successive: niente corsa il giorno dopo, 15–20 minuti di camminata o mobilità, carboidrati più 20–30 g di proteine entro 1–2 ore, sonno abbondante. Indolenzimento diffuso è normale; un dolore localizzato che cambia il modo di correre no.' : 'Il giorno dopo riposo o mobilità; pasto completo con carboidrati e proteine entro due ore.';
        break;
      }
      case 'hills':
        d.pace = 'A sensazione'; d.intensity = x.sec >= 120 ? 'RPE 7 in salita' : 'RPE 7–8 in salita';
        d.structure = WU + ' · ' + x.reps + ' × ' + (x.sec >= 120 ? (x.sec / 60) + '′' : x.sec + '″') + ' in salita (' + (x.sec >= 120 ? '4–6%' : '5–7%') + '), recupero in discesa · ' + CD;
        d.goal = 'Forza specifica e tecnica di salita e discesa per il profilo di Madrid.';
        d.tech = 'In salita passi corti, busto inclinato dalle caviglie, braccia attive. In discesa appoggi rapidi e leggeri, senza frenare di tallone: le discese di Madrid caricano i quadricipiti prima del finale in salita.';
        d.recovery = 'Domani niente intensità. Polpacci e tendini d’Achille lavorano molto: se restano dolenti oltre 48 ore, segnalalo.';
        break;
      case 'fartlek':
        d.pace = 'Tratti brillanti a ' + range(pc.interval); d.intensity = 'RPE 6–7 nei tratti veloci';
        d.structure = WU + ' · ' + x.reps + ' × (' + x.on + '′ forte + ' + x.off + '′ lento) · ' + CD;
        d.goal = 'Introdurre i cambi di ritmo con uno stress contenuto.'; d.tech = 'I tratti veloci sono controllati, non sprint: l’ultimo deve uscire come il primo.';
        d.recovery = 'Recupero normale; domani niente corsa veloce.';
        break;
      case 'tempo':
        d.pace = range(pc.tempo); d.intensity = 'RPE 6–7, “comodamente duro”';
        d.structure = WU + ' · ' + (x.reps > 1 ? x.reps + ' × ' + x.min + '′ a soglia, recupero ' + nf(x.rec) + '′' : x.min + '′ continui a soglia') + ' · ' + CD;
        d.goal = 'Alzare la soglia: è ciò che rende economico il ritmo maratona.';
        d.tech = 'Dovresti riuscire a dire frasi brevi. Se l’ultimo blocco costa RPE 8 o più, il ritmo è troppo alto: rallenta di 5–10 secondi al km.';
        d.recovery = 'Domani niente intensità; forza regolare ma senza arrivare al cedimento sulle gambe.';
        break;
      case 'mp': {
        d.pace = range(pc.mp); d.intensity = 'RPE 5–6';
        const b = x.blocks || [];
        d.structure = WU + ' · ' + (b.length > 1 ? b.length + ' × ' + nf(b[0]) + ' km a ritmo gara, recupero ' + nf(x.rec) + '′' : nf(b[0]) + ' km a ritmo gara') + ' · ' + CD;
        d.goal = 'Memorizzare il ritmo di gara e renderlo economico.';
        d.tech = 'Fidati della percezione più che del GPS: respiro controllato, RPE 5–6. In salita tieni lo sforzo, non il ritmo.';
        d.recovery = 'Recupero normale.';
        break;
      }
      case 'hmp':
        d.pace = range(pc.hm); d.intensity = 'RPE 6';
        d.structure = WU + ' · ' + x.reps + ' × ' + nf(x.repKm) + ' km a ritmo mezza, recupero ' + nf(x.rec) + '′ · ' + CD;
        d.goal = 'Richiamo di ritmo senza affaticare prima del test.'; d.tech = 'Deve restare margine: finisci con la sensazione di poterne fare altri due.'; d.recovery = 'Recupero normale; venerdì e sabato scarichi.';
        break;
      case 'test5':
        d.pace = 'A tutta, circa ' + fmtPace(pc.interval[0]) + '–' + fmtPace(pc.interval[1] + 5) + '/km'; d.intensity = 'RPE 9–10';
        d.structure = '2,5 km facili + allunghi · 5 km a tutta · 1 km facile';
        d.goal = 'Misurare la forma per tarare i ritmi e la stima della maratona.';
        d.tech = 'Percorso piatto, meglio pista o ciclabile misurata. Primo km non più veloce di ' + fmtPace(pc.interval[0]) + ': il test vale se chiudi in progressione.';
        d.recovery = 'Corsa facile nei due giorni successivi. Registra tempo, RPE e frequenza cardiaca: servono per aggiornare ritmi e previsione.';
        break;
      case 'test10':
        d.pace = 'A tutta, circa ' + fmtPace(pc.tempo[0] - 8) + '–' + fmtPace(pc.tempo[0]) + '/km'; d.intensity = 'RPE 9–10';
        d.structure = '3 km facili · 10 km a tutta · 2 km facili';
        d.goal = 'Verificare i progressi e aggiornare ritmi e previsione maratona.';
        d.tech = 'Primi 2 km controllati, poi ritmo costante; negli ultimi 2 km dai quello che resta.'; d.recovery = 'Lunedì riposo, martedì solo corsa facile.';
        break;
      case 'testhm':
        d.pace = range(pc.hm); d.intensity = 'RPE 8–9';
        d.structure = '2 km facili · 21,1 km a ritmo mezza · 1 km al passo';
        d.goal = 'Il test più affidabile per stimare il tempo in maratona.';
        d.tech = 'Parti a ' + fmtPace(pc.hm[1]) + '/km e cresci dopo il km 15 se ne hai. Usa gel e bevande come farai a Madrid: è anche una prova di alimentazione.';
        d.fuel = 'Gel ai km 6, 12 e 17 con acqua. Colazione di gara 3 ore prima.'; d.recovery = 'Due o tre giorni facili: la settimana successiva è di recupero.';
        break;
      case 'race':
        d.pace = range(pc.mp); d.intensity = 'Sforzo regolare: RPE 5–6 fino al km 30';
        d.structure = 'Km 0–3 in salita: 5–10″/km più lento. Discesa fino al km 7: lascia correre. Dal km 37 conta lo sforzo, non il ritmo.';
        d.goal = '42,195 km. Arrivare al km 30 con margine: la gara vera comincia lì.';
        d.tech = 'Niente di nuovo: scarpe, abbigliamento, colazione e gel già provati nei lunghi.';
        d.fuel = 'Colazione 3 ore prima (1–3 g di carboidrati per kg). Un gel ogni 25–30 minuti dal km 5, circa 60 g l’ora, acqua a ogni ristoro.';
        d.recovery = 'Cammina 10–15 minuti dopo l’arrivo, mangia e bevi presto. Una settimana senza corsa, poi ripresa graduale.';
        break;
    }
    if (!d.fuel && s.s !== 'long') d.fuel = fuelFor(d.dur);
    return d;
  }
  if (s.k === 'strength') {
    d.intensity = s.s === 'C' ? 'Leggera: RPE 4–5' : 'RPE 6–7, mai a cedimento sulle gambe';
    if (s.s === 'A') { d.structure = 'Squat o goblet squat 3 × 8–10 · affondi indietro 3 × 8 per gamba · ponte glutei su una gamba 3 × 10 · calf raise a ginocchio teso 3 × 12 e a ginocchio piegato (soleo) 3 × 12 · plank 3 × 40 secondi e side plank 2 × 30 secondi · trazioni e piegamenti a piacere.'; d.goal = 'Forza generale e stabilità di anche e core: la base per reggere l’aumento dei chilometri.'; }
    else if (s.s === 'B') { d.structure = 'Split squat bulgaro 3 × 6–8 · step-down eccentrico (4 secondi in discesa) 3 × 8 · stacco rumeno su una gamba 3 × 8 · calf raise eccentrico su gradino 3 × 10 più soleo 3 × 12 · nordic curl o slider curl 3 × 5–6 · Copenhagen plank 2 × 20 secondi · core anti-rotazione · parte alta in stile calisthenics.'; d.goal = 'Forza eccentrica per le discese di Madrid e tenuta di polpacci e femorali nei lunghi.'; }
    else { d.structure = 'Due serie leggere degli esercizi abituali, senza lavoro eccentrico pesante e senza esercizi nuovi.'; d.goal = 'Mantenere il tono senza creare fatica residua.'; }
    d.tech = 'Qualità del movimento prima del carico. Il lavoro per la parte alta (trazioni, piegamenti, dip) è libero: non pesa sulla corsa.';
    d.recovery = 'Se il giorno dopo le gambe sono pesanti, la corsa resta facile.';
    return d;
  }
  if (s.k === 'swim') { d.intensity = 'Molto facile'; d.structure = '20–30′ sciolti, oppure riposo.'; d.goal = 'Recupero attivo senza impatto.'; d.tech = 'Non deve diventare un allenamento: esci dall’acqua più fresco di come sei entrato.'; d.recovery = '—'; return d; }
  if (s.k === 'mobility') { d.intensity = 'Rigenerante'; d.structure = s.s === 'race' ? '15′ di mobilità dolce. Niente forza.' : '15–20′: anche, caviglie, polpacci.' + (s.s === 'swimopt' ? ' Nuoto facoltativo.' : ''); d.goal = 'Recuperare dal lungo e arrivare freschi alla prossima corsa.'; d.tech = 'Se sei stanco, il riposo completo vale quanto la mobilità.'; d.recovery = '—'; return d; }
  d.intensity = '—'; d.goal = s.s === 'prelong' ? 'Arrivare al lungo con le gambe fresche.' : 'Recupero.'; d.structure = s.s === 'prelong' ? 'Riposo. Cena con carboidrati.' : 'Riposo.'; d.tech = ''; d.recovery = '—';
  return d;
}
