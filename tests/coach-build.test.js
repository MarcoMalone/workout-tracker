import { describe, test, expect } from 'vitest';
import { parsePrescribedWorkout, buildTemplateFromPrescription, buildPrescribedWorkoutPrompt, formatSavedWorkouts } from '../claude-api.js';

const DEFS = [
  { id: 'ex-bench', name: 'Dumbbell Bench', bodyPartGroup: 'arms', isTimed: false, isUnilateral: false, isBodyweight: false },
];

describe('formatSavedWorkouts / builder sees templates', () => {
  const DEFS2 = [
    { id: 'ex-adduction', name: 'Hip Adduction', bodyPartGroup: 'legs', isUnilateral: false },
    { id: 'ex-bulg', name: 'Bulgarian Split Squat', bodyPartGroup: 'legs', isUnilateral: true },
    { id: 'ex-plank', name: 'Plank', bodyPartGroup: 'core', isTimed: true },
  ];
  const TEMPLATES = [
    { name: 'Legs A', bodyPartGroup: 'legs', exercises: [
      { exerciseId: 'ex-adduction', defaultSets: 2, targetReps: 15, order: 0 },
      { exerciseId: 'ex-bulg', defaultSets: 3, targetReps: 10, order: 1, supersetId: 'ss1' },
      { exerciseId: 'ex-plank', defaultSets: 3, defaultSeconds: 40, order: 2, supersetId: 'ss1' },
    ] },
  ];

  test('renders each template with names, per-side, timed, and superset markers', () => {
    const out = formatSavedWorkouts(TEMPLATES, DEFS2);
    expect(out).toContain('Legs A (legs):');
    expect(out).toContain('Hip Adduction 2×15');
    expect(out).toContain('Bulgarian Split Squat 3×10/side'); // unilateral → /side
    expect(out).toContain('Plank 3×40s');                     // timed → seconds
    expect(out).toContain('+');                                // supersetted move marked
  });

  test('empty templates → empty string (no SAVED WORKOUTS block)', () => {
    expect(formatSavedWorkouts([], DEFS2)).toBe('');
    expect(formatSavedWorkouts(undefined, DEFS2)).toBe('');
  });

  test('buildPrescribedWorkoutPrompt embeds the saved workouts in the user message', () => {
    const { userMessage } = buildPrescribedWorkoutPrompt('combine Legs A and Legs B', DEFS2, '', '', TEMPLATES);
    expect(userMessage).toContain('SAVED WORKOUTS');
    expect(userMessage).toContain('Legs A (legs):');
    expect(userMessage).toContain('combine Legs A and Legs B');
  });

  test('no templates → prompt has no SAVED WORKOUTS section but still has the request', () => {
    const { userMessage } = buildPrescribedWorkoutPrompt('arm day', DEFS2, '', '', []);
    expect(userMessage).not.toContain('SAVED WORKOUTS');
    expect(userMessage).toContain('arm day');
  });
});
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
