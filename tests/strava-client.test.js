// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, test, expect } from 'vitest';
import { parseStravaHash, decodeStravaCode } from '../strava-client.js';

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

describe('decodeStravaCode', () => {
  test('round-trips a base64url code (as the callback emits it) into a token', () => {
    const fragment = new URLSearchParams({
      strava_refresh: 'R', strava_access: 'A', strava_expires: '123',
      athlete: 'Marco Di Leo', strava_state: 'xyz',
    }).toString();
    const code = Buffer.from(fragment, 'utf8').toString('base64url');
    expect(decodeStravaCode(code)).toEqual({
      kind: 'token', refreshToken: 'R', accessToken: 'A', expiresAt: 123, athlete: 'Marco Di Leo', state: 'xyz',
    });
  });
  test('tolerates surrounding whitespace from a paste', () => {
    const code = Buffer.from('strava_refresh=R', 'utf8').toString('base64url');
    expect(decodeStravaCode(`  ${code}\n`)).toMatchObject({ kind: 'token', refreshToken: 'R' });
  });
  test('empty or garbage → none (no throw)', () => {
    expect(decodeStravaCode('')).toEqual({ kind: 'none' });
    expect(decodeStravaCode('!!!not-valid!!!')).toEqual({ kind: 'none' });
  });
});
