// Pure helpers for the template "Reorder" mode. A template's exercises are a flat,
// ordered list where each row carries a `linkedAbove` flag (true = supersetted with
// the row above). For reordering we group contiguous linked rows so a superset moves
// as one block and no exercise can be dragged into the middle of a pair.

// Group a flat chosen[] into contiguous superset blocks. A row starts a new block
// unless it is linkedAbove (and isn't the first row). Blocks hold the SAME row
// object references, so edits made elsewhere are preserved.
export function toGroups(chosen) {
  const groups = [];
  (chosen || []).forEach((row, i) => {
    if (i === 0 || !row.linkedAbove) groups.push([row]);
    else groups[groups.length - 1].push(row);
  });
  return groups;
}

// Flatten blocks back to a flat list, re-deriving linkedAbove so the first row of
// each block is a head (false) and the rest are linked (true). This is what keeps a
// moved block a valid superset and prevents a stale link from the old neighbor.
export function fromGroups(groups) {
  const out = [];
  for (const g of (groups || [])) g.forEach((row, i) => { row.linkedAbove = i > 0; out.push(row); });
  return out;
}

// Move the block at group-index `from` to group-index `to` (insertion index in the
// resulting order). Returns a new array; out-of-range or no-op returns the input.
export function moveGroup(groups, from, to) {
  if (!Array.isArray(groups) || from === to || from < 0 || from >= groups.length) return groups;
  const g = groups.slice();
  const [moved] = g.splice(from, 1);
  const dest = Math.max(0, Math.min(g.length, to));
  g.splice(dest, 0, moved);
  return g;
}

// Split the block at group-index `gi` into standalone singletons (unlink a superset).
// Each freed row becomes its own block; linkedAbove is cleared on flatten.
export function unlinkGroup(groups, gi) {
  if (!Array.isArray(groups) || gi < 0 || gi >= groups.length) return groups;
  const g = groups.slice();
  const singles = g[gi].map(row => [row]);
  g.splice(gi, 1, ...singles);
  return g;
}

// Convenience: reorder a flat chosen[] by moving one block, returning the new flat
// list (with linkedAbove re-derived). Used by the reorder editor on each drag step.
export function reorderChosen(chosen, from, to) {
  return fromGroups(moveGroup(toGroups(chosen), from, to));
}
