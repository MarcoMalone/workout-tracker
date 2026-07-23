import { calcE1RM, getBestE1RM, findPRIndices, percentChange, buildConsistencyMap, readinessScore, computeACWR, computeWeeklyVolume, goalStreak, detectStall, painSummary, suggestProgression, computeWeeklyCardio } from '../metrics.js';

// ── suggestProgression ─────────────────────────────────────────────────────────
test('suggestProgression: +5 lb when every set hit the target (machine)', () => {
  const prev = [{ weight: 100, reps: 12 }, { weight: 100, reps: 12 }, { weight: 100, reps: 13 }];
  expect(suggestProgression(prev, 12, { equipment: 'machine' })).toEqual({ from: 100, to: 105, inc: 5 });
});
test('suggestProgression: +2.5 lb for dumbbells', () => {
  const r = suggestProgression([{ weight: 30, reps: 10 }], 10, { equipment: 'dumbbell' });
  expect(r).toEqual({ from: 30, to: 32.5, inc: 2.5 });
});
test('suggestProgression: null when any working set missed the target', () => {
  expect(suggestProgression([{ weight: 100, reps: 12 }, { weight: 100, reps: 8 }], 12, {})).toBeNull();
});
test('suggestProgression: ignores drop sets, uses the top working weight', () => {
  const prev = [{ weight: 100, reps: 12 }, { weight: 80, reps: 20, isDropSet: true }];
  expect(suggestProgression(prev, 12, {})).toEqual({ from: 100, to: 105, inc: 5 });
});
test('suggestProgression: null for timed / bodyweight / empty / missing target', () => {
  expect(suggestProgression([{ seconds: 30 }], 3, { isTimed: true })).toBeNull();
  expect(suggestProgression([{ reps: 20 }], 15, { isBodyweight: true })).toBeNull();
  expect(suggestProgression([], 10, {})).toBeNull();
  expect(suggestProgression(null, 10, {})).toBeNull();
  expect(suggestProgression([{ weight: 100, reps: 12 }], null, {})).toBeNull();
});

// ── computeWeeklyCardio ──────────────────────────────────────────────────────────
test('computeWeeklyCardio: sums this week (Mon–Sun), excludes prior weeks', () => {
  const today = new Date('2026-07-22T12:00:00'); // Wednesday; week Mon 2026-07-20 → Sun 2026-07-26
  const runs = [
    { date: '2026-07-20', durationMinutes: 16, distanceMiles: 2 },
    { date: '2026-07-22', durationMinutes: 20, distanceMiles: 2.5 },
    { date: '2026-07-13', durationMinutes: 99, distanceMiles: 9 }, // prior week → excluded
  ];
  const walks = [{ date: '2026-07-21', durationMinutes: 30, distanceMiles: 1.5 }];
  const c = computeWeeklyCardio(runs, walks, today);
  expect(c).toMatchObject({ runMin: 36, runMiles: 4.5, runCount: 2, walkMin: 30, walkMiles: 1.5, walkCount: 1 });
});
test('computeWeeklyCardio: all zeros when nothing logged', () => {
  expect(computeWeeklyCardio([], [], new Date('2026-07-22T12:00:00')))
    .toMatchObject({ runMin: 0, walkMin: 0, runCount: 0, walkCount: 0 });
});

// ── painSummary ───────────────────────────────────────────────────────────────
test('painSummary: empty when nothing hurts', () => {
  expect(painSummary({})).toBe('');
  expect(painSummary({ knees: { level: 0 } })).toBe('');
});
test('painSummary: lists active regions worst-first with notes', () => {
  const s = painSummary({ groin: { level: 4, note: 'right' }, hips: { level: 7, note: '' }, knees: { level: 0 } });
  expect(s).toContain('hips 7/10');
  expect(s).toContain('groin 4/10 (right)');
  expect(s.indexOf('hips')).toBeLessThan(s.indexOf('groin'));
  expect(s).not.toContain('knees');
});

// ── detectStall ───────────────────────────────────────────────────────────────
test('detectStall: no PR in the last 3 sessions → stalled', () => {
  const r = detectStall([100, 110, 120, 115, 118, 119]); // best (120) was 3 sessions ago
  expect(r.stalled).toBe(true);
  expect(r.sinceBest).toBe(3);
});
test('detectStall: a fresh PR on the latest session → not stalled', () => {
  expect(detectStall([100, 110, 120, 130]).stalled).toBe(false);
});
test('detectStall: too little history is never stalled', () => {
  expect(detectStall([100, 90, 95]).stalled).toBe(false);
});
test('detectStall: ignores null entries', () => {
  const r = detectStall([100, null, 120, null, 115, 118, 119]);
  expect(r.stalled).toBe(true);
});

// ── goalStreak ────────────────────────────────────────────────────────────────
const gb = (t, n) => { const d = new Date(t); d.setDate(t.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
test('goalStreak: consecutive met days including today', () => {
  const t = new Date(2026, 6, 8);
  expect(goalStreak({ [gb(t, 0)]: 1, [gb(t, 1)]: 1, [gb(t, 2)]: 1 }, 1, t)).toBe(3);
});
test('goalStreak: an untouched today still counts prior days', () => {
  const t = new Date(2026, 6, 8);
  expect(goalStreak({ [gb(t, 1)]: 1, [gb(t, 2)]: 1 }, 1, t)).toBe(2);
});
test('goalStreak: a gap breaks the streak', () => {
  const t = new Date(2026, 6, 8);
  expect(goalStreak({ [gb(t, 0)]: 1, [gb(t, 2)]: 1 }, 1, t)).toBe(1);
});
test('goalStreak: quantity target must be reached to count the day', () => {
  const t = new Date(2026, 6, 8);
  expect(goalStreak({ [gb(t, 0)]: 3, [gb(t, 1)]: 2 }, 3, t)).toBe(1);
});

const dk = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function walksBack(today, count, minutes, offset = 0) {
  const out = [];
  for (let i = offset; i < offset + count; i++) { const d = new Date(today); d.setDate(today.getDate() - i); out.push({ date: dk(d), durationMinutes: minutes }); }
  return out;
}

// ── computeACWR ───────────────────────────────────────────────────────────────
test('computeACWR: no history → building baseline, null ratio', () => {
  const a = computeACWR([], [], [], new Date(2026, 6, 8));
  expect(a.hasBaseline).toBe(false);
  expect(a.ratio).toBeNull();
});
test('computeACWR: steady 4-week load → ~1.0, optimal', () => {
  const today = new Date(2026, 6, 8);
  const a = computeACWR([], [], walksBack(today, 28, 60), today);
  expect(a.hasBaseline).toBe(true);
  expect(a.ratio).toBeCloseTo(1.0, 1);
  expect(a.zone).toBe('optimal');
});
test('computeACWR: heavy recent week over a light base → high risk', () => {
  const today = new Date(2026, 6, 8);
  const walks = [...walksBack(today, 7, 120), ...walksBack(today, 21, 20, 7)];
  const a = computeACWR([], [], walks, today);
  expect(a.ratio).toBeGreaterThan(1.5);
  expect(a.zone).toBe('high');
});

// ── computeWeeklyVolume ───────────────────────────────────────────────────────
test('computeWeeklyVolume: counts performed sets by exercise group, in-week only', () => {
  const today = new Date(2026, 6, 8); // Wed → week of Mon Jul 6
  const exGroup = { 'ex-a': 'arms', 'ex-b': 'legs' };
  const sessions = [
    { date: '2026-07-07', bodyPartGroup: 'arms', exercises: [
      { exerciseId: 'ex-a', sets: [{ weight: 50, reps: 10 }, { weight: 50, reps: 10 }, { weight: null, reps: null, seconds: null }] },
      { exerciseId: 'ex-b', sets: [{ weight: 100, reps: 8 }] },
    ] },
    { date: '2026-06-01', bodyPartGroup: 'arms', exercises: [{ exerciseId: 'ex-a', sets: [{ weight: 50, reps: 10 }] }] }, // out of week
  ];
  const v = computeWeeklyVolume(sessions, exGroup, today);
  expect(v.arms).toBe(2); // 2 performed, empty set ignored
  expect(v.legs).toBe(1);
  expect(v.core).toBe(0);
});

// ── readinessScore ────────────────────────────────────────────────────────────
test('readinessScore: all-best inputs score 100', () => {
  expect(readinessScore({ sleep: 5, energy: 5, soreness: 1, mood: 5 })).toBe(100);
});
test('readinessScore: all-worst inputs score 0', () => {
  expect(readinessScore({ sleep: 1, energy: 1, soreness: 5, mood: 1 })).toBe(0);
});
test('readinessScore: soreness is inverted (more sore lowers the score)', () => {
  const low = readinessScore({ sleep: 3, energy: 3, soreness: 5, mood: 3 });
  const high = readinessScore({ sleep: 3, energy: 3, soreness: 1, mood: 3 });
  expect(high).toBeGreaterThan(low);
});
test('readinessScore: neutral midpoint is ~50', () => {
  expect(readinessScore({ sleep: 3, energy: 3, soreness: 3, mood: 3 })).toBe(50);
});

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
