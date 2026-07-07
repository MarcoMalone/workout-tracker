// tests/claude-context.test.js
import { buildSessionSummary, buildExportSummary, parseGoalSuggestions } from '../claude-api.js';

// ── parseGoalSuggestions ──────────────────────────────────────────────────────
test('parseGoalSuggestions: parses a JSON array, clamps target, keeps unit/why', () => {
  const out = parseGoalSuggestions('[{"title":"Dead hangs","target":3,"unit":"hangs","why":"grip"}]');
  expect(out).toEqual([{ title: 'Dead hangs', target: 3, unit: 'hangs', why: 'grip' }]);
});
test('parseGoalSuggestions: tolerates prose around the array and coerces target to >=1', () => {
  const out = parseGoalSuggestions('Sure! Here you go:\n[{"title":"PT","target":0}]\nHope that helps.');
  expect(out).toEqual([{ title: 'PT', target: 1, unit: '', why: '' }]);
});
test('parseGoalSuggestions: drops entries without a title and returns [] on garbage', () => {
  expect(parseGoalSuggestions('[{"target":3},{"title":"  "}]')).toEqual([]);
  expect(parseGoalSuggestions('no json here')).toEqual([]);
  expect(parseGoalSuggestions('')).toEqual([]);
});

const SAMPLE_SESSION = {
  date: '2026-06-11', templateName: 'Arm A', bodyPartGroup: 'arms', sessionNotes: 'felt strong',
  exercises: [
    { exerciseName: 'Barbell Curl', notes: 'shoulder tight', sets: [{ weight: 130, reps: 12, seconds: null, side: null, isDropSet: false }, { weight: 130, reps: 10, seconds: null, side: null, isDropSet: false }] },
    { exerciseName: 'Dead Hang', notes: '', sets: [{ weight: null, reps: null, seconds: 45, side: null, isDropSet: false }] }
  ]
};

test('buildSessionSummary includes exercise name and sets', () => {
  const summary = buildSessionSummary(SAMPLE_SESSION);
  expect(summary).toContain('Barbell Curl');
  expect(summary).toContain('130×12');
  expect(summary).toContain('130×10');
});

test('buildSessionSummary includes timed exercise in seconds', () => {
  const summary = buildSessionSummary(SAMPLE_SESSION);
  expect(summary).toContain('45s');
});

test('buildSessionSummary includes per-exercise notes', () => {
  const summary = buildSessionSummary(SAMPLE_SESSION);
  expect(summary).toContain('shoulder tight');
});

test('buildSessionSummary includes session notes', () => {
  const summary = buildSessionSummary(SAMPLE_SESSION);
  expect(summary).toContain('felt strong');
});

test('buildExportSummary produces a non-empty string', () => {
  const summary = buildExportSummary([SAMPLE_SESSION], []);
  expect(typeof summary).toBe('string');
  expect(summary.length).toBeGreaterThan(50);
  expect(summary).toContain('Arm A');
});
