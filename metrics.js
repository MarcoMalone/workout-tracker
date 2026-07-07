// Morning readiness: four 1-5 subjective inputs → a 0-100 score. Soreness is
// inverted (less sore = more ready). Sub-5-item wellness questionnaires track
// fatigue as well as most objective metrics, with zero hardware.
export function readinessScore({ sleep = 0, energy = 0, soreness = 0, mood = 0 } = {}) {
  const raw = sleep + energy + mood + (6 - soreness); // range 4..20
  return Math.round(((raw - 4) / 16) * 100);
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
