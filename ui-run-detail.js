// Lazy per-run graphs for Strava runs. Splits render as comparison bars framed to the
// run's own pace range (fastest/slowest/average called out) — no misleading zero
// baseline. Pace/HR/cadence render as line charts against DISTANCE (miles), with a
// non-zero pace scale, an average-pace reference line, and a scrub crosshair.
// Fetched from the broker on first open, cached on the run record. Chart.js is global.
import { stravaFetchDetail } from './strava-client.js';
import { icon } from './icons.js';

const DETAIL_V = 2;              // must match strava.js mapStravaDetail out.v
const AXIS = '#77797f';
const GRID = 'rgba(255,255,255,0.06)';
const VOLT = '#c6f135';
const HR_RED = '#e05252';
const CAD_GREEN = '#52c785';

let runCharts = [];
function destroyRunCharts() {
  for (const c of runCharts) { try { c.destroy(); } catch (e) {} }
  runCharts = [];
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const paceLabel = mpm => {
  if (!(mpm > 0)) return '—';
  const m = Math.floor(mpm);
  const s = Math.round((mpm - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
};

// Vertical scrub line at the hovered/tapped point — makes the curves readable on touch.
const crosshair = {
  id: 'crosshair',
  afterDatasetsDraw(chart) {
    const act = chart.getActiveElements();
    if (!act || !act.length) return;
    const x = act[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(244,245,242,0.35)';
    ctx.stroke();
    ctx.restore();
  },
};

const quantile = (sortedAsc, q) => sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(q * sortedAsc.length)))];

// One metric line chart vs distance (falls back to sample index if no distance stream).
function metricChart(canvas, values, dist, { color, fmt, invert = false, avg = null, yMin = null, yMax = null } = {}) {
  const hasDist = Array.isArray(dist) && dist.length === values.length;
  const xs = hasDist ? dist : values.map((_, i) => i);
  const points = values.map((y, i) => ({ x: xs[i], y }));
  const datasets = [{ data: points, borderColor: color, backgroundColor: 'transparent', borderWidth: 2, tension: 0.3, pointRadius: 0, spanGaps: true }];
  if (avg != null) {
    const x0 = xs[0], x1 = xs[xs.length - 1];
    datasets.push({ data: [{ x: x0, y: avg }, { x: x1, y: avg }], borderColor: 'rgba(198,241,53,0.45)', borderDash: [5, 4], borderWidth: 1, pointRadius: 0, fill: false });
  }
  return new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: item => item.datasetIndex === 0,
          callbacks: {
            title: items => hasDist && items.length ? `Mile ${Number(items[0].parsed.x).toFixed(2)}` : '',
            label: ctx => fmt(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: { type: 'linear', display: hasDist, min: hasDist ? 0 : undefined, ticks: { color: AXIS, maxTicksLimit: 6, callback: v => Number(v).toFixed(v >= 10 ? 0 : 1) }, grid: { color: GRID } },
        y: { reverse: invert, min: yMin, max: yMax, ticks: { color: AXIS, maxTicksLimit: 5, callback: v => fmt(v) }, grid: { color: GRID } },
      },
    },
    plugins: [crosshair],
  });
}

// Splits as comparison bars framed to this run's fastest→slowest range.
function splitsHTML(splits, avgPace) {
  const paces = splits.map(s => s.paceMinPerMile).filter(p => p > 0);
  if (!paces.length) return '';
  const min = Math.min(...paces), max = Math.max(...paces);
  const fastIdx = splits.findIndex(s => s.paceMinPerMile === min);
  const slowIdx = splits.findIndex(s => s.paceMinPerMile === max);
  const rows = splits.map((s, i) => {
    const p = s.paceMinPerMile;
    const f = (max === min || !(p > 0)) ? 1 : (max - p) / (max - min); // 1 = fastest
    const w = Math.round(45 + f * 55);
    const o = (0.5 + 0.5 * f).toFixed(2);
    const cls = i === fastIdx ? ' is-fast' : (i === slowIdx && splits.length > 1 ? ' is-slow' : '');
    return `<div class="rg-split${cls}">
      <span class="rg-split-mi">Mi ${i + 1}</span>
      <span class="rg-split-track"><span class="rg-split-fill" style="width:${w}%;opacity:${o}"></span></span>
      <span class="rg-split-pace">${paceLabel(p)}</span>
      <span class="rg-split-hr">${s.avgHr ? esc(s.avgHr) + ' bpm' : ''}</span>
    </div>`;
  }).join('');
  const hd = `Avg <b>${paceLabel(avgPace || (paces.reduce((a, b) => a + b, 0) / paces.length))}</b>/mi`
    + ` · fastest Mi ${fastIdx + 1} <b style="color:var(--accent)">${paceLabel(min)}</b>`
    + (splits.length > 1 ? ` · slowest Mi ${slowIdx + 1} ${paceLabel(max)}` : '');
  return `<div class="rg-splits-hd">${hd}</div>${rows}`;
}

const graphBlock = (title, id) => `
  <div style="margin-top:14px">
    <p class="rg-title">${title}</p>
    <div style="height:150px"><canvas id="${id}"></canvas></div>
  </div>`;

const shell = inner => `<div class="card detail-exercise" style="margin-top:12px"><p class="section-title" style="margin:0 0 2px">Run graphs</p>${inner}</div>`;
const note = msg => shell(`<p style="color:var(--text-3);font-size:14px;margin:8px 0 0">${msg}</p>`);

// Render (and lazily fetch+cache) the graphs for a Strava run. No-op for manual/walk
// records or runs without a Strava id. `persist` saves the run once detail is cached.
export async function renderRunGraphs(container, item, persist) {
  if (!container) return;
  destroyRunCharts();
  if (!(item && item.source === 'strava' && item.stravaId)) { container.innerHTML = ''; return; }

  let detail = item.stravaDetail;
  if (!detail || detail.v !== DETAIL_V) { // refetch old caches missing the distance series
    container.innerHTML = note(`${icon('reset', 14)} Loading graphs from Strava…`);
    try {
      detail = await stravaFetchDetail(item.stravaId);
      item.stravaDetail = detail;
      if (typeof persist === 'function') await persist();
    } catch (e) {
      container.innerHTML = note(e.code === 'reconnect' ? "Couldn't load graphs — reconnect Strava in Settings." : "Couldn't load graphs. Check your connection and try again.");
      return;
    }
  }

  const series = detail.series || {};
  const dist = series.dist || null;
  const hr = series.hr || [];
  const pace = series.pace || [];
  const cad = series.cadence || [];
  const splits = detail.splits || [];
  if (!(hr.length || pace.length || cad.length || splits.length)) {
    container.innerHTML = note('No graph data for this run (treadmill, or recorded without sensors).');
    return;
  }

  // Frame the pace axis to the run's actual range (2nd–95th pct) so a stop or a spike
  // doesn't flatten everything — and it never starts at zero.
  let paceMin = null, paceMax = null;
  const pv = pace.filter(v => v > 0).sort((a, b) => a - b);
  if (pv.length) { paceMin = Math.max(3, quantile(pv, 0.02) - 0.2); paceMax = quantile(pv, 0.95) + 0.4; }

  container.innerHTML = shell(`
    ${splits.length ? `<div style="margin-top:10px">${splitsHTML(splits, item.paceMinPerMile)}</div>` : ''}
    ${pace.length ? graphBlock('Pace — min / mi (dashed = average · tap to read)', 'rg-pace') : ''}
    ${hr.length ? graphBlock('Heart rate — bpm', 'rg-hr') : ''}
    ${cad.length ? graphBlock('Cadence — spm', 'rg-cad') : ''}`);

  if (pace.length) runCharts.push(metricChart(container.querySelector('#rg-pace'), pace, dist, {
    color: VOLT, invert: true, fmt: v => paceLabel(v), avg: item.paceMinPerMile || null, yMin: paceMin, yMax: paceMax,
  }));
  if (hr.length) runCharts.push(metricChart(container.querySelector('#rg-hr'), hr, dist, {
    color: HR_RED, fmt: v => `${Math.round(v)} bpm`, avg: item.avgHr || null,
  }));
  if (cad.length) runCharts.push(metricChart(container.querySelector('#rg-cad'), cad.map(v => (v == null ? null : Math.round(v * 2))), dist, {
    color: CAD_GREEN, fmt: v => `${Math.round(v)} spm`,
  }));
}
