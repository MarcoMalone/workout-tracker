// fake-indexeddb/auto installs all IDB globals (indexedDB, IDBRequest, IDBFactory, etc.)
// into globalThis so the idb library can use them in Node.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { initDB, getSetting, setSetting, addExercise, getExercises,
         addTemplate, getTemplates, saveSession, getSessionsByBodyPart,
         getLastSessionForExercise, addRunLog, getRunLogs, deleteRunLog,
         addWalkLog, getWalkLogs, deleteWalkLog, getTemplate,
         exportAllData, importAllData, getReadiness, saveReadiness,
         getGoals, saveGoals, getGoalLog, setGoalProgress, getPainLog, setPain,
         seedIfEmpty, _resetForTest, dataVersion,
         getExerciseUsageCounts, mergeExercises } from '../db.js';

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

test('mergeExercises: repoints logged sets + templates onto the keeper and deletes the rest', async () => {
  await addExercise({ id: 'ex-keep', name: 'Seated Cable Rows', bodyPartGroup: 'arms', unit: 'lbs' });
  await addExercise({ id: 'ex-dupe', name: 'Cable Row', bodyPartGroup: 'arms', unit: 'lbs' });
  await saveSession({ id: 's-1', date: '2026-07-01', bodyPartGroup: 'arms',
    exercises: [{ exerciseId: 'ex-dupe', exerciseName: 'Cable Row', sets: [{ weight: 80, reps: 10 }] }] });
  await addTemplate({ id: 'tpl-1', name: 'Arm A', bodyPartGroup: 'arms',
    exercises: [{ exerciseId: 'ex-dupe', defaultSets: 3, targetReps: 10, order: 0 }] });

  const before = await getExerciseUsageCounts();
  expect(before['ex-dupe']).toBe(1);

  const res = await mergeExercises('ex-keep', ['ex-dupe']);
  expect(res).toMatchObject({ sessions: 1, templates: 1, removed: 1 });

  // Definition removed, and both the session and template now point at the keeper.
  expect((await getExercises()).map(e => e.id)).toEqual(['ex-keep']);
  const usage = await getExerciseUsageCounts();
  expect(usage['ex-keep']).toBe(1);
  expect(usage['ex-dupe']).toBeUndefined();
  const sess = await getSessionsByBodyPart('arms');
  expect(sess[0].exercises[0].exerciseId).toBe('ex-keep');
  expect(sess[0].exercises[0].exerciseName).toBe('Seated Cable Rows');
  const tpl = await getTemplate('tpl-1');
  expect(tpl.exercises[0].exerciseId).toBe('ex-keep');
});

test('mergeExercises: throws if the keeper is gone, no-ops with empty fromIds', async () => {
  await addExercise({ id: 'ex-a', name: 'A', bodyPartGroup: 'arms', unit: 'lbs' });
  await expect(mergeExercises('ex-missing', ['ex-a'])).rejects.toThrow();
  expect(await mergeExercises('ex-a', [])).toMatchObject({ removed: 0 });
  expect(await mergeExercises('ex-a', ['ex-a'])).toMatchObject({ removed: 0 }); // self-merge is a no-op
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

test('deleteRunLog removes a run', async () => {
  await addRunLog({ id: 'r-1', date: '2026-06-15', distanceMiles: 2.5, durationMinutes: 28, paceMinPerMile: 11.2, perceivedEffort: 6, notes: '', bodyPartGroup: 'legs' });
  await addRunLog({ id: 'r-2', date: '2026-06-16', distanceMiles: 3, durationMinutes: 33, paceMinPerMile: 11, perceivedEffort: 5, notes: '', bodyPartGroup: 'legs' });
  await deleteRunLog('r-1');
  const runs = await getRunLogs();
  expect(runs).toHaveLength(1);
  expect(runs[0].id).toBe('r-2');
});

test('addRunLog upserts on matching id (edit round-trip)', async () => {
  await addRunLog({ id: 'r-1', date: '2026-06-15', distanceMiles: 2.5, durationMinutes: 28, paceMinPerMile: 11.2, perceivedEffort: 6, notes: 'first', bodyPartGroup: 'legs' });
  await addRunLog({ id: 'r-1', date: '2026-06-20', distanceMiles: 2.5, durationMinutes: 28, paceMinPerMile: 11.2, perceivedEffort: 6, notes: 'edited', workoutContext: 'Recovery', bodyPartGroup: 'legs' });
  const runs = await getRunLogs();
  expect(runs).toHaveLength(1);
  expect(runs[0].date).toBe('2026-06-20');
  expect(runs[0].notes).toBe('edited');
  expect(runs[0].workoutContext).toBe('Recovery');
});

test('addWalkLog and getWalkLogs', async () => {
  const walk = { id: 'w-1', date: '2026-06-18', durationMinutes: 90, speedMph: 2.2, distanceMiles: 3.3, calories: 450, notes: 'good session' };
  await addWalkLog(walk);
  const walks = await getWalkLogs();
  expect(walks).toHaveLength(1);
  expect(walks[0].distanceMiles).toBe(3.3);
  expect(walks[0].speedMph).toBe(2.2);
  expect(walks[0].calories).toBe(450);
});

test('getWalkLogs returns newest first', async () => {
  await addWalkLog({ id: 'w-1', date: '2026-06-10', durationMinutes: 60, speedMph: 2.2, distanceMiles: 2.2, calories: null, notes: '' });
  await addWalkLog({ id: 'w-2', date: '2026-06-18', durationMinutes: 90, speedMph: 2.2, distanceMiles: 3.3, calories: null, notes: '' });
  const walks = await getWalkLogs();
  expect(walks[0].date).toBe('2026-06-18');
  expect(walks[1].date).toBe('2026-06-10');
});

test('deleteWalkLog removes a walk', async () => {
  await addWalkLog({ id: 'w-1', date: '2026-06-10', durationMinutes: 60, speedMph: 2.2, distanceMiles: 2.2, calories: null, notes: '' });
  await addWalkLog({ id: 'w-2', date: '2026-06-18', durationMinutes: 90, speedMph: 2.2, distanceMiles: 3.3, calories: null, notes: '' });
  await deleteWalkLog('w-2');
  const walks = await getWalkLogs();
  expect(walks).toHaveLength(1);
  expect(walks[0].id).toBe('w-1');
});

test('addWalkLog upserts with editable notes and context tag', async () => {
  await addWalkLog({ id: 'w-1', date: '2026-06-10', durationMinutes: 60, speedMph: 2.2, distanceMiles: 2.2, calories: null, notes: 'first' });
  await addWalkLog({ id: 'w-1', date: '2026-06-10', durationMinutes: 60, speedMph: 2.2, distanceMiles: 2.2, calories: null, notes: 'edited', workoutContext: 'Tired' });
  const walks = await getWalkLogs();
  expect(walks).toHaveLength(1);
  expect(walks[0].notes).toBe('edited');
  expect(walks[0].workoutContext).toBe('Tired');
});

// ─── Backup / Restore ─────────────────────────────────────────────────────────
async function seedBackupFixture() {
  await addExercise({ id: 'ex-1', name: 'Curl', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' });
  await addTemplate({ id: 't-1', name: 'Arm A', bodyPartGroup: 'arms', createdAt: 1, exercises: [{ exerciseId: 'ex-1', defaultSets: 3, targetReps: 12, order: 0 }] });
  await saveSession({ id: 's-1', templateId: 't-1', templateName: 'Arm A', bodyPartGroup: 'arms', date: '2026-06-11', startedAt: 1, finishedAt: 2, preChecklist: {}, postChecklist: {}, sessionNotes: '', exercises: [] });
  await addRunLog({ id: 'r-1', date: '2026-06-15', distanceMiles: 2.5, durationMinutes: 28, paceMinPerMile: 11.2, perceivedEffort: 6, notes: '', bodyPartGroup: 'legs' });
  await addWalkLog({ id: 'w-1', date: '2026-06-18', durationMinutes: 90, speedMph: 2.2, distanceMiles: 3.3, calories: 450, notes: '' });
  await setSetting('healthContext', 'baseball player, hip PT');
  await setSetting('anthropicApiKey', 'sk-ant-SECRET');
}

test('exportAllData snapshots every store and excludes the API key', async () => {
  await seedBackupFixture();
  const data = await exportAllData();
  expect(data.app).toBe('workout-tracker');
  expect(data.stores.logged_sessions).toHaveLength(1);
  expect(data.stores.run_logs).toHaveLength(1);
  expect(data.stores.walk_logs).toHaveLength(1);
  expect(data.stores.workout_templates).toHaveLength(1);
  // settings are preserved EXCEPT the secret key
  expect(data.stores.app_settings.healthContext).toBe('baseball player, hip PT');
  expect(data.stores.app_settings.anthropicApiKey).toBeUndefined();
  // and the key must not appear anywhere in the serialized backup
  expect(JSON.stringify(data)).not.toContain('sk-ant-SECRET');
});

test('importAllData restores a snapshot into an empty database', async () => {
  await seedBackupFixture();
  const data = await exportAllData();

  // wipe everything
  globalThis.indexedDB = new IDBFactory();
  _resetForTest();
  await initDB();
  expect(await getWalkLogs()).toHaveLength(0);

  const counts = await importAllData(data);
  expect(counts.logged_sessions).toBe(1);
  expect(await getWalkLogs()).toHaveLength(1);
  expect(await getRunLogs()).toHaveLength(1);
  expect((await getTemplate('t-1')).name).toBe('Arm A');
  expect(await getSetting('healthContext')).toBe('baseball player, hip PT');
});

test('importAllData never writes an API key, even if the file contains one', async () => {
  const malicious = { app: 'workout-tracker', stores: { app_settings: { anthropicApiKey: 'sk-ant-INJECTED', healthContext: 'x' } } };
  await importAllData(malicious);
  expect(await getSetting('anthropicApiKey')).toBeNull();
  expect(await getSetting('healthContext')).toBe('x');
});

test('importAllData rejects a non-backup file', async () => {
  await expect(importAllData({ foo: 'bar' })).rejects.toThrow(/valid workout-tracker backup/);
});

// ─── Readiness ────────────────────────────────────────────────────────────────
test('saveReadiness / getReadiness round-trip by date', async () => {
  await saveReadiness('2026-07-07', { sleep: 4, energy: 3, soreness: 2, mood: 4 });
  expect(await getReadiness('2026-07-07')).toEqual({ sleep: 4, energy: 3, soreness: 2, mood: 4 });
  expect(await getReadiness('2026-07-06')).toBeNull();
});

test('readiness log is included in a backup and restores', async () => {
  await saveReadiness('2026-07-07', { sleep: 4, energy: 3, soreness: 2, mood: 4 });
  const data = await exportAllData();
  expect(data.stores.app_settings.readinessLog['2026-07-07'].sleep).toBe(4);

  globalThis.indexedDB = new IDBFactory();
  _resetForTest();
  await initDB();
  await importAllData(data);
  expect(await getReadiness('2026-07-07')).toEqual({ sleep: 4, energy: 3, soreness: 2, mood: 4 });
});

// ─── Goals ────────────────────────────────────────────────────────────────────
test('goals + progress round-trip and ride along in a backup', async () => {
  await saveGoals([{ id: 'g1', title: 'Dead hangs', target: 3, unit: 'hangs' }]);
  await setGoalProgress('g1', '2026-07-07', 2);
  expect((await getGoals())[0].title).toBe('Dead hangs');
  expect((await getGoalLog()).g1['2026-07-07']).toBe(2);

  const data = await exportAllData();
  expect(data.stores.app_settings.goals[0].id).toBe('g1');

  globalThis.indexedDB = new IDBFactory();
  _resetForTest();
  await initDB();
  await importAllData(data);
  expect((await getGoals())[0].target).toBe(3);
  expect((await getGoalLog()).g1['2026-07-07']).toBe(2);
});

test('setGoalProgress clears a day when the count hits zero', async () => {
  await setGoalProgress('g1', '2026-07-07', 2);
  await setGoalProgress('g1', '2026-07-07', 0);
  expect((await getGoalLog()).g1['2026-07-07']).toBeUndefined();
});

// ─── dataVersion (Progress-tab cache invalidation) ────────────────────────────
test('dataVersion bumps on writes that feed Progress, not on settings', async () => {
  const v0 = dataVersion();
  await saveSession({ id: 's1', date: '2026-07-01', bodyPartGroup: 'arms', exercises: [] });
  const v1 = dataVersion();
  expect(v1).toBeGreaterThan(v0);            // a logged session invalidates the cache

  await addRunLog({ id: 'r1', date: '2026-07-01', distanceMiles: 2, durationMinutes: 20 });
  await addWalkLog({ id: 'w1', date: '2026-07-01', durationMinutes: 30, speedMph: 2.2 });
  await addExercise({ id: 'e1', name: 'X', bodyPartGroup: 'arms', unit: 'lbs' });
  const v2 = dataVersion();
  expect(v2).toBeGreaterThan(v1);            // cardio + exercise writes also invalidate

  // Settings-backed data (goals/readiness/pain) does NOT feed Progress charts, so
  // it must NOT invalidate the cache — else the cache would thrash on every goal tap.
  const before = dataVersion();
  await setSetting('theme', 'light');
  await saveGoals([{ id: 'g', title: 'Hang', target: 1 }]);
  await setPain('hips', 4, '', '2026-07-01');
  expect(dataVersion()).toBe(before);
});

// ─── Pain / body map ──────────────────────────────────────────────────────────
test('setPain / getPainLog round-trip; level 0 clears; rides in backup', async () => {
  await setPain('hips', 6, 'right side', '2026-07-07');
  expect((await getPainLog()).hips).toEqual({ level: 6, note: 'right side', date: '2026-07-07' });
  await setPain('hips', 0);
  expect((await getPainLog()).hips).toBeUndefined();

  await setPain('groin', 3, '', '2026-07-07');
  const data = await exportAllData();
  expect(data.stores.app_settings.painLog.groin.level).toBe(3);
});
