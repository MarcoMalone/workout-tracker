# Superset Upgrades — Design

**Date:** 2026-07-29
**Status:** Approved (design), pending implementation
**App:** Workout Tracker PWA (vanilla JS + IndexedDB, Vitest)

## Scope

Five improvements to the in-workout superset (linked-exercise) experience, all in `ui-log.js` (+ a metrics guard). The Arm B rearrangement is explicitly **out** — Marco will set that up himself using these tools.

1. **Show previous reps/weights in the superset view** (bug). Standalone cards show "Previous: …"; the superset round view doesn't. Add a per-exercise "Previous" line inside each `ss-ex` (rendered once, at round 1), computed from `meta[exIdx].prev` like the standalone `prevText`.

2. **Cross-exercise drop set** — a drop that is a *different* exercise (e.g. Rope Tricep Pushdowns as the drop for Overhead Tricep Extension). Model: a drop-set row (`isDropSet: true`) gains an optional `altExerciseId` (+ `altName` for display). Works standalone and inside a superset.
   - Adding: the existing "+ drop" adds a same-exercise drop; the drop row shows a compact **exercise selector** defaulting to the parent exercise, changeable to any exercise, with **variation-group siblings listed first** (one-tap for the other tricep variant).
   - Metrics: alt-exercise drops are **excluded from the parent exercise's e1RM / PR / stall / chart** computations (guard in `getBestE1RM` — skip sets with `altExerciseId`) so a pushdown drop never pollutes overhead-extension strength data.
   - **Known limitation (documented):** the alt drop is logged + displayed under the parent and its data (altExerciseId, weight, reps) is preserved, but it does **not yet feed the alt exercise's own chart**. Charting alt drops under the alt exercise is a future enhancement.

3. **One note per link.** The superset block has no note today. Add a note toggle + textarea in the `superset-hd`, stored on the group's first exercise as `supersetNote` (travels with the session naturally; one note per link, not per exercise).

4. **Link 3+ exercises** — already works (the linker merges into the existing group; the round view handles A→B→C). Only change: reword the superset-picker hint so it's clear you can keep adding exercises to build a circuit.

5. **Variation (either/or) slots inside a superset** — today a linked variation slot loses its grip/variant chips (the superset view doesn't render them). Add the variant-switcher chips into `ss-ex` (reusing `meta[exIdx].variants`, already computed in `renderActiveSession`), with the same switch behavior as the standalone card. This lets Marco link e.g. face pulls to the overhead/pushdown tricep choice slot and still swap the tricep variant in-workout.

## Data model (backward-compatible)

- Set row: optional `altExerciseId?: string` + `altName?: string` (only meaningful on `isDropSet` rows). Absent = normal drop (same exercise).
- Exercise (session): optional `supersetNote?: string` on the group's first exercise.
No migration needed; older sessions simply lack these fields.

## Testing

- `getBestE1RM` skips sets carrying `altExerciseId` (pure; add to metrics.test).
- Existing superset tests (`supersets.test.js`, `on-the-bench.test.js`) must stay green.
- Not unit-tested (verified on-device): the drop exercise-selector UI, the superset note textarea, variant chips inside a superset, the Previous line.

## Non-goals

- No Arm B template pre-wire (Marco does it).
- No template-level definition of cross-exercise drops (ad-hoc in-workout only for now).
- No charting of alt drops under the alt exercise (documented limitation).
