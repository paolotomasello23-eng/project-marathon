/* Ripristino da un file di backup: legge, mostra cosa contiene, chiede conferma. */
import { type ChangeEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Backup, isBackup } from '../data/actions';
import { nowISO } from '../lib/clock';
import { dstamp } from '../lib/format';
import { Ic } from './bits';
import { toast, useApp } from './ctx';

export function ImportBox({ label }: { label: string }) {
  const { app } = useApp(), nav = useNavigate();
  const [pending, setPending] = useState<Backup | null>(null), [err, setErr] = useState('');
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const fr = new FileReader();
    fr.onload = () => { try { const o: unknown = JSON.parse(String(fr.result)); if (!isBackup(o)) throw new Error('x'); setPending(o); setErr(''); } catch { setPending(null); setErr('Il file non è un backup di questa app.'); } };
    fr.onerror = () => { setPending(null); setErr('Non riesco a leggere il file.'); };
    fr.readAsText(file);
  };
  const go = () => { if (!pending) return; try { app.importObject(pending); app.coachPass(); setPending(null); toast('Backup ripristinato.'); nav('/'); } catch (e) { toast((e as Error).message); } };
  return <>
    <div className="field"><label htmlFor="imp-file">{label}</label><input type="file" id="imp-file" accept="application/json,.json" onChange={onFile} /></div>
    <div id="imp-box">
      {pending ? <div className="banner"><Ic n="info" /><div>Backup del {dstamp(pending.exportedAt || nowISO())}: {pending.plan.sessions.length} sessioni, {Object.keys(pending.workouts || {}).length} allenamenti. <button className="linkbtn" onClick={go}>Ripristina questo backup</button></div></div> : null}
      {err ? <div className="banner crit"><Ic n="alert" /><div>{err}</div></div> : null}
    </div>
  </>;
}
