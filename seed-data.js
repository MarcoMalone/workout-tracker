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

export const SEED_TEMPLATES = [
  {
    id: 'tpl-arm-a',
    name: 'Arm A',
    bodyPartGroup: 'arms',
    createdAt: 1749600000000,
    exercises: [
      { exerciseId: 'ex-mn-lat-pulldown', defaultSets: 3, targetReps: 12, order: 0 },
      { exerciseId: 'ex-semi-pronated-db-curls', defaultSets: 3, targetReps: 12, order: 1 },
      { exerciseId: 'ex-rear-delt-fly-machine', defaultSets: 3, targetReps: 12, order: 2 },
      { exerciseId: 'ex-seated-cable-rows', defaultSets: 3, targetReps: 12, order: 3 },
      { exerciseId: 'ex-hammer-curls', defaultSets: 3, targetReps: 10, order: 4 },
      { exerciseId: 'ex-reverse-cable-flys', defaultSets: 3, targetReps: 12, order: 5 },
      { exerciseId: 'ex-dead-hangs', defaultSets: 3, targetReps: null, order: 6 },
    ]
  },
  {
    id: 'tpl-arm-b',
    name: 'Arm B',
    bodyPartGroup: 'arms',
    createdAt: 1749772800000,
    exercises: [
      { exerciseId: 'ex-seated-shoulder-press', defaultSets: 3, targetReps: 12, order: 0 },
      { exerciseId: 'ex-db-bench', defaultSets: 3, targetReps: 12, order: 1 },
      { exerciseId: 'ex-push-ups', defaultSets: 3, targetReps: null, order: 2 },
      { exerciseId: 'ex-rope-tricep-pushdowns', defaultSets: 3, targetReps: 12, order: 3 },
      { exerciseId: 'ex-face-pulls', defaultSets: 3, targetReps: 12, order: 4 },
      { exerciseId: 'ex-pec-flys-machine', defaultSets: 3, targetReps: 12, order: 5 },
      { exerciseId: 'ex-single-arm-lateral-raises', defaultSets: 3, targetReps: 12, order: 6 },
    ]
  }
];
