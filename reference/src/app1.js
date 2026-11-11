/* app1.js — stato, salvataggio, azioni. Concatenato con app2.js dentro un'unica funzione dal build. */
var P = window.MMPlan, E = window.MMEngine;
var nf = P.nf, fmtPace = P.fmtPace, fmtTime = P.fmtTime, fmtDur = P.fmtDur, addDays = P.addDays, mondayOf = P.mondayOf, diffDays = P.diffDays;
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function vals(o) { return Object.keys(o || {}).map(function (k) { return o[k]; }); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function today() { return window.__MM_TODAY || P.iso(new Date()); }
function nowISO() { return new Date().toISOString(); }
function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function num(v) { if (v == null || String(v).trim() === '') return null; var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? NaN : n; }
var MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function dlong(s) { var d = P.parse(s); return E.WD[P.dow(s)] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
function dfull(s) { var d = P.parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
function dshort(s) { return E.dshort(s); }
function dstamp(isoTime) { var d = new Date(isoTime); return d.getDate() + ' ' + E.MO[d.getMonth()] + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

var ICONS = {
  run: '<circle cx="15" cy="4.5" r="2"/><path d="M6 21l3.5-5 3-2-1.5-4.5 4 1.5 2 3h3M11 9.5L8 11l-1 3M12.5 14l3 2.5V21"/>',
  strength: '<path d="M3 9v6M6.5 6.5v11M17.5 6.5v11M21 9v6M6.5 12h11"/>',
  swim: '<path d="M2 17c2 0 2-1.5 4-1.5S8 17 10 17s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 21c2 0 2-1.5 4-1.5S8 21 10 21s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="17" cy="7" r="2"/><path d="M5 12.5l5-4 4 3.5"/>',
  mobility: '<circle cx="12" cy="5" r="2"/><path d="M4 20c2-5 5-7 8-7s6 2 8 7M12 9v4M6 11l6 2 6-2"/>',
  rest: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  other: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2.5"/>',
  flag: '<path d="M5 21V4M5 4h13l-3 4.5 3 4.5H5"/>',
  test: '<circle cx="12" cy="14" r="7"/><path d="M12 14v-4M9.5 3h5M12 3v4"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5"/>',
  hist: '<path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4M12 8v4l3 2"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>', chevL: '<path d="M15 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', dash: '<path d="M6 12h12"/>',
  alert: '<path d="M12 4l9 16H3zM12 10v4M12 17v.5"/>', info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.5v.5"/>',
  coach: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4 3.5V17H6a2 2 0 0 1-2-2z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/>'
};
function ic(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || ICONS.other) + '</svg>'; }
function famIcon(f, s) { if (f === 'race') return s && s.s === 'race' ? 'flag' : 'test'; if (f === 'easy' || f === 'long' || f === 'quality') return 'run'; return f; }
function chip(tone, text, icon) { return '<span class="chip ' + (tone || '') + '">' + (icon ? ic(icon) : '') + esc(text) + '</span>'; }
function typeTag(s) { var f = P.family(s); return '<span class="type f-' + f + '"><i>' + ic(famIcon(f, s)) + '</i>' + esc(f === 'race' ? (s.s === 'race' ? 'Gara' : 'Test') : f === 'quality' ? 'Qualità' : f === 'long' ? 'Lungo' : f === 'easy' ? 'Corsa facile' : (P.KIND_LABEL[s.k] || 'Altro')) + '</span>'; }

// ---------- stato ----------
var LS = 'mm27.v1';
var S = { core: null, plan: null, workouts: {}, checkins: {}, changes: {}, versions: {} };
var outbox = [];
var net = { db: null, base: null, dl: null, sample: null, mode: 'boot', got: {}, first: false, stale: false, err: null, localCopy: null };
var ui = { view: 'oggi', calMode: 'settimana', calDate: null, sel: null, tab: 'volume', histFilter: 'tutto', form: null, lock: false, pendingRender: false, showAll: false };

function st() { return { core: S.core, plan: S.plan, workouts: vals(S.workouts), checkins: vals(S.checkins), changes: vals(S.changes) }; }
function ready() { return !!(S.core && S.plan && S.plan.sessions); }
function session(id) { return ready() ? E.sessionById(S, id) : null; }
function sortPlan() { S.plan.sessions.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; }); }
function liveWorkouts() { return vals(S.workouts).filter(function (w) { return !w.deleted; }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.at < b.at ? 1 : -1); }); }
function pendingChanges() { return vals(S.changes).filter(function (c) { return c.status === 'pending'; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; }); }

function loadLocal() {
  try { var raw = localStorage.getItem(LS); if (!raw) return false; var o = JSON.parse(raw); if (!o || !o.S) return false; Object.keys(S).forEach(function (k) { if (o.S[k] != null) S[k] = o.S[k]; }); outbox = o.outbox || []; return !!S.core; } catch (e) { return false; }
}
function saveLocal() {
  try {
    var ids = Object.keys(S.versions).sort().slice(-8), v = {}; ids.forEach(function (i) { v[i] = S.versions[i]; });
    localStorage.setItem(LS, JSON.stringify({ S: { core: S.core, plan: S.plan, workouts: S.workouts, checkins: S.checkins, changes: S.changes, versions: v }, outbox: outbox, at: Date.now() }));
  } catch (e) { /* spazio esaurito o archiviazione bloccata: il cloud resta la copia valida */ }
}
function setPath(path, data) {
  var p = path.split('/');
  if (p[0] === 'app') S[p[1]] = data; else if (data === null) delete S[p[0]][p[1]]; else S[p[0]][p[1]] = data;
}
function put(path, data) {
  setPath(path, data);
  if (net.mode !== 'local' || path.indexOf('versions/') !== 0) { outbox = outbox.filter(function (o) { return o.path !== path; }); outbox.push({ path: path, data: data === null ? null : clone(data) }); }
  saveLocal(); flush();
}
// Ogni persona ha il proprio spazio privato: data/users/<id>/core, /plan e /log/<raccolta>/<id>
function phys(path) { var p = path.split('/'); return p[0] === 'app' ? net.base + '/' + p[1] : net.base + '/log/' + p[0] + '/' + p[1]; }
function hasPending(path) { return outbox.some(function (o) { return o.path === path; }); }
var flushing = false;
function flush() {
  if (flushing || !net.db || !outbox.length) { paintSync(); return; }
  flushing = true; paintSync();
  var item = outbox[0], ref, pr;
  try { ref = net.db.doc(phys(item.path)); pr = item.data === null ? ref.delete() : ref.set(item.data); } catch (e) { flushing = false; outbox.shift(); saveLocal(); toast('Un dato non è stato salvato: ' + (e && e.message || 'percorso non valido')); return; }
  pr.then(function () {
    var i = outbox.indexOf(item); if (i >= 0) outbox.splice(i, 1);
    net.err = null; flushing = false; saveLocal(); flush();
  }, function (e) {
    flushing = false; net.err = (e && e.code) || 'unavailable'; paintSync();
    if (net.err === 'unavailable' && !item.tries) { item.tries = 1; setTimeout(flush, 1500 + Math.random() * 1500); return; }
    if (net.err === 'quota_exceeded') toast('Spazio dati esaurito: esporta un backup dal Profilo e riduci le versioni del piano.');
    else if (net.err === 'invalid_argument') { toast('Non hai i permessi per salvare su questa pagina: i dati restano solo su questo dispositivo.'); net.readonly = true; }
    else toast('Salvataggio non riuscito: riprovo alla prossima modifica. I dati sono al sicuro su questo dispositivo.');
  });
}

function connect(db, base) {
  net.db = db; net.base = base; net.mode = 'cloud'; if (S.core) net.localCopy = clone(S);
  var timer = setTimeout(function () { if (!net.first) { net.stale = true; paintSync(); changed(); } }, 10000);
  function ok(name) {
    net.got[name] = 1;
    if (!net.first && net.got.core && net.got.plan && net.got.workouts && net.got.changes && net.got.checkins) { net.first = true; net.stale = false; clearTimeout(timer); afterLoad(); }
  }
  function fail(e) { net.err = (e && e.code) || 'unavailable'; clearTimeout(timer); net.stale = true; paintSync(); changed(); }
  ['core', 'plan'].forEach(function (name) {
    db.doc(phys('app/' + name)).onSnapshot(function (snap) {
      if (!hasPending('app/' + name)) { if (snap.exists) S[name] = clone(snap.data()); else if (!snap.metadata.fromCache) S[name] = null; }
      if (!snap.metadata.fromCache) ok(name);
      changed();
    }, fail);
  });
  ['workouts', 'changes', 'checkins'].forEach(function (col) {
    db.collection(base + '/log/' + col).onSnapshot(function (q) {
      if (q.metadata.fromCache && q.empty) return;
      var m = {}; q.docs.forEach(function (d) { m[d.id] = clone(d.data()); });
      outbox.forEach(function (o) { var p = o.path.split('/'); if (p[0] === col) { if (o.data === null) delete m[p[1]]; else m[p[1]] = clone(o.data); } });
      S[col] = m; if (!q.metadata.fromCache) ok(col);
      changed();
    }, fail);
  });
  flush();
}
var renderT = null;
function changed() {
  saveLocal();
  if (ui.lock || (document.getElementById('sheet') && document.getElementById('sheet').open)) { ui.pendingRender = true; paintStrip(); return; }
  clearTimeout(renderT); renderT = setTimeout(render, 40);
}
function afterLoad() {
  paintSync();
  if (ready()) { coachPass(); }
  changed();
}

// ---------- versioni del piano ----------
function snapshotVersion(label) {
  var n = (S.plan.v || 1), id = 'v' + String(n).padStart(4, '0');
  put('versions/' + id, { id: id, n: n, at: nowISO(), label: label, sessions: clone(S.plan.sessions) });
  S.core.versions = (S.core.versions || []).concat([{ id: id, n: n, at: nowISO(), label: label }]);
  while (S.core.versions.length > 40) { var old = S.core.versions.shift(); put('versions/' + old.id, null); }
  S.plan.v = n + 1;
  return id;
}
function getVersion(id) {
  if (S.versions[id]) return Promise.resolve(S.versions[id]);
  if (!net.db) return Promise.resolve(null);
  return net.db.doc(phys('versions/' + id)).get().then(function (s) { return s.exists ? clone(s.data()) : null; }, function () { return null; });
}

// ---------- coach: proposte e storico delle stime ----------
function touchesPlan(c) { return c.ops.some(function (o) { return o.t === 's' || o.t === 'add' || o.t === 'del'; }); }
function applyChange(c, dir) {
  if (touchesPlan(c)) snapshotVersion((dir === 'undo' ? 'Prima di annullare: ' : 'Prima di: ') + c.title);
  var t = today();
  c.ops.forEach(function (op) {
    if (op.t === 'add') { if (dir === 'undo') S.plan.sessions = S.plan.sessions.filter(function (s) { return s.id !== op.s.id; }); else if (!session(op.s.id)) S.plan.sessions.push(clone(op.s)); }
    else if (op.t === 'del') { if (dir === 'undo') { if (!session(op.s.id)) S.plan.sessions.push(clone(op.s)); } else S.plan.sessions = S.plan.sessions.filter(function (s) { return s.id !== op.s.id; }); }
  });
  var touched = E.applyOps(S, { id: c.id, kind: c.kind, ops: c.ops.filter(function (o) { return o.t !== 'add' && o.t !== 'del' && !(o.t === 's' && !o.force && dir !== 'undo' && c.kind !== 'manual' && session(o.id) && session(o.id).st !== 'planned'); }) }, dir, t);
  sortPlan();
  c.status = dir === 'undo' ? 'undone' : 'applied'; c.decidedAt = nowISO();
  put('changes/' + c.id, c);
  if (touchesPlan(c)) { put('app/plan', S.plan); put('app/core', S.core); } else if (touched.core) put('app/core', S.core);
}
function coachPass() {
  if (!ready()) return [];
  var t = today();
  vals(S.changes).forEach(function (c) {
    if (c.status !== 'pending' || !c.ops.length) return;
    var dead = c.ops.every(function (op) { if (op.t !== 's') return false; var s = session(op.id); return !s || s.st !== 'planned' || s.d < t; });
    if (dead) { c.status = 'expired'; c.decidedAt = nowISO(); put('changes/' + c.id, c); }
  });
  var props = E.propose(st(), t);
  props.forEach(function (c) {
    S.changes[c.id] = c;
    if (c.kind === 'auto') applyChange(c, 'apply'); else put('changes/' + c.id, c);
  });
  // storico delle stime: una voce a settimana o dopo un cambio di riferimento
  var ph = S.core.predHistory || [], last = ph[ph.length - 1];
  if (!last || diffDays(last.d, t) >= 7 || last.goal !== S.core.goal.sec || last.eq !== Math.round(E.refEq10(S.core))) {
    var pr = E.predict(st(), t);
    S.core.predHistory = ph.filter(function (x) { return x.d !== t; }).concat([{ d: t, low: Math.round(pr.low), plan: Math.round(pr.plan), high: Math.round(pr.high), goal: S.core.goal.sec, eq: Math.round(pr.eq10) }]);
    put('app/core', S.core);
  }
  return props;
}

// ---------- azioni ----------
function saveWorkout(w, prevId) {
  var old = prevId ? S.workouts[prevId] : null, dirty = false;
  if (old) {
    var diff = {};
    ['date', 'k', 'sub', 'km', 'extraKm', 'sec', 'min', 'hrAvg', 'hrMax', 'up', 'down', 'rpe', 'feel', 'fatigue', 'sleep', 'sleepH', 'temp', 'weather', 'waterMl', 'gels', 'carbsG', 'notes', 'sid'].forEach(function (f) { if (JSON.stringify(old[f] == null ? null : old[f]) !== JSON.stringify(w[f] == null ? null : w[f])) diff[f] = [old[f] == null ? null : old[f], w[f] == null ? null : w[f]]; });
    if (JSON.stringify(old.pain || null) !== JSON.stringify(w.pain || null)) diff.pain = [old.pain || null, w.pain || null];
    w.id = old.id; w.at = old.at; w.edits = (old.edits || []).concat([{ at: nowISO(), diff: diff }]);
    if (old.sid && old.sid !== w.sid) { var os = session(old.sid); if (os && os.wid === old.id) { os.st = 'planned'; delete os.wid; dirty = true; } }
  } else { w.id = uid('w'); w.at = nowISO(); }
  S.workouts[w.id] = w;
  var s = w.sid ? session(w.sid) : null;
  w.eval = E.evaluate(w, s, st(), today());
  if (s && (s.st !== 'done' || s.wid !== w.id)) { s.st = 'done'; s.wid = w.id; s.stAt = nowISO(); dirty = true; }
  var props = coachPass();
  w.eval.impact = props.length ? props.map(function (c) { return (c.status === 'applied' ? 'Applicata: ' : 'Proposta: ') + c.title; }) : ['Nessuna modifica.'];
  w.eval.cids = props.map(function (c) { return c.id; });
  put('workouts/' + w.id, w);
  if (dirty) put('app/plan', S.plan);
  return w;
}
function deleteWorkout(id) {
  var w = S.workouts[id]; if (!w) return;
  w.deleted = true; w.deletedAt = nowISO();
  var s = w.sid ? session(w.sid) : null;
  if (s && s.wid === id) { s.st = 'planned'; delete s.wid; put('app/plan', S.plan); }
  put('workouts/' + id, w);
}
function restoreWorkout(id) {
  var w = S.workouts[id]; if (!w) return;
  delete w.deleted; delete w.deletedAt;
  var s = w.sid ? session(w.sid) : null;
  if (s && s.st === 'planned') { s.st = 'done'; s.wid = id; put('app/plan', S.plan); }
  put('workouts/' + id, w);
}
// Salta una sessione e, se è una corsa e nulla lo sconsiglia, la recupera spostandola nel primo giorno adatto.
function skipSession(id, why, day) {
  var s = session(id); if (!s) return {};
  s.st = 'skipped'; s.stAt = nowISO(); s.why = why || 'Non indicato';
  var t = today(), c = null, blocked = s.k === 'run' ? (day === 'none' ? 'Non recuperata.' : E.recoveryBlocked(st(), s, t, why)) : '';
  if (s.k === 'run' && !blocked) {
    var opts = E.recoveryOptions(st(), s, t), d = day && opts.indexOf(day) >= 0 ? day : opts[0];
    if (d) { c = E.recoveryChange(st(), s, t, d, why); S.changes[c.id] = c; applyChange(c, 'apply'); }
    else blocked = 'Nessun giorno adatto: viene assorbita.';
  }
  if (!c) put('app/plan', S.plan);
  coachPass();
  return { change: c, blocked: blocked, day: c ? c.day : null };
}
function setPlanned(id) {
  var s = session(id); if (!s) return;
  s.st = 'planned'; delete s.why; s.stAt = nowISO();
  put('app/plan', S.plan);
}
function manualChange(title, ops, cat) {
  var c = E.mk('manual-' + uid(''), today(), { kind: 'manual', status: 'pending', cat: cat || 'session', title: title, ops: ops, why: ['Modifica inserita da te'], impact: '' });
  S.changes[c.id] = c; applyChange(c, 'apply'); return c;
}
function saveCheckin(c) {
  c.id = uid('c'); c.at = nowISO();
  put('checkins/' + c.id, c);
  return coachPass();
}
function makeCore(o) {
  var eq = E.eq10(o.refDist, o.refSec), goal = o.goalSec;
  return { v: 1, createdAt: nowISO(), profile: { name: o.name || '', age: o.age || null, hrMax: null, baseKm: o.baseKm || 15, runs: 3, strength: '1–2', days: clone(P.DEF_DAYS), notes: '' },
    race: { name: o.raceName || 'Maratona', date: o.raceDate, km: 42.195 }, goal: { sec: goal, history: [{ date: today(), sec: goal, by: 'utente' }] },
    ref: { dist: o.refDist, sec: o.refSec, date: today(), source: 'dichiarato', eq10: Math.round(eq) }, paces: P.pacesFromRef(eq, goal), paceHistory: [], versions: [], predHistory: [] };
}
function createPlan(o) {
  var core = makeCore(o), sessions = P.generate({ raceDate: o.raceDate, startDate: today() });
  put('app/core', core); put('app/plan', { v: 1, createdAt: nowISO(), sessions: sessions });
  coachPass();
}
function exportObject() { return { app: 'marathon-project-madrid', v: 1, exportedAt: nowISO(), core: S.core, plan: S.plan, workouts: S.workouts, checkins: S.checkins, changes: S.changes }; }
function importObject(o) {
  if (!o || o.app !== 'marathon-project-madrid' || !o.core || !o.plan || !Array.isArray(o.plan.sessions)) throw new Error('Il file non è un backup di questa app.');
  if (ready()) snapshotVersion('Prima del ripristino da backup');
  var vers = (S.core && S.core.versions) || [];
  o.core.versions = vers.concat((o.core.versions || []).filter(function (v) { return !vers.some(function (x) { return x.id === v.id; }); }));
  o.plan.v = Math.max(o.plan.v || 1, (S.plan && S.plan.v) || 1);
  put('app/core', o.core); put('app/plan', o.plan);
  ['workouts', 'checkins', 'changes'].forEach(function (col) { Object.keys(o[col] || {}).forEach(function (id) { put(col + '/' + id, o[col][id]); }); });
  var c = E.mk('restore-' + uid(''), today(), { kind: 'event', status: 'info', cat: 'data', title: 'Dati ripristinati da un backup del ' + dstamp(o.exportedAt || nowISO()), why: [], impact: 'Profilo, obiettivi e piano sostituiti; gli allenamenti del backup reinseriti. Quelli registrati dopo il backup sono rimasti.' });
  put('changes/' + c.id, c);
}
function restoreVersion(id) {
  return getVersion(id).then(function (v) {
    if (!v) { toast('Versione non disponibile su questo dispositivo.'); return; }
    snapshotVersion('Prima del ripristino della versione ' + v.n);
    var cur = {}; S.plan.sessions.forEach(function (s) { cur[s.id] = s; });
    var out = v.sessions.map(function (s) { var c = cur[s.id], r = clone(s); if (c && (c.st === 'done' || c.st === 'skipped')) { r.st = c.st; if (c.wid) r.wid = c.wid; if (c.stAt) r.stAt = c.stAt; if (c.why) r.why = c.why; } return r; });
    S.plan.sessions.forEach(function (s) { if (s.st === 'done' && !out.some(function (x) { return x.id === s.id; })) out.push(s); });
    S.plan.sessions = out; sortPlan();
    put('app/plan', S.plan); put('app/core', S.core);
    var c = E.mk('vrestore-' + uid(''), today(), { kind: 'event', status: 'info', cat: 'plan', title: 'Ripristinata la versione ' + v.n + ' del piano', why: [v.label || ''], impact: 'Le sessioni già completate o saltate sono rimaste tali.' });
    put('changes/' + c.id, c); toast('Versione ' + v.n + ' ripristinata.'); render();
  });
}

// ---------- dati derivati per le viste ----------
function sessionsOn(d) { return ready() ? S.plan.sessions.filter(function (s) { return s.d === d; }) : []; }
function extrasOn(d) { return liveWorkouts().filter(function (w) { return w.date === d && (!w.sid || !session(w.sid) || session(w.sid).d !== d); }); }
function nextSession(fromIncl) { return ready() ? S.plan.sessions.filter(function (s) { return s.st === 'planned' && s.d >= fromIncl && s.k !== 'rest' && s.k !== 'mobility' && !(s.k === 'swim'); })[0] : null; }
function paceLine(s, d) {
  var parts = [];
  if (s.km) parts.push('<b>' + nf(s.km) + ' km</b>');
  if (d.pace) parts.push(esc(d.pace));
  if (d.dur) parts.push(fmtDur(d.dur));
  return parts.join(' · ');
}
function desc(s) { return P.describe(s, S.core.paces, S.core.goal.sec); }
function statusChip(s) {
  var out = '';
  if (s.st === 'done') out += chip('ok', 'Fatta', 'check'); else if (s.st === 'skipped') out += chip('', 'Saltata', 'x');
  else if (s.d < today() && (s.k === 'run' || s.k === 'strength')) out += chip('warn', 'Da confermare');
  if (s.cond) out += chip('line', 'Condizionale');
  if (s.rec) out += chip('info', 'Recupero'); else if (s.mod && s.orig && s.orig.d !== s.d) out += chip('info', 'Rinviata'); else if (s.mod) out += chip('info', 'Modificata');
  if (s.user) out += chip('', 'Tua');
  return out;
}
var RATE = { 'ottimo': 'ok', 'buono': 'ok', 'da rivedere': 'warn', 'attenzione': 'crit' };

// ---------- toast ----------
function toast(msg) {
  var t = document.getElementById('toast'); if (!t) return;
  var d = document.createElement('div'); d.textContent = msg; t.appendChild(d);
  setTimeout(function () { d.remove(); }, 4200);
}
