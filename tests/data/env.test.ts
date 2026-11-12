/* Variabili d'ambiente di Supabase lette al momento della build. */
import { describe, expect, it } from 'vitest';
import { baseUrl, isSecretKey, supabaseEnv } from '../../scripts/supabase-env.mjs';

describe('configurazione di Supabase dalla build', () => {
  it('accetta i nomi con e senza prefisso VITE_ e dà la precedenza a quelli con il prefisso', () => {
    expect(supabaseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_x' })).toEqual({ url: 'https://abc.supabase.co', key: 'sb_publishable_x' });
    expect(supabaseEnv({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_x' })).toEqual({ url: 'https://abc.supabase.co', key: 'sb_publishable_x' });
    expect(supabaseEnv({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_y ' }).key).toBe('sb_publishable_y');
    expect(supabaseEnv({ VITE_SUPABASE_URL: 'https://uno.supabase.co', SUPABASE_URL: 'https://due.supabase.co' }).url).toBe('https://uno.supabase.co');
  });
  it('senza variabili l’app resta locale', () => {
    expect(supabaseEnv({})).toEqual({ url: '', key: '' }); expect(supabaseEnv({ SUPABASE_URL: '  ' }).url).toBe('');
  });
  it('porta l’indirizzo alla forma base: niente /rest/v1 né barre finali', () => {
    expect(baseUrl('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co'); expect(baseUrl('https://abc.supabase.co/rest/v1')).toBe('https://abc.supabase.co');
    expect(baseUrl('https://abc.supabase.co//')).toBe('https://abc.supabase.co'); expect(baseUrl(undefined)).toBe('');
  });
  it('legge solo queste variabili: altre con nomi simili non entrano nella build', () => {
    expect(supabaseEnv({ SUPABASE_SERVICE_ROLE_KEY: 'segreta', SUPABASE_JWT_SECRET: 'segreto', SUPABASE_URL: 'https://abc.supabase.co' })).toEqual({ url: 'https://abc.supabase.co', key: '' });
  });
  it('rifiuta una chiave segreta messa al posto di quella pubblica', () => {
    const jwt = (role: string) => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.firma';
    expect(isSecretKey('sb_secret_abc')).toBe(true); expect(isSecretKey(jwt('service_role'))).toBe(true);
    expect(isSecretKey('sb_publishable_abc')).toBe(false); expect(isSecretKey(jwt('anon'))).toBe(false);
    expect(() => supabaseEnv({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: jwt('service_role') })).toThrow(/chiave segreta/);
  });
});
