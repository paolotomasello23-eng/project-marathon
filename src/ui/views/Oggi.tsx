import { useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as P from '../../domain/plan';
import * as E from '../../domain/engine';
import { cap1, dlong, hm } from '../../lib/format';
import { applyUpdate, onPwa, updateReady } from '../../lib/pwa';
import { Chip, Dot, hasPaceLine, Head, Ic, levelTone, PaceLine, RATE, StatusChips, wAsSession, wTitle } from '../bits';
import { useApp } from '../ctx';

export function SyncBanner() {
  const { account } = useApp(), s = account.status;
  if (!s.email) return <div className="banner"><Ic n="info" /><span>Dati solo su questo dispositivo</span></div>;
  if (s.error && !s.pending) return <div className="banner warn"><Ic n="alert" /><span>Dati forse non aggiornati</span></div>;
  return null;
}

export default function Oggi() {
  const { app, S, t, openSheet, account } = useApp(), nav = useNavigate();
  const state = app.st(), core = S.core!, pc = core.paces, first = S.plan!.sessions[0].d;
  const wk = E.weekOf(state, P.mondayOf(t), t), pr = E.predict(state, t), l35 = E.long35Criteria(state, t), prep = E.prepStatus(state, t), fat = E.fatigueStatus(state, t), al = E.alerts(state, t), pend = app.pendingChanges();
  const d28 = P.addDays(t, -27); let km28 = 0; app.liveWorkouts().forEach(w => { if (w.k === 'run' && w.date >= d28 && w.date <= t) km28 += E.runKm(w); });

  const update = useSyncExternalStore(onPwa, updateReady);

  const ss = app.sessionsOn(t), main = ss.filter(s => s.k !== 'rest')[0] || ss[0];
  let todayCard;
  if (t < first) todayCard = <article className="card today"><span className="eyebrow">Oggi</span><div className="t-title">Si parte {dlong(first)}</div></article>;
  else if (main) {
    const d = app.describe(main), w = main.wid ? S.workouts[main.wid] : null;
    todayCard = <article className="card today">
      <div className="row between"><span className="eyebrow">Oggi</span><span className="row"><StatusChips s={main} t={t} /></span></div>
      <div className="trow"><Dot s={main} /><div className="t-title">{d.title}</div></div>
      {hasPaceLine(main, d) ? <PaceLine s={main} d={d} /> : null}
      {w ? <div className="row"><Chip tone={RATE[w.eval!.rating]}>{cap1(w.eval!.rating)}</Chip><button className="linkbtn" onClick={() => nav('/analisi/' + w.id)}>Analisi</button></div>
        : <div className="btns">{main.k !== 'rest' ? <button className="btn pri" onClick={() => nav('/registra?sid=' + main.id)}><Ic n="plus" />Registra</button> : null}<button className="btn" onClick={() => openSheet({ type: 'session', id: main.id, mode: 'view' })}>Dettagli</button></div>}
    </article>;
  } else todayCard = <article className="card today"><span className="eyebrow">Oggi</span><div className="t-title">{t > core.race.date ? 'Piano concluso' : 'Giorno libero'}</div></article>;

  const nx = app.nextSession(P.addDays(t, 1)), lw = app.liveWorkouts()[0];
  const near = nx || lw ? <article className="card near">
    {nx ? <><span className="eyebrow">Prossimo</span><button className="item" onClick={() => openSheet({ type: 'session', id: nx.id, mode: 'view' })}><Dot s={nx} /><span className="stack grow" style={{ gap: 1 }}><span className="ttl">{P.title(nx)}</span><span className="meta">{E.dshort(nx.d)}{nx.km ? ' · ' + P.nf(nx.km) + ' km' : ''}</span></span><span className="chev"><Ic n="chevR" /></span></button></> : null}
    {lw ? <><span className="eyebrow">Ultimo</span><button className="item" onClick={() => nav('/analisi/' + lw.id)}><Dot s={wAsSession(lw)} /><span className="stack grow" style={{ gap: 1 }}><span className="ttl">{wTitle(lw)}</span><span className="meta">{E.dshort(lw.date)}{lw.km ? ' · ' + P.nf(lw.km) + ' km' : ''}{lw.eval && lw.eval.calc.pace ? ' · ' + P.fmtPace(lw.eval.calc.pace) + '/km' : ''}</span></span><Chip tone={RATE[lw.eval!.rating]}>{cap1(lw.eval!.rating)}</Chip><span className="chev"><Ic n="chevR" /></span></button></> : null}
  </article> : null;

  const wkPct = wk.planKm ? Math.min(100, wk.doneKm / wk.planKm * 100) : 0;
  const G = core.goal.sec, lo = Math.min(pr.low, G) - 300, hi = Math.max(pr.high, G) + 300, px = (x: number) => ((x - lo) / (hi - lo) * 100).toFixed(1) + '%';
  const lp = Math.min(100, l35.longest / 35 * 100);
  const weeks = E.allWeeks(state, t), mx = Math.max.apply(null, weeks.map(w => w.ph === 'race' ? 0 : w.planKm).concat([1]));
  const banners = <>
    {update ? <button className="banner" onClick={applyUpdate}><Ic n="info" /><span>Aggiornamento pronto</span><Ic n="chevR" /></button> : null}
    <SyncBanner />
    {al.map((a, i) => { const tone = a.lvl === 'crit' ? ' crit' : a.lvl === 'warn' ? ' warn' : '', inner = <><Ic n={a.lvl === 'info' ? 'info' : 'alert'} /><span>{a.text}</span></>; return a.act ? <button key={i} className={'banner' + tone} onClick={() => openSheet({ type: 'stale' })}>{inner}<Ic n="chevR" /></button> : <div key={i} className={'banner' + tone}>{inner}</div>; })}
    {pend.length ? <Link className="banner" to="/coach"><Ic n="coach" /><span>{pend.length === 1 ? pend[0].title : pend.length + ' proposte del coach'}</span><Ic n="chevR" /></Link> : null}
  </>;

  return <>
    <Head title="Oggi" />
    <div className="grid two">
      {update || !account.status.email || (account.status.error && !account.status.pending) || al.length || pend.length ? <div className="stack span2">{banners}</div> : null}
      {todayCard}
      {near}
      <div className="stats span2">
        <div className="stat"><span className="lab">Obiettivo</span><span className="big">{hm(core.goal.sec)}</span></div>
        <div className="stat"><span className="lab">Passo gara</span><span className="big">{P.fmtPace(pc.mp[0])}–{P.fmtPace(pc.mp[1])}</span></div>
        <div className="stat"><span className="lab">Settimana</span><span className="big">{P.nf(wk.doneKm, wk.doneKm % 1 ? 1 : 0)}<small>/ {P.nf(wk.planKm)} km</small></span><div className="bar" role="img" aria-label={Math.round(wkPct) + '% dei km previsti'}><span style={{ width: wkPct + '%' }}></span></div></div>
        <div className="stat"><span className="lab">4 settimane</span><span className="big">{P.nf(km28, 0)}<small>km</small></span></div>
      </div>
      <article className="card">
        <div className="pair"><span className="lab">Preparazione</span><Chip tone={prep.tone}>{prep.label}</Chip></div>
        <div className="pair"><span className="lab">Carico</span><Chip tone={fat.tone}>{fat.label}</Chip></div>
        <button className="btn" onClick={() => openSheet({ type: 'checkin' })}><Ic n="heart" />Come stai?</button>
      </article>
      <article className="card">
        <div className="row between"><h2>Sub-4</h2><Link className="linkbtn" to="/obiettivi">Dettagli</Link></div>
        <div className="row"><Chip tone={levelTone(pr)}>{pr.levelLabel}</Chip><span className="src e">stima</span></div>
        <div className="rng" role="img" aria-label={'Stima tra ' + hm(pr.low) + ' e ' + hm(pr.high) + ', centrale ' + hm(pr.plan) + '; obiettivo ' + hm(G)}>
          <span className="track"></span><span className="band" style={{ left: px(pr.low), width: 'calc(' + px(pr.high) + ' - ' + px(pr.low) + ')' }}></span>
          <span className="goal" style={{ left: px(G) }}></span><span className="lb g" style={{ left: px(G) }}>obiettivo</span><span className="pt" style={{ left: px(pr.plan) }}></span>
          <span className="lb" style={{ left: px(pr.low) }}>{hm(pr.low)}</span><span className="lb c" style={{ left: px(pr.plan) }}>{hm(pr.plan)}</span><span className="lb" style={{ left: px(pr.high) }}>{hm(pr.high)}</span>
        </div>
      </article>
      <article className="card">
        <div className="row between"><h2>Verso i 35 km</h2><Link className="linkbtn" to="/obiettivi">Criteri {l35.metCount}/{l35.list.length}</Link></div>
        <span className="big">{P.nf(l35.longest)}<small>/ 35 km</small></span>
        <div className="miles"><div className="bar" role="img" aria-label={Math.round(lp) + '% di 35 km'}><span style={{ width: lp + '%' }}></span></div>{[20, 28, 32, 35].map(m => <span key={m} className="mk" style={{ left: (m / 35 * 100) + '%' }}>{m}</span>)}</div>
      </article>
      <article className="card span2">
        <div className="row between"><h2>Piano</h2><span className="tiny">picco {P.nf(mx, 0)} km</span></div>
        <div className="roadmap" role="img" aria-label={'Chilometri previsti e fatti in ognuna delle ' + weeks.length + ' settimane'}>
          {weeks.map(w => { const race = w.ph === 'race', p = race ? 0.55 : w.planKm / mx, dn = w.planKm ? Math.min(1, w.doneKm / w.planKm) : 0; return <div key={w.mon} className={'w' + (w.mon === P.mondayOf(t) ? ' cur' : '') + (race ? ' race' : '')} title={'Settimana ' + w.wk + ': ' + P.nf(w.planKm, 0) + ' km previsti, ' + P.nf(w.doneKm, 0) + ' fatti'}><div className="p" style={{ height: Math.max(4, p * 100).toFixed(0) + '%' }}><div className="d" style={{ height: (dn * 100).toFixed(0) + '%' }}></div></div></div>; })}
        </div>
        <div className="roadmap-ax"><span>sett. 1</span><span>gara</span></div>
      </article>
    </div>
  </>;
}
