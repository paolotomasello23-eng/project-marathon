import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as P from '../../domain/plan';
import { num, parsePace } from '../../lib/format';
import { Head } from '../bits';
import { toast, useApp } from '../ctx';
import { ImportBox } from '../ImportBox';
import { AccountCard } from './Profilo';
import { SyncBanner } from './Oggi';

export function Loading() { return <><Head title="Carico…" /><div className="grid"><div className="skel"></div><div className="skel"></div></div></>; }

export default function Onboarding() {
  const { app, t, account } = useApp(), nav = useNavigate();
  const [f, setF] = useState({ name: '', age: '', race: 'Maratona', date: '', t10: '', goal: '', km: '' }), [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const g = /^\s*(\d)[:.,](\d{1,2})\s*$/.exec(f.goal), km = num(f.km), age = num(f.age);
    const sec10 = f.t10.indexOf(':') > 0 ? parsePace(f.t10) : (num(f.t10) || 0) * 60;
    let bad = '';
    if (!f.date || P.diffDays(t, f.date) < 56) bad = 'La gara deve essere ad almeno 8 settimane da oggi.';
    else if (!(sec10 >= 1500 && sec10 <= 5400)) bad = 'Tempo sui 10 km non valido: scrivi i minuti, per esempio 50 oppure 49:30.';
    else if (!g) bad = 'Obiettivo non valido: scrivilo come 4:00.';
    if (bad || !g) { setErr(bad); return; }
    app.createPlan({ name: f.name.trim(), age: age && !isNaN(age) ? age : null, raceName: f.race.trim() || 'Maratona', raceDate: f.date, refDist: 10, refSec: sec10, goalSec: +g[1] * 3600 + +g[2] * 60, baseKm: km && !isNaN(km) ? km : 15 });
    toast('Piano creato.'); nav('/');
  };
  return <>
    <Head title="Crea il piano" />
    <div className="stack" style={{ gap: 12 }}>
      <SyncBanner />
      {account.status.configured ? <AccountCard /> : null}
      <article className="card"><form className="stack" style={{ gap: 12 }} onSubmit={submit}>
        <div className="fgrid">
          <div className="field"><label htmlFor="ob-name">Nome</label><input id="ob-name" autoComplete="given-name" value={f.name} onChange={set('name')} /></div>
          <div className="field"><label htmlFor="ob-age">Età</label><input id="ob-age" inputMode="numeric" value={f.age} onChange={set('age')} /></div>
          <div className="field"><label htmlFor="ob-race">Gara</label><input id="ob-race" value={f.race} onChange={set('race')} /></div>
          <div className="field"><label htmlFor="ob-date">Data</label><input type="date" id="ob-date" min={P.addDays(t, 56)} required value={f.date} onChange={set('date')} /></div>
          <div className="field"><label htmlFor="ob-10k">10 km (minuti)</label><input id="ob-10k" inputMode="decimal" placeholder="50" required value={f.t10} onChange={set('t10')} /></div>
          <div className="field"><label htmlFor="ob-goal">Obiettivo</label><input id="ob-goal" placeholder="4:00" required value={f.goal} onChange={set('goal')} /></div>
          <div className="field full"><label htmlFor="ob-km">Km a settimana oggi</label><input id="ob-km" inputMode="numeric" placeholder="15" value={f.km} onChange={set('km')} /></div>
        </div>
        {err ? <div id="ob-err" className="errsum" role="alert">{err}</div> : null}
        <button className="btn pri" type="submit">Genera</button>
      </form></article>
      <ImportBox label="Oppure ripristina un backup" />
    </div>
  </>;
}
