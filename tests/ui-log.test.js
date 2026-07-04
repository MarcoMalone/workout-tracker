// @vitest-environment jsdom
//
// Render smoke test for the Kinetic Log-home overhaul. Mocks app.js (which
// self-inits on import) so we can import ui-log in isolation, then asserts the
// new hero / streak / This-Week bars / cardio buttons / template cards render.
import { vi } from 'vitest';
vi.mock('../app.js', () => ({ switchTab: () => {} }));

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { initDB, _resetForTest, addTemplate, saveSession, addWalkLog } from '../db.js';
import { renderLogTab } from '../ui-log.js';

const flush = () => new Promise(r => setTimeout(r, 0));
let container;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  _resetForTest();
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
