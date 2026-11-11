/* Componenti di base: icone, etichette, intestazioni. Stesse classi e stessi testi del prototipo. */
import type { ReactNode } from 'react';
import * as P from '../domain/plan';
import type { Change, Description, Prediction, Rating, Session, Tone, Workout } from '../domain/types';
import { dstamp } from '../lib/format';

const ICONS: Record<string, string> = {
  run: '<circle cx="15" cy="4.5" r="2"/><path d="M6 21l3.5-5 3-2-1.5-4.5 4 1.5 2 3h3M11 9.5L8 11l-1 3M12.5 14l3 2.5V21"/>',
  strength: '<path d="M3 9v6M6.5 6.5v11M17.5 6.5v11M21 9v6M6.5 12h11"/>',
  swim: '<path d="M2 17c2 0 2-1.5 4-1.5S8 17 10 17s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 21c2 0 2-1.5 4-1.5S8 21 10 21s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="17" cy="7" r="2"/><path d="M5 12.5l5-4 4 3.5"/>',
  mobility: '<circle cx="12" cy="5" r="2"/><path d="M4 20c2-5 5-7 8-7s6 2 8 7M12 9v4M6 11l6 2 6-2"/>',
  rest: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  other: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/>',
  flag: '<path d="M5 21V4M5 4h13l-3 4.5 3 4.5H5"/>',
  test: '<circle cx="12" cy="14" r="7"/><path d="M12 14v-4M9.5 3h5M12 3v4"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5"/>',
  hist: '<path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4M12 8v4l3 2"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>', chevL: '<path d="M15 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', dash: '<path d="M6 12h12"/>',
  alert: '<path d="M12 4l9 16H3zM12 10v4M12 17v.5"/>', info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.5v.5"/>',
  coach: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4 3.5V17H6a2 2 0 0 1-2-2z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/>'
};
export function Ic({ n }: { n: string }) { return <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[n] || ICONS.other }} />; }

export function Chip({ tone, icon, children }: { tone?: Tone | 'line' | ''; icon?: string; children: ReactNode }) {
  return <span className={'chip ' + (tone || '')}>{icon ? <Ic n={icon} /> : null}{children}</span>;
}
type SLike = P.SessionLike;
function famIcon(f: string, s?: SLike): string { if (f === 'race') return s && s.s === 'race' ? 'flag' : 'test'; if (f === 'easy' || f === 'long' || f === 'quality') return 'run'; return f; }
/** Quadratino colorato con l'icona del tipo di sessione. */
export function Dot({ s }: { s: SLike }) { const f = P.family(s); return <span className={'type f-' + f}><i><Ic n={famIcon(f, s)} /></i></span>; }

export function Head({ title, children }: { title: string; children?: ReactNode }) { return <div className="head"><h1>{title}</h1>{children}</div>; }
/** Riga etichetta/valore; non compare se il valore è vuoto. */
export function KV({ k, children }: { k: string; children?: ReactNode }) { return children ? <div><dt>{k}</dt><dd>{children}</dd></div> : null; }
export function Src({ t }: { t: 'u' | 'e' | 'c' }) { return t === 'u' ? <span className="src u">tuo</span> : t === 'e' ? <span className="src e">stima</span> : <span className="src">calcolo</span>; }

export const RATE: Record<Rating, Tone> = { 'ottimo': 'ok', 'buono': 'ok', 'da rivedere': 'warn', 'attenzione': 'crit' };
export function wAsSession(w: Workout): SLike { return { k: w.k, s: w.sub || 'easy' }; }
export function wTitle(w: Workout): string { return w.k === 'run' ? (P.RUN_TITLE[w.sub as string] || 'Corsa') : (P.KIND_LABEL[w.k] || 'Allenamento'); }
export function levelTone(pr: Prediction): Tone { return pr.level === 'realistico' ? 'ok' : pr.level === 'ambizioso' ? 'info' : pr.level === 'molto ambizioso' ? 'warn' : 'crit'; }

export function PaceLine({ s, d }: { s: Session; d: Description }) {
  const parts: ReactNode[] = [];
  if (s.km) parts.push(<b key="k">{P.nf(s.km)} km</b>);
  if (d.pace) parts.push(d.pace);
  if (d.dur) parts.push(P.fmtDur(d.dur));
  if (!parts.length) return null;
  return <div className="meta"><span>{parts.map((p, i) => <span key={i}>{i ? ' · ' : ''}{p}</span>)}</span></div>;
}
export function hasPaceLine(s: Session, d: Description): boolean { return !!(s.km || d.pace || d.dur); }

export function StatusChips({ s, t }: { s: Session; t: string }) {
  return <>
    {s.st === 'done' ? <Chip tone="ok" icon="check">Fatta</Chip> : s.st === 'skipped' ? <Chip icon="x">Saltata</Chip> : s.d < t && (s.k === 'run' || s.k === 'strength') ? <Chip tone="warn">Da confermare</Chip> : null}
    {s.cond ? <Chip tone="line">Condizionale</Chip> : null}
    {s.rec ? <Chip tone="info">Recupero</Chip> : s.mod && s.orig && s.orig.d !== s.d ? <Chip tone="info">Rinviata</Chip> : s.mod ? <Chip tone="info">Modificata</Chip> : null}
    {s.user ? <Chip>Tua</Chip> : null}
  </>;
}
export function hasStatusChips(s: Session, t: string): boolean { return s.st !== 'planned' || (s.d < t && (s.k === 'run' || s.k === 'strength')) || !!s.cond || !!s.rec || !!s.mod || !!s.user; }

export function ChangeStatus({ c }: { c: Change }) {
  const m: [Tone | '', string] = ({ pending: ['info', 'In attesa'], applied: ['ok', c.kind === 'auto' ? 'Coach' : c.kind === 'manual' ? 'Tua' : c.kind === 'setup' ? 'Iniziale' : 'Accettata'], rejected: ['', 'Rifiutata'], undone: ['', 'Annullata'], expired: ['', 'Scaduta'], info: ['', 'Nota'] } as Record<string, [Tone | '', string]>)[c.status] || ['', c.status];
  return <Chip tone={m[0]}>{m[1]}</Chip>;
}
export function Stamp({ at }: { at: string }) { return <span className="tiny">{dstamp(at)}</span>; }

/** Scala 1–5 a pulsanti. */
export function Scale({ name, value, onChange, max = 5 }: { name: string; value: number | null; onChange: (v: number) => void; max?: number }) {
  const items = []; for (let i = 1; i <= max; i++) items.push(<label key={i}><input type="radio" name={name} value={i} checked={value === i} onChange={() => onChange(i)} /><span>{i}</span></label>);
  return <div className="opts">{items}</div>;
}
