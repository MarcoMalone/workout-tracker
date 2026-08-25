import { describe, test, expect } from 'vitest';
import { shouldRefresh, exchangeCode, refreshIfNeeded, stravaGet } from '../api/strava/_strava.js';

// A tiny fetch stub: returns { ok, status, json }.
const okJson = (obj) => async () => ({ ok: true, status: 200, json: async () => obj });
const failStatus = (status) => async () => ({ ok: false, status, json: async () => ({}) });

describe('shouldRefresh', () => {
  const now = 1_000_000;
  test('refreshes when no expiry', () => expect(shouldRefresh(undefined, now)).toBe(true));
  test('refreshes within 60s of expiry', () => expect(shouldRefresh(now + 30, now)).toBe(true));
  test('does not refresh when comfortably valid', () => expect(shouldRefresh(now + 3600, now)).toBe(false));
});

describe('exchangeCode', () => {
  test('POSTs the code and returns Strava token json', async () => {
    let sentBody;
    const fetchFn = async (_url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ access_token: 'A', refresh_token: 'R', expires_at: 123 }) }; };
    const t = await exchangeCode('the-code', 'cid', 'secret', fetchFn);
    expect(sentBody).toMatchObject({ client_id: 'cid', client_secret: 'secret', code: 'the-code', grant_type: 'authorization_code' });
    expect(t.access_token).toBe('A');
  });
  test('throws on non-ok', async () => {
    await expect(exchangeCode('x', 'c', 's', failStatus(400))).rejects.toThrow();
  });
});

describe('refreshIfNeeded', () => {
  test('skips the network when the access token is still valid', async () => {
    let called = false;
    const fetchFn = async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; };
    const tokens = { accessToken: 'A', refreshToken: 'R', expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    const out = await refreshIfNeeded(tokens, 'c', 's', fetchFn);
    expect(called).toBe(false);
    expect(out).toBe(tokens);
  });
  test('refreshes when expired and surfaces the ROTATED refresh token', async () => {
    const fetchFn = okJson({ access_token: 'A2', refresh_token: 'R2', expires_at: 999 });
    const out = await refreshIfNeeded({ accessToken: 'A1', refreshToken: 'R1', expiresAt: 1 }, 'c', 's', fetchFn);
    expect(out).toEqual({ accessToken: 'A2', refreshToken: 'R2', expiresAt: 999 });
  });
  test('a failed refresh is tagged 401 so the app can prompt reconnect', async () => {
    try { await refreshIfNeeded({ refreshToken: 'R', expiresAt: 1 }, 'c', 's', failStatus(400)); expect.unreachable(); }
    catch (e) { expect(e.status).toBe(401); }
  });
});

describe('stravaGet', () => {
  test('tags 401 for reconnect', async () => {
    try { await stravaGet('/athlete/activities', 'tok', failStatus(401)); expect.unreachable(); }
    catch (e) { expect(e.status).toBe(401); }
  });
  test('returns json on success', async () => {
    const out = await stravaGet('/athlete/activities', 'tok', okJson([{ id: 1 }]));
    expect(out).toEqual([{ id: 1 }]);
  });
});
