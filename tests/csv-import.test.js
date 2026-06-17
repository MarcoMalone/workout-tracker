import { vi } from 'vitest';
vi.mock('../app.js', () => ({ switchTab: vi.fn().mockResolvedValue(undefined) }));

import { parseWorkoutCSV } from '../onboarding.js';

const SAMPLE_CSV = `Date,Workout,Exercise,Set,Reps,Weight_lbs,Volume,Notes
2026-06-11,Arm A,Barbell Curl,1,12,130,1560,
2026-06-11,Arm A,Barbell Curl,2,12,130,1560,shoulder tight
2026-06-11,Arm A,Incline DB Curl,1,12,40,480,
2026-06-13,Arm B,Cable Curl,1,12,50,600,`;

test('parseWorkoutCSV groups rows into sessions by date+workout', () => {
  const sessions = parseWorkoutCSV(SAMPLE_CSV);
  expect(sessions).toHaveLength(2);
  expect(sessions[0].templateName).toBe('Arm A');
  expect(sessions[1].templateName).toBe('Arm B');
});

test('parseWorkoutCSV groups sets by exercise', () => {
  const sessions = parseWorkoutCSV(SAMPLE_CSV);
  const armA = sessions.find(s => s.templateName === 'Arm A');
  expect(armA.exercises).toHaveLength(2);
  const curl = armA.exercises.find(e => e.exerciseName === 'Barbell Curl');
  expect(curl.sets).toHaveLength(2);
  expect(curl.sets[0].weight).toBe(130);
  expect(curl.sets[0].reps).toBe(12);
});

test('parseWorkoutCSV captures per-set notes', () => {
  const sessions = parseWorkoutCSV(SAMPLE_CSV);
  const armA = sessions.find(s => s.templateName === 'Arm A');
  const curl = armA.exercises.find(e => e.exerciseName === 'Barbell Curl');
  expect(curl.notes).toContain('shoulder tight');
});

test('parseWorkoutCSV infers bodyPartGroup from workout name', () => {
  const sessions = parseWorkoutCSV(SAMPLE_CSV);
  expect(sessions[0].bodyPartGroup).toBe('arms');
  expect(sessions[1].bodyPartGroup).toBe('arms');
});
