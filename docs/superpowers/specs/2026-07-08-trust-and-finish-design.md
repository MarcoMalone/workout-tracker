# Trust & Finish (WS-A) — Design

**Date:** 2026-07-08
**Status:** Building A1
**Source:** `/improve-app` run — adversarial grounding kept 13 gaps; WS-A chosen.
Client-side, offline, `localStorage`/settings only, **no DB migration**.

Shipped in two halves:

## A1 — Unified feedback substrate (this batch)

**New `ui-feedback.js`** — one place for user feedback, replacing three copy-pasted
`showToast` implementations (`ui-log.js`, `ui-settings.js`, `ui-history.js`).

- `toast(msg, opts)` — one toast system. `opts.type` ∈ `info` (default) / `success`
  / `error` (calm, non-alarming styling per category). `opts.action` = `{label,
  onClick}` renders a trailing button (used for Undo) and extends the dwell to ~6s;
  plain toasts stay ~2.5s. One at a time (replace any showing toast). Docked above
  the tab bar with safe-area padding.
- `confirmSheet({title, body, confirmLabel, danger})` → `Promise<boolean>` — a
  themed confirm reusing `#modal-overlay`/`.modal-sheet` (grabber + ✕ + backdrop
  tap = cancel). Replaces every raw browser `confirm()`. `danger:true` → red
  confirm button. Resolves `true` on confirm, `false` on cancel/dismiss.
- `undoToast(message, undoFn)` — convenience: `toast(message, {action:{label:'Undo',
  onClick: undoFn}})`.

**Migrations:**
- The 3 `showToast` definitions → thin re-exports of `toast` (keep the call sites).
- The 7 `confirm()` sites (`ui-log.js:291,405,489`; `ui-history.js:196,332`;
  `ui-settings.js:223,285,379`) → `await confirmSheet(...)`; make enclosing
  handlers async where needed. Catastrophic ones (discard workout, restore backup,
  delete template/exercise) use `danger:true`.
- Frequent **reversible** deletes get **Undo** instead of a confirm dialog:
  - remove-exercise from the active session (`ui-log.js:489`) — splice out, `undoToast`
    re-inserts at the same index + re-render. (No confirm.)
  - remove-set (`ui-log.js` set-remove) — same pattern.
  - delete-workout in History (`ui-history.js:196`) — delete via db, `undoToast`
    re-adds the record.
- `alert()` error sites (`ui-coach.js:80`, `onboarding.js:123`, `ui-log.js` run/walk
  validation, `ui-settings.js` import/restore) → `toast(msg, {type:'error'})` with a
  calm, actionable message.

**Accessibility (T6, re-aimed):** global `:focus-visible` outline (buttons, inputs,
tappables) — currently `outline:none` with no focus ring anywhere; add `aria-label`
to `#dismiss-coach-banner`.

**Testing:** `confirmSheet` resolves true/false on confirm/cancel (jsdom); `toast`
renders message + type class + fires the action callback and dismisses; `undoToast`
wires the undo fn. Keep the suite green; SW cache bump.

## A2 — Trust surfaces (next batch)
- Privacy + AI-consent card (Settings "Data & Privacy": on-device story +
  one-time coach consent + **Clear API key**).
- About + `APP_VERSION` + "What's New" (one-time on version bump).
- Backup nudge ("last backup: N days") + restore preview (X→Y counts before
  overwrite), `lastBackup` timestamp in localStorage.

## Constraints honored
Vanilla JS + IndexedDB, offline, no backend; feedback state ephemeral; no DB
migration. `ui-feedback.js` added to the SW precache.
