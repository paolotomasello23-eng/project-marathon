import { type ReactNode, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as P from '../../domain/plan';
import * as E from '../../domain/engine';
import type { Change } from '../../domain/types';
import { cap1, dfull, hm } from '../../lib/format';
import { ChangeStatus, Chip, Head, Stamp, wTitle } from '../bits';
import { toast, useApp } from '../ctx';

function Ops({ c }: { c: Change }) {
  const bulk = c.ops.some(o => o.t === 'race') ? c.ops.filter(o => o.t === 'add').length : 0;
  return <div>
    {c.ops.map((o, i) => {
      if (o.t === 's') return <div key={i} className="op"><span className="tiny">{cap1(o.label || '')}</span><span className="was">{o.a || ''}</span><span className="now">{o.b || ''}</span></div>;
      if (o.t === 'pace') return <div key={i} className="op"><span className="tiny">{P.ZONE_LABEL[o.z]}</span><span className="was">{P.range(o.from)}</span><span className="now">{P.range(o.to)}</span></div>;
      if (o.t === 'goal') return <div key={i} className="op"><span className="tiny">Obiettivo</span><span className="was">{hm(o.from)}</span><span className="now">{hm(o.to)}</span></div>;
      if (o.t === 'ref') return <div key={i} className="op"><span className="tiny">Riferimento</span><span className="was">{P.nf(o.from.dist)} km in {P.fmtTime(o.from.sec)}</span><span className="now">{P.nf(o.to.dist)} km in {P.fmtTime(o.to.sec)}</span></div>;
      if (o.t === 'race') return <div key={i} className="op"><span className="tiny">Gara</span><span className="was">{dfull(o.from)}</span><span className="now">{dfull(o.to)}</span></div>;
      if (bulk) return null; // il cambio di data riallinea tutte le sessioni future: una riga di riepilogo, non l'elenco
      if (o.t === 'add') return <div key={i} className="op"><span className="tiny">{cap1(E.dshort(o.s.d))}</span><span className="now">+ {P.title(o.s)}{o.s.km ? ' ' + P.nf(o.s.km) + ' km' : ''}</span></div>;
      if (o.t === 'del') return <div key={i} className="op"><span className="tiny">{cap1(E.dshort(o.s.d))}</span><span className="was">{P.title(o.s)}{o.s.km ? ' ' + P.nf(o.s.km) + ' km' : ''}</span></div>;
      return null;
    })}
    {bulk ? <div className="op"><span className="tiny">Calendario</span><span className="now">{bulk} sessioni riallineate</span></div> : null}
  </div>;
}

function ChangeCard({ c, full, onMore }: { c: Change; full: boolean; onMore: () => void }) {
  const { app } = useApp(), has = !!((c.why && c.why.length) || c.impact);
  return <>
    <div className="row between"><span className="row"><ChangeStatus c={c} /></span><Stamp at={c.at} /></div>
    <h3>{c.title}</h3>
    {c.ops.length ? <Ops c={c} /> : null}
    {full && has ? <div className="why">{(c.why || []).map((x, i) => <p key={i}>{x}</p>)}{c.impact ? <p><b>Effetto.</b> {c.impact}</p> : null}</div> : null}
    {c.status === 'pending' || (c.status === 'applied' && c.ops.length && c.kind !== 'event') || has ? <div className="btns">
      {c.status === 'pending' ? <><button className="btn pri" onClick={() => { app.applyChange(c, 'apply'); toast('Applicata.'); }}>Accetta</button><button className="btn" onClick={() => { app.rejectChange(c.id); toast('Rifiutata.'); }}>Rifiuta</button></>
        : c.status === 'applied' && c.ops.length && c.kind !== 'event' ? <button className="btn sm" onClick={() => { app.applyChange(c, 'undo'); toast('Annullata.'); }}>Annulla</button> : null}
      {has ? <button className="btn sm" onClick={onMore} aria-expanded={full}>Perché</button> : null}
    </div> : null}
  </>;
}

const FILTERS = ['tutto', 'piano', 'ritmi', 'obiettivi', 'avvisi', 'dati'];

export default function Coach() {
  const { app, S } = useApp(), nav = useNavigate(), [q, setQ] = useSearchParams();
  const [more, setMore] = useState<string | null>(null), [showAll, setShowAll] = useState(false), [sure, setSure] = useState<string | null>(null);
  const f = FILTERS.indexOf(q.get('f') || '') >= 0 ? q.get('f') as string : 'tutto';
  const pend = app.pendingChanges(), all = Object.values(S.changes).filter(c => c.status !== 'pending');
  const card = (c: Change) => <ChangeCard c={c} full={more === c.id} onMore={() => setMore(more === c.id ? null : c.id)} />;
  const items: { key: string; at: string; cat: string; el: ReactNode }[] = all.map(c => ({ key: 'c' + c.id, at: c.at, cat: c.cat === 'pace' ? 'ritmi' : c.cat === 'goal' ? 'obiettivi' : c.cat === 'alert' ? 'avvisi' : c.cat === 'data' ? 'dati' : 'piano', el: card(c) }));
  Object.values(S.workouts).forEach(w => items.push({ key: 'w' + w.id, at: w.at || '', cat: 'dati', el: <>
    <div className="row between"><span className="row"><Chip>{w.deleted ? 'Eliminato' : 'Risultato'}</Chip></span><Stamp at={w.at || ''} /></div>
    <button className="linkbtn" style={{ textAlign: 'left' }} onClick={() => nav('/analisi/' + w.id)}>{wTitle(w) + (w.km ? ' ' + P.nf(w.km) + ' km' : '') + ' · ' + E.dshort(w.date)}</button>
    {w.edits && w.edits.length ? <span className="tiny">{w.edits.length} correzion{w.edits.length === 1 ? 'e' : 'i'}</span> : null}
  </> }));
  S.plan!.sessions.forEach(s => { if (s.st === 'skipped' && s.stAt) items.push({ key: 's' + s.id, at: s.stAt, cat: 'piano', el: <>
    <div className="row between"><span className="row"><Chip>Saltata</Chip></span><Stamp at={s.stAt} /></div>
    <span className="small">{P.title(s) + (s.km ? ' ' + P.nf(s.km) + ' km' : '') + ' · ' + E.dshort(s.d)}{s.why && s.why !== 'Non indicato' ? ' · ' + s.why.toLowerCase() : ''}</span>
  </> }); });
  Object.values(S.checkins).forEach(c => items.push({ key: 'k' + c.id, at: c.at || '', cat: 'avvisi', el: <>
    <div className="row between"><span className="row"><Chip tone={(c.pain && c.pain.lvl >= 2) || c.ill ? 'crit' : ''}>Come stai</Chip></span><Stamp at={c.at || ''} /></div>
    <span className="small">{[c.fatigue ? 'stanchezza ' + c.fatigue + '/5' : '', c.sleep ? 'sonno ' + c.sleep + '/5' : '', c.stress ? 'stress ' + c.stress + '/5' : '', c.pain ? 'dolore ' + E.PAIN_LBL[c.pain.lvl] + (c.pain.area ? ' (' + c.pain.area + ')' : '') : '', c.ill ? 'malattia' : ''].filter(Boolean).join(' · ')}{c.note ? <><br />{c.note}</> : null}</span>
  </> }));
  items.sort((a, b) => a.at < b.at ? 1 : -1);
  const shown = items.filter(i => f === 'tutto' || i.cat === f), lim = showAll ? shown.length : 30;
  const vs = (S.core!.versions || []).slice().reverse();
  return <>
    <Head title="Coach" />
    {pend.length ? <div className="grid" style={{ marginBottom: 16 }}>{pend.map(c => <article key={c.id} className="card">{card(c)}</article>)}</div> : null}
    <div className="scrollx"><div className="seg" role="group" aria-label="Filtro">{FILTERS.map(x => <button key={x} aria-pressed={f === x} onClick={() => { setQ({ f: x }, { replace: true }); setShowAll(false); }}>{cap1(x)}</button>)}</div></div>
    <article className="card" style={{ marginTop: 12 }}>
      {shown.length ? <><ul className="tl">{shown.slice(0, lim).map(i => <li key={i.key}>{i.el}</li>)}</ul>{shown.length > lim ? <button className="btn" onClick={() => setShowAll(true)}>Tutte ({shown.length})</button> : null}</> : <p className="muted small">Niente qui</p>}
    </article>
    {vs.length ? <details className="grp" style={{ marginTop: 12 }}><summary>Versioni del piano ({vs.length})</summary><div className="body"><ul className="tl">{vs.map(v => <li key={v.id}>
      <div className="row between"><span className="small"><b>v{v.n}</b> · <Stamp at={v.at} /></span>
        <button className={'btn sm' + (sure === v.id ? ' danger' : '')} onClick={() => { if (sure !== v.id) { setSure(v.id); return; } setSure(null); toast(app.restoreVersion(v.id) ? 'Versione ' + v.n + ' ripristinata.' : 'Versione non disponibile su questo dispositivo.'); }}>{sure === v.id ? 'Conferma ripristino' : 'Ripristina'}</button></div>
      <span className="tiny">{v.label || ''}</span>
    </li>)}</ul></div></details> : null}
  </>;
}
