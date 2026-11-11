import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import * as P from '../../domain/plan';
import * as E from '../../domain/engine';
import type { Session, Workout } from '../../domain/types';
import { cap1, dlong, MONTHS } from '../../lib/format';
import { Chip, hasStatusChips, Head, Ic, StatusChips, wAsSession, wTitle } from '../bits';
import { useApp } from '../ctx';
import { SessionDetail } from '../SessionDetail';

type Mode = 'giorno' | 'settimana' | 'mese';
const MODES: [Mode, string][] = [['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese']];

function SessRow({ s }: { s: Session }) {
  const { app, S, t, openSheet } = useApp(), open = () => openSheet({ type: 'session', id: s.id, mode: 'view' });
  if (s.k === 'rest') return <button className="sess rest" onClick={open}><span className="ttl">Riposo</span></button>;
  const f = P.family(s), d = app.describe(s), w = s.wid ? S.workouts[s.wid] : null;
  const meta = w && w.k === 'run' && w.km ? 'Fatti ' + P.nf(w.km) + ' km' + (w.sec ? ' · ' + P.fmtPace(w.sec / w.km) + '/km' : '') : (d.pace || (d.dur ? P.fmtDur(d.dur) : ''));
  return <button className={'sess f-' + f + (s.st === 'skipped' ? ' skipped' : '')} onClick={open}>
    <span className="bar-l"></span>
    <span className="stack grow" style={{ gap: 3 }}><span className="ttl">{d.title}</span>{meta ? <span className="meta">{meta}</span> : null}{hasStatusChips(s, t) ? <span className="row"><StatusChips s={s} t={t} /></span> : null}</span>
    {s.km ? <span className="right"><span className="km">{P.nf(s.km)}<small>km</small></span></span> : null}
  </button>;
}
function ExtraRow({ w }: { w: Workout }) {
  const nav = useNavigate();
  return <button className={'sess f-' + P.family(wAsSession(w))} onClick={() => nav('/analisi/' + w.id)}>
    <span className="bar-l"></span>
    <span className="stack grow" style={{ gap: 3 }}><span className="ttl">{wTitle(w)}</span><span className="row"><Chip tone="ok" icon="check">Fatta</Chip><Chip>Extra</Chip></span></span>
    {w.km ? <span className="right"><span className="km">{P.nf(w.km)}<small>km</small></span></span> : null}
  </button>;
}

export default function Calendario() {
  const { app, t, openSheet } = useApp(), [q, setQ] = useSearchParams();
  const mode: Mode = (MODES.map(m => m[0]) as string[]).indexOf(q.get('vista') || '') >= 0 ? q.get('vista') as Mode : 'settimana';
  const d0 = /^\d{4}-\d{2}-\d{2}$/.test(q.get('data') || '') ? q.get('data') as string : t;
  const go = (m: Mode, d: string) => setQ({ vista: m, data: d }, { replace: true });
  const navBy = (n: number) => { if (mode === 'giorno') go(mode, P.addDays(d0, n)); else if (mode === 'settimana') go(mode, P.addDays(d0, 7 * n)); else { const x = P.parse(d0); go(mode, P.iso(new Date(x.getFullYear(), x.getMonth() + n, 1))); } };

  let body, label = '';
  if (mode === 'settimana') {
    const mon = P.mondayOf(d0), wk = E.weekOf(app.st(), mon, t), days = [];
    label = E.dshort(mon).slice(4) + ' – ' + E.dshort(P.addDays(mon, 6)).slice(4);
    for (let i = 0; i < 7; i++) {
      const d = P.addDays(mon, i), ss = app.sessionsOn(d), ex = app.extrasOn(d);
      days.push(<div key={d} className={'day' + (d === t ? ' is-today' : '')}><div className="dt"><span>{E.WD[i].slice(0, 3)}</span><b>{P.parse(d).getDate()}</b></div><div className="stack">{ss.length || ex.length ? <>{ss.map(s => <SessRow key={s.id} s={s} />)}{ex.map(w => <ExtraRow key={w.id} w={w} />)}</> : <span className="tiny" style={{ paddingTop: 8 }}>–</span>}</div></div>);
    }
    body = <article className="card">
      <div className="row between"><h2>{wk.wk ? 'Settimana ' + wk.wk + ' · ' + (P.PHASE[wk.ph!] || '') : 'Fuori dal piano'}</h2><span className="row">{wk.down && wk.ph !== 'race' ? <Chip tone="info">Scarico</Chip> : null}<span className="tiny num">{P.nf(wk.doneKm, wk.doneKm % 1 ? 1 : 0)} / {P.nf(wk.planKm)} km</span></span></div>
      <div>{days}</div>
    </article>;
  } else if (mode === 'mese') {
    const dd = P.parse(d0), y = dd.getFullYear(), m = dd.getMonth(), first = P.iso(new Date(y, m, 1)), start = P.mondayOf(first), cells = [];
    label = cap1(MONTHS[m]) + ' ' + y;
    for (let c = 0; c < 42; c++) {
      const dc = P.addDays(start, c), inM = P.parse(dc).getMonth() === m;
      if (c >= 35 && !inM && P.parse(P.addDays(start, 35)).getMonth() !== m) break;
      if (!inM) { cells.push(<div key={dc} className="mcell out"></div>); continue; }
      const all = app.sessionsOn(dc), sx = all.filter(s => s.k !== 'rest' && s.k !== 'mobility');
      const names = all.map(s => P.title(s) + (s.km ? ' ' + P.nf(s.km) + ' km' : '') + (s.st === 'done' ? ', fatta' : s.st === 'skipped' ? ', saltata' : '')).join('; ');
      cells.push(<button key={dc} className={'mcell' + (dc === t ? ' is-today' : '')} onClick={() => { go('giorno', dc); window.scrollTo(0, 0); }} aria-label={dlong(dc) + ': ' + (names || 'nessuna sessione')}>
        <span className="n">{P.parse(dc).getDate()}</span>
        {sx.slice(0, 2).map(s => <span key={s.id} className={'mpill f-' + P.family(s) + ' ' + s.st}><i></i>{s.km ? P.nf(s.km, s.km % 1 ? 1 : 0) : (s.k === 'strength' ? 'F' : s.k === 'swim' ? 'N' : '·')}{s.st === 'done' ? '✓' : ''}</span>)}
      </button>);
    }
    body = <article className="card">
      <div className="month">{['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(x => <div key={x} className="wdh">{x}</div>)}{cells}</div>
      <div className="legend">{[['easy', 'facile'], ['quality', 'qualità'], ['long', 'lungo'], ['race', 'test'], ['strength', 'forza'], ['swim', 'nuoto']].map(x => <span key={x[0]}><i style={{ background: 'var(--t-' + x[0] + ')' }}></i>{x[1]}</span>)}</div>
    </article>;
  } else {
    label = cap1(dlong(d0));
    const sd = app.sessionsOn(d0), ed = app.extrasOn(d0);
    body = sd.length || ed.length ? <>{sd.map(s => <article key={s.id} className="card"><SessionDetail s={s} mode="view" /></article>)}{ed.map(w => <article key={w.id} className="card"><ExtraRow w={w} /></article>)}</> : <div className="empty">Nessuna sessione</div>;
  }
  return <>
    <Head title="Calendario"><button className="btn sm" onClick={() => openSheet({ type: 'add', date: mode === 'giorno' ? d0 : t })}><Ic n="plus" />Aggiungi</button></Head>
    <div className="stack" style={{ gap: 12 }}>
      <div className="seg" role="group" aria-label="Vista">{MODES.map(m => <button key={m[0]} aria-pressed={mode === m[0]} onClick={() => go(m[0], d0)}>{m[1]}</button>)}</div>
      <div className="nav-row"><button className="icon-btn" onClick={() => navBy(-1)} aria-label="Precedente"><Ic n="chevL" /></button><span className="lbl">{label}</span><button className="btn sm" onClick={() => go(mode, t)}>Oggi</button><button className="icon-btn" onClick={() => navBy(1)} aria-label="Successivo"><Ic n="chevR" /></button></div>
      {body}
    </div>
  </>;
}
