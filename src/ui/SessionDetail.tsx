/* Dettaglio di una sessione: usato nel foglio e nella vista del giorno. */
import { useNavigate } from 'react-router-dom';
import * as P from '../domain/plan';
import * as E from '../domain/engine';
import type { Session, SOp } from '../domain/types';
import { cap1, dlong } from '../lib/format';
import { ChangeStatus, Ic, KV, Stamp, StatusChips } from './bits';
import { toast, useApp } from './ctx';

export function SessionDetail({ s, mode }: { s: Session; mode: 'view' | 'sheet' }) {
  const { app, S, t, openSheet, closeSheet } = useApp(), nav = useNavigate();
  const d = app.describe(s), w = s.wid ? S.workouts[s.wid] : null;
  const top = [s.km ? P.nf(s.km) + ' km' : null, d.dur && s.k !== 'rest' ? P.fmtDur(d.dur) : null].filter(Boolean).join(' · ');
  const hasMore = !!(d.goal || d.gain || d.fuel || d.tech || (d.recovery && d.recovery !== '—'));
  const hist = Object.values(S.changes).filter(c => c.ops && c.ops.some(o => (o as SOp).id === s.id)).sort((a, b) => a.at < b.at ? 1 : -1);
  const go = (to: string) => { closeSheet(); nav(to); };
  const sm = (m: 'skip' | 'move' | 'edit' | 'del') => openSheet({ type: 'session', id: s.id, mode: m });
  return <>
    <div className="row between"><span className="tiny">{cap1(dlong(s.d))}</span><span className="row"><StatusChips s={s} t={t} /></span></div>
    {mode !== 'sheet' ? <h2>{d.title}</h2> : null}
    {top ? <div className="big2 num">{top}</div> : null}
    {s.rec ? <p className="tiny">Recupero della corsa di {E.dshort(s.rec.from)}</p> : s.orig ? <p className="tiny">Prima: {P.title({ k: s.orig.k, s: s.orig.s })}{s.orig.km ? ' ' + P.nf(s.orig.km) + ' km' : ''} · {E.dshort(s.orig.d)}</p> : null}
    {s.st === 'skipped' && s.why && s.why !== 'Non indicato' ? <p className="tiny">Saltata: {s.why.toLowerCase()}</p> : null}
    <dl className="kv">
      <KV k="Ritmo">{d.pace}</KV>
      <KV k="Sforzo">{d.intensity && d.intensity !== '—' ? d.intensity : null}</KV>
      <KV k={s.k === 'run' ? 'Schema' : 'Cosa fare'}>{d.structure}</KV>
      <KV k="Nota">{s.note}</KV>
    </dl>
    {hasMore && s.k !== 'rest' ? <details className="grp"><summary>Dettagli</summary><div className="body"><dl className="kv">
      <KV k="Obiettivo">{d.goal}</KV><KV k="Dislivello">{d.gain}</KV><KV k="Alimentazione">{d.fuel}</KV><KV k="Tecnica">{d.tech}</KV><KV k="Recupero">{d.recovery && d.recovery !== '—' ? d.recovery : null}</KV>
    </dl></div></details> : null}
    {w ? <div className="tscroll"><table className="data"><thead><tr><th></th><th className="r">Previsto</th><th className="r">Fatto</th></tr></thead><tbody>
      {s.km ? <tr><td>Km</td><td className="r">{P.nf(s.km)}</td><td className="r">{P.nf(w.km)}</td></tr> : null}
      <tr><td>Durata</td><td className="r">{d.dur ? P.fmtDur(d.dur) : '–'}</td><td className="r">{E.minutesOf(w) ? P.fmtDur(E.minutesOf(w)) : '–'}</td></tr>
      {w.k === 'run' ? <tr><td>Ritmo</td><td className="r">{(d.pace || '–').replace('/km', '')}</td><td className="r">{w.sec && w.km ? P.fmtPace(w.sec / w.km) : '–'}</td></tr> : null}
    </tbody></table></div> : null}
    {hist.length ? <details className="grp"><summary>Modifiche ({hist.length})</summary><div className="body"><ul className="tl">{hist.map(c => {
      const o = c.ops.filter(x => (x as SOp).id === s.id)[0] as SOp | undefined;
      return <li key={c.id}><div className="row between"><ChangeStatus c={c} /><Stamp at={c.at} /></div><span className="small">{o && o.a ? o.a + ' → ' + o.b : c.title}</span></li>;
    })}</ul></div></details> : null}
    <div className="btns">
      {w ? <button className="btn pri" onClick={() => go('/analisi/' + w.id)}>Analisi</button>
        : s.st === 'skipped' ? <><button className="btn" onClick={() => { app.setPlanned(s.id); toast('Ripristinata.'); }}>Ripristina</button><button className="btn" onClick={() => go('/registra?sid=' + s.id)}>Fatta</button></>
          : <>
            {s.k !== 'rest' ? <button className="btn pri" onClick={() => go('/registra?sid=' + s.id)}><Ic n="plus" />Registra</button> : null}
            {s.k !== 'rest' && s.s !== 'race' ? <button className="btn" onClick={() => sm('skip')}>Salta</button> : null}
            {s.s !== 'race' ? <><button className="btn" onClick={() => sm('move')}>Rinvia</button><button className="btn" onClick={() => sm('edit')}>Modifica</button></> : null}
          </>}
      {s.user && !w ? <button className="btn danger" onClick={() => sm('del')}>Elimina</button> : null}
    </div>
  </>;
}
