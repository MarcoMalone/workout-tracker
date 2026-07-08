# Workout Tracker — Build Log & Process Notes

A running record of how this app was built with Claude Code: what got made, why,
and — more usefully for next time — *how* the collaboration worked. Written so it
can double as raw material for a future write-up.

---

## What the app is

A personal, phone-first **workout tracker PWA**. Deliberately constrained:

- **Vanilla JS + IndexedDB** (`idb`), **no backend**, single user, offline via a
  service worker, hosted on GitHub Pages.
- Tabs: **Log · History · Progress · Coach · Settings**.
- An optional **Claude coach** (the user supplies their own API key) that reads the
  training data and gives pre-workout / post-workout guidance.
- Owner context: a baseball player whose priorities are **(1) injury prevention**
  (hip/groin PT) and **(2) getting stronger** — which shaped nearly every feature
  decision.

Those constraints are the backbone of the whole thing: every feature has to work
in vanilla JS against IndexedDB, stay fast on a phone, and survive offline.

---

## The working method (the part worth remembering)

A few habits made this productive and are worth repeating:

1. **Design before code, but only as much as the task needs.** New features started
   with a short design pass (the visual overhaul got three full mockups to react to;
   small features got a one-paragraph plan). Decisions were made *explicitly* and
   written down, not left implicit.

2. **Show options, don't guess taste.** The UI overhaul was pitched as **three
   distinct directions** (Lab / Refined / Kinetic) in a single interactive artifact
   with a working light/dark toggle. Picking from real mockups beat describing
   aesthetics in the abstract. (Kinetic won.)

3. **Research fanned out, then synthesized.** The feature roadmap came from a
   **5-agent parallel research workflow** — five researchers each took a lens
   (logging UX, analytics, programming intelligence, retention, recovery/rehab),
   did real web research on Strong/Hevy/Fitbod/Whoop/etc., and an aggregator merged
   it into a tiered, *tailored* roadmap (top-5, quick wins / high-value / big bets,
   a deliberately-skip list, and a suggested first sprint). That roadmap drove
   everything after.

4. **Bugs got systematic debugging, not guesses.** The "everything breaks after I
   delete an exercise" report was traced to a single root cause (a render loop
   indexing a stale template), reproduced with a **failing test first**, then fixed.
   One root cause explained four separate symptoms.

5. **Tests grew with every change.** Pure logic (scoring, ACWR, streaks, stall
   detection, parsers) got unit tests; UI flows got **jsdom integration tests** that
   mount the real render functions and assert against a fake IndexedDB. The suite
   went from **39 → 84 tests**, all green, and caught real bugs before they shipped
   (e.g. a collapsed-bar CSS bug, the delete-crash).

6. **"Keep going" batches.** Once the roadmap existed, work proceeded in coherent
   multi-feature batches — build, test, commit, push, then a written rundown — with
   the user testing at natural stopping points rather than after each change.

7. **Honesty about limits.** Where something couldn't be verified here (real Claude
   API calls need the user's key; pixel-level looks need a browser), that was stated
   plainly rather than claimed. Deferred features (e.g. a volume-shaded muscle
   heatmap) were flagged as *blocked on a prerequisite* instead of shipped weak.

**Delivery constraints that stayed constant:** every feature is buildable in vanilla
JS against IndexedDB; new persistent data is stored as **settings** wherever possible
so it rides along in backups with **no schema migration**; the **API key is never**
written to source or included in a backup.

---

## Timeline (this build series)

Commits are on branch `fix/normname-hyphen`, pushed to `master`. Service-worker
cache version bumped each release so clients update.

| Commit | What shipped |
|---|---|
| `d23f661` | **Walk/Run editing parity** — history detail for walks/runs got edit-date, editable notes, context tag, delete (matching strength/PT). Consolidated two read-only views into one `showCardioDetail`. |
| `dcdab38` | **First jsdom integration test** — mounts the real history UI and asserts edits persist to IndexedDB. |
| `e1b8cf5` | **Kinetic reskin** — full visual overhaul from the chosen direction: near-black + volt-lime, heavy display type, chunkier cards; rebuilt the Log home (hero, streak, "This Week" bars, RUN/WALK). Retheme driven entirely from the CSS token layer, both light and dark. |
| `6c9d3a5` | **Session-delete crash fix** — root-caused + regression-tested; resolved delete / add / discard / "can't edit a trimmed PT session" in one fix. |
| `6e0c4c9` | **Backup & Restore** — full JSON export/import of every store; API key excluded (enforced by a test). The roadmap's #1 pick — the data had no safety net. |
| `a892d01` | **Sprint items 2–4** — auto-prefill sets from last session; live **L/R asymmetry flag**; **morning readiness check-in** wired into the coach. |
| `a9ca2fb` | **ACWR training-load gauge** + **weekly sets-per-muscle volume board** on Progress. |
| `e4be81d` | **Daily Goals** — habit + quantity goals with per-goal streaks; coach made goal-aware. |
| `ccc5731` | **Auto-start rest timer** + **stalled-lift/deload detection** ("Lifts to Watch"). |
| `6375f41` | **Body-map pain logger** (tappable front/back figure) + **recovery-aware coach** (readiness + ACWR + active pain fold into pre-workout advice and the AI template adjustment). |
| `a1e6f1e` | **Goal Coach** (AI proposes daily goals, one-tap add) + **per-exercise rest defaults**. |
| _(earlier batch)_ | Body-map detail expansion (arm segments: bicep/tricep, elbow, forearm, wrist; feet/ankles), side-specific regions with L/R labels. |
| `b34aa2c` | **On-the-bench UX bundle** — screen wake lock (re-acquire on visibilitychange), haptics on set-commit + rest-zero, glanceable big-digit rest timer + optional beep, repeat-last-set, set-commit pulse, model-backed `✓` state, three Settings toggles. All `localStorage`-gated, no migration. From the 3-agent UX research pass; spec at `docs/superpowers/specs/2026-07-08-on-the-bench-ux-design.md`. |
| `2fc4020` | **WS-B — active-session persistence + resume bar.** The in-progress workout was memory-only (lost on reload/PWA-close); now it autosaves to `localStorage` (delegated listener + per-render) and `renderLogTab` rehydrates it, resuming exactly where you left off; cleared on finish/discard. A "▸ Resume workout" bar appears above the tab bar from other tabs. Reframed Marco's "lost a workout": it was **per-device divergence** after his phone migration (no sync), not a bug — reconcile via non-destructive backup export/import. SW v43. Rest of WS-B (memoize Progress, collapsible Settings, Progress jump-index, sheet factory) queued. |
| `dfa0c4b` | **Trust & finish A2 — privacy/About/consent/backup-safety** (closes WS-A). Settings "Data & Privacy" (on-device story + honest caveat) and "About" (version + changelog); one-time AI-coach consent gate in `runCoach` + Clear-API-key; backup nudge + restore preview (counts before overwrite); one-time "What's new" on version bump. New `version.js` / `whatsnew.js` / `db.backupSummary()`. SW v42. |
| `29c1127` | **Trust & finish A1 — unified feedback** (first `/improve-app`-driven build). One `ui-feedback.js`: `toast()` (info/success/error + optional Undo action), a themed `confirmSheet()` replacing all 7 raw `confirm()`, `undoToast()`. Consolidated the 3 duplicated toasts; frequent reversible deletes now use Undo, catastrophic ones a danger confirm; all `alert()` → calm toasts; global `:focus-visible`. Spec at `docs/superpowers/specs/2026-07-08-trust-and-finish-design.md`. A2 (privacy/consent card, About/What's-New, backup nudge+preview) queued. SW v41. |
| `d2edf9c` | **Chart re-skin (visual polish, workstream A)** — migrated the Progress line/e1RM/volume charts off the leftover pre-Kinetic palette (orange/navy/slate) to volt-lime with a faint hairline grid and `--text-3` ticks; L/R charts now cyan (Left) + lime (Right), with per-date side labels matched. Tabular numerals set globally on `body`. Categorical activity heatmap left distinct. Finding: the CSS token layer (near-black, hairline borders, dark-on-lime, radius scale) was already solid, so no token churn. SW v40. |
| `e781b28` | **Contextual help layer** — one `help.js` backbone: a `DEFS` jargon map, a `showTermSheet` bottom sheet, `wireInfo()` for consistent ⓘ buttons + ambient dotted-underline glossary terms, and a `localStorage` help registry. Converts Progress's inline explainers to the shared component; adds ⓘ/underlines across Progress (ACWR, hard sets, stall, deload), the Log-home readiness card, and the active-session asymmetry chip; new first-run teaching empty state on Progress. Static/offline, no migration. From a 4-agent "professional polish" research pass; spec at `docs/superpowers/specs/2026-07-08-help-layer-design.md`. |

Earlier phases (pre–`d23f661`) built the core app: templates, logging (unilateral /
bodyweight / timed / drop sets), pre/post checklists, run/walk logging, the Claude
coach, the Progress charts + 12-week heatmap, CSV import, and a multi-user Coach
Profile.

---

## The feature set, by area

**Logging (Log tab)**
- Template-based sessions; per-set weight/reps/seconds; unilateral L/R, drop sets,
  bodyweight and timed exercises; per-exercise + session notes; 5-star rating;
  editable date/time.
- **Auto-prefill** each set from what you actually did last time (progressive
  overload), falling back to the template default for new lifts.
- **Live L/R asymmetry flag** on unilateral lifts (>15% side gap → caution chip).
- **Auto-start rest timer** with per-exercise remembered rest (−15/+15, persisted).
- Log home: date hero, activity **streak**, **"This Week"** load bars, **readiness
  check-in** card, **Daily Goals**, quick RUN/WALK.
- **On-the-bench feel:** screen **wake lock** during a session (Settings toggle),
  **haptics** on set-commit and at rest-zero, a **glanceable** big-digit rest timer
  (optional beep), one-tap **repeat-last-set**, a set-commit **pulse**, and
  **model-backed `✓`** state so ticked sets survive re-renders.

**History**
- Unified list; full editable detail for strength/PT **and** walks/runs (date,
  notes, context tag, delete).

**Progress**
- 12-week consistency heatmap; per-exercise e1RM charts with PR detection; PR board.
- **Training Load (ACWR)** gauge — 7-day vs 28-day training minutes, 0.8–1.3 sweet
  spot, plain-English readout, "building baseline" until ~4 weeks of history.
- **Weekly volume board** — hard sets per arms/legs/core vs a 10–20 target band.
- **Lifts to Watch** — flags weighted lifts with no PR in 3+ sessions.

**Coach**
- Pre-workout check-in and post-workout debrief via the Claude API.
- **Recovery-aware context**: readiness + ACWR + active pain + goals all feed the
  pre-workout advice, and active pain feeds the AI soreness-adjusted template.
- **Body Check-In**: tappable front/back body map to log pain 0–10 by region.
- **Goal Coach**: proposes 2–3 daily goals from your data; one-tap to add.
- Training-summary export to clipboard.

**Data / platform**
- Backup & Restore (key excluded); CSV/Sheets import; light + dark; offline PWA.

---

## Design decisions & tradeoffs (the honest list)

- **Kinetic over Refined/Lab** — the user wanted energy; a bold athletic identity
  fit a training app and their taste. System-available fonts (Segoe/Bahnschrift/
  Consolas) were used because the artifact sandbox blocks web-font CDNs and, for the
  real app, they render identically on the user's Windows machine.
- **Settings-as-storage** for readiness, goals, pain, rest defaults — chosen over new
  IndexedDB stores so there's no migration and everything is captured by backups.
- **Training *minutes* as the ACWR load** — not sRPE. The app doesn't reliably
  capture session RPE, so duration is a transparent, honest external-load proxy.
  Labeled as such.
- **Volume board at 3 broad groups** (arms/legs/core) — the exercise model only
  carries `bodyPartGroup`, so a fine-grained per-muscle board (or a volume-shaded
  heatmap) is **blocked on muscle-tagging exercises**. Shipped the honest coarse
  version rather than a misleading fine one.
- **Manual pain/goal logging**, not auto-detection — universal and simple; auto-
  completing goals from logged sets and pain history/trends are noted follow-ups.
- **Rest timer is foreground-only** — iOS PWAs can't fire reliable background
  notifications, so it's a visible-while-open cue by design, not a broken promise.
- **Pain map is a blocky schematic**, not anatomical art — intentional given the
  Kinetic look and to keep the SVG hand-maintainable; regions are side-specific
  (e.g. "R forearm").

---

## Where injury *history* and context live (a recurring question)

The app feeds the coach several things; knowing which to use avoids confusion:

- **Right now / acute** (e.g. "hip's sore today") → the **Body Check-In** pain map
  and/or the **pre-workout note**. Flows into that session's advice and the AI
  template adjustment. The pre-workout note is *per-session and not saved*.
- **Ongoing limitation** (e.g. "rehabbing a forearm strain — avoid direct arm work
  for 1–2 weeks") → the **Coach Profile** (Settings). It's a persistent system prompt
  injected into *every* coach request, so the coach carries that context day to day.
  This is where "why I've skipped arms" belongs.
- **Full injury history / timeline** → currently **not stored structurally** in the
  app. That lives in the external Claude project until/unless an in-app **injury log**
  is added (a candidate feature: dated entries that feed the coach and annotate the
  body map).

---

## Testing

- Framework: **vitest**, with `fake-indexeddb` for the DB layer and a per-file
  **jsdom** environment for UI render tests. Aliases resolve the `esm.sh` `idb` import
  and the vendored Anthropic SDK.
- Coverage grew **39 → 127 tests**. Pure logic is unit-tested (e1RM, ACWR, weekly
  volume, readiness score, goal/activity streaks, stall detection, pain summary, the
  goal-suggestion parser, `cloneLastSet`, and the haptics/wake-lock feature-detect
  guards). UI flows have integration tests that mount real render functions (history
  editing, Log-home render + goal increment, the delete-crash regression).
- Every batch ran the full suite green before commit; `node --check` guarded syntax
  on changed modules.

---

## What's next (not yet built)

- **Specialty / neglected-area auto-population** — **PARKED (Jul 2026).** Marco wants
  to hash out open design questions *before* any build starts. **Remind him of this
  before picking the feature back up** — the questions to settle first: catalog scope
  & tagging model, coverage-window definition, escalation cadence, and the injection
  UX (how a suggested exercise appears in the session builder without being annoying).
  Do not begin implementation until those are answered. Original idea below:
  app analyzes logged workouts, notices body parts/movements that haven't been
  trained in a while (feet & toes, tibialis, ankles, hip flexors, traps/shrugs,
  adductors), and auto-injects a small niche exercise into the relevant workout —
  deletable, but tracked. If an area goes untouched ~2 weeks it escalates and gets
  injected every session until done, then the cycle resets. Configurable cadence
  (e.g. weekly). Needs: a catalog of "specialty exercises" tagged by area, a
  coverage analysis over recent sessions, and an injection point in the session
  builder + a nudge.
- **Muscle-tag exercises** → unlocks a real volume-shaded muscle heatmap (and feeds
  the coverage analysis above).
- **Pain history / trends** — per-region sparklines, "days since pain-free."
- **In-app injury log** — dated injuries that persist to the coach and the body map.
- **Pilot polish**: quick-build tutorial, achievements/badges, a shareable monthly
  "Wrapped" card, auto-detecting goal completion from logged data.
- **Professional-polish research menu** (4-agent pass, Jul 2026): three workstreams
  still queued. **A) visual polish** — the CSS token layer turned out to already be
  in good shape (near-black surfaces, hairline borders, dark-on-lime text, radius
  scale, tabular numerals, graceful `system-ui` font fallback), so the "Tier A
  token overhaul" the research proposed was largely redundant; the real gap was the
  off-brand charts, now re-skinned (`d2edf9c`). Still open in A: **self-host one
  display font** (needs a `.woff2` binary dropped into the repo — can't be fetched
  in the build env; recommend Oswald / Barlow Semi Condensed / Saira / Archivo,
  subset + `font-display:swap`, system stack as fallback), a **motion pass** (sheet
  slide-up, hero count-up; reduced-motion aware), and a **consistent icon set**
  (drop emoji-as-icons for one inline-SVG line set). **C) trust & finish — ✅ DONE**
  (shipped as WS-A via the first `/improve-app` run — unified toasts + confirm+Undo
  `29c1127`, privacy/About/consent/backup-safety `dfa0c4b`). **D) navigation & flow —
  still open** (persist active session + resume mini-bar, keep tab panels mounted,
  standardized sheet header/dismiss, collapsible Settings, Progress section-index
  chips), plus the `/improve-app` **tactile** batch (weight steppers, non-color
  active-tab cue + bigger step buttons, live PR celebration). Full findings live in
  the research pass + the grounding verdicts.
- **Help-layer follow-ups** (deferred from `e781b28`): full helper-text-under-every-
  input audit; one-time just-in-time tips (e.g. explain a stall the first time it
  fires — the `wt.help` registry is already shipped); a single dismiss-forever "?"
  FAB pointer; Ask-box context seeding; and wiring e1RM ⓘ into the per-exercise
  Progress charts (skipped this batch to avoid the carousel re-render churn).
- **On-the-bench follow-ups** (deferred from the `b34aa2c` bundle): weight steppers
  (+2.5/+5), live PR detection + PR celebration, a global bottom action bar, and
  **full active-session persistence** (survive a reload / PWA close — the
  model-backed `✓` is step one). iOS Safari haptic trick + a custom in-app number
  pad also noted. These came out of a 3-agent UX research pass; the broader menu
  (coaching nudges, progress-story layers, pain×load correlation) is captured in
  that research if we want to pick more from it.
- **BYO-key pilot** decided (Aug 2026 direction): each of ~5 testers uses their own
  Anthropic key; a rate-limited proxy (Marco pays) is the later step if friction
  hurts adoption.

## Vercel deployment prep (Jul 2026)

Code is now **deploy-location-agnostic** — all asset paths were made relative
(`index.html`, `app.js` SW registration, `manifest.json` `start_url`/`scope`/icons,
and the `sw.js` precache list), so the app runs correctly both at the current
GitHub Pages subpath (`/workout-tracker/`) **and** at a Vercel domain root (`/`).
This means the GitHub Pages build keeps working — no forced cutover. Added
`vercel.json` (framework: null, no build/install, output = repo root) and
`.vercelignore` (excludes `node_modules`, `tests`, `docs`, `.superpowers`,
`vendor`, and the vitest/package files). SW cache bumped to `workout-v37`.

**Still Marco's steps when we "make Vercel happen":**
1. **Export a backup first** from the live GitHub Pages app (Settings → Backup) —
   IndexedDB is origin-scoped, so data does NOT follow the app to a new domain.
2. Connect the repo to Vercel, deploy (framework preset "Other").
3. On the Vercel origin, **import** that backup, then **re-enter the API key**
   (backups deliberately exclude it).
4. Pick the final domain early — moving again = another export/import.
   BYO-key stays the model; a serverless proxy is only if we later hide one key.

---

*This log is maintained alongside the code. Update it when a batch ships so the
process stays legible.*
