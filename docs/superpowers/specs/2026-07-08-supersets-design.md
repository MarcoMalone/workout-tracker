# Supersets (round-interleaved) — Design

**Date:** 2026-07-08
**Status:** Stage 1 shipped (template-editor linking + round-interleaved logging + group-aware rest). Stage 2 deferred.
**Origin:** Live-testing brainstorm — logging dumbbell bench with push-ups as a
linked finisher. Chose **B (superset grouping)** + **round-interleaved** UI.
Client-side, offline, `localStorage`/IndexedDB, **no DB migration** (optional
fields only).

## Goal
Let two (or more) exercises be **linked as a superset** so they're logged in
**rounds** — e.g. *Round 1: bench set + push-up set → rest; Round 2: …* — while
each exercise stays its **own tracked exercise** (its own history / e1RM / rep
trend). This models Marco's bench→push-ups-to-failure→rest flow, and generalizes
to PT circuits.

## Data model (no migration — optional fields)
- Add optional **`supersetId`** (string) to **template** exercises and **session**
  exercises. Consecutive exercises (by `order`) sharing a `supersetId` form one
  group. `null`/absent = a normal standalone exercise (unchanged behavior).
- A group is defined by adjacency + shared id, so ordering already in the template
  drives it. No new store; rides along in saves, backups, and the active-session
  autosave already shipped.

## Creating a group (template editor)
- In the template editor's exercise list, each row (after the first) gets a
  **"⛓ Superset with above"** toggle. Toggling it on assigns the row the same
  `supersetId` as the row above (creating one if needed); toggling off splits it
  into its own group. Reordering/removing re-derives ids so groups stay contiguous.
- MVP scope: link/unlink adjacent rows. (Drag-reorder within the editor is out of
  scope; the existing add/remove order is enough.)

## Active-session render (round-interleaved)
- `renderActiveSession` groups **consecutive same-`supersetId`** exercises into a
  **`.superset-block`** (bordered container + a "Superset" header naming its
  exercises). Standalone exercises render as today (unchanged card).
- Inside a block, render **rounds** instead of per-exercise set lists:
  - Round *r* shows, for each exercise in the group in order, that exercise's
    **set *r*** as a labeled set-row (reusing the existing `appendSetRow`
    rendering, prefixed with the exercise name so you know which is which).
  - The **rest timer starts only when the round's *last* exercise set is checked**;
    checking an earlier exercise in the round shows a subtle **"next: <exercise>"**
    cue instead of starting rest. (Group-aware rest.)
  - **"+ Add round"** appends one set to *every* exercise in the group (keeps them
    aligned). Per-exercise "+ Add Set" is hidden inside a group.
- Round count = the **max** set count across the group's exercises. If one exercise
  has fewer sets than the round index, that slot renders a muted "add" placeholder
  rather than a `null × null` row (ties into the empty-set-strip already shipped).

## Rest timer
`startRest` becomes group-aware: on a set-check, look up the exercise's group; if it
is **not** the last exercise in that group, skip the timer and show the "next:" cue;
if it **is** last (or ungrouped), start rest as today. Respects the new "Auto rest
timer" toggle.

## History
- Grouped exercises in a saved session render under a small **"Superset"** label so
  the linkage is visible. Set values shown per exercise (round-interleaving in the
  History detail is a **later** polish — v1 is the label + existing per-exercise
  sets). Each exercise still contributes to its own e1RM/PR/volume as today.

## Edge cases / decisions
- **Drop sets inside a superset:** KEPT (Marco's call — support the power case). No
  new set field: a **round** is derived per exercise as its r-th *working* (non-drop)
  set plus any drop sets immediately following it in the array. In the round UI each
  exercise's slot shows its working set + its drop rows + a small **"+ drop"**
  affordance to add another drop to *that* exercise in *that* round (multiple drops
  per round supported). Order within a round is normal set → drop(s). Rest still fires
  only after the group's last exercise.
- **Mixed exercise types in a group** (weighted + bodyweight + timed + unilateral):
  each row uses its own existing renderer; only a name label is added. Unilateral
  asymmetry flag keeps working per exercise.
- **Uneven set counts:** rounds = max; short exercises show an add-placeholder for
  the missing round.
- **Ungrouped path is untouched** — zero behavior change for non-superset workouts.

## Staging (build order)
1. **Stage 1 (this build):** data model + template-editor link/unlink + group-aware
   rest + round-interleaved session render + empty-slot handling. Ships the feature
   end-to-end for logging.
2. **Stage 2 (follow-up):** History detail interleaving polish; ad-hoc in-session
   grouping; drop sets inside a superset; 3+-exercise circuit refinements.

## Testing
- Pure helper `groupExercises(exercises)` → array of groups (consecutive shared
  `supersetId`), unit-tested (grouping, singletons, uneven, ungrouped).
- Pure helper for round transposition (per-round slots incl. empty placeholders).
- Template-editor link/unlink id assignment logic.
- jsdom: a grouped session renders a `.superset-block` with interleaved labeled
  rows; checking the non-last exercise does **not** start rest, checking the last
  does.
- Full suite stays green; SW cache bump.

## Constraints honored
Vanilla JS + IndexedDB, offline, no backend; optional `supersetId` only (no
migration); reuses existing set-row renderers and the shipped autosave/rest/strip
logic; standalone-exercise flow unchanged.
