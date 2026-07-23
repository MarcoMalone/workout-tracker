import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { initDB, addTemplate, getTemplate, getSetting, _resetForTest } from '../db.js';
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
