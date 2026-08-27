import { describe, test, expect } from 'vitest';
import {
  stravaKind, stravaLocalDate, stravaLocalTime, metersToMiles, paceFromMps,
  stravaSummaryToRun, stravaSummaryToWalk, mapStravaActivities,
  decodePolyline, downsample, alreadyImported, probableManualDuplicate, findManualDuplicate, mapStravaDetail,
} from '../strava.js';

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
  test('tolerates empty', () => { expect(stravaLocalDate('')).toBe(''); expect(stravaLocalTime(null)).toBe(''); });
});

describe('unit conversions', () => {
  test('meters to miles, 2dp', () => expect(metersToMiles(1609.344)).toBe(1));
  test('meters to miles rounds', () => expect(metersToMiles(5000)).toBe(3.11));
  test('pace from m/s', () => expect(paceFromMps(2.68224)).toBeCloseTo(10, 1)); // ~10 min/mi
  test('pace clamps non-positive speed', () => {
    expect(paceFromMps(0)).toBeNull();
    expect(paceFromMps(-1)).toBeNull();
  });
});

const runSummary = {
  id: 12345, sport_type: 'Run', start_date_local: '2026-08-14T06:45:00Z',
  distance: 5000, moving_time: 1800, average_speed: 2.78,
  average_heartrate: 152, max_heartrate: 171, total_elevation_gain: 42,
  average_cadence: 82, map: { summary_polyline: 'abc123' }, perceived_exertion: 6,
};

describe('activity → record mappers', () => {
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
  test('run mapper omits fields Strava did not provide', () => {
    const r = stravaSummaryToRun({ id: 1, sport_type: 'Run', start_date_local: '2026-08-14T06:00:00Z', distance: 1609.344, moving_time: 600 });
    expect(r.avgHr).toBeUndefined();
    expect(r.routePolyline).toBeUndefined();
    expect(r.perceivedEffort).toBeUndefined();
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
    const out = mapStravaActivities([
      runSummary,
      { id: 2, sport_type: 'Ride' },
      { id: 3, sport_type: 'Walk', start_date_local: '2026-08-01T12:00:00Z', distance: 1609.344, moving_time: 1200 },
    ]);
    expect(out.runs).toHaveLength(1);
    expect(out.walks).toHaveLength(1);
    expect(out.skipped).toBe(1);
  });
});

describe('decodePolyline', () => {
  test('decodes the Google example', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts).toHaveLength(3);
    expect(pts[0][0]).toBeCloseTo(38.5, 1);
    expect(pts[0][1]).toBeCloseTo(-120.2, 1);
  });
  test('empty → []', () => expect(decodePolyline('')).toEqual([]));
});

describe('downsample', () => {
  test('caps length and keeps endpoints', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);
    const d = downsample(arr, 150);
    expect(d.length).toBeLessThanOrEqual(150);
    expect(d[0]).toBe(0);
    expect(d[d.length - 1]).toBe(999);
  });
  test('short array unchanged', () => expect(downsample([1, 2, 3], 150)).toEqual([1, 2, 3]));
});

describe('mapStravaDetail', () => {
  const detail = {
    splits_standard: [
      { distance: 1609.344, elapsed_time: 540, average_speed: 2.98, average_heartrate: 150 },
      { distance: 1609.344, elapsed_time: 555, average_speed: 2.9 },
    ],
    map: { polyline: 'abc' },
  };
  const streams = {
    distance: { data: Array.from({ length: 800 }, (_, i) => i * 4) },
    heartrate: { data: Array.from({ length: 800 }, (_, i) => 140 + (i % 20)) },
    cadence: { data: Array.from({ length: 800 }, () => 85) },
    velocity_smooth: { data: Array.from({ length: 800 }, () => 2.9) },
  };
  test('maps splits with pace + optional HR', () => {
    const out = mapStravaDetail(detail, streams);
    expect(out.splits).toHaveLength(2);
    expect(out.splits[0].distanceMiles).toBe(1);
    expect(out.splits[0].paceMinPerMile).toBeGreaterThan(0);
    expect(out.splits[0].avgHr).toBe(150);
    expect(out.splits[1].avgHr).toBeUndefined();
  });
  test('carries the route polyline and downsampled, aligned series', () => {
    const out = mapStravaDetail(detail, streams);
    expect(out.routePolyline).toBe('abc');
    expect(out.series.hr.length).toBeLessThanOrEqual(150);
    expect(out.series.pace.length).toBeLessThanOrEqual(150);
    expect(out.series.cadence.length).toBeLessThanOrEqual(150);
    // distance series is in miles and aligned point-for-point with the others
    expect(out.series.dist.length).toBe(out.series.hr.length);
    expect(out.series.dist[0]).toBe(0);
    expect(out.series.dist[out.series.dist.length - 1]).toBeGreaterThan(1);
    expect(out.v).toBe(2);
  });
  test('tolerates missing detail/streams (still stamps a version)', () => {
    expect(mapStravaDetail(null, null)).toEqual({ v: 2 });
    expect(mapStravaDetail({}, {})).toEqual({ v: 2 });
  });
});

describe('dedup + manual-overlap', () => {
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
  test('findManualDuplicate returns the matched manual log (for replace), else null', () => {
    const manual = { id: 'run-abc', date: '2026-08-14', distanceMiles: 3.1, source: 'manual' };
    const existing = [manual, { id: 'strava-9', date: '2026-08-14', distanceMiles: 3.1, source: 'strava' }];
    expect(findManualDuplicate({ date: '2026-08-14', distanceMiles: 3.11 }, existing)).toBe(manual);
    expect(findManualDuplicate({ date: '2026-08-14', distanceMiles: 5.0 }, existing)).toBeNull();
    expect(findManualDuplicate(null, existing)).toBeNull();
  });
});
