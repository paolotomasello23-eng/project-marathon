/* Un Supabase finto per i test: risponde alle richieste del vero client (@supabase/supabase-js) come farebbero
   l'autenticazione via email e l'API REST della tabella `docs`, regole di accesso comprese. Nessuna rete. */
import type { BrowserContext, Route } from '@playwright/test';

export const SUPABASE = 'http://localhost:54399';
export const CODE = '123456';
interface Row { user_id: string; coll: string; id: string; data: unknown; updated_at: string }

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const pg = (t: string) => new Date(Date.parse(t)).toISOString().replace('Z', '+00:00'); // formato degli orari di Postgres
function inList(v: string): string[] { const out: string[] = []; const re = /"((?:[^"\\]|\\.)*)"|([^,]+)/g; let m; while ((m = re.exec(v))) out.push(m[1] != null ? m[1].replace(/\\(.)/g, '$1') : m[2]); return out; }

export class FakeSupabase {
  rows = new Map<string, Row>();
  users = new Map<string, string>();
  /** Email a cui è stato chiesto il link di accesso, con l'indirizzo di ritorno. */
  otp: { email: string; redirect: string | null }[] = [];
  requests: string[] = [];
  private offline = new Set<BrowserContext>();

  async attach(ctx: BrowserContext): Promise<void> { await ctx.route(SUPABASE + '/**', route => this.handle(ctx, route)); }
  setOffline(ctx: BrowserContext, off: boolean): void { if (off) this.offline.add(ctx); else this.offline.delete(ctx); }
  of(email: string): Row[] { const id = this.users.get(email); return [...this.rows.values()].filter(r => r.user_id === id); }
  doc(email: string, path: string): Record<string, unknown> | undefined { const r = this.of(email).find(x => x.coll + '/' + x.id === path); return r ? r.data as Record<string, unknown> : undefined; }

  private session(email: string) {
    if (!this.users.has(email)) this.users.set(email, '00000000-0000-4000-8000-' + String(this.users.size + 1).padStart(12, '0'));
    const id = this.users.get(email) as string, exp = Math.floor(Date.UTC(2030, 0, 1) / 1000);
    const user = { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' };
    return { access_token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: id, email, role: 'authenticated', aud: 'authenticated', exp }) + '.firma', token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: exp, refresh_token: 'rinnovo-' + id, user };
  }
  private uid(route: Route): string | null {
    const h = route.request().headers()['authorization'] || '', tok = h.replace(/^Bearer /, '').split('.');
    try { return tok.length === 3 ? (JSON.parse(Buffer.from(tok[1], 'base64url').toString()).sub as string) : null; } catch { return null; }
  }

  private async handle(ctx: BrowserContext, route: Route): Promise<void> {
    const req = route.request(), url = new URL(req.url()), q = url.searchParams;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-max-age': '600' };
    const json = (status: number, body: unknown) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (this.offline.has(ctx)) return route.abort('internetdisconnected');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    this.requests.push(req.method() + ' ' + url.pathname + url.search);

    if (url.pathname === '/auth/v1/otp') { const b = req.postDataJSON(); this.otp.push({ email: b.email, redirect: q.get('redirect_to') }); return json(200, {}); }
    if (url.pathname === '/auth/v1/verify') { const b = req.postDataJSON(); return b.token === CODE && b.type === 'email' ? json(200, this.session(b.email)) : json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }); }
    if (url.pathname === '/auth/v1/token') { const id = String(req.postDataJSON().refresh_token || '').replace('rinnovo-', ''), email = [...this.users].find(e => e[1] === id); return email ? json(200, this.session(email[0])) : json(400, { error: 'invalid_grant' }); }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') { const id = this.uid(route), email = [...this.users].find(e => e[1] === id); return email ? json(200, this.session(email[0]).user) : json(401, { msg: 'invalid token' }); }

    if (url.pathname === '/rest/v1/docs') {
      const me = this.uid(route);
      if (!me) return json(req.method() === 'GET' ? 200 : 401, req.method() === 'GET' ? [] : { message: 'new row violates row-level security policy for table "docs"' }); // senza accesso: nessuna riga visibile
      const cols = (q.get('select') || '*').split(','), shape = (r: Row) => { const o: Record<string, unknown> = {}; (cols[0] === '*' ? Object.keys(r) : cols).forEach(c => { o[c] = (r as unknown as Record<string, unknown>)[c]; }); return o; };
      if (req.method() === 'GET') {
        let rows = [...this.rows.values()].filter(r => r.user_id === me); // regola di accesso: solo le proprie righe
        for (const [k, v] of q) {
          if (k === 'user_id' || k === 'coll' || k === 'id') {
            if (v.startsWith('eq.')) rows = rows.filter(r => (r as unknown as Record<string, string>)[k] === v.slice(3));
            else if (v.startsWith('in.(')) { const set = new Set(inList(v.slice(4, -1))); rows = rows.filter(r => set.has((r as unknown as Record<string, string>)[k])); }
            else return json(400, { message: 'filtro non gestito dal finto server: ' + k + '=' + v });
          }
        }
        rows.sort((a, b) => a.coll < b.coll ? -1 : a.coll > b.coll ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        const off = +(q.get('offset') || 0), lim = +(q.get('limit') || 1000);
        return json(200, rows.slice(off, off + lim).map(shape));
      }
      if (req.method() === 'POST') {
        if (!/resolution=merge-duplicates/.test(req.headers()['prefer'] || '') || q.get('on_conflict') !== 'user_id,coll,id') return json(409, { message: 'duplicate key value violates unique constraint "docs_pkey"' });
        const body = req.postDataJSON() as Row[], out: Row[] = [];
        for (const r of body) {
          if (r.user_id !== me) return json(403, { message: 'new row violates row-level security policy for table "docs"' });
          const row = { user_id: r.user_id, coll: r.coll, id: r.id, data: r.data === undefined ? null : r.data, updated_at: pg(r.updated_at) };
          this.rows.set(me + '/' + r.coll + '/' + r.id, row); out.push(row);
        }
        return json(201, /return=representation/.test(req.headers()['prefer'] || '') ? out.map(shape) : []);
      }
    }
    return json(404, { message: 'non gestito dal finto server: ' + req.method() + ' ' + url.pathname });
  }
}
