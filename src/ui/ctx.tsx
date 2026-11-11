import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Actions } from '../data/actions';
import type { AppState, Store } from '../data/store';
import type { SyncStatus } from '../data/sync';
import type { Iso } from '../domain/types';

export type SessionMode = 'view' | 'skip' | 'move' | 'edit' | 'del';
export type SheetState =
  | { type: 'session'; id: string; mode: SessionMode }
  | { type: 'add'; date: Iso }
  | { type: 'checkin'; ill?: boolean }
  | { type: 'stale' }
  | { type: 'goal' }
  | { type: 'paces' }
  | null;

export interface AccountApi {
  status: SyncStatus;
  signIn(email: string): Promise<string | null>;
  signOut(): Promise<void>;
  syncNow(): void;
  resolve(keep: 'local' | 'remote'): Promise<void>;
}

export interface AppCtx {
  store: Store;
  app: Actions;
  /** Data di oggi (si aggiorna da sola a mezzanotte e quando l'app torna in primo piano). */
  t: Iso;
  sheet: SheetState;
  openSheet(s: SheetState): void;
  closeSheet(): void;
  account: AccountApi;
}

export const Ctx = createContext<AppCtx | null>(null);

/** Contesto dell'app; il componente si ridisegna a ogni scrittura nello store. */
export function useApp(): AppCtx & { S: AppState } {
  const c = useContext(Ctx);
  if (!c) throw new Error('Contesto mancante');
  useSyncExternalStore(c.store.subscribe, c.store.getRev);
  return Object.assign({}, c, { S: c.store.S });
}

// ---------- toast ----------
type ToastFn = (msg: string) => void;
const toastSubs = new Set<ToastFn>();
export function toast(msg: string): void { if (msg) toastSubs.forEach(f => f(msg)); }
export function onToast(f: ToastFn): () => void { toastSubs.add(f); return () => { toastSubs.delete(f); }; }
