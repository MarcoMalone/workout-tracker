import { test, expect } from 'vitest';
import { resolveVariant, isRotating } from '../rotation.js';

const IDS = ['ex-cg', 'ex-mn', 'ex-wg'];
const slotAuto = { exerciseId: 'ex-cg', variantIds: IDS, variantMode: 'auto' };
const slotChoice = { exerciseId: 'ex-cg', variantIds: IDS, variantMode: 'choice' };
const sess = (date, exId) => ({ date, startedAt: new Date(date + 'T10:00:00').getTime(), exercises: [{ exerciseId: exId }] });

test('non-rotating slot resolves to its plain exerciseId', () => {
  expect(resolveVariant({ exerciseId: 'ex-solo' }, [])).toBe('ex-solo');
  expect(resolveVariant({ exerciseId: 'ex-solo', variantIds: [] }, [])).toBe('ex-solo');
});

test('auto: no history → first variant', () => {
  expect(resolveVariant(slotAuto, [])).toBe('ex-cg');
});

test('auto: advances to the next variant after the most recent one', () => {
  const sessions = [sess('2026-07-10', 'ex-cg'), sess('2026-07-15', 'ex-mn')]; // last done = mn
  expect(resolveVariant(slotAuto, sessions)).toBe('ex-wg'); // mn → wg
});

test('auto: wraps from the last variant back to the first', () => {
  expect(resolveVariant(slotAuto, [sess('2026-07-15', 'ex-wg')])).toBe('ex-cg'); // wg → cg
});

test('auto: uses the most recent session by date/startedAt, ignores non-variant ids', () => {
  const sessions = [
    sess('2026-07-20', 'ex-mn'),          // newest → last done
    sess('2026-07-19', 'ex-wg'),
    sess('2026-07-21', 'ex-unrelated'),   // newer date but not a variant → ignored
  ];
  expect(resolveVariant(slotAuto, sessions)).toBe('ex-wg'); // mn → wg
});

test('choice: always defaults to the primary variant, ignoring history', () => {
  expect(resolveVariant(slotChoice, [sess('2026-07-15', 'ex-mn')])).toBe('ex-cg');
  expect(resolveVariant(slotChoice, [])).toBe('ex-cg');
});

test('isRotating: true only for a 2+ variant set', () => {
  expect(isRotating(slotAuto)).toBe(true);
  expect(isRotating({ exerciseId: 'x' })).toBe(false);
  expect(isRotating({ exerciseId: 'x', variantIds: ['only-one'] })).toBe(false);
});
