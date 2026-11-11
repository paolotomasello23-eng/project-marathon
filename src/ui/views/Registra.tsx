import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as P from '../../domain/plan';
import * as E from '../../domain/engine';
import type { Kind, Session, Workout } from '../../domain/types';
import { num } from '../../lib/format';
import type { Actions } from '../../data/actions';
import { Head, Scale } from '../bits';
import { toast, useApp } from '../ctx';
import { noPain, PainFields, painOut, type PainValue } from '../Sheets';

interface F {
  k: Kind; date: string; sub: string; sid: string; km: string; extra: string; h: string; m: string; s: string; min: string; rpe: number | null;
  hr: string; hrmax: string; up: string; down: string; feel: number | null; fat: number | null; pain: PainValue; sleep: number | null; sleepH: string;
  temp: string; weather: string; water: string; gels: string; carbs: string; notes: string;
}
interface Err { id: string; msg: string }
const KINDS: [Kind, string][] = [['run', 'Corsa'], ['strength', 'Forza'], ['swim', 'Nuoto'], ['mobility', 'Mobilità'], ['other', 'Altro']];
const WEATHER = ['', 'sereno', 'nuvoloso', 'pioggia', 'vento', 'caldo umido', 'freddo'];
const val = (x: unknown): string => x == null ? '' : String(x).replace('.', ',');

function initial(app: Actions, t: string, w: Workout | null, sid: string | null): F {
  let v: Partial<Workout> = { date: t, k: 'run', sub: 'easy' };
  if (w) v = w;
  else if (sid) {
    const s = app.session(sid);
    if (s) v = { sid, date: s.d <= t ? s.d : t, k: (['run', 'strength', 'swim', 'mobility'].indexOf(s.k) >= 0 ? s.k : 'other') as Kind, sub: s.k === 'run' ? s.s : 'easy', km: s.k === 'run' ? (({ test5: 5, test10: 10, testhm: 21.1 } as Record<string, number>)[s.s] || (s.km as number)) : undefined };
  }
  const sec = v.sec;
  return {
    k: v.k as Kind, date: v.date as string, sub: v.sub || 'easy', sid: v.sid || '', km: val(v.km), extra: val(v.extraKm),
    h: sec ? String(Math.floor(sec / 3600)) : '', m: sec ? String(Math.floor(sec % 3600 / 60)) : '', s: sec ? String(Math.round(sec % 60)) : '', min: v.k !== 'run' ? val(v.min) : '',
    rpe: v.rpe || null, hr: val(v.hrAvg), hrmax: val(v.hrMax), up: val(v.up), down: val(v.down), feel: v.feel || null, fat: v.fatigue || null, pain: noPain(v.pain), sleep: v.sleep || null, sleepH: val(v.sleepH),
    temp: val(v.temp), weather: v.weather || '', water: val(v.waterMl), gels: val(v.gels), carbs: val(v.carbsG), notes: v.notes || ''
  };
}

/** Sessioni a cui si può collegare il risultato: quelle del giorno, altrimenti quelle vicine dello stesso tipo. */
function options(app: Actions, f: F, editId: string | null): { opts: Session[]; near: Session[] } {
  const opts = app.sessionsOn(f.date).filter(s => s.k !== 'rest' && (s.st !== 'done' || s.wid === editId || s.id === f.sid));
  const near = !opts.length && f.date ? app.S.plan!.sessions.filter(s => s.st === 'planned' && s.k === f.k && Math.abs(P.diffDays(s.d, f.date)) <= 3) : [];
  return { opts, near };
}
function pick(app: Actions, f: F, editId: string | null): string {
  const { opts, near } = options(app, f, editId);
  if (f.sid && opts.concat(near).some(s => s.id === f.sid)) return f.sid;
  const m = opts.filter(s => s.k === f.k)[0];
  return m && !editId ? m.id : '';
}
function formTime(f: F): number { return (num(f.h) || 0) * 3600 + (num(f.m) || 0) * 60 + (num(f.s) || 0); }

function read(f: F, t: string): { w: Omit<Workout, 'id'>; errs: Err[] } {
  const errs: Err[] = [], bad = (id: string, msg: string) => { errs.push({ id, msg }); };
  const n = (id: string, v: string, lab: string, lo: number, hi: number, int?: boolean): number | null => { const x = num(v); if (x === null) return null; if (isNaN(x) || x < lo || x > hi) { bad(id, lab + ': tra ' + lo + ' e ' + hi + '.'); return null; } return int ? Math.round(x) : x; };
  const w: Record<string, unknown> = { date: f.date, k: f.k, sid: f.sid || null, rpe: f.rpe, feel: f.feel, fatigue: f.fat, sleep: f.sleep, sleepH: n('f-sleeph', f.sleepH, 'Ore di sonno', 0, 16), pain: painOut(f.pain), notes: f.notes.trim() || null };
  if (!f.date) bad('f-date', 'Manca la data.'); else if (f.date > t) bad('f-date', 'La data è nel futuro.');
  if (f.k === 'run') {
    w.sub = f.sub; const km = n('f-km', f.km, 'Km', 0.2, 120); w.km = km; w.extraKm = E.isTest(f.sub) ? n('f-extra', f.extra, 'Km extra', 0, 30) : null;
    if (km === null && !errs.some(e => e.id === 'f-km')) bad('f-km', 'Mancano i km.');
    const h = num(f.h), m = num(f.m), s = num(f.s);
    let sec = 0;
    if ([h, m, s].some(x => x !== null && (isNaN(x) || x < 0)) || (m !== null && m > 599) || (s !== null && s > 59)) bad('f-m', 'Tempo non valido.');
    else { sec = formTime(f); w.sec = sec; if (!sec) bad('f-m', 'Manca il tempo.'); }
    if (km && sec) { const p = sec / km; if (p < 150 || p > 900) bad('f-km', 'Ritmo di ' + P.fmtPace(p) + '/km: controlla km e tempo.'); }
    const hrAvg = n('f-hr', f.hr, 'FC media', 60, 230, true), hrMax = n('f-hrmax', f.hrmax, 'FC max', 60, 240, true); w.hrAvg = hrAvg; w.hrMax = hrMax;
    if (hrAvg && hrMax && hrMax < hrAvg) bad('f-hrmax', 'FC max più bassa della media.');
    w.up = n('f-up', f.up, 'Salita', 0, 6000, true); w.down = n('f-down', f.down, 'Discesa', 0, 6000, true);
    w.temp = n('f-temp', f.temp, 'Temperatura', -25, 48); w.weather = f.weather || null;
    w.waterMl = n('f-water', f.water, 'Acqua', 0, 6000, true); w.gels = n('f-gels', f.gels, 'Gel', 0, 25, true); w.carbsG = n('f-carbs', f.carbs, 'Carboidrati', 0, 800, true);
  } else { w.min = n('f-min', f.min, 'Minuti', 1, 600, true); }
  Object.keys(w).forEach(key => { if (w[key] === null || w[key] === undefined) delete w[key]; });
  return { w: w as unknown as Omit<Workout, 'id'>, errs };
}

export default function Registra() {
  const { app, S, t } = useApp(), nav = useNavigate(), [q] = useSearchParams();
  const editId = q.get('edit') && S.workouts[q.get('edit') as string] ? q.get('edit') : null, old = editId ? S.workouts[editId] : null;
  const [f, setF] = useState<F>(() => { const x = initial(app, t, old, q.get('sid')); x.sid = pick(app, x, editId); return x; });
  const [errs, setErrs] = useState<Err[]>([]), sumRef = useRef<HTMLDivElement>(null), [open0] = useState(() => ({ hr: !!(f.hr || f.up), feel: !!(f.feel || f.fat || f.pain.lvl || f.sleep), meteo: !!(f.temp !== '' || f.gels || f.water) }));

  /** Cambio di un campo che decide le sessioni proponibili: ricalcola il collegamento. */
  const resync = (patch: Partial<F>) => setF(o => { const x = { ...o, ...patch }; x.sid = pick(app, x, editId); return x; });
  const set = <K extends keyof F>(k: K, v: F[K]) => { setF(o => ({ ...o, [k]: v })); };
  const txt = (k: keyof F, id: string) => ({ id, value: f[k] as string, 'aria-invalid': errs.some(e => e.id === id) ? true : undefined, onChange: (e: { target: { value: string } }) => { set(k, e.target.value as never); if (errs.some(x => x.id === id)) setErrs(errs.filter(x => x.id !== id)); } });

  const isRun = f.k === 'run', isT = isRun && E.isTest(f.sub), { opts, near } = options(app, f, editId);
  const km = num(f.km), sec = formTime(f), calc = isRun && km !== null && km > 0 && sec > 0;

  useEffect(() => {
    if (!errs.length) return;
    const first = document.getElementById(errs[0].id);
    if (first) { const dt = first.closest('details'); if (dt) dt.open = true; first.focus(); }
    if (sumRef.current) sumRef.current.scrollIntoView({ block: 'center' });
    // solo quando compare un nuovo elenco di errori
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errs.map(e => e.id).join()]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = read(f, t); setErrs(r.errs); if (r.errs.length) return;
    const w = app.saveWorkout(r.w, editId);
    toast('Salvato.'); nav('/analisi/' + w.id);
  };

  return <>
    <Head title={old ? 'Correggi' : 'Registra'} />
    <form id="f-log" noValidate className="stack" style={{ gap: 12 }} onSubmit={submit}>
      {errs.length ? <div id="f-errsum" className="errsum" role="alert" ref={sumRef}>{errs.map((e, i) => <span key={i}>{i ? <br /> : null}{e.msg}</span>)}</div> : null}
      <article className="card">
        <div className="opts" role="radiogroup" aria-label="Attività">{KINDS.map(k => <label key={k[0]}><input type="radio" name="f-k" value={k[0]} checked={f.k === k[0]} onChange={() => resync({ k: k[0] })} /><span>{k[1]}</span></label>)}</div>
        <div className="fgrid">
          <div className="field"><label htmlFor="f-date">Data</label><input type="date" id="f-date" value={f.date} max={t} required aria-invalid={errs.some(e => e.id === 'f-date') ? true : undefined} onChange={e => resync({ date: e.target.value })} /></div>
          {isRun ? <div className="field"><label htmlFor="f-sub">Tipo</label><select id="f-sub" value={f.sub} onChange={e => resync({ sub: e.target.value })}>{P.SUB_OPTIONS.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></div> : null}
          <div className="field full"><label htmlFor="f-sid">Sessione</label><select id="f-sid" value={f.sid} onChange={e => set('sid', e.target.value)}>
            <option value="">Fuori programma</option>
            {opts.concat(near).map(s => <option key={s.id} value={s.id}>{(s.d !== f.date ? E.dshort(s.d) + ' · ' : '') + P.title(s) + (s.km ? ' ' + P.nf(s.km) + ' km' : '')}</option>)}
          </select></div>
          {isRun ? <div className="field"><label htmlFor="f-km">Km{isT ? <span> del test</span> : null}</label><input inputMode="decimal" {...txt('km', 'f-km')} /></div> : null}
          {isT ? <div className="field"><label htmlFor="f-extra">Km extra</label><input inputMode="decimal" {...txt('extra', 'f-extra')} /></div> : null}
          {isRun ? <div className="field full"><span className="lab" id="f-time-l">Tempo</span><div className="time3" role="group" aria-labelledby="f-time-l">
            <span><input inputMode="numeric" aria-label="Ore" placeholder="0" {...txt('h', 'f-h')} /><em>h</em></span>
            <span><input inputMode="numeric" aria-label="Minuti" placeholder="00" {...txt('m', 'f-m')} /><em>min</em></span>
            <span><input inputMode="numeric" aria-label="Secondi" placeholder="00" {...txt('s', 'f-s')} /><em>s</em></span>
          </div></div> : <div className="field full"><label htmlFor="f-min">Minuti</label><input inputMode="numeric" {...txt('min', 'f-min')} /></div>}
        </div>
        {calc ? <div className="calc" id="f-calc" aria-live="polite"><span><b>{P.fmtPace(sec / (km as number))}</b>/km</span><span><b>{P.nf((km as number) / (sec / 3600), 1)}</b>km/h</span></div> : null}
        <fieldset className="fs"><legend className="lab">RPE <small>10 = massimo</small></legend><Scale name="f-rpe" value={f.rpe} onChange={v => set('rpe', v)} max={10} /></fieldset>
      </article>

      {isRun ? <details className="grp" open={open0.hr || undefined}><summary>FC e dislivello</summary><div className="body"><div className="fgrid">
        <div className="field"><label htmlFor="f-hr">FC media</label><input inputMode="numeric" {...txt('hr', 'f-hr')} /></div>
        <div className="field"><label htmlFor="f-hrmax">FC max</label><input inputMode="numeric" {...txt('hrmax', 'f-hrmax')} /></div>
        <div className="field"><label htmlFor="f-up">Salita (m)</label><input inputMode="numeric" {...txt('up', 'f-up')} /></div>
        <div className="field"><label htmlFor="f-down">Discesa (m)</label><input inputMode="numeric" {...txt('down', 'f-down')} /></div>
      </div></div></details> : null}

      <details className="grp" open={open0.feel || undefined}><summary>Sensazioni e dolori</summary><div className="body">
        <fieldset className="fs"><legend className="lab">Sensazioni <small>5 = ottime</small></legend><Scale name="f-feel" value={f.feel} onChange={v => set('feel', v)} /></fieldset>
        <fieldset className="fs"><legend className="lab">Fatica <small>5 = esausto</small></legend><Scale name="f-fat" value={f.fat} onChange={v => set('fat', v)} /></fieldset>
        <PainFields p="f" value={f.pain} onChange={v => set('pain', v)} />
        <fieldset className="fs"><legend className="lab">Sonno <small>5 = ottimo</small></legend><Scale name="f-sleep" value={f.sleep} onChange={v => set('sleep', v)} /></fieldset>
        <div className="field"><label htmlFor="f-sleeph">Ore di sonno</label><input inputMode="decimal" {...txt('sleepH', 'f-sleeph')} /></div>
      </div></details>

      {isRun ? <details className="grp" open={open0.meteo || undefined}><summary>Meteo e alimentazione</summary><div className="body"><div className="fgrid">
        <div className="field"><label htmlFor="f-temp">°C</label><input inputMode="decimal" {...txt('temp', 'f-temp')} /></div>
        <div className="field"><label htmlFor="f-weather">Meteo</label><select id="f-weather" value={f.weather} onChange={e => set('weather', e.target.value)}>{WEATHER.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label htmlFor="f-water">Acqua (ml)</label><input inputMode="numeric" {...txt('water', 'f-water')} /></div>
        <div className="field"><label htmlFor="f-gels">Gel</label><input inputMode="numeric" {...txt('gels', 'f-gels')} /></div>
        <div className="field full"><label htmlFor="f-carbs">Carboidrati (g)</label><input inputMode="numeric" {...txt('carbs', 'f-carbs')} /></div>
      </div></div></details> : null}

      <article className="card">
        <div className="field"><label htmlFor="f-notes">Note</label><textarea id="f-notes" value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
        <div className="btns"><button className="btn pri" type="submit">Salva</button>{old ? <button className="btn" type="button" onClick={() => nav('/analisi/' + old.id)}>Annulla</button> : null}</div>
      </article>
    </form>
  </>;
}
