/* Controlli sul progetto Supabase vero, con la sola chiave pubblica e senza accesso: non scrivono nulla.
   Verificano che la tabella esista, che le richieste dell'app siano accettate dall'API vera, che chi non ha
   fatto l'accesso non veda né scriva nulla e che l'accesso via email sia attivo. */
import { describe, expect, it } from 'vitest';
import { createRemote, supabaseConfigured } from '../../src/data/remote';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const NOBODY = '00000000-0000-4000-8000-000000000000';
const api = (path: string, init: RequestInit = {}) => fetch(URL + path, { ...init, headers: { apikey: KEY as string, ...(init.headers || {}) } });

describe.skipIf(!supabaseConfigured())('progetto Supabase vero', () => {
  it('l’indirizzo è quello base del progetto, senza /rest/v1', () => {
    expect(URL).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
  });

  it('la tabella docs esiste (supabase/schema.sql è stato eseguito)', async () => {
    const r = await api('/rest/v1/docs?select=coll,id,updated_at&limit=1');
    const body = await r.text();
    expect(r.status, 'risposta: ' + body + ' — esegui supabase/schema.sql in SQL Editor').toBe(200);
  });

  it('le richieste dell’app sono accettate dall’API vera; senza accesso non si vede nessuna riga', async () => {
    const docs = (await createRemote())!.docs(NOBODY);
    expect(await docs.heads()).toEqual([]);
    expect(await docs.get([{ coll: 'app', id: 'core' }, { coll: 'changes', id: 'painrep-tendine-d-Achille-2026-11-23' }, { coll: 'changes', id: 'a:b@c+d~e.f_g' }, { coll: 'workouts', id: 'w,con"virgolette' }])).toEqual([]);
    expect(await docs.get(Array.from({ length: 70 }, (_, i) => ({ coll: 'versions' as const, id: 'v' + String(i).padStart(4, '0') })))).toEqual([]);
  });

  it('senza accesso non si può scrivere: la regola di accesso rifiuta la riga', async () => {
    const docs = (await createRemote())!.docs(NOBODY);
    await expect(docs.push([{ coll: 'app', id: 'prova-senza-accesso', data: { prova: true }, updated_at: new Date().toISOString() }])).rejects.toThrow(/row-level security|permission denied|violates/i);
    expect(await (await api('/rest/v1/docs?select=id&id=eq.prova-senza-accesso')).json()).toEqual([]);
  });

  it('accesso via email attivo; le risposte espongono l’orario del server (serve a correggere l’orologio)', async () => {
    const s = await (await api('/auth/v1/settings')).json();
    expect(s.external.email).toBe(true); expect(s.disable_signup).toBe(false);
    const r = await api('/rest/v1/docs?select=id&limit=1', { headers: { Origin: 'https://example.com' } });
    expect(r.headers.get('access-control-allow-origin')).toBeTruthy();
    expect((r.headers.get('access-control-expose-headers') || '').toLowerCase()).toContain('date');
  });
});
