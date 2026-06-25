import { addExercise, addTemplate, getTemplate } from './db.js';

const NEW_EXERCISES = [
  // === LEG EXERCISES ===
  { id: 'ex-hip-thrusts', name: 'Hip Thrusts', bodyPartGroup: 'legs', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-rdl', name: 'Romanian Deadlifts', bodyPartGroup: 'legs', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-hamstring-curls', name: 'Hamstring Curls', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-leg-extensions', name: 'Leg Extensions', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-bulgarian-split-squat', name: 'Bulgarian Split Squat', bodyPartGroup: 'legs', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, notes: '' },
  { id: 'ex-leg-press', name: 'Leg Press', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-hip-abduction-machine', name: 'Hip Abduction Machine', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-hip-adduction-machine', name: 'Hip Adduction Machine', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-back-extensions', name: 'Back Extensions', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-calf-raises', name: 'Calf Raises', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-copenhagen-adduction', name: 'Copenhagen Adduction', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-weighted-step-ups', name: 'Weighted Step Ups', bodyPartGroup: 'legs', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, notes: '' },
  { id: 'ex-curtsy-lateral-lunge', name: 'Curtsy to Lateral Lunge', bodyPartGroup: 'legs', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, notes: '' },

  // === CORE EXERCISES ===
  { id: 'ex-cable-crunch', name: 'Cable Crunch', bodyPartGroup: 'core', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-pallof-press', name: 'Pallof Press', bodyPartGroup: 'core', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, notes: '' },
  { id: 'ex-dead-bug', name: 'Dead Bug', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-side-plank', name: 'Side Plank', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, notes: '' },
  { id: 'ex-bird-dog', name: 'Bird Dog', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-landmine-rotation', name: 'Landmine Rotation', bodyPartGroup: 'core', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, notes: '' },
  { id: 'ex-ab-wheel-rollout', name: 'Ab Wheel Rollout', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },

  // === PT / REHAB EXERCISES ===
  { id: 'ex-butterfly-bridge', name: 'Butterfly Bridge', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  { id: 'ex-straight-leg-raise-vmo', name: 'Straight Leg Raise (VMO)', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, notes: '' },
  { id: 'ex-side-star-plank', name: 'Isometric Side Star Plank', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, notes: '' },
  { id: 'ex-glute-iso-captain-morgan', name: 'Glute Iso (Captain Morgan)', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, notes: '' },
  { id: 'ex-hip-ir-stretch', name: 'Hip Internal Rotation Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, notes: '' },
  { id: 'ex-happy-baby', name: 'Happy Baby Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, notes: '' },
  { id: 'ex-kneeling-hip-flexor-stretch', name: 'Kneeling Hip Flexor Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, notes: '' },
  { id: 'ex-modified-pigeon', name: 'Modified Pigeon Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, notes: '' },
];

const NEW_TEMPLATES = [
  {
    id: 'tpl-leg-a',
    name: 'Leg A',
    bodyPartGroup: 'legs',
    createdAt: 1750896000000,
    exercises: [
      // Glute activation warm-up first
      { exerciseId: 'ex-butterfly-bridge', defaultSets: 3, targetReps: 8, order: 0 },
      // Main compound lifts
      { exerciseId: 'ex-hip-thrusts', defaultSets: 3, targetReps: 10, order: 1 },
      { exerciseId: 'ex-rdl', defaultSets: 3, targetReps: 8, order: 2 },
      { exerciseId: 'ex-hamstring-curls', defaultSets: 3, targetReps: 12, order: 3 },
      // Hip stabilizers
      { exerciseId: 'ex-hip-abduction-machine', defaultSets: 2, targetReps: 15, order: 4 },
      { exerciseId: 'ex-hip-adduction-machine', defaultSets: 2, targetReps: 15, order: 5 },
      // PT finisher
      { exerciseId: 'ex-straight-leg-raise-vmo', defaultSets: 3, targetReps: 10, order: 6 },
      // Always last — fatiguing
      { exerciseId: 'ex-back-extensions', defaultSets: 2, targetReps: 12, order: 7 },
    ]
  },
  {
    id: 'tpl-leg-b',
    name: 'Leg B',
    bodyPartGroup: 'legs',
    createdAt: 1750896000000,
    exercises: [
      // Glute medius activation first (from PT)
      { exerciseId: 'ex-glute-iso-captain-morgan', defaultSets: 3, targetReps: 5, order: 0 },
      // Main compound
      { exerciseId: 'ex-bulgarian-split-squat', defaultSets: 3, targetReps: 10, order: 1 },
      // Isolation
      { exerciseId: 'ex-leg-extensions', defaultSets: 3, targetReps: 12, order: 2 },
      { exerciseId: 'ex-leg-press', defaultSets: 3, targetReps: 10, order: 3 },
      { exerciseId: 'ex-calf-raises', defaultSets: 3, targetReps: 15, order: 4 },
      // PT exercises elevated to strength work
      { exerciseId: 'ex-copenhagen-adduction', defaultSets: 3, targetReps: 10, order: 5 },
      { exerciseId: 'ex-curtsy-lateral-lunge', defaultSets: 3, targetReps: 10, order: 6 },
      // Finisher (timed)
      { exerciseId: 'ex-side-star-plank', defaultSets: 5, targetReps: null, order: 7 },
    ]
  },
  {
    id: 'tpl-core',
    name: 'Core',
    bodyPartGroup: 'core',
    createdAt: 1750896000000,
    exercises: [
      // Anti-rotation first (most important for pitching)
      { exerciseId: 'ex-pallof-press', defaultSets: 3, targetReps: 10, order: 0 },
      // Weighted crunch for progressive overload
      { exerciseId: 'ex-cable-crunch', defaultSets: 3, targetReps: 12, order: 1 },
      // Stability work
      { exerciseId: 'ex-dead-bug', defaultSets: 3, targetReps: 10, order: 2 },
      { exerciseId: 'ex-side-plank', defaultSets: 3, targetReps: null, order: 3 },
      { exerciseId: 'ex-bird-dog', defaultSets: 3, targetReps: 10, order: 4 },
      // Rotational power (pitching-specific)
      { exerciseId: 'ex-landmine-rotation', defaultSets: 3, targetReps: 10, order: 5 },
      // Total core challenge finisher
      { exerciseId: 'ex-ab-wheel-rollout', defaultSets: 2, targetReps: 8, order: 6 },
    ]
  },
  {
    id: 'tpl-pt-daily',
    name: 'PT Daily',
    bodyPartGroup: 'legs',
    createdAt: 1750896000000,
    exercises: [
      { exerciseId: 'ex-butterfly-bridge', defaultSets: 3, targetReps: 8, order: 0 },
      { exerciseId: 'ex-straight-leg-raise-vmo', defaultSets: 3, targetReps: 10, order: 1 },
      { exerciseId: 'ex-glute-iso-captain-morgan', defaultSets: 3, targetReps: 5, order: 2 },
      { exerciseId: 'ex-hip-ir-stretch', defaultSets: 2, targetReps: null, order: 3 },
      { exerciseId: 'ex-happy-baby', defaultSets: 2, targetReps: null, order: 4 },
      { exerciseId: 'ex-kneeling-hip-flexor-stretch', defaultSets: 2, targetReps: null, order: 5 },
      { exerciseId: 'ex-modified-pigeon', defaultSets: 2, targetReps: null, order: 6 },
    ]
  },
];

export async function migrateNewTemplates() {
  for (const ex of NEW_EXERCISES) await addExercise(ex);
  for (const tpl of NEW_TEMPLATES) {
    const existing = await getTemplate(tpl.id);
    if (!existing) await addTemplate(tpl);
  }
}
