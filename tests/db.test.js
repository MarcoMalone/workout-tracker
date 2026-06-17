// fake-indexeddb/auto installs all IDB globals (indexedDB, IDBRequest, IDBFactory, etc.)
// into globalThis so the idb library can use them in Node.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { initDB, getSetting, setSetting, addExercise, getExercises,
         addTemplate, getTemplates, saveSession, getSessionsByBodyPart,
         getLastSessionForExercise, addRunLog, getRunLogs, seedIfEmpty,
         _resetForTest } from '../db.js';

beforeEach(async () => {
  // Replace globalThis.indexedDB with a fresh factory so each test starts
  // with an empty database — prevents data from bleeding across tests.
  globalThis.indexedDB = new IDBFactory();
  _resetForTest();
  await initDB();
});

test('getSetting returns null for unknown key', async () => {
  expect(await getSetting('nonexistent')).toBeNull();
});

test('setSetting and getSetting round-trip', async () => {
  await setSetting('testKey', 'hello');
  expect(await getSetting('testKey')).toBe('hello');
});

test('addExercise and getExercises', async () => {
  const ex = { id: 'ex-1', name: 'Barbell Curl', bodyPartGroup: 'arms', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' };
  await addExercise(ex);
  const all = await getExercises();
  expect(all).toHaveLength(1);
  expect(all[0].name).toBe('Barbell Curl');
});

test('getExercises filters by bodyPartGroup', async () => {
  await addExercise({ id: 'ex-1', name: 'Curl', bodyPartGroup: 'arms', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' });
  await addExercise({ id: 'ex-2', name: 'Squat', bodyPartGroup: 'legs', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' });
  const arms = await getExercises('arms');
  expect(arms).toHaveLength(1);
  expect(arms[0].name).toBe('Curl');
});

test('saveSession and getSessionsByBodyPart', async () => {
  const session = { id: 's-1', templateId: 't-1', templateName: 'Arm A', bodyPartGroup: 'arms', date: '2026-06-11', startedAt: Date.now(), finishedAt: Date.now(), sessionRating: 4, preChecklist: {}, postChecklist: {}, sessionNotes: '', exercises: [] };
  await saveSession(session);
  const sessions = await getSessionsByBodyPart('arms');
  expect(sessions).toHaveLength(1);
  expect(sessions[0].id).toBe('s-1');
});

test('getLastSessionForExercise returns most recent session containing exercise', async () => {
  const s1 = { id: 's-1', templateId: 't-1', templateName: 'Arm A', bodyPartGroup: 'arms', date: '2026-06-01', startedAt: 1, finishedAt: 1, sessionRating: null, preChecklist: {}, postChecklist: {}, sessionNotes: '', exercises: [{ exerciseId: 'ex-1', exerciseName: 'Curl', notes: '', sets: [{ setNumber: 1, weight: 120, reps: 12, seconds: null, side: null, isDropSet: false, parentSetIndex: null }] }] };
  const s2 = { ...s1, id: 's-2', date: '2026-06-11', exercises: [{ exerciseId: 'ex-1', exerciseName: 'Curl', notes: '', sets: [{ setNumber: 1, weight: 130, reps: 12, seconds: null, side: null, isDropSet: false, parentSetIndex: null }] }] };
  await saveSession(s1);
  await saveSession(s2);
  const last = await getLastSessionForExercise('ex-1');
  expect(last.date).toBe('2026-06-11');
  expect(last.sets[0].weight).toBe(130);
});

test('addRunLog and getRunLogs', async () => {
  const run = { id: 'r-1', date: '2026-06-15', distanceMiles: 2.5, durationMinutes: 28, paceMinPerMile: 11.2, perceivedEffort: 6, notes: 'easy run', bodyPartGroup: 'legs' };
  await addRunLog(run);
  const runs = await getRunLogs();
  expect(runs).toHaveLength(1);
  expect(runs[0].distanceMiles).toBe(2.5);
});
