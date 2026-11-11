/* Tipi del dominio. La forma dei dati è quella del prototipo (reference/src): stessi nomi di campo, stessi valori. */

/** Data in formato AAAA-MM-GG. */
export type Iso = string;

export type Kind = 'run' | 'strength' | 'swim' | 'mobility' | 'rest' | 'other';
export type Phase = 'pre' | 'base' | 'build' | 'spec' | 'taper' | 'race';
export type Zone = 'easy' | 'long' | 'mp' | 'hm' | 'tempo' | 'interval';
export type PaceRange = [number, number];
export type Paces = Record<Zone, PaceRange>;
export type SessionStatus = 'planned' | 'done' | 'skipped';
export type Slot = 'mon' | 'q' | 'str' | 'e' | 'x' | 'sat' | 'long' | 'user';
export type RunSub = 'easy' | 'shake' | 'long' | 'hills' | 'fartlek' | 'tempo' | 'mp' | 'hmp' | 'test5' | 'test10' | 'testhm' | 'race';
export type Family = 'easy' | 'long' | 'quality' | 'race' | 'strength' | 'swim' | 'mobility' | 'rest' | 'other';
export type DayMap = Record<'mon' | 'q' | 'str' | 'e' | 'x' | 'sat' | 'long', number>;

/** Dettagli strutturali di una corsa (ripetute, blocchi, allunghi…). */
export interface SessionX {
  strides?: number; reps?: number; sec?: number; on?: number; off?: number; min?: number; rec?: number;
  blocks?: number[]; repKm?: number; mp?: number; prog?: number; up?: number; soft?: number;
}

export interface Session {
  id: string;
  d: Iso;
  wk: number | null;
  ph: Phase | null;
  slot: Slot;
  k: Kind;
  /** Sottotipo: per le corse un RunSub, per la forza A/B/C, per il resto std/opt/prelong… */
  s: string;
  km?: number | null;
  st: SessionStatus;
  x?: SessionX | null;
  cond?: 'run4' | 'long35' | null;
  down?: 1;
  title?: string | null;
  note?: string | null;
  dur?: number;
  /** Valori originali, presenti solo se la sessione è stata modificata. */
  orig?: { k: Kind; s: string; km: number | null; d: Iso };
  mod?: 'coach' | 'user';
  /** Recupero di una corsa saltata: giorno originale, quante volte, quando. */
  rec?: { from: Iso; n: number; at: Iso } | null;
  wid?: string;
  stAt?: string;
  why?: string | null;
  user?: 1;
}

export type SessionPatch = { [K in keyof Session]?: Session[K] | null };

export interface Pain { lvl: number; area?: string | null; note?: string | null }

export interface EvalCalc {
  load?: number; loadEst?: boolean; pace?: number; speed?: number; completion?: number; plannedKm?: number;
  downEst?: boolean; heat?: number; adj?: number | null; target?: PaceRange; dev?: number; eq10?: number; refDelta?: number;
  hrPct?: number; hrMaxEst?: boolean; vsSimilar?: { n: number; pace: number }; carbsH?: number; carbsEst?: boolean;
  waterH?: number; nextId?: string;
}
export interface EvalFlags { hard?: 1; fatigue?: 1; incomplete?: 1; extra?: 1; tooFast?: 1; fastEasy?: 1; hrHigh?: 1; sleep?: 1; pain?: number }
export type Rating = 'ottimo' | 'buono' | 'da rivedere' | 'attenzione';
export interface Evaluation {
  at: string; calc: EvalCalc; analysis: string[]; good: string[]; improve: string[]; recovery: string[]; next: string[];
  impact: string[]; flags: EvalFlags; rating: Rating; cids?: string[];
}

export interface WorkoutEdit { at: string; diff: Record<string, [unknown, unknown]> }

export interface Workout {
  id: string;
  date: Iso;
  k: Kind;
  sub?: string;
  sid?: string | null;
  km?: number; extraKm?: number; sec?: number; min?: number;
  hrAvg?: number; hrMax?: number; up?: number; down?: number;
  rpe?: number; feel?: number; fatigue?: number; sleep?: number; sleepH?: number;
  temp?: number; weather?: string; waterMl?: number; gels?: number; carbsG?: number;
  notes?: string;
  pain?: Pain | null;
  at?: string;
  eval?: Evaluation;
  edits?: WorkoutEdit[];
  deleted?: boolean; deletedAt?: string;
  ai?: { text: string; at: string };
}

export interface Checkin {
  id: string; date: Iso; at?: string;
  fatigue?: number; sleep?: number; stress?: number; pain?: Pain | null; ill?: boolean | null; note?: string | null;
}

export interface Ref { dist: number; sec: number; date: Iso; source: string; eq10?: number; rpe?: number | null; wid?: string }

export interface Profile {
  name?: string; age?: number | null; hrMax?: number | null; baseKm?: number; weight?: number | null;
  runs?: number; strength?: string; days?: Partial<DayMap>; notes?: string;
  [extra: string]: unknown;
}
export interface GoalEntry { date: Iso; sec: number; from?: number; by?: string; cid?: string }
export interface PaceEntry { date: Iso; z: Zone; from: PaceRange; to: PaceRange; cid?: string; undo?: boolean }
export interface PredEntry { d: Iso; low: number; plan: number; high: number; goal: number; eq: number }
export interface VersionMeta { id: string; n: number; at: string; label: string }
export interface PlanVersion extends VersionMeta { sessions: Session[] }

export interface Core {
  v?: number; createdAt?: string;
  profile: Profile;
  race: { name?: string; date: Iso; km?: number; gain?: number };
  goal: { sec: number; history?: GoalEntry[] };
  paces: Paces;
  paceHistory?: PaceEntry[];
  ref: Ref;
  versions?: VersionMeta[];
  predHistory?: PredEntry[];
  [extra: string]: unknown;
}
export interface Plan { v: number; createdAt?: string; sessions: Session[] }

export interface SOp { t: 's'; id: string; from: SessionPatch; to: SessionPatch; label: string; a: string; b: string; force?: 1 }
export interface PaceOp { t: 'pace'; z: Zone; from: PaceRange; to: PaceRange }
export interface GoalOp { t: 'goal'; from: number; to: number }
export interface RefOp { t: 'ref'; from: Ref; to: Ref }
export interface AddOp { t: 'add'; s: Session }
export interface DelOp { t: 'del'; s: Session }
/** Cambio della data di gara (aggiunto rispetto al prototipo; applicato dallo strato dati, non dal motore). */
export interface RaceOp { t: 'race'; from: Iso; to: Iso }
export type Op = SOp | PaceOp | GoalOp | RefOp | AddOp | DelOp | RaceOp;

export type ChangeKind = 'proposal' | 'auto' | 'manual' | 'setup' | 'event';
export type ChangeStatus = 'pending' | 'applied' | 'rejected' | 'undone' | 'expired' | 'info';
export type ChangeCat = 'session' | 'alert' | 'week' | 'pace' | 'plan' | 'goal' | 'data';
export interface Change {
  id: string; key: string; date: Iso; at: string;
  kind: ChangeKind; status: ChangeStatus; cat: ChangeCat;
  ops: Op[]; why: string[]; impact: string; title: string;
  src?: { wid: string }; rec?: 1; day?: Iso; decidedAt?: string;
}

/** Stato letto dal motore: liste, non mappe. */
export interface State { core: Core; plan: Plan; workouts: Workout[]; checkins: Checkin[]; changes: Change[] }

export interface WeekStats {
  mon: Iso; wk: number | null; ph: Phase | null; down: boolean;
  planKm: number; doneKm: number; planRuns: number; runWorkouts: number;
  keyDue: number; keyDone: number; keySkipped: number; stale: number;
  longPlan: number; longDone: number; load: number; up: number; min: number;
  easyMin: number; modMin: number; hardMin: number; complete: boolean;
}
export interface Acwr { acute: number; chronic: number; r: number | null }
export interface PainReport { date: Iso; lvl: number; area: string; src: string }
export interface Criterion { label: string; met: boolean | null; detail: string }
export type Tone = 'ok' | 'info' | 'warn' | 'crit';
export interface Status { label: string; tone: Tone; text: string }
export interface FatigueStatus { label: string; tone: Tone; pos: number | null; text: string; acwr: Acwr | null }
export interface Alert { lvl: 'crit' | 'warn' | 'info'; text: string; act?: 'stale'; ids?: string[] }
export type Level = 'realistico' | 'ambizioso' | 'molto ambizioso' | 'fuori portata';
export interface Prediction {
  eq10: number; ref: Partial<Ref>; volNow: number; volPlan: number; adh: number; weeksDone: number;
  now: number; plan: number; low: number; high: number;
  longest: number; conf: 'alta' | 'media' | 'bassa';
  need: { k10: number; k5: number; hm: number }; needPct: number; weeksLeft: number;
  level: Level; levelLabel: string;
  rec: { amb: number; real: number; cons: number };
  used: string[]; pos: string[]; neg: string[];
  tests: { id: string; d: Iso; title: string; thr: number }[];
}
export interface Description {
  title: string; kind: string; km: number | null; dur: number; pace: string | null; intensity: string | null;
  structure: string | null; gain: string | null; goal: string; fuel: string | null; tech: string; recovery: string;
}
