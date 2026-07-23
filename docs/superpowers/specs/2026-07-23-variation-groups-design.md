# Variation Groups — Design

**Date:** 2026-07-23
**Status:** Approved (design), pending implementation
**App:** Workout Tracker PWA (vanilla JS + IndexedDB, Vitest, Vercel)
**Builds on:** 2026-07-23-rotating-exercise-slots-design.md (the rotate/choice slot runtime already shipped)

## Problem

Marco wants to create linked exercise variations (grips: close/neutral/wide; tricep angles: overhead/pushdown) as a first-class thing, rather than hand-making 3 separate exercises and wiring a rotation each time. Variations must stay individual exercises (own history/charts) but be **grouped** so they're easy to create, badge, and drop into a workout as a rotation. He also wants to group exercises that already exist.

## Framing (approved)

A **variation group** is a *creation + linking convenience* on top of the rotate/choice slot mechanism already shipped. It does **not** add new workout-time behavior — in-workout switching still uses the variant chips. "Do both in one workout" = two ordinary slots. The group's value is: create N linked variations at once, badge them, and add the whole group to a template rotation in one tap.

## Data model (backward-compatible)

Exercise definition gains three optional fields:

- `variationGroupId?: string` — shared id across a group.
- `variationBase?: string` — the group's base movement name (e.g. "Lat Pulldown", "Triceps").
- `variationLabel?: string` — this member's label (e.g. "Wide-Grip", "Overhead").

Absent ⇒ a normal ungrouped exercise. Names stay authoritative; base/label are metadata for the badge, creation, and grouping UI. No template/session model change (rotation already uses template-slot `variantIds`).

## Choice-mode refinement (small change to shipped logic)

`resolveVariant` `choice` branch changes from "return last-done" to **"return the primary (`variantIds[0]`)"** — a choice slot always defaults to the main variant and is swapped manually per session. `auto` is unchanged (advance from history). Update `rotation.js` + its test. No live choice slots exist yet.

## Creation flow (Add-Exercise form, `showExerciseForm`)

Add a **"Has variations"** checkbox next to Unilateral. When checked:

- The Name field is treated as the **base** (e.g. "Lat Pulldown").
- A variations editor appears: preset chips (**Close Grip, Neutral Grip, Wide Grip, Overhead, Pushdown**) that toggle a label in/out, plus a text field to add a custom label; chosen labels show as an ordered, removable list.
- All shared attributes (bodyPartGroup, equipment, unit, isTimed, isUnilateral, isBodyweight, notes) apply to every variation.

On save with ≥2 labels: create N exercises — `name = "{label} {base}"`, shared new `variationGroupId`, `variationBase = base`, `variationLabel = label`, shared attributes. With <2 labels: fall back to a single normal exercise (ignore the checkbox).

## Retrofit — group existing exercises (approved)

New Settings tool **"Group exercise variations"** (mirrors the merge-duplicates tool):

- Pick 2+ existing exercises.
- Auto-derive `variationBase` = the longest common trailing words of their names; each member's leading remainder = `variationLabel` (fallback: label = full name, base = "" when no common suffix). Show a preview.
- Confirm → stamp all members with a shared `variationGroupId` + derived base/label (persist via `addExercise` upsert). Non-destructive: names/history untouched.

## Template editor integration (`showRotationEditor`)

When the slot's current exercise has a `variationGroupId`, show a one-tap **"Add all from '{base}'"** button that fills the variant list with every group member (ordered by label preset order, then name). Keeps manual add/remove/reorder. Makes wiring a group rotation one tap.

## Library badge

In `renderExerciseLibrary`, grouped exercises show a small **"variation"** tag (like the "per side" tag), labeled with the base (e.g. "variation · Lat Pulldown").

## Seeded content (auto-groups the existing grips)

Stamp seeded grip exercises in `ALL_EXERCISES` with group metadata (auto-upsert → retro-groups Marco's existing ones, no migration needed):

- **Lat Pulldown** group: `ex-cg-lat-pulldown` / `ex-mn-lat-pulldown` / `ex-wg-lat-pulldown` (labels Close-Grip / Neutral-Grip / Wide-Grip).
- **Seated Row** group: `ex-seated-cable-rows` (Close-Grip) / `ex-wide-grip-row` (Wide-Grip).
- **Triceps** group: add `ex-overhead-tricep-extension` **Overhead Tricep Extension** (arms, cable, lbs); group it with existing `ex-rope-tricep-pushdowns` (labels Overhead / Pushdown, base "Triceps").

## Arm B triceps pre-wire (one-time, targeted)

Flag-gated patch (`tplSync_tricepChoice_2026_07`, gated on `tpl-arm-b` present): turn Arm B's `ex-rope-tricep-pushdowns` slot into a **choice** slot `variantIds: ['ex-overhead-tricep-extension','ex-rope-tricep-pushdowns']`, `variantMode: 'choice'` (primary = overhead). Result: defaults to Overhead each session; tap to swap to Pushdown on bad-wrist days. Preserves other slots. Marco can add a separate pushdown burnout slot himself if he wants both every day (flagged, not auto-added).

## Testing

Pure/unit (Vitest):
- `resolveVariant` choice → primary (update existing test).
- Creation helper (pure): base + labels → N exercise defs with correct names + shared groupId + label/base. (Extract a pure `buildVariationExercises(base, labels, attrs, newId)` for testability.)
- Retrofit derivation (pure): names → common-suffix base + per-member labels. (Extract a pure `deriveVariationGroup(names)`.)
- Triceps pre-wire migration: gated, sets the choice slot, preserves others, once.

Not unit-tested (verified on-device): the creation-form variations editor, the group-existing tool, the "Add all from group" editor button, the library badge.

## Non-goals

- No change to in-workout switching (chips already shipped).
- Group membership doesn't force exercises into one slot — arrangement stays the athlete's choice.
- No auto-detection of which exercises "should" be variations — grouping is explicit.
