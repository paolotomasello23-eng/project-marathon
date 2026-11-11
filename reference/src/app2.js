/* app2.js — viste: cornice, oggi, calendario, sessione, registrazione */
var NAV = [['oggi', 'Oggi', 'home'], ['calendario', 'Calendario', 'cal'], ['registra', 'Registra', 'plus'], ['analisi', 'Analisi', 'search'], ['progressi', 'Progressi', 'chart'], ['obiettivi', 'Obiettivi', 'target'], ['storico', 'Coach', 'coach'], ['guida', 'Guida', 'book'], ['profilo', 'Profilo', 'user']];
var TITLES = { oggi: 'Oggi', calendario: 'Calendario', registra: 'Registra', analisi: 'Analisi', progressi: 'Progressi', obiettivi: 'Obiettivi', storico: 'Coach', guida: 'Guida', profilo: 'Profilo', menu: 'Altro' };

function paintSync() {
  var el = document.getElementById('sync'); if (!el) return;
  var cls = 'sync', txt = 'Sincronizzato';
  if (net.mode === 'boot') { cls += ' busy'; txt = 'Collegamento…'; }
  else if (net.mode === 'local') { cls += ' off'; txt = 'Solo locale'; }
  else if (net.readonly) { cls += ' err'; txt = 'Sola lettura'; }
  else if (outbox.length) { cls += net.err ? ' err' : ' busy'; txt = net.err ? outbox.length + ' da inviare' : 'Salvataggio…'; }
  else if (net.stale) { cls += ' err'; txt = 'Non aggiornato'; }
  else if (!net.first) { cls += ' busy'; txt = 'Carico…'; }
  el.className = cls; el.innerHTML = '<i></i>' + esc(txt);
}
function paintStrip() {
  var el = document.getElementById('strip-main'); if (!el) return;
  if (!ready()) { el.innerHTML = '<div class="strip-row top"><span class="eyebrow">Marathon Project</span></div><div class="strip-row"><div class="count">Madrid</div><span id="sync" class="sync"></span></div><div class="line"></div>'; paintSync(); return; }
  var t = today(), race = S.core.race, days = diffDays(t, race.date), a = S.plan.sessions, first = a[0].d, tot = Math.max(1, diffDays(first, race.date));
  var frac = Math.max(0, Math.min(1, diffDays(first, t) / tot)), wk = E.weekOf(st(), mondayOf(t), t), nW = E.planMondays(S).length;
  var ticks = ''; for (var i = 4; i < nW; i += 4) ticks += '<span class="line-tick" style="left:' + (i * 7 / tot * 100).toFixed(2) + '%"></span>';
  var big = days > 0 ? days + '<small>' + (days === 1 ? 'giorno' : 'giorni') + '</small>' : days === 0 ? 'Oggi si corre' : 'Gara conclusa';
  el.innerHTML = '<div class="strip-row top"><span class="eyebrow">' + esc(race.name) + ' · ' + esc(dshort(race.date).slice(4)) + '<span class="w-long"> ' + race.date.slice(0, 4) + '</span></span>' + (wk.wk ? '<span class="strip-side"><b><span class="w-long">Settimana</span><span class="w-short">Sett.</span> ' + wk.wk + '</b> di ' + nW + ' · ' + esc(P.PHASE[wk.ph] || '') + '</span>' : '') + '</div>' +
    '<div class="strip-row"><div class="count num">' + big + '</div><span id="sync" class="sync"></span></div>' +
    '<div class="line" role="img" aria-label="Avanzamento del piano: ' + Math.round(frac * 100) + '%">' + ticks + '<span class="line-fill" style="width:' + (frac * 100).toFixed(2) + '%"></span><span class="line-dot" style="left:' + (frac * 100).toFixed(2) + '%"></span><span class="line-end">' + ic('flag') + '</span></div>';
  paintSync();
}
function paintNav() {
  var n = pendingChanges().length, badge = n ? '<span class="badge" aria-label="' + n + ' proposte in attesa">' + n + '</span>' : '';
  var rail = document.getElementById('rail');
  rail.innerHTML = NAV.map(function (x, i) { return (i === 3 || i === 7 ? '<div class="sep"></div>' : '') + '<a href="#' + x[0] + '"' + (ui.view === x[0] ? ' aria-current="page"' : '') + '>' + ic(x[2]) + '<span>' + x[1] + '</span>' + (x[0] === 'storico' ? badge : '') + '</a>'; }).join('');
  var more = ['analisi', 'obiettivi', 'storico', 'guida', 'profilo', 'menu'].indexOf(ui.view) >= 0;
  function tab(id, lab, icn, cur, extra) { return '<li><a href="#' + id + '"' + (cur ? ' aria-current="page"' : '') + '>' + ic(icn) + '<span>' + lab + '</span>' + (extra || '') + '</a></li>'; }
  document.getElementById('tabs').innerHTML = '<ul>' + tab('oggi', 'Oggi', 'home', ui.view === 'oggi') + tab('calendario', 'Calendario', 'cal', ui.view === 'calendario') +
    '<li><a class="log" href="#registra"' + (ui.view === 'registra' ? ' aria-current="page"' : '') + '><span class="fab">' + ic('plus') + '</span><em>Registra</em></a></li>' +
    tab('progressi', 'Progressi', 'chart', ui.view === 'progressi') + tab('menu', 'Altro', 'more', more, badge) + '</ul>';
}

function head(title, right) { return '<div class="head"><h1>' + esc(title) + '</h1>' + (right || '') + '</div>'; }
function dot(s) { var f = P.family(s); return '<span class="type f-' + f + '"><i>' + ic(famIcon(f, s)) + '</i></span>'; }
function kv(k, v) { return v ? '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>' : ''; }
function hm(sec) { return fmtTime(sec).replace(/:\d\d$/, ''); }
function syncBanner() {
  if (net.mode === 'local') return '<div class="banner">' + ic('info') + '<span>Dati solo su questo dispositivo</span></div>';
  if (net.readonly) return '<div class="banner warn">' + ic('alert') + '<span>Sola lettura</span></div>';
  if (net.stale) return '<div class="banner warn">' + ic('alert') + '<span>Dati forse non aggiornati</span></div>';
  return '';
}
function wAsSession(w) { return { k: w.k, s: w.sub || 'easy' }; }
function wTitle(w) { return w.k === 'run' ? (P.RUN_TITLE[w.sub] || 'Corsa') : (P.KIND_LABEL[w.k] || 'Allenamento'); }
function levelTone(pr) { return pr.level === 'realistico' ? 'ok' : pr.level === 'ambizioso' ? 'info' : pr.level === 'molto ambizioso' ? 'warn' : 'crit'; }

// ---------- OGGI ----------
function oggiView() {
  var t = today(), state = st(), core = S.core, pc = core.paces, first = S.plan.sessions[0].d;
  var wk = E.weekOf(state, mondayOf(t), t), pr = E.predict(state, t), l35 = E.long35Criteria(state, t), prep = E.prepStatus(state, t), fat = E.fatigueStatus(state, t), al = E.alerts(state, t), pend = pendingChanges();
  var d28 = addDays(t, -27), km28 = 0; liveWorkouts().forEach(function (w) { if (w.k === 'run' && w.date >= d28 && w.date <= t) km28 += E.runKm(w); });
  var h = syncBanner();
  al.forEach(function (a) { var tone = a.lvl === 'crit' ? ' crit' : a.lvl === 'warn' ? ' warn' : '', inner = ic(a.lvl === 'info' ? 'info' : 'alert') + '<span>' + esc(a.text) + '</span>'; h += a.act ? '<button class="banner' + tone + '" data-act="stale">' + inner + ic('chevR') + '</button>' : '<div class="banner' + tone + '">' + inner + '</div>'; });
  if (pend.length) h += '<a class="banner" href="#storico">' + ic('coach') + '<span>' + (pend.length === 1 ? esc(pend[0].title) : pend.length + ' proposte del coach') + '</span>' + ic('chevR') + '</a>';

  var ss = sessionsOn(t), main = ss.filter(function (s) { return s.k !== 'rest'; })[0] || ss[0], todayCard;
  if (t < first) todayCard = '<article class="card today"><span class="eyebrow">Oggi</span><div class="t-title">Si parte ' + esc(dlong(first)) + '</div></article>';
  else if (main) {
    var d = desc(main), w = main.wid ? S.workouts[main.wid] : null;
    todayCard = '<article class="card today"><div class="row between"><span class="eyebrow">Oggi</span><span class="row">' + statusChip(main) + '</span></div><div class="trow">' + dot(main) + '<div class="t-title">' + esc(d.title) + '</div></div>' + (paceLine(main, d) ? '<div class="meta"><span>' + paceLine(main, d) + '</span></div>' : '') +
      (w ? '<div class="row">' + chip(RATE[w.eval.rating], cap1(w.eval.rating)) + '<button class="linkbtn" data-act="analysis" data-id="' + w.id + '">Analisi</button></div>' :
        '<div class="btns">' + (main.k !== 'rest' ? '<button class="btn pri" data-act="log" data-id="' + main.id + '">' + ic('plus') + 'Registra</button>' : '') + '<button class="btn" data-act="open" data-id="' + main.id + '">Dettagli</button></div>') + '</article>';
  } else todayCard = '<article class="card today"><span class="eyebrow">Oggi</span><div class="t-title">' + (t > core.race.date ? 'Piano concluso' : 'Giorno libero') + '</div></article>';

  var nx = nextSession(addDays(t, 1)), lw = liveWorkouts()[0], near = '';
  if (nx) near += '<span class="eyebrow">Prossimo</span><button class="item" data-act="open" data-id="' + nx.id + '">' + dot(nx) + '<span class="stack grow" style="gap:1px"><span class="ttl">' + esc(P.title(nx)) + '</span><span class="meta">' + esc(dshort(nx.d)) + (nx.km ? ' · ' + nf(nx.km) + ' km' : '') + '</span></span><span class="chev">' + ic('chevR') + '</span></button>';
  if (lw) near += '<span class="eyebrow">Ultimo</span><button class="item" data-act="analysis" data-id="' + lw.id + '">' + dot(wAsSession(lw)) + '<span class="stack grow" style="gap:1px"><span class="ttl">' + esc(wTitle(lw)) + '</span><span class="meta">' + esc(dshort(lw.date)) + (lw.km ? ' · ' + nf(lw.km) + ' km' : '') + (lw.eval && lw.eval.calc.pace ? ' · ' + fmtPace(lw.eval.calc.pace) + '/km' : '') + '</span></span>' + chip(RATE[lw.eval.rating], cap1(lw.eval.rating)) + '<span class="chev">' + ic('chevR') + '</span></button>';
  var nearCard = near ? '<article class="card near">' + near + '</article>' : '';

  var wkPct = wk.planKm ? Math.min(100, wk.doneKm / wk.planKm * 100) : 0;
  var stats = '<div class="stats span2">' +
    '<div class="stat"><span class="lab">Obiettivo</span><span class="big">' + hm(core.goal.sec) + '</span></div>' +
    '<div class="stat"><span class="lab">Passo gara</span><span class="big">' + fmtPace(pc.mp[0]) + '–' + fmtPace(pc.mp[1]) + '</span></div>' +
    '<div class="stat"><span class="lab">Settimana</span><span class="big">' + nf(wk.doneKm, wk.doneKm % 1 ? 1 : 0) + '<small>/ ' + nf(wk.planKm) + ' km</small></span><div class="bar" role="img" aria-label="' + Math.round(wkPct) + '% dei km previsti"><span style="width:' + wkPct + '%"></span></div></div>' +
    '<div class="stat"><span class="lab">4 settimane</span><span class="big">' + nf(km28, 0) + '<small>km</small></span></div></div>';

  var stateCard = '<article class="card"><div class="pair"><span class="lab">Preparazione</span>' + chip(prep.tone, prep.label) + '</div><div class="pair"><span class="lab">Carico</span>' + chip(fat.tone, fat.label) + '</div><button class="btn" data-act="checkin">' + ic('heart') + 'Come stai?</button></article>';

  var G = core.goal.sec, lo = Math.min(pr.low, G) - 300, hi = Math.max(pr.high, G) + 300, px = function (x) { return ((x - lo) / (hi - lo) * 100).toFixed(1) + '%'; };
  var feas = '<article class="card"><div class="row between"><h2>Sub-4</h2><a class="linkbtn" href="#obiettivi">Dettagli</a></div><div class="row">' + chip(levelTone(pr), pr.levelLabel) + '<span class="src e">stima</span></div>' +
    '<div class="rng" role="img" aria-label="Stima tra ' + hm(pr.low) + ' e ' + hm(pr.high) + ', centrale ' + hm(pr.plan) + '; obiettivo ' + hm(G) + '"><span class="track"></span><span class="band" style="left:' + px(pr.low) + ';width:calc(' + px(pr.high) + ' - ' + px(pr.low) + ')"></span><span class="goal" style="left:' + px(G) + '"></span><span class="lb g" style="left:' + px(G) + '">obiettivo</span><span class="pt" style="left:' + px(pr.plan) + '"></span><span class="lb" style="left:' + px(pr.low) + '">' + hm(pr.low) + '</span><span class="lb c" style="left:' + px(pr.plan) + '">' + hm(pr.plan) + '</span><span class="lb" style="left:' + px(pr.high) + '">' + hm(pr.high) + '</span></div></article>';

  var lp = Math.min(100, l35.longest / 35 * 100);
  var longCard = '<article class="card"><div class="row between"><h2>Verso i 35 km</h2><a class="linkbtn" href="#obiettivi">Criteri ' + l35.metCount + '/' + l35.list.length + '</a></div><span class="big">' + nf(l35.longest) + '<small>/ 35 km</small></span>' +
    '<div class="miles"><div class="bar" role="img" aria-label="' + Math.round(lp) + '% di 35 km"><span style="width:' + lp + '%"></span></div>' + [20, 28, 32, 35].map(function (m) { return '<span class="mk" style="left:' + (m / 35 * 100) + '%">' + m + '</span>'; }).join('') + '</div></article>';

  var weeks = E.allWeeks(state, t), mx = Math.max.apply(null, weeks.map(function (w) { return w.ph === 'race' ? 0 : w.planKm; }).concat([1]));
  var road = '<article class="card span2"><div class="row between"><h2>Piano</h2><span class="tiny">picco ' + nf(mx, 0) + ' km</span></div><div class="roadmap" role="img" aria-label="Chilometri previsti e fatti in ognuna delle ' + weeks.length + ' settimane">' +
    weeks.map(function (w) { var race = w.ph === 'race', p = race ? 0.55 : w.planKm / mx, dn = w.planKm ? Math.min(1, w.doneKm / w.planKm) : 0; return '<div class="w' + (w.mon === mondayOf(t) ? ' cur' : '') + (race ? ' race' : '') + '" title="Settimana ' + w.wk + ': ' + nf(w.planKm, 0) + ' km previsti, ' + nf(w.doneKm, 0) + ' fatti"><div class="p" style="height:' + Math.max(4, p * 100).toFixed(0) + '%"><div class="d" style="height:' + (dn * 100).toFixed(0) + '%"></div></div></div>'; }).join('') +
    '</div><div class="roadmap-ax"><span>sett. 1</span><span>gara</span></div></article>';

  return head('Oggi') + '<div class="grid two">' + (h ? '<div class="stack span2">' + h + '</div>' : '') + todayCard + nearCard + stats + stateCard + feas + longCard + road + '</div>';
}

// ---------- CALENDARIO ----------
function sessRow(s) {
  var f = P.family(s), d = desc(s), w = s.wid ? S.workouts[s.wid] : null, chips = statusChip(s);
  if (s.k === 'rest') return '<button class="sess rest" data-act="open" data-id="' + s.id + '"><span class="ttl">Riposo</span></button>';
  var meta = w && w.k === 'run' && w.km ? 'Fatti ' + nf(w.km) + ' km' + (w.sec ? ' · ' + fmtPace(w.sec / w.km) + '/km' : '') : (d.pace || (d.dur ? fmtDur(d.dur) : ''));
  return '<button class="sess f-' + f + (s.st === 'skipped' ? ' skipped' : '') + '" data-act="open" data-id="' + s.id + '"><span class="bar-l"></span><span class="stack grow" style="gap:3px"><span class="ttl">' + esc(d.title) + '</span>' +
    (meta ? '<span class="meta">' + esc(meta) + '</span>' : '') + (chips ? '<span class="row">' + chips + '</span>' : '') + '</span>' + (s.km ? '<span class="right"><span class="km">' + nf(s.km) + '<small>km</small></span></span>' : '') + '</button>';
}
function extraRow(w) {
  return '<button class="sess f-' + P.family(wAsSession(w)) + '" data-act="analysis" data-id="' + w.id + '"><span class="bar-l"></span><span class="stack grow" style="gap:3px"><span class="ttl">' + esc(wTitle(w)) + '</span><span class="row">' + chip('ok', 'Fatta', 'check') + chip('', 'Extra') + '</span></span>' + (w.km ? '<span class="right"><span class="km">' + nf(w.km) + '<small>km</small></span></span>' : '') + '</button>';
}
function calendarioView() {
  var t = today(), d0 = ui.calDate || t, mode = ui.calMode, body = '', label = '';
  var seg = '<div class="seg" role="group" aria-label="Vista">' + [['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese']].map(function (m) { return '<button data-act="calmode" data-v="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>';
  if (mode === 'settimana') {
    var mon = mondayOf(d0), wk = E.weekOf(st(), mon, t);
    label = dshort(mon).slice(4) + ' – ' + dshort(addDays(mon, 6)).slice(4);
    body = '<article class="card"><div class="row between"><h2>' + (wk.wk ? 'Settimana ' + wk.wk + ' · ' + esc(P.PHASE[wk.ph] || '') : 'Fuori dal piano') + '</h2><span class="row">' + (wk.down && wk.ph !== 'race' ? chip('info', 'Scarico') : '') + '<span class="tiny num">' + nf(wk.doneKm, wk.doneKm % 1 ? 1 : 0) + ' / ' + nf(wk.planKm) + ' km</span></span></div><div>';
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i), ss = sessionsOn(d), ex = extrasOn(d);
      body += '<div class="day' + (d === t ? ' is-today' : '') + '"><div class="dt"><span>' + E.WD[i].slice(0, 3) + '</span><b>' + P.parse(d).getDate() + '</b></div><div class="stack">' + (ss.map(sessRow).join('') + ex.map(extraRow).join('') || '<span class="tiny" style="padding-top:8px">–</span>') + '</div></div>';
    }
    body += '</div></article>';
  } else if (mode === 'mese') {
    var dd = P.parse(d0), y = dd.getFullYear(), m = dd.getMonth(), first = P.iso(new Date(y, m, 1)), start = mondayOf(first), cells = '';
    label = cap1(MONTHS[m]) + ' ' + y;
    for (var c = 0; c < 42; c++) {
      var dc = addDays(start, c), inM = P.parse(dc).getMonth() === m;
      if (c >= 35 && !inM && P.parse(addDays(start, 35)).getMonth() !== m) break;
      if (!inM) { cells += '<div class="mcell out"></div>'; continue; }
      var sx = sessionsOn(dc).filter(function (s) { return s.k !== 'rest' && s.k !== 'mobility'; });
      var pills = sx.slice(0, 2).map(function (s) { var f = P.family(s); return '<span class="mpill f-' + f + ' ' + s.st + '"><i></i>' + (s.km ? nf(s.km, s.km % 1 ? 1 : 0) : (s.k === 'strength' ? 'F' : s.k === 'swim' ? 'N' : '·')) + (s.st === 'done' ? '✓' : '') + '</span>'; }).join('');
      var names = sessionsOn(dc).map(function (s) { return P.title(s) + (s.km ? ' ' + nf(s.km) + ' km' : '') + (s.st === 'done' ? ', fatta' : s.st === 'skipped' ? ', saltata' : ''); }).join('; ');
      cells += '<button class="mcell' + (dc === t ? ' is-today' : '') + '" data-act="day" data-d="' + dc + '" aria-label="' + esc(dlong(dc) + ': ' + (names || 'nessuna sessione')) + '"><span class="n">' + P.parse(dc).getDate() + '</span>' + pills + '</button>';
    }
    body = '<article class="card"><div class="month">' + ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(function (x) { return '<div class="wdh">' + x + '</div>'; }).join('') + cells + '</div>' +
      '<div class="legend"><span><i style="background:var(--t-easy)"></i>facile</span><span><i style="background:var(--t-quality)"></i>qualità</span><span><i style="background:var(--t-long)"></i>lungo</span><span><i style="background:var(--t-race)"></i>test</span><span><i style="background:var(--t-strength)"></i>forza</span><span><i style="background:var(--t-swim)"></i>nuoto</span></div></article>';
  } else {
    label = cap1(dlong(d0));
    var sd = sessionsOn(d0), ed = extrasOn(d0);
    body = sd.map(function (s) { return '<article class="card">' + sessionDetail(s, 'view') + '</article>'; }).join('') + ed.map(function (w) { return '<article class="card">' + extraRow(w) + '</article>'; }).join('') || '<div class="empty">Nessuna sessione</div>';
  }
  return head('Calendario', '<button class="btn sm" data-act="add-ui" data-d="' + (mode === 'giorno' ? d0 : t) + '">' + ic('plus') + 'Aggiungi</button>') +
    '<div class="stack" style="gap:12px">' + seg + '<div class="nav-row"><button class="icon-btn" data-act="calnav" data-v="-1" aria-label="Precedente">' + ic('chevL') + '</button><span class="lbl">' + esc(label) + '</span><button class="btn sm" data-act="caltoday">Oggi</button><button class="icon-btn" data-act="calnav" data-v="1" aria-label="Successivo">' + ic('chevR') + '</button></div>' + body + '</div>';
}

// ---------- DETTAGLIO SESSIONE ----------
function sessionDetail(s, mode) {
  var d = desc(s), w = s.wid ? S.workouts[s.wid] : null, t = today(), h = '';
  h += '<div class="row between"><span class="tiny">' + esc(cap1(dlong(s.d))) + '</span><span class="row">' + statusChip(s) + '</span></div>';
  if (mode !== 'sheet') h += '<h2>' + esc(d.title) + '</h2>';
  var top = [s.km ? nf(s.km) + ' km' : null, d.dur && s.k !== 'rest' ? fmtDur(d.dur) : null].filter(Boolean).join(' · ');
  if (top) h += '<div class="big2 num">' + top + '</div>';
  if (s.rec) h += '<p class="tiny">Recupero della corsa di ' + esc(dshort(s.rec.from)) + '</p>';
  else if (s.orig) h += '<p class="tiny">Prima: ' + esc(P.title({ k: s.orig.k, s: s.orig.s })) + (s.orig.km ? ' ' + nf(s.orig.km) + ' km' : '') + ' · ' + esc(dshort(s.orig.d)) + '</p>';
  if (s.st === 'skipped' && s.why && s.why !== 'Non indicato') h += '<p class="tiny">Saltata: ' + esc(s.why.toLowerCase()) + '</p>';
  h += '<dl class="kv">' + kv('Ritmo', d.pace ? esc(d.pace) : '') + kv('Sforzo', d.intensity && d.intensity !== '—' ? esc(d.intensity) : '') + kv(s.k === 'run' ? 'Schema' : 'Cosa fare', esc(d.structure || '')) + kv('Nota', s.note ? esc(s.note) : '') + '</dl>';
  var more = kv('Obiettivo', esc(d.goal || '')) + kv('Dislivello', esc(d.gain || '')) + kv('Alimentazione', esc(d.fuel || '')) + kv('Tecnica', esc(d.tech || '')) + kv('Recupero', d.recovery && d.recovery !== '—' ? esc(d.recovery) : '');
  if (more && s.k !== 'rest') h += '<details class="grp"><summary>Dettagli</summary><div class="body"><dl class="kv">' + more + '</dl></div></details>';
  if (w) {
    h += '<div class="tscroll"><table class="data"><thead><tr><th></th><th class="r">Previsto</th><th class="r">Fatto</th></tr></thead><tbody>' +
      (s.km ? '<tr><td>Km</td><td class="r">' + nf(s.km) + '</td><td class="r">' + nf(w.km) + '</td></tr>' : '') +
      '<tr><td>Durata</td><td class="r">' + (d.dur ? fmtDur(d.dur) : '–') + '</td><td class="r">' + (E.minutesOf(w) ? fmtDur(E.minutesOf(w)) : '–') + '</td></tr>' +
      (w.k === 'run' ? '<tr><td>Ritmo</td><td class="r">' + esc((d.pace || '–').replace('/km', '')) + '</td><td class="r">' + (w.sec && w.km ? fmtPace(w.sec / w.km) : '–') + '</td></tr>' : '') +
      '</tbody></table></div>';
  }
  var hist = vals(S.changes).filter(function (c) { return c.ops && c.ops.some(function (o) { return o.id === s.id; }); }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  if (hist.length) h += '<details class="grp"><summary>Modifiche (' + hist.length + ')</summary><div class="body"><ul class="tl">' + hist.map(function (c) { var o = c.ops.filter(function (x) { return x.id === s.id; })[0]; return '<li><div class="row between">' + changeStatus(c) + '<span class="tiny">' + esc(dstamp(c.at)) + '</span></div><span class="small">' + (o && o.a ? esc(o.a) + ' → ' + esc(o.b) : esc(c.title)) + '</span></li>'; }).join('') + '</ul></div></details>';
  var a = '';
  if (w) a += '<button class="btn pri" data-act="analysis" data-id="' + w.id + '">Analisi</button>';
  else if (s.st === 'skipped') a += '<button class="btn" data-act="unskip" data-id="' + s.id + '">Ripristina</button><button class="btn" data-act="log" data-id="' + s.id + '">Fatta</button>';
  else {
    if (s.k !== 'rest') a += '<button class="btn pri" data-act="log" data-id="' + s.id + '">' + ic('plus') + 'Registra</button>';
    if (s.k !== 'rest' && s.s !== 'race') a += '<button class="btn" data-act="sheet-mode" data-id="' + s.id + '" data-v="skip">Salta</button>';
    if (s.s !== 'race') a += '<button class="btn" data-act="sheet-mode" data-id="' + s.id + '" data-v="move">Rinvia</button><button class="btn" data-act="sheet-mode" data-id="' + s.id + '" data-v="edit">Modifica</button>';
  }
  if (s.user && !w) a += '<button class="btn danger" data-act="sheet-mode" data-id="' + s.id + '" data-v="del">Elimina</button>';
  return h + '<div class="btns">' + a + '</div>';
}
function changeStatus(c) {
  var m = { pending: ['info', 'In attesa'], applied: ['ok', c.kind === 'auto' ? 'Coach' : c.kind === 'manual' ? 'Tua' : c.kind === 'setup' ? 'Iniziale' : 'Accettata'], rejected: ['', 'Rifiutata'], undone: ['', 'Annullata'], expired: ['', 'Scaduta'], info: ['', 'Nota'] }[c.status] || ['', c.status];
  return chip(m[0], m[1]);
}
var SKIP_WHY = ['Impegni', 'Stanchezza', 'Meteo', 'Dolore o fastidio', 'Malattia', 'Altro'];
function sessionSheet(id, mode) {
  var s = session(id); if (!s) return;
  ui.sheet = { id: id, mode: mode || 'view' };
  var d = desc(s), body, back = '<button class="btn" type="button" data-act="sheet-mode" data-id="' + id + '" data-v="view">Indietro</button>';
  if (mode === 'skip') {
    var rec = '';
    if (s.k === 'run') {
      var blk = E.recoveryBlocked(st(), s, today(), ''), opts = blk ? [] : E.recoveryOptions(st(), s, today());
      rec = '<div class="field" id="sk-rec"><label for="sk-day">Recupero</label>' + (opts.length ? '<select id="sk-day">' + opts.map(function (x) { return '<option value="' + x + '">' + esc(cap1(dlong(x))) + '</option>'; }).join('') + '<option value="none">Non recuperare</option></select>' : '<p class="small muted">' + esc(blk || 'Nessun giorno adatto: viene assorbita.') + '</p>') + '</div><p class="small muted" id="sk-norec" hidden>Con dolore o malattia non si recupera.</p>';
    }
    body = '<form data-form="skip" data-id="' + id + '" class="stack" style="gap:14px"><div class="field"><label for="sk-why">Motivo</label><select id="sk-why">' + SKIP_WHY.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></div>' + rec + '<div class="btns"><button class="btn pri" type="submit">Salta</button>' + back + '</div></form>';
  }
  else if (mode === 'move') body = '<form data-form="move" data-id="' + id + '" class="stack" style="gap:14px"><div class="field"><label for="mv-date">Nuova data</label><input type="date" id="mv-date" value="' + s.d + '" min="' + today() + '" max="' + S.core.race.date + '" required></div><div class="btns"><button class="btn pri" type="submit">Sposta</button>' + back + '</div></form>';
  else if (mode === 'edit') body = '<form data-form="edit" data-id="' + id + '" class="stack" style="gap:14px">' + (s.k === 'run' ? '<div class="fgrid"><div class="field"><label for="ed-sub">Tipo</label><select id="ed-sub">' + P.SUB_OPTIONS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === s.s ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div><div class="field"><label for="ed-km">Km</label><input id="ed-km" inputmode="decimal" value="' + nf(s.km) + '"></div></div>' : '') + '<div class="field"><label for="ed-note">Nota</label><textarea id="ed-note">' + esc(s.note || '') + '</textarea></div><div class="btns"><button class="btn pri" type="submit">Salva</button>' + back + '</div></form>';
  else if (mode === 'del') body = '<div class="btns"><button class="btn danger" data-act="del-session" data-id="' + id + '">Elimina</button>' + back + '</div>';
  else body = sessionDetail(s, 'sheet');
  openSheet(mode === 'del' ? 'Eliminare la sessione?' : d.title, body);
}
function openSheet(title, body) {
  var d = document.getElementById('sheet');
  d.innerHTML = '<div class="sheet-h"><h2 id="sheet-title">' + esc(title) + '</h2><button class="icon-btn" data-act="close" aria-label="Chiudi">' + ic('x') + '</button></div><div class="sheet-b">' + body + '</div>';
  if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
}
function closeSheet() { var d = document.getElementById('sheet'); ui.sheet = null; if (d.open && d.close) d.close(); else { d.removeAttribute('open'); render(); } }

function addSheet(date) {
  openSheet('Aggiungi', '<form data-form="add" class="stack" style="gap:14px"><div class="fgrid"><div class="field"><label for="ad-date">Data</label><input type="date" id="ad-date" value="' + date + '" required></div><div class="field"><label for="ad-kind">Attività</label><select id="ad-kind"><option value="run">Corsa</option><option value="strength">Forza</option><option value="swim">Nuoto</option><option value="mobility">Mobilità</option></select></div>' +
    '<div class="field"><label for="ad-sub">Tipo</label><select id="ad-sub">' + P.SUB_OPTIONS.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></div><div class="field"><label for="ad-km">Km</label><input id="ad-km" inputmode="decimal"></div>' +
    '<div class="field full"><label for="ad-title">Nome</label><input id="ad-title"></div><div class="field full"><label for="ad-note">Nota</label><textarea id="ad-note"></textarea></div></div><button class="btn pri" type="submit">Aggiungi</button></form>');
}
function scale(name, cur) { var o = ''; for (var i = 1; i <= 5; i++) o += '<label><input type="radio" name="' + name + '" value="' + i + '"' + (cur === i ? ' checked' : '') + '><span>' + i + '</span></label>'; return '<div class="opts">' + o + '</div>'; }
function checkinSheet() {
  openSheet('Come stai?', '<form data-form="checkin" class="stack" style="gap:16px">' +
    '<fieldset class="fs"><legend class="lab">Stanchezza <small>5 = esausto</small></legend>' + scale('ci-fat') + '</fieldset>' +
    '<fieldset class="fs"><legend class="lab">Sonno <small>5 = ottimo</small></legend>' + scale('ci-sleep') + '</fieldset>' +
    '<fieldset class="fs"><legend class="lab">Stress <small>5 = alto</small></legend>' + scale('ci-stress') + '</fieldset>' + painFields('ci', null) +
    '<label class="row" style="min-height:44px"><input type="checkbox" id="ci-ill" style="width:22px;height:22px"> <span>Malato o con febbre</span></label>' +
    '<div class="field"><label for="ci-note">Note</label><textarea id="ci-note"></textarea></div><button class="btn pri" type="submit">Salva</button></form>');
}
var AREAS = ['piede', 'caviglia', 'tendine d’Achille', 'polpaccio', 'tibia', 'ginocchio', 'coscia anteriore', 'coscia posteriore', 'anca o gluteo', 'schiena', 'altro'];
function painFields(p, cur) {
  cur = cur || { lvl: 0 };
  return '<fieldset class="fs"><legend class="lab">Dolore</legend><div class="opts c4">' + E.PAIN_LBL.map(function (l, i) { return '<label><input type="radio" name="' + p + '-pain" value="' + i + '"' + (i === (cur.lvl || 0) ? ' checked' : '') + '><span>' + cap1(l) + '</span></label>'; }).join('') + '</div>' +
    '<div class="fgrid"><div class="field"><label for="' + p + '-area">Zona</label><select id="' + p + '-area"><option value="">—</option>' + AREAS.map(function (a) { return '<option' + (cur.area === a ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select></div><div class="field"><label for="' + p + '-pnote">Nota</label><input id="' + p + '-pnote" value="' + esc(cur.note || '') + '"></div></div></fieldset>';
}
function readPain(p, root) {
  var r = $('input[name="' + p + '-pain"]:checked', root), lvl = r ? +r.value : 0;
  if (!lvl) return null;
  return { lvl: lvl, area: $('#' + p + '-area', root).value || null, note: $('#' + p + '-pnote', root).value.trim() || null };
}

// ---------- REGISTRA ----------
function registraView() {
  var f = ui.form || {}, w = f.editId ? S.workouts[f.editId] : null, t = today();
  var v = w ? clone(w) : { date: f.date || t, k: f.k || 'run', sub: f.sub || 'easy', km: f.km || null, sid: f.sid || null };
  var hh = v.sec ? Math.floor(v.sec / 3600) : '', mm = v.sec ? Math.floor(v.sec % 3600 / 60) : '', sx = v.sec ? Math.round(v.sec % 60) : '';
  function val(x) { return x == null ? '' : esc(String(x).replace('.', ',')); }
  function ten(cur) { var o = ''; for (var i = 1; i <= 10; i++) o += '<label><input type="radio" name="f-rpe" value="' + i + '"' + (cur === i ? ' checked' : '') + '><span>' + i + '</span></label>'; return '<div class="opts">' + o + '</div>'; }
  var kinds = [['run', 'Corsa'], ['strength', 'Forza'], ['swim', 'Nuoto'], ['mobility', 'Mobilità'], ['other', 'Altro']];
  return head(w ? 'Correggi' : 'Registra') +
    '<form id="f-log" data-form="log" novalidate class="stack" style="gap:12px"><div id="f-errsum" class="errsum" role="alert" hidden></div>' +
    '<article class="card"><div class="opts" role="radiogroup" aria-label="Attività">' + kinds.map(function (k) { return '<label><input type="radio" name="f-k" value="' + k[0] + '"' + (v.k === k[0] ? ' checked' : '') + '><span>' + k[1] + '</span></label>'; }).join('') + '</div>' +
    '<div class="fgrid"><div class="field"><label for="f-date">Data</label><input type="date" id="f-date" value="' + v.date + '" max="' + t + '" required></div>' +
    '<div class="field only-run"><label for="f-sub">Tipo</label><select id="f-sub">' + P.SUB_OPTIONS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v.sub ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="field full"><label for="f-sid">Sessione</label><select id="f-sid" data-cur="' + esc(v.sid || '') + '"></select></div>' +
    '<div class="field only-run"><label for="f-km">Km<span class="only-test" hidden> del test</span></label><input id="f-km" inputmode="decimal" value="' + val(v.km) + '"></div>' +
    '<div class="field only-run only-test" hidden><label for="f-extra">Km extra</label><input id="f-extra" inputmode="decimal" value="' + val(v.extraKm) + '"></div>' +
    '<div class="field only-run full"><span class="lab" id="f-time-l">Tempo</span><div class="time3" role="group" aria-labelledby="f-time-l"><span><input id="f-h" inputmode="numeric" aria-label="Ore" value="' + hh + '" placeholder="0"><em>h</em></span><span><input id="f-m" inputmode="numeric" aria-label="Minuti" value="' + mm + '" placeholder="00"><em>min</em></span><span><input id="f-s" inputmode="numeric" aria-label="Secondi" value="' + sx + '" placeholder="00"><em>s</em></span></div></div>' +
    '<div class="field only-other full" hidden><label for="f-min">Minuti</label><input id="f-min" inputmode="numeric" value="' + val(v.k !== 'run' ? v.min : '') + '"></div></div>' +
    '<div class="calc" id="f-calc" aria-live="polite" hidden></div>' +
    '<fieldset class="fs"><legend class="lab">RPE <small>10 = massimo</small></legend>' + ten(v.rpe) + '</fieldset></article>' +

    '<details class="grp only-run"' + (v.hrAvg || v.up ? ' open' : '') + '><summary>FC e dislivello</summary><div class="body"><div class="fgrid">' +
    '<div class="field"><label for="f-hr">FC media</label><input id="f-hr" inputmode="numeric" value="' + val(v.hrAvg) + '"></div><div class="field"><label for="f-hrmax">FC max</label><input id="f-hrmax" inputmode="numeric" value="' + val(v.hrMax) + '"></div>' +
    '<div class="field"><label for="f-up">Salita (m)</label><input id="f-up" inputmode="numeric" value="' + val(v.up) + '"></div><div class="field"><label for="f-down">Discesa (m)</label><input id="f-down" inputmode="numeric" value="' + val(v.down) + '"></div></div></div></details>' +

    '<details class="grp"' + (v.feel || v.fatigue || v.pain || v.sleep ? ' open' : '') + '><summary>Sensazioni e dolori</summary><div class="body">' +
    '<fieldset class="fs"><legend class="lab">Sensazioni <small>5 = ottime</small></legend>' + scale('f-feel', v.feel) + '</fieldset>' +
    '<fieldset class="fs"><legend class="lab">Fatica <small>5 = esausto</small></legend>' + scale('f-fat', v.fatigue) + '</fieldset>' + painFields('f', v.pain) +
    '<fieldset class="fs"><legend class="lab">Sonno <small>5 = ottimo</small></legend>' + scale('f-sleep', v.sleep) + '</fieldset>' +
    '<div class="field"><label for="f-sleeph">Ore di sonno</label><input id="f-sleeph" inputmode="decimal" value="' + val(v.sleepH) + '"></div></div></details>' +

    '<details class="grp only-run"' + (v.temp != null || v.gels || v.waterMl ? ' open' : '') + '><summary>Meteo e alimentazione</summary><div class="body"><div class="fgrid">' +
    '<div class="field"><label for="f-temp">°C</label><input id="f-temp" inputmode="decimal" value="' + val(v.temp) + '"></div><div class="field"><label for="f-weather">Meteo</label><select id="f-weather">' + ['', 'sereno', 'nuvoloso', 'pioggia', 'vento', 'caldo umido', 'freddo'].map(function (x) { return '<option' + (v.weather === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label for="f-water">Acqua (ml)</label><input id="f-water" inputmode="numeric" value="' + val(v.waterMl) + '"></div><div class="field"><label for="f-gels">Gel</label><input id="f-gels" inputmode="numeric" value="' + val(v.gels) + '"></div>' +
    '<div class="field full"><label for="f-carbs">Carboidrati (g)</label><input id="f-carbs" inputmode="numeric" value="' + val(v.carbsG) + '"></div></div></div></details>' +

    '<article class="card"><div class="field"><label for="f-notes">Note</label><textarea id="f-notes">' + esc(v.notes || '') + '</textarea></div>' +
    '<div class="btns"><button class="btn pri" type="submit">Salva</button>' + (w ? '<button class="btn" type="button" data-act="analysis" data-id="' + w.id + '">Annulla</button>' : '') + '</div></article></form>';
}
function formKind() { var r = $('input[name="f-k"]:checked'); return r ? r.value : 'run'; }
function syncForm(keepSid) {
  var form = document.getElementById('f-log'); if (!form) return;
  var k = formKind(), sub = $('#f-sub').value, isT = k === 'run' && E.isTest(sub), date = $('#f-date').value;
  $$('.only-run', form).forEach(function (e) { e.hidden = k !== 'run'; });
  $$('.only-other', form).forEach(function (e) { e.hidden = k === 'run'; });
  $$('.only-test', form).forEach(function (e) { e.hidden = !isT; });
  var sel = $('#f-sid'), cur = keepSid ? sel.value : sel.getAttribute('data-cur'), editId = ui.form && ui.form.editId;
  var opts = sessionsOn(date).filter(function (s) { return s.k !== 'rest' && (s.st !== 'done' || s.wid === editId || s.id === cur); });
  var near = !opts.length ? S.plan.sessions.filter(function (s) { return s.st === 'planned' && s.k === k && Math.abs(diffDays(s.d, date)) <= 3; }) : [];
  sel.innerHTML = '<option value="">Fuori programma</option>' + opts.concat(near).map(function (s) { return '<option value="' + s.id + '">' + esc((s.d !== date ? dshort(s.d) + ' · ' : '') + P.title(s) + (s.km ? ' ' + nf(s.km) + ' km' : '')) + '</option>'; }).join('');
  if (cur && opts.concat(near).some(function (s) { return s.id === cur; })) sel.value = cur;
  else if (!keepSid || !sel.value) { var m = opts.filter(function (s) { return s.k === k; })[0]; if (m && !(ui.form && ui.form.editId)) sel.value = m.id; }
  sel.setAttribute('data-cur', sel.value);
  calcForm();
}
function formTime() { var h = num($('#f-h').value) || 0, m = num($('#f-m').value) || 0, s = num($('#f-s').value) || 0; return h * 3600 + m * 60 + s; }
function calcForm() {
  var el = document.getElementById('f-calc'); if (!el) return;
  var km = num($('#f-km').value), sec = formTime(), ok = formKind() === 'run' && km > 0 && sec > 0;
  el.hidden = !ok;
  el.innerHTML = ok ? '<span><b>' + fmtPace(sec / km) + '</b>/km</span><span><b>' + nf(km / (sec / 3600), 1) + '</b>km/h</span>' : '';
}
function readForm() {
  var errs = [], k = formKind(), t = today();
  function bad(id, msg) { errs.push({ id: id, msg: msg }); }
  function n(id, lab, lo, hi, int) { var x = num($('#' + id).value); if (x === null) return null; if (isNaN(x) || x < lo || x > hi) { bad(id, lab + ': tra ' + lo + ' e ' + hi + '.'); return null; } return int ? Math.round(x) : x; }
  function r(name) { var e = $('input[name="' + name + '"]:checked'); return e ? +e.value : null; }
  var w = { date: $('#f-date').value, k: k, sid: $('#f-sid').value || null, rpe: r('f-rpe'), feel: r('f-feel'), fatigue: r('f-fat'), sleep: r('f-sleep'), sleepH: n('f-sleeph', 'Ore di sonno', 0, 16), pain: readPain('f', document), notes: $('#f-notes').value.trim() || null };
  if (!w.date) bad('f-date', 'Manca la data.'); else if (w.date > t) bad('f-date', 'La data è nel futuro.');
  if (k === 'run') {
    w.sub = $('#f-sub').value; w.km = n('f-km', 'Km', 0.2, 120); w.extraKm = E.isTest(w.sub) ? n('f-extra', 'Km extra', 0, 30) : null;
    if (w.km === null && !errs.some(function (e) { return e.id === 'f-km'; })) bad('f-km', 'Mancano i km.');
    var h = num($('#f-h').value), m = num($('#f-m').value), s = num($('#f-s').value);
    if ([h, m, s].some(function (x) { return x !== null && (isNaN(x) || x < 0); }) || (m !== null && m > 599) || (s !== null && s > 59)) bad('f-m', 'Tempo non valido.');
    else { w.sec = formTime(); if (!w.sec) bad('f-m', 'Manca il tempo.'); }
    if (w.km && w.sec) { var p = w.sec / w.km; if (p < 150 || p > 900) bad('f-km', 'Ritmo di ' + fmtPace(p) + '/km: controlla km e tempo.'); }
    w.hrAvg = n('f-hr', 'FC media', 60, 230, 1); w.hrMax = n('f-hrmax', 'FC max', 60, 240, 1);
    if (w.hrAvg && w.hrMax && w.hrMax < w.hrAvg) bad('f-hrmax', 'FC max più bassa della media.');
    w.up = n('f-up', 'Salita', 0, 6000, 1); w.down = n('f-down', 'Discesa', 0, 6000, 1);
    w.temp = n('f-temp', 'Temperatura', -25, 48); w.weather = $('#f-weather').value || null;
    w.waterMl = n('f-water', 'Acqua', 0, 6000, 1); w.gels = n('f-gels', 'Gel', 0, 25, 1); w.carbsG = n('f-carbs', 'Carboidrati', 0, 800, 1);
  } else { w.min = n('f-min', 'Minuti', 1, 600, 1); }
  Object.keys(w).forEach(function (key) { if (w[key] === null || w[key] === undefined) delete w[key]; });
  return { w: w, errs: errs };
}
function showErrors(errs) {
  $$('#f-log [aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
  var sum = document.getElementById('f-errsum');
  if (!errs.length) { sum.hidden = true; return; }
  sum.hidden = false; sum.innerHTML = errs.map(function (e) { return esc(e.msg); }).join('<br>');
  errs.forEach(function (e) { var el = document.getElementById(e.id); if (el) el.setAttribute('aria-invalid', 'true'); });
  var first = document.getElementById(errs[0].id); if (first) { var dt = first.closest('details'); if (dt) dt.open = true; first.focus(); }
  sum.scrollIntoView({ block: 'center' });
}
