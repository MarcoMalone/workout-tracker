// Rotating exercise slots. A template slot may carry `variantIds` (an ordered
// list of exercise ids) + `variantMode` ('auto' | 'choice'). resolveVariant picks
// which variant a new session should use, derived from the template's own history
// (no stored counter — can't drift, survives edits):
//   auto   → the variant AFTER the one done last time (wraps); first if no history.
//   choice → always the PRIMARY (first) variant; swap manually per session.
// A slot with no variantIds resolves to its plain exerciseId (unchanged behavior).
export function resolveVariant(slot, templateSessions) {
  const ids = slot && Array.isArray(slot.variantIds) ? slot.variantIds : null;
  if (!ids || !ids.length) return slot ? slot.exerciseId : undefined;
  const mode = slot.variantMode === 'choice' ? 'choice' : 'auto';
  // Choice always defaults to your main (first) variant — you swap it in-workout.
  if (mode === 'choice') return ids[0];
  // Auto advances from the most recent session of this template.
  const sorted = (templateSessions || []).slice().sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || (b.startedAt || 0) - (a.startedAt || 0));
  let last = null;
  for (const s of sorted) {
    for (const ex of (s.exercises || [])) {
      if (ids.includes(ex.exerciseId)) { last = ex.exerciseId; break; }
    }
    if (last) break;
  }
  if (!last) return ids[0];
  const i = ids.indexOf(last);
  return ids[(i + 1) % ids.length];
}

// True when a slot (or a live session exercise) carries a real rotation set (2+).
export function isRotating(slot) {
  return !!(slot && Array.isArray(slot.variantIds) && slot.variantIds.length > 1);
}
