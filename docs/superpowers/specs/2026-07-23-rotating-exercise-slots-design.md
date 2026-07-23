# Rotating Exercise Slots — Design

**Date:** 2026-07-23
**Status:** Approved (design), pending implementation
**App:** Workout Tracker PWA (vanilla JS + IndexedDB, Vitest, Vercel)

## Problem

Marco rotates grips on some exercises every session (lat pulldown: close-grip → machine-neutral → wide-grip) and wants to optionally swap alternates on others (a shoulder-stability move in Arm B). The app has no concept of this: Arm A holds one fixed `MN Lat Pulldown`, so he tracks the rotation in his head and the app can't prompt the right variant or chart each grip separately.

## Solution overview

A template **slot** can hold a **rotation set** — an ordered list of exercise variants — instead of a single exercise, with a per-slot mode:

- **auto** — advances to the *next* variant after the one done last time (wraps). Grips cycle themselves.
- **choice** — defaults to the last-done (or first) variant and stays there; alternates are offered to swap in when the athlete chooses. Doesn't auto-advance.

Both share an inline **variant switcher** on the exercise card mid-workout, so the resolved variant can always be overridden for the current session.

Each variant is an ordinary exercise with its own logged history and its own Progress chart (decision: "each variant is its own exercise"). Rotation state is **derived from session history** (decision: "auto-advance from history"), never stored as a counter — it can't drift out of sync and survives edits.

## Data model (backward-compatible)

A template exercise entry today:
`{ exerciseId, defaultSets, targetReps, defaultWeight, defaultSeconds, order, supersetId }`

Add two optional fields:

- `variantIds?: string[]` — ordered exercise ids in the rotation. Absent or empty ⇒ normal single exercise (today's behavior, untouched).
- `variantMode?: 'auto' | 'choice'` — defaults to `'auto'` when `variantIds` is present.

`exerciseId` remains the slot's primary/default (also the first entry of `variantIds` by convention). `defaultSets` / `targetReps` / `defaultSeconds` are shared across variants (grips share a set/rep scheme). `defaultWeight` is a fallback only; per-variant weight comes from that variant's own last session via the existing `prefillFromLastSession` (keyed by `exerciseId`).

## Resolution at workout start

Pure helper `resolveVariant(slot, pastSessionsForTemplate)` → `exerciseId`:

1. If no `variantIds`, return `slot.exerciseId` (unchanged path).
2. Scan `pastSessionsForTemplate` newest-first; find the most recent session whose exercises include any id in `variantIds`; note that id (`last`).
3. `auto`: return the entry after `last` in `variantIds` (wrap); if no `last`, return `variantIds[0]`.
4. `choice`: return `last` if present, else `variantIds[0]`.

`startSession` calls this per slot to set the session exercise's `exerciseId`, and carries `variantIds` / `variantMode` onto the session exercise so the in-workout switcher can render. Everything downstream (prefill, progression hint, PR detection, charts) already keys on `exerciseId` and needs no change.

## In-workout switcher

On a rotating exercise's card, render a compact row of variant chips (one per variant, current highlighted). Tapping another chip:

- swaps the session exercise's `exerciseId` to that variant,
- re-resolves prefill + progression hint for the new variant,
- persists to the active-session autosave.

`auto` slots show a subtle "next up" affordance so it's clear why the variant changed vs last time. Switching mid-session is allowed until data is logged; the logged `exerciseId` is what determines next session's rotation.

## Editing (template editor)

In `showTemplateEditor` (ui-settings.js), each slot gains a "⟳ Rotate" toggle. When on:

- multi-select which library exercises are in the rotation (ordered),
- pick `auto` or `choice`.

Stored as `variantIds` + `variantMode` on the slot. Editable anytime; turning it off reverts to a single-exercise slot (keeps `exerciseId`).

## Seeded content

Migrate-data (`ALL_EXERCISES`, auto-upserts to all devices):

- Rename `ex-mn-lat-pulldown` display → **Machine-Neutral Lat Pulldown** (id unchanged, preserves history).
- Add `ex-cg-lat-pulldown` **Close-Grip Lat Pulldown** and `ex-wg-lat-pulldown` **Wide-Grip Lat Pulldown** (arms, cable, lbs).
- Add shoulder-stability options for Arm B choice-swaps: `ex-half-kneeling-landmine-press` **Half-Kneeling Landmine Press**, `ex-bottoms-up-kb-press` **Bottoms-Up KB Press** (arms, dumbbell/barbell, unilateral).

## Arm A pre-wire (one-time, approved)

Marco's Arm A currently equals the repo standard (an earlier sync set it; no custom edits since). A one-time, flag-gated update (`tplSync_pulldownRotation_2026_07`, gated on the device already having `tpl-arm-a`) rewrites the Arm A pulldown slot to:
`{ exerciseId: 'ex-cg-lat-pulldown', variantIds: ['ex-cg-lat-pulldown','ex-mn-lat-pulldown','ex-wg-lat-pulldown'], variantMode: 'auto', defaultSets: 3, targetReps: 12, order: 0 }`
Other Arm A slots (incl. the Pallof/Cable-Crunch finishers already present) are preserved. Not pushed to new installs. This is the only forced template touch; arms are otherwise never force-synced (see the deploy notes).

## Coach builder → Sonnet 5 (bundled)

Switch the builder model `claude-sonnet-4-6` → `claude-sonnet-5` **with thinking disabled** (`thinking: {type:'disabled'}`), so it's not slower than today but higher quality. Contingent on the bundled `vendor/anthropic-sdk.js` accepting the `thinking` param; if it doesn't cleanly, stay on `claude-sonnet-4-6` and note it. No other builder change.

## Charts / history

No change. Progress groups by exercise, so each grip and each swap alternate charts on its own line. Merging/duplicate handling from v1.3.0 still applies.

## Testing

Pure/unit (Vitest):
- `resolveVariant`: auto advances & wraps; auto with no history → first; choice stays / → first; non-rotating slot → `exerciseId`; unknown last id → first.
- `startSession` sets the resolved `exerciseId` and carries `variantIds`/`variantMode` (existing ui-log test harness).
- Arm A pre-wire migration: gated (runs only with `tpl-arm-a` present), sets the rotation slot, preserves other slots, sets the flag.

Not unit-tested (verified on-device): the in-workout chip switcher render, the template-editor rotate UI.

## Non-goals

- No automatic *detection* of which exercises are variants — the athlete defines each rotation explicitly.
- No per-variant differing set/rep targets (shared across the rotation; revisit only if needed).
- No fuzzy/auto grip inference. No changes to run/walk logging.
