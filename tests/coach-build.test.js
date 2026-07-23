import { describe, test, expect } from 'vitest';
import { parsePrescribedWorkout, buildTemplateFromPrescription } from '../claude-api.js';

const DEFS = [
  { id: 'ex-bench', name: 'Dumbbell Bench', bodyPartGroup: 'arms', isTimed: false, isUnilateral: false, isBodyweight: false },
];
// Deterministic id generator for assertions.
const counter = () => { let n = 0; return () => `id${++n}`; };

describe('parsePrescribedWorkout', () => {
  test('parses a JSON object even when wrapped in prose', () => {
    const o = parsePrescribedWorkout('Sure! {"name":"X","bodyPartGroup":"arms","exercises":[{"exerciseId":"ex-bench","sets":3,"reps":10}]} enjoy');
    expect(o.name).toBe('X');
    expect(o.exercises).toHaveLength(1);
  });
  test('returns null for no JSON, bad JSON, or empty exercises', () => {
    expect(parsePrescribedWorkout('no json here')).toBeNull();
    expect(parsePrescribedWorkout('{ not valid }')).toBeNull();
    expect(parsePrescribedWorkout('{"exercises":[]}')).toBeNull();
    expect(parsePrescribedWorkout('')).toBeNull();
  });
});

describe('buildTemplateFromPrescription', () => {
  test('maps a library id and normalizes sets/reps/weight', () => {
    const { template, newExercises } = buildTemplateFromPrescription(
      { name: 'Arm Day', bodyPartGroup: 'arms', exercises: [{ exerciseId: 'ex-bench', sets: 4, reps: 8, weight: 45 }] },
      DEFS, counter()
    );
    expect(newExercises).toHaveLength(0);
    expect(template.exercises[0]).toMatchObject({ exerciseId: 'ex-bench', defaultSets: 4, targetReps: 8, defaultWeight: 45, defaultSeconds: null, order: 0, supersetId: null });
    expect(template.bodyPartGroup).toBe('arms');
  });

  test('weight is null for bodyweight/timed and when unprescribed', () => {
    const { template } = buildTemplateFromPrescription(
      { bodyPartGroup: 'core', exercises: [
        { exerciseId: null, name: 'Plank', isTimed: true, sets: 3, seconds: 40, weight: 999 },     // timed → no weight
        { exerciseId: null, name: 'Push-ups', isBodyweight: true, sets: 3, reps: 20, weight: 999 }, // bodyweight → no weight
        { exerciseId: 'ex-bench', sets: 3, reps: 8 },                                               // loaded, no weight given
      ] },
      DEFS, counter()
    );
    expect(template.exercises[0].defaultWeight).toBeNull();
    expect(template.exercises[1].defaultWeight).toBeNull();
    expect(template.exercises[2].defaultWeight).toBeNull();
  });

  test('reuses an existing exercise by normalized name instead of creating a duplicate', () => {
    // exerciseId null but the name matches an existing def (case/spacing-insensitive)
    const { template, newExercises } = buildTemplateFromPrescription(
      { bodyPartGroup: 'arms', exercises: [{ exerciseId: null, name: 'dumbbell bench', sets: 3, reps: 8 }] },
      DEFS, counter()
    );
    expect(newExercises).toHaveLength(0);
    expect(template.exercises[0].exerciseId).toBe('ex-bench');
  });

  test('parses JSON wrapped in a ```json code fence', () => {
    const o = parsePrescribedWorkout('```json\n{"bodyPartGroup":"arms","exercises":[{"exerciseId":"ex-bench","sets":3,"reps":10}]}\n```');
    expect(o.exercises).toHaveLength(1);
  });

  test('creates a new exercise when exerciseId is null and a name is given', () => {
    const { template, newExercises } = buildTemplateFromPrescription(
      { bodyPartGroup: 'arms', exercises: [{ exerciseId: null, name: 'Push-ups', isBodyweight: true, sets: 3, reps: 20 }] },
      DEFS, counter()
    );
    expect(newExercises).toHaveLength(1);
    expect(newExercises[0]).toMatchObject({ name: 'Push-ups', isBodyweight: true, unit: 'reps', bodyPartGroup: 'arms' });
    expect(template.exercises[0].exerciseId).toBe(newExercises[0].id); // template references the new def
    expect(template.exercises[0].targetReps).toBe(20);
  });

  test('timed exercise gets seconds and null reps; missing values fall back', () => {
    const { template } = buildTemplateFromPrescription(
      { bodyPartGroup: 'core', exercises: [
        { exerciseId: null, name: 'Plank', isTimed: true, sets: 3, seconds: 45 },
        { exerciseId: 'ex-bench' }, // no sets/reps → defaults
      ] },
      DEFS, counter()
    );
    expect(template.exercises[0]).toMatchObject({ targetReps: null, defaultSeconds: 45, defaultSets: 3 });
    expect(template.exercises[1]).toMatchObject({ defaultSets: 3, targetReps: 10 }); // fallbacks
  });

  test('supersetGroup numbers become shared ids; distinct groups differ; null stays null', () => {
    const { template } = buildTemplateFromPrescription(
      { bodyPartGroup: 'arms', exercises: [
        { exerciseId: 'ex-bench', sets: 3, reps: 8, supersetGroup: 1 },
        { exerciseId: null, name: 'Push-ups', isBodyweight: true, sets: 3, reps: 15, supersetGroup: 1 },
        { exerciseId: null, name: 'Curl', sets: 3, reps: 12, supersetGroup: 2 },
        { exerciseId: null, name: 'Fly', sets: 3, reps: 12, supersetGroup: null },
      ] },
      DEFS, counter()
    );
    const [a, b, c, d] = template.exercises;
    expect(a.supersetId).toBeTruthy();
    expect(a.supersetId).toBe(b.supersetId);      // same group → shared
    expect(c.supersetId).not.toBe(a.supersetId);  // different group → different
    expect(d.supersetId).toBeNull();              // ungrouped
  });

  test('drops an unresolvable exercise; returns null when nothing resolves; clamps bad group', () => {
    // unknown id + no name → dropped, leaving one valid exercise
    const ok = buildTemplateFromPrescription(
      { bodyPartGroup: 'chest', exercises: [{ exerciseId: 'ghost' }, { exerciseId: 'ex-bench', sets: 2, reps: 5 }] },
      DEFS, counter()
    );
    expect(ok.template.exercises).toHaveLength(1);
    expect(ok.template.bodyPartGroup).toBe('arms'); // invalid "chest" clamped
    // everything unresolvable → null
    expect(buildTemplateFromPrescription({ exercises: [{ exerciseId: 'ghost' }] }, DEFS, counter())).toBeNull();
  });
});
