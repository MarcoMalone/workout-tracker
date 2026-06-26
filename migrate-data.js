import { addExercise, addTemplate, getTemplate } from './db.js';

const MIGRATE_V = 3;

// All exercise definitions — put() is an upsert, safe to re-run
const ALL_EXERCISES = [
  // === ARM EXERCISES (updated to add isBodyweight where applicable) ===
  { id: 'ex-mn-lat-pulldown', name: 'MN Lat Pulldown', bodyPartGroup: 'arms', equipment: 'machine', machineId: 'A18', unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-semi-pronated-db-curls', name: 'Semi-Pronated DB Curls', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-rear-delt-fly-machine', name: 'Rear Delt Fly Machine', bodyPartGroup: 'arms', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-seated-cable-rows', name: 'Seated Cable Rows', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-hammer-curls', name: 'Hammer Curls', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-reverse-cable-flys', name: 'Reverse Cable Flys', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-dead-hangs', name: 'Dead Hangs', bodyPartGroup: 'arms', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-seated-shoulder-press', name: 'Seated Shoulder Press', bodyPartGroup: 'arms', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-db-bench', name: 'DB Bench', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-push-ups', name: 'Push-Ups', bodyPartGroup: 'arms', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-rope-tricep-pushdowns', name: 'Rope Tricep Pushdowns', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-face-pulls', name: 'Face Pulls', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-pec-flys-machine', name: 'Pec Flys Machine', bodyPartGroup: 'arms', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-single-arm-lateral-raises', name: 'Single-Arm Lateral Raises', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '' },
  { id: 'ex-forearm-rope-rollups', name: 'Forearm Rope Roll-Ups', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },

  // === LEG EXERCISES ===
  { id: 'ex-hip-thrusts', name: 'Hip Thrusts', bodyPartGroup: 'legs', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-rdl', name: 'Romanian Deadlifts', bodyPartGroup: 'legs', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-hamstring-curls', name: 'Hamstring Curls', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-leg-extensions', name: 'Leg Extensions', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-bulgarian-split-squat', name: 'Bulgarian Split Squat', bodyPartGroup: 'legs', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '' },
  { id: 'ex-leg-press', name: 'Leg Press', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-hip-abduction-machine', name: 'Hip Abduction Machine', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-hip-adduction-machine', name: 'Hip Adduction Machine', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-back-extensions', name: 'Back Extensions', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-calf-raises', name: 'Calf Raises', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-copenhagen-adduction', name: 'Copenhagen Adduction', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-weighted-step-ups', name: 'Weighted Step Ups', bodyPartGroup: 'legs', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '' },
  { id: 'ex-curtsy-lateral-lunge', name: 'Curtsy to Lateral Lunge', bodyPartGroup: 'legs', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '' },

  // === CORE EXERCISES ===
  { id: 'ex-cable-crunch', name: 'Cable Crunch', bodyPartGroup: 'core', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-pallof-press', name: 'Pallof Press', bodyPartGroup: 'core', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '' },
  { id: 'ex-dead-bug', name: 'Dead Bug', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-side-plank', name: 'Side Plank', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, isBodyweight: true, notes: '' },
  { id: 'ex-bird-dog', name: 'Bird Dog', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-landmine-rotation', name: 'Landmine Rotation', bodyPartGroup: 'core', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '' },
  { id: 'ex-ab-wheel-rollout', name: 'Ab Wheel Rollout', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },

  // === PT / REHAB EXERCISES ===
  { id: 'ex-butterfly-bridge', name: 'Butterfly Bridge', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-straight-leg-raise-vmo', name: 'Straight Leg Raise (VMO)', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: true, isBodyweight: true, notes: '' },
  { id: 'ex-side-star-plank', name: 'Isometric Side Star Plank', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, isBodyweight: true, notes: '' },
  { id: 'ex-glute-iso-captain-morgan', name: 'Glute Iso (Captain Morgan)', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: true, isBodyweight: true, notes: '' },
  { id: 'ex-hip-ir-stretch', name: 'Hip Internal Rotation Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-happy-baby', name: 'Happy Baby Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-kneeling-hip-flexor-stretch', name: 'Kneeling Hip Flexor Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, isBodyweight: true, notes: '' },
  { id: 'ex-modified-pigeon', name: 'Modified Pigeon Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, isBodyweight: true, notes: '' },

  // === NEW PT EXERCISES for Full PT Session ===
  { id: 'ex-sciatic-nerve-glides', name: 'Supine Sciatic Nerve Glides', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-leg-swings', name: 'Side-to-Side Leg Swings', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-seated-hip-rotations', name: 'Seated Hip Rotations', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-pelvic-floor-elevators', name: 'Pelvic Floor Elevators', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: '5s hold per rep — log as 25s per set (5 reps × 5s)' },
  { id: 'ex-butterfly-pf-stretch', name: 'Butterfly Stretch w/ PF Relaxation', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: '' },
];

const ALL_TEMPLATES = [
  // Arm A — updated with defaultWeight
  {
    id: 'tpl-arm-a',
    name: 'Arm A',
    bodyPartGroup: 'arms',
    createdAt: 1749600000000,
    exercises: [
      { exerciseId: 'ex-mn-lat-pulldown', defaultSets: 3, targetReps: 12, defaultWeight: 110, order: 0 },
      { exerciseId: 'ex-semi-pronated-db-curls', defaultSets: 3, targetReps: 12, defaultWeight: 25, order: 1 },
      { exerciseId: 'ex-rear-delt-fly-machine', defaultSets: 3, targetReps: 12, defaultWeight: 70, order: 2 },
      { exerciseId: 'ex-seated-cable-rows', defaultSets: 3, targetReps: 12, defaultWeight: 80, order: 3 },
      { exerciseId: 'ex-hammer-curls', defaultSets: 3, targetReps: 10, defaultWeight: 25, order: 4 },
      { exerciseId: 'ex-reverse-cable-flys', defaultSets: 3, targetReps: 12, defaultWeight: 50, order: 5 },
      { exerciseId: 'ex-dead-hangs', defaultSets: 3, targetReps: null, defaultSeconds: 30, order: 6 },
    ]
  },

  // Arm B — from June 13 reference workout
  {
    id: 'tpl-arm-b',
    name: 'Arm B',
    bodyPartGroup: 'arms',
    createdAt: 1749772800000,
    exercises: [
      { exerciseId: 'ex-seated-shoulder-press', defaultSets: 3, targetReps: 12, defaultWeight: 85, order: 0 },
      { exerciseId: 'ex-db-bench', defaultSets: 3, targetReps: 12, defaultWeight: 65, order: 1 },
      { exerciseId: 'ex-push-ups', defaultSets: 3, targetReps: 10, order: 2 },
      { exerciseId: 'ex-rope-tricep-pushdowns', defaultSets: 3, targetReps: 12, defaultWeight: 35, order: 3 },
      { exerciseId: 'ex-face-pulls', defaultSets: 3, targetReps: 12, defaultWeight: 30, order: 4 },
      { exerciseId: 'ex-pec-flys-machine', defaultSets: 3, targetReps: 12, defaultWeight: 92.5, order: 5 },
      { exerciseId: 'ex-single-arm-lateral-raises', defaultSets: 6, targetReps: 12, defaultWeight: 10, order: 6 },
      { exerciseId: 'ex-forearm-rope-rollups', defaultSets: 3, targetReps: 12, defaultWeight: 15, order: 7 },
    ]
  },

  // Leg A — glute/hip dominant, corrected order (abduction/adduction between RDL and curls)
  {
    id: 'tpl-leg-a',
    name: 'Leg A',
    bodyPartGroup: 'legs',
    createdAt: 1750896000000,
    exercises: [
      { exerciseId: 'ex-butterfly-bridge', defaultSets: 3, targetReps: 8, order: 0 },
      { exerciseId: 'ex-hip-thrusts', defaultSets: 3, targetReps: 10, defaultWeight: 135, order: 1 },
      { exerciseId: 'ex-rdl', defaultSets: 3, targetReps: 8, defaultWeight: 95, order: 2 },
      // Hip stabilizer machines BETWEEN RDL and hamstring curls to rest the hamstrings
      { exerciseId: 'ex-hip-abduction-machine', defaultSets: 2, targetReps: 15, defaultWeight: 130, order: 3 },
      { exerciseId: 'ex-hip-adduction-machine', defaultSets: 2, targetReps: 15, defaultWeight: 120, order: 4 },
      { exerciseId: 'ex-hamstring-curls', defaultSets: 3, targetReps: 12, defaultWeight: 60, order: 5 },
      // PT finisher — 6 sets total (3 per leg)
      { exerciseId: 'ex-straight-leg-raise-vmo', defaultSets: 6, targetReps: 10, order: 6 },
      // Always last
      { exerciseId: 'ex-back-extensions', defaultSets: 2, targetReps: 12, order: 7 },
    ]
  },

  // Leg B — quad/athletic, reordered to avoid brutal back-to-back compounds
  {
    id: 'tpl-leg-b',
    name: 'Leg B',
    bodyPartGroup: 'legs',
    createdAt: 1750896000000,
    exercises: [
      // PT activation warm-up first — 6 sets (3 per side)
      { exerciseId: 'ex-glute-iso-captain-morgan', defaultSets: 6, targetReps: 5, order: 0 },
      // Heavy compound
      { exerciseId: 'ex-bulgarian-split-squat', defaultSets: 6, targetReps: 10, defaultWeight: 25, order: 1 },
      // Calf raises as active recovery before next quad work
      { exerciseId: 'ex-calf-raises', defaultSets: 3, targetReps: 15, defaultWeight: 50, order: 2 },
      { exerciseId: 'ex-leg-extensions', defaultSets: 3, targetReps: 12, defaultWeight: 70, order: 3 },
      { exerciseId: 'ex-leg-press', defaultSets: 3, targetReps: 10, defaultWeight: 180, order: 4 },
      // Unilateral finisher — 6 sets (3 per side)
      { exerciseId: 'ex-curtsy-lateral-lunge', defaultSets: 6, targetReps: 10, defaultWeight: 15, order: 5 },
      // Timed finisher — 6 sets (3 per side)
      { exerciseId: 'ex-side-star-plank', defaultSets: 6, targetReps: null, defaultSeconds: 20, order: 6 },
    ]
  },

  // Core — anti-rotation focus for pitching
  {
    id: 'tpl-core',
    name: 'Core',
    bodyPartGroup: 'core',
    createdAt: 1750896000000,
    exercises: [
      // Anti-rotation first — 6 sets (3 per side)
      { exerciseId: 'ex-pallof-press', defaultSets: 6, targetReps: 10, defaultWeight: 15, order: 0 },
      { exerciseId: 'ex-cable-crunch', defaultSets: 3, targetReps: 12, defaultWeight: 50, order: 1 },
      { exerciseId: 'ex-dead-bug', defaultSets: 3, targetReps: 10, order: 2 },
      // Timed, unilateral — 6 sets (3 per side)
      { exerciseId: 'ex-side-plank', defaultSets: 6, targetReps: null, defaultSeconds: 30, order: 3 },
      { exerciseId: 'ex-bird-dog', defaultSets: 3, targetReps: 10, order: 4 },
      // Rotational power — 6 sets (3 per side)
      { exerciseId: 'ex-landmine-rotation', defaultSets: 6, targetReps: 10, defaultWeight: 10, order: 5 },
      { exerciseId: 'ex-ab-wheel-rollout', defaultSets: 2, targetReps: 8, order: 6 },
    ]
  },

  // PT Daily — quick daily version (10–15 min)
  {
    id: 'tpl-pt-daily',
    name: 'PT Daily',
    bodyPartGroup: 'legs',
    createdAt: 1750896000000,
    exercises: [
      { exerciseId: 'ex-butterfly-bridge', defaultSets: 3, targetReps: 8, order: 0 },
      // 6 sets = 3 per leg
      { exerciseId: 'ex-straight-leg-raise-vmo', defaultSets: 6, targetReps: 10, order: 1 },
      // 6 sets = 3 per leg
      { exerciseId: 'ex-glute-iso-captain-morgan', defaultSets: 6, targetReps: 5, order: 2 },
      { exerciseId: 'ex-hip-ir-stretch', defaultSets: 2, targetReps: null, defaultSeconds: 30, order: 3 },
      { exerciseId: 'ex-happy-baby', defaultSets: 2, targetReps: null, defaultSeconds: 30, order: 4 },
      // 4 sets = 2 per side
      { exerciseId: 'ex-kneeling-hip-flexor-stretch', defaultSets: 4, targetReps: null, defaultSeconds: 30, order: 5 },
      // 4 sets = 2 per side
      { exerciseId: 'ex-modified-pigeon', defaultSets: 4, targetReps: null, defaultSeconds: 30, order: 6 },
    ]
  },

  // Full PT Session — complete program (~45–60 min)
  {
    id: 'tpl-pt-session',
    name: 'Full PT Session',
    bodyPartGroup: 'legs',
    createdAt: 1750896000000,
    exercises: [
      // Mobility warm-up
      { exerciseId: 'ex-sciatic-nerve-glides', defaultSets: 3, targetReps: 10, order: 0 },
      { exerciseId: 'ex-leg-swings', defaultSets: 3, targetReps: 10, order: 1 },
      { exerciseId: 'ex-seated-hip-rotations', defaultSets: 3, targetReps: 10, order: 2 },
      // PT activation
      { exerciseId: 'ex-butterfly-bridge', defaultSets: 3, targetReps: 8, order: 3 },
      // 6 sets = 3 per leg
      { exerciseId: 'ex-straight-leg-raise-vmo', defaultSets: 6, targetReps: 10, order: 4 },
      // 6 sets = 3 per leg
      { exerciseId: 'ex-glute-iso-captain-morgan', defaultSets: 6, targetReps: 5, order: 5 },
      { exerciseId: 'ex-copenhagen-adduction', defaultSets: 3, targetReps: 10, order: 6 },
      // Strength (PT exercise elevated)
      { exerciseId: 'ex-weighted-step-ups', defaultSets: 6, targetReps: 8, defaultWeight: 25, order: 7 },
      // Pelvic floor — 3 sets × 25s (5 reps × 5s hold)
      { exerciseId: 'ex-pelvic-floor-elevators', defaultSets: 3, targetReps: null, defaultSeconds: 25, order: 8 },
      // Stretching
      { exerciseId: 'ex-hip-ir-stretch', defaultSets: 2, targetReps: null, defaultSeconds: 30, order: 9 },
      { exerciseId: 'ex-happy-baby', defaultSets: 2, targetReps: null, defaultSeconds: 30, order: 10 },
      // 4 sets = 2 per side
      { exerciseId: 'ex-kneeling-hip-flexor-stretch', defaultSets: 4, targetReps: null, defaultSeconds: 30, order: 11 },
      // 4 sets = 2 per side
      { exerciseId: 'ex-modified-pigeon', defaultSets: 4, targetReps: null, defaultSeconds: 30, order: 12 },
      { exerciseId: 'ex-butterfly-pf-stretch', defaultSets: 2, targetReps: null, defaultSeconds: 60, order: 13 },
    ]
  },
];

export async function migrateNewTemplates() {
  const storedV = Number(localStorage.getItem('app_migrate_v') || 0);

  // Always upsert all exercise definitions (safe, idempotent)
  for (const ex of ALL_EXERCISES) await addExercise(ex);

  if (storedV < MIGRATE_V) {
    // v3: force-upsert all templates (adds Forearm Rope Roll-Ups to Arm B)
    for (const tpl of ALL_TEMPLATES) await addTemplate(tpl);
    localStorage.setItem('app_migrate_v', String(MIGRATE_V));
  } else {
    // Only add templates that don't exist yet
    for (const tpl of ALL_TEMPLATES) {
      const existing = await getTemplate(tpl.id);
      if (!existing) await addTemplate(tpl);
    }
  }
}
