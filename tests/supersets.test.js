// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { assignSupersetIds } from '../ui-settings.js';

// assignSupersetIds turns per-row "linked with the one above" flags into shared
// group ids. Ids are random uuids, so we assert the *relationships* (which rows
// share an id, which are null), never the literal value.
describe('assignSupersetIds', () => {
  test('a lone linked pair shares one id; the rest are null', () => {
    const ids = assignSupersetIds([false, true, false]);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).toBeNull();
  });

  test('a run of three linked rows all share the same id', () => {
    const ids = assignSupersetIds([false, true, true]);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).toBe(ids[0]);
  });

  test('two separate groups get distinct ids', () => {
    // rows: A B(link A) C D(link C)  →  {A,B} and {C,D}, different ids
    const ids = assignSupersetIds([false, true, false, true]);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[2]);
  });

  test('first row is never linked even if flagged', () => {
    const ids = assignSupersetIds([true, false]);
    expect(ids[0]).toBeNull();
    expect(ids[1]).toBeNull();
  });

  test('all-standalone yields all null; empty yields empty', () => {
    expect(assignSupersetIds([false, false])).toEqual([null, null]);
    expect(assignSupersetIds([])).toEqual([]);
  });
});

// leaveSuperset: pull one member out without splitting the rest of the group.
import { leaveSuperset, groupExercises } from '../supersets.js';
describe('leaveSuperset (take one exercise out of a superset)', () => {
  const mk = () => [
    { exerciseId: 'a', supersetId: 'g' },
    { exerciseId: 'b', supersetId: 'g' },
    { exerciseId: 'c', supersetId: 'g' },
    { exerciseId: 'd', supersetId: null },
  ];
  it('first member moves after the group, others stay linked', () => {
    const exs = mk(); leaveSuperset(0, exs);
    expect(exs.map(e => e.exerciseId)).toEqual(['b', 'c', 'a', 'd']);
    expect(exs.map(e => e.supersetId)).toEqual(['g', 'g', null, null]);
    expect(groupExercises(exs).map(g => g.exIdxs.length)).toEqual([2, 1, 1]);
  });
  it('middle member moves after the group', () => {
    const exs = mk(); leaveSuperset(1, exs);
    expect(exs.map(e => e.exerciseId)).toEqual(['a', 'c', 'b', 'd']);
    expect(groupExercises(exs).map(g => g.exIdxs.length)).toEqual([2, 1, 1]);
  });
  it('last member just unlinks in place', () => {
    const exs = mk(); leaveSuperset(2, exs);
    expect(exs.map(e => e.exerciseId)).toEqual(['a', 'b', 'c', 'd']);
    expect(exs[2].supersetId).toBeNull();
  });
  it('no-op on a standalone exercise', () => {
    const exs = mk(); leaveSuperset(3, exs);
    expect(exs.map(e => e.exerciseId)).toEqual(['a', 'b', 'c', 'd']);
  });
});
