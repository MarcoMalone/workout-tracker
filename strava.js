// Pure Strava mapping/parsing — no DOM, no network. Unit-tested in tests/strava.test.js.
// The app UI and the /api/strava serverless broker both build on these functions.

const RUN_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun']);
const WALK_SPORTS = new Set(['Walk', 'Hike']);

// Route a Strava sport_type to the app's log kind, or null to ignore (rides, lifts…).
export function stravaKind(sportType) {
  if (RUN_SPORTS.has(sportType)) return 'run';
  if (WALK_SPORTS.has(sportType)) return 'walk';
  return null;
}

// start_date_local is a wall-clock time with a fake 'Z' suffix. Slice it — NEVER
// Date-parse it: parsing an 8pm local time as UTC can roll the date to the next day.
export function stravaLocalDate(s) { return String(s || '').slice(0, 10); }
export function stravaLocalTime(s) { return String(s || '').slice(11, 16); }

export function metersToMiles(m) { return Math.round((Number(m) || 0) / 1609.344 * 100) / 100; }

// Min per mile from meters/second; null for non-positive speed (paused/zero samples),
// so a chart never plots Infinity.
export function paceFromMps(mps) {
  if (!(Number(mps) > 0)) return null;
  return 26.8224 / mps; // (1609.344 m/mi) / (60 s/min) / mps
}

// Pace (min/mi) from already-converted miles + minutes, 2dp to match the app's
// manual-run pace formatting.
function paceMinMi(distanceMiles, durationMinutes) {
  if (!(distanceMiles > 0) || !(durationMinutes > 0)) return null;
  return Math.round((durationMinutes / distanceMiles) * 100) / 100;
}

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

// Strava summary activity → app run record. Optional fields are attached only when
// Strava provides them. id is deterministic so re-import is an idempotent skip.
export function stravaSummaryToRun(a) {
  const distanceMiles = metersToMiles(a.distance);
  const durationMinutes = round2((Number(a.moving_time) || 0) / 60);
  const rec = {
    id: `strava-${a.id}`,
    stravaId: a.id,
    source: 'strava',
    bodyPartGroup: 'legs',
    date: stravaLocalDate(a.start_date_local),
    startTime: stravaLocalTime(a.start_date_local),
    distanceMiles,
    durationMinutes,
    paceMinPerMile: paceMinMi(distanceMiles, durationMinutes),
  };
  if (a.average_heartrate != null) rec.avgHr = Math.round(a.average_heartrate);
  if (a.max_heartrate != null) rec.maxHr = Math.round(a.max_heartrate);
  if (a.total_elevation_gain != null) rec.elevationGain = a.total_elevation_gain;
  if (a.average_cadence != null) rec.avgCadence = a.average_cadence;
  if (a.map && a.map.summary_polyline) rec.routePolyline = a.map.summary_polyline;
  if (a.perceived_exertion != null) rec.perceivedEffort = a.perceived_exertion;
  return rec;
}

// Strava summary activity → app walk record. Summary only (treadmill walks have no
// route/splits); derives speed from distance/time.
export function stravaSummaryToWalk(a) {
  const distanceMiles = metersToMiles(a.distance);
  const durationMinutes = round2((Number(a.moving_time) || 0) / 60);
  const rec = {
    id: `strava-${a.id}`,
    stravaId: a.id,
    source: 'strava',
    date: stravaLocalDate(a.start_date_local),
    startTime: stravaLocalTime(a.start_date_local),
    distanceMiles,
    durationMinutes,
    speedMph: durationMinutes > 0 ? round2(distanceMiles / (durationMinutes / 60)) : null,
  };
  if (a.average_heartrate != null) rec.avgHr = Math.round(a.average_heartrate);
  if (a.calories != null) rec.calories = a.calories;
  return rec;
}

// Split a list of Strava summaries into run/walk records + a count of ignored activities.
export function mapStravaActivities(list) {
  const runs = [], walks = [];
  let skipped = 0;
  for (const a of (list || [])) {
    const kind = stravaKind(a.sport_type);
    if (kind === 'run') runs.push(stravaSummaryToRun(a));
    else if (kind === 'walk') walks.push(stravaSummaryToWalk(a));
    else skipped++;
  }
  return { runs, walks, skipped };
}

// Detailed activity + streams → the rich per-run extras stored lazily on a run
// record the first time its detail view is opened. Everything is optional.
export function mapStravaDetail(detail, streams) {
  const out = {};
  const d = detail || {};
  const splitsSrc = d.splits_standard || d.splits_metric || [];
  if (splitsSrc.length) {
    out.splits = splitsSrc.map(s => {
      const split = { distanceMiles: metersToMiles(s.distance), elapsedS: s.elapsed_time, paceMinPerMile: paceFromMps(s.average_speed) };
      if (s.average_heartrate != null) split.avgHr = Math.round(s.average_heartrate);
      return split;
    });
  }
  if (d.map && (d.map.polyline || d.map.summary_polyline)) out.routePolyline = d.map.polyline || d.map.summary_polyline;
  const s = streams || {};
  const series = {};
  if (s.heartrate && s.heartrate.data) series.hr = downsample(s.heartrate.data, 150);
  if (s.cadence && s.cadence.data) series.cadence = downsample(s.cadence.data, 150);
  if (s.velocity_smooth && s.velocity_smooth.data) series.pace = downsample(s.velocity_smooth.data.map(paceFromMps), 150);
  if (Object.keys(series).length) out.series = series;
  return out;
}

// Google encoded-polyline algorithm → [[lat, lng], ...].
export function decodePolyline(str) {
  const s = String(str || '');
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < s.length) {
    let result = 0, shift = 0, b;
    do { b = s.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0; shift = 0;
    do { b = s.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

// Reduce a series to at most `max` points, always keeping the first and last.
export function downsample(arr, max = 150) {
  const a = arr || [];
  if (a.length <= max) return a.slice();
  const stride = (a.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(a[Math.round(i * stride)]);
  return out;
}

// Dedup a re-imported activity by its deterministic id.
export function alreadyImported(record, existingIds) {
  return !!(record && existingIds && existingIds.has(record.id));
}

// Find the existing MANUAL log a Strava candidate likely duplicates: same date,
// distance within 10%. Returns the matched log (so the caller can replace it with the
// richer Strava version) or null. Pass same-kind logs (runs for a run candidate, etc.).
export function findManualDuplicate(record, existingLogs) {
  if (!record) return null;
  return (existingLogs || []).find(e =>
    e.source !== 'strava' &&
    e.date === record.date &&
    e.distanceMiles > 0 && record.distanceMiles > 0 &&
    Math.abs(e.distanceMiles - record.distanceMiles) / e.distanceMiles <= 0.10
  ) || null;
}

// Boolean form: does this Strava candidate look like a run the user logged by hand?
export function probableManualDuplicate(record, existingLogs) {
  return !!findManualDuplicate(record, existingLogs);
}
