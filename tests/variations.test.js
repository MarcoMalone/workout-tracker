import { test, expect } from 'vitest';
import { buildVariationExercises, deriveVariationGroup } from '../variations.js';

let n = 0;
const idgen = () => { n = 0; return () => `id${++n}`; };

test('buildVariationExercises: makes N named exercises sharing a group id', () => {
  const out = buildVariationExercises('Lat Pulldown', ['Close-Grip', 'Neutral-Grip', 'Wide-Grip'],
    { bodyPartGroup: 'arms', equipment: 'cable', unit: 'lbs', isUnilateral: false }, idgen());
  expect(out).toHaveLength(3);
  expect(out.map(e => e.name)).toEqual(['Close-Grip Lat Pulldown', 'Neutral-Grip Lat Pulldown', 'Wide-Grip Lat Pulldown']);
  const gids = new Set(out.map(e => e.variationGroupId));
  expect(gids.size).toBe(1);                 // all share one group
  expect(out[0].variationGroupId).toBe('id1'); // group id minted first
  expect(out[2].variationLabel).toBe('Wide-Grip');
  expect(out[2].variationBase).toBe('Lat Pulldown');
  expect(out.every(e => e.bodyPartGroup === 'arms' && e.equipment === 'cable')).toBe(true);
});

test('buildVariationExercises: dedupes labels and returns null for < 2', () => {
  expect(buildVariationExercises('X', ['A'], {}, idgen())).toBeNull();
  expect(buildVariationExercises('', ['A', 'B'], {}, idgen())).toBeNull();
  const out = buildVariationExercises('Row', ['Wide', 'Wide', 'Close'], {}, idgen());
  expect(out).toHaveLength(2); // 'Wide' deduped
});

test('deriveVariationGroup: common trailing words become the base', () => {
  const r = deriveVariationGroup(['Close-Grip Lat Pulldown', 'Neutral-Grip Lat Pulldown', 'Wide-Grip Lat Pulldown']);
  expect(r.base).toBe('Lat Pulldown');
  expect(r.labels).toEqual(['Close-Grip', 'Neutral-Grip', 'Wide-Grip']);
});

test('deriveVariationGroup: no common suffix → empty base, full-name labels', () => {
  const r = deriveVariationGroup(['Overhead Tricep Extension', 'Rope Tricep Pushdowns']);
  expect(r.base).toBe('');
  expect(r.labels).toEqual(['Overhead Tricep Extension', 'Rope Tricep Pushdowns']);
});

test('deriveVariationGroup: never swallows a whole name into the base', () => {
  // "Pulldown" alone would fully consume the 1-word name → must back off.
  const r = deriveVariationGroup(['Wide Pulldown', 'Pulldown']);
  expect(r.base).toBe('');
  expect(r.labels).toEqual(['Wide Pulldown', 'Pulldown']);
});

test('deriveVariationGroup: null for fewer than two names', () => {
  expect(deriveVariationGroup(['only one'])).toBeNull();
  expect(deriveVariationGroup([])).toBeNull();
});
