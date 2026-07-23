import { getRunLogs, getWalkLogs, getAllSessions, getExercises, dataVersion } from './db.js';
import { getBestE1RM, findPRIndices, percentChange, buildConsistencyMap, computeACWR, computeWeeklyVolume, detectStall, computeWeeklyCardio, weeklyCardioSeries } from './metrics.js';
import { infoBtnHTML, termSpan, wireInfo } from './help.js';
import { switchTab } from './app.js';

// The built Progress DOM is cached and reused across tab switches. Building it is
// expensive (200-session read + ACWR/volume/stall compute + several Chart.js
// canvases), and it doesn't change unless training data does — so we key the
// cache on db.dataVersion() and just re-attach the same subtree when it matches.
// This makes returning to Progress instant. Test-only reset: _resetProgressCache.
let _cacheRoot = null;
let _cacheVer = -1;
export function _resetProgressCache() { _cacheRoot = null; _cacheVer = -1; }

const CHART_COLORS = { line: '#c6f135', vol: 'rgba(198,241,53,0.28)', run: '#4CAF7D', walk: '#5BA4E0', grid: 'rgba(255,255,255,0.06)', text: '#77797f' };
// Arms=purple, Legs=blue, Core=green, PT=orange, Run=coral, Walk=teal
const LAYER_A_COLORS = { arms: '#B09FE0', legs: '#5BA4E0', core: '#4CAF7D', pt: '#F5923E', run: '#E87444', walk: '#6ECFB0' };
const LAYER_B_COLORS = { arms: '#B09FE0', legs: '#5BA4E0', core: '#4CAF7D', pt: '#F5923E' };

const activeCharts = [];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function renderProgressTab(el) {
  // Cache hit: nothing changed since we last built — re-attach the same subtree
  // (charts keep their rendered canvases; seg-control listeners persist).
  if (_cacheRoot && _cacheVer === dataVersion()) { el.appendChild(_cacheRoot); return; }

  activeCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
  activeCharts.length = 0;

  const [allSessions, runs, walks, exercises] = await Promise.all([getAllSessions(200), getRunLogs(50), getWalkLogs(50), getExercises()]);

  if (allSessions.length === 0 && runs.length === 0 && walks.length === 0) {
    _resetProgressCache();
    el.innerHTML = `
      <div class="screen">
        <h1 class="tab-title">Progress</h1>
        <div class="empty-state">
          <div class="empty-icon">📈</div>
          <h2 class="empty-title">Your trends will build here</h2>
          <p class="empty-text">Log a few workouts and this tab starts showing your training load, weekly volume, and estimated 1-rep maxes. Most charts fill in after about 3–4 sessions.</p>
          <button class="btn btn-primary" id="empty-log-cta">Log a workout</button>
        </div>
      </div>`;
    el.querySelector('#empty-log-cta').addEventListener('click', () => switchTab('log'));
    return;
  }

  const root = document.createElement('div');
  root.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">Progress</h1>
      <div class="progress-jump" id="progress-jump">
        <button class="pj-chip" data-target="layer-a-heatmap">Activity</button>
        <button class="pj-chip" data-target="progress-summary">Load</button>
        <button class="pj-chip" data-target="body-part-seg">Charts</button>
      </div>
      <div id="layer-a-heatmap"></div>
      <div id="progress-summary"></div>
      <div class="seg-control" id="body-part-seg">
        <button class="seg-btn active" data-part="arms">Arms</button>
        <button class="seg-btn" data-part="legs">Legs</button>
        <button class="seg-btn" data-part="core">Core</button>
        <button class="seg-btn" data-part="pt">PT</button>
        <button class="seg-btn" data-part="walk">Walk</button>
        <button class="seg-btn" data-part="run">Run</button>
      </div>
      <div id="charts-container"></div>
    </div>
  `;
  el.appendChild(root);

  const exGroupById = {};
  const exNameById = {};
  for (const ex of exercises) { exGroupById[ex.id] = ex.bodyPartGroup; exNameById[ex.id] = ex.name; }
  renderProgressSummary(
    root.querySelector('#progress-summary'),
    computeACWR(allSessions, runs, walks),
    computeWeeklyVolume(allSessions, exGroupById),
    computeStalls(allSessions, exNameById),
    computeWeeklyCardio(runs, walks)
  );

  const activityByDate = buildActivityByDate(allSessions, runs, walks);
  const multiByDate = buildMultiActivityByDate(allSessions, runs, walks);
  const multiCells = buildMultiCells(multiByDate, 12);
  renderMultiHeatmap(
    root.querySelector('#layer-a-heatmap'),
    multiCells,
    LAYER_A_COLORS,
    `12-week activity · <span class="heatmap-streak">${streakCaption(activityByDate)}</span>`
  );

  root.querySelector('#progress-jump').addEventListener('click', e => {
    const btn = e.target.closest('.pj-chip');
    if (btn) root.querySelector('#' + btn.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  let currentPart = 'arms';
  const container = root.querySelector('#charts-container');
  await renderBodyPart(container, currentPart, allSessions, runs, walks);

  root.querySelector('#body-part-seg').addEventListener('click', async e => {
    if (!e.target.classList.contains('seg-btn')) return;
    root.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentPart = e.target.dataset.part;
    activeCharts.forEach(c => c.destroy());
    activeCharts.length = 0;
    container.innerHTML = '';
    await renderBodyPart(container, currentPart, allSessions, runs, walks);
  });

  _cacheRoot = root;
  _cacheVer = dataVersion();
}

const prettyName = id => (id || '').replace(/^ex-/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const shortDate = dateStr => new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 91, g: 164, b: 224 };
}

// Weekly cardio bars: each week's bar is stacked into per-session segments, shaded
// by distance (further = more saturated). Tapping a bar lists that week's sessions.
function renderCardioBars(container, series, baseHex, unitLabel, title) {
  const maxSessions = Math.max(1, ...series.map(w => w.sessions.length));
  const maxMi = Math.max(0.1, ...series.flatMap(w => w.sessions.map(s => s.miles)));
  const { r, g, b } = hexToRgb(baseHex);
  const shade = mi => `rgba(${r},${g},${b},${(0.4 + 0.6 * Math.min(1, mi / maxMi)).toFixed(2)})`;
  const datasets = [];
  for (let i = 0; i < maxSessions; i++) {
    datasets.push({
      label: `#${i + 1}`, stack: 'mi', borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)',
      data: series.map(w => (w.sessions[i] ? w.sessions[i].miles : 0)),
      backgroundColor: series.map(w => (w.sessions[i] ? shade(w.sessions[i].miles) : 'rgba(0,0,0,0)')),
    });
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = `<p class="section-title">${esc(title)}</p><div class="chart-wrap"><canvas></canvas></div><div class="cardio-detail"></div>`;
  container.appendChild(wrap);
  const detailEl = wrap.querySelector('.cardio-detail');
  const renderDetail = wi => {
    const wk = series[wi];
    if (!wk) return;
    detailEl.innerHTML = `<div class="cardio-detail-hd">Week of ${esc(wk.label)} — <b>${wk.total} ${esc(unitLabel)}</b></div>` +
      (wk.sessions.length
        ? wk.sessions.map(s => `<div class="cardio-detail-row"><span>${esc(shortDate(s.date))}</span><span>${s.miles} ${esc(unitLabel)}${s.durationMinutes ? ` · ${Math.round(s.durationMinutes)} min` : ''}</span></div>`).join('')
        : '<div class="cardio-detail-row" style="color:var(--text-3)">No sessions this week</div>');
  };
  activeCharts.push(new Chart(wrap.querySelector('canvas'), {
    type: 'bar',
    data: { labels: series.map(w => w.label), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: items => `Week of ${items[0].label}`, label: ctx => (ctx.parsed.y ? `${ctx.parsed.y} ${unitLabel}` : null) } },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: CHART_COLORS.text } },
        y: { stacked: true, beginAtZero: true, grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text } },
      },
      onClick: (e, els) => { if (els.length) renderDetail(els[0].index); },
    },
  }));
  renderDetail(series.length - 1); // default to the current week
}

// Scan every weighted exercise's e1RM history for stalls (no recent PR).
function computeStalls(sessions, exNameById) {
  const byEx = {};
  const nameById = {};
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const s of sorted) {
    for (const ex of (s.exercises || [])) {
      const e = getBestE1RM(ex.sets || []);
      if (e == null) continue;
      (byEx[ex.exerciseId] || (byEx[ex.exerciseId] = [])).push(e);
      // Prefer the exercise-library name, then the session's stored name, then a
      // prettified id — so CSV-imported ids don't show as "single-arm-lateral-raise".
      if (!nameById[ex.exerciseId]) nameById[ex.exerciseId] = exNameById[ex.exerciseId] || ex.exerciseName || prettyName(ex.exerciseId);
    }
  }
  const stalls = [];
  for (const [exId, series] of Object.entries(byEx)) {
    const st = detectStall(series);
    if (st.stalled) stalls.push({ name: (nameById[exId] || '').replace(/_/g, ' '), sinceBest: st.sinceBest });
  }
  return stalls.sort((a, b) => b.sinceBest - a.sinceBest).slice(0, 5);
}

// ACWR training-load gauge + weekly sets-per-group volume board + stall watch.
function renderProgressSummary(container, acwr, volume, stalls = [], cardio = null) {
  if (!container) return;
  let acwrBody;
  if (!acwr.hasBaseline) {
    acwrBody = `<div class="acwr-top">
        <div class="acwr-num muted">—</div>
        <div class="acwr-readout"><b>Building baseline</b><span>Keep logging — this needs ~4 weeks of history to gauge load safely.</span></div>
      </div>`;
  } else {
    const meta = {
      low:     { word: 'Detraining risk',   cls: 'z-low',     msg: 'Load has dropped off — a little more volume is fine.' },
      optimal: { word: 'Optimal',           cls: 'z-optimal', msg: 'Acute load sits in the safe range vs your recent norm.' },
      caution: { word: 'Ramping fast',      cls: 'z-caution', msg: 'Load is climbing quickly — hold steady rather than adding.' },
      high:    { word: 'Spike — high risk', cls: 'z-high',    msg: 'Sharp jump vs baseline. Back off to protect against injury.' },
    }[acwr.zone];
    const pos = Math.min(acwr.ratio, 2) / 2 * 100;
    const tip = `ACWR ${acwr.ratio.toFixed(2)} — acute ${acwr.acute} min / chronic ${acwr.chronicWeekly} min per week`;
    acwrBody = `
      <div class="acwr-top">
        <div class="acwr-num ${meta.cls}">${acwr.ratio.toFixed(2)}</div>
        <div class="acwr-readout"><b class="${meta.cls}">${meta.word}</b><span>${meta.msg}</span></div>
      </div>
      <div class="acwr-track" title="${esc(tip)}">
        <span class="acwr-zone z-low" style="flex:0.8"></span>
        <span class="acwr-zone z-optimal" style="flex:0.5"></span>
        <span class="acwr-zone z-caution" style="flex:0.2"></span>
        <span class="acwr-zone z-high" style="flex:0.5"></span>
        <span class="acwr-marker" style="left:${pos}%"></span>
      </div>
      <div class="acwr-legend">Sweet spot 0.8–1.3 · you're at ${acwr.ratio.toFixed(2)}</div>`;
  }

  const LOW = 10, HIGH = 20;
  const groups = [['arms', 'Arms'], ['legs', 'Legs'], ['core', 'Core']];
  const scaleMax = Math.max(HIGH + 4, ...groups.map(([g]) => volume[g]));
  const statusOf = c => c < LOW ? { cls: 'v-under', word: 'below target' } : c <= HIGH ? { cls: 'v-in', word: 'in range' } : { cls: 'v-over', word: 'high' };
  const volRows = groups.map(([g, label]) => {
    const c = volume[g];
    const st = statusOf(c);
    const tip = `${label}: ${c} hard sets this week — ${st.word} (target ${LOW}–${HIGH})`;
    return `<div class="vol-row" title="${esc(tip)}">
      <span class="vol-label">${label}</span>
      <div class="vol-track">
        <span class="vol-band" style="left:${LOW / scaleMax * 100}%;right:${(1 - HIGH / scaleMax) * 100}%"></span>
        <span class="vol-fill ${st.cls}" style="width:${c > 0 ? Math.max(c / scaleMax * 100, 4) : 0}%"></span>
      </div>
      <span class="vol-count">${c}</span>
    </div>`;
  }).join('');

  // Cardio is invisible in the hard-set volume board (strength only) — surface it
  // as its own line so running/walking counts toward the week's picture.
  let cardioLine = '';
  if (cardio) {
    const parts = [];
    if (cardio.runCount) parts.push(`🏃 ${cardio.runMin} min${cardio.runMiles ? ` · ${cardio.runMiles} mi` : ''}`);
    if (cardio.walkCount) parts.push(`🚶 ${cardio.walkMin} min${cardio.walkMiles ? ` · ${cardio.walkMiles} mi` : ''}`);
    cardioLine = `<div class="vol-cardio">${parts.length ? parts.join(' &nbsp;·&nbsp; ') : 'No running or walking logged this week'}</div>`;
  }

  container.innerHTML = `
    <div class="card summary-card">
      <div class="sum-head"><b>Training Load</b><div class="sum-right"><span>7-day vs 28-day</span>${infoBtnHTML('acwr')}</div></div>
      ${acwrBody}
    </div>
    <div class="card summary-card">
      <div class="sum-head"><b>This Week's Volume</b><div class="sum-right"><span>${termSpan('hard sets', 'volume')} · target ${LOW}–${HIGH}</span></div></div>
      ${volRows}
      ${cardioLine ? `<div class="vol-cardio-label">Cardio</div>${cardioLine}` : ''}
    </div>
    ${stalls.length ? `
    <div class="card summary-card">
      <div class="sum-head"><b>Lifts to Watch</b><div class="sum-right"><span>no recent PR</span>${infoBtnHTML('stall')}</div></div>
      ${stalls.map(s => `<div class="stall-row"><span class="stall-name">${esc(s.name)}</span><span class="stall-meta">${s.sinceBest} sessions since PR</span></div>`).join('')}
      <p class="stall-tip">Plateaued lifts often respond to a lighter ${termSpan('deload', 'deload')} week or swapping in a variation.</p>
    </div>` : ''}`;

  wireInfo(container);
}

function buildActivityByDate(sessions, runs, walks) {
  const map = {};
  walks.forEach(w => { if (!map[w.date]) map[w.date] = 'walk'; });
  runs.forEach(r => { if (!map[r.date] || map[r.date] === 'walk') map[r.date] = 'run'; });
  sessions.forEach(s => { map[s.date] = s.bodyPartGroup || 'arms'; });
  return map;
}

function buildMultiActivityByDate(sessions, runs, walks) {
  const map = {};
  const add = (date, type) => {
    if (!map[date]) map[date] = [];
    if (!map[date].includes(type)) map[date].push(type);
  };
  walks.forEach(w => add(w.date, 'walk'));
  runs.forEach(r => add(r.date, 'run'));
  sessions.forEach(s => {
    const type = s.templateId && s.templateId.startsWith('tpl-pt') ? 'pt' : (s.bodyPartGroup || 'arms');
    add(s.date, type);
  });
  return map;
}

function buildMultiCells(multiByDate, weeks = 12) {
  const today = new Date();
  const dow = today.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMon);
  monday.setHours(0, 0, 0, 0);
  const cells = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() - (weeks - 1 - w) * 7 + d);
      if (date > today) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      cells.push({ date: key, activities: multiByDate[key] || [] });
    }
  }
  return cells;
}

let _activeDayPopover = null;
function showDayPopover(cellEl, date, activities, colorMap) {
  if (_activeDayPopover) { _activeDayPopover.remove(); _activeDayPopover = null; }
  const popover = document.createElement('div');
  popover.className = 'day-popover';
  const d = new Date(date + 'T12:00:00');
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const dots = activities.map(t => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colorMap[t] || '#fff'};margin-right:3px"></span>${t}`).join(' · ');
  popover.innerHTML = `<strong style="display:block;margin-bottom:4px">${dateStr}</strong><span>${dots}</span>`;
  document.body.appendChild(popover);
  const rect = cellEl.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 180);
  popover.style.cssText = `position:fixed;left:${left}px;top:${rect.bottom + 6}px;background:var(--surface-hi,#152540);border:1px solid var(--border,#1C3050);border-radius:8px;padding:8px 12px;font-size:13px;color:var(--text,#EEF2F8);z-index:150;white-space:nowrap;max-width:220px`;
  _activeDayPopover = popover;
  const dismiss = () => { popover.remove(); if (_activeDayPopover === popover) _activeDayPopover = null; document.removeEventListener('click', dismiss); };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function streakCaption(activityByDate) {
  const today = new Date();
  let streak = 0;
  const d = new Date(today);
  while (activityByDate[localDateKey(d)]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  if (streak >= 1) return `🔥 ${streak}-day streak`;
  const sorted = Object.keys(activityByDate).sort().reverse();
  if (!sorted.length) return 'No activity logged yet';
  const todayKey = localDateKey(today);
  const diff = Math.round((new Date(todayKey) - new Date(sorted[0])) / 86400000);
  if (diff <= 0) return 'Last workout: today';
  if (diff === 1) return 'Last workout: yesterday';
  return `Last workout: ${diff} days ago`;
}

function renderHeatmap(container, cells, colorMap, captionHTML) {
  const heatmap = document.createElement('div');
  heatmap.className = 'heatmap';
  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';
  cells.forEach(cell => {
    const div = document.createElement('div');
    div.className = 'heatmap-cell';
    if (cell.activity) div.style.background = colorMap[cell.activity] || 'var(--surface-hi)';
    div.title = cell.date + (cell.activity ? ` · ${cell.activity}` : '');
    grid.appendChild(div);
  });
  heatmap.appendChild(grid);
  const cap = document.createElement('p');
  cap.className = 'heatmap-caption';
  cap.innerHTML = captionHTML;
  heatmap.appendChild(cap);
  container.appendChild(heatmap);
}

function renderMultiHeatmap(container, cells, colorMap, captionHTML) {
  const heatmap = document.createElement('div');
  heatmap.className = 'heatmap';
  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';
  cells.forEach(cell => {
    const div = document.createElement('div');
    div.className = 'heatmap-cell heatmap-cell-multi';
    if (cell.activities && cell.activities.length > 0) {
      cell.activities.forEach(type => {
        const strip = document.createElement('div');
        strip.className = 'hm-strip';
        strip.style.background = colorMap[type] || '#4E6E8A';
        div.appendChild(strip);
      });
      div.style.cursor = 'pointer';
      div.addEventListener('click', e => {
        e.stopPropagation();
        showDayPopover(div, cell.date, cell.activities, colorMap);
      });
    }
    div.title = cell.date + (cell.activities.length ? ' · ' + cell.activities.join(', ') : '');
    grid.appendChild(div);
  });
  heatmap.appendChild(grid);
  const cap = document.createElement('p');
  cap.className = 'heatmap-caption';
  cap.innerHTML = captionHTML;
  heatmap.appendChild(cap);
  container.appendChild(heatmap);
}

function renderBodyPart(container, part, allSessions, runs, walks) {
  // Dedup imported sessions the same way the history tab does — prevents doubled sets
  const seen = new Set();
  const dedupedSessions = allSessions.filter(item => {
    const isLive = item.startedAt && item.finishedAt && (item.finishedAt - item.startedAt) > 30000;
    if (isLive) return true;
    const key = `${item.date}__${item.templateName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let sessions;
  if (part === 'pt') {
    sessions = dedupedSessions.filter(s => s.templateId && s.templateId.startsWith('tpl-pt'));
  } else if (part === 'walk' || part === 'run') {
    sessions = [];
  } else {
    sessions = dedupedSessions.filter(s => s.bodyPartGroup === part);
  }

  // Layer B heatmap (this body part only, 12 weeks)
  const partActivity = {};
  if (part === 'pt') {
    sessions.forEach(s => { partActivity[s.date] = 'pt'; });
  } else if (part === 'walk') {
    walks.forEach(w => { partActivity[w.date] = 'walk'; });
  } else if (part === 'run') {
    runs.forEach(r => { partActivity[r.date] = 'run'; });
  } else {
    sessions.forEach(s => { partActivity[s.date] = part; });
  }

  const hasActivity = Object.keys(partActivity).length > 0;
  if (!hasActivity && sessions.length === 0 && part !== 'walk' && part !== 'run') {
    container.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:32px">No sessions yet for this body part</p>';
    return;
  }

  // Walk / Run: weekly miles bar chart (stacked per session, shaded by distance).
  if (part === 'walk') {
    if (walks.length < 1) { container.appendChild(Object.assign(document.createElement('p'), { textContent: 'No walks logged yet', style: 'color:var(--text-3);text-align:center;padding:24px' })); }
    else renderCardioBars(container, weeklyCardioSeries(walks, 8), CHART_COLORS.walk, 'mi', 'Treadmill Walks — miles / week');
    return;
  }
  if (part === 'run') {
    if (runs.length < 1) { container.appendChild(Object.assign(document.createElement('p'), { textContent: 'No runs logged yet', style: 'color:var(--text-3);text-align:center;padding:24px' })); }
    else renderCardioBars(container, weeklyCardioSeries(runs, 8), CHART_COLORS.run, 'mi', 'Runs — miles / week');
    return;
  }

  if (sessions.length === 0) {
    container.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:32px">No sessions yet for this body part</p>';
    return;
  }

  // Build exercise history — group by normalized name, then merge L/R unilateral pairs
  const EXCLUDED_NAMES = ['drop set', 'dead hang', 'push-up', 'push up', 'pushup'];
  const normName = n => (n || '').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const exMap = new Map(); // keyed by normalized exercise name (including any L/R suffix)
  sessions.slice().reverse().forEach(session => {
    session.exercises.forEach(exercise => {
      const lname = (exercise.exerciseName || '').toLowerCase().replace(/_/g, ' ');
      if (EXCLUDED_NAMES.some(n => lname.includes(n))) return;
      const key = normName(exercise.exerciseName);
      const displayName = (exercise.exerciseName || '').replace(/_/g, ' ');
      if (!exMap.has(key)) {
        exMap.set(key, { ex: { id: exercise.exerciseId, name: displayName }, history: [] });
      } else if (exMap.get(key).ex.name.includes('_') && !displayName.includes('_')) {
        exMap.get(key).ex.name = displayName;
      }
      const entry = exMap.get(key);
      const existing = entry.history.find(h => h.date === session.date);
      if (existing) {
        existing.exercise = { ...existing.exercise, sets: [...existing.exercise.sets, ...exercise.sets] };
      } else {
        entry.history.push({ date: session.date, exercise: { ...exercise, sets: [...exercise.sets] }, sessionNotes: session.sessionNotes || '', workoutContext: session.workoutContext || '' });
      }
    });
  });

  // Merge L/R unilateral pairs — "Lateral Raise L" + "Lateral Raise R" + "Lateral Raises" → one dual-line chart
  const LR_SUFFIX = /\s+[lr]$/i;
  const getBaseKey = key => {
    if (LR_SUFFIX.test(key)) return key.replace(LR_SUFFIX, '');
    if (key.endsWith('s') && key.length > 4) return key.slice(0, -1); // "raises" → "raise"
    return key;
  };
  const grouped = new Map(); // base key → { baseName, isLR, histL, histR, histBoth }
  // First pass: L/R suffixed entries set baseName authoritatively
  exMap.forEach((val, key) => {
    const m = key.match(/\s+([lr])$/i);
    if (!m) return;
    const side = m[1].toUpperCase();
    const baseKey = key.replace(LR_SUFFIX, '');
    if (!grouped.has(baseKey)) grouped.set(baseKey, { baseName: '', isLR: true, histL: null, histR: null, histBoth: null });
    const g = grouped.get(baseKey);
    g.isLR = true;
    if (side === 'L') { g.histL = val.history; g.baseName = val.ex.name.replace(/\s+L$/i, '').trim(); }
    else { g.histR = val.history; if (!g.baseName) g.baseName = val.ex.name.replace(/\s+R$/i, '').trim(); }
  });
  // Second pass: undifferentiated entries (no L/R suffix)
  exMap.forEach((val, key) => {
    if (LR_SUFFIX.test(key)) return;
    const baseKey = getBaseKey(key);
    if (!grouped.has(baseKey)) grouped.set(baseKey, { baseName: val.ex.name.trim(), isLR: false, histL: null, histR: null, histBoth: null });
    grouped.get(baseKey).histBoth = val.history;
    if (!grouped.get(baseKey).baseName) grouped.get(baseKey).baseName = val.ex.name.trim();
  });

  const exWithData = Array.from(grouped.values())
    .map(g => {
      const allHist = [...(g.histL || []), ...(g.histR || []), ...(g.histBoth || [])];
      allHist.sort((a, b) => b.date.localeCompare(a.date));
      return { ex: { name: g.baseName }, history: allHist, isLR: g.isLR, histL: g.histL, histR: g.histR, histBoth: g.histBoth };
    })
    .filter(({ history }) => history.length > 0);

  if (exWithData.length > 0) {
    buildCarousel(container, exWithData);
    buildPRBoard(container, exWithData);
  }

  // Cardio summary on legs tab (full detail now lives in Walk/Run tabs)
  if (part === 'legs') {
    if (runs.length >= 2) {
      const runSection = document.createElement('div');
      runSection.innerHTML = '<p class="section-title">Runs</p><div class="chart-wrap"><canvas id="run-chart"></canvas></div>';
      container.appendChild(runSection);
      const sortedRuns = runs.slice().reverse();
      activeCharts.push(new Chart(runSection.querySelector('#run-chart'), {
        type: 'line',
        data: { labels: sortedRuns.map(r => r.date), datasets: [{ label: 'Miles', data: sortedRuns.map(r => r.distanceMiles), borderColor: CHART_COLORS.run, backgroundColor: 'rgba(76,175,125,0.2)', tension: 0.3, fill: true, pointRadius: 4, yAxisID: 'y' }] },
        options: baseChartOptions('mi')
      }));
    }
    if (walks.length >= 2) {
      const walkSection = document.createElement('div');
      walkSection.innerHTML = '<p class="section-title">Treadmill Walks</p><div class="chart-wrap"><canvas id="walk-chart"></canvas></div>';
      container.appendChild(walkSection);
      const sortedWalks = walks.slice().reverse();
      activeCharts.push(new Chart(walkSection.querySelector('#walk-chart'), {
        type: 'line',
        data: { labels: sortedWalks.map(w => w.date), datasets: [{ label: 'Miles', data: sortedWalks.map(w => w.distanceMiles), borderColor: CHART_COLORS.walk, backgroundColor: 'rgba(91,164,224,0.2)', tension: 0.3, fill: true, pointRadius: 4, yAxisID: 'y' }] },
        options: baseChartOptions('mi')
      }));
    }
  }
}

function buildCarousel(container, exWithData) {
  let currentMetric = 'e1rm';
  const chartRefs = new Map(); // canvas → Chart instance
  const slideInfo = new Map(); // canvas → { ex, history, isTimed, statEl }

  const hasWeighted = exWithData.some(({ history }) =>
    history.some(h => h.exercise.sets.some(s => s.weight != null && s.seconds == null))
  );

  // Metric row
  const metricRow = document.createElement('div');
  metricRow.className = 'metric-row';
  metricRow.innerHTML = `
    <p class="section-title">Exercise Progress</p>
    ${hasWeighted ? `<select class="metric-select" id="metric-sel">
      <option value="e1rm" selected>Estimated 1 Rep Max</option>
      <option value="volume">Volume (lbs)</option>
    </select>` : ''}
  `;
  container.appendChild(metricRow);

  // Header (nav buttons + jump dropdown)
  const headerEl = document.createElement('div');
  headerEl.innerHTML = `
    <div class="carousel-header">
      <button class="carousel-nav" id="car-prev" disabled>&#9664;</button>
      <div style="flex:1;text-align:center">
        <span class="carousel-title" id="car-title">${esc(exWithData[0].ex.name)}</span>
        <span class="carousel-counter" id="car-counter">(1 / ${exWithData.length})</span>
      </div>
      <button class="carousel-nav" id="car-next" ${exWithData.length <= 1 ? 'disabled' : ''}>&#9654;</button>
    </div>
    ${exWithData.length > 1 ? `<select class="carousel-select" id="car-jump">
      ${exWithData.map((d, i) => `<option value="${i}">${esc(d.ex.name)}</option>`).join('')}
    </select>` : ''}
  `;
  container.appendChild(headerEl);

  // Scroll-snap track
  const track = document.createElement('div');
  track.className = 'carousel-track';

  exWithData.forEach(({ ex, history, isLR, histL, histR, histBoth }, i) => {
    const slide = document.createElement('div');
    slide.className = 'exercise-slide';
    slide.dataset.idx = i;

    const isTimed = history.some(h => h.exercise.sets.some(s => s.seconds != null));
    const statEl = document.createElement('div');
    statEl.className = 'chart-stats';

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);

    const navEl = document.createElement('div');
    navEl.className = 'chart-date-nav';

    slide.appendChild(statEl);
    slide.appendChild(wrap);
    slide.appendChild(navEl);
    track.appendChild(slide);
    slideInfo.set(canvas, { ex, history, isTimed, statEl, navEl, isLR, histL, histR, histBoth });
  });

  container.appendChild(track);

  // IntersectionObserver: lazy chart init/destroy
  let currentIdx = 0;
  const visibleCanvases = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const canvas = entry.target;
      const info = slideInfo.get(canvas);
      if (!info) continue;

      if (entry.isIntersecting) {
        visibleCanvases.add(canvas);
        renderSlideChart(canvas, info, currentMetric, chartRefs);
        const idx = parseInt(canvas.closest('.exercise-slide').dataset.idx);
        headerEl.querySelector('#car-title').textContent = info.ex.name;
        headerEl.querySelector('#car-counter').textContent = `(${idx + 1} / ${exWithData.length})`;
        const jump = headerEl.querySelector('#car-jump');
        if (jump) jump.value = idx;
        headerEl.querySelector('#car-prev').disabled = idx === 0;
        headerEl.querySelector('#car-next').disabled = idx === exWithData.length - 1;
        currentIdx = idx;
      } else {
        visibleCanvases.delete(canvas);
        const chart = chartRefs.get(canvas);
        if (chart) { chart.destroy(); chartRefs.delete(canvas); }
      }
    }
  }, { threshold: 0.5 });

  track.querySelectorAll('canvas').forEach(c => observer.observe(c));

  // Nav
  function scrollToSlide(idx) {
    const slide = track.children[idx];
    if (!slide) return;
    track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
  }
  headerEl.querySelector('#car-prev').addEventListener('click', () => { if (currentIdx > 0) scrollToSlide(currentIdx - 1); });
  headerEl.querySelector('#car-next').addEventListener('click', () => { if (currentIdx < exWithData.length - 1) scrollToSlide(currentIdx + 1); });
  const jump = headerEl.querySelector('#car-jump');
  if (jump) jump.addEventListener('change', e => scrollToSlide(parseInt(e.target.value)));

  // Metric toggle: destroy all active slide charts, then re-render currently visible canvases
  const metricSel = metricRow.querySelector('#metric-sel');
  if (metricSel) {
    metricSel.addEventListener('change', e => {
      currentMetric = e.target.value;
      track.querySelectorAll('canvas').forEach(c => {
        const chart = chartRefs.get(c);
        if (chart) { chart.destroy(); chartRefs.delete(c); }
      });
      visibleCanvases.forEach(c => {
        const info = slideInfo.get(c);
        if (info) renderSlideChart(c, info, currentMetric, chartRefs);
      });
    });
  }
}

function buildDateNav(container, dates, getContentFn, onIndexChange) {
  if (!dates || !dates.length) { container.innerHTML = ''; return { jumpTo: () => {} }; }
  let idx = dates.length - 1; // start at most recent
  function render() {
    const date = dates[idx];
    container.innerHTML = `
      <div class="date-nav-row">
        <button class="date-nav-btn" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>&#9664;</button>
        <span class="date-nav-label">${formatPRDate(date)}</span>
        <button class="date-nav-btn" data-dir="1" ${idx === dates.length - 1 ? 'disabled' : ''}>&#9654;</button>
      </div>
      <div class="date-nav-detail">${getContentFn(date)}</div>
    `;
    container.querySelectorAll('.date-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        idx = Math.max(0, Math.min(dates.length - 1, idx + Number(btn.dataset.dir)));
        if (onIndexChange) onIndexChange(idx);
        render();
      });
    });
  }
  render();
  return {
    jumpTo: i => {
      idx = Math.max(0, Math.min(dates.length - 1, i));
      render();
    }
  };
}

function capOutliers(data) {
  const valid = data.filter(v => v != null).sort((a, b) => a - b);
  if (valid.length < 3) return data;
  const med = valid[Math.floor(valid.length / 2)];
  let lastGood = null;
  return data.map(v => {
    if (v == null) return null;
    if (v > med * 1.7) return lastGood; // suppress machine-lift spikes
    lastGood = v;
    return v;
  });
}

function renderSlideChart(canvas, { history, isTimed, statEl, navEl, isLR, histL, histR, histBoth }, metric, chartRefs) {
  if (isLR) { renderLRChart(canvas, { histL, histR, histBoth, isTimed, statEl, navEl }, metric, chartRefs); return; }
  const existing = chartRefs.get(canvas);
  if (existing) existing.destroy();

  const sorted = history.slice().reverse(); // oldest first for chart
  const labels = sorted.map(h => h.date);
  let data, tooltipFn, pointColors, pointRadii;

  if (isTimed) {
    data = sorted.map(h => Math.max(...h.exercise.sets.map(s => s.seconds || 0)));
    tooltipFn = v => `${v} sec`;
    const best = Math.max(...data);
    statEl.innerHTML = `<span class="chart-stat-pr">🏆 Best: ${best} sec</span>`;
    pointColors = data.map(() => '#c6f135');
    pointRadii = data.map(() => 4);
  } else if (metric === 'e1rm') {
    data = capOutliers(sorted.map(h => getBestE1RM(h.exercise.sets)));
    tooltipFn = v => `${v} lbs est. 1RM`;
    const prFlags = findPRIndices(data);
    const valid = data.filter(v => v != null);
    const best = valid.length ? Math.max(...valid) : 0;
    const change = percentChange(valid);
    const sign = change >= 0 ? '+' : '';
    statEl.innerHTML = `<span class="chart-stat-pr">🏆 Best: ${best} lbs est.</span><span>📈 ${sign}${change}% over ${valid.length} session${valid.length !== 1 ? 's' : ''}</span>`;
    pointColors = prFlags.map((pr, i) => (pr && data[i] != null) ? '#c6f135' : 'rgba(0,0,0,0)');
    pointRadii = prFlags.map((pr, i) => (pr && data[i] != null) ? 6 : 4);
  } else {
    // volume mode
    data = sorted.map(h => h.exercise.sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0));
    tooltipFn = v => `${Number(v).toLocaleString()} lbs volume`;
    const best = data.length ? Math.max(...data) : 0;
    const change = percentChange(data);
    const sign = change >= 0 ? '+' : '';
    statEl.innerHTML = `<span class="chart-stat-pr">🏆 Best: ${best.toLocaleString()} lbs</span><span>📈 ${sign}${change}% over ${data.length} sessions</span>`;
    pointColors = data.map(() => '#c6f135');
    pointRadii = data.map(() => 4);
  }

  const validData = data.filter(v => v != null);
  const minVal = validData.length ? Math.floor(Math.min(...validData) * 0.94) : 0;

  let selectedIdx = labels.length - 1;
  let navJumpTo = null;

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#c6f135',
        backgroundColor: 'rgba(198,241,53,0.12)',
        tension: 0.3,
        fill: true,
        pointBackgroundColor: pointColors,
        pointRadius: pointRadii,
        spanGaps: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => tooltipFn(ctx.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: '#77797f', maxTicksLimit: 6, includeBounds: true }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { min: minVal, ticks: { color: '#77797f' }, grid: { color: 'rgba(255,255,255,0.06)' } }
      },
      onClick: (e, elements) => {
        if (!elements.length) return;
        selectedIdx = elements[0].index;
        highlightPoint(selectedIdx);
        if (navJumpTo) navJumpTo(selectedIdx);
      }
    }
  });
  chartRefs.set(canvas, chart);

  function highlightPoint(selIdx) {
    chart.data.datasets[0].pointBackgroundColor = data.map((v, i) =>
      i === selIdx && v != null ? 'rgba(0,0,0,0)' : pointColors[i]
    );
    chart.data.datasets[0].pointRadius = data.map((v, i) =>
      i === selIdx && v != null ? 9 : pointRadii[i]
    );
    chart.data.datasets[0].pointBorderColor = data.map((v, i) =>
      i === selIdx && v != null ? '#f4f5f2' : '#c6f135'
    );
    chart.data.datasets[0].pointBorderWidth = data.map((v, i) =>
      i === selIdx && v != null ? 3 : 1
    );
    chart.update('none');
  }

  if (navEl) {
    const { jumpTo } = buildDateNav(navEl, labels, date => {
      const h = sorted.find(e => e.date === date);
      if (!h) return '';
      const setStrs = h.exercise.sets.map(s =>
        s.seconds != null ? `${s.seconds}s` : (s.weight && s.reps ? `${s.weight}×${s.reps}${s.isDropSet ? '↓' : ''}` : '—')
      ).join(' · ');
      const ctx = h.workoutContext ? `<p class="date-nav-context">&#9889; ${esc(h.workoutContext)}</p>` : '';
      const notes = h.sessionNotes ? `<p class="date-nav-notes">${esc(h.sessionNotes)}</p>` : '';
      return `<p class="date-nav-sets">${setStrs}</p>${ctx}${notes}`;
    }, newIdx => {
      selectedIdx = newIdx;
      highlightPoint(newIdx);
    });
    navJumpTo = jumpTo;
    highlightPoint(selectedIdx);
  }
}

function renderLRChart(canvas, { histL, histR, histBoth, isTimed, statEl, navEl }, metric, chartRefs) {
  const existing = chartRefs.get(canvas);
  if (existing) existing.destroy();

  const allDates = [...new Set([
    ...(histL || []).map(h => h.date),
    ...(histR || []).map(h => h.date),
    ...(histBoth || []).map(h => h.date)
  ])].sort();

  // Split histBoth sets by side field:
  //   side='R' → Right dataset
  //   side='L' or null (when R-labeled sets exist in same entry) → Left dataset
  //   no side labels at all → Untracked
  const getBothEntry = date => histBoth && histBoth.find(h => h.date === date);

  const getRSets = date => {
    const sets = [];
    const rEntry = histR && histR.find(h => h.date === date);
    if (rEntry) sets.push(...rEntry.exercise.sets);
    const b = getBothEntry(date);
    if (b) sets.push(...b.exercise.sets.filter(s => s.side === 'R'));
    return sets;
  };

  const getLSets = date => {
    const sets = [];
    const lEntry = histL && histL.find(h => h.date === date);
    if (lEntry) sets.push(...lEntry.exercise.sets);
    const b = getBothEntry(date);
    if (b) {
      const hasRInBoth = b.exercise.sets.some(s => s.side === 'R');
      const hasLInBoth = b.exercise.sets.some(s => s.side === 'L');
      // null-side sets are Left when the entry alternates with R (or has explicit L labels)
      sets.push(...b.exercise.sets.filter(s => s.side === 'L' || (!s.side && (hasRInBoth || hasLInBoth))));
    }
    return sets;
  };

  const getUntrackedSets = date => {
    const b = getBothEntry(date);
    if (!b) return [];
    if (b.exercise.sets.some(s => s.side)) return []; // classified into L/R
    return b.exercise.sets;
  };

  const computeVal = sets => {
    if (!sets.length) return null;
    if (isTimed) return Math.max(...sets.map(s => s.seconds || 0));
    if (metric === 'volume') return sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
    return getBestE1RM(sets);
  };

  const lData = capOutliers(allDates.map(d => computeVal(getLSets(d))));
  const rData = capOutliers(allDates.map(d => computeVal(getRSets(d))));
  const uData = capOutliers(allDates.map(d => computeVal(getUntrackedSets(d))));

  const hasL = lData.some(v => v != null);
  const hasR = rData.some(v => v != null);
  const hasU = uData.some(v => v != null);

  const lPRFlags = hasL ? findPRIndices(lData) : [];
  const rPRFlags = hasR ? findPRIndices(rData) : [];
  const basePtColors = {};
  const basePtRadii = {};

  const datasets = [];
  if (hasL) {
    basePtColors.Left = lData.map((v, i) => lPRFlags[i] && v != null ? '#57c7ff' : 'rgba(0,0,0,0)');
    basePtRadii.Left = lData.map((v, i) => lPRFlags[i] && v != null ? 6 : 4);
    datasets.push({ label: 'Left', data: lData, borderColor: '#57c7ff', backgroundColor: 'rgba(87,199,255,0.10)', tension: 0.3, fill: false, pointBackgroundColor: basePtColors.Left, pointRadius: basePtRadii.Left, spanGaps: true });
  }
  if (hasR) {
    basePtColors.Right = rData.map((v, i) => rPRFlags[i] && v != null ? '#c6f135' : 'rgba(0,0,0,0)');
    basePtRadii.Right = rData.map((v, i) => rPRFlags[i] && v != null ? 6 : 4);
    datasets.push({ label: 'Right', data: rData, borderColor: '#c6f135', backgroundColor: 'rgba(198,241,53,0.10)', tension: 0.3, fill: false, pointBackgroundColor: basePtColors.Right, pointRadius: basePtRadii.Right, spanGaps: true });
  }
  if (hasU) {
    basePtColors.Untracked = uData.map(() => 'rgba(0,0,0,0)');
    basePtRadii.Untracked = uData.map(() => 3);
    datasets.push({ label: 'Untracked', data: uData, borderColor: '#77797f', backgroundColor: 'rgba(119,121,127,0.05)', tension: 0.3, fill: false, pointBackgroundColor: basePtColors.Untracked, pointRadius: basePtRadii.Untracked, spanGaps: true, borderDash: [4, 4] });
  }

  const unit = isTimed ? 'sec' : (metric === 'e1rm' ? 'lbs est.' : 'lbs vol');
  const lBest = hasL ? Math.max(...lData.filter(v => v != null)) : null;
  const rBest = hasR ? Math.max(...rData.filter(v => v != null)) : null;
  const parts = [];
  if (lBest != null) parts.push(`L: ${lBest}`);
  if (rBest != null) parts.push(`R: ${rBest}`);
  statEl.innerHTML = `<span class="chart-stat-pr">🏆 ${parts.length ? parts.join(' / ') + ' ' + unit : 'No data yet'}</span>`;

  const allVals = [...lData, ...rData, ...uData].filter(v => v != null);
  const minVal = allVals.length ? Math.floor(Math.min(...allVals) * 0.94) : 0;

  let selectedIdx = allDates.length - 1;
  let navJumpTo = null;

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels: allDates, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: '#77797f', boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} ${unit}` } }
      },
      scales: {
        x: { ticks: { color: '#77797f', maxTicksLimit: 6, includeBounds: true }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { min: minVal, ticks: { color: '#77797f' }, grid: { color: 'rgba(255,255,255,0.06)' } }
      },
      onClick: (e, elements) => {
        if (!elements.length) return;
        selectedIdx = elements[0].index;
        highlightPoints(selectedIdx);
        if (navJumpTo) navJumpTo(selectedIdx);
      }
    }
  });
  chartRefs.set(canvas, chart);

  function highlightPoints(selIdx) {
    chart.data.datasets.forEach(ds => {
      const baseColors = basePtColors[ds.label] || ds.data.map(() => 'rgba(0,0,0,0)');
      const baseRadii = basePtRadii[ds.label] || ds.data.map(() => 4);
      // Ring highlight: transparent fill + white border ring at selected index
      ds.pointBackgroundColor = ds.data.map((v, i) =>
        i === selIdx && v != null ? 'rgba(0,0,0,0)' : baseColors[i]
      );
      ds.pointRadius = ds.data.map((v, i) =>
        i === selIdx && v != null ? 9 : baseRadii[i]
      );
      ds.pointBorderColor = ds.data.map((v, i) =>
        i === selIdx && v != null ? '#f4f5f2' : ds.borderColor
      );
      ds.pointBorderWidth = ds.data.map((v, i) =>
        i === selIdx && v != null ? 3 : 1
      );
    });
    chart.update('none');
  }

  if (navEl) {
    const { jumpTo } = buildDateNav(navEl, allDates, date => {
      const lSets = getLSets(date);
      const rSets = getRSets(date);
      const uSets = getUntrackedSets(date);
      const fmtSets = sets => sets.map(s =>
        s.seconds != null ? `${s.seconds}s` : (s.weight && s.reps ? `${s.weight}×${s.reps}` : '—')
      ).join(' · ') || '—';
      const b = getBothEntry(date);
      const lEntry = histL && histL.find(h => h.date === date);
      const rEntry = histR && histR.find(h => h.date === date);
      const anyEntry = lEntry || rEntry || b;
      const notes = anyEntry?.sessionNotes || '';
      const ctx = anyEntry?.workoutContext ? `<p class="date-nav-context">&#9889; ${esc(anyEntry.workoutContext)}</p>` : '';
      let html = '';
      if (lSets.length) html += `<p class="date-nav-sets"><span style="color:#57c7ff;font-weight:700">L</span>&nbsp;&nbsp;${fmtSets(lSets)}</p>`;
      if (rSets.length) html += `<p class="date-nav-sets"><span style="color:#c6f135;font-weight:700">R</span>&nbsp;&nbsp;${fmtSets(rSets)}</p>`;
      if (uSets.length) html += `<p class="date-nav-sets">${fmtSets(uSets)}</p>`;
      if (ctx) html += ctx;
      if (notes) html += `<p class="date-nav-notes">${esc(notes)}</p>`;
      return html;
    }, newIdx => {
      selectedIdx = newIdx;
      highlightPoints(newIdx);
    });
    navJumpTo = jumpTo;
    highlightPoints(selectedIdx);
  }
}

function formatPRDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function buildPRBoard(container, exWithData) {
  const computePR = hist => {
    if (!hist) return null;
    const sorted = hist.slice().reverse();
    const isTimed = sorted.some(h => h.exercise.sets.some(s => s.seconds != null));
    let bestNum = -Infinity, bestVal = null, bestDate = '';
    sorted.forEach(h => {
      if (isTimed) {
        const m = Math.max(...h.exercise.sets.map(s => s.seconds || 0));
        if (m > bestNum) { bestNum = m; bestVal = `${m} sec`; bestDate = h.date; }
      } else {
        const e = getBestE1RM(h.exercise.sets);
        if (e != null && e > bestNum) { bestNum = e; bestVal = `${e} lbs`; bestDate = h.date; }
      }
    });
    return bestVal ? { val: bestVal, date: bestDate } : null;
  };

  const prEntries = [];
  exWithData.forEach(({ ex, history, isLR, histL, histR }) => {
    if (isLR) {
      const lPR = computePR(histL); if (lPR) prEntries.push({ name: `${ex.name} (L)`, val: lPR.val, date: lPR.date });
      const rPR = computePR(histR); if (rPR) prEntries.push({ name: `${ex.name} (R)`, val: rPR.val, date: rPR.date });
    } else {
      const pr = computePR(history); if (pr) prEntries.push({ name: ex.name, val: pr.val, date: pr.date });
    }
  });

  // Newest PR first
  prEntries.sort((a, b) => b.date.localeCompare(a.date));

  if (!prEntries.length) return;

  const rows = prEntries.map(({ name, val, date }) =>
    `<div class="pr-row">
      <span class="pr-name">${esc(name)}</span>
      <div class="pr-meta">
        <span class="pr-val">${val}</span>
        <span class="pr-date">${formatPRDate(date)}</span>
      </div>
    </div>`
  ).join('');

  const board = document.createElement('div');
  board.innerHTML = `<div class="card pr-board"><p class="pr-board-title">Personal Records</p>${rows}</div>`;
  container.appendChild(board);
}

function baseChartOptions(unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} ${unit}` } } },
    scales: {
      x: { ticks: { color: CHART_COLORS.text, maxTicksLimit: 6 }, grid: { color: CHART_COLORS.grid } },
      y: { ticks: { color: CHART_COLORS.text }, grid: { color: CHART_COLORS.grid } }
    }
  };
}
