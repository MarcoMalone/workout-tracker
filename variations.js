// Variation groups: linked exercises (grips, tricep angles, …) that share a
// variationGroupId + a base name, each carrying its own label. They stay
// individual exercises (own history/charts) but are created/grouped together and
// can be dropped into a template rotation as a set. All functions here are pure.

// Preset variation labels offered in the creator (custom labels can be typed too).
export const VARIATION_PRESETS = ['Close Grip', 'Neutral Grip', 'Wide Grip', 'Overhead', 'Pushdown'];

// Build N exercise defs from a base name + labels, sharing one group id.
// `attrs` supplies the shared flags/equipment/etc. Returns null if < 2 labels
// (not a group — caller should make a single normal exercise instead).
export function buildVariationExercises(base, labels, attrs = {}, newId = () => crypto.randomUUID()) {
  const b = (base || '').trim();
  const labs = [];
  for (const l of (labels || [])) { const t = (l || '').trim(); if (t && !labs.includes(t)) labs.push(t); }
  if (!b || labs.length < 2) return null;
  const groupId = newId();
  return labs.map(label => ({
    id: newId(),
    name: `${label} ${b}`,
    bodyPartGroup: attrs.bodyPartGroup || 'arms',
    equipment: attrs.equipment || '',
    machineId: attrs.machineId ?? null,
    unit: attrs.unit || 'lbs',
    isTimed: !!attrs.isTimed,
    isUnilateral: !!attrs.isUnilateral,
    isBodyweight: !!attrs.isBodyweight,
    notes: attrs.notes || '',
    variationGroupId: groupId,
    variationBase: b,
    variationLabel: label,
  }));
}

// For retrofitting existing exercises into a group: derive a base (longest common
// trailing words of the names) + a per-name label (the leading remainder). When
// there's no clean common suffix, base is '' and each label is the full name.
// Returns { base, labels } or null for < 2 names.
export function deriveVariationGroup(names) {
  const clean = (names || []).map(n => (n || '').trim()).filter(Boolean);
  if (clean.length < 2) return null;
  const toks = clean.map(n => n.split(/\s+/));
  const minLen = Math.min(...toks.map(t => t.length));
  let suffix = [];
  for (let k = 1; k <= minLen; k++) {
    const word = toks[0][toks[0].length - k];
    if (toks.every(t => t[t.length - k] === word)) suffix.unshift(word);
    else break;
  }
  // Never let the base swallow a whole name — every member needs a label remainder.
  while (suffix.length && toks.some(t => t.length <= suffix.length)) suffix.pop();
  const base = suffix.join(' ');
  const labels = toks.map(t => t.slice(0, t.length - suffix.length).join(' ') || t.join(' '));
  return { base, labels };
}
