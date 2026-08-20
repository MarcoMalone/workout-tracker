# Strava Integration — Design Spec

Date: 2026-08-15 · Revised 2026-08-20 (after a two-agent "Fable" audit — correctness
hardening + historical backfill promoted into v1).
Status: approved design, pending implementation plan.
App: personal workout-tracker PWA (vanilla JS + IndexedDB), single user (Marco).

## Goal

Pull Strava **runs and walks** — with their rich data, and **including a one-time
backfill of existing history** — into the app so cardio isn't entered by hand. Move the
app to Vercel and add a small stateless serverless broker for the Strava OAuth secret.

## Locked decisions

- **Scope:** runs + walks (cardio) only. No strength import.
- **Backfill:** at connect, optionally import history (choose All / past year / past
  90 days / skip). Imports **summaries** (fast, few API calls); rich per-run detail is
  fetched lazily on first view. Manual-overlap flag guards against double-counting.
- **Sync model (v1):** manual "Sync from Strava" button. Auto-sync-on-open is a
  **fast-follow** (after single-flight locking is proven). No webhooks.
- **Hosting:** migrate the whole app to Vercel (static + `/api` serverless, one origin).
  Retire GitHub Pages via a tombstone release.
- **Data:** runs get full rich data (splits, laps→deferred, pace, cadence, HR, elevation,
  route polyline) rendered as in-app charts + "View on Strava"; the in-app SVG route
  trace is a **fast-follow**. Walks = summary only (treadmill, no GPS).

## Architecture

- **Vercel** serves the static app + stateless functions under `/api/strava/*`.
- **Secret:** `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` are Vercel env vars only.
- **Tokens:** app stores refresh token + cached access token + expiry in IndexedDB.
  `stravaRefreshToken` is added to `SECRET_SETTINGS` in `db.js` (excluded from backups).
- **All Strava calls are proxied server-side** (keeps secret off-device, avoids CORS).
- **Refresh-token rotation (verified from Strava docs):** every token response may return
  a new refresh token and invalidate the old one — the client MUST persist the returned
  token **before** it processes any activity data.

### Serverless endpoints (`/api/strava/`)

1. **`GET /callback`** — OAuth redirect target. Exchanges `code` (+ client_id/secret,
   `grant_type=authorization_code`) at `https://www.strava.com/oauth/token`, redirects to
   the app with the refresh token + athlete name in the URL **fragment**; app stores it
   and clears the hash. **Fragment-into-installed-PWA is unproven** (iOS partitions PWA
   storage from the in-app browser), so a **paste-a-code fallback** is a named, built
   alternative — not "later hardening."
2. **`POST /sync`** — body `{ accessToken, expiresAt, refreshToken, after }`. Refreshes
   **only if the access token is expired** (persist any rotated refresh token back to the
   caller), lists activities, filters to runs/walks, returns summaries + the (maybe new)
   token. Client wraps sync in a **single-flight lock**. Any 401 → a designed
   **"Reconnect to Strava"** state (cheap recovery, treated as normal).
3. **`POST /activity`** — body `{ tokens…, id }`. Fetches `GET /activities/{id}` (splits,
   avg/max HR, elevation, cadence, `map.summary_polyline`) + optional
   `GET /activities/{id}/streams?keys=heartrate,cadence,velocity_smooth,altitude&key_by_type=true`.
   **Called lazily** — first time a run's detail view is opened — so detail fetches stay
   bounded even across a big backfill.
4. **`POST /backfill`** (or `/sync` with a `since` param) — pages `GET /athlete/activities`
   over the chosen window (`per_page=200`), summaries only, throttled to stay under
   Strava's limits. One-time at connect.

## Sync watermark & backfill semantics

- First connect sets `stravaLastSync = now` — ongoing sync is **forward-only**.
- Ongoing sync queries with a **7-day overlap window** (`after = stravaLastSync − 7d`)
  because Strava's `after` filters on *start* time, not upload time; `stravaId` dedup
  absorbs the overlap. Watermark advances **only after** the import preview is resolved
  (so closing the app mid-preview never loses activities).
- **Backfill** is a separate paged pull over the chosen window, independent of the
  watermark; it does not advance it.

## Data model (IndexedDB additions)

Extend run/walk records (all optional; absence = manual entry as today):

- **Deterministic id** `strava-<stravaId>` so `put()` is idempotent and dedup is an O(1)
  `get` — no new index, no DB version bump. **Skip-if-exists: never overwrite** an
  existing record (protects in-app edits like an added `perceivedEffort`).
- `stravaId`, `source: 'strava'|'manual'`, `bodyPartGroup: 'legs'` (existing records
  carry it), `avgHr`, `maxHr`, `elevationGain`, `avgCadence`.
- `splits` (deferred: `laps`); `routePolyline` (encoded; decoded for the fast-follow
  trace); `series` — downsampled (~150 pts) `{hr[],pace[],cadence[]}` for charts. No raw
  streams stored.
- Settings: `stravaRefreshToken` (secret), `stravaAthleteName`, `stravaLastSync`,
  `stravaAutoSyncOnOpen` (fast-follow).

## Data mapping (Strava → app) — exact fields

- Reuse the real record fields: `distanceMiles` (m→mi), `durationMinutes`
  (`moving_time` s→min), `paceMinPerMile` (derived), `speedMph` (walks), `calories`,
  `workoutContext`, `notes`, plus the new fields above.
- **Route on `sport_type`** (not legacy `type`): Run/TrailRun/VirtualRun→run,
  Walk/Hike→walk; ignore the rest.
- **`date` by string-slicing `start_date_local`** (a wall-clock string with a fake `Z`);
  **never `new Date()`** — an 8pm CDT run would parse to the next UTC day.
- Pace from `velocity_smooth`: **clamp zero-velocity / paused samples** (avoid Infinity).
- Running cadence is per-leg from Strava — decide ×2 for steps/min at display.

## App UI

- **Settings → Strava:** Connect / Disconnect, "Connected as <name>", backfill picker at
  connect, "Auto-sync on open" toggle (fast-follow).
- **Log tab:** "Sync from Strava" button → preview list of new runs/walks with
  pre-checked checkboxes; rows matching an existing manual log are flagged "possible
  duplicate"; Import creates logs.
- **Run detail (History):** splits **bar chart** + HR/pace/cadence **line charts**
  (Chart.js), "View on Strava" link; SVG route trace is a fast-follow. Walk detail = the
  existing summary view (no charts/route).

## Migration (one-time hosting move) — hardened order

0. **Fix `.vercelignore`** so `vendor/` is NOT excluded (the app statically imports
   `./vendor/anthropic-sdk.js`; excluding it 404s the module graph → blank app). Deploy a
   **Vercel preview** and confirm the app boots + Coach loads on the Vercel URL.
1. **Day-0 on-device OAuth spike** — prove the fragment handoff reaches the *installed
   PWA's* IndexedDB; if it doesn't, use the paste-a-code fallback.
2. On the current github.io app: Settings → **Export Backup** (JSON). Don't migrate with
   a workout in progress (`activeSession` lives in localStorage, doesn't travel).
3. Deploy to Vercel; register the Strava API app (Client ID/Secret; Authorization
   Callback Domain = the Vercel domain); set the Vercel env vars.
4. On the phone: open the new URL → **Restore from Backup** → verify the restore counts
   (the restore preview shows them via `backupSummary`) → **re-enter the Anthropic API
   key** (it's in `SECRET_SETTINGS`, excluded from backups) → reinstall the PWA.
5. Ship a **tombstone release to GitHub Pages** (bump `sw.js` cache; app renders only
   "Moved → <new URL>, export your backup here") so the old cache-first PWA can't keep
   silently accepting workouts. Then delete the old PWA + clear old site data.

## Service worker

- Add `if (url.pathname.startsWith('/api/')) return;` to the fetch handler (don't cache
  API calls; Cache API is GET-only anyway).
- **Precache Chart.js** (currently CDN-loaded, not precached → new run-detail charts
  would be dead offline). Handle Strava-offline/outage with a toast; leave the watermark
  unchanged on failure.

## Security / privacy

- `client_secret` server-side only; read-only scope `activity:read_all`.
- Refresh token in IndexedDB (own account, single user), excluded from backups.
- App↔function same-origin (no CORS); Strava calls server-side. OAuth `state`/CSRF
  hardening skipped (solo app, low value) — acknowledged, not built.

## Testing

- Pure functions unit-tested (Vitest, no network): `stravaActivityToRun/…ToWalk`
  (field mapping, unit conversions, `sport_type` routing, `start_date_local` slicing,
  pace clamping), `decodePolyline`, `downsampleStream`, dedup + manual-overlap match.
- Serverless handlers with mocked Strava `fetch`: token refresh, rotation persistence,
  single-flight, 401→reconnect.
- Manual on device: OAuth spike, connect → backfill → sync → preview → import → detail.

## Out of scope (v1)

Webhooks/push · strength import · multi-user · full in-app slippy map (SVG trace
fast-follow + Strava deep-link) · laps · OAuth CSRF hardening · write-back to Strava.

## Follow-on roadmap (each its own small spec later — NOT this build)

These were surfaced by the audit and are captured deliberately so this build stays
scoped. Several need no Strava and can ship independently:

- **Intensity-weighted, modality-aware load + run-only ACWR with a spike-warning banner**
  (turns the load gauge from minutes-only into an injury-management tool; uses the run
  `perceivedEffort` already captured + Strava HR).
- **Pain history + flare overlay** (pain map is snapshot-only today; no Strava needed).
- **Cross-session asymmetry watch board** (rolls up existing `computeAsymmetry`).
- **Cardio-aware Coach** (feed real runs/HR/pace into the Coach context + a run debrief).
- **Aerobic efficiency / HR-decoupling** and **cadence trend + late-run fade** (Strava).
- **Cardio PR board**; **"Today" readiness+load+pain traffic-light chip**.

Audit-rejected (do not build): full HR-zone system, grade-adjusted pace, return-to-run
program builder, HRV/resting-HR (not in Strava's activity API), VO2max/race predictors,
ML injury prediction.

## To verify at implementation time

- Exact Strava dashboard steps (create app + set callback domain) — check live first.
- Current Strava rate limits (personal volume is far under; confirm before backfill loop).
- `vercel.json` review for static + `/api`.
- Cadence unit display (per-leg vs steps/min).
