import { Component, lazy, type ReactNode, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Actions } from '../data/actions';
import type { Store } from '../data/store';
import type { Sync } from '../data/sync';
import { today } from '../lib/clock';
import { checkReminder } from '../lib/reminders';
import { Ic } from './bits';
import { type AccountApi, type AppCtx, Ctx, type SheetState } from './ctx';
import { Frame } from './Frame';
import { SheetHost } from './Sheets';
import Altro from './views/Altro';
import Analisi from './views/Analisi';
import Calendario from './views/Calendario';
import Coach from './views/Coach';
import Guida from './views/Guida';
import Obiettivi from './views/Obiettivi';
import Oggi from './views/Oggi';
import Onboarding, { Loading } from './views/Onboarding';
import Profilo from './views/Profilo';
import Registra from './views/Registra';

const Progressi = lazy(() => import('./views/Progressi'));

class Boundary extends Component<{ at: string; children: ReactNode }, { err: Error | null; at: string }> {
  state = { err: null as Error | null, at: this.props.at };
  static getDerivedStateFromError(err: Error) { return { err }; }
  static getDerivedStateFromProps(p: { at: string }, s: { at: string }) { return p.at !== s.at ? { err: null, at: p.at } : null; }
  componentDidCatch(err: Error) { console.error(err); }
  render() {
    if (this.state.err) return <div className="banner crit"><Ic n="alert" /><div>Questa sezione non si è caricata ({this.state.err.message}). I dati sono al sicuro: prova a ricaricare la pagina.</div></div>;
    return this.props.children;
  }
}

function Views({ store, app }: { store: Store; app: Actions }) {
  const loc = useLocation();
  if (!store.loaded) return <Loading />;
  if (!app.ready()) return <Onboarding />;
  return <Boundary at={loc.pathname}><Suspense fallback={<Loading />}><Routes>
    <Route path="/" element={<Oggi />} />
    <Route path="/calendario" element={<Calendario />} />
    <Route path="/registra" element={<Registra key={loc.search} />} />
    <Route path="/analisi" element={<Analisi />} />
    <Route path="/analisi/:id" element={<Analisi />} />
    <Route path="/progressi" element={<Progressi />} />
    <Route path="/obiettivi" element={<Obiettivi />} />
    <Route path="/coach" element={<Coach />} />
    <Route path="/guida" element={<Guida />} />
    <Route path="/profilo" element={<Profilo />} />
    <Route path="/altro" element={<Altro />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense></Boundary>;
}

export function App({ store, app, sync }: { store: Store; app: Actions; sync: Sync }) {
  const [t, setT] = useState(today()), [sheet, setSheet] = useState<SheetState>(null);
  useSyncExternalStore(store.subscribe, store.getRev);
  const status = useSyncExternalStore(sync.subscribe, sync.getStatus);
  const account = useMemo<AccountApi>(() => ({ status, signIn: e => sync.signIn(e), verifyCode: (e, c) => sync.verifyCode(e, c), signOut: () => sync.signOut(), syncNow: () => { void sync.syncNow(); }, resolve: k => sync.resolve(k) }), [status, sync]);
  const ready = store.loaded && app.ready();

  // la data di oggi cambia a mezzanotte e quando l'app torna in primo piano
  useEffect(() => {
    const tick = () => setT(today()), id = window.setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick); window.addEventListener('focus', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, []);
  // il coach passa all'avvio, al cambio di giorno e quando l'app torna in primo piano
  useEffect(() => {
    if (!ready) return;
    app.coachPass();
    const vis = () => { if (!document.hidden && app.ready()) app.coachPass(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [app, ready, t]);

  // promemoria: all'avvio, al cambio di giorno, quando l'app torna in primo piano e quando cambia il piano
  const rev = store.getRev();
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => { void checkReminder(app, t); }, 1500);
    return () => window.clearTimeout(id);
  }, [app, ready, t, rev]);

  const ctx = useMemo<AppCtx>(() => ({ store, app, t, sheet, openSheet: setSheet, closeSheet: () => setSheet(null), account }), [store, app, t, sheet, account]);
  return <Ctx.Provider value={ctx}><BrowserRouter>
    <Frame><Views store={store} app={app} /></Frame>
    <SheetHost />
  </BrowserRouter></Ctx.Provider>;
}
