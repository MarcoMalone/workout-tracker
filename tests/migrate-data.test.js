import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { initDB, addTemplate, getTemplate, addExercise, getExercise, getSetting, setSetting, _resetForTest } from '../db.js';

// Marco's real device already ran the Jul-2026 legs rework (v3), so the one-time
// force-sync of the canonical leg templates is skipped there — only the targeted
// ensureX patches mutate his existing templates. Set this to reproduce that path;
// without it, a fresh DB force-syncs the canonical templates over any seed.
const REWORK_DONE = () => setSetting('tplSync_legsRework_2026_07_v3', true);
import { migrateNewTemplates } from '../migrate-data.js';

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  _resetForTest();
  await initDB();
});

test('pulldown rotation: patches Arm A pulldown into a 3-grip auto rotation, preserves other slots', async () => {
  await addTemplate({ id: 'tpl-arm-a', name: 'Arm A', bodyPartGroup: 'arms', exercises: [
    { exerciseId: 'ex-mn-lat-pulldown', defaultSets: 3, targetReps: 12, order: 0 },
    { exerciseId: 'ex-pallof-press', defaultSets: 2, targetReps: 10, order: 1 },
  ] });
  await migrateNewTemplates();
  const armA = await getTemplate('tpl-arm-a');
  expect(armA.exercises[0].exerciseId).toBe('ex-cg-lat-pulldown');
  expect(armA.exercises[0].variantIds).toEqual(['ex-cg-lat-pulldown', 'ex-mn-lat-pulldown', 'ex-wg-lat-pulldown']);
  expect(armA.exercises[0].variantMode).toBe('auto');
  expect(armA.exercises[1].exerciseId).toBe('ex-pallof-press'); // untouched
  expect(await getSetting('tplSync_pulldownRotation_2026_07')).toBe(true);
});

test('row rotation: patches Arm A seated-row slot into a close → wide auto rotation', async () => {
  await addTemplate({ id: 'tpl-arm-a', name: 'Arm A', bodyPartGroup: 'arms', exercises: [
    { exerciseId: 'ex-seated-cable-rows', defaultSets: 3, targetReps: 12, order: 0 },
  ] });
  await migrateNewTemplates();
  const slot = (await getTemplate('tpl-arm-a')).exercises[0];
  expect(slot.variantIds).toEqual(['ex-seated-cable-rows', 'ex-wide-grip-row']);
  expect(slot.variantMode).toBe('auto');
  expect(await getSetting('tplSync_rowRotation_2026_07')).toBe(true);
});

test('legs A Nordic: patches Marco\'s goblet slot into the Nordic-curl choice slot, keeps position', async () => {
  await REWORK_DONE();
  await addTemplate({ id: 'tpl-legs-a', name: 'Legs A', bodyPartGroup: 'legs', exercises: [
    { exerciseId: 'ex-bulgarian-split-squat', defaultSets: 3, targetReps: 10, order: 0 },
    { exerciseId: 'ex-sumo-goblet-squat', defaultSets: 3, targetReps: 12, defaultWeight: 25, order: 5 },
  ] });
  await migrateNewTemplates();
  const slot = (await getTemplate('tpl-legs-a')).exercises.find(e => e.order === 5);
  expect(slot.exerciseId).toBe('ex-nordic-hamstring-curl'); // primary
  expect(slot.variantIds).toEqual(['ex-nordic-hamstring-curl', 'ex-single-leg-hamstring-curl']);
  expect(slot.variantMode).toBe('choice');
  expect(slot).toMatchObject({ defaultSets: 3, targetReps: 12, defaultWeight: 30 });
  expect((await getTemplate('tpl-legs-a')).exercises.find(e => e.order === 0).exerciseId).toBe('ex-bulgarian-split-squat'); // preserved
  expect(await getSetting('tplSync_legsANordic_2026_07')).toBe(true);
});

test('legs A Nordic: also patches a leg-press slot (device that never got the goblet swap)', async () => {
  await REWORK_DONE();
  await addTemplate({ id: 'tpl-legs-a', name: 'Legs A', bodyPartGroup: 'legs', exercises: [
    { exerciseId: 'ex-leg-press', defaultSets: 3, targetReps: 12, defaultWeight: 180, order: 5 },
  ] });
  await migrateNewTemplates();
  const slot = (await getTemplate('tpl-legs-a')).exercises.find(e => e.order === 5);
  expect(slot.exerciseId).toBe('ex-nordic-hamstring-curl');
  expect(slot.variantMode).toBe('choice');
});

test('legs B: inserts Leg Press right after Hip Thrusts, everything else slides down', async () => {
  await REWORK_DONE();
  await addTemplate({ id: 'tpl-legs-b', name: 'Legs B', bodyPartGroup: 'legs', exercises: [
    { exerciseId: 'ex-butterfly-bridge', defaultSets: 3, targetReps: 8, order: 0 },
    { exerciseId: 'ex-rdl', defaultSets: 3, targetReps: 8, order: 1 },
    { exerciseId: 'ex-hip-thrusts', defaultSets: 3, targetReps: 10, order: 2 },
    { exerciseId: 'ex-side-lying-hip-abduction', defaultSets: 3, targetReps: 15, order: 3 },
    { exerciseId: 'ex-back-extensions', defaultSets: 2, targetReps: 12, order: 4 },
  ] });
  await migrateNewTemplates();
  const ids = (await getTemplate('tpl-legs-b')).exercises
    .slice().sort((a, b) => a.order - b.order).map(e => e.exerciseId);
  expect(ids).toEqual([
    'ex-butterfly-bridge', 'ex-rdl', 'ex-hip-thrusts', 'ex-leg-press',
    'ex-side-lying-hip-abduction', 'ex-back-extensions',
  ]);
  const lp = (await getTemplate('tpl-legs-b')).exercises.find(e => e.exerciseId === 'ex-leg-press');
  expect(lp).toMatchObject({ defaultSets: 3, targetReps: 12, defaultWeight: 180, order: 3 });
  expect(await getSetting('tplSync_legsBLegPress_2026_07')).toBe(true);
});

test('legs B leg-press: idempotent — does not double-insert if leg press already present', async () => {
  await REWORK_DONE();
  await addTemplate({ id: 'tpl-legs-b', name: 'Legs B', bodyPartGroup: 'legs', exercises: [
    { exerciseId: 'ex-hip-thrusts', defaultSets: 3, targetReps: 10, order: 0 },
    { exerciseId: 'ex-leg-press', defaultSets: 3, targetReps: 12, order: 1 },
  ] });
  await migrateNewTemplates();
  const count = (await getTemplate('tpl-legs-b')).exercises.filter(e => e.exerciseId === 'ex-leg-press').length;
  expect(count).toBe(1);
});

test('tricep choice: turns Arm B pushdown slot into a choice slot defaulting to overhead', async () => {
  await addTemplate({ id: 'tpl-arm-b', name: 'Arm B', bodyPartGroup: 'arms', exercises: [
    { exerciseId: 'ex-db-bench', defaultSets: 3, targetReps: 12, order: 0 },
    { exerciseId: 'ex-rope-tricep-pushdowns', defaultSets: 3, targetReps: 12, order: 1 },
  ] });
  await migrateNewTemplates();
  const armB = await getTemplate('tpl-arm-b');
  const slot = armB.exercises[1];
  expect(slot.exerciseId).toBe('ex-overhead-tricep-extension'); // primary = overhead
  expect(slot.variantIds).toEqual(['ex-overhead-tricep-extension', 'ex-rope-tricep-pushdowns']);
  expect(slot.variantMode).toBe('choice');
  expect(armB.exercises[0].exerciseId).toBe('ex-db-bench'); // preserved
  expect(await getSetting('tplSync_tricepChoice_2026_07')).toBe(true);
});

test('pulldown rotation: runs once — a later-added Arm A is not re-patched', async () => {
  await migrateNewTemplates(); // no Arm A present → flag set, no-op
  expect(await getSetting('tplSync_pulldownRotation_2026_07')).toBe(true);
  await addTemplate({ id: 'tpl-arm-a', name: 'Arm A', bodyPartGroup: 'arms', exercises: [{ exerciseId: 'ex-mn-lat-pulldown', order: 0 }] });
  await migrateNewTemplates(); // flag already set → skip
  const armA = await getTemplate('tpl-arm-a');
  expect(armA.exercises[0].variantIds).toBeUndefined();
});

test('pulldown rotation: skips a slot already made into a rotation', async () => {
  await addTemplate({ id: 'tpl-arm-a', name: 'Arm A', bodyPartGroup: 'arms', exercises: [
    { exerciseId: 'ex-mn-lat-pulldown', variantIds: ['ex-mn-lat-pulldown', 'ex-wg-lat-pulldown'], variantMode: 'choice', order: 0 },
  ] });
  await migrateNewTemplates();
  const armA = await getTemplate('tpl-arm-a');
  expect(armA.exercises[0].variantMode).toBe('choice'); // user's own rotation left intact
});

test('library refresh preserves user-owned fields on an exercise def, repo still wins on the rest', async () => {
  // A def as it looks after Marco saves a machine setup in the log tab, plus a stale name.
  await addExercise({
    id: 'ex-hamstring-curls', name: 'Hammy Curls (old name)', bodyPartGroup: 'legs',
    equipment: 'machine', unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false,
    setupNotes: 'seat 4, pad at the ankle bone', startSide: 'R', variationGroupId: 'grp-mine',
  });
  await migrateNewTemplates();
  const ex = await getExercise('ex-hamstring-curls');
  // User-owned fields survive the every-launch library refresh.
  expect(ex.setupNotes).toBe('seat 4, pad at the ankle bone');
  expect(ex.startSide).toBe('R');
  expect(ex.variationGroupId).toBe('grp-mine');
  // Repo-owned fields are still refreshed.
  expect(ex.name).toBe('Hamstring Curls');
});

test('library refresh: a def that is not in the DB yet is created from the repo', async () => {
  await migrateNewTemplates();
  const ex = await getExercise('ex-rdl-db');
  expect(ex.name).toBe('Romanian Deadlift (Dumbbell)');
  expect(ex.isUnilateral).toBe(false); // must match ex-rdl or swapping rewrites the set rows
  expect(ex.unit).toBe('lbs');
});

test('legs B RDL: becomes a Smith ⇄ dumbbell choice slot, Smith stays the default', async () => {
  await REWORK_DONE();
  await addTemplate({ id: 'tpl-legs-b', name: 'Legs B', bodyPartGroup: 'legs', exercises: [
    { exerciseId: 'ex-rdl', defaultSets: 3, targetReps: 8, defaultWeight: 95, order: 0 },
    { exerciseId: 'ex-hip-thrusts', defaultSets: 3, targetReps: 10, order: 1 },
  ] });
  await migrateNewTemplates();
  const slot = (await getTemplate('tpl-legs-b')).exercises.find(e => e.exerciseId === 'ex-rdl');
  expect(slot.variantIds).toEqual(['ex-rdl', 'ex-rdl-db']);
  expect(slot.variantMode).toBe('choice');
  expect(slot.defaultWeight).toBe(95); // slot defaults untouched
  expect(await getSetting('tplSync_legsBDbRdl_2026_09')).toBe(true);
});

test('legs B RDL: leaves a slot alone if it already carries its own rotation', async () => {
  await REWORK_DONE();
  await addTemplate({ id: 'tpl-legs-b', name: 'Legs B', bodyPartGroup: 'legs', exercises: [
    { exerciseId: 'ex-rdl', variantIds: ['ex-rdl', 'ex-hip-thrusts'], variantMode: 'auto', order: 0 },
  ] });
  await migrateNewTemplates();
  const slot = (await getTemplate('tpl-legs-b')).exercises[0];
  expect(slot.variantIds).toEqual(['ex-rdl', 'ex-hip-thrusts']);
  expect(slot.variantMode).toBe('auto');
});

test('arm A: adds the Single-Leg Pallof finisher right after the Pallof slot, before Dead Hangs', async () => {
  await addTemplate({ id: 'tpl-arm-a', name: 'Arm A', bodyPartGroup: 'arms', exercises: [
    { exerciseId: 'ex-cable-crunch', defaultSets: 2, targetReps: 12, order: 0 },
    { exerciseId: 'ex-pallof-press', defaultSets: 2, targetReps: 10, defaultWeight: 15, order: 1 },
    { exerciseId: 'ex-dead-hangs', defaultSets: 3, defaultSeconds: 30, order: 2 },
  ] });
  await migrateNewTemplates();
  const ids = (await getTemplate('tpl-arm-a')).exercises
    .slice().sort((a, b) => a.order - b.order).map(e => e.exerciseId);
  expect(ids).toEqual([
    'ex-cable-crunch', 'ex-pallof-press', 'ex-pallof-press-single-leg', 'ex-dead-hangs',
  ]);
  const sl = (await getTemplate('tpl-arm-a')).exercises.find(e => e.exerciseId === 'ex-pallof-press-single-leg');
  expect(sl).toMatchObject({ defaultSets: 1, targetReps: 10, defaultWeight: 10, order: 2 });
  expect(await getSetting('tplSync_armASingleLegPallof_2026_09')).toBe(true);
});

test('arm A single-leg Pallof: idempotent — never double-inserts', async () => {
  await addTemplate({ id: 'tpl-arm-a', name: 'Arm A', bodyPartGroup: 'arms', exercises: [
    { exerciseId: 'ex-pallof-press', defaultSets: 2, targetReps: 10, order: 0 },
    { exerciseId: 'ex-pallof-press-single-leg', defaultSets: 1, targetReps: 10, order: 1 },
  ] });
  await migrateNewTemplates();
  const slots = (await getTemplate('tpl-arm-a')).exercises.filter(e => e.exerciseId === 'ex-pallof-press-single-leg');
  expect(slots).toHaveLength(1);
});

test('single-leg Pallof def: unilateral and lbs, so it generates its own L/R pair', async () => {
  await migrateNewTemplates();
  const ex = await getExercise('ex-pallof-press-single-leg');
  expect(ex.name).toBe('Single-Leg Pallof Press');
  expect(ex.isUnilateral).toBe(true);
  expect(ex.unit).toBe('lbs');
  expect(ex.bodyPartGroup).toBe('core');
});
