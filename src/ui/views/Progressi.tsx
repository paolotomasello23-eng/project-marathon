import { BarController, BarElement, CategoryScale, Chart, type ChartConfiguration, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as P from '../../domain/plan';
import * as E from '../../domain/engine';
import type { Actions } from '../../data/actions';
import { hm } from '../../lib/format';
import { Head } from '../bits';
import { useApp } from '../ctx';

Chart.register(BarController, LineController, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataSet = Record<string, any> & { label: string; data: (number | null)[] };
interface Def { id: string; title: string; type: 'bar' | 'line'; labels: string[]; fmt: (v: number) => string; sets: DataSet[]; need?: boolean; wide?: boolean; min?: number; max?: number; reverse?: boolean; stacked?: boolean }

const CHART_TABS: [string, string][] = [['volume', 'Volume'], ['lunghi', 'Lunghi'], ['ritmo', 'Ritmo e FC'], ['carico', 'Carico'], ['costanza', 'Costanza'], ['previsione', 'Previsione']];
function cv(n: string): string { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

function chartDefs(app: Actions, t: string, tab: string): Def[] {
  const state = app.st(), weeks = E.allWeeks(state, t), wl = weeks.map(w => 'S' + w.wk), past = (w: { mon: string }) => w.mon <= t;
  const runs = app.liveWorkouts().filter(w => w.k === 'run').reverse(), all = app.liveWorkouts().slice().reverse(), defs: Def[] = [], km = (v: number) => P.nf(v) + ' km';
  const C1 = cv('--c1'), C2 = cv('--c2'), C3 = cv('--c3'), GH = cv('--ghost'), INK = cv('--ink');
  const short = (d: string) => E.dshort(d).slice(4);
  function bullet(labels: string[], plan: (number | null)[], done: (number | null)[], fmt: (v: number) => string, extra?: DataSet[]): Pick<Def, 'type' | 'labels' | 'fmt' | 'sets'> {
    return { type: 'bar', labels, fmt, sets: ([{ label: 'Previsto', data: plan, backgroundColor: GH, grouped: false, barPercentage: 0.92, categoryPercentage: 0.9, order: 2 }, { label: 'Fatto', data: done, backgroundColor: C1, grouped: false, barPercentage: 0.5, categoryPercentage: 0.9, order: 1 }] as DataSet[]).concat(extra || []) };
  }
  if (tab === 'volume') {
    defs.push(Object.assign({ id: 'c-kmw', title: 'Km a settimana' }, bullet(wl, weeks.map(w => w.ph === 'race' ? w.planKm - 42.195 : w.planKm), weeks.map(w => past(w) ? +w.doneKm.toFixed(1) : null), km)));
    const mo: Record<string, { p: number; d: number }> = {}, order: string[] = [];
    weeks.forEach(w => { const d = P.parse(P.addDays(w.mon, 3)), k = E.MO[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2); if (!mo[k]) { mo[k] = { p: 0, d: 0 }; order.push(k); } mo[k].p += w.planKm; mo[k].d += w.doneKm; });
    defs.push(Object.assign({ id: 'c-kmm', title: 'Km al mese' }, bullet(order, order.map(k => Math.round(mo[k].p)), order.map(k => +mo[k].d.toFixed(1)), km)));
    let cp = 0, cd = 0;
    defs.push({ id: 'c-cum', title: 'Km totali', type: 'line', min: 0, labels: wl, fmt: v => P.nf(v, 0) + ' km', sets: [{ label: 'Previsto', data: weeks.map(w => { cp += w.planKm; return Math.round(cp); }), borderColor: GH, borderDash: [5, 4], pointRadius: 0 }, { label: 'Fatto', data: weeks.map(w => { cd += w.doneKm; return past(w) ? +cd.toFixed(1) : null; }), borderColor: C1 }] });
    defs.push({ id: 'c-up', title: 'Dislivello', type: 'bar', labels: wl, fmt: v => Math.round(v) + ' m', need: runs.some(w => !!w.up), sets: [{ label: 'Salita', data: weeks.map(w => past(w) ? w.up : null), backgroundColor: C1 }] });
    const lastN = all.slice(-24);
    defs.push({ id: 'c-dur', title: 'Durata', type: 'bar', labels: lastN.map(w => short(w.date)), fmt: v => P.fmtDur(v), need: lastN.length > 0, sets: [{ label: 'Durata', data: lastN.map(w => Math.round(E.minutesOf(w)) || null), backgroundColor: C1 }] });
  } else if (tab === 'lunghi') {
    defs.push(Object.assign({ id: 'c-long', title: 'Lunghi', wide: true }, bullet(wl, weeks.map(w => w.ph === 'race' ? null : w.longPlan), weeks.map(w => past(w) && w.longDone ? w.longDone : null), km, [{ type: 'line', label: '35 km', data: weeks.map(() => 35), borderColor: INK, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, order: 0 }])));
    const longs = runs.filter(w => w.sub === 'long' && w.sec);
    defs.push({ id: 'c-longdur', title: 'Durata dei lunghi', type: 'bar', labels: longs.map(w => short(w.date)), fmt: v => P.fmtDur(v), need: longs.length > 0, sets: [{ label: 'Durata', data: longs.map(w => Math.round((w.sec as number) / 60)), backgroundColor: C1 }] });
  } else if (tab === 'ritmo') {
    const er = runs.filter(w => (w.sub === 'easy' || w.sub === 'long') && w.sec && w.km), lb = er.map(w => short(w.date));
    defs.push({ id: 'c-pace', title: 'Ritmo', type: 'line', labels: lb, reverse: true, fmt: v => P.fmtPace(v) + '/km', need: er.length > 0, sets: [{ label: 'Facile', data: er.map(w => w.sub === 'easy' ? Math.round((w.sec as number) / (w.km as number)) : null), borderColor: C1, spanGaps: true }, { label: 'Lungo', data: er.map(w => w.sub === 'long' ? Math.round((w.sec as number) / (w.km as number)) : null), borderColor: C2, spanGaps: true }] });
    const hr = runs.filter(w => w.hrAvg);
    defs.push({ id: 'c-hr', title: 'FC media', type: 'line', labels: hr.map(w => short(w.date)), fmt: v => Math.round(v) + ' bpm', need: hr.length > 0, sets: [{ label: 'FC media', data: hr.map(w => w.hrAvg as number), borderColor: C1 }] });
    const rp = all.filter(w => w.rpe).slice(-24);
    defs.push({ id: 'c-rpe', title: 'RPE', type: 'bar', labels: rp.map(w => short(w.date)), fmt: v => 'RPE ' + v, need: rp.length > 0, max: 10, sets: [{ label: 'RPE', data: rp.map(w => w.rpe as number), backgroundColor: C1 }] });
  } else if (tab === 'carico') {
    defs.push({ id: 'c-load', title: 'Carico', type: 'bar', labels: wl, fmt: v => Math.round(v) + ' unità', need: all.length > 0, sets: [{ label: 'Carico', data: weeks.map(w => past(w) ? w.load : null), backgroundColor: C1 }] });
    const ac = weeks.map(w => { if (!past(w)) return null; const d = P.addDays(w.mon, 6) > t ? t : P.addDays(w.mon, 6), a = E.acwrAt(state, d); return a && a.r ? +a.r.toFixed(2) : null; });
    defs.push({ id: 'c-acwr', title: 'Carico recente / abituale (stima)', type: 'line', labels: wl, fmt: v => P.nf(v, 2), need: ac.some(x => x != null), sets: [{ label: 'Rapporto', data: ac, borderColor: C1, spanGaps: true }, { label: '1,3', data: wl.map(() => 1.3), borderColor: GH, borderDash: [5, 4], pointRadius: 0 }, { label: '0,8', data: wl.map(() => 0.8), borderColor: GH, borderDash: [5, 4], pointRadius: 0 }] });
    const sf = cv('--surface');
    defs.push({ id: 'c-int', title: 'Intensità', type: 'bar', stacked: true, labels: wl, fmt: v => Math.round(v) + ' min', need: runs.length > 0, sets: [{ label: 'Facile', data: weeks.map(w => past(w) ? Math.round(w.easyMin) : null), backgroundColor: cv('--seq1'), borderColor: sf, borderWidth: 1 }, { label: 'Moderata', data: weeks.map(w => past(w) ? Math.round(w.modMin) : null), backgroundColor: cv('--seq2'), borderColor: sf, borderWidth: 1 }, { label: 'Intensa', data: weeks.map(w => past(w) ? Math.round(w.hardMin) : null), backgroundColor: cv('--seq3'), borderColor: sf, borderWidth: 1 }] });
  } else if (tab === 'costanza') {
    const pw = weeks.filter(past);
    defs.push({ id: 'c-comp', title: 'Sessioni completate', wide: true, type: 'bar', labels: pw.map(w => 'S' + w.wk), fmt: v => Math.round(v) + '%', max: 100, need: pw.some(w => !!w.keyDue), sets: [{ label: 'Completate', data: pw.map(w => w.keyDue ? Math.round(w.keyDone / w.keyDue * 100) : null), backgroundColor: C1 }] });
    defs.push({ id: 'c-kmpct', title: 'Km fatti / previsti', type: 'bar', labels: pw.filter(w => w.complete).map(w => 'S' + w.wk), fmt: v => Math.round(v) + '%', need: pw.some(w => w.complete), sets: [{ label: 'Km fatti', data: pw.filter(w => w.complete).map(w => w.planKm ? Math.round(w.doneKm / w.planKm * 100) : null), backgroundColor: C1 }] });
  } else {
    const ph = state.core.predHistory || [], pl = ph.map(p => short(p.d));
    defs.push({ id: 'c-pred', title: 'Tempo previsto (stima)', wide: true, type: 'line', labels: pl, fmt: hm, need: ph.length > 0, sets: [{ label: 'Centrale', data: ph.map(p => p.plan), borderColor: C1 }, { label: 'Prudente', data: ph.map(p => p.high), borderColor: C2, borderWidth: 1.5 }, { label: 'Favorevole', data: ph.map(p => p.low), borderColor: C3, borderWidth: 1.5 }, { label: 'Obiettivo', data: ph.map(p => p.goal), borderColor: INK, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, stepped: true }] });
    const gh = state.core.goal.history || [];
    defs.push({ id: 'c-goal', title: 'Obiettivo', type: 'line', labels: gh.map(g => short(g.date)), fmt: hm, need: gh.length > 0, sets: [{ label: 'Obiettivo', data: gh.map(g => g.sec), borderColor: C1, stepped: true }] });
  }
  return defs;
}

function config(d: Def): ChartConfiguration {
  const ink2 = cv('--ink-2'), ink3 = cv('--ink-3'), grid = cv('--grid'), axis = cv('--axis'), surface = cv('--surface'), ink = cv('--ink'), font = 'Barlow, system-ui, sans-serif';
  const multi = d.sets.length > 1;
  const sets = d.sets.map(s0 => {
    const s = Object.assign({}, s0);
    if ((s.type || d.type) === 'line') { s.borderWidth = s.borderWidth || 2; s.tension = 0; if (s.pointRadius == null) s.pointRadius = d.labels.length > 30 ? 0 : 4; s.pointHoverRadius = 6; s.backgroundColor = s.borderColor; s.pointBackgroundColor = s.borderColor; s.pointBorderColor = surface; s.pointBorderWidth = 2; s.fill = false; }
    else { s.borderRadius = d.stacked ? 0 : { topLeft: 4, topRight: 4 }; s.borderSkipped = d.stacked ? false : 'bottom'; if (!s.barPercentage) { s.maxBarThickness = 26; } }
    return s;
  });
  return {
    type: d.type, data: { labels: d.labels, datasets: sets as never },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: multi, position: 'bottom', align: 'start', labels: { color: ink2, font: { family: font, size: 12 }, boxWidth: 10, boxHeight: 10, usePointStyle: false, padding: 12 } },
        tooltip: { backgroundColor: ink, titleColor: surface, bodyColor: surface, titleFont: { family: font, size: 12, weight: 600 }, bodyFont: { family: font, size: 12 }, padding: 9, cornerRadius: 8, boxPadding: 4, callbacks: { label: c => ' ' + c.dataset.label + ': ' + (c.parsed.y == null ? '–' : d.fmt(c.parsed.y)) } }
      },
      scales: {
        x: { stacked: !!d.stacked, grid: { display: false }, border: { color: axis }, ticks: { color: ink3, font: { family: font, size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } },
        y: { stacked: !!d.stacked, reverse: !!d.reverse, beginAtZero: d.type === 'bar', min: d.min, max: d.max, grace: d.type === 'line' && d.min == null ? '8%' : 0, grid: { color: grid }, border: { display: false }, ticks: { color: ink3, font: { family: font, size: 11 }, maxTicksLimit: 6, callback: v => d.fmt(Number(v)).replace(' km', '').replace(' unità', '').replace(' min', '').replace('/km', '') } }
      }
    }
  };
}

function ChartCard({ d }: { d: Def }) {
  const ref = useRef<HTMLCanvasElement>(null), empty = d.need === false;
  useEffect(() => {
    if (!ref.current || empty) return;
    const ch = new Chart(ref.current, config(d));
    return () => { ch.destroy(); };
  }, [d, empty]);
  return <article className={'card' + (d.wide ? ' span2' : '')}><figure className="chart">
    <figcaption><h3>{d.title}</h3></figcaption>
    {empty ? <div className="empty">Nessun dato</div> : <>
      <div className="plot"><canvas id={d.id} ref={ref} role="img" aria-label={d.title}></canvas></div>
      <details className="tbl"><summary>Tabella</summary><div className="tscroll"><table className="data">
        <thead><tr><th></th>{d.sets.map(s => <th key={s.label} className="r">{s.label}</th>)}</tr></thead>
        <tbody>{d.labels.map((l, i) => <tr key={i}><td>{l}</td>{d.sets.map(s => <td key={s.label} className="r">{s.data[i] == null ? '–' : d.fmt(s.data[i] as number)}</td>)}</tr>)}</tbody>
      </table></div></details>
    </>}
  </figure></article>;
}

export default function Progressi() {
  const { app, store, t } = useApp(), [q, setQ] = useSearchParams(), [theme, setTheme] = useState(0);
  const tab = CHART_TABS.some(x => x[0] === q.get('g')) ? q.get('g') as string : 'volume', rev = store.getRev();
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)'), f = () => setTheme(n => n + 1);
    mq.addEventListener('change', f); return () => mq.removeEventListener('change', f);
  }, []);
  // i grafici si ricostruiscono solo quando cambiano i dati, la scheda, il giorno o il tema
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defs = useMemo(() => chartDefs(app, t, tab), [rev, tab, t, theme]);
  return <>
    <Head title="Progressi" />
    <div className="scrollx"><div className="seg" role="group" aria-label="Grafici">{CHART_TABS.map(x => <button key={x[0]} aria-pressed={tab === x[0]} onClick={() => setQ({ g: x[0] }, { replace: true })}>{x[1]}</button>)}</div></div>
    <div id="charts" className="grid two" style={{ marginTop: 12 }}>{defs.map(d => <ChartCard key={d.id} d={d} />)}</div>
  </>;
}
