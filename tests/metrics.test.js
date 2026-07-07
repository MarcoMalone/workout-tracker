import { calcE1RM, getBestE1RM, findPRIndices, percentChange, buildConsistencyMap, readinessScore } from '../metrics.js';

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
