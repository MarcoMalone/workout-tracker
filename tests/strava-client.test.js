// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, test, expect } from 'vitest';
import { parseStravaHash } from '../strava-client.js';

describe('parseStravaHash', () => {
  test('empty / bare hash → none', () => {
    expect(parseStravaHash('')).toEqual({ kind: 'none' });
    expect(parseStravaHash('#')).toEqual({ kind: 'none' });
    expect(parseStravaHash(null)).toEqual({ kind: 'none' });
  });
  test('error fragment', () => {
    expect(parseStravaHash('#strava_error=access_denied')).toEqual({ kind: 'error', error: 'access_denied' });
  });
  test('token fragment parses all fields incl. state', () => {
    const r = parseStravaHash('#strava_refresh=R&strava_access=A&strava_expires=123&athlete=Marco%20Di%20Leo&strava_state=xyz');
    expect(r).toEqual({ kind: 'token', refreshToken: 'R', accessToken: 'A', expiresAt: 123, athlete: 'Marco Di Leo', state: 'xyz' });
  });
  test('missing optional fields default sensibly', () => {
    const r = parseStravaHash('#strava_refresh=R');
    expect(r).toMatchObject({ kind: 'token', refreshToken: 'R', accessToken: '', expiresAt: 0, athlete: '', state: '' });
  });
  test('an unrelated hash is ignored', () => {
    expect(parseStravaHash('#lastTab=log')).toEqual({ kind: 'none' });
  });
});
