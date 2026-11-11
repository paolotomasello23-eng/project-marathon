const P = require('../src/plan.js'), E = require('../src/engine.js');
const today = '2026-11-09';
const sessions = P.generate({ raceDate: '2027-04-25', startDate: today });
const goal = 14400, paces = P.pacesFromRef(2970, goal);
const core = { profile: { name: 'Paolo', age: 22, baseKm: 15 }, race: { name: 'Maratona di Madrid', date: '2027-04-25' }, goal: { sec: goal, history: [] }, paces, paceHistory: [], ref: { dist: 10, sec: 2970, date: today, source: 'dichiarato' } };
const st = { core, plan: { v: 1, sessions }, workouts: [], checkins: [], changes: [] };
console.log('sessions', sessions.length, 'first', sessions[0].d, 'last', sessions.at(-1).d, sessions.at(-1).s);
console.log('paces', Object.fromEntries(Object.entries(paces).map(([k, v]) => [k, P.range(v)])));
const weeks = E.allWeeks(st, today);
console.log(weeks.map(w => `W${w.wk} ${w.mon} ${w.ph}${w.down ? '↓' : ''} ${w.planKm}km L${w.longPlan}`).join('\n'));
const pr = E.predict(st, today);
console.log('predict', { now: P.fmtTime(pr.now), plan: P.fmtTime(pr.plan), low: P.fmtTime(pr.low), high: P.fmtTime(pr.high), conf: pr.conf, level: pr.levelLabel, needPct: pr.needPct.toFixed(3), rec: Object.fromEntries(Object.entries(pr.rec).map(([k, v]) => [k, P.fmtTime(v)])), need: Object.fromEntries(Object.entries(pr.need).map(([k, v]) => [k, P.fmtTime(v)])), volPlan: pr.volPlan.toFixed(1) });
console.log(pr.used, pr.pos, pr.neg, pr.tests.map(t => t.title + ' ' + t.d + ' ' + P.fmtTime(t.thr)));
// describe a few
for (const id of ['w01-q', 'w03-q', 'w06-q', 'w14-long', 'w18-long', 'w20-long', 'w16-long', 'w24-long', 'w01-str', 'w10-x', 'w24-sat']) { const s = E.sessionById(st, id); const d = P.describe(s, paces, goal); console.log('\n', id, s.d, d.title, '|', d.km, 'km |', P.fmtDur(d.dur), '|', d.pace, '|', d.intensity, '\n  S:', d.structure, '\n  G:', d.gain, '\n  F:', d.fuel); }
// simulate week 1
function log(w) { const s = w.sid ? E.sessionById(st, w.sid) : null; w.eval = E.evaluate(w, s, st, w.date); st.workouts.push(w); if (s) { s.st = 'done'; s.wid = w.id; } return w; }
let w1 = log({ id: 'a1', date: '2026-11-10', k: 'run', sub: 'easy', sid: 'w01-q', km: 6, sec: 6 * 330, rpe: 6, hrAvg: 168, fatigue: 3 });
console.log('\nEVAL1', w1.eval.rating, w1.eval.analysis, w1.eval.good, w1.eval.improve, w1.eval.recovery, w1.eval.next);
let w2 = log({ id: 'a2', date: '2026-11-12', k: 'run', sub: 'easy', sid: 'w01-e', km: 5, sec: 5 * 372, rpe: 3, hrAvg: 142, up: 40 });
console.log('\nEVAL2', w2.eval.rating, w2.eval.analysis, w2.eval.good, w2.eval.improve);
let w3 = log({ id: 'a3', date: '2026-11-15', k: 'run', sub: 'long', sid: 'w01-long', km: 12, sec: 12 * 380, rpe: 4, gels: 1, waterMl: 300, pain: { lvl: 2, area: 'ginocchio' } });
console.log('\nEVAL3', w3.eval.rating, w3.eval.analysis, w3.eval.improve, w3.eval.recovery);
let props = E.propose(st, '2026-11-15');
console.log('\nPROPOSALS', JSON.stringify(props, null, 1).slice(0, 2500));
// apply/undo round trip
const before = JSON.stringify(st.plan.sessions);
props.forEach(c => E.applyOps(st, c, 'apply', '2026-11-15'));
console.log('after apply w02-q:', JSON.stringify(E.sessionById(st, 'w02-q')));
props.forEach(c => E.applyOps(st, c, 'undo', '2026-11-15'));
console.log('roundtrip equal:', JSON.stringify(st.plan.sessions) === before);
// skipped week → cap
st.workouts = []; st.plan.sessions = P.generate({ raceDate: '2027-04-25', startDate: today });
['2026-11-10', '2026-11-12', '2026-11-15'].forEach((d, i) => log({ id: 'b' + i, date: d, k: 'run', sub: i == 2 ? 'long' : 'easy', sid: ['w01-q', 'w01-e', 'w01-long'][i], km: [6, 5, 12][i], sec: [6, 5, 12][i] * 375, rpe: 3 }));
st.plan.sessions.filter(s => s.wk === 2 && s.k === 'run').forEach(s => s.st = 'skipped');
console.log('\nCAP after skipped W2 (today Mon W3):', JSON.stringify(E.propose(st, '2026-11-23').map(c => ({ t: c.title, why: c.why, ops: c.ops.map(o => o.label + ': ' + o.a + ' → ' + o.b) })), null, 1));
// test result → pace update
log({ id: 't5', date: '2026-12-01', k: 'run', sub: 'test5', sid: 'w04-q', km: 5, sec: 23 * 60 + 5, rpe: 9 });
console.log('\nTEST', JSON.stringify(E.propose(st, '2026-12-01').filter(c => c.cat === 'pace').map(c => ({ t: c.title, why: c.why, ops: c.ops.map(o => o.t + ' ' + (o.z || '') + ' ' + JSON.stringify(o.from).slice(0, 60) + ' → ' + JSON.stringify(o.to).slice(0, 90)) })), null, 1));
console.log('run4', JSON.stringify(E.run4Criteria(st, '2026-12-30')), '\nlong35', JSON.stringify(E.long35Criteria(st, '2027-03-15').list.map(c => [c.met, c.detail])));
console.log('status', E.prepStatus(st, '2026-12-01'), E.fatigueStatus(st, '2026-12-01').label, E.alerts(st, '2026-12-01'));
console.log('plan bytes', JSON.stringify({ v: 1, sessions }).length);
