import * as P from '../../domain/plan';
import * as E from '../../domain/engine';
import type { Criterion, Zone } from '../../domain/types';
import { hm } from '../../lib/format';
import { Chip, Head, Ic, KV, levelTone } from '../bits';
import { useApp } from '../ctx';

function Checks({ list }: { list: Criterion[] }) {
  return <ul className="checks">{list.map((c, i) => <li key={i} className={c.met === true ? 'yes' : c.met === false ? 'no' : ''}><span className="st"><Ic n={c.met === true ? 'check' : c.met === false ? 'x' : 'dash'} /></span><span>{c.label}<small>{c.detail}</small></span></li>)}</ul>;
}
function Lst({ title, a, cls }: { title: string; a: string[]; cls: string }) { return a.length ? <><h3>{title}</h3><ul className={'pts ' + cls}>{a.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null; }

export default function Obiettivi() {
  const { app, S, t, openSheet } = useApp();
  const state = app.st(), core = S.core!, pr = E.predict(state, t), l35 = E.long35Criteria(state, t), r4 = E.run4Criteria(state, t), G = core.goal.sec;
  const pk = (x: number) => P.fmtPace(x / 42.195);
  const tests = S.plan!.sessions.filter(s => s.k === 'run' && P.family(s) === 'race');
  const gh = (core.goal.history || []).slice().reverse();
  return <>
    <Head title="Obiettivi" />
    <div className="grid two">
      <article className="card">
        <div className="row between"><h2>Obiettivo</h2><button className="btn sm" onClick={() => openSheet({ type: 'goal' })}>Modifica</button></div>
        <div className="row" style={{ alignItems: 'baseline' }}><span className="big" style={{ fontSize: 44 }}>{hm(G)}</span><span className="muted num">{pk(G)}/km</span></div>
        <div className="tscroll"><table className="data">
          <thead><tr><th>Oggi <span className="src e">stima</span></th><th className="r">Tempo</th><th className="r">/km</th></tr></thead>
          <tbody>
            <tr><td>Ambizioso</td><td className="r">{hm(pr.rec.amb)}</td><td className="r">{pk(pr.rec.amb)}</td></tr>
            <tr><td><b>Realistico</b></td><td className="r"><b>{hm(pr.rec.real)}</b></td><td className="r"><b>{pk(pr.rec.real)}</b></td></tr>
            <tr><td>Prudente</td><td className="r">{hm(pr.rec.cons)}</td><td className="r">{pk(pr.rec.cons)}</td></tr>
          </tbody>
        </table></div>
      </article>
      <article className="card">
        <div className="row between"><h2>Sub-4</h2><span className="src e">stima</span></div>
        <div className="row"><Chip tone={levelTone(pr)}>{pr.levelLabel}</Chip><Chip>Confidenza {pr.conf}</Chip></div>
        <dl className="kv">
          <KV k="Previsione"><b>{hm(pr.plan)}</b> ({hm(pr.low)}–{hm(pr.high)})</KV>
          <KV k="Se fosse oggi">{hm(pr.now)}</KV>
          <KV k="Serve">{pr.needPct > 0.002 ? '10 km in ' + P.fmtTime(pr.need.k10) + ' (−' + P.nf(pr.needPct * 100, 1) + '%)' : 'Sei già in linea'}</KV>
        </dl>
        {pr.tests.length ? <div className="tscroll"><table className="data"><thead><tr><th>Test</th><th>Data</th><th className="r">Per il sub-4</th></tr></thead><tbody>{pr.tests.map(x => <tr key={x.id}><td>{x.title.replace('Test ', '')}</td><td>{E.dshort(x.d).slice(4)}</td><td className="r">{P.fmtTime(x.thr)}</td></tr>)}</tbody></table></div> : null}
        <details className="grp"><summary>Su cosa si basa</summary><div className="body an"><Lst title="Dati" a={pr.used} cls="" /><Lst title="A favore" a={pr.pos} cls="plus" /><Lst title="Criticità" a={pr.neg} cls="minus" /></div></details>
      </article>
      <article className="card">
        <div className="row between"><h2>Ritmi</h2><button className="btn sm" onClick={() => openSheet({ type: 'paces' })}>Modifica</button></div>
        <div className="tscroll"><table className="data"><tbody>{(['easy', 'long', 'mp', 'hm', 'tempo', 'interval'] as Zone[]).map(z => <tr key={z}><td>{P.ZONE_LABEL[z]}</td><td className="r"><b>{P.fmtPace(core.paces[z][0])}{core.paces[z][0] !== core.paces[z][1] ? '–' + P.fmtPace(core.paces[z][1]) : ''}</b></td></tr>)}</tbody></table></div>
      </article>
      <article className="card"><h2>Lungo da 35 km</h2><Checks list={l35.list} /></article>
      {S.plan!.sessions.some(s => s.cond === 'run4' && s.st === 'planned') ? <article className="card"><h2>Quarta corsa</h2><Checks list={r4.list} /></article> : null}
      <article className="card">
        <div className="row between"><h2>Gare e test</h2><button className="btn sm" onClick={() => openSheet({ type: 'add', date: t })}><Ic n="plus" />Aggiungi</button></div>
        <div className="list">{tests.map(s => { const w = s.wid ? S.workouts[s.wid] : null; return <button key={s.id} className="item" onClick={() => openSheet({ type: 'session', id: s.id, mode: 'view' })}>
          <span className="stack grow" style={{ gap: 1 }}><span className="ttl">{P.title(s)}</span><span className="meta">{E.dshort(s.d)}{w && w.sec ? <> · <b>{P.fmtTime(w.sec)}</b></> : null}</span></span>
          {s.st === 'done' ? <Chip tone="ok" icon="check">Fatto</Chip> : s.st === 'skipped' ? <Chip>Saltato</Chip> : null}<span className="chev"><Ic n="chevR" /></span>
        </button>; })}</div>
      </article>
      {gh.length > 1 ? <article className="card"><h2>Storico obiettivi</h2><ul className="tl">{gh.map((g, i) => <li key={i}><div className="row between"><b>{hm(g.sec)}</b><span className="tiny">{E.dshort(g.date)} · {g.by || 'te'}</span></div></li>)}</ul></article> : null}
    </div>
  </>;
}
