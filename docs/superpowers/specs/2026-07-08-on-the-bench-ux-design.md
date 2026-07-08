# On-the-Bench UX Bundle — Design

**Date:** 2026-07-08
**Status:** Approved scope, pending spec review
**Goal:** Make the active-workout experience feel fast, tactile, and effortless
one-handed on a phone sitting on the bench — the "good apps have this, we don't"
gap. All changes are client-side, `localStorage`-gated, and require **no
IndexedDB schema migration**.

---

## Context: what already exists (build on, don't duplicate)

From `ui-log.js` `renderActiveSession` and the rest-timer block:

- `.sticky-finish-bar` — a fixed bottom bar with the "Finish Workout" button.
- `#rest-timer` — a docked bar (above the finish bar) that auto-starts when a set
  is checked, shows `Rest m:ss` with `−15s / +15s / Skip`, and **already calls
  `navigator.vibrate(200)` at zero**.
- `.set-check` (`✓`) per set row — toggles a `.set-done` **CSS class only** (not
  stored on the set object) and calls `startRest(exDef.id)`.
- Reps already have `−`/`+` steppers; **weight is a typed input** (native keyboard).
- Rest defaults persist per-exercise via the `restByExercise` setting.
- `showToast(msg)` helper exists.

The active session (`activeSession`) is a module-level variable — it survives tab
switches in memory but is lost on a full reload/PWA close, and `✓` done-state +
the running timer are lost on any re-render (add set, tab switch).

---

## Features

### 1. Screen Wake Lock
Keep the display awake during an active session.

- New helper module `wakelock.js`: `acquire()`, `release()`, and an internal
  `visibilitychange` handler that re-acquires the lock when the tab becomes
  visible again while a session is active (the classic lost-lock bug). Uses
  `navigator.wakeLock.request('screen')`; feature-detected, no-op if unsupported.
- **Acquire** at the start of an active session (in `startSession` /
  `renderActiveSession`). **Release** on Finish (post-checklist save), Discard,
  and when leaving the Log tab while a session is active.
- Gated by setting **`keepScreenOn`** (localStorage, default `true`).
- A small "☀ screen on" chip in the session header when the lock is held (hidden
  if the setting is off or the API is unsupported).

### 2. Haptics
One small helper, three named patterns.

- New helper module `haptics.js`: `haptic(kind)` where `kind ∈ 'tap' | 'rest' |
  'pr'`. Feature-detects `navigator.vibrate`; each kind maps to a short pattern
  (`tap` ≈ 15ms, `rest` ≈ 200ms, `pr` ≈ a short triple-buzz). No-op when
  unsupported or when the setting is off.
- **iOS:** WebKit exposes no Vibration API. v1 gracefully no-ops on iOS (every
  haptic is always paired with a visual change, so nothing is lost). The iOS 18+
  `<input type="checkbox" switch>` haptic trick is noted as a fast-follow, not in
  this batch.
- Wire-ups: `tap` on set-commit (the `.set-check` → done transition), `rest` at
  rest-timer zero (replace the current inline `navigator.vibrate(200)` with
  `haptic('rest')`). `pr` is defined but unused until live PR detection ships
  (deferred).
- Gated by setting **`haptics`** (localStorage, default `true`).

### 3. Glanceable rest timer
Make the existing `#rest-timer` readable from arm's length.

- Enlarge the countdown to big, high-contrast digits (Kinetic volt-lime on the
  near-black bar); keep the `−15s / +15s / Skip` controls but as bigger tap
  targets. Add `env(safe-area-inset-bottom)` padding so it clears the iPhone home
  bar. This is a CSS-weight change to `renderRest` markup + `styles.css`.
- Optional **beep at zero** via a tiny Web Audio oscillator, gated by setting
  **`restBeep`** (localStorage, default `false` — off so it never startles).
  Fires alongside `haptic('rest')`.

### 4. Repeat-last-set
One-tap logging of a straight set.

- A **"Repeat set"** button beside "+ Add Set" in each exercise card's
  `.ex-actions`. On tap: clone the exercise's last set's values (`weight` /
  `reps` / `seconds` / `side`), append it as a new set **already marked done**,
  start the rest timer, fire the commit pulse + `haptic('tap')`.
- Disabled/hidden when the exercise has no sets yet.
- Extract the "append a set" logic already in `.ex-add-set` so repeat reuses it.

### 5. Set-commit pulse celebration
Confirm a logged set without needing to read the screen.

- On the `.set-check` → done transition: a sub-300ms volt-lime pulse on the set
  row (CSS keyframe) + `haptic('tap')`. Un-checking does not pulse.
- Respect `prefers-reduced-motion`: swap the animation for an instant static
  done-state.
- **PR celebration is deferred** — the `pr` haptic + a distinct pulse + "PR!"
  toast are designed for but not wired until live PR detection ships. When it
  does, PR detection computes each exercise's best-ever e1RM (bodyweight → best
  reps, timed → best seconds) at session start and compares committed sets.

### 6. Model-backed `✓` done state
Fix the "done-state resets on re-render" rough edge and lay groundwork for full
active-session persistence.

- Add an optional **`done: boolean`** field to each set object (defaults falsy;
  optional field → no migration, rides along in saved sessions and backups).
- `.set-check` writes `set.done` instead of relying on the DOM class; row render
  reads `set.done` to restore the checked/`.set-done` state.
- Result: ticked-off sets survive add-set / delete-exercise / tab-switch
  re-renders. The rest timer remaining across re-renders is **not** in scope
  (stays foreground-only as today).

### 7. Bottom-zone polish (no new global bar)
Per decision: do **not** add a competing global action bar (the per-row `✓`
logging model doesn't need one, and "current exercise" tracking doesn't exist).
Instead:

- Ensure `.sticky-finish-bar` and `#rest-timer` both carry
  `env(safe-area-inset-bottom)` padding and ≥48px tap targets.
- Confirm the rest timer docks cleanly above the finish bar at the enlarged size.

---

## Settings

Three new toggles in a "Workout feel" group in Settings (`ui-settings.js`), all
`localStorage`-backed with sensible defaults:

| Key | Label | Default |
|---|---|---|
| `keepScreenOn` | Keep screen on during workouts | on |
| `haptics` | Haptic feedback | on |
| `restBeep` | Beep when rest timer ends | off |

Read via a tiny `localStorage` getter with the default baked in (not IndexedDB
settings — no reason to touch the DB for UI prefs).

---

## Testing

- `haptics.js` and `wakelock.js`: pure feature-detect + guard logic → unit tests
  with `navigator.vibrate` / `navigator.wakeLock` mocked (present/absent, setting
  on/off).
- Repeat-last-set: unit-test the "clone last set" transform (given an exercise's
  sets → the appended set) as a pure helper.
- Model-backed done: jsdom render test that a set with `done: true` renders
  checked, and that clicking `✓` sets `set.done` on the model and survives a
  re-render (`renderActiveSession`).
- Keep the full suite green (currently 91) and `node --check` changed modules.

---

## Out of scope / parked (future)

- **Weight steppers** (+2.5/+5/−) — deferred this batch.
- **Live PR detection + PR celebration** — deferred; design captured above.
- **Global bottom action bar** — revisit only if full window/tab persistence
  lands (below).
- **Full active-session persistence** — persist `activeSession` (and the running
  rest timer) to IndexedDB/settings so an in-progress workout survives a reload /
  PWA close, not just in-memory tab switches. Marco's flagged "eventually" item;
  the model-backed `✓` (feature 6) is the first step toward it.
- iOS Safari haptic trick, custom in-app number pad — noted, later.

---

## Constraints honored

Vanilla JS + IndexedDB, offline-first, no backend, phone-fast. New UI prefs in
`localStorage`; the only data-model touch is an optional `set.done` field (no
migration). API key never touched. SW cache version bumps on release.
