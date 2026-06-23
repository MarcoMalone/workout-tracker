import { getRunLogs, getWalkLogs, getAllSessions } from './db.js';
import { getBestE1RM, findPRIndices, percentChange, buildConsistencyMap } from './metrics.js';

const CHART_COLORS = { line: '#F3A64E', vol: 'rgba(243,166,78,0.3)', run: '#4CAF7D', walk: '#5BA4E0', grid: '#2A3F58', text: '#8EA3B8' };
const LAYER_A_COLORS = { arms: '#B09FE0', legs: '#6ECFB0', core: '#F0A060', run: '#4CAF7D', walk: '#5BA4E0' };
const LAYER_B_COLORS = { arms: '#B09FE0', legs: '#6ECFB0', core: '#F0A060' };

const activeCharts = [];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function renderProgressTab(el) {
  activeCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
  activeCharts.length = 0;
  el.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">Progress</h1>
      <div id="layer-a-heatmap"></div>
      <div class="seg-control" id="body-part-seg">
        <button class="seg-btn active" data-part="arms">Arms</button>
        <button class="seg-btn" data-part="legs">Legs</button>
        <button class="seg-btn" data-part="core">Core</button>
      </div>
      <div id="charts-container"></div>
    </div>
  `;

  const [allSessions, runs, walks] = await Promise.all([getAllSessions(200), getRunLogs(50), getWalkLogs(50)]);

  const activityByDate = buildActivityByDate(allSessions, runs, walks);
  const layerACells = buildConsistencyMap(activityByDate, 12);
  renderHeatmap(
    el.querySelector('#layer-a-heatmap'),
    layerACells,
    LAYER_A_COLORS,
    `12-week activity · <span class="heatmap-streak">${streakCaption(activityByDate)}</span>`
  );

  let currentPart = 'arms';
  const container = el.querySelector('#charts-container');
  await renderBodyPart(container, currentPart, allSessions, runs, walks);

  el.querySelector('#body-part-seg').addEventListener('click', async e => {
    if (!e.target.classList.contains('seg-btn')) return;
    el.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentPart = e.target.dataset.part;
    activeCharts.forEach(c => c.destroy());
    activeCharts.length = 0;
    container.innerHTML = '';
    await renderBodyPart(container, currentPart, allSessions, runs, walks);
  });
}

function buildActivityByDate(sessions, runs, walks) {
  const map = {};
  walks.forEach(w => { if (!map[w.date]) map[w.date] = 'walk'; });
  runs.forEach(r => { if (!map[r.date] || map[r.date] === 'walk') map[r.date] = 'run'; });
  sessions.forEach(s => { map[s.date] = s.bodyPartGroup || 'arms'; });
  return map;
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

function renderBodyPart(container, part, allSessions, runs, walks) {
  const sessions = allSessions.filter(s => s.bodyPartGroup === part);

  if (sessions.length === 0) {
    container.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:32px">No sessions yet for this body part</p>';
    return;
  }

  // Layer B heatmap (this body part only, 8 weeks)
  const partActivity = {};
  sessions.forEach(s => { partActivity[s.date] = part; });
  const layerBEl = document.createElement('div');
  renderHeatmap(layerBEl, buildConsistencyMap(partActivity, 8), LAYER_B_COLORS, `8-week ${part} activity`);
  container.appendChild(layerBEl);

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
        entry.history.push({ date: session.date, exercise: { ...exercise, sets: [...exercise.sets] } });
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

  // Cardio charts for legs (unchanged)
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

    slide.appendChild(statEl);
    slide.appendChild(wrap);
    track.appendChild(slide);
    slideInfo.set(canvas, { ex, history, isTimed, statEl, isLR, histL, histR, histBoth });
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

function renderSlideChart(canvas, { history, isTimed, statEl, isLR, histL, histR, histBoth }, metric, chartRefs) {
  if (isLR) { renderLRChart(canvas, { histL, histR, histBoth, isTimed, statEl }, metric, chartRefs); return; }
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
    pointColors = data.map(() => '#F3A64E');
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
    pointColors = prFlags.map((pr, i) => (pr && data[i] != null) ? '#F3A64E' : 'rgba(0,0,0,0)');
    pointRadii = prFlags.map((pr, i) => (pr && data[i] != null) ? 6 : 4);
  } else {
    // volume mode
    data = sorted.map(h => h.exercise.sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0));
    tooltipFn = v => `${Number(v).toLocaleString()} lbs volume`;
    const best = data.length ? Math.max(...data) : 0;
    const change = percentChange(data);
    const sign = change >= 0 ? '+' : '';
    statEl.innerHTML = `<span class="chart-stat-pr">🏆 Best: ${best.toLocaleString()} lbs</span><span>📈 ${sign}${change}% over ${data.length} sessions</span>`;
    pointColors = data.map(() => '#F3A64E');
    pointRadii = data.map(() => 4);
  }

  const validData = data.filter(v => v != null);
  const minVal = validData.length ? Math.floor(Math.min(...validData) * 0.94) : 0;

  chartRefs.set(canvas, new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#F3A64E',
        backgroundColor: 'rgba(243,166,78,0.15)',
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
        x: { ticks: { color: '#8EA3B8', maxTicksLimit: 6 }, grid: { color: '#2A3F58' } },
        y: { min: minVal, ticks: { color: '#8EA3B8' }, grid: { color: '#2A3F58' } }
      }
    }
  }));
}

function renderLRChart(canvas, { histL, histR, histBoth, isTimed, statEl }, metric, chartRefs) {
  const existing = chartRefs.get(canvas);
  if (existing) existing.destroy();

  const allDates = [...new Set([
    ...(histL || []).map(h => h.date),
    ...(histR || []).map(h => h.date),
    ...(histBoth || []).map(h => h.date)
  ])].sort();

  const getValue = (hist, date) => {
    if (!hist) return null;
    const entry = hist.find(h => h.date === date);
    if (!entry) return null;
    if (isTimed) return Math.max(...entry.exercise.sets.map(s => s.seconds || 0));
    if (metric === 'volume') return entry.exercise.sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
    return getBestE1RM(entry.exercise.sets);
  };

  const datasets = [];
  if (histL) datasets.push({ label: 'Left', data: capOutliers(allDates.map(d => getValue(histL, d))), borderColor: '#5BA4E0', backgroundColor: 'rgba(91,164,224,0.1)', tension: 0.3, fill: false, pointRadius: 4, spanGaps: true });
  if (histR) datasets.push({ label: 'Right', data: capOutliers(allDates.map(d => getValue(histR, d))), borderColor: '#F3A64E', backgroundColor: 'rgba(243,166,78,0.1)', tension: 0.3, fill: false, pointRadius: 4, spanGaps: true });
  if (histBoth) datasets.push({ label: 'Untracked', data: capOutliers(allDates.map(d => getValue(histBoth, d))), borderColor: '#8EA3B8', backgroundColor: 'rgba(142,163,184,0.05)', tension: 0.3, fill: false, pointRadius: 3, spanGaps: true, borderDash: [4, 4] });

  const getHistBest = hist => {
    if (!hist) return null;
    const vals = hist.flatMap(h => { const e = isTimed ? Math.max(...h.exercise.sets.map(s => s.seconds || 0)) : getBestE1RM(h.exercise.sets); return e != null ? [e] : []; });
    return vals.length ? Math.max(...vals) : null;
  };

  const unit = isTimed ? 'sec' : (metric === 'e1rm' ? 'lbs est.' : 'lbs vol');
  const parts = [];
  const lBest = getHistBest(histL); if (lBest != null) parts.push(`L: ${lBest}`);
  const rBest = getHistBest(histR); if (rBest != null) parts.push(`R: ${rBest}`);
  statEl.innerHTML = `<span class="chart-stat-pr">🏆 ${parts.length ? parts.join(' / ') + ' ' + unit : 'No data yet'}</span>`;

  const allVals = datasets.flatMap(d => d.data.filter(v => v != null));
  const minVal = allVals.length ? Math.floor(Math.min(...allVals) * 0.94) : 0;

  chartRefs.set(canvas, new Chart(canvas, {
    type: 'line',
    data: { labels: allDates, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: '#8EA3B8', boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} ${unit}` } }
      },
      scales: {
        x: { ticks: { color: '#8EA3B8', maxTicksLimit: 6 }, grid: { color: '#2A3F58' } },
        y: { min: minVal, ticks: { color: '#8EA3B8' }, grid: { color: '#2A3F58' } }
      }
    }
  }));
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
