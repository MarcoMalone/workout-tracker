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

// Start connect: stash an unguessable state, then navigate to the broker's /connect
// (which forwards the state to Strava; the callback echoes it back for us to verify).
export function beginStravaConnect() {
  const state = randomState();
  try { sessionStorage.setItem(STATE_KEY, state); } catch (e) {}
  window.location.href = `/api/strava/connect?state=${encodeURIComponent(state)}`;
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
  try { expected = sessionStorage.getItem(STATE_KEY); sessionStorage.removeItem(STATE_KEY); } catch (e) {}
  if (!expected || res.state !== expected) { clearHash(); return { status: 'error', error: 'state_mismatch' }; }
  if (!res.refreshToken) { clearHash(); return { status: 'error', error: 'no_token' }; }
  await setSetting('stravaRefreshToken', res.refreshToken);
  await setSetting('stravaAccessToken', res.accessToken);
  await setSetting('stravaExpiresAt', res.expiresAt);
  if (res.athlete) await setSetting('stravaAthlete', res.athlete);
  clearHash();
  return { status: 'connected', athlete: res.athlete };
}

export async function isStravaConnected() {
  return !!(await getSetting('stravaRefreshToken'));
}

export async function disconnectStrava() {
  await setSetting('stravaRefreshToken', '');
  await setSetting('stravaAccessToken', '');
  await setSetting('stravaExpiresAt', 0);
  await setSetting('stravaAthlete', '');
}
