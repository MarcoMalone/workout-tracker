# Contextual Help Layer — Design

**Date:** 2026-07-08
**Status:** Approved scope, building
**Goal:** Replace scattered, one-off help affordances with one **coherent, reusable
help layer** — a single definitions source + a single info/glossary component +
teaching empty states — so every piece of jargon is explained the same calm way,
everywhere. Client-side, offline, `localStorage` only, **no DB migration**.

Research basis (4-agent UX pass): help works when *pulled in context*, not pushed
in a tour. Rule of thumb baked in: **ⓘ for a metric · bottom sheet for the concept
· Help Center for a whole topic.** Glossary reach = **bubbles + a light curated set
of inline underlines** (owner's choice).

---

## Backbone — new module `help.js`

**`DEFS` — the single source of truth for jargon copy.** One entry per term:
`{ label, short, body, range? }`. Terms this batch: `acwr`, `e1rm`, `readiness`,
`volume` (hard sets), `stall`, `deload`, `asymmetry`, `dropSet`, `unilateral`.
(RPE excluded — not in the app yet.)

**`showTermSheet(term)`** — opens a themed bottom sheet reusing the existing
`#modal-overlay` / `.modal-sheet`: `label` as the title, `short` as the lead line,
`body`, an optional highlighted `range` line, a dismiss ✕, backdrop-tap to close,
and a "Learn more →" button that calls the existing `showHelpCenter()`.

**`infoButton` via markup + `wireInfo(container)`** — screens render a consistent
affordance as plain HTML with a `data-term`, then call one `wireInfo(el)` after
`innerHTML` (matching the app's render-then-query pattern). `wireInfo` delegates
clicks/Enter/Space for:
- `<button class="info-btn" data-term="acwr" aria-label="About training load">ⓘ</button>`
- `<span class="gloss" data-term="e1rm" role="button" tabindex="0">e1RM</span>` (the ambient underline)

Helper `termSpan(text, term)` and `infoBtnHTML(term)` return those strings so call
sites stay tidy.

**`localStorage` help registry** — `helpSeen(key)` / `markHelpSeen(key)` backed by a
single `wt.help` JSON object. Scaffolds the deferred one-time-tip work; shipped and
tested now, lightly used this batch.

---

## Definitions copy (calm, professional, non-alarming)

- **acwr** — *Training load (ACWR)* · "Your last 7 days of training compared to
  your last 28." · body: "A quick read on whether you're ramping up faster than
  your body has adapted to." · range: "Around 0.8–1.3 is steady and sustainable.
  Above ~1.5 means recent load is climbing quickly — worth easing into."
- **e1rm** — *Estimated 1-rep max* · "Your projected best single lift, from the
  weight and reps you logged." · body: "It's an estimate, not a test — treat it as
  a trend to beat over time, not a number to max out on."
- **readiness** — *Readiness* · "A 0–100 read on how recovered you are today." ·
  body: "It blends your morning check-in — sleep, energy, soreness, mood. Higher
  means you're primed; lower is a nudge to keep it steady rather than chase a PR."
- **volume** — *Weekly volume (hard sets)* · "Your working sets per muscle group
  this week." · body: "Hard sets are the ones that actually drive progress." ·
  range: "Most guidance lands around 10–20 per muscle per week. Below the band =
  room to add; above = already plenty of stimulus."
- **stall** — *Stall* · "No progress on a lift for three-plus sessions." · body:
  "Hitting the same weight and reps repeatedly is normal — usually just a sign it's
  time to change something, often a deload."
- **deload** — *Deload* · "A lighter stretch to let your body catch up." · body:
  "Dropping the weight about 10% for a session or two often clears a stall and eases
  injury risk, then you build back up."
- **asymmetry** — *L/R asymmetry* · "The strength gap between your left and right
  side on a one-sided lift." · body: "Small differences are normal. A gap above
  ~15% is worth watching — especially on a side you're rehabbing."
- **dropSet** — *Drop set* · "Right after a set, drop the weight and immediately do
  more reps." · body: "It pushes a set past failure for extra stimulus. Log the
  lighter continuation as its own set."
- **unilateral** — *Unilateral* · "A one-sided exercise — one arm or leg at a
  time." · body: "Tracked per side (L/R) so you can see and close any imbalance."

Voice rules: no cutesy, no exclamation spam, no blame, never alarming. State the
thing, give the interpretation, stop.

---

## Wire-ups this batch

**Progress (`ui-progress.js`)** — convert the two existing inline explainers
(`.sum-help` / `.sum-explain` toggles for `acwr` and `vol`) to `info-btn` +
`showTermSheet`; delete the inline `acwrHelp` / `volHelp` strings (copy now lives in
`DEFS`). Add ⓘ to the **e1RM** strength-chart area, **Lifts to Watch** (`stall`),
and the **heatmap** header. Underline **ACWR**, **e1RM**, **hard sets** where they
appear in titles.

**Log home (`ui-log.js`)** — ⓘ on the **readiness** card label.

**Active session (`ui-log.js`)** — ⓘ on the **L/R asymmetry** chip; make **drop
set** a glossary term where it reads as text.

**Teaching empty states** (shared calm voice):
- **Progress first-run** (priority): when there isn't enough data yet, show
  "Your trends will build here — most charts fill in after about 3–4 workouts,"
  with a "Log a workout" action, instead of empty/near-empty cards.
- Normalize the existing **History / Goals / Templates** empty copy to match voice
  and each offer one clear primary action.

---

## Not doing / deferred

- **No first-run tour / spotlight walkthrough** — research is clear they're skipped
  and don't help. At most a single dismiss-forever pointer later.
- Deferred B follow-ups: full helper-text-under-every-input audit; one-time
  just-in-time tips (e.g. explaining a stall the first time it fires, via the
  `wt.help` registry already shipped); the "?" FAB coach-mark; seeding the Ask box
  with context-relevant suggested questions.
- Everything from workstreams **A** (visual token layer), **C** (trust & finish),
  **D** (navigation) stays queued.

---

## Testing

- `help.test.js`: `DEFS` integrity (every entry has `label`/`short`/`body`; keys
  unique and referenced keys exist); `showTermSheet` renders the label + short into
  the overlay and closes; `wireInfo` opens the sheet from a `data-term` element;
  `helpSeen`/`markHelpSeen` round-trip via `localStorage` (in-memory shim as in the
  on-the-bench tests).
- Update any Progress test that clicked the old `.sum-help` inline toggle to the new
  affordance.
- Full suite stays green; `node --check` on changed modules. SW cache bumps.

## Constraints honored

Vanilla JS + IndexedDB, offline, no backend, phone-fast. All help content is static
(works with no API key / offline); the AI "Ask" box remains the optional extra. No
DB migration — help state lives in `localStorage`. `help.js` added to the SW
precache.
