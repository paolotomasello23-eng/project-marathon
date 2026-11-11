import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as P from '../../domain/plan';
import * as E from '../../domain/engine';
import type { Workout } from '../../domain/types';
import { aiCoach, aiPrompt } from '../../ext/aiCoach';
import { nowISO } from '../../lib/clock';
import { cap1, dfull, dstamp } from '../../lib/format';
import { Chip, Dot, Head, Ic, KV, RATE, Src, wAsSession, wTitle } from '../bits';
import { toast, useApp } from '../ctx';

/** Chiede un parere al fornitore AI registrato (nessuno, per ora): testo che arriva man mano, interrompibile. */
function useAi() {
  const [text, setText] = useState<string | null>(null), [busy, setBusy] = useState(false), ctl = useRef<AbortController | null>(null);
  const run = (prompt: string, done?: (text: string) => void) => {
    const ai = aiCoach(); if (!ai) return;
    if (ctl.current) ctl.current.abort();
    const c = ctl.current = new AbortController();
    setBusy(true); setText('Sto pensando…');
    ai.ask(prompt, { signal: c.signal, onText: setText }).then(r => { setText(r.text + (r.truncated ? '\n\n(Risposta interrotta per lunghezza.)' : '')); if (done) done(r.text); }, () => { if (!c.signal.aborted) setText('Il coach AI non è raggiungibile in questo momento: riprova tra poco.'); })
      .finally(() => { if (ctl.current === c) { ctl.current = null; setBusy(false); } });
  };
  return { text, busy, run, stop: () => { if (ctl.current) ctl.current.abort(); } };
}

function Detail({ w }: { w: Workout }) {
  const { app, S, t } = useApp(), nav = useNavigate(), ai = useAi(), [sure, setSure] = useState(false);
  const ev = w.eval!, c = ev.calc, s = w.sid ? app.session(w.sid) : null, rows: ReactNode[] = [];
  const row = (l: string, v: ReactNode, src: 'u' | 'e' | 'c') => { if (v != null && v !== '') rows.push(<tr key={l}><td>{l}</td><td className="r">{v}</td><td className="r"><Src t={src} /></td></tr>); };
  row('Data', dfull(w.date), 'u'); row('Tipo', wTitle(w), 'u');
  if (w.k === 'run') {
    row('Km', P.nf(w.km), 'u'); if (w.extraKm) row('Km extra', P.nf(w.extraKm), 'u');
    row('Tempo', w.sec ? P.fmtTime(w.sec) : null, 'u'); row('Ritmo', c.pace ? P.fmtPace(c.pace) + '/km' : null, 'c'); row('Velocità', c.speed ? P.nf(c.speed, 1) + ' km/h' : null, 'c');
    if (c.adj && Math.abs(c.adj - (c.pace as number)) > 0.5) row('Ritmo in piano', P.fmtPace(c.adj) + '/km', 'e');
    if (c.target) row('Scarto dal ritmo previsto', ((c.dev as number) > 0 ? '+' : '') + P.nf((c.dev as number) * 100, 1) + '%', 'c');
    if (c.completion != null) row('Completamento', Math.round(c.completion * 100) + '%', 'c');
    row('FC media', w.hrAvg ? w.hrAvg + ' bpm' : null, 'u'); row('FC max', w.hrMax ? w.hrMax + ' bpm' : null, 'u');
    if (c.hrPct) row('FC sulla max', Math.round(c.hrPct * 100) + '%', c.hrMaxEst ? 'e' : 'c');
    row('Salita', w.up != null ? w.up + ' m' : null, 'u'); row('Discesa', w.down != null ? w.down + ' m' : (w.up ? w.up + ' m' : null), w.down != null ? 'u' : 'e');
  } else row('Durata', w.min ? P.fmtDur(w.min) : null, 'u');
  row('RPE', w.rpe ? w.rpe + '/10' : null, 'u'); row('Sensazioni', w.feel ? w.feel + '/5' : null, 'u'); row('Fatica', w.fatigue ? w.fatigue + '/5' : null, 'u');
  row('Sonno', w.sleep ? w.sleep + '/5' + (w.sleepH ? ' · ' + P.nf(w.sleepH) + ' h' : '') : (w.sleepH ? P.nf(w.sleepH) + ' h' : null), 'u');
  row('Dolore', w.pain ? cap1(E.PAIN_LBL[w.pain.lvl]) + (w.pain.area ? ' · ' + w.pain.area : '') + (w.pain.note ? ' · ' + w.pain.note : '') : null, 'u');
  row('Meteo', (w.temp != null ? P.nf(w.temp) + ' °C' : '') + (w.weather ? (w.temp != null ? ' · ' : '') + w.weather : '') || null, 'u');
  row('Acqua', w.waterMl != null ? w.waterMl + ' ml' : null, 'u'); row('Gel', w.gels != null ? w.gels : null, 'u'); row('Carboidrati', w.carbsG != null ? w.carbsG + ' g' : null, 'u');
  if (c.carbsH) row('Carboidrati l’ora', Math.round(c.carbsH) + ' g', c.carbsEst ? 'e' : 'c');
  row('Carico', c.load, c.loadEst ? 'e' : 'c');
  if (c.eq10) row('Equivalente 10 km', P.fmtTime(c.eq10), 'e');
  const ul = (a: string[], cls?: string) => a && a.length ? <ul className={'pts ' + (cls || '')}>{a.map((x, i) => <li key={i}>{x}</li>)}</ul> : null;
  const tiles: [string, ReactNode][] = [];
  if (c.pace) tiles.push(['Ritmo', P.fmtPace(c.pace)]);
  if (c.hrPct) tiles.push(['FC', Math.round(c.hrPct * 100) + '%']);
  if (w.rpe) tiles.push(['RPE', w.rpe]);
  tiles.push(['Carico', c.load]);
  const pending = (ev.cids || []).map(id => S.changes[id]).filter(x => x && x.status === 'pending').length;
  const aiText = ai.text != null ? ai.text : w.ai ? w.ai.text : null;
  return <>
    <div className="head"><button className="btn sm" onClick={() => nav('/analisi')}><Ic n="chevL" />Tutti</button></div>
    <article className="card an">
      <div className="row between"><Chip tone={RATE[ev.rating]}>{cap1(ev.rating)}</Chip><span className="tiny">{cap1(E.dshort(w.date))}{s ? '' : ' · extra'}</span></div>
      <h2 style={{ fontSize: 26 }}>{wTitle(w)}{w.km ? ' · ' + P.nf(w.km) + ' km' : ''}</h2>
      <div className="tiles">{tiles.map(x => <div key={x[0]} className="tile"><span className="lab">{x[0]}</span><span className="big">{x[1]}</span></div>)}</div>
      {ev.good.length ? <><h3>Bene</h3>{ul(ev.good, 'plus')}</> : null}
      {ev.improve.length ? <><h3>Da migliorare</h3>{ul(ev.improve, 'minus')}</> : null}
      <dl className="kv"><KV k="Recupero">{ev.recovery.join(' ')}</KV><KV k="Prossimo">{ev.next.join(' ')}</KV><KV k="Piano">{(ev.impact || []).join(' · ')}</KV></dl>
      {pending ? <Link className="btn" to="/coach"><Ic n="coach" />Proposta del coach</Link> : null}
      <details className="grp"><summary>Analisi e dati</summary><div className="body">{ul(ev.analysis)}<div className="tscroll"><table className="data"><tbody>{rows}</tbody></table></div>{w.notes ? <p className="small">{w.notes}</p> : null}</div></details>
    </article>
    {aiCoach() ? <article className="card" style={{ marginTop: 12 }}>
      <div className="row between"><h2>Parere AI</h2><span className="btns" style={{ flex: 'none' }}><button className="btn sm" onClick={() => ai.run(aiPrompt(app, t, w), text => { const x = app.S.workouts[w.id]; if (x) { x.ai = { text, at: nowISO() }; app.store.put('workouts/' + w.id, x); } })}>{w.ai ? 'Rifai' : 'Chiedi'}</button>{ai.busy ? <button className="btn sm" onClick={ai.stop}>Ferma</button> : null}</span></div>
      {aiText ? <div className="ai-out" aria-live="polite">{aiText}</div> : null}
    </article> : null}
    {w.edits && w.edits.length ? <details className="grp" style={{ marginTop: 12 }}><summary>Correzioni ({w.edits.length})</summary><div className="body">{w.edits.map((e, i) => <div key={i} className="small"><b>{dstamp(e.at)}</b>{Object.keys(e.diff).map(k => <span key={k}><br />{k}: {JSON.stringify(e.diff[k][0])} → {JSON.stringify(e.diff[k][1])}</span>)}</div>)}</div></details> : null}
    <div className="btns" style={{ marginTop: 12 }}>
      <button className="btn" onClick={() => nav('/registra?edit=' + w.id)}>Correggi</button>
      <button className="btn danger" onClick={() => { if (sure) { app.deleteWorkout(w.id); toast('Eliminato.'); nav('/analisi'); } else setSure(true); }}>{sure ? 'Conferma eliminazione' : 'Elimina'}</button>
    </div>
  </>;
}

function Ask() {
  const { app, t } = useApp(), ai = useAi(), [q, setQ] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); if (!q.trim()) { toast('Scrivi una domanda.'); return; } ai.run(aiPrompt(app, t, null, q.trim())); };
  return <details className="grp" style={{ marginTop: 12 }}><summary>Chiedi al coach AI</summary><div className="body"><form className="stack" onSubmit={submit}>
    <div className="field"><label htmlFor="ask-q" className="vh">Domanda</label><textarea id="ask-q" placeholder="La tua domanda" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="btns"><button className="btn pri" type="submit">Chiedi</button>{ai.busy ? <button className="btn" type="button" onClick={ai.stop}>Ferma</button> : null}</div>
    {ai.text ? <div className="ai-out" aria-live="polite">{ai.text}</div> : null}
  </form></div></details>;
}

export default function Analisi() {
  const { app, S } = useApp(), nav = useNavigate(), { id } = useParams();
  const w = id ? S.workouts[id] : null;
  if (w && w.eval) return <Detail key={w.id} w={w} />;
  const ws = app.liveWorkouts(), del = app.deletedWorkouts();
  return <>
    <Head title="Analisi" />
    {!ws.length ? <div className="empty">Nessun allenamento<br /><Link className="btn pri" style={{ marginTop: 12 }} to="/registra"><Ic n="plus" />Registra</Link></div>
      : <article className="card"><div className="list">{ws.map(x => <button key={x.id} className="item" onClick={() => nav('/analisi/' + x.id)}>
        <Dot s={wAsSession(x)} />
        <span className="stack grow" style={{ gap: 1 }}><span className="ttl">{wTitle(x)}{x.km ? ' · ' + P.nf(x.km) + ' km' : ''}</span><span className="meta">{E.dshort(x.date)}{x.sec && x.km ? ' · ' + P.fmtPace(x.sec / x.km) + '/km' : ''}{x.rpe ? ' · RPE ' + x.rpe : ''}</span></span>
        {x.eval ? <Chip tone={RATE[x.eval.rating]}>{cap1(x.eval.rating)}</Chip> : null}<span className="chev"><Ic n="chevR" /></span>
      </button>)}</div></article>}
    {aiCoach() ? <Ask /> : null}
    {del.length ? <details className="grp" style={{ marginTop: 12 }}><summary>Eliminati ({del.length})</summary><div className="body">{del.map(x => <div key={x.id} className="row between"><span className="small">{E.dshort(x.date) + ' · ' + wTitle(x)}{x.km ? ' ' + P.nf(x.km) + ' km' : ''}</span><button className="btn sm" onClick={() => { app.restoreWorkout(x.id); toast('Ripristinato.'); }}>Ripristina</button></div>)}</div></details> : null}
  </>;
}
