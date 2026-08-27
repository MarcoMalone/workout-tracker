// Shared Strava broker helpers (server-side only — holds the client secret via env).
// Files prefixed with _ are treated as non-route helpers by Vercel.
// Pure/mockable logic is unit-tested in tests/strava-broker.test.js.

const TOKEN_URL = 'https://www.strava.com/oauth/token';
const API = 'https://www.strava.com/api/v3';

// The Strava client id + secret from Vercel env. Never shipped to the client.
export function creds() {
  return { clientId: process.env.STRAVA_CLIENT_ID, clientSecret: process.env.STRAVA_CLIENT_SECRET };
}

// Refresh when there's no access token or it expires within 60s.
export function shouldRefresh(expiresAt, nowSec = Math.floor(Date.now() / 1000)) {
  return !expiresAt || (Number(expiresAt) - nowSec) <= 60;
}

// Exchange an authorization code for the initial token set (connect flow).
export async function exchangeCode(code, clientId, clientSecret, fetchFn = fetch) {
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
  });
  if (!res.ok) throw new Error(`strava token exchange failed: ${res.status}`);
  return res.json(); // { access_token, refresh_token, expires_at, athlete? }
}

// Ensure a valid access token, refreshing only when needed. Strava may ROTATE the
// refresh token on refresh, so the returned set MUST be persisted by the caller
// (before it processes any activity data).
export async function refreshIfNeeded(tokens, clientId, clientSecret, fetchFn = fetch) {
  if (tokens.accessToken && !shouldRefresh(tokens.expiresAt)) return tokens;
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
  });
  if (!res.ok) { const e = new Error(`strava refresh failed: ${res.status}`); e.status = res.status === 400 ? 401 : res.status; throw e; }
  const j = await res.json();
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expires_at };
}

// Authenticated GET against the Strava API. 401 → tagged so callers can ask the app
// to reconnect.
export async function stravaGet(path, accessToken, fetchFn = fetch) {
  const res = await fetchFn(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) { const e = new Error('strava unauthorized'); e.status = 401; throw e; }
  if (!res.ok) throw new Error(`strava GET ${path} failed: ${res.status}`);
  return res.json();
}

// Vercel auto-parses JSON bodies into req.body; tolerate a raw string too.
export function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

// The app's origin for this request (Vercel sets x-forwarded-host).
export function appOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `https://${host}`;
}

// Block cross-site browser abuse of the broker: a request carrying an Origin that
// isn't this deployment is rejected. Same-origin app calls (Origin === our origin, or
// absent on some same-origin POSTs) pass. Not a substitute for a WAF rate-limit rule,
// but it stops casual/browser-based quota abuse without breaking the app.
export function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === appOrigin(req);
}

// Plain-Node 302 redirect (works across runtimes).
export function redirect(res, url) {
  res.writeHead(302, { Location: url });
  res.end();
}
