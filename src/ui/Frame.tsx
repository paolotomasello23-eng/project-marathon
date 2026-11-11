/* Cornice: striscia in alto (conto alla rovescia e linea blu), barra laterale, schede in basso. */
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import * as P from '../domain/plan';
import * as E from '../domain/engine';
import type { SyncStatus } from '../data/sync';
import { Ic } from './bits';
import { onToast, useApp } from './ctx';

export const NAV: [string, string, string][] = [['/', 'Oggi', 'home'], ['/calendario', 'Calendario', 'cal'], ['/registra', 'Registra', 'plus'], ['/analisi', 'Analisi', 'search'], ['/progressi', 'Progressi', 'chart'], ['/obiettivi', 'Obiettivi', 'target'], ['/coach', 'Coach', 'coach'], ['/guida', 'Guida', 'book'], ['/profilo', 'Profilo', 'user']];
const MORE = ['/analisi', '/obiettivi', '/coach', '/guida', '/profilo', '/altro'];
function isCur(path: string, to: string): boolean { return to === '/' ? path === '/' : path === to || path.indexOf(to + '/') === 0; }

export function syncLabel(s: SyncStatus): [string, string] {
  if (!s.email) return ['off', 'Solo locale'];
  if (s.choice) return ['err', 'Da scegliere'];
  if (s.pending) return s.error ? ['err', s.pending + ' da inviare'] : ['busy', 'Salvataggio…'];
  if (s.error) return ['err', 'Non aggiornato'];
  if (!s.first) return ['busy', 'Carico…'];
  return ['', 'Sincronizzato'];
}
function SyncBadge() {
  const { account } = useApp(), [cls, txt] = syncLabel(account.status);
  return <span id="sync" className={'sync ' + cls}><i></i>{txt}</span>;
}

function Strip() {
  const { app, S, t } = useApp();
  if (!app.ready()) return <div className="strip-in"><div className="strip-row top"><span className="eyebrow">Marathon Project</span></div><div className="strip-row"><div className="count">Madrid</div><SyncBadge /></div><div className="line"></div></div>;
  const core = S.core!, plan = S.plan!, race = core.race, days = P.diffDays(t, race.date), first = plan.sessions[0].d, tot = Math.max(1, P.diffDays(first, race.date));
  const frac = Math.max(0, Math.min(1, P.diffDays(first, t) / tot)), wk = E.weekOf(app.st(), P.mondayOf(t), t), nW = E.planMondays({ plan }).length;
  const ticks = []; for (let i = 4; i < nW; i += 4) ticks.push(<span key={i} className="line-tick" style={{ left: (i * 7 / tot * 100).toFixed(2) + '%' }}></span>);
  const pct = (frac * 100).toFixed(2) + '%';
  return <div className="strip-in">
    <div className="strip-row top">
      <span className="eyebrow">{race.name} · {E.dshort(race.date).slice(4)}<span className="w-long"> {race.date.slice(0, 4)}</span></span>
      {wk.wk ? <span className="strip-side"><b><span className="w-long">Settimana</span><span className="w-short">Sett.</span> {wk.wk}</b> di {nW} · {P.PHASE[wk.ph!] || ''}</span> : null}
    </div>
    <div className="strip-row">
      <div className="count num">{days > 0 ? <>{days}<small>{days === 1 ? 'giorno' : 'giorni'}</small></> : days === 0 ? 'Oggi si corre' : 'Gara conclusa'}</div>
      <SyncBadge />
    </div>
    <div className="line" role="img" aria-label={'Avanzamento del piano: ' + Math.round(frac * 100) + '%'}>{ticks}<span className="line-fill" style={{ width: pct }}></span><span className="line-dot" style={{ left: pct }}></span><span className="line-end"><Ic n="flag" /></span></div>
  </div>;
}

function Badge({ n }: { n: number }) { return n ? <span className="badge" aria-label={n + ' proposte in attesa'}>{n}</span> : null; }

function Rail() {
  const { app } = useApp(), { pathname } = useLocation(), n = app.ready() ? app.pendingChanges().length : 0;
  return <nav className="rail" id="rail" aria-label="Sezioni">
    {NAV.map((x, i) => <span key={x[0]} style={{ display: 'contents' }}>{i === 3 || i === 7 ? <div className="sep"></div> : null}<Link to={x[0]} aria-current={isCur(pathname, x[0]) ? 'page' : undefined}><Ic n={x[2]} /><span>{x[1]}</span>{x[0] === '/coach' ? <Badge n={n} /> : null}</Link></span>)}
  </nav>;
}

function Tabs() {
  const { app } = useApp(), { pathname } = useLocation(), n = app.ready() ? app.pendingChanges().length : 0;
  const tab = (to: string, lab: string, icn: string, cur: boolean, badge?: boolean) => <li><Link to={to} aria-current={cur ? 'page' : undefined}><Ic n={icn} /><span>{lab}</span>{badge ? <Badge n={n} /> : null}</Link></li>;
  return <nav className="tabs" id="tabs" aria-label="Navigazione principale"><ul>
    {tab('/', 'Oggi', 'home', pathname === '/')}
    {tab('/calendario', 'Calendario', 'cal', isCur(pathname, '/calendario'))}
    <li><Link className="log" to="/registra" aria-current={isCur(pathname, '/registra') ? 'page' : undefined}><span className="fab"><Ic n="plus" /></span><em>Registra</em></Link></li>
    {tab('/progressi', 'Progressi', 'chart', isCur(pathname, '/progressi'))}
    {tab('/altro', 'Altro', 'more', MORE.some(m => isCur(pathname, m)), true)}
  </ul></nav>;
}

function Toasts() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]), seq = useRef(0);
  useEffect(() => onToast(msg => {
    const id = ++seq.current; setItems(a => a.concat([{ id, msg }]));
    window.setTimeout(() => setItems(a => a.filter(x => x.id !== id)), 4200);
  }), []);
  return <div id="toast" role="status" aria-live="polite">{items.map(x => <div key={x.id}>{x.msg}</div>)}</div>;
}

export function Frame({ children }: { children?: React.ReactNode }) {
  const { pathname } = useLocation(), main = useRef<HTMLElement>(null), firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    window.scrollTo(0, 0);
    const m = main.current; if (m && document.activeElement && document.activeElement !== document.body) { try { m.focus({ preventScroll: true }); } catch { /* niente */ } }
  }, [pathname]);
  return <div className="app">
    <header className="strip"><Strip /></header>
    <div className="shell">
      <Rail />
      <main id="view" tabIndex={-1} ref={main}>{children || <Outlet />}</main>
    </div>
    <Tabs />
    <Toasts />
  </div>;
}
