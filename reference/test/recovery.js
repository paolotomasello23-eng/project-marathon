// Recupero delle sessioni saltate: casi con verifica.
const assert = require('assert'), P = require('../src/plan.js'), E = require('../src/engine.js');
const mk = () => { const sessions = P.generate({ raceDate: '2027-04-25', startDate: '2026-11-16', idp: 'b' }), goal = 14400; return { core: { profile: { age: 22, baseKm: 15 }, race: { date: '2027-04-25' }, goal: { sec: goal, history: [] }, paces: P.pacesFromRef(2970, goal), ref: { dist: 10, sec: 2970, date: '2026-11-10', source: 'dichiarato' } }, plan: { v: 1, sessions }, workouts: [], checkins: [], changes: [] }; };
const sort = st => st.plan.sessions.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
const skip = (st, id, t, why) => { const s = E.sessionById(st, id); s.st = 'skipped'; s.why = why || 'Impegni'; const blocked = E.recoveryBlocked(st, s, t, why); if (blocked) return { blocked }; const opts = E.recoveryOptions(st, s, t); if (!opts.length) return { blocked: 'none' }; const c = E.recoveryChange(st, s, t, opts[0], why); E.applyOps(st, c, 'apply', t); sort(st); return { c, opts }; };
const S = (st, id) => E.sessionById(st, id);
let st = mk(), snap = JSON.stringify(st.plan.sessions), r;
// A. corsa facile di martedì → mercoledì, forza leggera, stessi km in settimana
r = skip(st, 'bw01-q', '2026-11-17');
assert.equal(S(st, 'bw01-q').d, '2026-11-18'); assert.equal(S(st, 'bw01-q').st, 'planned'); assert.equal(S(st, 'bw01-q').rec.from, '2026-11-17'); assert.equal(S(st, 'bw01-str').s, 'C');
assert.equal(E.weekOf(st, '2026-11-16', '2026-11-17').planKm, 26);
E.applyOps(st, r.c, 'undo', '2026-11-17'); sort(st); assert.equal(S(st, 'bw01-q').st, 'skipped'); S(st, 'bw01-q').st = 'planned'; delete S(st, 'bw01-q').why; assert.equal(JSON.stringify(st.plan.sessions), snap, 'annulla riporta il piano identico');
// B. lungo di domenica → lunedì; la qualità del martedì diventa facile; il lungo successivo resta; il coach non taglia la settimana
st = mk(); r = skip(st, 'bw01-long', '2026-11-22');
assert.equal(S(st, 'bw01-long').d, '2026-11-23'); assert.equal(S(st, 'bw02-q').s, 'easy'); assert.equal(S(st, 'bw02-long').km, 16);
assert.equal(E.weekOf(st, '2026-11-23', '2026-11-23').wk, 2, 'numero di settimana corretto anche con una sessione spostata');
assert.ok(!E.propose(st, '2026-11-23').some(c => /Ridurre|Ripartire/.test(c.title)));
// C. lungo saltato scoperto giovedì: nessun giorno adatto
st = mk(); r = skip(st, 'bw01-long', '2026-11-26'); assert.equal(r.blocked, 'none');
// D. dolore e malattia: niente recupero
st = mk(); assert.ok(/dolore/.test(skip(st, 'bw01-e', '2026-11-19', 'Dolore o fastidio').blocked)); st = mk(); assert.ok(skip(st, 'bw01-e', '2026-11-19', 'Malattia').blocked);
// E. terzo salto in 7 giorni: assorbito
st = mk(); skip(st, 'bw01-q', '2026-11-17'); skip(st, 'bw01-e', '2026-11-19'); assert.ok(/due recuperi/.test(skip(st, 'bw01-long', '2026-11-22').blocked));
// F. 32 km del picco → lunedì; la settimana non supera il picco del piano
st = mk(); const L = st.plan.sessions.find(s => s.km === 32), peak = Math.max(...E.allWeeks(st, L.d).map(w => w.ph === 'race' ? 0 : w.planKm)); skip(st, L.id, L.d);
const wk = E.weekOf(st, P.addDays(P.mondayOf(L.d), 7), L.d); assert.ok(wk.planKm <= peak + 0.5, 'settimana di arrivo ' + wk.planKm + ' ≤ picco ' + peak);
// G. qualità con quarta corsa → mercoledì
st = mk(); const Q = st.plan.sessions.find(s => s.d === '2027-01-12'); r = skip(st, Q.id, Q.d); assert.equal(S(st, Q.id).d, '2027-01-13');
// H. ultimi 10 giorni e gara
st = mk(); const T = st.plan.sessions.find(s => s.d === '2027-04-20'); assert.ok(skip(st, T.id, '2027-04-20').blocked);
// I. stessa sessione recuperata due volte, la terza no
st = mk(); skip(st, 'bw03-e', '2026-12-03'); const d1 = S(st, 'bw03-e').d; r = skip(st, 'bw03-e', d1); assert.equal(S(st, 'bw03-e').rec.n, 2);
st.plan.sessions.forEach(s => { if (s.rec && s.id !== 'bw03-e') delete s.rec; }); S(st, 'bw03-e').rec.at = '2026-11-01'; assert.ok(/due volte/.test(skip(st, 'bw03-e', S(st, 'bw03-e').d).blocked));
console.log('RECOVERY_OK (settimana dopo il 32 km: ' + wk.planKm + ' km, picco ' + peak + ')');
