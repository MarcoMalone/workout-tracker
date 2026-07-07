export const SEED_EXERCISES = [
  // Arm A exercises (back/biceps day — June 11, 2026)
  { id: 'ex-mn-lat-pulldown', name: 'MN Lat Pulldown', bodyPartGroup: 'arms', equipment: 'machine', machineId: 'A18', unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-semi-pronated-db-curls', name: 'Semi-Pronated DB Curls', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-rear-delt-fly-machine', name: 'Rear Delt Fly Machine', bodyPartGroup: 'arms', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-seated-cable-rows', name: 'Seated Cable Rows', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-hammer-curls', name: 'Hammer Curls', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-reverse-cable-flys', name: 'Reverse Cable Flys', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-dead-hangs', name: 'Dead Hangs', bodyPartGroup: 'arms', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, notes: '' },

  // Arm B exercises (chest/shoulders/triceps day — June 13, 2026)
  { id: 'ex-seated-shoulder-press', name: 'Seated Shoulder Press', bodyPartGroup: 'arms', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-db-bench', name: 'DB Bench', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-push-ups', name: 'Push-Ups', bodyPartGroup: 'arms', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-rope-tricep-pushdowns', name: 'Rope Tricep Pushdowns', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-face-pulls', name: 'Face Pulls', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-pec-flys-machine', name: 'Pec Flys Machine', bodyPartGroup: 'arms', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-single-arm-lateral-raises', name: 'Single-Arm Lateral Raises', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, notes: '' },
];

// New installs start with NO templates — the first-run welcome lets the user
// choose to load the starter splits below, build their own, or paste one in.
export const SEED_TEMPLATES = [];

// "Marco's Starter Splits" — offered on first run. Real exercises and rep
// targets, but NO default weights (a new user fills in their own load). All
// exerciseIds exist in the exercise library (seeded via SEED_EXERCISES + the
// migrate-data upsert, which both run before onboarding).
export const STARTER_TEMPLATES = [
  {
    id: 'tpl-starter-arms',
    name: 'Basic Arms',
    bodyPartGroup: 'arms',
    createdAt: 1749600000000,
    exercises: [
      { exerciseId: 'ex-mn-lat-pulldown', defaultSets: 3, targetReps: 12, order: 0 },
      { exerciseId: 'ex-semi-pronated-db-curls', defaultSets: 3, targetReps: 12, order: 1 },
      { exerciseId: 'ex-seated-shoulder-press', defaultSets: 3, targetReps: 12, order: 2 },
      { exerciseId: 'ex-rope-tricep-pushdowns', defaultSets: 3, targetReps: 12, order: 3 },
      { exerciseId: 'ex-hammer-curls', defaultSets: 3, targetReps: 10, order: 4 },
      { exerciseId: 'ex-face-pulls', defaultSets: 3, targetReps: 12, order: 5 },
      { exerciseId: 'ex-push-ups', defaultSets: 3, targetReps: 10, order: 6 },
    ]
  },
  {
    id: 'tpl-starter-legs',
    name: 'Legs',
    bodyPartGroup: 'legs',
    createdAt: 1749600000001,
    exercises: [
      { exerciseId: 'ex-hip-thrusts', defaultSets: 3, targetReps: 10, order: 0 },
      { exerciseId: 'ex-rdl', defaultSets: 3, targetReps: 8, order: 1 },
      { exerciseId: 'ex-leg-press', defaultSets: 3, targetReps: 10, order: 2 },
      { exerciseId: 'ex-leg-extensions', defaultSets: 3, targetReps: 12, order: 3 },
      { exerciseId: 'ex-hamstring-curls', defaultSets: 3, targetReps: 12, order: 4 },
      { exerciseId: 'ex-calf-raises', defaultSets: 3, targetReps: 15, order: 5 },
    ]
  },
  {
    id: 'tpl-starter-core',
    name: 'My Core Workout',
    bodyPartGroup: 'core',
    createdAt: 1749600000002,
    exercises: [
      { exerciseId: 'ex-pallof-press', defaultSets: 3, targetReps: 10, order: 0 },
      { exerciseId: 'ex-cable-crunch', defaultSets: 3, targetReps: 12, order: 1 },
      { exerciseId: 'ex-dead-bug', defaultSets: 3, targetReps: 10, order: 2 },
      { exerciseId: 'ex-side-plank', defaultSets: 3, targetReps: null, defaultSeconds: 30, order: 3 },
      { exerciseId: 'ex-bird-dog', defaultSets: 3, targetReps: 10, order: 4 },
      { exerciseId: 'ex-ab-wheel-rollout', defaultSets: 2, targetReps: 8, order: 5 },
    ]
  },
];
