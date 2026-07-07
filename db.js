import { openDB } from 'https://esm.sh/idb@8';

let _db = null;

export async function initDB() {
  if (_db) return _db;
  _db = await openDB('workout-tracker', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const exStore = db.createObjectStore('exercise_definitions', { keyPath: 'id' });
        exStore.createIndex('bodyPartGroup', 'bodyPartGroup');

        const tplStore = db.createObjectStore('workout_templates', { keyPath: 'id' });
        tplStore.createIndex('bodyPartGroup', 'bodyPartGroup');

        const sessStore = db.createObjectStore('logged_sessions', { keyPath: 'id' });
        sessStore.createIndex('date', 'date');
        sessStore.createIndex('bodyPartGroup', 'bodyPartGroup');

        const runStore = db.createObjectStore('run_logs', { keyPath: 'id' });
        runStore.createIndex('date', 'date');

        db.createObjectStore('app_settings');
      }
      if (oldVersion < 2) {
        const walkStore = db.createObjectStore('walk_logs', { keyPath: 'id' });
        walkStore.createIndex('date', 'date');
      }
    }
  });
  return _db;
}

// For test isolation only — resets the cached DB handle so initDB() reopens fresh.
export function _resetForTest() {
  if (_db) { _db.close(); }
  _db = null;
}

async function db() { return _db || initDB(); }

// ─── Settings ────────────────────────────────────────────────────────────────
export async function getSetting(key) {
  const val = await (await db()).get('app_settings', key);
  return val !== undefined ? val : null;
}
export async function setSetting(key, value) {
  return (await db()).put('app_settings', value, key);
}

// ─── Exercise definitions ─────────────────────────────────────────────────────
export async function addExercise(exercise) {
  return (await db()).put('exercise_definitions', exercise);
}
export async function getExercises(bodyPartGroup = null) {
  const d = await db();
  if (bodyPartGroup) return d.getAllFromIndex('exercise_definitions', 'bodyPartGroup', bodyPartGroup);
  return d.getAll('exercise_definitions');
}
export async function getExercise(id) {
  return (await db()).get('exercise_definitions', id);
}
export async function deleteExercise(id) {
  return (await db()).delete('exercise_definitions', id);
}

// ─── Workout templates ────────────────────────────────────────────────────────
export async function addTemplate(template) {
  return (await db()).put('workout_templates', template);
}
export async function getTemplates(bodyPartGroup = null) {
  const d = await db();
  if (bodyPartGroup) return d.getAllFromIndex('workout_templates', 'bodyPartGroup', bodyPartGroup);
  return d.getAll('workout_templates');
}
export async function getTemplate(id) {
  return (await db()).get('workout_templates', id);
}
export async function deleteTemplate(id) {
  return (await db()).delete('workout_templates', id);
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
export async function saveSession(session) {
  return (await db()).put('logged_sessions', session);
}
export async function deleteSession(id) {
  return (await db()).delete('logged_sessions', id);
}
export async function getSession(id) {
  return (await db()).get('logged_sessions', id);
}
export async function getSessionsByBodyPart(bodyPartGroup, limit = 20) {
  const all = await (await db()).getAllFromIndex('logged_sessions', 'bodyPartGroup', bodyPartGroup);
  return all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
export async function getAllSessions(limit = 100) {
  const all = await (await db()).getAll('logged_sessions');
  return all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

// Returns { sets, date, exerciseName } for the most recent session containing exerciseId.
// Used by the Log tab to display the previous session's data as a reference.
export async function getLastSessionForExercise(exerciseId) {
  const all = await (await db()).getAll('logged_sessions');
  const sorted = all.sort((a, b) => b.date.localeCompare(a.date));
  for (const session of sorted) {
    const match = session.exercises.find(e => e.exerciseId === exerciseId);
    if (match) return { sets: match.sets, date: session.date, exerciseName: match.exerciseName };
  }
  return null;
}

// Returns sessions containing exerciseId, newest first, up to limit.
// Used for exercise-level progress charts.
export async function getSessionsForExercise(exerciseId, limit = 12) {
  const all = await (await db()).getAll('logged_sessions');
  return all
    .filter(s => s.exercises.some(e => e.exerciseId === exerciseId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(s => ({ date: s.date, exercise: s.exercises.find(e => e.exerciseId === exerciseId) }));
}

// ─── Run logs ─────────────────────────────────────────────────────────────────
export async function addRunLog(run) {
  return (await db()).put('run_logs', run);
}
export async function getRunLogs(limit = 20) {
  const all = await (await db()).getAll('run_logs');
  return all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
export async function deleteRunLog(id) {
  return (await db()).delete('run_logs', id);
}

// ─── Walk logs ────────────────────────────────────────────────────────────────
export async function addWalkLog(walk) {
  return (await db()).put('walk_logs', walk);
}
export async function getWalkLogs(limit = 20) {
  const all = await (await db()).getAll('walk_logs');
  return all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
export async function deleteWalkLog(id) {
  return (await db()).delete('walk_logs', id);
}

// ─── Backup / Restore ───────────────────────────────────────────────────────
const BACKUP_STORES = ['exercise_definitions', 'workout_templates', 'logged_sessions', 'run_logs', 'walk_logs'];
// Settings that must NEVER leave the device in a backup file (e.g. the API key).
const SECRET_SETTINGS = ['anthropicApiKey'];

// Snapshot every store into a plain object. app_settings is emitted as a
// key→value map (it's a keyless store) minus any secrets. The API key is
// intentionally excluded so a backup file can be shared/stored safely.
export async function exportAllData() {
  const d = await db();
  const data = { app: 'workout-tracker', schema: 2, exportedAt: new Date().toISOString(), stores: {} };
  for (const s of BACKUP_STORES) data.stores[s] = await d.getAll(s);
  const settings = {};
  for (const k of await d.getAllKeys('app_settings')) {
    if (SECRET_SETTINGS.includes(k)) continue;
    settings[k] = await d.get('app_settings', k);
  }
  data.stores.app_settings = settings;
  return data;
}

// Restore a snapshot produced by exportAllData(). Upserts by key (nothing is
// deleted unless {replace:true}). The API key is never imported. Returns a
// per-store count of records written.
export async function importAllData(data, { replace = false } = {}) {
  if (!data || data.app !== 'workout-tracker' || typeof data.stores !== 'object') {
    throw new Error('That file is not a valid workout-tracker backup.');
  }
  const d = await db();
  const counts = {};
  for (const s of BACKUP_STORES) {
    const arr = Array.isArray(data.stores[s]) ? data.stores[s] : [];
    if (replace) await d.clear(s);
    for (const rec of arr) await d.put(s, rec);
    counts[s] = arr.length;
  }
  const settings = (data.stores.app_settings && typeof data.stores.app_settings === 'object') ? data.stores.app_settings : {};
  let sc = 0;
  for (const [k, v] of Object.entries(settings)) {
    if (SECRET_SETTINGS.includes(k)) continue;
    await d.put('app_settings', v, k);
    sc++;
  }
  counts.app_settings = sc;
  return counts;
}

// ─── Seed data ────────────────────────────────────────────────────────────────
import { SEED_EXERCISES, SEED_TEMPLATES } from './seed-data.js';

export async function seedIfEmpty() {
  const [exercises, templates] = await Promise.all([getExercises(), getTemplates()]);
  if (exercises.length === 0) for (const ex of SEED_EXERCISES) await addExercise(ex);
  if (templates.length === 0) for (const tpl of SEED_TEMPLATES) await addTemplate(tpl);
}
