# Progress Visualization Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make strength progress visually obvious by replacing the raw max-weight chart with Estimated 1 Rep Max (e1RM), adding a 12-week consistency heatmap, and surfacing personal records per exercise.

**Architecture:** New `metrics.js` utility module; `ui-progress.js` updated to use it; `styles.css` extended for heatmap and stat chips. No DB schema changes — all data already stored.

**Tech Stack:** Vanilla JS ES modules, Chart.js v4 (already loaded), CSS custom properties (existing dark theme).

---

## Problem Statement

The current Progress tab shows a **max weight per session** line chart for each exercise. This is inadequate for two reasons:

1. **5 lb increments on a 0-based axis look flat.** Going from 130 lbs to 135 lbs over 4 sessions barely registers visually when the y-axis spans 0–200.
2. **Rep gains are invisible.** Going from 130×10 to 130×14 is real progress — the current chart shows a flat line.

The result: Marco can be making meaningful gains and the chart tells him nothing useful.

---

## Research: How Fitness Apps Handle This

The strength-training community has two established metrics for this problem:

### Estimated 1 Rep Max (e1RM)

The **Epley formula** converts any weight/rep combo to a single number representing the equivalent one-rep effort:

```
e1RM = weight × (1 + reps / 30)
```

Examples:
| Session | Weight × Reps | Max Weight Chart Shows | e1RM Shows |
|---------|--------------|----------------------|-----------|
| 1       | 130 × 12     | 130 ← flat           | 182       |
| 2       | 130 × 14     | 130 ← flat           | 191 ↑ +5% |
| 3       | 135 × 12     | 135 ← tiny jump      | 189 ← slight dip (expected) |
| 4       | 135 × 14     | 135 ← flat           | 198 ↑ +9% |
| 5       | 140 × 12     | 140 ← tiny jump      | 196 ← slight dip |
| 6       | 140 × 14     | 140 ← flat           | 205 ↑ +12% |

The e1RM chart shows real progress through both weight and rep increases. Weight jumps cause temporary dips (because you can't immediately hit the same rep count at the new weight), which is realistic — the staircase pattern is exactly what progressive overload looks like.

**Caveats:** Formula accuracy degrades above ~15 reps and is not meaningful for timed/bodyweight exercises. We clamp at 20 reps and skip e1RM for `isTimed` exercises (use max-time instead) and pure-reps exercises like Push-Ups (use max-reps).

### Per-Exercise Volume

Total volume (lbs lifted) per session for a specific exercise:

```
volume = Σ (weight × reps) across all sets
```

This metric is more sensitive than e1RM to set-count changes: adding a 4th set at the same weight creates a 33% jump. It's less sensitive to weight changes. Together, e1RM and volume tell complementary stories.

Volume is shown as a **secondary toggleable view** — not the default.

---

## Three Approaches Considered

### Approach A: e1RM as default metric (recommended)
Replace max-weight chart with e1RM. Auto-scale y-axis. Gold PR markers. Stat chips.

**Pros:** Single biggest improvement, directly addresses both pain points (invisible rep gains, flat weight axis).  
**Cons:** e1RM is unfamiliar to casual gym-goers (though the app can just show it as "Strength" without naming the formula).

### Approach B: Volume + Calendar focus
Keep max-weight charts, add per-exercise volume as the primary metric, add the consistency heatmap.

**Pros:** Volume is concrete and easy to understand.  
**Cons:** Doesn't fix the rep-invisibility problem. Volume can *decrease* when you intentionally do fewer sets at higher weight (deload weeks), which looks bad even when it's intentional.

### Approach C: Full analytics overhaul
Multiple metric toggles (e1RM, volume, max weight), heatmap, PR board, everything.

**Pros:** Maximum flexibility.  
**Cons:** Lots of UI surface area, hard to scan on a phone, most of it will never be used.

**Decision:** Approach A plus the heatmap from B. The heatmap is high value for the screen real-estate (pure CSS grid, no Chart.js). The metric toggle (e1RM vs volume) is a small addition that makes A better than pure A.

---

## Design

### Component 1: Consistency Heatmap

At the very top of the Progress tab (above the Arms/Legs/Core segmented control), a 12-week calendar grid showing workout activity — like GitHub's contribution graph.

**Layout (12 columns = weeks, 7 rows = Mon–Sun):**
```
         W-12  W-11  W-10  ...  W-1   This
Mon       [ ]   [■]   [ ]   ...  [■]   [ ]
Tue       [ ]   [ ]   [■]   ...  [ ]   [■]
Wed       [▪]   [ ]   [ ]   ...  [■]   [ ]
Thu       [ ]   [■]   [ ]   ...  [ ]   [ ]
Fri       [ ]   [ ]   [■]   ...  [▪]   [ ]
Sat       [ ]   [ ]   [ ]   ...  [ ]   [ ]
Sun       [ ]   [ ]   [ ]   ...  [ ]   [ ]
```

**Intensity levels (0–3):**
- 0: No activity → `--surface` (empty cell)
- 1: Walk logged → `rgba(91,164,224,0.4)` (walk blue, lighter)
- 2: Run or short workout → `rgba(76,175,125,0.5)` (run green)
- 3: Full workout session → `var(--accent)` (orange, full intensity)

If a day has multiple activity types, use the highest level.

**Caption below:** "12-week activity" and the current streak ("7-day streak" or "Last workout: 2 days ago").

**Where it lives:** `buildConsistencyHeatmap(container, sessions, runs, walks)` helper in `ui-progress.js`, called before `renderBodyPart()`.

**Data:** `getAllSessions(200)`, `getRunLogs(100)`, `getWalkLogs(100)` — all fetched once at the top of `renderProgressTab()` and passed down. Sessions already fetched for `renderBodyPart`; runs and walks are new fetches at this level.

### Component 2: e1RM Per-Exercise Charts

Replaces the current max-weight line chart.

**Metric selector:** A two-button toggle above the exercise charts (not per-exercise — one toggle for the whole body-part section):

```
[ Strength ▼ ]  [ Volume ]
```

Default: Strength (e1RM). Switches all exercise charts at once.

**Strength mode (e1RM):**
- Data: best e1RM per session (max across all sets: `max(weight × (1 + reps/30))`)
- Y-axis: `min: Math.floor(Math.min(...data) * 0.94)` — zoomed to data range, not 0-based
- Point styling: gold (`#F3A64E`) for sessions that set a new e1RM PR; normal for others
- Point radius: 6px for PRs, 4px for normal points
- Chart label on tooltip: "Est. strength: X lbs"

**Volume mode:**
- Data: total volume per session (`sum(weight × reps)` across all sets)
- Y-axis: 0-based (volume changes are large enough to be visible from 0)
- Chart label on tooltip: "Volume: X lbs"

**Stat chips row (above each exercise chart, Strength mode only):**
```
🏆 Best: 205 lbs est.   ·   📈 +13% over 6 sessions
```
- "Best" = all-time peak e1RM for this exercise
- "+X% over N sessions" = percentage gain from first to last data point in the current window

**Timed exercises (Dead Hangs):** Show max seconds per session instead of e1RM. No metric toggle for these — always time-based.

**Bodyweight exercises (Push-Ups):** Show max reps per session. No metric toggle.

**Exercises with < 2 sessions:** Same current behavior — skip chart, show nothing (not enough data).

### Component 3: PR Board

At the bottom of each body-part section (after all exercise charts), a compact card:

```
┌─ Session Volume ─────────────────────────────────┐
│ [bar chart across sessions]                        │
└────────────────────────────────────────────────────┘

┌─ Exercise Charts ─────────────────────────────────┐
│ [e1RM charts per exercise]                         │
└────────────────────────────────────────────────────┘

┌─ Personal Records ────────────────────────────────┐
│ MN Lat Pulldown       185 lbs est.    Jun 12       │
│ Semi-Pronated DB Curl  91 lbs est.   Jun 14       │
│ Hammer Curls           71 lbs est.   Jun 11       │
│ Dead Hangs             52 sec        Jun 11       │
└────────────────────────────────────────────────────┘
```

**Data:** Computed from the same `getSessionsForExercise` data already fetched for charts. No additional DB calls.

**What goes in each row:** exercise name, peak e1RM (or peak seconds for timed), date of that session.

**Only shown if exercise has ≥ 1 session.** Exercises with no history are excluded.

---

## File-by-File Changes

### New: `metrics.js`

Single-responsibility utility module. No imports. No side effects. All functions are pure.

```js
// Epley e1RM estimate. Returns null for timed or no-weight sets.
export function calcE1RM(weight, reps) {
  if (!weight || !reps || reps > 20) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// Best e1RM across all sets in a session for one exercise.
// Returns null if no valid weight/rep sets exist.
export function getBestE1RM(sets) { ... }

// For each data point, was it an all-time high at that point in time?
// data = array of numbers, returns boolean array same length.
export function findPRIndices(data) { ... }

// percentage change from first to last non-null value, rounded.
export function percentChange(data) { ... }

// Build a flat 84-cell array (12 weeks × 7 days) of intensity levels 0-3.
// week 0 = oldest, week 11 = current. day 0 = Monday.
export function buildConsistencyMap(sessions, runs, walks, today = new Date()) { ... }
```

### Modified: `ui-progress.js`

- Import from `./metrics.js`
- Fetch sessions/runs/walks once at top of `renderProgressTab()` and pass to heatmap
- Call `buildConsistencyHeatmap()` before the segmented control
- In `renderBodyPart()`: accept `metric` param ('strength' | 'volume'), add toggle UI
- Per-exercise chart: switch between e1RM and volume data based on metric
- Add stat chips row above each chart
- Add PR board card at bottom

### Modified: `styles.css`

```css
/* Heatmap */
.heatmap { margin-bottom: 20px; }
.heatmap-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; }
.heatmap-cell { aspect-ratio: 1; border-radius: 2px; background: var(--surface); }
.heatmap-cell[data-level="1"] { background: rgba(91,164,224,0.4); }
.heatmap-cell[data-level="2"] { background: rgba(76,175,125,0.5); }
.heatmap-cell[data-level="3"] { background: var(--accent); }
.heatmap-caption { font-size: 12px; color: var(--text-3); margin-top: 6px; }
.heatmap-streak { color: var(--accent); font-weight: 600; }

/* Metric toggle */
.metric-toggle { display: flex; gap: 8px; margin-bottom: 16px; }
.metric-btn { padding: 6px 14px; border: 1px solid var(--border); border-radius: 20px; background: var(--surface); color: var(--text-2); font-size: 13px; font-weight: 500; cursor: pointer; }
.metric-btn.active { background: var(--navy); color: var(--text); border-color: var(--accent); }

/* Stat chips */
.chart-stats { display: flex; gap: 12px; margin-bottom: 6px; font-size: 13px; color: var(--text-2); }
.chart-stat-pr { color: var(--accent); font-weight: 700; }

/* PR board */
.pr-board { padding: 12px; margin-top: 8px; margin-bottom: 24px; }
.pr-board-title { font-size: 14px; font-weight: 700; color: var(--text-2); margin-bottom: 8px; }
.pr-row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.pr-row:last-child { border-bottom: none; }
.pr-val { color: var(--accent); font-weight: 600; }
.pr-date { font-size: 12px; color: var(--text-3); }
```

### New: `tests/metrics.test.js`

Tests for all pure functions in `metrics.js`:

- `calcE1RM(130, 12)` → 182
- `calcE1RM(130, 1)` → 130
- `calcE1RM(130, 0)` → null
- `calcE1RM(null, 12)` → null
- `calcE1RM(130, 21)` → null (clamp)
- `getBestE1RM([{weight:130,reps:12},{weight:130,reps:14}])` → 191
- `getBestE1RM([{seconds:45}])` → null (timed set)
- `findPRIndices([182, 180, 191, 189, 198])` → [true, false, true, false, true]
- `findPRIndices([182, 182, 191])` → [true, false, true]
- `percentChange([182, 182, 191, 198])` → 9 (%)
- `buildConsistencyMap` with a session on Monday of 2 weeks ago → cell at correct position is level 3

---

## Scope Limits (What We're NOT Building)

- **Body weight normalization:** Marco isn't logging bodyweight.
- **Exercise comparison overlay:** Too cluttered on a phone.
- **"Plateau detector":** Cute idea but not needed — the PR markers tell the same story.
- **Chart export/share:** Out of scope.
- **Weekly training load / tonnage score:** The volume chart covers this.
- **Leg/core exercises without data:** No change — same "No sessions yet" behavior.

---

## Consistency Heatmap Data Structure

The heatmap renders the **last 12 weeks** as a 7-row × 12-column grid. Row 0 = Monday, row 6 = Sunday. Column 0 = 12 weeks ago, column 11 = current week.

```
buildConsistencyMap returns:
[
  { weekIdx: 0, dayIdx: 0, level: 0, date: '2026-03-24' },
  { weekIdx: 0, dayIdx: 1, level: 3, date: '2026-03-25' },  // workout session
  ...
  { weekIdx: 11, dayIdx: 6, level: 0, date: '2026-06-18' }, // today
]
```

Level assignment (priority order, highest wins):
- **3**: A `logged_session` exists on this date
- **2**: A `run_log` exists on this date (but no full session)
- **1**: A `walk_log` exists on this date (but no run or session)
- **0**: No activity

Streak calculation: count consecutive days ending today (or yesterday if today is rest) that have level ≥ 1.

---

## Acceptance Criteria

- [ ] Consistency heatmap renders at the top of Progress tab with correct day/week mapping
- [ ] Heatmap cells are correctly colored for workout sessions (level 3), runs (2), walks (1)
- [ ] Streak label shows correct consecutive-day count
- [ ] Arms section shows e1RM chart by default for each weighted exercise
- [ ] Metric toggle switches all exercise charts between Strength and Volume
- [ ] Gold point markers appear on sessions that set a new e1RM PR at that point in time
- [ ] Y-axis starts at 94% of min value in Strength mode (not 0)
- [ ] Stat chips show "Best: X lbs est." and "+Y% over N sessions"
- [ ] Timed exercises (Dead Hangs) show max-seconds chart, no metric toggle
- [ ] PR board renders at bottom of each body-part section with all-time bests
- [ ] All existing charts (session volume bar, runs, walks) are unchanged
- [ ] 20+ tests passing (including new metrics.test.js)
- [ ] No new npm dependencies

---

## Open Questions for Marco

1. **e1RM label name:** Should the chart title say "Estimated 1RM" (accurate but gym-jargon), "Strength Score" (approachable but vague), or "Estimated Max (lbs)" (descriptive)? Default plan: "Estimated max (lbs)".

2. **Heatmap position:** Above the segmented control (before Arms/Legs/Core split) — covers all activity types in one view. Alternative: inside each body-part tab, showing only activity for that body part. Default plan: above, all activity.

3. **Volume mode y-axis:** Should the volume y-axis start at 0 or also auto-scale? Starting at 0 makes set-addition jumps look smaller but more honest. Default plan: 0-based.

4. **PR board cutoff:** Show all exercises in the body part group, or only ones you've logged ≥ 2 sessions for? Default plan: ≥ 1 session (even one session is your current PR).
