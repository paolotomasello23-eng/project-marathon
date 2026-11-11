/* Punto di estensione: importazione delle attività da Strava o da file GPX/FIT.
   Qui c'è solo l'interfaccia. Nessuna sorgente è registrata: finché non lo è, l'interfaccia non mostra nulla.
   Una sorgente legge le attività e le restituisce in forma neutra; toWorkoutDraft le porta nel modulo Registra,
   dove restano da confermare (RPE, sensazioni e dolori li conosce solo l'atleta). */
import * as P from '../domain/plan';
import type { Kind, Workout } from '../domain/types';

export interface ImportedActivity {
  source: 'strava' | 'gpx' | 'fit';
  /** Identificativo nella sorgente, per non importare due volte la stessa attività. */
  externalId?: string;
  /** Inizio dell'attività, ISO 8601. */
  start: string;
  kind: Kind;
  km?: number; sec?: number; hrAvg?: number; hrMax?: number; up?: number; down?: number; temp?: number;
  name?: string;
}

export interface ActivitySource {
  readonly id: 'strava' | 'gpx' | 'fit';
  readonly label: string;
  /** Estensioni accettate per le sorgenti a file (es. ".gpx"); null per un servizio da collegare. */
  readonly accept: string | null;
  /** Legge le attività da un file oppure, per un servizio, quelle successive alla data indicata. */
  read(input: { file?: File; since?: string }): Promise<ImportedActivity[]>;
}

const sources: ActivitySource[] = [];
export function registerActivitySource(s: ActivitySource): void { if (!sources.some(x => x.id === s.id)) sources.push(s); }
export function activitySources(): ActivitySource[] { return sources.slice(); }

/** Bozza di allenamento da un'attività importata: solo i dati misurati, il resto resta da inserire. */
export function toWorkoutDraft(a: ImportedActivity): Omit<Workout, 'id'> {
  const w: Omit<Workout, 'id'> = { date: P.iso(new Date(a.start)), k: a.kind };
  if (a.kind === 'run') { w.sub = 'easy'; if (a.km != null) w.km = Math.round(a.km * 100) / 100; if (a.sec != null) w.sec = Math.round(a.sec); if (a.up != null) w.up = Math.round(a.up); if (a.down != null) w.down = Math.round(a.down); }
  else if (a.sec != null) w.min = Math.round(a.sec / 60);
  if (a.hrAvg != null) w.hrAvg = Math.round(a.hrAvg); if (a.hrMax != null) w.hrMax = Math.round(a.hrMax); if (a.temp != null) w.temp = a.temp;
  if (a.name) w.notes = a.name;
  return w;
}
