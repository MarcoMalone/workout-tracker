import { addExercise, addTemplate, getTemplate, deleteTemplate, getSetting, setSetting } from './db.js';

const MIGRATE_V = 6;

// All exercise definitions — put() is an upsert, safe to re-run
const ALL_EXERCISES = [
  // === ARM EXERCISES (updated to add isBodyweight where applicable) ===
  { id: 'ex-mn-lat-pulldown', name: 'Neutral-Grip Lat Pulldown', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  // Lat-pulldown grip variants — rotate in Arm A (close → machine-neutral → wide).
  { id: 'ex-cg-lat-pulldown', name: 'Close-Grip Lat Pulldown', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: 'Narrow/neutral grip — more lat + lower-lat emphasis.' },
  { id: 'ex-wg-lat-pulldown', name: 'Wide-Grip Lat Pulldown', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: 'Wide pronated grip — upper-back / teres emphasis.' },
  // Shoulder-stability options for an Arm B choice-swap slot.
  { id: 'ex-half-kneeling-landmine-press', name: 'Half-Kneeling Landmine Press', bodyPartGroup: 'arms', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: 'Shoulder stability — controlled press, ribs down.' },
  { id: 'ex-bottoms-up-kb-press', name: 'Bottoms-Up KB Press', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: 'Shoulder/cuff stability — kettlebell inverted, grip tight.' },
  { id: 'ex-semi-pronated-db-curls', name: 'Semi-Pronated DB Curls', bodyPartGroup: 'arms', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-rear-delt-fly-machine', name: 'Rear Delt Fly Machine', bodyPartGroup: 'arms', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-seated-cable-rows', name: 'Close-Grip Seated Row', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: 'Close/neutral grip — mid-back + lat.' },
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
  { id: 'ex-forearm-rope-rollups', name: 'Forearm Rope Roll-Ups', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '1 rep = roll up (backward) + roll down (forward) with wrists' },

  // === LEG EXERCISES ===
  { id: 'ex-hip-thrusts', name: 'Hip Thrusts', bodyPartGroup: 'legs', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  // RDL now done on the Smith Machine (fixed bar path while relearning the hinge).
  { id: 'ex-rdl', name: 'Romanian Deadlift (Smith Machine)', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: 'Smith Machine for now — transition to free weight once the hinge is automatic and pain-free' },
  { id: 'ex-hamstring-curls', name: 'Hamstring Curls', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-leg-extensions', name: 'Leg Extensions', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-bulgarian-split-squat', name: 'Bulgarian Split Squat', bodyPartGroup: 'legs', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '' },
  { id: 'ex-leg-press', name: 'Leg Press', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-hip-abduction-machine', name: 'Hip Abduction Machine', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-hip-adduction-machine', name: 'Hip Adduction Machine', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: 'Primary adductor strength day — progressive overload' },
  { id: 'ex-back-extensions', name: 'Back Extensions', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-calf-raises', name: 'Calf Raises', bodyPartGroup: 'legs', equipment: 'machine', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: '' },
  { id: 'ex-copenhagen-adduction', name: 'Copenhagen with Active Adduction', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-weighted-step-ups', name: 'Weighted Step Ups', bodyPartGroup: 'legs', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '' },
  { id: 'ex-curtsy-lateral-lunge', name: 'Curtsy Lunge to Lateral Lunge', bodyPartGroup: 'legs', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '' },
  { id: 'ex-split-squat', name: 'Split Squat', bodyPartGroup: 'legs', equipment: 'dumbbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: 'Front foot planted, lower back knee toward the floor, controlled tempo — not a jump. Start light (new to the rotation).' },
  { id: 'ex-side-lying-hip-abduction', name: 'Side-Lying Hip Abduction', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: true, isBodyweight: true, notes: '3 lb ankle weight (home). Replaces Standing Cable Hip Abduction.' },
  // Wide-grip row variant for upper-back emphasis (pairs with existing Seated Cable Rows = close/neutral).
  { id: 'ex-wide-grip-row', name: 'Wide-Grip Seated Row', bodyPartGroup: 'arms', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: 'Wide, high-elbow pull — biases upper back / rear delts.' },
  { id: 'ex-toe-flexion-band', name: 'Toe Flexion with Band', bodyPartGroup: 'legs', equipment: 'band', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: 'Standard grip' },
  { id: 'ex-toe-abduction-band', name: 'Toe Abduction with Band', bodyPartGroup: 'legs', equipment: 'band', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: 'Variant of toe flexion with band' },
  { id: 'ex-tibia-bar-raises', name: 'Tibia Bar Raises', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },

  // === CORE EXERCISES ===
  { id: 'ex-cable-crunch', name: 'Cable Crunch', bodyPartGroup: 'core', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, isBodyweight: false, notes: 'Controlled tempo, progressive overload' },
  { id: 'ex-pallof-press', name: 'Pallof Press', bodyPartGroup: 'core', equipment: 'cable', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: 'Standing, anti-rotation' },
  { id: 'ex-dead-bug', name: 'Dead Bug', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: 'Slow and controlled, low back flat against floor' },
  { id: 'ex-side-plank', name: 'Side Plank', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, isBodyweight: true, notes: '' },
  { id: 'ex-bird-dog', name: 'Bird Dog', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: 'Anti-extension core stability — 3s hold per rep' },
  { id: 'ex-landmine-rotation', name: 'Landmine Rotation', bodyPartGroup: 'core', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '' },
  { id: 'ex-ab-wheel-rollout', name: 'Ab Wheel Rollout', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  // Loaded / dynamic core block — concentrated on Legs C (the "real" core day).
  { id: 'ex-weighted-side-plank-hip-drops', name: 'Weighted Side Plank Hip Drops', bodyPartGroup: 'core', equipment: 'plate', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: true, isBodyweight: false, notes: '45 lb; reps ALAP-style (as long as possible)' },
  { id: 'ex-x-man-crunch', name: '"X" Man Crunch', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-step-through-planks', name: 'Step-Through Planks', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-alternating-jackknives', name: 'Alternating Jackknives', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-stationary-bikes', name: 'Stationary Bikes', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: 'Bicycle-crunch style' },

  // === PT / REHAB EXERCISES ===
  { id: 'ex-butterfly-bridge', name: 'Butterfly Bridge', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: 'Light activation. Alternate variations: butterfly bridge / single-leg bridge w/ ball squeeze.' },
  { id: 'ex-straight-leg-raise-vmo', name: 'Straight Leg Raise (VMO)', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: true, isBodyweight: true, notes: '3s hold at top per rep' },
  { id: 'ex-side-star-plank', name: 'Isometric Side Star Plank', bodyPartGroup: 'core', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, isBodyweight: true, notes: '' },
  { id: 'ex-glute-iso-captain-morgan', name: 'Glute Iso (Captain Morgan)', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: true, isBodyweight: true, notes: '5s hold per rep' },
  { id: 'ex-hip-ir-stretch', name: 'Prone Bilateral Hip Internal Rotation Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-happy-baby', name: 'Happy Baby', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-kneeling-hip-flexor-stretch', name: 'Kneeling Hip Flexor/Adductor Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, isBodyweight: true, notes: '' },
  { id: 'ex-modified-pigeon', name: 'Modified Pigeon, Table ER Stretch', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: true, isBodyweight: true, notes: '' },

  // === PT EXERCISES for Full PT Session ===
  { id: 'ex-sciatic-nerve-glides', name: 'Supine Sciatic Nerve Glides in Hip 90/90', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-leg-swings', name: 'Side to Side Leg Swings', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-seated-hip-rotations', name: 'Seated Hip Rotations', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'reps', isTimed: false, isUnilateral: false, isBodyweight: true, notes: '' },
  { id: 'ex-pelvic-floor-elevators', name: 'Pelvic Floor Elevators w/ Lengthening (Seated)', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: '5s hold per rep — log as 25s per set (5 reps × 5s)' },
  { id: 'ex-butterfly-pf-stretch', name: 'Butterfly Stretch w/ Pelvic Floor Relaxation', bodyPartGroup: 'legs', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, isBodyweight: true, notes: '' },
];

// ── Canonical templates ────────────────────────────────────────────────────
// NOTE: templates are NOT pushed to every install (see migrateNewTemplates).
// The five IDs listed in REWORK_TEMPLATE_IDS below are force-synced ONCE onto
// devices that already had the old Leg A/Leg B split (Marco's), via the
// REWORK_SYNC_KEY flag. Reps within a stated range use the value shown here.
// Unilateral exercises: defaultSets is PER SIDE (the Log tab doubles it into
// L/R rows), so "3 sets each leg" => defaultSets: 3.
const ALL_TEMPLATES = [
  // ── Arm A — back/biceps day + core finisher (Cable Crunch + Pallof) before Dead Hangs ──
  {
    id: 'tpl-arm-a',
    name: 'Arm A',
    bodyPartGroup: 'arms',
    createdAt: 1749600000000,
    exercises: [
      // Rotating grip slot: close → machine-neutral → wide, auto-advancing each session.
      { exerciseId: 'ex-cg-lat-pulldown', variantIds: ['ex-cg-lat-pulldown', 'ex-mn-lat-pulldown', 'ex-wg-lat-pulldown'], variantMode: 'auto', defaultSets: 3, targetReps: 12, defaultWeight: 110, order: 0 },
      { exerciseId: 'ex-semi-pronated-db-curls', defaultSets: 3, targetReps: 12, defaultWeight: 25, order: 1 },
      { exerciseId: 'ex-rear-delt-fly-machine', defaultSets: 3, targetReps: 12, defaultWeight: 70, order: 2 },
      // Rotating grip slot: close → wide, auto-advancing each session.
      { exerciseId: 'ex-seated-cable-rows', variantIds: ['ex-seated-cable-rows', 'ex-wide-grip-row'], variantMode: 'auto', defaultSets: 3, targetReps: 12, defaultWeight: 80, order: 3 },
      { exerciseId: 'ex-hammer-curls', defaultSets: 3, targetReps: 10, defaultWeight: 25, order: 4 },
      { exerciseId: 'ex-reverse-cable-flys', defaultSets: 3, targetReps: 12, defaultWeight: 50, order: 5 },
      // Core finisher — inserted immediately before Dead Hangs
      { exerciseId: 'ex-cable-crunch', defaultSets: 2, targetReps: 12, defaultWeight: 50, order: 6 },
      { exerciseId: 'ex-pallof-press', defaultSets: 2, targetReps: 10, defaultWeight: 15, order: 7 }, // 2 per side
      // Dead Hangs must remain the final exercise
      { exerciseId: 'ex-dead-hangs', defaultSets: 3, targetReps: null, defaultSeconds: 30, order: 8 },
    ]
  },

  // ── Arm B — chest/shoulders/triceps day + core finisher (Bird Dog + Dead Bug) at the end ──
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
      { exerciseId: 'ex-forearm-rope-rollups', defaultSets: 3, targetReps: 2, defaultWeight: 5, order: 7 },
      // Core finisher — appended at the end (after current final exercise)
      { exerciseId: 'ex-bird-dog', defaultSets: 2, targetReps: 10, order: 8 },
      { exerciseId: 'ex-dead-bug', defaultSets: 2, targetReps: 10, order: 9 },
    ]
  },

  // ── Legs A — Quad Focus (was the app's "Leg B") ──
  {
    id: 'tpl-legs-a',
    name: 'Legs A',
    bodyPartGroup: 'legs',
    createdAt: 1750896000000,
    exercises: [
      { exerciseId: 'ex-hip-adduction-machine', defaultSets: 2, targetReps: 15, defaultWeight: 120, order: 0 },
      { exerciseId: 'ex-hip-abduction-machine', defaultSets: 2, targetReps: 15, defaultWeight: 130, order: 1 },
      { exerciseId: 'ex-bulgarian-split-squat', defaultSets: 3, targetReps: 10, defaultWeight: 25, order: 2 }, // 3 per leg
      { exerciseId: 'ex-calf-raises', defaultSets: 3, targetReps: 15, defaultWeight: 50, order: 3 },
      { exerciseId: 'ex-leg-extensions', defaultSets: 3, targetReps: 12, defaultWeight: 70, order: 4 },
      { exerciseId: 'ex-leg-press', defaultSets: 3, targetReps: 10, defaultWeight: 180, order: 5 }, // cut first if burnt out
    ]
  },

  // ── Legs B — Glute/Hip Focus (was the app's "Leg A") ──
  {
    id: 'tpl-legs-b',
    name: 'Legs B',
    bodyPartGroup: 'legs',
    createdAt: 1750896000001,
    exercises: [
      { exerciseId: 'ex-butterfly-bridge', defaultSets: 3, targetReps: 8, order: 0 },
      { exerciseId: 'ex-rdl', defaultSets: 3, targetReps: 8, defaultWeight: 95, order: 1 }, // Smith Machine — hardest lift, done fresh
      { exerciseId: 'ex-hip-thrusts', defaultSets: 3, targetReps: 10, defaultWeight: 135, order: 2 },
      { exerciseId: 'ex-side-lying-hip-abduction', defaultSets: 3, targetReps: 15, order: 3 }, // 3 per side, 3 lb ankle weight
      { exerciseId: 'ex-hamstring-curls', defaultSets: 3, targetReps: 12, defaultWeight: 60, order: 4 },
      { exerciseId: 'ex-straight-leg-raise-vmo', defaultSets: 3, targetReps: 10, order: 5 }, // PT version: 3 per side, 3s hold
      { exerciseId: 'ex-pallof-press', defaultSets: 2, targetReps: 10, defaultWeight: 15, order: 6 }, // 2 per side
      { exerciseId: 'ex-back-extensions', defaultSets: 2, targetReps: 12, order: 7 }, // ALWAYS last — non-negotiable
    ]
  },

  // ── Legs C — Full PT + Core + Foot/Ankle (BRAND NEW) ──
  {
    id: 'tpl-legs-c',
    name: 'Legs C',
    bodyPartGroup: 'legs',
    createdAt: 1750896000002,
    exercises: [
      // 1. Split Squat — first real lift, done fresh
      { exerciseId: 'ex-split-squat', defaultSets: 3, targetReps: 10, defaultWeight: 15, order: 0 }, // 3 per leg, start light
      // 2. Full PT Program (in this order)
      { exerciseId: 'ex-sciatic-nerve-glides', defaultSets: 1, targetReps: 12, order: 1 },
      { exerciseId: 'ex-leg-swings', defaultSets: 2, targetReps: 12, order: 2 },
      { exerciseId: 'ex-seated-hip-rotations', defaultSets: 2, targetReps: 12, order: 3 },
      { exerciseId: 'ex-copenhagen-adduction', defaultSets: 3, targetReps: 10, order: 4 },
      { exerciseId: 'ex-butterfly-bridge', defaultSets: 3, targetReps: 8, order: 5 },
      { exerciseId: 'ex-straight-leg-raise-vmo', defaultSets: 3, targetReps: 10, order: 6 }, // 3 per side, 3s hold
      { exerciseId: 'ex-side-star-plank', defaultSets: 3, targetReps: null, defaultSeconds: 25, order: 7 }, // 3 per side (6 total), 25s hold
      { exerciseId: 'ex-weighted-step-ups', defaultSets: 3, targetReps: 8, order: 8 }, // 3 per leg
      { exerciseId: 'ex-curtsy-lateral-lunge', defaultSets: 3, targetReps: 10, order: 9 }, // 3 per side
      { exerciseId: 'ex-pelvic-floor-elevators', defaultSets: 3, targetReps: null, defaultSeconds: 25, order: 10 }, // 3×5, 5s hold
      { exerciseId: 'ex-glute-iso-captain-morgan', defaultSets: 3, targetReps: 5, order: 11 }, // 3 per side, 5s hold
      { exerciseId: 'ex-hip-ir-stretch', defaultSets: 2, targetReps: null, defaultSeconds: 30, order: 12 },
      { exerciseId: 'ex-happy-baby', defaultSets: 2, targetReps: null, defaultSeconds: 30, order: 13 },
      { exerciseId: 'ex-butterfly-pf-stretch', defaultSets: 2, targetReps: null, defaultSeconds: 30, order: 14 },
      { exerciseId: 'ex-kneeling-hip-flexor-stretch', defaultSets: 2, targetReps: null, defaultSeconds: 30, order: 15 }, // 2 per side
      { exerciseId: 'ex-modified-pigeon', defaultSets: 2, targetReps: null, defaultSeconds: 30, order: 16 }, // 2 per side
      // 3. Core Block (loaded/dynamic)
      { exerciseId: 'ex-weighted-side-plank-hip-drops', defaultSets: 2, targetReps: null, defaultWeight: 45, order: 17 }, // 2 per side, ALAP — adjust
      { exerciseId: 'ex-x-man-crunch', defaultSets: 2, targetReps: 12, order: 18 },
      { exerciseId: 'ex-step-through-planks', defaultSets: 2, targetReps: null, defaultSeconds: 45, order: 19 },
      { exerciseId: 'ex-alternating-jackknives', defaultSets: 2, targetReps: null, defaultSeconds: 45, order: 20 },
      { exerciseId: 'ex-stationary-bikes', defaultSets: 2, targetReps: null, defaultSeconds: 30, order: 21 },
      // 4. Foot/Toe Work (fixed every session)
      { exerciseId: 'ex-toe-flexion-band', defaultSets: 2, targetReps: 15, order: 22 },
      { exerciseId: 'ex-toe-abduction-band', defaultSets: 2, targetReps: 15, order: 23 },
      { exerciseId: 'ex-tibia-bar-raises', defaultSets: 2, targetReps: 15, order: 24 },
    ]
  },
];

// One-time forced sync for the Jul 2026 legs rework. Templates are normally NOT
// pushed to existing devices, but this reworked the whole leg/arm split, so we
// upsert the five affected templates once — guarded by REWORK_SYNC_KEY and gated
// so it only runs on a device that already had the old Leg A/Leg B split (i.e.
// not a brand-new install). After it runs once, in-app template edits win.
// Bump the _vN suffix whenever these templates change, to re-run the sync on
// devices that already synced an earlier version.
// NOTE: Arm A/B are intentionally NOT force-synced anymore — Marco curates those
// in-app (e.g. the 3-grip pulldowns), and overwriting them from the repo would
// wipe those edits. Only the leg templates are pushed. Arm changes (finishers,
// wide-grip row) are delivered as library exercises he adds in-app himself.
const REWORK_SYNC_KEY = 'tplSync_legsRework_2026_07_v3';
const REWORK_TEMPLATE_IDS = ['tpl-legs-a', 'tpl-legs-b', 'tpl-legs-c'];
const OLD_TEMPLATE_IDS_TO_REMOVE = ['tpl-leg-a', 'tpl-leg-b'];
// A device "has Marco's split" if it carries either the old Leg A/B templates
// (pre-rework) or any of the new Legs A/B/C (already synced once). Either way the
// sync should (re)apply; a brand-new install has none, so it never gets pushed.
const MARCO_SPLIT_IDS = ['tpl-leg-a', 'tpl-leg-b', 'tpl-legs-a', 'tpl-legs-b', 'tpl-legs-c'];

export async function migrateNewTemplates() {
  // Always upsert all exercise definitions (safe, idempotent) so the library
  // stays current for everyone.
  for (const ex of ALL_EXERCISES) await addExercise(ex);

  // One-time legs-rework template sync (see comment above).
  if (!(await getSetting(REWORK_SYNC_KEY))) {
    let hasMarcoSplit = false;
    for (const id of MARCO_SPLIT_IDS) { if (await getTemplate(id)) { hasMarcoSplit = true; break; } }
    if (hasMarcoSplit) {
      for (const id of OLD_TEMPLATE_IDS_TO_REMOVE) await deleteTemplate(id);
      const byId = Object.fromEntries(ALL_TEMPLATES.map(t => [t.id, t]));
      for (const id of REWORK_TEMPLATE_IDS) if (byId[id]) await addTemplate(byId[id]);
    }
    // Set the flag regardless so brand-new installs don't get the personal split
    // and the sync never re-runs.
    await setSetting(REWORK_SYNC_KEY, true);
  }

  await ensurePulldownRotation();
  await ensureRowRotation();
}

// One-time, targeted, non-destructive patch: turn Arm A's single machine-neutral
// pulldown into an auto-rotating close → machine-neutral → wide grip slot. Only
// touches that one slot (finishers and any other edits are preserved), only on a
// device that already has Arm A, and only once.
const PULLDOWN_ROTATION_KEY = 'tplSync_pulldownRotation_2026_07';
async function ensurePulldownRotation() {
  if (await getSetting(PULLDOWN_ROTATION_KEY)) return;
  const armA = await getTemplate('tpl-arm-a');
  if (armA && Array.isArray(armA.exercises)) {
    const slot = armA.exercises.find(e => e.exerciseId === 'ex-mn-lat-pulldown' && !e.variantIds);
    if (slot) {
      slot.exerciseId = 'ex-cg-lat-pulldown';
      slot.variantIds = ['ex-cg-lat-pulldown', 'ex-mn-lat-pulldown', 'ex-wg-lat-pulldown'];
      slot.variantMode = 'auto';
      await addTemplate(armA);
    }
  }
  await setSetting(PULLDOWN_ROTATION_KEY, true);
}

// Same targeted one-time patch for Arm A's seated row slot → close → wide rotation.
const ROW_ROTATION_KEY = 'tplSync_rowRotation_2026_07';
async function ensureRowRotation() {
  if (await getSetting(ROW_ROTATION_KEY)) return;
  const armA = await getTemplate('tpl-arm-a');
  if (armA && Array.isArray(armA.exercises)) {
    const slot = armA.exercises.find(e => e.exerciseId === 'ex-seated-cable-rows' && !e.variantIds);
    if (slot) {
      slot.variantIds = ['ex-seated-cable-rows', 'ex-wide-grip-row'];
      slot.variantMode = 'auto';
      await addTemplate(armA);
    }
  }
  await setSetting(ROW_ROTATION_KEY, true);
}
