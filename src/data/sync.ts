/* Sincronizzazione: stato mostrato dall'interfaccia. Il motore arriva con la fase 4. */
export interface SyncStatus {
  /** URL e chiave di Supabase presenti nella build. */
  configured: boolean;
  /** Email dell'account collegato, se c'è. */
  email: string | null;
  busy: boolean;
  /** Scritture ancora da inviare. */
  pending: number;
  error: string | null;
  /** Primo allineamento con il server completato. */
  first: boolean;
  /** Dispositivo e account hanno piani diversi: serve una scelta. */
  choice: boolean;
}
export const LOCAL_ONLY: SyncStatus = { configured: false, email: null, busy: false, pending: 0, error: null, first: false, choice: false };
