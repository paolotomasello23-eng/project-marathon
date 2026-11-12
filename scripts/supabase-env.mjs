/* Indirizzo e chiave pubblica di Supabase dalle variabili d'ambiente, al momento della build.
   Si accettano i nomi con o senza il prefisso VITE_ (su Vercel è facile scriverli senza). Vengono lette solo
   queste variabili, per nome: nessun'altra variabile dell'ambiente finisce nel codice inviato al browser. */

const URL_NAMES = ['VITE_SUPABASE_URL', 'SUPABASE_URL'];
const KEY_NAMES = ['VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'];

/** Una chiave segreta (service_role) non deve mai arrivare nel browser: scavalca le regole di accesso. */
export function isSecretKey(key) {
  if (/^sb_secret_/.test(key)) return true;
  const p = String(key).split('.');
  if (p.length !== 3) return false;
  try { return JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8')).role === 'service_role'; } catch { return false; }
}

/** Toglie barre finali e l'eventuale "/rest/v1": al client serve l'indirizzo base del progetto. */
export function baseUrl(url) { return String(url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/+$/, ''); }

/** @param {Record<string, string | undefined>} env */
export function supabaseEnv(env) {
  const pick = names => { for (const n of names) { const v = String(env[n] || '').trim(); if (v) return v; } return ''; };
  const url = baseUrl(pick(URL_NAMES)), key = pick(KEY_NAMES);
  if (key && isSecretKey(key)) throw new Error('La chiave di Supabase indicata è una chiave segreta (service_role): nell’app va solo quella pubblica (anon o publishable).');
  return { url, key };
}
