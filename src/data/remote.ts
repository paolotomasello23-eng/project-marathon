/* Adattatore Supabase: l'unico punto dell'app che parla con il server.
   URL e chiave pubblica arrivano dalle variabili d'ambiente (.env), mai dal codice. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Coll } from './db';
import type { AuthUser, DocHead, DocKey, Remote, RemoteAuth, RemoteDocs, RemoteRow } from './sync';

// indirizzo base del progetto: si tollera che sia stato copiato con /rest/v1/ in fondo
const URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '') || undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const PAGE = 1000;

export function supabaseConfigured(): boolean { return !!(URL && KEY); }

/** Differenza tra l'orologio del server e quello del dispositivo, letta dall'intestazione Date delle risposte. */
let clockOffset = 0;
const fetchWithClock: typeof fetch = async (input, init) => {
  const t0 = Date.now(), res = await fetch(input, init), t1 = Date.now();
  try {
    const d = res.headers.get('date'), srv = d ? Date.parse(d) : NaN;
    // l'intestazione ha la precisione del secondo: si corregge solo uno scarto vero, non il rumore
    if (isFinite(srv)) { const est = srv + 500 - (t0 + t1) / 2; if (Math.abs(est - clockOffset) > 1500) clockOffset = Math.round(est); }
  } catch { /* intestazione non leggibile: nessuna correzione */ }
  return res;
};

function docsOf(sb: SupabaseClient, userId: string): RemoteDocs {
  type Row = { coll: Coll; id: string; data?: unknown; updated_at: string };
  /** Legge tutte le righe che rispettano il filtro, a pagine. */
  async function all(cols: string, coll?: Coll, ids?: string[]): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = sb.from('docs').select(cols).eq('user_id', userId);
      if (coll) q = q.eq('coll', coll);
      if (ids) q = q.in('id', ids);
      const { data, error } = await q.order('coll', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data || []) as unknown as Row[];
      rows.forEach(r => out.push(r));
      if (rows.length < PAGE) return out;
    }
  }
  return {
    async heads(): Promise<DocHead[]> { return (await all('coll,id,updated_at')).map(r => ({ coll: r.coll, id: r.id, updated_at: r.updated_at })); },
    async get(keys: DocKey[]): Promise<RemoteRow[]> {
      const by = new Map<Coll, string[]>(); keys.forEach(k => { if (!by.has(k.coll)) by.set(k.coll, []); by.get(k.coll)!.push(k.id); });
      const out: RemoteRow[] = [];
      for (const [coll, ids] of by) {
        // pochi documenti: si chiedono per id; molti (primo collegamento): tutta la raccolta
        const rows: Row[] = [];
        if (ids.length > 60) { const want = new Set(ids); (await all('coll,id,data,updated_at', coll)).forEach(r => { if (want.has(r.id)) rows.push(r); }); }
        else for (let i = 0; i < ids.length; i += 30) (await all('coll,id,data,updated_at', coll, ids.slice(i, i + 30))).forEach(r => rows.push(r));
        rows.forEach(r => out.push({ coll: r.coll, id: r.id, data: r.data === undefined ? null : r.data, updated_at: r.updated_at }));
      }
      return out;
    },
    async push(rows) {
      const { data, error } = await sb.from('docs').upsert(rows.map(r => ({ user_id: userId, coll: r.coll, id: r.id, data: r.data, updated_at: r.updated_at })), { onConflict: 'user_id,coll,id' }).select('coll,id,updated_at');
      if (error) throw new Error(error.message);
      return (data || []) as DocHead[];
    },
    offset: () => clockOffset
  };
}

function authOf(sb: SupabaseClient): RemoteAuth {
  const map = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null => u ? { id: u.id, email: u.email || null } : null;
  return {
    async user() { const { data } = await sb.auth.getSession(); return map(data.session && data.session.user); },
    onChange(cb) { const { data } = sb.auth.onAuthStateChange((_e, session) => cb(map(session && session.user))); return () => data.subscription.unsubscribe(); },
    async signIn(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + '/profilo', shouldCreateUser: true } });
      if (error) throw new Error(error.message);
    },
    async verifyCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw new Error(error.message);
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/profilo' } });
      if (error) throw new Error(error.message);
      // con la conferma via email attiva Supabase risponde senza sessione; se l'indirizzo esiste già, senza identità
      if (!data.session && data.user && data.user.identities && data.user.identities.length === 0) throw new Error('User already registered');
      return data.session ? 'ok' : 'confirm';
    },
    async signInPassword(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw new Error(error.message); },
    async setPassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw new Error(error.message); },
    async signOut() { const { error } = await sb.auth.signOut(); if (error) throw new Error(error.message); }
  };
}

/** Crea il collegamento a Supabase; la libreria viene caricata solo se l'app è configurata. */
export async function createRemote(): Promise<Remote | null> {
  if (!URL || !KEY) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(URL, KEY, { global: { fetch: fetchWithClock }, auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'madrid27.auth' } });
  return { auth: authOf(sb), docs: userId => docsOf(sb, userId) };
}
