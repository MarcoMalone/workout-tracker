// tests/claude-context.test.js
import { buildSessionSummary, buildExportSummary, parseGoalSuggestions, buildRunSummary, buildRunDebriefContext, buildPreWorkoutContext } from '../claude-api.js';

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

// ── run-aware Coach ───────────────────────────────────────────────────────────
const SAMPLE_RUN = {
  id: 'r1', date: '2026-08-27', distanceMiles: 5.2, durationMinutes: 48, paceMinPerMile: 9.23,
  avgHr: 152, maxHr: 171, avgCadence: 84, perceivedEffort: 6, source: 'strava',
  stravaDetail: { splits: [{ paceMinPerMile: 9.0 }, { paceMinPerMile: 9.0 }, { paceMinPerMile: 9.5 }, { paceMinPerMile: 9.6 }] },
};

test('buildRunSummary includes distance, mm:ss pace, HR, cadence x2, effort', () => {
  const s = buildRunSummary(SAMPLE_RUN);
  expect(s).toContain('5.2 mi');
  expect(s).toContain('9:14/mi'); // 9.23 min/mi
  expect(s).toContain('HR 152/171');
  expect(s).toContain('168 spm'); // 84 per-leg x2
  expect(s).toContain('effort 6/10');
});

test('buildRunSummary flags a second-half fade from cached splits', () => {
  expect(buildRunSummary(SAMPLE_RUN)).toMatch(/faded \d+s\/mi in the 2nd half/);
});

test('buildRunDebriefContext puts the run under "This run" and excludes it from history', () => {
  const other = { id: 'r0', date: '2026-08-20', distanceMiles: 3.1, paceMinPerMile: 10 };
  const { system, userMessage } = buildRunDebriefContext(SAMPLE_RUN, [SAMPLE_RUN, other], 'Knee: monitor.');
  expect(system).toContain('Knee: monitor.');
  expect(userMessage).toContain('This run:');
  expect(userMessage).toContain('3.1 mi');           // the other run, in history
  expect(userMessage.match(/5\.2 mi/g)).toHaveLength(1); // this run appears once, not duplicated in history
});

test('buildPreWorkoutContext adds a Recent runs block when runs are passed', () => {
  const { userMessage } = buildPreWorkoutContext([SAMPLE_SESSION], 'ready?', '', '', [SAMPLE_RUN]);
  expect(userMessage).toContain('Recent runs:');
  expect(userMessage).toContain('5.2 mi');
});
