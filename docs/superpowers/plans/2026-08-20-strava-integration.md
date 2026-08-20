# Strava Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Strava runs & walks (with rich data, plus a one-time history backfill) into the workout tracker, hosted on Vercel with a stateless serverless broker for the Strava OAuth secret.

**Architecture:** Static PWA + `/api/strava/*` serverless functions on one Vercel origin. Functions hold the client secret (env vars) and proxy all Strava calls (secret off-device, no CORS). Tokens live in IndexedDB. A pure `strava.js` module does all mapping/parsing (fully unit-tested, no network); the app and functions call into it.

**Tech Stack:** vanilla JS (ES modules), IndexedDB (idb), Vitest, Chart.js, Vercel serverless (Node runtime), Strava API v3 (OAuth2).

**Spec:** `docs/superpowers/specs/2026-08-15-strava-integration-design.md`

## Global Constraints

- Vanilla JS + ES modules only; no framework. Match existing code style/patterns.
- Every user-facing string plain; no em-dashes in UI copy.
- Ship ritual for any app-visible change: bump `sw.js` `CACHE`, bump `version.js` `APP_VERSION` + prepend changelog, `npm test` green, then commit → `git push origin HEAD:master` (push as the `MarcoMalone` gh account, then restore `mdileocytra`).
- Secret (`STRAVA_CLIENT_SECRET`) NEVER in client code or committed files.
- `date` fields are local `YYYY-MM-DD` strings; NEVER derive them via `new Date()` from Strava's `start_date_local`.
- Runs/walks are `bodyPartGroup: 'legs'`; imported record id = `strava-<stravaId>`; skip-if-exists (never overwrite).

## Phases & gating

- **Phase 0 (repo hardening) + Phase 1 (pure data layer):** executable immediately, need none of Marco's accounts. Full TDD below.
- **Marco setup (parallel):** create Strava API app + Vercel project (runbook in Phase 4A). Unblocks Phase 2+.
- **Phase 2 (serverless broker), Phase 3 (app UI + storage), Phase 4 (migration cutover):** task-level specs + runbook; the OAuth/live-API details get verified against the deployed preview during execution (per spec's "verify at implementation").

---

## Phase 0 — Repo hardening for Vercel (do first; still works on Pages)

### Task 0.1: Stop `.vercelignore` from excluding `vendor/`

**Files:** Modify `.vercelignore`

**Why:** `claude-api.js` statically imports `./vendor/anthropic-sdk.js`; if `vendor/` is excluded from the deploy it 404s and the whole ES-module graph fails → blank app.

- [ ] **Step 1: Edit `.vercelignore`** — remove the `vendor` line. Final contents:
```
# Dev-only files — keep them out of the static deploy
node_modules
tests
docs
.superpowers
vitest.config.js
package.json
package-lock.json
```
- [ ] **Step 2: Verify** `vendor` is gone: `grep -c '^vendor$' .vercelignore` → expect `0`.
- [ ] **Step 3: Commit** `git add .vercelignore && git commit -m "fix: keep vendor/ in Vercel deploy (static import needs it)"`

### Task 0.2: Service worker — bypass `/api/`, precache Chart.js

**Files:** Modify `sw.js`

- [ ] **Step 1:** In the `fetch` handler, add an `/api/` bypass alongside the existing anthropic bypass:
```js
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('anthropic.com')) return;
  if (url.pathname.startsWith('/api/')) return; // never cache the Strava broker
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});
```
- [ ] **Step 2:** Add Chart.js to `PRECACHE` (so run-detail charts work offline) — append to the CDN line:
```js
  'https://esm.sh/idb@8',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js'
```
- [ ] **Step 3:** Bump `CACHE` to `workout-v76`.
- [ ] **Step 4: Test** `npm test` → expect all green (no SW tests exist; this confirms nothing else broke). Then manually confirm the app still loads via a local static serve if convenient.
- [ ] **Step 5: Commit** `git add sw.js && git commit -m "sw: bypass /api, precache Chart.js, cache v76"`

### Task 0.3: Confirm `vercel.json` serves static root + functions

**Files:** Review `vercel.json` (likely no change)

- [ ] **Step 1:** Confirm current config (`framework:null`, `outputDirectory:"."`, no build) serves the repo root statically. Serverless functions are auto-detected from `/api/*.js` — no config needed. Note in the PR description that this is verified on the first preview deploy (Phase 4A). No commit unless a change is needed.

---

## Phase 1 — Pure Strava data layer (`strava.js`, fully unit-tested, no network)

Create `strava.js` (pure functions; no DOM, no fetch) and `tests/strava.test.js`. Reuse `computeRunPace` from `ui-log.js` where possible (DRY).

### Task 1.1: sport routing, local date/time, unit conversions

**Files:** Create `strava.js`; Create `tests/strava.test.js`

**Interfaces — Produces:**
- `stravaKind(sportType: string): 'run'|'walk'|null`
- `stravaLocalDate(startDateLocal: string): string` // 'YYYY-MM-DD'
- `stravaLocalTime(startDateLocal: string): string` // 'HH:MM'
- `metersToMiles(m: number): number`
- `paceFromMps(mps: number): number|null` // min/mi, null when mps<=0

- [ ] **Step 1: Write failing tests** (`tests/strava.test.js`):
```js
import { describe, test, expect } from 'vitest';
import { stravaKind, stravaLocalDate, stravaLocalTime, metersToMiles, paceFromMps } from '../strava.js';

describe('stravaKind', () => {
  test('routes run-like sports to run', () => {
    for (const s of ['Run', 'TrailRun', 'VirtualRun']) expect(stravaKind(s)).toBe('run');
  });
  test('routes walk-like sports to walk', () => {
    for (const s of ['Walk', 'Hike']) expect(stravaKind(s)).toBe('walk');
  });
  test('ignores everything else', () => {
    for (const s of ['Ride', 'WeightTraining', 'Workout', '', undefined]) expect(stravaKind(s)).toBeNull();
  });
});

describe('local date/time from start_date_local (fake-Z wall clock)', () => {
  const s = '2026-08-14T20:15:30Z'; // 8:15pm local — must NOT roll to next UTC day
  test('date is a plain slice', () => expect(stravaLocalDate(s)).toBe('2026-08-14'));
  test('time is HH:MM', () => expect(stravaLocalTime(s)).toBe('20:15'));
});

describe('unit conversions', () => {
  test('meters to miles, 2dp', () => expect(metersToMiles(1609.344)).toBe(1));
  test('meters to miles rounds', () => expect(metersToMiles(5000)).toBe(3.11));
  test('pace from m/s', () => expect(paceFromMps(2.68224)).toBeCloseTo(10, 1)); // 2.68 m/s ≈ 10 min/mi
  test('pace clamps non-positive speed', () => {
    expect(paceFromMps(0)).toBeNull();
    expect(paceFromMps(-1)).toBeNull();
  });
});
```
- [ ] **Step 2: Run to verify fail** `npx vitest run tests/strava.test.js` → FAIL (module missing).
- [ ] **Step 3: Implement `strava.js`:**
```js
// Pure Strava mapping/parsing — no DOM, no network. Unit-tested in tests/strava.test.js.
const RUN_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun']);
const WALK_SPORTS = new Set(['Walk', 'Hike']);

export function stravaKind(sportType) {
  if (RUN_SPORTS.has(sportType)) return 'run';
  if (WALK_SPORTS.has(sportType)) return 'walk';
  return null;
}
// start_date_local is a wall-clock string with a fake 'Z'; slice, never Date-parse.
export function stravaLocalDate(s) { return String(s || '').slice(0, 10); }
export function stravaLocalTime(s) { return String(s || '').slice(11, 16); }
export function metersToMiles(m) { return Math.round((Number(m) || 0) / 1609.344 * 100) / 100; }
export function paceFromMps(mps) {
  if (!(Number(mps) > 0)) return null;
  return 26.8224 / mps; // (1609.344 m/mi) / (60 s/min) / mps = min per mile
}
```
- [ ] **Step 4: Run to verify pass** `npx vitest run tests/strava.test.js` → PASS.
- [ ] **Step 5: Commit** `git add strava.js tests/strava.test.js && git commit -m "feat(strava): sport routing, local date/time, unit conversions"`

### Task 1.2: activity summary → run / walk record mappers

**Files:** Modify `strava.js`, `tests/strava.test.js`

**Interfaces — Consumes:** Task 1.1 helpers. **Produces:**
- `stravaSummaryToRun(a): object` — run record
- `stravaSummaryToWalk(a): object` — walk record (summary only)
- `mapStravaActivities(list): { runs: object[], walks: object[], skipped: number }`

Record field names MUST match existing schema: `id, stravaId, source, bodyPartGroup, date, startTime, distanceMiles, durationMinutes, paceMinPerMile, perceivedEffort, avgHr, maxHr, elevationGain, avgCadence, routePolyline` (run) and `id, stravaId, source, date, startTime, durationMinutes, distanceMiles, speedMph, calories, avgHr` (walk).

- [ ] **Step 1: Write failing tests** (append):
```js
import { stravaSummaryToRun, stravaSummaryToWalk, mapStravaActivities } from '../strava.js';

const runSummary = {
  id: 12345, sport_type: 'Run', start_date_local: '2026-08-14T06:45:00Z',
  distance: 5000, moving_time: 1800, average_speed: 2.78,
  average_heartrate: 152, max_heartrate: 171, total_elevation_gain: 42,
  average_cadence: 82, map: { summary_polyline: 'abc123' }, perceived_exertion: 6,
};

test('run mapper fills the real fields', () => {
  const r = stravaSummaryToRun(runSummary);
  expect(r.id).toBe('strava-12345');
  expect(r.stravaId).toBe(12345);
  expect(r.source).toBe('strava');
  expect(r.bodyPartGroup).toBe('legs');
  expect(r.date).toBe('2026-08-14');
  expect(r.startTime).toBe('06:45');
  expect(r.distanceMiles).toBe(3.11);
  expect(r.durationMinutes).toBe(30);
  expect(r.paceMinPerMile).toBeGreaterThan(0);
  expect(r.avgHr).toBe(152);
  expect(r.maxHr).toBe(171);
  expect(r.elevationGain).toBe(42);
  expect(r.avgCadence).toBe(82);
  expect(r.routePolyline).toBe('abc123');
  expect(r.perceivedEffort).toBe(6);
});

test('walk mapper is summary-only with derived speed', () => {
  const w = stravaSummaryToWalk({ id: 9, sport_type: 'Walk', start_date_local: '2026-08-14T18:00:00Z', distance: 3218.69, moving_time: 3600, average_heartrate: 98, calories: 210 });
  expect(w.id).toBe('strava-9');
  expect(w.distanceMiles).toBe(2);
  expect(w.durationMinutes).toBe(60);
  expect(w.speedMph).toBeCloseTo(2, 1);
  expect(w.avgHr).toBe(98);
  expect(w.calories).toBe(210);
  expect(w.routePolyline).toBeUndefined(); // walks: no route
});

test('mapStravaActivities splits runs/walks and counts skipped', () => {
  const out = mapStravaActivities([runSummary, { id: 2, sport_type: 'Ride' }, { id: 3, sport_type: 'Walk', start_date_local: '2026-08-01T12:00:00Z', distance: 1609.344, moving_time: 1200 }]);
  expect(out.runs).toHaveLength(1);
  expect(out.walks).toHaveLength(1);
  expect(out.skipped).toBe(1);
});
```
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement** the three functions in `strava.js` (use Task 1.1 helpers; `paceMinPerMile` from distance/time; walk `speedMph = distanceMiles / (durationMinutes/60)`; omit `routePolyline` on walks; carry `perceived_exertion`→`perceivedEffort` only when present).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `git commit -am "feat(strava): activity→run/walk record mappers"`

### Task 1.3: polyline decode + stream downsample

**Files:** Modify `strava.js`, `tests/strava.test.js`

**Interfaces — Produces:** `decodePolyline(s: string): [number,number][]`; `downsample(arr: number[], max=150): number[]`

- [ ] **Step 1: Write failing tests:**
```js
import { decodePolyline, downsample } from '../strava.js';
test('decodePolyline decodes the Google example', () => {
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  expect(pts[0][0]).toBeCloseTo(38.5, 1);
  expect(pts[0][1]).toBeCloseTo(-120.2, 1);
  expect(pts).toHaveLength(3);
});
test('decodePolyline empty → []', () => expect(decodePolyline('')).toEqual([]));
test('downsample caps length and keeps endpoints', () => {
  const arr = Array.from({length: 1000}, (_, i) => i);
  const d = downsample(arr, 150);
  expect(d.length).toBeLessThanOrEqual(150);
  expect(d[0]).toBe(0);
  expect(d[d.length - 1]).toBe(999);
});
test('downsample short array is unchanged', () => expect(downsample([1,2,3], 150)).toEqual([1,2,3]));
```
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement** standard Google encoded-polyline decoder (~30 lines) + a stride-based `downsample` that always includes first and last elements.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** `git commit -am "feat(strava): polyline decode + stream downsample"`

### Task 1.4: dedup + manual-overlap detection

**Files:** Modify `strava.js`, `tests/strava.test.js`

**Interfaces — Produces:**
- `alreadyImported(record, existingById): boolean` // existingById is a Set/Map of existing ids
- `probableManualDuplicate(record, existingLogs): boolean` // same date + distance within 10%, source !== 'strava'

- [ ] **Step 1: Write failing tests:**
```js
import { alreadyImported, probableManualDuplicate } from '../strava.js';
test('alreadyImported by deterministic id', () => {
  expect(alreadyImported({ id: 'strava-5' }, new Set(['strava-5']))).toBe(true);
  expect(alreadyImported({ id: 'strava-6' }, new Set(['strava-5']))).toBe(false);
});
test('probableManualDuplicate: same date + within 10% distance, manual only', () => {
  const existing = [{ date: '2026-08-14', distanceMiles: 3.1, source: 'manual' }];
  expect(probableManualDuplicate({ date: '2026-08-14', distanceMiles: 3.11 }, existing)).toBe(true);
  expect(probableManualDuplicate({ date: '2026-08-14', distanceMiles: 5.0 }, existing)).toBe(false);
  expect(probableManualDuplicate({ date: '2026-08-13', distanceMiles: 3.1 }, existing)).toBe(false);
});
test('does not flag against other Strava imports', () => {
  const existing = [{ date: '2026-08-14', distanceMiles: 3.1, source: 'strava' }];
  expect(probableManualDuplicate({ date: '2026-08-14', distanceMiles: 3.1 }, existing)).toBe(false);
});
```
- [ ] **Step 2–4:** verify fail → implement → verify pass.
- [ ] **Step 5: Commit** `git commit -am "feat(strava): dedup + manual-overlap detection"`

---

## Phase 4A — Marco's one-time setup (runbook; unblocks Phase 2). CLAUDE GIVES EXACT STEPS, VERIFIED LIVE, WHEN WE REACH THIS.

- [ ] Create a Strava API application (developers.strava.com → settings) → record **Client ID** + **Client Secret**; set **Authorization Callback Domain** to the Vercel domain (set after first deploy).
- [ ] Create/confirm a personal **Vercel** account (Hobby, free); import the `MarcoMalone/workout-tracker` repo as a project; first **preview deploy**; confirm the app boots + Coach tab loads on the `*.vercel.app` URL (validates Task 0.1).
- [ ] Add Vercel env vars `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.
- [ ] (Claude will verify each step against Strava's + Vercel's live UI before Marco does it.)

---

## Phase 2 — Serverless broker (`/api/strava/*`) — build after Phase 4A deploy exists

Files: `api/strava/callback.js`, `api/strava/sync.js`, `api/strava/activity.js`, `api/strava/backfill.js` (Vercel Node functions). Shared helper `api/strava/_token.js` (refresh-if-expired + rotation return). Handler logic unit-tested with mocked `fetch` in `tests/strava-broker.test.js` (extract pure helpers so they test without the Vercel runtime).

- [ ] **Task 2.1 — token helper:** `refreshIfNeeded({accessToken, expiresAt, refreshToken})` → `{accessToken, expiresAt, refreshToken}`; refreshes at `https://www.strava.com/oauth/token` (grant_type=refresh_token) only when `Date.now()/1000 >= expiresAt - 60`; **returns the rotated refresh token**. Tests (mocked fetch): not-expired → no call; expired → refreshes and surfaces rotated token. TDD.
- [ ] **Task 2.2 — `/callback`:** GET, exchanges `code` (grant_type=authorization_code) → redirects to app root with `#strava_refresh=<t>&athlete=<name>`. Test the pure exchange helper with mocked fetch.
- [ ] **Task 2.3 — `/sync`:** POST `{tokens, after}` → `refreshIfNeeded` → `GET /athlete/activities?after=<after>&per_page=200` → `mapStravaActivities` (import from a copy of `strava.js` usable server-side) → return `{runs, walks, skipped, tokens}`. Test filtering + token passthrough with mocked fetch.
- [ ] **Task 2.4 — `/activity`:** POST `{tokens, id}` → detail + streams → return `{splits, series:{hr,pace,cadence} downsampled, routePolyline}`. Test mapping with a mocked detail payload.
- [ ] **Task 2.5 — `/backfill`:** POST `{tokens, after}` → page `/athlete/activities` to the window, summaries only, throttle (<= Strava limits) → `{runs, walks}`. Test pagination stop condition with mocked fetch.
- Each task: write mocked-fetch test → fail → implement → pass → commit. **Live end-to-end verified on the Vercel preview.**

## Phase 3 — App storage + UI

Files: `db.js` (add `stravaRefreshToken` to `SECRET_SETTINGS`; helpers to read/write Strava tokens + `stravaLastSync` + `stravaAutoSyncOnOpen`; `getRunLogs/getWalkLogs` already exist; add `getLogIds()` for dedup); `ui-settings.js` (Strava connect/disconnect + backfill picker); `ui-log.js` (Sync button + import-preview sheet); `ui-history.js` (run detail: splits bar chart + HR/pace/cadence line charts via Chart.js; "View on Strava" link; lazy `/api/strava/activity` fetch + cache into the record on first open); `strava-client.js` (single-flight sync wrapper + fragment-token capture on load + reconnect state).

- [ ] **Task 3.1 — token storage + fragment capture** (`db.js`, `strava-client.js`): on app load, if `location.hash` has `strava_refresh`, store token + athlete, clear hash. `SECRET_SETTINGS` includes `stravaRefreshToken`. Unit-test the hash-parse helper (pure).
- [ ] **Task 3.2 — Settings: Connect / Disconnect + backfill picker** (`ui-settings.js`): builds the Strava authorize URL (client_id from a public config, redirect to `/api/strava/callback`, scope `activity:read_all`), "Connected as X", backfill choice (All / 1y / 90d / skip). On connect, set `stravaLastSync = now`; if backfill chosen, call `/api/strava/backfill`.
- [ ] **Task 3.3 — Sync button + import preview** (`ui-log.js`): single-flight `syncStrava()` → `/api/strava/sync` with 7-day-overlap `after` → filter out `alreadyImported` → preview sheet with pre-checked rows, `probableManualDuplicate` rows flagged → Import writes run/walk logs (`saveRunLog`/`saveWalkLog` upsert by id) → advance `stravaLastSync` only after resolve.
- [ ] **Task 3.4 — Run detail rich view** (`ui-history.js`): on opening a `source:'strava'` run without cached detail, lazily call `/api/strava/activity`, cache `splits/series/routePolyline` onto the record; render splits bar chart + HR/pace/cadence line charts (Chart.js) + "View on Strava" (`https://www.strava.com/activities/<id>`). Walks unchanged.
- [ ] **Ship:** bump `sw.js` cache + `version.js` + changelog; `npm test`; push.
- Reconnect state: any broker 401 → clear token, show "Reconnect Strava" in Settings.
- **Deferred to fast-follow (own tiny commits after v1 lands):** auto-sync-on-open toggle; in-app SVG route trace (uses `decodePolyline`).

## Phase 4B — Migration cutover (runbook; after Phase 3 verified on Vercel)

- [ ] On github.io app: Settings → Export Backup (JSON). Do NOT have a workout in progress.
- [ ] On Vercel URL: Restore from Backup → verify counts in the restore preview → re-enter Anthropic API key (excluded from backups) → reinstall PWA (add to home screen).
- [ ] Set the Strava Authorization Callback Domain to the final Vercel domain; run the on-device OAuth spike (fragment reaches the installed PWA's IndexedDB; if not, switch to the paste-a-code fallback path).
- [ ] Ship a **tombstone release to GitHub Pages** (bump cache; app renders only "Moved → <Vercel URL>, export your backup here"). Then delete the old PWA + clear old site data.

---

## Self-review notes

- Spec coverage: hardening (0), pure layer (1), broker (2), storage/UI + backfill + lazy detail + preview + dedup + reconnect (3), migration + OAuth spike + tombstone (4A/4B) — all mapped. Follow-on roadmap features intentionally excluded.
- Phases 0–1 are fully TDD with real tests and executable now. Phases 2–4 are task-specced; their live-API details (exact Strava payload field availability, OAuth-in-PWA behavior, Vercel function config) are verified on the preview deploy per the spec's "verify at implementation" list — deliberately not pinned to unverified payload shapes here.
