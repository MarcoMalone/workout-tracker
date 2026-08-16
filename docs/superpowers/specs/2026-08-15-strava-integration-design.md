# Strava Integration — Design Spec

Date: 2026-08-15
Status: approved design, pending implementation plan
App: personal workout-tracker PWA (vanilla JS + IndexedDB), single user (Marco)

## Goal

Pull Strava **runs and walks** — with their rich data — into the app automatically,
so cardio no longer has to be entered by hand. Do it by moving the app to Vercel and
adding a tiny serverless OAuth/data broker, since Strava's API needs a server-side
secret that a static site can't hold.

## Locked decisions

- **Scope:** runs + walks (cardio) only. No strength import (Strava has no set/rep data).
- **Sync model:** manual "Sync from Strava" button **plus** an optional "Auto-sync on
  open" toggle (silent check when the app opens). **No webhooks in v1** (they'd need a
  server-side token store + KV, not worth it solo).
- **Hosting:** migrate the whole app to Vercel (static files + `/api` serverless
  functions on one origin). Retire GitHub Pages after.
- **Data:** capture everything useful (splits, laps, pace, cadence, HR, elevation,
  route polyline); render in-app charts + an SVG route trace; deep-link to Strava for
  the exhaustive view (full map, segments).

## Architecture

- **Vercel** serves the static app and stateless functions under `/api/strava/*`.
- **Secret:** `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` live only as Vercel env vars
  (server-side). Never shipped to the client.
- **Tokens:** the app stores the Strava refresh token (and cached access token + expiry)
  in IndexedDB. Single-user, own account → acceptable.
- **All Strava calls are proxied through the functions** (server-to-server). Keeps the
  secret off the phone and avoids browser CORS (Strava's API doesn't reliably allow it).
- **Refresh-token rotation (verified from Strava docs):** every token response may
  return a *new* refresh token and invalidate the old one. The app MUST persist the
  returned refresh token on every exchange/refresh.

### Serverless endpoints (`/api/strava/`)

1. **`GET /callback`** — OAuth redirect target. Receives `?code`, POSTs
   `client_id + client_secret + code + grant_type=authorization_code` to
   `https://www.strava.com/oauth/token`, then 302-redirects back to the app root with the
   refresh token + athlete name in the URL **fragment** (`#strava_refresh=…&athlete=…`).
   The app reads the fragment, stores it in IndexedDB, and immediately clears the hash.
   (Fragment isn't sent to servers/logs; acceptable for a solo app. Alternative — a
   one-time nonce exchange — is overkill here; noted as a possible hardening later.)
2. **`POST /sync`** — body `{ refreshToken, after? }`. Refreshes the access token
   (persist any rotated refresh token back to the caller), calls
   `GET /athlete/activities?after=<lastSyncEpoch>&per_page=…`, keeps only
   Run/TrailRun/VirtualRun → *run* and Walk/Hike → *walk*, returns
   `{ activities: [summaries…], refreshToken }`. The app saves the (possibly new) token.
3. **`POST /activity`** — body `{ refreshToken, id }`. Fetches `GET /activities/{id}`
   (splits, laps, avg/max HR, elevation, cadence, `map.summary_polyline`) and, when
   useful, `GET /activities/{id}/streams?keys=heartrate,cadence,velocity_smooth,altitude,latlng&key_by_type=true`.
   Returns the rich detail. **Called only for activities you choose to import**, so detail
   fetches stay bounded.

## Data model (IndexedDB additions)

Extend run/walk records (all new fields optional; absence = manual entry as today):

- `stravaId` (number) — dedup key; its presence marks a Strava import.
- `source` — `'strava' | 'manual'`.
- `avgHr`, `maxHr` (bpm), `elevationGain`, `avgCadence`.
- `splits` — `[{ distanceMi, elapsedS, paceMinMi, avgHr? }]`; `laps` — similar summary.
- `routePolyline` — Strava's encoded polyline string (decoded to points for the SVG trace).
- `series` — downsampled (~150–200 pts max) `{ hr[], pace[], cadence[] }` for charts.
  (Do NOT store full raw streams — thousands of points bloat IndexedDB; downsample.)

New settings: `stravaRefreshToken`, `stravaAthleteName`, `stravaLastSync` (epoch),
`stravaAutoSyncOnOpen` (bool). **The Strava token is excluded from JSON backups**, the
same way the Anthropic API key already is, so a shared backup can't leak it.

## Data mapping (Strava → app)

- **Run:** `distance` m→mi · `moving_time` s→min · pace derived · `start_date_local` →
  date + start time · `average_heartrate`→avgHr · `max_heartrate`→maxHr ·
  `total_elevation_gain`→elevationGain · `average_cadence`→avgCadence (Strava reports
  running cadence per-leg; decide ×2 for steps/min at display) · `perceived_exertion`
  (if set)→perceivedEffort · `splits_standard`→splits · `laps`→laps ·
  `map.summary_polyline`→routePolyline.
- **Walk:** `distance`→mi · `moving_time`→duration · speed derived · `calories` (if
  present) · `average_heartrate`→avgHr · start time.
- **Type routing:** Run/TrailRun/VirtualRun→run; Walk/Hike→walk; everything else ignored.

## App UI

- **Settings → Strava:** Connect / Disconnect, "Connected as <name>", "Auto-sync on
  open" toggle.
- **Log tab:** "Sync from Strava" button; if the toggle is on, the same check runs
  quietly on app open. Either way, new runs/walks appear in a **preview list with
  pre-checked checkboxes** (so a stray ride never sneaks in); Import creates the logs and
  fetches each selected activity's rich detail.
- **Run/Walk detail (History):** new sections — splits/laps **bar chart**, HR/pace/
  cadence **line charts** (reuse existing Chart.js), the route as a clean **SVG trace**,
  and a **"View on Strava"** link (`https://www.strava.com/activities/{id}`).

## One-time migration (hosting move)

1. Current github.io app → Settings → **Export Backup** (JSON).
2. Deploy app to **Vercel** (static + `/api`; repo already has a `vercel.json` to review).
   Pick a `*.vercel.app` URL (custom domain optional, later).
3. Register a **Strava API application** → Client ID + Secret; set **Authorization
   Callback Domain** = the Vercel domain.
4. Set Vercel env vars `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`.
5. On the phone: open the new URL → **Restore from Backup** → reinstall the PWA.
6. Turn off GitHub Pages (avoid two live copies). Bump `sw.js` cache as usual.

Hazard: IndexedDB is origin-scoped — skipping export/import loses history. Backup/restore
is existing, tested functionality, so the risk is low if the steps are followed in order.

## Security / privacy

- `client_secret` only in Vercel env (server-side); read-only scope `activity:read_all`
  (no write access to the Strava account).
- Refresh token in client IndexedDB (own account, single user); excluded from backups.
- App↔function is same-origin (no CORS); Strava calls are all server-side.

## Testing

- **Pure functions** carry the logic and are unit-tested with Vitest, no network:
  `stravaActivityToRun` / `…ToWalk` (field mapping + unit conversions), `decodePolyline`,
  `downsampleStream`, dedupe-by-`stravaId`, type routing.
- **Serverless handlers** tested with mocked Strava `fetch` responses (token refresh,
  rotation persistence, filtering).
- **Manual on device:** full connect → sync → preview → import → detail render.

## Out of scope (v1)

Webhooks / true push · strength import · multi-user · full in-app slippy map (SVG trace +
Strava deep-link instead) · bulk historical backfill UI (could add "import last N days"
later).

## To verify at implementation time

- Exact Strava dashboard steps to create the app + set the callback domain (check live
  before Marco touches it).
- Current Strava rate limits (personal volume is far under, but confirm).
- `vercel.json` review for the static + `/api` setup.
- Cadence unit display (per-leg vs steps/min).
- Polyline decoder: small inline implementation vs a tiny dependency.
