// @vitest-environment jsdom
//
// Render smoke test for the Kinetic Log-home overhaul. Mocks app.js (which
// self-inits on import) so we can import ui-log in isolation, then asserts the
// new hero / streak / This-Week bars / cardio buttons / template cards render.
import { vi } from 'vitest';
vi.mock('../app.js', () => ({ switchTab: () => {} }));

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { initDB, _resetForTest, addTemplate, addExercise, saveSession, addWalkLog } from '../db.js';
import { renderLogTab, _resetSessionForTest } from '../ui-log.js';

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

test('discard still works after deleting an exercise', async () => {
  const overlay = await seedSessionAndStart();
  container.querySelector('.exercise-card .ex-remove-btn').click(); // delete one → re-render
  await waitFor(() => container.querySelectorAll('.exercise-card').length === 3);

  container.querySelector('#discard-btn').click();                 // must be wired after re-render
  await waitFor(() => container.querySelector('.log-hero'));

  // discard resets to the Log home (hero present, no session view)
  expect(container.querySelector('.log-hero')).toBeTruthy();
  expect(container.querySelector('.session-name')).toBeFalsy();
  overlay.remove();
});
