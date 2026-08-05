import { describe, test, expect } from 'vitest';
import { toGroups, fromGroups, moveGroup, unlinkGroup, reorderChosen } from '../template-reorder.js';

// A row is just { exerciseId, linkedAbove }. toGroups clusters contiguous linked rows.
const rows = (...specs) => specs.map(([id, linkedAbove]) => ({ exerciseId: id, linkedAbove: !!linkedAbove }));

describe('toGroups', () => {
  test('groups contiguous linkedAbove rows into blocks', () => {
    const g = toGroups(rows(['a', false], ['b', true], ['c', false], ['d', false], ['e', true]));
    expect(g.map(x => x.map(r => r.exerciseId))).toEqual([['a', 'b'], ['c'], ['d', 'e']]);
  });
  test('a leading linkedAbove row is treated as its own head (never merges upward)', () => {
    const g = toGroups(rows(['a', true], ['b', false]));
    expect(g.map(x => x.map(r => r.exerciseId))).toEqual([['a'], ['b']]);
  });
  test('empty / missing input', () => {
    expect(toGroups([])).toEqual([]);
    expect(toGroups(undefined)).toEqual([]);
  });
});

describe('fromGroups', () => {
  test('re-derives linkedAbove: first row of each block false, rest true', () => {
    const flat = fromGroups([rows(['a', true], ['b', true]), rows(['c', true])]);
    expect(flat.map(r => [r.exerciseId, r.linkedAbove])).toEqual([['a', false], ['b', true], ['c', false]]);
  });
});

describe('moveGroup', () => {
  const g = () => [['a'], ['b'], ['c']];
  test('moves a block to a new index', () => {
    expect(moveGroup(g(), 0, 2)).toEqual([['b'], ['c'], ['a']]);
    expect(moveGroup(g(), 2, 0)).toEqual([['c'], ['a'], ['b']]);
  });
  test('no-op / out-of-range returns input unchanged', () => {
    const src = g();
    expect(moveGroup(src, 1, 1)).toBe(src);
    expect(moveGroup(src, -1, 0)).toBe(src);
    expect(moveGroup(src, 5, 0)).toBe(src);
  });
});

describe('unlinkGroup', () => {
  test('splits a superset block into standalone singletons', () => {
    const g = [toGroupsBlock('a', 'b', 'c')];
    const out = unlinkGroup(g, 0);
    expect(out.map(b => b.map(r => r.exerciseId))).toEqual([['a'], ['b'], ['c']]);
  });
  test('unlink then flatten clears all linkedAbove flags for the freed rows', () => {
    const chosen = rows(['a', false], ['b', true], ['c', true], ['d', false]);
    const flat = fromGroups(unlinkGroup(toGroups(chosen), 0));
    expect(flat.map(r => [r.exerciseId, r.linkedAbove])).toEqual([['a', false], ['b', false], ['c', false], ['d', false]]);
  });
});

describe('reorderChosen (end-to-end: move a block, re-derive links)', () => {
  test('moving a superset block keeps its two members adjacent and correctly linked', () => {
    // [a] [b+c superset] [d]  → move the superset (group idx 1) to the front
    const chosen = rows(['a', false], ['b', false], ['c', true], ['d', false]);
    const flat = reorderChosen(chosen, 1, 0);
    expect(flat.map(r => [r.exerciseId, r.linkedAbove])).toEqual([
      ['b', false], ['c', true], ['a', false], ['d', false],
    ]);
  });
  test('a row that lands right after a moved superset does NOT inherit its link', () => {
    // moving [d] between the superset head and tail must be impossible — blocks are atomic
    const chosen = rows(['a', false], ['b', false], ['c', true], ['d', false]);
    // group indices: 0=[a] 1=[b,c] 2=[d]; move [d] to front
    const flat = reorderChosen(chosen, 2, 0);
    expect(flat.map(r => r.exerciseId)).toEqual(['d', 'a', 'b', 'c']);
    expect(flat.find(r => r.exerciseId === 'a').linkedAbove).toBe(false); // a stays a head
  });
});

// Helper: build one superset block of standalone-then-linked rows.
function toGroupsBlock(...ids) {
  return ids.map((id, i) => ({ exerciseId: id, linkedAbove: i > 0 }));
}
