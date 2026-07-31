# Progress Visualization Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat max-weight charts with Estimated 1 Rep Max (e1RM) in a swipeable exercise carousel, add dual-layer consistency heatmaps above and inside each body-part section, and surface personal records per exercise.

**Architecture:** New `metrics.js` pure utility module feeds all e1RM/PR calculations; `ui-progress.js` is fully rewritten to fetch all session/run/walk data once at the top, render a Layer A heatmap above the segmented control, and per body-part render a Layer B heatmap + volume bar chart + exercise carousel (CSS scroll-snap + IntersectionObserver lazy Chart.js init/destroy) + PR board; `styles.css` gets the new heatmap, carousel, stat chips, and PR board classes.

**Tech Stack:** Vanilla JS ES modules, Chart.js v4 (UMD global already loaded), CSS scroll-snap, IntersectionObserver API, Vitest + fake-indexeddb (unit tests).

## Global Constraints

- No new npm dependencies — `metrics.js` is pure JS with no imports
- No DB schema changes — all required data is already stored
- e1RM label: exact string **"Estimated 1 Rep Max"** wherever it appears in UI
- e1RM clamp: `reps > 20` → return null; `reps === 1` → return weight (no formula)
- e1RM formula: `Math.round(weight * (1 + reps / 30))`
- PR board cutoff: exercises with **≥ 1 session** of data are shown
- Heatmap Layer A: 12 weeks; Layer B: 8 weeks
- Activity priority (same day): session (arms/legs/core) > run > walk
- Layer A colors: arms `#B09FE0`, legs `#6ECFB0`, core `#F0A060`, run `#4CAF7D`, walk `#5BA4E0`
- Layer B colors: arms `#B09FE0`, legs `#6ECFB0`, core `#F0A060`
- y-axis min: `Math.floor(Math.min(...validData) * 0.94)` for both e1RM and volume charts
- PR dot color: `#F3A64E` (gold), radius 6px; non-PR point radius 4px, fill `rgba(0,0,0,0)`
- Run/walk charts in legs tab: **unchanged** from current implementation
- Session volume bar chart: **unchanged** from current implementation
- Test command: `npm test` from repo root (runs `npx vitest run`)
- Git: always `git checkout -b <branch>` in a **separate Bash call** before committing — the block-main-commit hook scans the whole command string and will reject commits on master

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `metrics.js` | **Create** | Pure utility functions: e1RM, PR detection, % change, consistency map |
| `tests/metrics.test.js` | **Create** | 13 unit tests for all metrics.js exports |
| `styles.css` | **Modify** | Add heatmap, metric toggle, carousel, stat chip, PR board classes |
| `ui-progress.js` | **Modify** | Full rewrite: heatmaps, carousel, PR board |

---

## Task 1: metrics.js utility module

**Files:**
- Create: `metrics.js`
- Create: `tests/metrics.test.js`

**Interfaces:**
- Produces (for Task 3):
  - `calcE1RM(weight: number|null, reps: number|null): number|null`
  - `getBestE1RM(sets: Array<{weight?,reps?,seconds?,isTimed?}>): number|null`
  - `findPRIndices(data: Array<number|null>): boolean[]`
  - `percentChange(data: Array<number|null>): number`
  - `buildConsistencyMap(activityByDate: Record<string,'arms'|'legs'|'core'|'run'|'walk'>, weeks?: number, today?: Date): Array<{weekIdx,dayIdx,level,date,activity}>`

- [ ] **Step 1: Checkout feature branch**

```bash
git checkout -b feat/progress-visualization
```

- [ ] **Step 2: Write the failing tests**

Create `tests/metrics.test.js`:

```js
import { calcE1RM, getBestE1RM, findPRIndices, percentChange, buildConsistencyMap } from '../metrics.js';

// ── calcE1RM ────────────────────────────────────────────────────────────────
test('calcE1RM: standard set', () => {
  expect(calcE1RM(130, 12)).toBe(182); // 130*(1+12/30)=130*1.4=182
});

test('calcE1RM: single rep returns weight', () => {
  expect(calcE1RM(130, 1)).toBe(130);
});

test('calcE1RM: null weight returns null', () => {
  expect(calcE1RM(null, 12)).toBeNull();
});

test('calcE1RM: zero reps returns null', () => {
  expect(calcE1RM(130, 0)).toBeNull();
});

test('calcE1RM: reps > 20 returns null (clamp)', () => {
  expect(calcE1RM(130, 21)).toBeNull();
});

test('calcE1RM: exactly 20 reps is valid', () => {
  expect(calcE1RM(130, 20)).toBe(217); // 130*(1+20/30)=130*1.6667=216.67→217
});

// ── getBestE1RM ─────────────────────────────────────────────────────────────
test('getBestE1RM: returns highest e1RM across sets', () => {
  const sets = [{ weight: 130, reps: 12 }, { weight: 130, reps: 14 }];
  expect(getBestE1RM(sets)).toBe(191); // 130*(1+14/30)=130*1.4667=190.67→191
});

test('getBestE1RM: timed set (no weight/reps) returns null', () => {
  expect(getBestE1RM([{ seconds: 45, isTimed: true }])).toBeNull();
});

test('getBestE1RM: empty array returns null', () => {
  expect(getBestE1RM([])).toBeNull();
});

// ── findPRIndices ────────────────────────────────────────────────────────────
test('findPRIndices: marks all-time highs at each point in time', () => {
  expect(findPRIndices([182, 180, 191, 189, 198])).toEqual([true, false, true, false, true]);
});

test('findPRIndices: equal value is NOT a PR', () => {
  expect(findPRIndices([182, 182, 191])).toEqual([true, false, true]);
});

test('findPRIndices: null values are never a PR', () => {
  expect(findPRIndices([null, 182, null, 191])).toEqual([false, true, false, true]);
});

// ── percentChange ────────────────────────────────────────────────────────────
test('percentChange: rounds to nearest integer', () => {
  // (198-182)/182*100 = 8.79 → 9
  expect(percentChange([182, 198])).toBe(9);
});

test('percentChange: single point returns 0', () => {
  expect(percentChange([182])).toBe(0);
});

// ── buildConsistencyMap ──────────────────────────────────────────────────────
test('buildConsistencyMap: session on first Monday of range maps to weekIdx=0,dayIdx=0', () => {
  // today = Monday 2026-01-05. daysFromMonday=0. currentMonday=2026-01-05.
  // weekIdx=0 Monday = 2026-01-05 - 11*7 = 2025-10-20.
  const today = new Date('2026-01-05T12:00:00');
  const activityByDate = { '2025-10-20': 'arms' };
  const cells = buildConsistencyMap(activityByDate, 12, today);
  const cell = cells.find(c => c.date === '2025-10-20');
  expect(cell).toBeDefined();
  expect(cell.weekIdx).toBe(0);
  expect(cell.dayIdx).toBe(0);
  expect(cell.level).toBe(3);
  expect(cell.activity).toBe('arms');
});
```

- [ ] **Step 3: Run tests to verify they fail**

```
npm test
```

Expected: 13 tests fail with "Cannot find module '../metrics.js'"

- [ ] **Step 4: Create `metrics.js`**

```js
export function calcE1RM(weight, reps) {
  if (!weight || !reps || reps > 20) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export function getBestE1RM(sets) {
  const vals = sets.map(s => calcE1RM(s.weight, s.reps)).filter(v => v != null);
  return vals.length ? Math.max(...vals) : null;
}

export function findPRIndices(data) {
  let max = -Infinity;
  return data.map(v => {
    if (v == null) return false;
    const isPR = v > max;
    if (isPR) max = v;
    return isPR;
  });
}

export function percentChange(data) {
  const valid = data.filter(v => v != null);
  if (valid.length < 2) return 0;
  return Math.round(((valid[valid.length - 1] - valid[0]) / valid[0]) * 100);
}

export function buildConsistencyMap(activityByDate, weeks = 12, today = new Date()) {
  const LEVEL = { arms: 3, legs: 3, core: 3, run: 2, walk: 1 };
  const dayOfWeek = today.getDay(); // 0=Sun
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - daysFromMonday);
  currentMonday.setHours(0, 0, 0, 0);

  const cells = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(currentMonday);
      date.setDate(currentMonday.getDate() - (weeks - 1 - w) * 7 + d);
      if (date > today) continue;
      const key = date.toISOString().slice(0, 10);
      const activity = activityByDate[key] || null;
      cells.push({ weekIdx: w, dayIdx: d, level: activity ? (LEVEL[activity] ?? 0) : 0, date: key, activity });
    }
  }
  return cells;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```
npm test
```

Expected: 20 existing tests + 13 new tests = 33 passing, 0 failing.

- [ ] **Step 6: Commit**

```bash
git add metrics.js tests/metrics.test.js
git commit -m "feat: add metrics.js utility module (e1RM, PR detection, consistency map)"
```

---

## Task 2: CSS additions for new Progress UI components

**Files:**
- Modify: `styles.css`

**Interfaces:**
- Consumes: existing CSS custom properties (`--surface`, `--surface-hi`, `--border`, `--text`, `--text-2`, `--text-3`, `--accent`, `--navy`, `--r-sm`, `--r-md`)
- Produces: classes used by Task 3's HTML — `.heatmap`, `.heatmap-grid`, `.heatmap-cell`, `.heatmap-caption`, `.heatmap-streak`, `.metric-row`, `.metric-select`, `.carousel-header`, `.carousel-nav`, `.carousel-title`, `.carousel-counter`, `.carousel-select`, `.carousel-track`, `.exercise-slide`, `.chart-stats`, `.chart-stat-pr`, `.pr-board`, `.pr-board-title`, `.pr-row`, `.pr-name`, `.pr-val`, `.pr-date`

- [ ] **Step 1: Add new CSS at the end of `styles.css`**

Append to `styles.css`:

```css
/* Progress — heatmap */
.heatmap { margin-bottom: 16px; }
.heatmap-grid {
  display: grid;
  grid-template-rows: repeat(7, 14px);
  grid-auto-flow: column;
  gap: 3px;
}
.heatmap-cell { width: 14px; height: 14px; border-radius: 2px; background: var(--surface-hi); }
.heatmap-caption { font-size: 12px; color: var(--text-3); margin-top: 6px; text-align: right; }
.heatmap-streak { color: var(--accent); font-weight: 600; }

/* Progress — metric toggle */
.metric-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.metric-select { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text); font-size: 13px; padding: 6px 10px; cursor: pointer; }

/* Progress — exercise carousel */
.carousel-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.carousel-nav { background: none; border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text-2); font-size: 18px; min-width: 44px; min-height: 44px; cursor: pointer; transition: opacity 0.15s; }
.carousel-nav:disabled { opacity: 0.3; cursor: default; }
.carousel-title { font-size: 16px; font-weight: 700; color: var(--text); display: block; }
.carousel-counter { font-size: 12px; color: var(--text-3); }
.carousel-select { width: 100%; margin-bottom: 10px; background: var(--surface-hi); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text); font-size: 14px; padding: 8px; min-height: 44px; cursor: pointer; }
.carousel-track { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.carousel-track::-webkit-scrollbar { display: none; }
.exercise-slide { flex: 0 0 100%; scroll-snap-align: start; }

/* Progress — chart stat chips */
.chart-stats { display: flex; gap: 16px; margin-bottom: 6px; font-size: 13px; color: var(--text-2); flex-wrap: wrap; }
.chart-stat-pr { color: var(--accent); font-weight: 700; }

/* Progress — PR board */
.pr-board { padding: 12px 14px; margin-top: 8px; margin-bottom: 24px; }
.pr-board-title { font-size: 12px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.pr-row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--border); }
.pr-row:last-child { border-bottom: none; }
.pr-name { font-size: 14px; color: var(--text); flex: 1; margin-right: 8px; }
.pr-val { color: var(--accent); font-weight: 600; font-size: 14px; }
.pr-date { font-size: 12px; color: var(--text-3); margin-left: 6px; }
```

- [ ] **Step 2: Verify no CSS syntax errors**

Open the app in a browser (serve from repo root or GitHub Pages). The Progress tab should still load without console errors. No visual changes yet — the new classes are unused until Task 3.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat: add heatmap, carousel, and PR board CSS classes"
```

---

## Task 3: Full ui-progress.js rewrite

**Files:**
- Modify: `ui-progress.js`

**Interfaces:**
- Consumes from Task 1: `calcE1RM`, `getBestE1RM`, `findPRIndices`, `percentChange`, `buildConsistencyMap` from `./metrics.js`
- Consumes from `db.js`: existing exports + `getAllSessions` (already exported)
- Consumes from Task 2: all new CSS classes

No unit tests for DOM rendering — test visually in browser per the acceptance checklist at the end of this task.

- [ ] **Step 1: Replace `ui-progress.js` with the following complete file**

```js
import { getExercises, getSessionsByBodyPart, getSessionsForExercise,
         getRunLogs, getWalkLogs, getAllSessions } from './db.js';
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

function streakCaption(activityByDate) {
  const today = new Date();
  let streak = 0;
  const d = new Date(today);
  while (activityByDate[d.toISOString().slice(0, 10)]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  if (streak >= 1) return `🔥 ${streak}-day streak`;
  const sorted = Object.keys(activityByDate).sort().reverse();
  if (!sorted.length) return 'No activity logged yet';
  const todayKey = today.toISOString().slice(0, 10);
  const diff = Math.round((new Date(todayKey) - new Date(sorted[0])) / 86400000);
  return `Last workout: ${diff} day${diff !== 1 ? 's' : ''} ago`;
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

async function renderBodyPart(container, part, allSessions, runs, walks) {
  const sessions = allSessions.filter(s => s.bodyPartGroup === part).slice(0, 20);

  if (sessions.length === 0) {
    container.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:32px">No sessions yet for this body part</p>';
    return;
  }

  // Session volume bar chart (unchanged)
  const volSection = document.createElement('div');
  volSection.innerHTML = '<p class="section-title">Session Volume</p><div class="chart-wrap"><canvas id="vol-chart"></canvas></div>';
  container.appendChild(volSection);
  const volData = sessions.slice().reverse().map(s => ({
    x: s.date,
    y: s.exercises.reduce((sum, ex) => sum + ex.sets.reduce((s2, set) => s2 + (set.weight || 0) * (set.reps || 0), 0), 0)
  }));
  activeCharts.push(new Chart(volSection.querySelector('#vol-chart'), {
    type: 'bar',
    data: { labels: volData.map(d => d.x), datasets: [{ data: volData.map(d => d.y), backgroundColor: CHART_COLORS.vol, borderColor: CHART_COLORS.line, borderWidth: 1 }] },
    options: baseChartOptions('lbs')
  }));

  // Layer B heatmap (this body part only, 8 weeks)
  const partActivity = {};
  allSessions.filter(s => s.bodyPartGroup === part).forEach(s => { partActivity[s.date] = part; });
  const layerBEl = document.createElement('div');
  renderHeatmap(layerBEl, buildConsistencyMap(partActivity, 8), LAYER_B_COLORS, `8-week ${part} activity`);
  container.appendChild(layerBEl);

  // Exercise carousel + PR board
  const exerciseDefs = await getExercises(part);
  const histories = await Promise.all(exerciseDefs.map(ex => getSessionsForExercise(ex.id, 12)));
  const exWithData = exerciseDefs
    .map((ex, i) => ({ ex, history: histories[i] }))
    .filter(({ history }) => history.length >= 1);

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
    history.some(h => h.exercise.sets.some(s => !s.isTimed && s.weight))
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

  exWithData.forEach(({ ex, history }, i) => {
    const slide = document.createElement('div');
    slide.className = 'exercise-slide';
    slide.dataset.idx = i;

    const isTimed = history[0]?.exercise.sets.some(s => s.isTimed) ?? false;
    const statEl = document.createElement('div');
    statEl.className = 'chart-stats';

    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);

    slide.appendChild(statEl);
    slide.appendChild(wrap);
    track.appendChild(slide);
    slideInfo.set(canvas, { ex, history, isTimed, statEl });
  });

  container.appendChild(track);

  // IntersectionObserver: lazy chart init/destroy
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const canvas = entry.target;
      const info = slideInfo.get(canvas);
      if (!info) continue;

      if (entry.isIntersecting) {
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
        const chart = chartRefs.get(canvas);
        if (chart) { chart.destroy(); chartRefs.delete(canvas); }
      }
    }
  }, { threshold: 0.5 });

  track.querySelectorAll('canvas').forEach(c => observer.observe(c));

  // Nav
  let currentIdx = 0;
  function scrollToSlide(idx) {
    const slide = track.children[idx];
    if (!slide) return;
    track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
  }
  headerEl.querySelector('#car-prev').addEventListener('click', () => { if (currentIdx > 0) scrollToSlide(currentIdx - 1); });
  headerEl.querySelector('#car-next').addEventListener('click', () => { if (currentIdx < exWithData.length - 1) scrollToSlide(currentIdx + 1); });
  const jump = headerEl.querySelector('#car-jump');
  if (jump) jump.addEventListener('change', e => scrollToSlide(parseInt(e.target.value)));

  // Metric toggle: destroy all active slide charts; observer re-renders visible one
  const metricSel = metricRow.querySelector('#metric-sel');
  if (metricSel) {
    metricSel.addEventListener('change', e => {
      currentMetric = e.target.value;
      track.querySelectorAll('canvas').forEach(c => {
        const chart = chartRefs.get(c);
        if (chart) { chart.destroy(); chartRefs.delete(c); }
      });
    });
  }
}

function renderSlideChart(canvas, { history, isTimed, statEl }, metric, chartRefs) {
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
    data = sorted.map(h => getBestE1RM(h.exercise.sets));
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
    const best = Math.max(...data);
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

function buildPRBoard(container, exWithData) {
  const rows = exWithData.map(({ ex, history }) => {
    const sorted = history.slice().reverse();
    const isTimed = sorted[0]?.exercise.sets.some(s => s.isTimed) ?? false;
    let bestVal = null, bestDate = '';

    if (isTimed) {
      let bestNum = -Infinity;
      sorted.forEach(h => {
        const m = Math.max(...h.exercise.sets.map(s => s.seconds || 0));
        if (m > bestNum) { bestNum = m; bestVal = `${m} sec`; bestDate = h.date; }
      });
    } else {
      let bestNum = -Infinity;
      sorted.forEach(h => {
        const e = getBestE1RM(h.exercise.sets);
        if (e != null && e > bestNum) { bestNum = e; bestVal = `${e} lbs est. 1RM`; bestDate = h.date; }
      });
    }

    if (!bestVal) return '';
    return `<div class="pr-row">
      <span class="pr-name">${esc(ex.name)}</span>
      <span><span class="pr-val">${bestVal}</span><span class="pr-date"> ${bestDate}</span></span>
    </div>`;
  }).filter(Boolean);

  if (!rows.length) return;

  const board = document.createElement('div');
  board.innerHTML = `<div class="card pr-board"><p class="pr-board-title">Personal Records</p>${rows.join('')}</div>`;
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
```

- [ ] **Step 2: Run tests to confirm no regressions**

```
npm test
```

Expected: 33 passing, 0 failing (ui-progress.js has no unit tests — it's browser-verified in Step 3).

- [ ] **Step 3: Visual acceptance check in browser**

Open the app in a browser. Work through each check:

**Layer A heatmap:**
- [ ] 12-week heatmap grid appears above Arms/Legs/Core segmented control
- [ ] Cells with arm sessions are purple (`#B09FE0`), legs teal, core orange, runs green, walks blue
- [ ] Caption shows streak (🔥 N-day) or "Last workout: N days ago"
- [ ] Empty cells are dark grey (`var(--surface-hi)`)

**Layer B heatmap:**
- [ ] Switching to Arms: 8-week heatmap inside the tab, showing only arms sessions in purple
- [ ] Switching to Legs: shows legs sessions in teal; if runs/walks exist, they appear in the heatmap (partActivity only includes sessions, so cardio won't appear — this is correct for Layer B)

**Exercise carousel:**
- [ ] First exercise is shown with prev button disabled
- [ ] Tapping ▶ or swiping left advances to next exercise; counter updates "(2 / N)"
- [ ] Jump dropdown navigates directly to a selected exercise
- [ ] "Estimated 1 Rep Max" shown in metric dropdown (if weighted exercises exist)
- [ ] Switching to "Volume (lbs)" refreshes the visible chart
- [ ] Gold dots appear at session-PR points on e1RM chart
- [ ] Stat chips show "🏆 Best: X lbs est." and "📈 +N% over M sessions"
- [ ] Only 1 chart visible at a time (open browser DevTools → Memory tab → confirm no runaway Chart.js instances)

**PR board:**
- [ ] "Personal Records" card appears below carousel with exercise name, best value, and date
- [ ] Timed exercises show "N sec" instead of e1RM

**Session volume + cardio charts:**
- [ ] Volume bar chart still appears at the top of each body-part section (unchanged)
- [ ] Legs tab: runs chart and treadmill walks chart still appear below PR board (unchanged)

- [ ] **Step 4: Commit**

```bash
git add ui-progress.js
git commit -m "feat: rewrite ui-progress with heatmaps, exercise carousel, and PR board"
```

- [ ] **Step 5: Push**

```bash
git push -u origin feat/progress-visualization
```

---

## Acceptance Criteria Checklist

Map to the spec's criteria — all must pass before this branch is considered mergeable:

- [ ] Layer A heatmap above segmented control, 12 weeks, color-coded by activity type
- [ ] Layer B heatmap inside each tab, 8 weeks, single color per body part
- [ ] Both heatmaps show correct streak / "last workout" caption
- [ ] Exercise carousel: one slide per exercise, CSS scroll-snap swipe works on iPhone
- [ ] ◀/▶ buttons navigate, counter updates, jump dropdown navigates directly
- [ ] IntersectionObserver: chart rendered only when visible, destroyed on scroll-off
- [ ] e1RM mode: auto-scaled y-axis, gold PR dots (radius 6), stat chips with best and % change
- [ ] Volume mode: auto-scaled y-axis, no PR dots, volume tooltip
- [ ] Metric dropdown switches all slides at once
- [ ] Timed exercises: max-seconds chart, no metric toggle shown
- [ ] PR board at bottom of each section, showing all exercises with ≥ 1 session
- [ ] Session volume bar chart unchanged
- [ ] Walk/run charts in legs tab unchanged
- [ ] 33 tests passing (20 existing + 13 new metrics tests)
- [ ] No new npm dependencies
