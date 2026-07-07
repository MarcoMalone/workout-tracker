import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { initDB, _resetForTest, getTemplates, getExercises } from '../db.js';
import { parseTemplateJSON, importTemplate } from '../template-import.js';

// ── parseTemplateJSON (pure) ──────────────────────────────────────────────────
test('parses a clean template', () => {
  const p = parseTemplateJSON('{"name":"Push","group":"arms","exercises":[{"name":"Bench","sets":3,"reps":8}]}');
  expect(p.name).toBe('Push');
  expect(p.group).toBe('arms');
  expect(p.exercises[0]).toEqual({ name: 'Bench', sets: 3, reps: 8, seconds: null, weight: null });
});

test('tolerates prose around the JSON and defaults group + sets', () => {
  const p = parseTemplateJSON('Here you go!\n{"name":"X","exercises":[{"name":"Y"}]}\nEnjoy');
  expect(p.group).toBe('arms');
  expect(p.exercises[0].sets).toBe(3);
  expect(p.exercises[0].reps).toBeNull();
});

test('invalid group falls back to arms; seconds recognized over reps', () => {
  const p = parseTemplateJSON('{"name":"C","group":"chest","exercises":[{"name":"Plank","seconds":45}]}');
  expect(p.group).toBe('arms');
  expect(p.exercises[0].seconds).toBe(45);
  expect(p.exercises[0].reps).toBeNull();
});

test('throws friendly errors on bad input', () => {
  expect(() => parseTemplateJSON('{"exercises":[{"name":"Y"}]}')).toThrow(/name/);
  expect(() => parseTemplateJSON('{"name":"X","exercises":[]}')).toThrow(/at least one/);
  expect(() => parseTemplateJSON('no json here')).toThrow(/Could not find/);
  expect(() => parseTemplateJSON('{ not valid }')).toThrow(/typo/);
});

// ── importTemplate (DB round-trip) ────────────────────────────────────────────
describe('importTemplate', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    _resetForTest();
    await initDB();
  });

  test('creates missing exercises and adds the template', async () => {
    const parsed = parseTemplateJSON('{"name":"My Push","group":"arms","exercises":[{"name":"Bench Press","sets":3,"reps":8},{"name":"Plank","seconds":45}]}');
    const res = await importTemplate(parsed);
    expect(res.exerciseCount).toBe(2);

    const tpls = await getTemplates();
    expect(tpls).toHaveLength(1);
    expect(tpls[0].name).toBe('My Push');

    const exs = await getExercises();
    expect(exs.some(e => e.name === 'Bench Press')).toBe(true);
    const plank = exs.find(e => e.name === 'Plank');
    expect(plank.isTimed).toBe(true);

    const tEx = tpls[0].exercises.find(x => x.exerciseId === plank.id);
    expect(tEx.defaultSeconds).toBe(45);
    expect(tEx.targetReps).toBeNull();
  });

  test('reuses an existing exercise by name instead of duplicating', async () => {
    await importTemplate(parseTemplateJSON('{"name":"A","group":"arms","exercises":[{"name":"Bench Press","sets":3,"reps":8}]}'));
    await importTemplate(parseTemplateJSON('{"name":"B","group":"arms","exercises":[{"name":"Bench Press","sets":4,"reps":6}]}'));
    const benches = (await getExercises()).filter(e => e.name === 'Bench Press');
    expect(benches).toHaveLength(1);
    expect(await getTemplates()).toHaveLength(2);
  });
});
