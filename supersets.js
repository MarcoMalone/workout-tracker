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

// Pull ONE exercise out of its superset without breaking the rest of the group:
// clear its supersetId and move it to sit right after the group, so the remaining
// members stay adjacent (grouping is adjacency-based — a gap would split them).
// Pure over the exercises array (mutates in place).
export function leaveSuperset(exIdx, exercises) {
  if (!exercises) return;
  const ex = exercises[exIdx];
  if (!ex || !ex.supersetId) return;
  const gid = ex.supersetId;
  let end = exIdx;
  while (end + 1 < exercises.length && exercises[end + 1].supersetId === gid) end++;
  ex.supersetId = null;
  if (end !== exIdx) {
    exercises.splice(exIdx, 1);
    exercises.splice(end, 0, ex); // end shifted down by one after the splice → lands after the group
  }
}
