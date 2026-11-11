import { type FormEvent, useEffect, useState } from 'react';
import * as P from '../../domain/plan';
import * as E from '../../domain/engine';
import { cap1, num } from '../../lib/format';
import { saveFile } from '../../lib/download';
import { planIcs } from '../../lib/ics';
import { disableReminders, enableReminders, type ReminderState, reminderState } from '../../lib/reminders';
import { Chip, Head } from '../bits';
import { toast, useApp } from '../ctx';
import { ImportBox } from '../ImportBox';

const v = (x: unknown): string => x == null ? '' : String(x).replace('.', ',');

function Atleta() {
  const { app, S } = useApp(), p = S.core!.profile;
  const [f, setF] = useState({ name: p.name || '', age: v(p.age), hr: v(p.hrMax), w: v(p.weight), notes: p.notes || '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const age = num(f.age), hr = num(f.hr), w = num(f.w);
    if ((age !== null && !(age >= 14 && age <= 90)) || (hr !== null && !(hr >= 120 && hr <= 230)) || (w !== null && !(w >= 35 && w <= 160))) { toast('Controlla età, frequenza massima e peso: un valore non è plausibile.'); return; }
    app.saveProfile({ name: f.name.trim(), age, hrMax: hr, weight: w, notes: f.notes.trim() }); toast('Salvato.');
  };
  return <article className="card"><h2>Atleta</h2><form className="stack" style={{ gap: 12 }} onSubmit={submit}>
    <div className="fgrid">
      <div className="field"><label htmlFor="pr-name">Nome</label><input id="pr-name" value={f.name} autoComplete="given-name" onChange={set('name')} /></div>
      <div className="field"><label htmlFor="pr-age">Età</label><input id="pr-age" inputMode="numeric" value={f.age} onChange={set('age')} /></div>
      <div className="field"><label htmlFor="pr-hr">FC max</label><input id="pr-hr" inputMode="numeric" value={f.hr} placeholder={'stima ' + E.hrMaxOf(p).v} onChange={set('hr')} /></div>
      <div className="field"><label htmlFor="pr-w">Peso (kg)</label><input id="pr-w" inputMode="decimal" value={f.w} onChange={set('w')} /></div>
      <div className="field full"><label htmlFor="pr-notes">Note</label><textarea id="pr-notes" value={f.notes} onChange={set('notes')} /></div>
    </div>
    <button className="btn pri" type="submit">Salva</button>
  </form></article>;
}

function Giorni() {
  const { app, S } = useApp(), dys = Object.assign({}, P.DEF_DAYS, S.core!.profile.days || {});
  const [d, setD] = useState({ q: dys.q, e: dys.e, long: dys.long, x: dys.x, str: dys.str });
  const sel = (id: string, k: keyof typeof d) => <select id={id} value={d[k]} onChange={e => setD({ ...d, [k]: +e.target.value })}>{E.WD.map((n, i) => <option key={i} value={i}>{cap1(n)}</option>)}</select>;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const runs = [d.q, d.e, d.long, d.x];
    if (runs.some((x, i) => runs.indexOf(x) !== i)) { toast('Le corse devono cadere in giorni diversi.'); return; }
    const n = app.saveDays(d);
    toast(n ? n + ' sessioni spostate sui nuovi giorni.' : 'Disponibilità salvata: nessuna sessione da spostare.');
  };
  return <article className="card"><h2>Giorni</h2><form className="stack" style={{ gap: 12 }} onSubmit={submit}>
    <div className="fgrid">
      <div className="field"><label htmlFor="dy-q">Qualità</label>{sel('dy-q', 'q')}</div><div className="field"><label htmlFor="dy-e">Facile</label>{sel('dy-e', 'e')}</div>
      <div className="field"><label htmlFor="dy-long">Lungo</label>{sel('dy-long', 'long')}</div><div className="field"><label htmlFor="dy-x">Quarta corsa</label>{sel('dy-x', 'x')}</div>
      <div className="field"><label htmlFor="dy-str">Forza</label>{sel('dy-str', 'str')}</div>
    </div>
    <button className="btn pri" type="submit">Aggiorna il calendario</button>
  </form></article>;
}

function Gara() {
  const { app, S, t } = useApp(), cur = S.core!.race.date, [d, setD] = useState(cur), [sure, setSure] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!d || d === cur) return;
    if (d <= t) { toast('La data deve essere nel futuro.'); return; }
    if (!sure) { setSure(true); return; }
    setSure(false);
    if (app.changeRaceDate(d)) toast('Gara spostata: calendario riallineato.');
  };
  return <article className="card"><h2>Gara</h2><form className="stack" style={{ gap: 12 }} onSubmit={submit}>
    <div className="field"><label htmlFor="rc-date">Data</label><input type="date" id="rc-date" value={d} min={P.addDays(t, 1)} required onChange={e => { setD(e.target.value); setSure(false); }} /></div>
    <button className={'btn' + (sure ? ' danger' : '')} type="submit" disabled={!d || d === cur}>{sure ? 'Conferma: riallinea il piano' : 'Sposta'}</button>
  </form></article>;
}

export function AccountCard() {
  const { account } = useApp(), s = account.status;
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false);
  if (!s.configured) return null;
  const send = async (e: FormEvent) => {
    e.preventDefault(); if (!email.trim()) return;
    setBusy(true); const err = await account.signIn(email.trim()); setBusy(false);
    if (err) toast(err); else setSent(true);
  };
  const verify = async (e: FormEvent) => {
    e.preventDefault(); if (!code.trim()) return;
    setBusy(true); const err = await account.verifyCode(email.trim(), code.trim()); setBusy(false);
    if (err) toast(err);
  };
  return <article className="card">
    <div className="row between"><h2>Account</h2>{s.email ? <Chip tone={s.choice || s.error ? 'warn' : 'ok'}>{s.choice ? 'Da scegliere' : s.pending ? s.pending + ' da inviare' : s.error ? 'Non aggiornato' : 'Sincronizzato'}</Chip> : <Chip>Solo qui</Chip>}</div>
    {s.email ? <>
      <p className="small muted">{s.email}</p>
      {s.choice ? <><p className="small">Questo dispositivo e l’account hanno piani diversi.</p><div className="btns"><button className="btn pri" onClick={() => account.resolve('remote')}>Usa l’account</button><button className="btn" onClick={() => account.resolve('local')}>Usa questo dispositivo</button></div></> : null}
      <div className="btns">{s.choice ? null : <button className="btn" onClick={() => account.syncNow()}>Sincronizza</button>}<button className="btn" onClick={() => account.signOut()}>Esci</button></div>
    </> : sent ? <form className="stack" style={{ gap: 12 }} onSubmit={verify}>
      <p className="small">Link inviato a {email}.</p>
      <div className="field"><label htmlFor="ac-code">Codice</label><input id="ac-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></div>
      <div className="btns"><button className="btn pri" type="submit" disabled={busy || !code.trim()}>Accedi</button><button className="btn" type="button" onClick={() => { setSent(false); setCode(''); }}>Indietro</button></div>
    </form>
      : <form className="stack" style={{ gap: 12 }} onSubmit={send}>
        <div className="field"><label htmlFor="ac-email">Email</label><input type="email" id="ac-email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <button className="btn pri" type="submit" disabled={busy}>Invia link</button>
      </form>}
  </article>;
}

function Dati() {
  const { app, t, account } = useApp();
  return <article className="card">
    <div className="row between"><h2>Dati</h2>{account.status.email ? <Chip tone="ok">Sincronizzati</Chip> : <Chip>Solo qui</Chip>}</div>
    <div className="btns">
      <button className="btn" onClick={() => { saveFile('maratona-madrid-backup-' + t + '.json', JSON.stringify(app.exportObject(), null, 1), 'application/json'); toast('File salvato.'); }}>Backup</button>
      <button className="btn" onClick={() => { saveFile('maratona-madrid-allenamenti-' + t + '.csv', app.csv(), 'text/csv;charset=utf-8'); toast('File salvato.'); }}>CSV</button>
      <button className="btn" onClick={() => { saveFile('madrid27-piano.ics', planIcs(app.S.plan!.sessions, s => app.describe(s), new Date(), app.S.core!.race.name || 'Madrid 27'), 'text/calendar;charset=utf-8'); toast('File salvato.'); }}>Calendario (.ics)</button>
    </div>
    <ImportBox label="Ripristina backup" />
  </article>;
}

function Promemoria() {
  const { app, t } = useApp(), [st, setSt] = useState<ReminderState | null>(null);
  useEffect(() => { let live = true; void reminderState(app.store.db).then(x => { if (live) setSt(x); }); return () => { live = false; }; }, [app]);
  if (!st) return null;
  const label = { on: 'Attivi', off: 'Spenti', blocked: 'Bloccati', unsupported: 'Non disponibili' }[st];
  return <article className="card">
    <div className="row between"><h2>Promemoria</h2><Chip tone={st === 'on' ? 'ok' : st === 'blocked' ? 'warn' : ''}>{label}</Chip></div>
    {st === 'on' ? <button className="btn" onClick={async () => setSt(await disableReminders(app.store.db))}>Disattiva</button>
      : st === 'off' ? <button className="btn" onClick={async () => { const r = await enableReminders(app, t); setSt(r); if (r === 'blocked') toast('Notifiche bloccate: riattivale dalle impostazioni del dispositivo.'); }}>Attiva</button> : null}
  </article>;
}

export default function Profilo() {
  return <>
    <Head title="Profilo" />
    <div className="grid two">
      <Atleta />
      <Giorni />
      <Gara />
      <Dati />
      <AccountCard />
      <Promemoria />
      <details className="grp"><summary>Limiti</summary><div className="body prose"><ul>
        <li>Analisi e proposte seguono regole fisse.</li>
        <li>Carico, ritmo in piano e previsione sono stime.</li>
        <li>Promemoria: alla prima apertura della giornata; ad app chiusa solo dove il dispositivo lo consente.</li>
        <li>Niente import da orologio o Strava.</li>
        <li>Senza account i dati restano solo su questo dispositivo.</li>
      </ul></div></details>
    </div>
  </>;
}
