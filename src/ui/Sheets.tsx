/* Fogli modali: sessione (dettaglio, salta, rinvia, modifica, elimina), aggiungi, come stai, da confermare, obiettivo, ritmi. */
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as P from '../domain/plan';
import * as E from '../domain/engine';
import type { SkipResult } from '../data/actions';
import type { Pain, PaceRange, Zone } from '../domain/types';
import { cap1, dlong, num, parsePace } from '../lib/format';
import { Ic, Scale } from './bits';
import { type SessionMode, toast, useApp } from './ctx';
import { SessionDetail } from './SessionDetail';

export const SKIP_WHY = ['Impegni', 'Stanchezza', 'Meteo', 'Dolore o fastidio', 'Malattia', 'Altro'];
export const AREAS = ['piede', 'caviglia', 'tendine d’Achille', 'polpaccio', 'tibia', 'ginocchio', 'coscia anteriore', 'coscia posteriore', 'anca o gluteo', 'schiena', 'altro'];
const ZONES: Zone[] = ['easy', 'long', 'mp', 'hm', 'tempo', 'interval'];
export function skipMsg(r: SkipResult): string { return r.change ? 'Saltata. Recupero ' + E.dshort(r.day as string) + '.' : 'Saltata.' + (r.blocked ? ' ' + r.blocked : ''); }

export interface PainValue { lvl: number; area: string; note: string }
export const noPain = (p?: Pain | null): PainValue => ({ lvl: (p && p.lvl) || 0, area: (p && p.area) || '', note: (p && p.note) || '' });
export function painOut(v: PainValue): Pain | null { return v.lvl ? { lvl: v.lvl, area: v.area || null, note: v.note.trim() || null } : null; }
export function PainFields({ p, value, onChange }: { p: string; value: PainValue; onChange: (v: PainValue) => void }) {
  return <fieldset className="fs"><legend className="lab">Dolore</legend>
    <div className="opts c4">{E.PAIN_LBL.map((l, i) => <label key={i}><input type="radio" name={p + '-pain'} value={i} checked={value.lvl === i} onChange={() => onChange({ ...value, lvl: i })} /><span>{cap1(l)}</span></label>)}</div>
    <div className="fgrid">
      <div className="field"><label htmlFor={p + '-area'}>Zona</label><select id={p + '-area'} value={value.area} onChange={e => onChange({ ...value, area: e.target.value })}><option value="">—</option>{AREAS.map(a => <option key={a}>{a}</option>)}</select></div>
      <div className="field"><label htmlFor={p + '-pnote'}>Nota</label><input id={p + '-pnote'} value={value.note} onChange={e => onChange({ ...value, note: e.target.value })} /></div>
    </div>
  </fieldset>;
}

function Back({ id }: { id: string }) { const { openSheet } = useApp(); return <button className="btn" type="button" onClick={() => openSheet({ type: 'session', id, mode: 'view' })}>Indietro</button>; }

function SkipForm({ id }: { id: string }) {
  const { app, t, openSheet, closeSheet } = useApp(), s = app.session(id)!;
  const [why, setWhy] = useState(SKIP_WHY[0]);
  const [blk, opts] = (() => { if (s.k !== 'run') return [null, [] as string[]]; const b = E.recoveryBlocked(app.st(), s, t, ''); return [b, b ? [] : E.recoveryOptions(app.st(), s, t)] as const; })();
  const [day, setDay] = useState(opts[0] || '');
  const no = why === 'Dolore o fastidio' || why === 'Malattia';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    toast(skipMsg(app.skipSession(id, why, opts.length ? day : null)));
    if (no) openSheet({ type: 'checkin', ill: why === 'Malattia' }); else closeSheet();
  };
  return <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
    <div className="field"><label htmlFor="sk-why">Motivo</label><select id="sk-why" value={why} onChange={e => setWhy(e.target.value)}>{SKIP_WHY.map(x => <option key={x}>{x}</option>)}</select></div>
    {s.k === 'run' ? <>
      <div className="field" id="sk-rec" hidden={no}>
        <label htmlFor="sk-day">Recupero</label>
        {opts.length ? <select id="sk-day" value={day} onChange={e => setDay(e.target.value)}>{opts.map(x => <option key={x} value={x}>{cap1(dlong(x))}</option>)}<option value="none">Non recuperare</option></select>
          : <p className="small muted">{blk || 'Nessun giorno adatto: viene assorbita.'}</p>}
      </div>
      <p className="small muted" id="sk-norec" hidden={!no}>Con dolore o malattia non si recupera.</p>
    </> : null}
    <div className="btns"><button className="btn pri" type="submit">Salta</button><Back id={id} /></div>
  </form>;
}

function MoveForm({ id }: { id: string }) {
  const { app, S, t, closeSheet } = useApp(), s = app.session(id)!, [d, setD] = useState(s.d);
  const submit = (e: FormEvent) => { e.preventDefault(); if (app.moveSession(id, d)) toast('Spostata a ' + E.dshort(d) + '.'); closeSheet(); };
  return <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
    <div className="field"><label htmlFor="mv-date">Nuova data</label><input type="date" id="mv-date" value={d} min={t} max={S.core!.race.date} required onChange={e => setD(e.target.value)} /></div>
    <div className="btns"><button className="btn pri" type="submit">Sposta</button><Back id={id} /></div>
  </form>;
}

function EditForm({ id }: { id: string }) {
  const { app, closeSheet } = useApp(), s = app.session(id)!;
  const [sub, setSub] = useState(s.s), [km, setKm] = useState(P.nf(s.km)), [note, setNote] = useState(s.note || '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    let k: number | null = null;
    if (s.k === 'run') { k = num(km); if (k === null || isNaN(k) || k < 1 || k > 60) { toast('Distanza non valida: tra 1 e 60 km.'); return; } }
    if (app.editSession(id, { km: k, sub, note: note.trim() })) toast('Modificata.');
    closeSheet();
  };
  return <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
    {s.k === 'run' ? <div className="fgrid">
      <div className="field"><label htmlFor="ed-sub">Tipo</label><select id="ed-sub" value={sub} onChange={e => setSub(e.target.value)}>{P.SUB_OPTIONS.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></div>
      <div className="field"><label htmlFor="ed-km">Km</label><input id="ed-km" inputMode="decimal" value={km} onChange={e => setKm(e.target.value)} /></div>
    </div> : null}
    <div className="field"><label htmlFor="ed-note">Nota</label><textarea id="ed-note" value={note} onChange={e => setNote(e.target.value)} /></div>
    <div className="btns"><button className="btn pri" type="submit">Salva</button><Back id={id} /></div>
  </form>;
}

function SessionSheet({ id, mode }: { id: string; mode: SessionMode }) {
  const { app, closeSheet } = useApp(), s = app.session(id);
  if (!s) return null;
  if (mode === 'skip') return <SkipForm id={id} />;
  if (mode === 'move') return <MoveForm id={id} />;
  if (mode === 'edit') return <EditForm id={id} />;
  if (mode === 'del') return <div className="btns"><button className="btn danger" onClick={() => { app.deleteSession(id); toast('Eliminata.'); closeSheet(); }}>Elimina</button><Back id={id} /></div>;
  return <SessionDetail s={s} mode="sheet" />;
}

function AddSheet({ date }: { date: string }) {
  const { app, closeSheet } = useApp(), nav = useNavigate(), loc = useLocation();
  const [f, setF] = useState({ d: date, k: 'run', sub: 'easy', km: '', title: '', note: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const km = num(f.km);
    if (!f.d) { toast('Inserisci la data.'); return; }
    if (f.k === 'run' && (km === null || isNaN(km) || km < 1 || km > 60)) { toast('Per una corsa inserisci la distanza, tra 1 e 60 km.'); return; }
    app.addSession({ d: f.d, k: f.k as 'run', sub: f.sub, km, title: f.title.trim(), note: f.note.trim() });
    toast('Aggiunta.'); closeSheet();
    if (loc.pathname === '/calendario') { const q = new URLSearchParams(loc.search); q.set('data', f.d); nav('/calendario?' + q.toString(), { replace: true }); }
  };
  return <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
    <div className="fgrid">
      <div className="field"><label htmlFor="ad-date">Data</label><input type="date" id="ad-date" value={f.d} required onChange={set('d')} /></div>
      <div className="field"><label htmlFor="ad-kind">Attività</label><select id="ad-kind" value={f.k} onChange={set('k')}><option value="run">Corsa</option><option value="strength">Forza</option><option value="swim">Nuoto</option><option value="mobility">Mobilità</option></select></div>
      <div className="field"><label htmlFor="ad-sub">Tipo</label><select id="ad-sub" value={f.sub} onChange={set('sub')}>{P.SUB_OPTIONS.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></div>
      <div className="field"><label htmlFor="ad-km">Km</label><input id="ad-km" inputMode="decimal" value={f.km} onChange={set('km')} /></div>
      <div className="field full"><label htmlFor="ad-title">Nome</label><input id="ad-title" value={f.title} onChange={set('title')} /></div>
      <div className="field full"><label htmlFor="ad-note">Nota</label><textarea id="ad-note" value={f.note} onChange={set('note')} /></div>
    </div>
    <button className="btn pri" type="submit">Aggiungi</button>
  </form>;
}

function CheckinSheet({ ill }: { ill?: boolean }) {
  const { app, t, closeSheet } = useApp(), nav = useNavigate();
  const [fat, setFat] = useState<number | null>(null), [sleep, setSleep] = useState<number | null>(null), [stress, setStress] = useState<number | null>(null);
  const [pain, setPain] = useState<PainValue>(noPain()), [sick, setSick] = useState(!!ill), [note, setNote] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c: Record<string, unknown> = { date: t, fatigue: fat, sleep, stress, pain: painOut(pain), ill: sick || null, note: note.trim() || null };
    Object.keys(c).forEach(k => { if (c[k] === null) delete c[k]; });
    if (Object.keys(c).length <= 1) { toast('Indica almeno un dato.'); return; }
    const props = app.saveCheckin(c as { date: string }), ap = props.filter(p => p.status === 'applied').length, pe = props.length - ap;
    toast(ap ? 'Salvato: carico ridotto.' : pe ? 'Salvato: c’è una proposta.' : 'Salvato.'); closeSheet(); if (props.length) nav('/coach');
  };
  return <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
    <fieldset className="fs"><legend className="lab">Stanchezza <small>5 = esausto</small></legend><Scale name="ci-fat" value={fat} onChange={setFat} /></fieldset>
    <fieldset className="fs"><legend className="lab">Sonno <small>5 = ottimo</small></legend><Scale name="ci-sleep" value={sleep} onChange={setSleep} /></fieldset>
    <fieldset className="fs"><legend className="lab">Stress <small>5 = alto</small></legend><Scale name="ci-stress" value={stress} onChange={setStress} /></fieldset>
    <PainFields p="ci" value={pain} onChange={setPain} />
    <label className="check"><input type="checkbox" id="ci-ill" checked={sick} onChange={e => setSick(e.target.checked)} /> <span>Malato o con febbre</span></label>
    <div className="field"><label htmlFor="ci-note">Note</label><textarea id="ci-note" value={note} onChange={e => setNote(e.target.value)} /></div>
    <button className="btn pri" type="submit">Salva</button>
  </form>;
}

function StaleSheet() {
  const { app, S, t, closeSheet } = useApp(), nav = useNavigate();
  const ss = S.plan!.sessions.filter(s => s.k === 'run' && s.st === 'planned' && s.d < t && s.d >= P.addDays(t, -21));
  useEffect(() => { if (!ss.length) closeSheet(); });
  return <>{ss.map(s => <div key={s.id} className="stack" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
    <span className="small"><b>{cap1(E.dshort(s.d))}</b> · {P.title(s)}{s.km ? ' ' + P.nf(s.km) + ' km' : ''}</span>
    <div className="btns"><button className="btn sm pri" onClick={() => { closeSheet(); nav('/registra?sid=' + s.id); }}>Fatta</button><button className="btn sm" onClick={() => toast(skipMsg(app.skipSession(s.id, 'Non indicato', null)))}>Saltata</button></div>
  </div>)}</>;
}

function GoalSheet() {
  const { app, S, closeSheet } = useApp(), g = S.core!.goal.sec;
  const [h, setH] = useState(String(Math.floor(g / 3600))), [m, setM] = useState(String(Math.floor(g % 3600 / 60)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const hh = num(h), mm = num(m) || 0, sec = (hh || 0) * 3600 + mm * 60;
    if (!(sec >= 9000 && sec <= 25200) || mm > 59) { toast('Obiettivo non valido: tra 2:30 e 7:00.'); return; }
    if (app.setGoal(sec)) toast('Salvato.');
    closeSheet();
  };
  return <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
    <div className="field"><span className="lab" id="g-l">Tempo</span><div className="time3" role="group" aria-labelledby="g-l" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
      <span><input id="g-h" inputMode="numeric" value={h} aria-label="Ore" onChange={e => setH(e.target.value)} /><em>h</em></span>
      <span><input id="g-m" inputMode="numeric" value={m} aria-label="Minuti" onChange={e => setM(e.target.value)} /><em>min</em></span>
    </div></div>
    <button className="btn pri" type="submit">Salva</button>
  </form>;
}

function PaceSheet() {
  const { app, S, closeSheet } = useApp(), pc = S.core!.paces;
  const [v, setV] = useState<Record<string, string>>(() => { const o: Record<string, string> = {}; ZONES.forEach(z => { o[z + '0'] = P.fmtPace(pc[z][0]); o[z + '1'] = P.fmtPace(pc[z][1]); }); return o; });
  const [err, setErr] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<Zone, PaceRange>> = {}; let bad = '';
    ZONES.forEach(z => { const a = parsePace(v[z + '0']), b = parsePace(v[z + '1']); if (isNaN(a) || isNaN(b) || a < 150 || b > 600 || a > b) bad = P.ZONE_LABEL[z] + ': scrivi due ritmi come 5:35 e 5:40, dal più veloce al più lento.'; else next[z] = [a, b]; });
    if (bad) { setErr(bad); return; }
    if (app.setPaces(next)) toast('Salvato.');
    closeSheet();
  };
  return <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
    {ZONES.map(z => <div className="field" key={z}><span className="lab" id={'pz-' + z}>{P.ZONE_LABEL[z]}</span><div className="fgrid" role="group" aria-labelledby={'pz-' + z}>
      <input id={'p-' + z + '-0'} value={v[z + '0']} aria-label="Da" inputMode="numeric" onChange={e => setV({ ...v, [z + '0']: e.target.value })} />
      <input id={'p-' + z + '-1'} value={v[z + '1']} aria-label="A" inputMode="numeric" onChange={e => setV({ ...v, [z + '1']: e.target.value })} />
    </div></div>)}
    {err ? <div id="p-err" className="errsum" role="alert">{err}</div> : null}
    <button className="btn pri" type="submit">Salva</button>
  </form>;
}

/** Il foglio è un <dialog> unico: il contenuto dipende dallo stato in contesto. */
export function SheetHost() {
  const { app, sheet, closeSheet } = useApp(), ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (sheet && !d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
    else if (!sheet && d.open) { if (d.close) d.close(); else d.removeAttribute('open'); }
  }, [sheet]);
  let title = '', body: ReactNode = null;
  if (sheet && app.ready()) {
    if (sheet.type === 'session') { const s = app.session(sheet.id); title = sheet.mode === 'del' ? 'Eliminare la sessione?' : s ? app.describe(s).title : ''; body = <SessionSheet key={sheet.id + sheet.mode} id={sheet.id} mode={sheet.mode} />; }
    else if (sheet.type === 'add') { title = 'Aggiungi'; body = <AddSheet date={sheet.date} />; }
    else if (sheet.type === 'checkin') { title = 'Come stai?'; body = <CheckinSheet ill={sheet.ill} />; }
    else if (sheet.type === 'stale') { title = 'Da confermare'; body = <StaleSheet />; }
    else if (sheet.type === 'goal') { title = 'Obiettivo'; body = <GoalSheet />; }
    else if (sheet.type === 'paces') { title = 'Ritmi'; body = <PaceSheet />; }
  }
  return <dialog id="sheet" ref={ref} aria-labelledby="sheet-title" onClose={() => closeSheet()} onClick={e => { if (e.target === ref.current) closeSheet(); }}>
    {sheet ? <>
      <div className="sheet-h"><h2 id="sheet-title">{title}</h2><button className="icon-btn" onClick={() => closeSheet()} aria-label="Chiudi"><Ic n="x" /></button></div>
      <div className="sheet-b">{body}</div>
    </> : null}
  </dialog>;
}
