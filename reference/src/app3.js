/* app3.js — analisi, progressi, obiettivi, coach, guida, profilo */

// ---------- ANALISI ----------
function analisiView() {
  var w = ui.sel ? S.workouts[ui.sel] : null;
  if (w) return analysisDetail(w);
  var ws = liveWorkouts(), del = vals(S.workouts).filter(function (x) { return x.deleted; });
  var h = head('Analisi');
  if (!ws.length) h += '<div class="empty">Nessun allenamento<br><a class="btn pri" style="margin-top:12px" href="#registra">' + ic('plus') + 'Registra</a></div>';
  else h += '<article class="card"><div class="list">' + ws.map(function (x) {
    return '<button class="item" data-act="analysis" data-id="' + x.id + '">' + dot(wAsSession(x)) + '<span class="stack grow" style="gap:1px"><span class="ttl">' + esc(wTitle(x)) + (x.km ? ' · ' + nf(x.km) + ' km' : '') + '</span><span class="meta">' + esc(dshort(x.date)) + (x.sec && x.km ? ' · ' + fmtPace(x.sec / x.km) + '/km' : '') + (x.rpe ? ' · RPE ' + x.rpe : '') + '</span></span>' + chip(RATE[x.eval.rating], cap1(x.eval.rating)) + '<span class="chev">' + ic('chevR') + '</span></button>';
  }).join('') + '</div></article>';
  if (net.sample) h += '<details class="grp" style="margin-top:12px"><summary>Chiedi al coach AI</summary><div class="body"><form data-form="ask" class="stack"><div class="field"><label for="ask-q" class="vh">Domanda</label><textarea id="ask-q" placeholder="La tua domanda"></textarea></div><div class="btns"><button class="btn pri" type="submit">Chiedi</button><button class="btn" type="button" data-act="ai-stop" hidden id="ask-stop">Ferma</button></div><div id="ask-out" class="ai-out" aria-live="polite" hidden></div></form></div></details>';
  if (del.length) h += '<details class="grp" style="margin-top:12px"><summary>Eliminati (' + del.length + ')</summary><div class="body">' + del.map(function (x) { return '<div class="row between"><span class="small">' + esc(dshort(x.date) + ' · ' + wTitle(x)) + (x.km ? ' ' + nf(x.km) + ' km' : '') + '</span><button class="btn sm" data-act="w-restore" data-id="' + x.id + '">Ripristina</button></div>'; }).join('') + '</div></details>';
  return h;
}
function srcTag(t) { return t === 'u' ? '<span class="src u">tuo</span>' : t === 'e' ? '<span class="src e">stima</span>' : '<span class="src">calcolo</span>'; }
function analysisDetail(w) {
  var ev = w.eval, c = ev.calc, s = w.sid ? session(w.sid) : null, rows = [];
  function row(l, v, t) { if (v != null && v !== '') rows.push('<tr><td>' + l + '</td><td class="r">' + v + '</td><td class="r">' + srcTag(t) + '</td></tr>'); }
  row('Data', esc(dfull(w.date)), 'u'); row('Tipo', esc(wTitle(w)), 'u');
  if (w.k === 'run') {
    row('Km', nf(w.km), 'u'); if (w.extraKm) row('Km extra', nf(w.extraKm), 'u');
    row('Tempo', w.sec ? fmtTime(w.sec) : null, 'u'); row('Ritmo', c.pace ? fmtPace(c.pace) + '/km' : null, 'c'); row('Velocità', c.speed ? nf(c.speed, 1) + ' km/h' : null, 'c');
    if (c.adj && Math.abs(c.adj - c.pace) > 0.5) row('Ritmo in piano', fmtPace(c.adj) + '/km', 'e');
    if (c.target) row('Scarto dal ritmo previsto', (c.dev > 0 ? '+' : '') + nf(c.dev * 100, 1) + '%', 'c');
    if (c.completion != null) row('Completamento', Math.round(c.completion * 100) + '%', 'c');
    row('FC media', w.hrAvg ? w.hrAvg + ' bpm' : null, 'u'); row('FC max', w.hrMax ? w.hrMax + ' bpm' : null, 'u');
    if (c.hrPct) row('FC sulla max', Math.round(c.hrPct * 100) + '%', c.hrMaxEst ? 'e' : 'c');
    row('Salita', w.up != null ? w.up + ' m' : null, 'u'); row('Discesa', w.down != null ? w.down + ' m' : (w.up ? w.up + ' m' : null), w.down != null ? 'u' : 'e');
  } else row('Durata', w.min ? fmtDur(w.min) : null, 'u');
  row('RPE', w.rpe ? w.rpe + '/10' : null, 'u'); row('Sensazioni', w.feel ? w.feel + '/5' : null, 'u'); row('Fatica', w.fatigue ? w.fatigue + '/5' : null, 'u');
  row('Sonno', w.sleep ? w.sleep + '/5' + (w.sleepH ? ' · ' + nf(w.sleepH) + ' h' : '') : (w.sleepH ? nf(w.sleepH) + ' h' : null), 'u');
  row('Dolore', w.pain ? cap1(E.PAIN_LBL[w.pain.lvl]) + (w.pain.area ? ' · ' + esc(w.pain.area) : '') + (w.pain.note ? ' · ' + esc(w.pain.note) : '') : null, 'u');
  row('Meteo', (w.temp != null ? nf(w.temp) + ' °C' : '') + (w.weather ? (w.temp != null ? ' · ' : '') + esc(w.weather) : '') || null, 'u');
  row('Acqua', w.waterMl != null ? w.waterMl + ' ml' : null, 'u'); row('Gel', w.gels != null ? w.gels : null, 'u'); row('Carboidrati', w.carbsG != null ? w.carbsG + ' g' : null, 'u');
  if (c.carbsH) row('Carboidrati l’ora', Math.round(c.carbsH) + ' g', c.carbsEst ? 'e' : 'c');
  row('Carico', c.load, c.loadEst ? 'e' : 'c');
  if (c.eq10) row('Equivalente 10 km', fmtTime(c.eq10), 'e');
  function ul(a, cls) { return a && a.length ? '<ul class="pts ' + (cls || '') + '">' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  var tiles = [];
  if (c.pace) tiles.push(['Ritmo', fmtPace(c.pace)]);
  if (c.hrPct) tiles.push(['FC', Math.round(c.hrPct * 100) + '%']);
  if (w.rpe) tiles.push(['RPE', w.rpe]);
  tiles.push(['Carico', c.load]);
  var pending = (ev.cids || []).map(function (id) { return S.changes[id]; }).filter(function (x) { return x && x.status === 'pending'; }).length;
  var h = '<div class="head"><button class="btn sm" data-act="back-analysis">' + ic('chevL') + 'Tutti</button></div>';
  h += '<article class="card an"><div class="row between">' + chip(RATE[ev.rating], cap1(ev.rating)) + '<span class="tiny">' + esc(cap1(dshort(w.date))) + (s ? '' : ' · extra') + '</span></div><h2 style="font-size:26px">' + esc(wTitle(w)) + (w.km ? ' · ' + nf(w.km) + ' km' : '') + '</h2>' +
    '<div class="tiles">' + tiles.map(function (x) { return '<div class="tile"><span class="lab">' + x[0] + '</span><span class="big">' + x[1] + '</span></div>'; }).join('') + '</div>' +
    (ev.good.length ? '<h3>Bene</h3>' + ul(ev.good, 'plus') : '') + (ev.improve.length ? '<h3>Da migliorare</h3>' + ul(ev.improve, 'minus') : '') +
    '<dl class="kv">' + kv('Recupero', esc(ev.recovery.join(' '))) + kv('Prossimo', esc(ev.next.join(' '))) + kv('Piano', esc((ev.impact || []).join(' · '))) + '</dl>' +
    (pending ? '<a class="btn" href="#storico">' + ic('coach') + 'Proposta del coach</a>' : '') +
    '<details class="grp"><summary>Analisi e dati</summary><div class="body">' + ul(ev.analysis) + '<div class="tscroll"><table class="data"><tbody>' + rows.join('') + '</tbody></table></div>' + (w.notes ? '<p class="small">' + esc(w.notes) + '</p>' : '') + '</div></details></article>';
  if (net.sample) h += '<article class="card" style="margin-top:12px"><div class="row between"><h2>Parere AI</h2><span class="btns" style="flex:none"><button class="btn sm" data-act="ai-workout" data-id="' + w.id + '">' + (w.ai ? 'Rifai' : 'Chiedi') + '</button><button class="btn sm" data-act="ai-stop" id="ai-stop" hidden>Ferma</button></span></div>' + (w.ai ? '<div class="ai-out" id="ai-out">' + esc(w.ai.text) + '</div>' : '<div class="ai-out" id="ai-out" aria-live="polite" hidden></div>') + '</article>';
  if (w.edits && w.edits.length) h += '<details class="grp" style="margin-top:12px"><summary>Correzioni (' + w.edits.length + ')</summary><div class="body">' + w.edits.map(function (e) { return '<div class="small"><b>' + esc(dstamp(e.at)) + '</b><br>' + Object.keys(e.diff).map(function (k) { return esc(k) + ': ' + esc(JSON.stringify(e.diff[k][0])) + ' → ' + esc(JSON.stringify(e.diff[k][1])); }).join('<br>') + '</div>'; }).join('') + '</div></details>';
  h += '<div class="btns" style="margin-top:12px"><button class="btn" data-act="w-edit" data-id="' + w.id + '">Correggi</button><button class="btn danger" data-act="w-del" data-id="' + w.id + '">Elimina</button></div>';
  return h;
}

// ---------- PROGRESSI ----------
var charts = [];
function killCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) { } }); charts = []; }
function cv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
var CHART_TABS = [['volume', 'Volume'], ['lunghi', 'Lunghi'], ['ritmo', 'Ritmo e FC'], ['carico', 'Carico'], ['costanza', 'Costanza'], ['previsione', 'Previsione']];
function progressiView() {
  return head('Progressi') + '<div class="scrollx"><div class="seg" role="group" aria-label="Grafici">' + CHART_TABS.map(function (t) { return '<button data-act="chtab" data-v="' + t[0] + '" aria-pressed="' + (ui.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div></div><div id="charts" class="grid two" style="margin-top:12px"></div>';
}
function chartDefs() {
  var t = today(), state = st(), weeks = E.allWeeks(state, t), wl = weeks.map(function (w) { return 'S' + w.wk; }), past = function (w) { return w.mon <= t; };
  var runs = liveWorkouts().filter(function (w) { return w.k === 'run'; }).reverse(), all = liveWorkouts().slice().reverse(), defs = [], km = function (v) { return nf(v) + ' km'; };
  var C1 = cv('--c1'), C2 = cv('--c2'), C3 = cv('--c3'), GH = cv('--ghost'), INK = cv('--ink');
  function bullet(label, plan, done, fmt, extra) { return { type: 'bar', labels: label, fmt: fmt, sets: [{ label: 'Previsto', data: plan, backgroundColor: GH, grouped: false, barPercentage: 0.92, categoryPercentage: 0.9, order: 2 }, { label: 'Fatto', data: done, backgroundColor: C1, grouped: false, barPercentage: 0.5, categoryPercentage: 0.9, order: 1 }].concat(extra || []) }; }
  if (ui.tab === 'volume') {
    defs.push(Object.assign({ id: 'c-kmw', title: 'Km a settimana' }, bullet(wl, weeks.map(function (w) { return w.ph === 'race' ? w.planKm - 42.195 : w.planKm; }), weeks.map(function (w) { return past(w) ? +w.doneKm.toFixed(1) : null; }), km)));
    var mo = {}, order = []; weeks.forEach(function (w) { var d = P.parse(addDays(w.mon, 3)), k = E.MO[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2); if (!mo[k]) { mo[k] = { p: 0, d: 0 }; order.push(k); } mo[k].p += w.planKm; mo[k].d += w.doneKm; });
    defs.push(Object.assign({ id: 'c-kmm', title: 'Km al mese' }, bullet(order, order.map(function (k) { return Math.round(mo[k].p); }), order.map(function (k) { return +mo[k].d.toFixed(1); }), km)));
    var cp = 0, cd = 0; defs.push({ id: 'c-cum', title: 'Km totali', type: 'line', min: 0, labels: wl, fmt: function (v) { return nf(v, 0) + ' km'; }, sets: [{ label: 'Previsto', data: weeks.map(function (w) { cp += w.planKm; return Math.round(cp); }), borderColor: GH, borderDash: [5, 4], pointRadius: 0 }, { label: 'Fatto', data: weeks.map(function (w) { cd += w.doneKm; return past(w) ? +cd.toFixed(1) : null; }), borderColor: C1 }] });
    defs.push({ id: 'c-up', title: 'Dislivello', type: 'bar', labels: wl, fmt: function (v) { return Math.round(v) + ' m'; }, need: runs.some(function (w) { return w.up; }), sets: [{ label: 'Salita', data: weeks.map(function (w) { return past(w) ? w.up : null; }), backgroundColor: C1 }] });
    var lastN = all.slice(-24); defs.push({ id: 'c-dur', title: 'Durata', type: 'bar', labels: lastN.map(function (w) { return dshort(w.date).slice(4); }), fmt: function (v) { return fmtDur(v); }, need: lastN.length > 0, sets: [{ label: 'Durata', data: lastN.map(function (w) { return Math.round(E.minutesOf(w)) || null; }), backgroundColor: C1 }] });
  } else if (ui.tab === 'lunghi') {
    defs.push(Object.assign({ id: 'c-long', title: 'Lunghi', wide: true }, bullet(wl, weeks.map(function (w) { return w.ph === 'race' ? null : w.longPlan; }), weeks.map(function (w) { return past(w) && w.longDone ? w.longDone : null; }), km, [{ type: 'line', label: '35 km', data: weeks.map(function () { return 35; }), borderColor: INK, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, order: 0 }])));
    var longs = runs.filter(function (w) { return w.sub === 'long' && w.sec; });
    defs.push({ id: 'c-longdur', title: 'Durata dei lunghi', type: 'bar', labels: longs.map(function (w) { return dshort(w.date).slice(4); }), fmt: function (v) { return fmtDur(v); }, need: longs.length > 0, sets: [{ label: 'Durata', data: longs.map(function (w) { return Math.round(w.sec / 60); }), backgroundColor: C1 }] });
  } else if (ui.tab === 'ritmo') {
    var er = runs.filter(function (w) { return (w.sub === 'easy' || w.sub === 'long') && w.sec && w.km; }), lb = er.map(function (w) { return dshort(w.date).slice(4); });
    defs.push({ id: 'c-pace', title: 'Ritmo', type: 'line', labels: lb, reverse: true, fmt: function (v) { return fmtPace(v) + '/km'; }, need: er.length > 0, sets: [{ label: 'Facile', data: er.map(function (w) { return w.sub === 'easy' ? Math.round(w.sec / w.km) : null; }), borderColor: C1, spanGaps: true }, { label: 'Lungo', data: er.map(function (w) { return w.sub === 'long' ? Math.round(w.sec / w.km) : null; }), borderColor: C2, spanGaps: true }] });
    var hr = runs.filter(function (w) { return w.hrAvg; });
    defs.push({ id: 'c-hr', title: 'FC media', type: 'line', labels: hr.map(function (w) { return dshort(w.date).slice(4); }), fmt: function (v) { return Math.round(v) + ' bpm'; }, need: hr.length > 0, sets: [{ label: 'FC media', data: hr.map(function (w) { return w.hrAvg; }), borderColor: C1 }] });
    var rp = all.filter(function (w) { return w.rpe; }).slice(-24);
    defs.push({ id: 'c-rpe', title: 'RPE', type: 'bar', labels: rp.map(function (w) { return dshort(w.date).slice(4); }), fmt: function (v) { return 'RPE ' + v; }, need: rp.length > 0, max: 10, sets: [{ label: 'RPE', data: rp.map(function (w) { return w.rpe; }), backgroundColor: C1 }] });
  } else if (ui.tab === 'carico') {
    defs.push({ id: 'c-load', title: 'Carico', type: 'bar', labels: wl, fmt: function (v) { return Math.round(v) + ' unità'; }, need: all.length > 0, sets: [{ label: 'Carico', data: weeks.map(function (w) { return past(w) ? w.load : null; }), backgroundColor: C1 }] });
    var ac = weeks.map(function (w) { if (!past(w)) return null; var d = addDays(w.mon, 6) > t ? t : addDays(w.mon, 6), a = E.acwrAt(state, d); return a && a.r ? +a.r.toFixed(2) : null; });
    defs.push({ id: 'c-acwr', title: 'Carico recente / abituale (stima)', type: 'line', labels: wl, fmt: function (v) { return nf(v, 2); }, need: ac.some(function (x) { return x != null; }), sets: [{ label: 'Rapporto', data: ac, borderColor: C1, spanGaps: true }, { label: '1,3', data: wl.map(function () { return 1.3; }), borderColor: GH, borderDash: [5, 4], pointRadius: 0 }, { label: '0,8', data: wl.map(function () { return 0.8; }), borderColor: GH, borderDash: [5, 4], pointRadius: 0 }] });
    var sf = cv('--surface');
    defs.push({ id: 'c-int', title: 'Intensità', type: 'bar', stacked: true, labels: wl, fmt: function (v) { return Math.round(v) + ' min'; }, need: runs.length > 0, sets: [{ label: 'Facile', data: weeks.map(function (w) { return past(w) ? Math.round(w.easyMin) : null; }), backgroundColor: cv('--seq1'), borderColor: sf, borderWidth: 1 }, { label: 'Moderata', data: weeks.map(function (w) { return past(w) ? Math.round(w.modMin) : null; }), backgroundColor: cv('--seq2'), borderColor: sf, borderWidth: 1 }, { label: 'Intensa', data: weeks.map(function (w) { return past(w) ? Math.round(w.hardMin) : null; }), backgroundColor: cv('--seq3'), borderColor: sf, borderWidth: 1 }] });
  } else if (ui.tab === 'costanza') {
    var pw = weeks.filter(past);
    defs.push({ id: 'c-comp', title: 'Sessioni completate', wide: true, type: 'bar', labels: pw.map(function (w) { return 'S' + w.wk; }), fmt: function (v) { return Math.round(v) + '%'; }, max: 100, need: pw.some(function (w) { return w.keyDue; }), sets: [{ label: 'Completate', data: pw.map(function (w) { return w.keyDue ? Math.round(w.keyDone / w.keyDue * 100) : null; }), backgroundColor: C1 }] });
    defs.push({ id: 'c-kmpct', title: 'Km fatti / previsti', type: 'bar', labels: pw.filter(function (w) { return w.complete; }).map(function (w) { return 'S' + w.wk; }), fmt: function (v) { return Math.round(v) + '%'; }, need: pw.some(function (w) { return w.complete; }), sets: [{ label: 'Km fatti', data: pw.filter(function (w) { return w.complete; }).map(function (w) { return w.planKm ? Math.round(w.doneKm / w.planKm * 100) : null; }), backgroundColor: C1 }] });
  } else {
    var ph = S.core.predHistory || [], pl = ph.map(function (p) { return dshort(p.d).slice(4); });
    defs.push({ id: 'c-pred', title: 'Tempo previsto (stima)', wide: true, type: 'line', labels: pl, fmt: hm, need: ph.length > 0, sets: [{ label: 'Centrale', data: ph.map(function (p) { return p.plan; }), borderColor: C1 }, { label: 'Prudente', data: ph.map(function (p) { return p.high; }), borderColor: C2, borderWidth: 1.5 }, { label: 'Favorevole', data: ph.map(function (p) { return p.low; }), borderColor: C3, borderWidth: 1.5 }, { label: 'Obiettivo', data: ph.map(function (p) { return p.goal; }), borderColor: INK, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, stepped: true }] });
    var gh = S.core.goal.history || [];
    defs.push({ id: 'c-goal', title: 'Obiettivo', type: 'line', labels: gh.map(function (g) { return dshort(g.date).slice(4); }), fmt: hm, need: gh.length > 0, sets: [{ label: 'Obiettivo', data: gh.map(function (g) { return g.sec; }), borderColor: C1, stepped: true }] });
  }
  return defs;
}
function drawCharts() {
  var box = document.getElementById('charts'); if (!box) return;
  killCharts();
  var defs = chartDefs(), ok = !!window.Chart;
  box.innerHTML = (ok ? '' : '<div class="banner warn span2">' + ic('alert') + '<span>Grafici non caricati: sotto i dati in tabella.</span></div>') + defs.map(function (d) {
    var empty = d.need === false, tbl = '<div class="tscroll"><table class="data"><thead><tr><th></th>' + d.sets.map(function (s) { return '<th class="r">' + esc(s.label) + '</th>'; }).join('') + '</tr></thead><tbody>' + d.labels.map(function (l, i) { return '<tr><td>' + esc(l) + '</td>' + d.sets.map(function (s) { var v = s.data[i]; return '<td class="r">' + (v == null ? '–' : esc(d.fmt(v))) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    return '<article class="card' + (d.wide ? ' span2' : '') + '"><figure class="chart"><figcaption><h3>' + esc(d.title) + '</h3></figcaption>' + (empty ? '<div class="empty">Nessun dato</div>' : (ok ? '<div class="plot"><canvas id="' + d.id + '" role="img" aria-label="' + esc(d.title) + '"></canvas></div>' : '') + '<details class="tbl"' + (ok ? '' : ' open') + '><summary>Tabella</summary>' + tbl + '</details>') + '</figure></article>';
  }).join('');
  if (!ok) return;
  var ink2 = cv('--ink-2'), ink3 = cv('--ink-3'), grid = cv('--grid'), axis = cv('--axis'), surface = cv('--surface'), ink = cv('--ink'), font = 'Barlow, system-ui, sans-serif';
  defs.forEach(function (d) {
    var el = document.getElementById(d.id); if (!el) return;
    var multi = d.sets.length > 1;
    d.sets.forEach(function (s) {
      if ((s.type || d.type) === 'line') { s.borderWidth = s.borderWidth || 2; s.tension = 0; if (s.pointRadius == null) s.pointRadius = d.labels.length > 30 ? 0 : 4; s.pointHoverRadius = 6; s.backgroundColor = s.borderColor; s.pointBackgroundColor = s.borderColor; s.pointBorderColor = surface; s.pointBorderWidth = 2; s.fill = false; }
      else { s.borderRadius = d.stacked ? 0 : { topLeft: 4, topRight: 4 }; s.borderSkipped = d.stacked ? false : 'bottom'; if (!s.barPercentage) { s.maxBarThickness = 26; } }
    });
    charts.push(new window.Chart(el, {
      type: d.type, data: { labels: d.labels, datasets: d.sets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: multi, position: 'bottom', align: 'start', labels: { color: ink2, font: { family: font, size: 12 }, boxWidth: 10, boxHeight: 10, usePointStyle: false, padding: 12 } },
          tooltip: { backgroundColor: ink, titleColor: surface, bodyColor: surface, titleFont: { family: font, size: 12, weight: '600' }, bodyFont: { family: font, size: 12 }, padding: 9, cornerRadius: 8, boxPadding: 4, callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + (c.parsed.y == null ? '–' : d.fmt(c.parsed.y)); } } }
        },
        scales: {
          x: { stacked: !!d.stacked, grid: { display: false }, border: { color: axis }, ticks: { color: ink3, font: { family: font, size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } },
          y: { stacked: !!d.stacked, reverse: !!d.reverse, beginAtZero: d.type === 'bar', min: d.min, max: d.max, grace: d.type === 'line' && d.min == null ? '8%' : 0, grid: { color: grid }, border: { display: false }, ticks: { color: ink3, font: { family: font, size: 11 }, maxTicksLimit: 6, callback: function (v) { return d.fmt(v).replace(' km', '').replace(' unità', '').replace(' min', '').replace('/km', ''); } } }
        }
      }
    }));
  });
}

// ---------- OBIETTIVI ----------
function checks(list) { return '<ul class="checks">' + list.map(function (c) { return '<li class="' + (c.met === true ? 'yes' : c.met === false ? 'no' : '') + '"><span class="st">' + ic(c.met === true ? 'check' : c.met === false ? 'x' : 'dash') + '</span><span>' + esc(c.label) + '<small>' + esc(c.detail) + '</small></span></li>'; }).join('') + '</ul>'; }
function obiettiviView() {
  var t = today(), state = st(), core = S.core, pr = E.predict(state, t), l35 = E.long35Criteria(state, t), r4 = E.run4Criteria(state, t), G = core.goal.sec;
  var pk = function (x) { return fmtPace(x / 42.195); };
  function lst(title, a, cls) { return a.length ? '<h3>' + title + '</h3><ul class="pts ' + cls + '">' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  var h = head('Obiettivi') + '<div class="grid two">';
  h += '<article class="card"><div class="row between"><h2>Obiettivo</h2><button class="btn sm" data-act="goal-ui">Modifica</button></div><div class="row" style="align-items:baseline"><span class="big" style="font-size:44px">' + hm(G) + '</span><span class="muted num">' + pk(G) + '/km</span></div>' +
    '<div class="tscroll"><table class="data"><thead><tr><th>Oggi <span class="src e">stima</span></th><th class="r">Tempo</th><th class="r">/km</th></tr></thead><tbody><tr><td>Ambizioso</td><td class="r">' + hm(pr.rec.amb) + '</td><td class="r">' + pk(pr.rec.amb) + '</td></tr><tr><td><b>Realistico</b></td><td class="r"><b>' + hm(pr.rec.real) + '</b></td><td class="r"><b>' + pk(pr.rec.real) + '</b></td></tr><tr><td>Prudente</td><td class="r">' + hm(pr.rec.cons) + '</td><td class="r">' + pk(pr.rec.cons) + '</td></tr></tbody></table></div></article>';
  h += '<article class="card"><div class="row between"><h2>Sub-4</h2><span class="src e">stima</span></div><div class="row">' + chip(levelTone(pr), pr.levelLabel) + chip('', 'Confidenza ' + pr.conf) + '</div>' +
    '<dl class="kv">' + kv('Previsione', '<b>' + hm(pr.plan) + '</b> (' + hm(pr.low) + '–' + hm(pr.high) + ')') + kv('Se fosse oggi', hm(pr.now)) + kv('Serve', pr.needPct > 0.002 ? '10 km in ' + fmtTime(pr.need.k10) + ' (−' + nf(pr.needPct * 100, 1) + '%)' : 'Sei già in linea') + '</dl>' +
    (pr.tests.length ? '<div class="tscroll"><table class="data"><thead><tr><th>Test</th><th>Data</th><th class="r">Per il sub-4</th></tr></thead><tbody>' + pr.tests.map(function (x) { return '<tr><td>' + esc(x.title.replace('Test ', '')) + '</td><td>' + esc(dshort(x.d).slice(4)) + '</td><td class="r">' + fmtTime(x.thr) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
    '<details class="grp"><summary>Su cosa si basa</summary><div class="body an">' + lst('Dati', pr.used, '') + lst('A favore', pr.pos, 'plus') + lst('Criticità', pr.neg, 'minus') + '</div></details></article>';
  h += '<article class="card"><div class="row between"><h2>Ritmi</h2><button class="btn sm" data-act="pace-ui">Modifica</button></div><div class="tscroll"><table class="data"><tbody>' + ['easy', 'long', 'mp', 'hm', 'tempo', 'interval'].map(function (z) { return '<tr><td>' + P.ZONE_LABEL[z] + '</td><td class="r"><b>' + fmtPace(core.paces[z][0]) + (core.paces[z][0] !== core.paces[z][1] ? '–' + fmtPace(core.paces[z][1]) : '') + '</b></td></tr>'; }).join('') + '</tbody></table></div></article>';
  h += '<article class="card"><h2>Lungo da 35 km</h2>' + checks(l35.list) + '</article>';
  if (S.plan.sessions.some(function (s) { return s.cond === 'run4' && s.st === 'planned'; })) h += '<article class="card"><h2>Quarta corsa</h2>' + checks(r4.list) + '</article>';
  var tests = S.plan.sessions.filter(function (s) { return s.k === 'run' && P.family(s) === 'race'; });
  h += '<article class="card"><div class="row between"><h2>Gare e test</h2><button class="btn sm" data-act="add-ui" data-d="' + t + '">' + ic('plus') + 'Aggiungi</button></div><div class="list">' + tests.map(function (s) { var w = s.wid ? S.workouts[s.wid] : null; return '<button class="item" data-act="open" data-id="' + s.id + '"><span class="stack grow" style="gap:1px"><span class="ttl">' + esc(P.title(s)) + '</span><span class="meta">' + esc(dshort(s.d)) + (w && w.sec ? ' · <b>' + fmtTime(w.sec) + '</b>' : '') + '</span></span>' + (s.st === 'done' ? chip('ok', 'Fatto', 'check') : s.st === 'skipped' ? chip('', 'Saltato') : '') + '<span class="chev">' + ic('chevR') + '</span></button>'; }).join('') + '</div></article>';
  var gh = (core.goal.history || []).slice().reverse();
  if (gh.length > 1) h += '<article class="card"><h2>Storico obiettivi</h2><ul class="tl">' + gh.map(function (g) { return '<li><div class="row between"><b>' + hm(g.sec) + '</b><span class="tiny">' + esc(dshort(g.date)) + ' · ' + esc(g.by || 'te') + '</span></div></li>'; }).join('') + '</ul></article>';
  return h + '</div>';
}
function goalSheet() {
  var g = S.core.goal.sec;
  openSheet('Obiettivo', '<form data-form="goal" class="stack" style="gap:14px"><div class="field"><span class="lab" id="g-l">Tempo</span><div class="time3" role="group" aria-labelledby="g-l" style="grid-template-columns:repeat(2,minmax(0,1fr))"><span><input id="g-h" inputmode="numeric" value="' + Math.floor(g / 3600) + '" aria-label="Ore"><em>h</em></span><span><input id="g-m" inputmode="numeric" value="' + Math.floor(g % 3600 / 60) + '" aria-label="Minuti"><em>min</em></span></div></div><button class="btn pri" type="submit">Salva</button></form>');
}
function paceSheet() {
  var pc = S.core.paces;
  openSheet('Ritmi', '<form data-form="paces" class="stack" style="gap:12px">' + ['easy', 'long', 'mp', 'hm', 'tempo', 'interval'].map(function (z) { return '<div class="field"><span class="lab" id="pz-' + z + '">' + P.ZONE_LABEL[z] + '</span><div class="fgrid" role="group" aria-labelledby="pz-' + z + '"><input id="p-' + z + '-0" value="' + fmtPace(pc[z][0]) + '" aria-label="Da" inputmode="numeric"><input id="p-' + z + '-1" value="' + fmtPace(pc[z][1]) + '" aria-label="A" inputmode="numeric"></div></div>'; }).join('') + '<div id="p-err" class="errsum" hidden role="alert"></div><button class="btn pri" type="submit">Salva</button></form>');
}

// ---------- COACH E MODIFICHE ----------
function opsHTML(c) {
  return c.ops.map(function (o) {
    if (o.t === 's') return '<div class="op"><span class="tiny">' + esc(cap1(o.label || '')) + '</span><span class="was">' + esc(o.a || '') + '</span><span class="now">' + esc(o.b || '') + '</span></div>';
    if (o.t === 'pace') return '<div class="op"><span class="tiny">' + esc(P.ZONE_LABEL[o.z]) + '</span><span class="was">' + P.range(o.from) + '</span><span class="now">' + P.range(o.to) + '</span></div>';
    if (o.t === 'goal') return '<div class="op"><span class="tiny">Obiettivo</span><span class="was">' + hm(o.from) + '</span><span class="now">' + hm(o.to) + '</span></div>';
    if (o.t === 'ref') return '<div class="op"><span class="tiny">Riferimento</span><span class="was">' + nf(o.from.dist) + ' km in ' + fmtTime(o.from.sec) + '</span><span class="now">' + nf(o.to.dist) + ' km in ' + fmtTime(o.to.sec) + '</span></div>';
    if (o.t === 'add') return '<div class="op"><span class="tiny">' + esc(cap1(dshort(o.s.d))) + '</span><span class="now">+ ' + esc(P.title(o.s)) + (o.s.km ? ' ' + nf(o.s.km) + ' km' : '') + '</span></div>';
    if (o.t === 'del') return '<div class="op"><span class="tiny">' + esc(cap1(dshort(o.s.d))) + '</span><span class="was">' + esc(P.title(o.s)) + (o.s.km ? ' ' + nf(o.s.km) + ' km' : '') + '</span></div>';
    return '';
  }).join('');
}
function changeCard(c, full) {
  var has = (c.why && c.why.length) || c.impact, h = '<div class="row between"><span class="row">' + changeStatus(c) + '</span><span class="tiny">' + esc(dstamp(c.at)) + '</span></div><h3>' + esc(c.title) + '</h3>';
  if (c.ops.length) h += '<div>' + opsHTML(c) + '</div>';
  if (full && has) h += '<div class="why">' + (c.why || []).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + (c.impact ? '<p><b>Effetto.</b> ' + esc(c.impact) + '</p>' : '') + '</div>';
  var b = '';
  if (c.status === 'pending') b += '<button class="btn pri" data-act="ch-accept" data-id="' + c.id + '">Accetta</button><button class="btn" data-act="ch-reject" data-id="' + c.id + '">Rifiuta</button>';
  else if (c.status === 'applied' && c.ops.length && c.kind !== 'event') b += '<button class="btn sm" data-act="ch-undo" data-id="' + c.id + '">Annulla</button>';
  if (has) b += '<button class="btn sm" data-act="ch-more" data-id="' + c.id + '" aria-expanded="' + !!full + '">Perché</button>';
  return h + (b ? '<div class="btns">' + b + '</div>' : '');
}
function storicoView() {
  var pend = pendingChanges(), all = vals(S.changes).filter(function (c) { return c.status !== 'pending'; }), f = ui.histFilter, h = head('Coach');
  if (pend.length) h += '<div class="grid" style="margin-bottom:16px">' + pend.map(function (c) { return '<article class="card">' + changeCard(c, ui.more === c.id) + '</article>'; }).join('') + '</div>';
  var items = all.map(function (c) { return { at: c.at, cat: c.cat === 'pace' ? 'ritmi' : c.cat === 'goal' ? 'obiettivi' : c.cat === 'alert' ? 'avvisi' : c.cat === 'data' ? 'dati' : 'piano', html: changeCard(c, ui.more === c.id) }; });
  vals(S.workouts).forEach(function (w) { items.push({ at: w.at, cat: 'dati', html: '<div class="row between"><span class="row">' + chip('', w.deleted ? 'Eliminato' : 'Risultato') + '</span><span class="tiny">' + esc(dstamp(w.at)) + '</span></div><button class="linkbtn" style="text-align:left" data-act="analysis" data-id="' + w.id + '">' + esc(wTitle(w) + (w.km ? ' ' + nf(w.km) + ' km' : '') + ' · ' + dshort(w.date)) + '</button>' + (w.edits && w.edits.length ? '<span class="tiny">' + w.edits.length + ' correzion' + (w.edits.length === 1 ? 'e' : 'i') + '</span>' : '') }); });
  S.plan.sessions.forEach(function (s) { if (s.st === 'skipped' && s.stAt) items.push({ at: s.stAt, cat: 'piano', html: '<div class="row between"><span class="row">' + chip('', 'Saltata') + '</span><span class="tiny">' + esc(dstamp(s.stAt)) + '</span></div><span class="small">' + esc(P.title(s) + (s.km ? ' ' + nf(s.km) + ' km' : '') + ' · ' + dshort(s.d)) + (s.why && s.why !== 'Non indicato' ? ' · ' + esc(s.why.toLowerCase()) : '') + '</span>' }); });
  vals(S.checkins).forEach(function (c) { items.push({ at: c.at, cat: 'avvisi', html: '<div class="row between"><span class="row">' + chip(c.pain && c.pain.lvl >= 2 || c.ill ? 'crit' : '', 'Come stai') + '</span><span class="tiny">' + esc(dstamp(c.at)) + '</span></div><span class="small">' + [c.fatigue ? 'stanchezza ' + c.fatigue + '/5' : '', c.sleep ? 'sonno ' + c.sleep + '/5' : '', c.stress ? 'stress ' + c.stress + '/5' : '', c.pain ? 'dolore ' + E.PAIN_LBL[c.pain.lvl] + (c.pain.area ? ' (' + esc(c.pain.area) + ')' : '') : '', c.ill ? 'malattia' : ''].filter(Boolean).join(' · ') + (c.note ? '<br>' + esc(c.note) : '') + '</span>' }); });
  items.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  var shown = items.filter(function (i) { return f === 'tutto' || i.cat === f; }), lim = ui.showAll ? shown.length : 30;
  h += '<div class="scrollx"><div class="seg" role="group" aria-label="Filtro">' + ['tutto', 'piano', 'ritmi', 'obiettivi', 'avvisi', 'dati'].map(function (x) { return '<button data-act="hist" data-v="' + x + '" aria-pressed="' + (f === x) + '">' + cap1(x) + '</button>'; }).join('') + '</div></div>';
  h += '<article class="card" style="margin-top:12px">' + (shown.length ? '<ul class="tl">' + shown.slice(0, lim).map(function (i) { return '<li>' + i.html + '</li>'; }).join('') + '</ul>' + (shown.length > lim ? '<button class="btn" data-act="hist-all">Tutte (' + shown.length + ')</button>' : '') : '<p class="muted small">Niente qui</p>') + '</article>';
  var vs = (S.core.versions || []).slice().reverse();
  if (vs.length) h += '<details class="grp" style="margin-top:12px"><summary>Versioni del piano (' + vs.length + ')</summary><div class="body"><ul class="tl">' + vs.map(function (v) { return '<li><div class="row between"><span class="small"><b>v' + v.n + '</b> · ' + esc(dstamp(v.at)) + '</span><button class="btn sm" data-act="v-restore" data-id="' + v.id + '">Ripristina</button></div><span class="tiny">' + esc(v.label || '') + '</span></li>'; }).join('') + '</ul></div></details>';
  return h;
}

// ---------- GUIDA ----------
function guidaView() {
  function g(t, body) { return '<details class="grp"><summary>' + t + '</summary><div class="body prose">' + body + '</div></details>'; }
  var w = S.core.profile.weight, kg = function (a, b) { return w ? ' (' + Math.round(a * w) + (b ? '–' + Math.round(b * w) : '') + ' g)' : ''; };
  return head('Guida') + '<div class="stack" style="gap:10px">' +
    g('Prima di correre', '<ul><li>Sotto 60–75 minuti facili: niente di particolare.</li><li>Qualità e lunghi: carboidrati 2–3 ore prima, 1–3 g per kg' + kg(1, 3) + ', pochi grassi e fibre.</li><li>Di mattina presto: banana o pane e miele 30–45 minuti prima.</li></ul>') +
    g('Gel e carboidrati', '<ul><li>Fino a 75 minuti: solo acqua.</li><li>75–150 minuti: 30–60 g l’ora.</li><li>Oltre 150 minuti e in gara: 60 g l’ora (fino a 90 solo se allenato).</li><li>Un gel vale 22–25 g: uno ogni 25–30 minuti, con acqua.</li><li>Lo stomaco si allena: aumenta poco alla volta, stessi prodotti della gara.</li></ul>') +
    g('Acqua e sali', '<ul><li>400–700 ml l’ora, di più con il caldo.</li><li>Oltre 90 minuti: 300–600 mg di sodio l’ora.</li><li>Pesati prima e dopo un lungo: oltre il 2% in meno hai bevuto poco.</li></ul>') +
    g('Dopo', '<ul><li>Entro 1–2 ore: carboidrati (1 g per kg' + kg(1) + ') e 20–30 g di proteine.</li><li>Nella giornata 1,4–1,8 g di proteine per kg' + kg(1.4, 1.8) + '.</li><li>Dopo i lunghi oltre 26 km: il giorno dopo niente corsa.</li></ul>') +
    g('Sonno', '<ul><li>7–9 ore per notte.</li><li>Tre notti storte di fila: alleggerisci.</li><li>Segnali: battito a riposo alto per giorni, gambe pesanti nelle corse facili, sonno disturbato.</li></ul>') +
    g('Quando fermarsi', '<ul><li>Dolore su un osso o un tendine, che peggiora correndo o cambia l’appoggio.</li><li>Gonfiore, dolore di notte o che dura oltre 48–72 ore.</li><li>Dolore al petto, capogiri, fiato corto anomalo: fermati e chiama un medico.</li><li>Febbre: niente allenamento.</li></ul><p>La app riduce il carico ma non fa diagnosi.</p>') +
    g('Percorso di Madrid', '<ul><li>Circa 400 m di salita. Partenza a 700 m (Castellana), arrivo a 630 m (Recoletos).</li><li>Km 0–3: leggera salita. Poi quasi 4 km di discesa: non strafare.</li><li>Fino a metà: strappi brevi e sottopassi.</li><li>Km 21–37: Calle Princesa in salita, poi Casa de Campo ondulata.</li><li>Dal km 37: salita quasi continua. Conta lo sforzo, non il ritmo.</li><li>Prima onda alle 8:45: orario e data 2027 da riconfermare sul sito ufficiale.</li></ul>') +
    g('Gara', '<ul><li>Ultimi 2–3 giorni: 8–10 g di carboidrati per kg al giorno' + kg(8, 10) + ', poche fibre, niente di nuovo.</li><li>Colazione 3 ore prima, quella provata nei lunghi.</li><li>Un gel ogni 25–30 minuti dal km 5, acqua a ogni ristoro.</li><li>Caffeina solo se già provata.</li><li>Parti 5–10 secondi al km più piano: si decide dopo il km 30.</li></ul>') +
    '<p class="tiny">Indicazioni generali, non mediche.</p></div>';
}

// ---------- PROFILO ----------
function profiloView() {
  var p = S.core.profile, dys = Object.assign({}, P.DEF_DAYS, p.days || {});
  function daySel(id, cur) { return '<select id="' + id + '">' + E.WD.map(function (d, i) { return '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + cap1(d) + '</option>'; }).join('') + '</select>'; }
  function v(x) { return x == null ? '' : esc(String(x).replace('.', ',')); }
  var h = head('Profilo') + '<div class="grid two">';
  h += '<article class="card"><h2>Atleta</h2><form data-form="profile" class="stack" style="gap:12px"><div class="fgrid">' +
    '<div class="field"><label for="pr-name">Nome</label><input id="pr-name" value="' + esc(p.name || '') + '" autocomplete="given-name"></div><div class="field"><label for="pr-age">Età</label><input id="pr-age" inputmode="numeric" value="' + v(p.age) + '"></div>' +
    '<div class="field"><label for="pr-hr">FC max</label><input id="pr-hr" inputmode="numeric" value="' + v(p.hrMax) + '" placeholder="stima ' + E.hrMaxOf(p).v + '"></div>' +
    '<div class="field"><label for="pr-w">Peso (kg)</label><input id="pr-w" inputmode="decimal" value="' + v(p.weight) + '"></div>' +
    '<div class="field full"><label for="pr-notes">Note</label><textarea id="pr-notes">' + esc(p.notes || '') + '</textarea></div></div><button class="btn pri" type="submit">Salva</button></form></article>';
  h += '<article class="card"><h2>Giorni</h2><form data-form="days" class="stack" style="gap:12px"><div class="fgrid">' +
    '<div class="field"><label for="dy-q">Qualità</label>' + daySel('dy-q', dys.q) + '</div><div class="field"><label for="dy-e">Facile</label>' + daySel('dy-e', dys.e) + '</div>' +
    '<div class="field"><label for="dy-long">Lungo</label>' + daySel('dy-long', dys.long) + '</div><div class="field"><label for="dy-x">Quarta corsa</label>' + daySel('dy-x', dys.x) + '</div>' +
    '<div class="field"><label for="dy-str">Forza</label>' + daySel('dy-str', dys.str) + '</div></div><button class="btn pri" type="submit">Aggiorna il calendario</button></form></article>';
  h += '<article class="card"><div class="row between"><h2>Dati</h2>' + (net.mode === 'cloud' ? chip('ok', 'Sincronizzati') : chip('', 'Solo qui')) + '</div>' +
    '<div class="btns"><button class="btn" data-act="export">Backup</button><button class="btn" data-act="export-csv">CSV</button></div>' +
    '<div class="field"><label for="imp-file">Ripristina backup</label><input type="file" id="imp-file" accept="application/json,.json"></div><div id="imp-box"></div><div id="exp-box"></div></article>';
  h += '<details class="grp"><summary>Limiti</summary><div class="body prose"><ul><li>Analisi e proposte seguono regole fisse; il parere AI è generato solo su richiesta.</li><li>Carico, ritmo in piano e previsione sono stime.</li><li>Non è installabile: aggiungila alla schermata Home dal browser.</li><li>Niente import da orologio o Strava, niente notifiche.</li><li>I dati sono privati: chi apre il link vede solo i propri.</li></ul></div></details></div>';
  return h;
}
function menuView() {
  var n = pendingChanges().length;
  return head('Altro') + '<article class="card"><div class="list">' + [['analisi', 'Analisi', 'search'], ['obiettivi', 'Obiettivi', 'target'], ['storico', 'Coach', 'coach'], ['guida', 'Guida', 'book'], ['profilo', 'Profilo', 'user']].map(function (x) { return '<a class="item" href="#' + x[0] + '">' + ic(x[2]) + '<span class="ttl grow">' + x[1] + '</span>' + (x[0] === 'storico' && n ? chip('crit', String(n)) : '') + '<span class="chev">' + ic('chevR') + '</span></a>'; }).join('') + '</div></article><div class="btns" style="margin-top:12px"><button class="btn" data-act="checkin">' + ic('heart') + 'Come stai?</button></div>';
}

// ---------- AVVIO SENZA DATI ----------
function loadingView() { return head('Carico…') + (net.stale ? '<div class="banner warn" style="margin-bottom:12px">' + ic('alert') + '<span>Dati non raggiungibili: riprovo da solo.</span></div>' : '') + '<div class="grid"><div class="skel"></div><div class="skel"></div></div>'; }
function onboardingView() {
  var h = head('Crea il piano') + syncBanner();
  if (net.localCopy && net.localCopy.core) h += '<button class="banner" style="margin:12px 0" data-act="push-local">' + ic('info') + '<span>Usa i dati di questo dispositivo</span>' + ic('chevR') + '</button>';
  h += '<article class="card"><form data-form="onboard" class="stack" style="gap:12px"><div class="fgrid"><div class="field"><label for="ob-name">Nome</label><input id="ob-name" autocomplete="given-name"></div><div class="field"><label for="ob-age">Età</label><input id="ob-age" inputmode="numeric"></div>' +
    '<div class="field"><label for="ob-race">Gara</label><input id="ob-race" value="Maratona"></div><div class="field"><label for="ob-date">Data</label><input type="date" id="ob-date" min="' + addDays(today(), 56) + '" required></div>' +
    '<div class="field"><label for="ob-10k">10 km (minuti)</label><input id="ob-10k" inputmode="decimal" placeholder="50" required></div><div class="field"><label for="ob-goal">Obiettivo</label><input id="ob-goal" placeholder="4:00" required></div>' +
    '<div class="field full"><label for="ob-km">Km a settimana oggi</label><input id="ob-km" inputmode="numeric" placeholder="15"></div></div><div id="ob-err" class="errsum" hidden role="alert"></div><button class="btn pri" type="submit">Genera</button></form></article>' +
    '<div class="field" style="margin-top:14px"><label for="imp-file">Oppure ripristina un backup</label><input type="file" id="imp-file" accept="application/json,.json"></div><div id="imp-box"></div>';
  return h;
}
