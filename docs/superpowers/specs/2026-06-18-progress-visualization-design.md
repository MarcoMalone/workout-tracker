# Progress Visualization Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make strength progress visually obvious by replacing the raw max-weight charts with Estimated 1 Rep Max (e1RM) in a swipe-able carousel, adding a dual-layer consistency heatmap, and surfacing personal records per exercise.

**Architecture:** New `metrics.js` utility module; `ui-progress.js` refactored; `styles.css` extended. No DB schema changes — all data already stored.

**Tech Stack:** Vanilla JS ES modules, Chart.js v4 (already loaded), CSS scroll-snap (native browser), IntersectionObserver API, CSS custom properties (existing dark theme).

---

## Decisions (finalized with Marco)

| Question | Decision |
|---|---|
| e1RM label | **"Estimated 1 Rep Max"** — exact phrase, as-is |
| Heatmap position | **Both** — one above the selector (all activity, color-coded by type) + one inside each body-part tab (that tab's activity only) |
| Volume y-axis | **Auto-scaled** — starting at 0 wastes the bottom half when rep range never goes below ~6 |
| PR board cutoff | **≥ 1 session** |
| Exercise navigation | **Carousel** — CSS scroll-snap + IntersectionObserver for lazy chart rendering |

---

## Problem Statement

The current Progress tab shows a **max weight per session** line chart for each exercise. This is inadequate for two reasons:

1. **5 lb increments on a 0-based axis look flat.** Going from 130 lbs to 135 lbs over 4 sessions barely registers visually when the y-axis spans 0–200.
2. **Rep gains are invisible.** Going from 130×10 to 130×14 is real progress — the current chart shows a flat line.

---

## The Fix: Estimated 1 Rep Max

The **Epley formula** converts any weight/rep combo to a single number representing the equivalent one-rep effort:

```
e1RM = weight × (1 + reps / 30)
```

| Session | Weight × Reps | Max Weight Chart | e1RM Chart |
|---------|--------------|-----------------|-----------|
| 1       | 130 × 12     | 130 ← flat       | 182       |
| 2       | 130 × 14     | 130 ← flat       | 191 ↑ +5% |
| 3       | 135 × 12     | 135 ← tiny       | 189 ← dip (expected at new weight) |
| 4       | 135 × 14     | 135 ← flat       | 198 ↑ +9% |
| 5       | 140 × 14     | 140 ← tiny       | 205 ↑ +12% |

The e1RM chart shows the staircase of progressive overload. Temporary dips when weight jumps are realistic — you can't hit the same reps at a heavier weight immediately.

**Caveats (handled in `metrics.js`):**
- Formula degrades above ~15 reps → clamp at reps > 20, return null
- Timed exercises (Dead Hangs) → use max seconds, no e1RM
- Bodyweight-reps exercises (Push-Ups) → use max reps, no e1RM

---

## Component 1: Consistency Heatmap (Two Layers)

### Layer A — Above the segmented control

A 12-week calendar grid showing all activity, color-coded by type. Like GitHub's contribution graph, but each cell's color tells you what kind of workout happened.

**Color coding (using existing tag colors from the app's design system):**
- Arms session → `#B09FE0` (purple)
- Legs session → `#6ECFB0` (teal)
- Core session → `#F0A060` (orange)
- Run (no session) → `#4CAF7D` (green)
- Walk (no run/session) → `#5BA4E0` (blue)
- No activity → `var(--surface)` (empty)

If a day has multiple activities, the highest-intensity type wins (full session > run > walk).

**Layout:** 12 columns (weeks, left = oldest) × 7 rows (Mon–Sun). Pure CSS grid, no Chart.js.

**Caption:** "12-week activity  ·  🔥 7-day streak" (or "Last workout: 2 days ago" if no streak).

### Layer B — Inside each body-part tab

A narrower 8-week heatmap showing only sessions for that body part. Single color matching the tab (arms = purple, legs = teal, core = orange). No multi-color needed — this one answers "how often am I hitting arms specifically."

**Position:** Below the exercise carousel title, above the PR board.

---

## Component 2: Exercise Carousel

Replaces the current "all charts stacked vertically" layout with a horizontal swipe carousel — one exercise at a time.

### Navigation structure

```
[ Metric: Estimated 1 Rep Max ▼ ]

◀  Semi-Pronated DB Curls  (3 / 7)  ▶
   [ dropdown: select exercise ]

╔══════════════════════════════════╗
║ 🏆 Best: 91 lbs  ·  +13% (6 sess) ║
║                                    ║
║  [Chart.js line chart]             ║
║                                    ║
╚══════════════════════════════════╝
```

- `◀` / `▶` buttons are large tap targets (min 44px). Also respond to native horizontal swipe (CSS scroll-snap).
- `(3 / 7)` counter shows position in the exercise list.
- Dropdown (a `<select>`) lists all exercises in the current body-part group — tap to jump directly.
- Metric dropdown above carousel: "Estimated 1 Rep Max" or "Volume (lbs)" — switching it refreshes all slides.

### Slide rendering (IntersectionObserver + lazy init)

Each exercise gets a `.exercise-slide` div with an empty `<canvas>`. The carousel container uses CSS `scroll-snap` for swipe behavior.

An `IntersectionObserver` watches each canvas:
- When a slide enters the viewport → instantiate Chart.js with the exercise's data
- When a slide exits the viewport → `chart.destroy()` and clear the reference

At any moment, at most **1–2 Chart.js instances exist** (the current slide and one pre-loaded neighbor). This keeps memory and render cost flat no matter how many exercises you have.

```js
const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) renderSlideChart(e.target);
    else destroySlideChart(e.target);
  }
}, { threshold: 0.5 });
slides.forEach(slide => observer.observe(slide.querySelector('canvas')));
```

### Chart configuration (e1RM mode)

- **Data:** best e1RM per session (`max(weight × (1 + reps/30))` across all sets)
- **Y-axis min:** `Math.floor(Math.min(...data) * 0.94)` — zoomed to data range
- **Point color:** Gold (`#F3A64E`) for sessions that set a new all-time e1RM PR; `var(--surface)` fill otherwise
- **Point radius:** 6px for PRs, 4px for others
- **Tooltip:** "91 lbs est. 1RM"

### Chart configuration (Volume mode)

- **Data:** `Σ(weight × reps)` across all sets for this exercise per session
- **Y-axis min:** `Math.floor(Math.min(...data) * 0.94)` — auto-scaled (same as e1RM)
- **Tooltip:** "4,860 lbs volume"

### Stat chips row (above each chart)

```
🏆 Best: 91 lbs est.   ·   📈 +13% over 6 sessions
```

- "Best" = all-time peak e1RM for this exercise
- "+X% over N sessions" = first data point to last data point

### Timed exercises (Dead Hangs)

No metric toggle. Chart shows max seconds per session. Stat chips show "Best: 52 sec."

### Exercises with < 1 session data

Skipped entirely — not added to the carousel slides.

---

## Component 3: PR Board

After the exercise carousel inside each body-part section, a compact card:

```
┌─ Personal Records ────────────────────────────┐
│ MN Lat Pulldown     185 lbs est. 1RM  Jun 12  │
│ DB Curls             91 lbs est. 1RM  Jun 14  │
│ Hammer Curls         71 lbs est. 1RM  Jun 11  │
│ Dead Hangs           52 sec           Jun 11  │
└────────────────────────────────────────────────┘
```

Shows all-time best e1RM (or seconds for timed) + date, for every exercise with ≥ 1 session. Computed from the same session data already fetched for charts — no extra DB calls.

---

## Session Volume Bar Chart (unchanged)

The existing session-level volume bar chart (showing total lbs lifted per session across all exercises) stays at the top of each body-part section. No changes here.

---

## File-by-File Changes

### New: `metrics.js`

Pure utility functions, no imports, no side effects.

```js
// Epley e1RM. Returns null for timed sets, missing data, or reps > 20.
export function calcE1RM(weight, reps) {
  if (!weight || !reps || reps > 20) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// Best e1RM across all sets in a session for one exercise.
// Returns null if no valid weight+rep sets (e.g. timed exercise).
export function getBestE1RM(sets) {
  const vals = sets.map(s => calcE1RM(s.weight, s.reps)).filter(v => v != null);
  return vals.length ? Math.max(...vals) : null;
}

// For each data point, was it an all-time high at that point in time?
// Returns a boolean array same length as data.
// Example: [182, 180, 191, 189, 198] → [true, false, true, false, true]
export function findPRIndices(data) {
  let max = -Infinity;
  return data.map(v => { const isPR = v > max; if (isPR) max = v; return isPR; });
}

// Percentage change from first to last non-null value. Returns integer.
export function percentChange(data) {
  const valid = data.filter(v => v != null);
  if (valid.length < 2) return 0;
  return Math.round(((valid[valid.length - 1] - valid[0]) / valid[0]) * 100);
}

// Build a flat array of { weekIdx, dayIdx, level, date } for the last `weeks` weeks.
// weekIdx 0 = oldest, weekIdx (weeks-1) = current. dayIdx 0 = Monday.
// level: 0 = none, 1 = walk, 2 = run, 3 = workout session.
// activityByDate: { 'YYYY-MM-DD': 'session' | 'run' | 'walk' }
export function buildConsistencyMap(activityByDate, weeks = 12, today = new Date()) { ... }
```

### Modified: `ui-progress.js`

Full rewrite of `renderBodyPart()`. High-level structure:

```js
export async function renderProgressTab(el) {
  // destroy existing charts
  // fetch: sessions (all), runs, walks once — pass to heatmap and body-part renderer
  // render Layer A heatmap (all activity, color-coded)
  // render segmented control (Arms / Legs / Core)
  // render current body part
}

async function renderBodyPart(container, part, allSessions, runs, walks) {
  // render session volume bar chart (unchanged)
  // render Layer B heatmap (this body part only)
  // render exercise carousel
  // render PR board
}

function buildCarousel(container, exercises, sessionsByExercise, metric) {
  // create scroll-snap container
  // one slide per exercise
  // IntersectionObserver for lazy chart init/destroy
  // prev/next buttons
  // dropdown
}
```

The `activeCharts` array at module level is replaced by per-slide chart refs stored as `canvas.dataset` or a `WeakMap`.

### Modified: `styles.css`

```css
/* Heatmap */
.heatmap { margin-bottom: 20px; }
.heatmap-grid {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  grid-auto-flow: column;
  gap: 3px;
}
.heatmap-cell { width: 18px; height: 18px; border-radius: 2px; background: var(--surface); }
.heatmap-caption { font-size: 12px; color: var(--text-3); margin-top: 6px; text-align: right; }
.heatmap-streak { color: var(--accent); font-weight: 600; }

/* Metric toggle */
.metric-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.metric-select { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text); font-size: 14px; padding: 6px 10px; }

/* Exercise carousel */
.carousel-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.carousel-nav { background: none; border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text-2); font-size: 20px; min-width: 44px; min-height: 44px; cursor: pointer; }
.carousel-nav:disabled { opacity: 0.3; }
.carousel-title { flex: 1; font-size: 16px; font-weight: 700; text-align: center; }
.carousel-counter { font-size: 13px; color: var(--text-3); }
.carousel-select { width: 100%; margin-bottom: 12px; }
.carousel-track { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.carousel-track::-webkit-scrollbar { display: none; }
.exercise-slide { flex: 0 0 100%; scroll-snap-align: start; }

/* Chart stat chips */
.chart-stats { display: flex; gap: 16px; margin-bottom: 6px; font-size: 13px; color: var(--text-2); }
.chart-stat-pr { color: var(--accent); font-weight: 700; }

/* PR board */
.pr-board { padding: 12px; margin-top: 16px; margin-bottom: 24px; }
.pr-board-title { font-size: 13px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.pr-row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--border); }
.pr-row:last-child { border-bottom: none; }
.pr-name { font-size: 14px; color: var(--text); }
.pr-val { color: var(--accent); font-weight: 600; font-size: 14px; }
.pr-date { font-size: 12px; color: var(--text-3); margin-left: 8px; }
```

### New: `tests/metrics.test.js`

- `calcE1RM(130, 12)` → 182
- `calcE1RM(130, 1)` → 130 (identity)
- `calcE1RM(null, 12)` → null
- `calcE1RM(130, 0)` → null
- `calcE1RM(130, 21)` → null (clamp)
- `getBestE1RM([{weight:130,reps:12},{weight:130,reps:14}])` → 191
- `getBestE1RM([{seconds:45}])` → null (timed set)
- `getBestE1RM([])` → null (empty)
- `findPRIndices([182, 180, 191, 189, 198])` → [true, false, true, false, true]
- `findPRIndices([182, 182, 191])` → [true, false, true] (equal is NOT a PR)
- `percentChange([182, 198])` → 9
- `percentChange([182])` → 0 (single point)
- `buildConsistencyMap` — session on Monday of 2 weeks ago maps to correct weekIdx/dayIdx/level

---

## Scope Limits

- No body weight normalization
- No "normalized overlay" chart (all exercises on one chart as % of best) — deferred to future
- No export/share of charts
- No new npm dependencies

---

## Acceptance Criteria

- [ ] Layer A heatmap above the segmented control, 12 weeks, color-coded by activity type
- [ ] Layer B heatmap inside each tab, 8 weeks, single color for that body part
- [ ] Both heatmaps show correct streak / "last workout" caption
- [ ] Exercise carousel: one slide per exercise, scroll-snap swipe works on iPhone
- [ ] `◀` / `▶` buttons navigate, counter updates, dropdown jumps directly
- [ ] IntersectionObserver: chart only rendered when slide is visible, destroyed when it scrolls off
- [ ] e1RM mode: y-axis auto-scaled, gold PR dots, stat chips with best and % change
- [ ] Volume mode: y-axis auto-scaled, no PR dots, volume tooltip
- [ ] Metric dropdown switches all slides at once
- [ ] Timed exercises: max-seconds chart, no metric toggle
- [ ] PR board at bottom of each body-part section, ≥ 1 session
- [ ] Session volume bar chart unchanged
- [ ] All walks/runs charts unchanged (legs tab)
- [ ] 25+ tests passing (existing 20 + new metrics.test.js)
- [ ] No new npm dependencies
