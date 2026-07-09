// @vitest-environment jsdom
//
// Render smoke test for the Kinetic Log-home overhaul. Mocks app.js (which
// self-inits on import) so we can import ui-log in isolation, then asserts the
// new hero / streak / This-Week bars / cardio buttons / template cards render.
import { vi } from 'vitest';
vi.mock('../app.js', () => ({ switchTab: () => {} }));

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { initDB, _resetForTest, addTemplate, addExercise, saveSession, addWalkLog, saveGoals } from '../db.js';
import { renderLogTab, computeAsymmetry, groupExercises, roundSlots, _resetSessionForTest } from '../ui-log.js';

// The base test env's localStorage is a non-functional stub; ui-log now
// transitively imports localStorage-reading modules (wakelock/haptics/help).
const _ls = new Map();
globalThis.localStorage = {
  getItem: k => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => { _ls.set(k, String(v)); },
  removeItem: k => { _ls.delete(k); },
  clear: () => _ls.clear(),
};

const flush = () => new Promise(r => setTimeout(r, 0));
async function waitFor(cond, tries = 60) {
  for (let i = 0; i < tries; i++) { if (cond()) return; await flush(); }
}
let container;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  _resetForTest();
  _resetSessionForTest();
  localStorage.clear(); // isolate the autosaved activeSession between tests
  await initDB();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => container.remove());

test('Log home renders the Kinetic hero, week bars and cardio buttons', async () => {
  await addTemplate({ id: 'tpl-arm-a', name: 'Arm A', bodyPartGroup: 'arms', createdAt: 1, exercises: [] });
  await renderLogTab(container);
  await flush();

  expect(container.querySelector('.log-hero')).toBeTruthy();
  expect(container.querySelector('.log-hero .hero-accent')).toBeTruthy();
  // exactly 7 day bars in the "This Week" strip
  expect(container.querySelectorAll('.week-bar')).toHaveLength(7);
  // cardio buttons present with the new classes
  expect(container.querySelector('#start-run-btn.cardio-run')).toBeTruthy();
  expect(container.querySelector('#start-walk-btn.cardio-walk')).toBeTruthy();
  // template card rendered from the seeded template
  const card = container.querySelector('.template-card .template-name');
  expect(card && card.textContent).toBe('Arm A');
});

test('a workout logged today produces a streak pill and a filled hot bar', async () => {
  await saveSession({
    id: 's-1', templateId: 'tpl-arm-a', templateName: 'Arm A', bodyPartGroup: 'arms',
    date: todayStr(), startedAt: Date.now() - 3600000, finishedAt: Date.now(),
    preChecklist: {}, postChecklist: {}, sessionNotes: '',
    exercises: [{ exerciseId: 'ex-1', exerciseName: 'Curl', notes: '',
      sets: [{ setNumber: 1, weight: 100, reps: 10, seconds: null, side: null, isDropSet: false, parentSetIndex: null }] }]
  });
  await renderLogTab(container);
  await flush();

  const streak = container.querySelector('.log-streak');
  expect(streak).toBeTruthy();
  expect(streak.textContent).toMatch(/\bstreak\b/);
  // the strength day should render a hot (accent) fill
  expect(container.querySelector('.week-bar.hot .fill')).toBeTruthy();
});

test('a cardio-only day counts toward the week without a hot bar', async () => {
  await addWalkLog({ id: 'w-1', date: todayStr(), durationMinutes: 40, speedMph: 2.2, distanceMiles: 1.5, calories: null, notes: '' });
  await renderLogTab(container);
  await flush();

  // week header reports at least one active day
  expect(container.querySelector('.week-hd span').textContent).toMatch(/1 active day\b/);
  // walk alone still lights the streak
  expect(container.querySelector('.log-streak')).toBeTruthy();
  // ...but no strength volume, so no hot bar
  expect(container.querySelector('.week-bar.hot')).toBeFalsy();
});

// Regression: deleting an exercise mid-session must not break the session render
// (root cause was renderActiveSession iterating template.exercises while indexing
// activeSession.exercises — a delete shrank the latter and threw mid-render, so
// discard/add/finish listeners never bound and card names shifted).
async function seedSessionAndStart() {
  for (const [id, name] of [['ex-a', 'Alpha'], ['ex-b', 'Bravo'], ['ex-c', 'Charlie'], ['ex-d', 'Delta']]) {
    await addExercise({ id, name, bodyPartGroup: 'core', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' });
  }
  await addTemplate({
    id: 'tpl-x', name: 'Test Day', bodyPartGroup: 'core', createdAt: 1,
    exercises: ['ex-a', 'ex-b', 'ex-c', 'ex-d'].map((exerciseId, order) =>
      ({ exerciseId, defaultSets: 3, targetReps: 10, defaultWeight: 50, order }))
  });
  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  document.body.appendChild(overlay);
  window.confirm = () => true;

  await renderLogTab(container);
  await flush();
  container.querySelector('.template-card .template-name').click(); // open pre-checklist
  await waitFor(() => overlay.querySelector('#start-session-btn'));
  overlay.querySelector('#start-session-btn').click();              // start the session
  await waitFor(() => container.querySelectorAll('.exercise-card').length === 4);
  return overlay;
}

test('deleting an exercise keeps the session usable (names stay aligned)', async () => {
  const overlay = await seedSessionAndStart();
  expect(container.querySelectorAll('.exercise-card')).toHaveLength(4);

  // delete the first exercise (Alpha)
  container.querySelector('.exercise-card .ex-remove-btn').click();
  await waitFor(() => container.querySelectorAll('.exercise-card').length === 3);

  const cards = container.querySelectorAll('.exercise-card');
  expect(cards).toHaveLength(3);
  // the first remaining card must be Bravo — NOT Alpha's name shifted onto Bravo's data
  expect(cards[0].querySelector('.ex-name').textContent).toContain('Bravo');
  overlay.remove();
});

// ── Daily goals ───────────────────────────────────────────────────────────────
test('daily goals render on the Log home and increment on tap', async () => {
  await saveGoals([{ id: 'g1', title: 'Dead hangs', target: 3, unit: 'hangs' }]);
  await renderLogTab(container);
  await waitFor(() => container.querySelector('.goal-row'));
  expect(container.querySelector('.goal-title').textContent).toBe('Dead hangs');
  expect(container.querySelector('.goal-sub').textContent).toContain('0/3');

  container.querySelector('.goal-inc').click();
  await waitFor(() => container.querySelector('.goal-sub')?.textContent.includes('1/3'));
  expect(container.querySelector('.goal-sub').textContent).toContain('1/3');
});

// ── #2 auto-prefill from last session ─────────────────────────────────────────
test('a new session prefills sets from the last session, not the template default', async () => {
  // prior session for Alpha at 130 lb (template default is 50)
  await addExercise({ id: 'ex-a', name: 'Alpha', bodyPartGroup: 'core', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' });
  await saveSession({
    id: 's-prev', templateId: 'tpl-x', templateName: 'Test Day', bodyPartGroup: 'core',
    date: '2026-06-01', startedAt: 1, finishedAt: 2, preChecklist: {}, postChecklist: {}, sessionNotes: '',
    exercises: [{ exerciseId: 'ex-a', exerciseName: 'Alpha', notes: '', sets: [{ setNumber: 1, weight: 130, reps: 9, seconds: null, side: null, isDropSet: false, parentSetIndex: null }] }]
  });
  const overlay = await seedSessionAndStart();
  const firstWeight = container.querySelector('.exercise-card .w-input');
  expect(firstWeight.value).toBe('130'); // last time's 130, not the template's 50
  overlay.remove();
});

// ── #3 L/R asymmetry ──────────────────────────────────────────────────────────
test('computeAsymmetry flags a >15% side gap and names the weaker side', () => {
  const exDef = { isUnilateral: true, isTimed: false, isBodyweight: false };
  const sessionEx = { sets: [
    { side: 'L', weight: 40, reps: 10 }, { side: 'R', weight: 50, reps: 10 },
  ] };
  expect(computeAsymmetry(sessionEx, exDef)).toEqual({ gap: 20, weaker: 'L' });
});
test('computeAsymmetry returns null under 15% and for non-unilateral / one-sided data', () => {
  const uni = { isUnilateral: true };
  expect(computeAsymmetry({ sets: [{ side: 'L', weight: 48 }, { side: 'R', weight: 50 }] }, uni)).toBeNull();
  expect(computeAsymmetry({ sets: [{ side: 'L', weight: 40 }, { side: 'R', weight: 50 }] }, { isUnilateral: false })).toBeNull();
  expect(computeAsymmetry({ sets: [{ side: 'L', weight: 40 }] }, uni)).toBeNull();
});

test('discard still works after deleting an exercise', async () => {
  const overlay = await seedSessionAndStart();
  container.querySelector('.exercise-card .ex-remove-btn').click(); // delete one → re-render
  await waitFor(() => container.querySelectorAll('.exercise-card').length === 3);

  container.querySelector('#discard-btn').click();                 // must be wired after re-render
  await waitFor(() => document.querySelector('#cf-yes'));          // themed confirm sheet appears
  document.querySelector('#cf-yes').click();                       // confirm the discard
  await waitFor(() => container.querySelector('.log-hero'));

  // discard resets to the Log home (hero present, no session view)
  expect(container.querySelector('.log-hero')).toBeTruthy();
  expect(container.querySelector('.session-name')).toBeFalsy();
  expect(localStorage.getItem('activeSession')).toBeFalsy();       // discard clears the autosave
  overlay.remove();
});

// ── Supersets (round-interleaved) ─────────────────────────────────────────────
test('groupExercises groups consecutive shared supersetIds; singletons stand alone', () => {
  const ex = [
    { supersetId: 'g1' }, { supersetId: 'g1' }, // group of 2
    { supersetId: null },                        // standalone
    { supersetId: 'g2' },                        // lone id → own group of 1
    { supersetId: 'g3' }, { supersetId: 'g3' },  // another group of 2
  ];
  const groups = groupExercises(ex);
  expect(groups.map(g => g.exIdxs)).toEqual([[0, 1], [2], [3], [4, 5]]);
  expect(groups[0].supersetId).toBe('g1');
});

test('groupExercises: same id but non-adjacent does NOT merge across a gap', () => {
  const groups = groupExercises([{ supersetId: 'g1' }, { supersetId: null }, { supersetId: 'g1' }]);
  expect(groups.map(g => g.exIdxs)).toEqual([[0], [1], [2]]);
});

test('roundSlots: each working set opens a slot; drops attach to the slot above', () => {
  const sets = [
    { isDropSet: false }, { isDropSet: true }, { isDropSet: true }, // round 1 + 2 drops
    { isDropSet: false },                                          // round 2, no drop
  ];
  const slots = roundSlots(sets);
  expect(slots).toEqual([
    { workIdx: 0, dropIdxs: [1, 2] },
    { workIdx: 3, dropIdxs: [] },
  ]);
});

async function seedSupersetAndStart() {
  for (const [id, name] of [['ex-a', 'Alpha'], ['ex-b', 'Bravo']]) {
    await addExercise({ id, name, bodyPartGroup: 'core', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' });
  }
  await addTemplate({
    id: 'tpl-ss', name: 'SS Day', bodyPartGroup: 'core', createdAt: 1,
    exercises: [
      { exerciseId: 'ex-a', defaultSets: 2, targetReps: 10, defaultWeight: 50, order: 0, supersetId: 'grp1' },
      { exerciseId: 'ex-b', defaultSets: 2, targetReps: 10, defaultWeight: 50, order: 1, supersetId: 'grp1' },
    ],
  });
  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  document.body.appendChild(overlay);
  window.confirm = () => true;
  await renderLogTab(container);
  await flush();
  container.querySelector('.template-card .template-name').click();
  await waitFor(() => overlay.querySelector('#start-session-btn'));
  overlay.querySelector('#start-session-btn').click();
  await waitFor(() => container.querySelector('.superset-block'));
  return overlay;
}

test('a superset template renders one round-interleaved block, not two cards', async () => {
  const overlay = await seedSupersetAndStart();
  const block = container.querySelector('.superset-block');
  expect(block).toBeTruthy();
  expect(container.querySelectorAll('.exercise-card')).toHaveLength(0); // grouped, not standalone
  expect(block.querySelectorAll('.ss-round')).toHaveLength(2);          // 2 default sets → 2 rounds
  const firstRound = block.querySelector('.ss-round').querySelectorAll('.ss-ex-name');
  expect(firstRound).toHaveLength(2);
  expect(firstRound[0].textContent).toContain('Alpha');                // interleaved in order
  expect(firstRound[1].textContent).toContain('Bravo');
  overlay.remove();
});

test('rest waits for the last exercise in a superset round', async () => {
  const overlay = await seedSupersetAndStart();
  const bar = document.getElementById('rest-timer');
  const exBlocks = container.querySelector('.ss-round').querySelectorAll('.ss-ex');
  // check the FIRST exercise (Alpha, not last) → no rest yet
  exBlocks[0].querySelector('.set-check').click();
  await flush();
  expect(bar.classList.contains('hidden')).toBe(true);
  // check the LAST exercise (Bravo) → rest starts
  exBlocks[1].querySelector('.set-check').click();
  await waitFor(() => !bar.classList.contains('hidden'));
  expect(bar.classList.contains('hidden')).toBe(false);
  overlay.remove();
});

test('linking a card mid-session merges it into a superset block; unlink restores', async () => {
  const overlay = await seedSessionAndStart(); // 4 standalone exercises
  expect(container.querySelectorAll('.exercise-card')).toHaveLength(4);

  // link Bravo (card index 1) with Alpha (the card above)
  container.querySelectorAll('.exercise-card')[1].querySelector('.ex-link-btn').click();
  await waitFor(() => container.querySelector('.superset-block'));
  expect(container.querySelectorAll('.exercise-card')).toHaveLength(2); // Charlie + Delta remain
  const names = container.querySelector('.superset-block .superset-ex-names').textContent.toLowerCase();
  expect(names).toContain('alpha');
  expect(names).toContain('bravo');

  // unlink dissolves the group back into standalone cards
  container.querySelector('.superset-unlink').click();
  await waitFor(() => container.querySelectorAll('.exercise-card').length === 4);
  expect(container.querySelector('.superset-block')).toBeFalsy();
  overlay.remove();
});

test('an in-progress session persists and resumes after a reload', async () => {
  const overlay = await seedSessionAndStart();
  expect(container.querySelectorAll('.exercise-card')).toHaveLength(4);
  expect(localStorage.getItem('activeSession')).toBeTruthy();      // autosaved

  _resetSessionForTest();                                          // simulate reload: in-memory session gone
  await renderLogTab(container);                                   // should rehydrate from localStorage
  await waitFor(() => container.querySelectorAll('.exercise-card').length === 4);
  expect(container.querySelector('.session-name')).toBeTruthy();   // resumed the session…
  expect(container.querySelector('.log-hero')).toBeFalsy();        // …not the home
  expect(container.querySelectorAll('.exercise-card')).toHaveLength(4);
  overlay.remove();
});
