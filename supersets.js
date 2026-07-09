// Pure superset helpers shared by the logging view (ui-log) and the history
// detail view (ui-history). No DOM, no storage — just grouping/round math, so
// both views interleave supersets the same way and it's cheap to unit-test.

// Group consecutive exercises that share a non-null supersetId. Each group is
// { supersetId, exIdxs:[...] } indexing into the input array; standalone
// exercises come back as their own single-element group. Adjacency matters —
// the same id split by a gap does NOT merge across it.
export function groupExercises(exercises) {
  const groups = [];
  let cur = null;
  (exercises || []).forEach((ex, i) => {
    const sid = ex.supersetId || null;
    if (sid && cur && cur.supersetId === sid) {
      cur.exIdxs.push(i);
    } else {
      cur = { supersetId: sid, exIdxs: [i] };
      groups.push(cur);
    }
  });
  return groups;
}

// Split an exercise's sets into "round slots": each working (non-drop) set opens
// a slot; drop sets attach to the slot immediately above them. So round r is the
// r-th working set plus any drops trailing it.
export function roundSlots(sets) {
  const slots = [];
  let cur = null;
  (sets || []).forEach((s, i) => {
    if (s.isDropSet) {
      if (!cur) { cur = { workIdx: null, dropIdxs: [] }; slots.push(cur); }
      cur.dropIdxs.push(i);
    } else {
      cur = { workIdx: i, dropIdxs: [] };
      slots.push(cur);
    }
  });
  return slots;
}
