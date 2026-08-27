// Lazy per-run graphs for Strava runs: mile splits, heart rate, pace, and cadence.
// Fetches the detailed streams from the broker the first time a run is opened, caches
// them on the run record, and draws them with Chart.js (loaded globally in index.html).
import { stravaFetchDetail } from './strava-client.js';
import { icon } from './icons.js';

const AXIS = '#77797f';
const GRID = 'rgba(255,255,255,0.06)';
const VOLT = '#c6f135';
const HR_RED = '#e05252';
const CAD_GREEN = '#52c785';

// Charts drawn for the current run; destroyed before each re-render to avoid leaks.
let runCharts = [];
function destroyRunCharts() {
  for (const c of runCharts) { try { c.destroy(); } catch (e) {} }
  runCharts = [];
}

const paceLabel = mpm => {
  if (!(mpm > 0)) return '—';
  const m = Math.floor(mpm);
  const s = Math.round((mpm - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
};

function lineChart(canvas, values, { color = VOLT, invert = false, fmt = v => v } = {}) {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: values.map((_, i) => i),
      datasets: [{ data: values, borderColor: color, backgroundColor: 'transparent', borderWidth: 2, tension: 0.3, pointRadius: 0, spanGaps: true }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: () => '', label: ctx => fmt(ctx.parsed.y) } },
      },
      scales: {
        x: { display: false },
        y: { reverse: invert, ticks: { color: AXIS, maxTicksLimit: 5, callback: v => fmt(v) }, grid: { color: GRID } },
      },
    },
  });
}

function splitsChart(canvas, splits) {
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: splits.map((_, i) => i + 1),
      datasets: [{ data: splits.map(s => s.paceMinPerMile), backgroundColor: VOLT, borderRadius: 4 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: items => `Mile ${items[0].label}`,
          label: ctx => { const s = splits[ctx.dataIndex]; return `${paceLabel(s.paceMinPerMile)}/mi${s.avgHr ? ' · ' + s.avgHr + ' bpm' : ''}`; },
        } },
      },
      scales: {
        x: { ticks: { color: AXIS }, grid: { display: false } },
        y: { ticks: { color: AXIS, maxTicksLimit: 5, callback: v => paceLabel(v) }, grid: { color: GRID } },
      },
    },
  });
}

const graphBlock = (title, id) => `
  <div style="margin-top:12px">
    <p class="rg-title">${title}</p>
    <div style="height:150px"><canvas id="${id}"></canvas></div>
  </div>`;

const shell = inner => `<div class="card detail-exercise" style="margin-top:12px"><p class="section-title" style="margin:0 0 2px">Run graphs</p>${inner}</div>`;
const note = msg => shell(`<p style="color:var(--text-3);font-size:14px;margin:8px 0 0">${msg}</p>`);

// Render (and lazily fetch+cache) the graphs for a Strava run into `container`.
// No-op for manual runs, walks, or runs without a Strava id. `persist` saves the
// run record once the detail is cached on it.
export async function renderRunGraphs(container, item, persist) {
  if (!container) return;
  destroyRunCharts();
  if (!(item && item.source === 'strava' && item.stravaId)) { container.innerHTML = ''; return; }

  let detail = item.stravaDetail;
  if (!detail) {
    container.innerHTML = note(`${icon('reset', 14)} Loading graphs from Strava…`);
    try {
      detail = await stravaFetchDetail(item.stravaId);
      item.stravaDetail = detail;
      if (typeof persist === 'function') await persist();
    } catch (e) {
      container.innerHTML = note(e.code === 'reconnect' ? "Couldn't load graphs — reconnect Strava in Settings." : "Couldn't load graphs. Pull to refresh and try again.");
      return;
    }
  }

  const series = detail.series || {};
  const hr = series.hr || [];
  const pace = series.pace || [];
  const cad = series.cadence || [];
  const splits = detail.splits || [];
  if (!(hr.length || pace.length || cad.length || splits.length)) {
    container.innerHTML = note('No graph data for this run (treadmill, or recorded without sensors).');
    return;
  }

  container.innerHTML = shell(`
    ${splits.length ? graphBlock('Splits — pace / mile', 'rg-splits') : ''}
    ${hr.length ? graphBlock('Heart rate — bpm', 'rg-hr') : ''}
    ${pace.length ? graphBlock('Pace — min / mi', 'rg-pace') : ''}
    ${cad.length ? graphBlock('Cadence — spm', 'rg-cad') : ''}`);

  if (splits.length) runCharts.push(splitsChart(container.querySelector('#rg-splits'), splits));
  if (hr.length) runCharts.push(lineChart(container.querySelector('#rg-hr'), hr, { color: HR_RED, fmt: v => Math.round(v) }));
  if (pace.length) runCharts.push(lineChart(container.querySelector('#rg-pace'), pace, { color: VOLT, invert: true, fmt: v => paceLabel(v) }));
  if (cad.length) runCharts.push(lineChart(container.querySelector('#rg-cad'), cad.map(v => (v == null ? null : Math.round(v * 2))), { color: CAD_GREEN, fmt: v => Math.round(v) }));
}
