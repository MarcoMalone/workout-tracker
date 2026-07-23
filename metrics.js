// Morning readiness: four 1-5 subjective inputs → a 0-100 score. Soreness is
// inverted (less sore = more ready). Sub-5-item wellness questionnaires track
// fatigue as well as most objective metrics, with zero hardware.
export function readinessScore({ sleep = 0, energy = 0, soreness = 0, mood = 0 } = {}) {
  const raw = sleep + energy + mood + (6 - soreness); // range 4..20
  return Math.round(((raw - 4) / 16) * 100);
}

const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Training load for a strength session, in minutes. Uses real elapsed time when
// it looks sane; falls back to a nominal 40 min for imported/edited sessions
// that lack reliable timestamps.
export function sessionLoadMinutes(s) {
  if (s.startedAt && s.finishedAt) {
    const min = (s.finishedAt - s.startedAt) / 60000;
    if (min >= 1 && min <= 240) return Math.round(min);
  }
  return 40;
}

// Acute:Chronic Workload Ratio using training minutes as a transparent external
// load. acute = last 7 days total; chronic = 28-day average week (coupled).
// ratio in 0.8-1.3 is the evidence-backed "sweet spot"; <0.8 detraining, >1.5
// spike/injury-risk. Returns hasBaseline:false until ~4 weeks of history exist.
export function computeACWR(sessions, runs, walks, today = new Date()) {
  const load = {};
  const add = (date, mins) => { if (date && mins > 0) load[date] = (load[date] || 0) + mins; };
  for (const s of sessions) add(s.date, sessionLoadMinutes(s));
  for (const r of runs) add(r.date, Math.round(r.durationMinutes || 0));
  for (const w of walks) add(w.date, Math.round(w.durationMinutes || 0));

  const sumDays = (offset, count) => {
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - offset - i);
      sum += load[dayKey(d)] || 0;
    }
    return sum;
  };
  const acute = sumDays(0, 7);
  const chronicWeekly = sumDays(0, 28) / 4;
  const priorWindow = sumDays(7, 21);            // days 8-28 must have data to trust a baseline
  const hasBaseline = priorWindow > 0 && chronicWeekly > 0;
  const ratio = hasBaseline ? acute / chronicWeekly : null;
  let zone = 'baseline';
  if (ratio != null) {
    if (ratio < 0.8) zone = 'low';
    else if (ratio <= 1.3) zone = 'optimal';
    else if (ratio <= 1.5) zone = 'caution';
    else zone = 'high';
  }
  return { acute, chronicWeekly: Math.round(chronicWeekly), ratio, zone, hasBaseline };
}

// Hard-set counts landed on each body-part group in the current week (Mon-Sun).
// Each set counts if any of weight/reps/seconds was logged. Group is taken from
// the exercise definition, falling back to the session's group.
export function computeWeeklyVolume(sessions, exerciseGroupById = {}, today = new Date()) {
  const dow = today.getDay();
  const fromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - fromMon);
  const weekKeys = new Set();
  for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); weekKeys.add(dayKey(d)); }
  const counts = { arms: 0, legs: 0, core: 0 };
  for (const s of sessions) {
    if (!weekKeys.has(s.date)) continue;
    for (const ex of (s.exercises || [])) {
      const group = exerciseGroupById[ex.exerciseId] || s.bodyPartGroup;
      if (!(group in counts)) continue;
      for (const set of ex.sets) {
        if (set.reps != null || set.seconds != null || set.weight != null) counts[group]++;
      }
    }
  }
  return counts;
}

// Weekly (Mon–Sun) running + walking totals, so cardio is visible on the Progress
// tab (the hard-set volume board counts strength only — runs/walks are invisible
// there by design). Pure. Minutes are rounded; miles kept to one decimal.
export function computeWeeklyCardio(runs, walks, today = new Date()) {
  const dow = today.getDay();
  const fromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - fromMon);
  const weekKeys = new Set();
  for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); weekKeys.add(dayKey(d)); }
  let runMin = 0, walkMin = 0, runMiles = 0, walkMiles = 0, runCount = 0, walkCount = 0;
  for (const r of (runs || [])) if (weekKeys.has(r.date)) { runMin += Math.round(r.durationMinutes || 0); runMiles += r.distanceMiles || 0; runCount++; }
  for (const w of (walks || [])) if (weekKeys.has(w.date)) { walkMin += Math.round(w.durationMinutes || 0); walkMiles += w.distanceMiles || 0; walkCount++; }
  const round1 = n => Math.round(n * 10) / 10;
  return { runMin, walkMin, runMiles: round1(runMiles), walkMiles: round1(walkMiles), runCount, walkCount };
}

// Weekly cardio series for the Progress bar chart: one entry per week (oldest→
// newest), each with that week's sessions (date + miles + minutes) and total miles.
// Pure. `logs` are run OR walk logs (each has date + distanceMiles + durationMinutes).
export function weeklyCardioSeries(logs, weeks = 8, today = new Date()) {
  const dow = today.getDay();
  const fromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - fromMon);
  monday.setHours(0, 0, 0, 0);
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = new Date(monday); start.setDate(monday.getDate() - w * 7);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const startKey = dayKey(start), endKey = dayKey(end);
    const sessions = (logs || [])
      .filter(l => l && l.date >= startKey && l.date <= endKey)
      .map(l => ({ date: l.date, miles: l.distanceMiles || 0, durationMinutes: l.durationMinutes || 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const total = Math.round(sessions.reduce((s, x) => s + x.miles, 0) * 10) / 10;
    out.push({ weekStart: startKey, label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), sessions, total });
  }
  return out;
}

// Progressive-overload nudge: if EVERY working set of the last session hit or beat
// the rep target, suggest bumping the load next time. +5 lb for machines/barbell,
// +2.5 lb for dumbbells (finer jumps). Only for loaded lifts — never timed or
// bodyweight moves. Returns { from, to, inc } or null. Pure.
export function suggestProgression(prevSets, targetReps, exDef) {
  if (!prevSets || !prevSets.length || !targetReps) return null;
  if (exDef && (exDef.isTimed || exDef.isBodyweight)) return null;
  const working = prevSets.filter(s => s && !s.isDropSet && s.weight != null && s.reps != null);
  if (!working.length) return null;
  if (!working.every(s => s.reps >= targetReps)) return null;
  const topWeight = Math.max(...working.map(s => s.weight));
  if (!(topWeight > 0)) return null;
  const inc = (exDef && exDef.equipment === 'dumbbell') ? 2.5 : 5;
  return { from: topWeight, to: topWeight + inc, inc };
}

// One-line summary of active pain regions (level > 0), worst first, for the
// coach context and AI template adjustment. Empty string when nothing hurts.
export function painSummary(painLog = {}) {
  const active = Object.entries(painLog)
    .filter(([, v]) => v && v.level > 0)
    .sort((a, b) => b[1].level - a[1].level);
  if (!active.length) return '';
  return 'Active pain/soreness: ' + active.map(([region, v]) => `${region} ${v.level}/10${v.note ? ` (${v.note})` : ''}`).join(', ') + '.';
}

// Detect a stalled lift from a chronological e1RM series (oldest→newest).
// Stalled when the best estimate is 3+ sessions in the past (no PR since) and
// there are at least 4 data points. Returns sessions-since-best for the nudge.
export function detectStall(series) {
  const vals = series.filter(v => v != null);
  if (vals.length < 4) return { stalled: false, sinceBest: 0 };
  const best = Math.max(...vals);
  let sinceBest = 0;
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i] >= best) break;
    sinceBest++;
  }
  return { stalled: sinceBest >= 3, sinceBest, best };
}

// Consecutive days a daily goal has been met (count >= target), ending today —
// or yesterday if today isn't met yet, so an untouched today doesn't break it.
export function goalStreak(logForGoal = {}, target = 1, today = new Date()) {
  const met = d => (logForGoal[dayKey(d)] || 0) >= target;
  let streak = 0;
  const cur = new Date(today);
  if (!met(cur)) cur.setDate(cur.getDate() - 1);
  while (met(cur)) { streak++; cur.setDate(cur.getDate() - 1); }
  return streak;
}

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

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      const key = localDateKey(date);
      const activity = activityByDate[key] || null;
      cells.push({ weekIdx: w, dayIdx: d, level: activity ? (LEVEL[activity] ?? 0) : 0, date: key, activity });
    }
  }
  return cells;
}
