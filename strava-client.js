// Client side of the Strava connect flow: kick off OAuth via the broker, then capture
// the token that comes back in the URL fragment and enforce the CSRF `state` check.
// The heavy sync/import logic lives elsewhere; this is just connect + token storage.
import { getSetting, setSetting } from './db.js';

const STATE_KEY = 'stravaOAuthState';

// Pure: parse the app's return fragment into a typed result. Unit-tested.
export function parseStravaHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  if (!h) return { kind: 'none' };
  const p = new URLSearchParams(h);
  if (p.has('strava_error')) return { kind: 'error', error: p.get('strava_error') };
  if (p.has('strava_refresh')) {
    return {
      kind: 'token',
      refreshToken: p.get('strava_refresh') || '',
      accessToken: p.get('strava_access') || '',
      expiresAt: Number(p.get('strava_expires')) || 0,
      athlete: p.get('athlete') || '',
      state: p.get('strava_state') || '',
    };
  }
  return { kind: 'none' };
}

function randomState() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Start connect: stash an unguessable state, then open the broker's /connect (which
// forwards the state to Strava; the callback echoes it back for us to verify).
// Open in a SEPARATE tab, not via location.href: on an installed iOS PWA a same-window
// navigation to the out-of-scope OAuth URL leaves a dead "page not found" behind in the
// app and can fire the callback twice (consuming the single-use code). A new tab keeps
// the app on Settings; the user copies the code the callback shows and pastes it back.
// localStorage (not sessionStorage) so the state survives the OAuth app-switch.
export function beginStravaConnect() {
  const state = randomState();
  try { localStorage.setItem(STATE_KEY, state); } catch (e) {}
  const url = `/api/strava/connect?state=${encodeURIComponent(state)}`;
  const opened = window.open(url, '_blank');
  if (!opened) window.location.href = url; // popup blocked → fall back to same-window nav
}

// On app load: if we returned from Strava, verify state, store tokens, clear the hash.
// Returns { status: 'none'|'connected'|'error', athlete?, error? } to toast.
export async function captureStravaFragment() {
  const res = parseStravaHash(typeof window !== 'undefined' ? window.location.hash : '');
  if (res.kind === 'none') return { status: 'none' };
  const clearHash = () => {
    try { history.replaceState(null, '', window.location.pathname + window.location.search); }
    catch (e) { window.location.hash = ''; }
  };
  if (res.kind === 'error') { clearHash(); return { status: 'error', error: res.error }; }
  let expected = null;
  try { expected = localStorage.getItem(STATE_KEY); localStorage.removeItem(STATE_KEY); } catch (e) {}
  if (!expected || res.state !== expected) { clearHash(); return { status: 'error', error: 'state_mismatch' }; }
  if (!res.refreshToken) { clearHash(); return { status: 'error', error: 'no_token' }; }
  await setSetting('stravaRefreshToken', res.refreshToken);
  await setSetting('stravaAccessToken', res.accessToken);
  await setSetting('stravaExpiresAt', res.expiresAt);
  if (res.athlete) await setSetting('stravaAthlete', res.athlete);
  clearHash();
  return { status: 'connected', athlete: res.athlete };
}

// Pure: decode a pasted connection code (base64url of the callback fragment) into the
// same shape parseStravaHash returns. Used by the iOS-PWA paste fallback. Unit-tested.
export function decodeStravaCode(codeStr) {
  const clean = String(codeStr || '').trim();
  if (!clean) return { kind: 'none' };
  let b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  let fragment;
  try {
    fragment = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  } catch (e) { return { kind: 'none' }; }
  return parseStravaHash('#' + fragment);
}

// Redeem a pasted connection code: verify state (when we still have the stored one)
// and persist the tokens, mirroring captureStravaFragment.
export async function redeemStravaCode(codeStr) {
  const res = decodeStravaCode(codeStr);
  if (res.kind !== 'token' || !res.refreshToken) { const e = new Error('invalid code'); e.code = 'bad_code'; throw e; }
  let expected = null;
  try { expected = localStorage.getItem(STATE_KEY); } catch (e) {}
  // CSRF: the pasted code must carry the state we generated at connect time. STATE_KEY
  // lives in localStorage, which survives the iOS OAuth app-switch AND a full app restart,
  // so enforce it unconditionally — same as the redirect path (captureStravaFragment).
  // A missing state means this paste wasn't solicited by a connect on this device: reject it.
  if (!expected || !res.state || res.state !== expected) { const e = new Error('state mismatch'); e.code = 'state_mismatch'; throw e; }
  try { localStorage.removeItem(STATE_KEY); } catch (e) {}
  await setSetting('stravaRefreshToken', res.refreshToken);
  await setSetting('stravaAccessToken', res.accessToken);
  await setSetting('stravaExpiresAt', res.expiresAt);
  if (res.athlete) await setSetting('stravaAthlete', res.athlete);
  return { status: 'connected', athlete: res.athlete };
}

export async function isStravaConnected() {
  return !!(await getSetting('stravaRefreshToken'));
}

// The token set we send to the broker (it refreshes if expired and returns a fresh,
// possibly-rotated set we persist).
async function readTokens() {
  const [accessToken, refreshToken, expiresAt] = await Promise.all([
    getSetting('stravaAccessToken'), getSetting('stravaRefreshToken'), getSetting('stravaExpiresAt'),
  ]);
  return { accessToken: accessToken || '', refreshToken: refreshToken || '', expiresAt: Number(expiresAt) || 0 };
}
async function saveTokens(t) {
  if (!t) return;
  if (t.refreshToken) await setSetting('stravaRefreshToken', t.refreshToken);
  if (t.accessToken) await setSetting('stravaAccessToken', t.accessToken);
  if (t.expiresAt) await setSetting('stravaExpiresAt', t.expiresAt);
}

// A broker POST that carries tokens and persists any rotation. 401 → disconnect +
// throw an Error with code 'reconnect'. Not-connected throws code 'not_connected'.
async function brokerPost(path, extra = {}) {
  const tokens = await readTokens();
  if (!tokens.refreshToken) { const e = new Error('not connected'); e.code = 'not_connected'; throw e; }
  const res = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...tokens, ...extra }),
  });
  if (res.status === 401) { await disconnectStrava(); const e = new Error('reconnect'); e.code = 'reconnect'; throw e; }
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  const data = await res.json();
  await saveTokens(data.tokens);
  return data;
}

// List new runs/walks. mode 'sync' (recent) or 'backfill' (paged history).
export async function stravaFetchActivities({ mode = 'sync', after = 0 } = {}) {
  const data = await brokerPost(`/api/strava/${mode === 'backfill' ? 'backfill' : 'sync'}`, { after });
  return { runs: data.runs || [], walks: data.walks || [], skipped: data.skipped || 0 };
}

// Fetch one activity's rich detail (splits, series, route) for the run detail view.
export async function stravaFetchDetail(id) {
  const data = await brokerPost('/api/strava/activity', { id });
  return data.detail || {};
}

export async function getStravaLastSync() { return Number(await getSetting('stravaLastSync')) || 0; }
export async function setStravaLastSync(epoch) { await setSetting('stravaLastSync', epoch); }

export async function disconnectStrava() {
  await setSetting('stravaRefreshToken', '');
  await setSetting('stravaAccessToken', '');
  await setSetting('stravaExpiresAt', 0);
  await setSetting('stravaAthlete', '');
}
