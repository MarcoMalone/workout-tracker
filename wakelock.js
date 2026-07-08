// Screen Wake Lock for active workouts — keeps the phone display awake while a
// session is in progress. Feature-detected (works on iOS Safari as of 2025);
// no-ops where unsupported or when the user turns it off. The lock auto-releases
// when the tab is backgrounded, so we re-acquire on visibilitychange while a
// session is active (the classic lost-lock bug).
let sentinel = null;
let active = false;
let listenerBound = false;

export function wakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

// Default ON — only 'off' disables.
export function wakeLockEnabled() {
  try { return localStorage.getItem('keepScreenOn') !== 'off'; } catch (e) { return true; }
}

async function request() {
  if (!active || !wakeLockEnabled() || !wakeLockSupported()) return;
  if (sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener?.('release', () => { sentinel = null; });
  } catch (e) { sentinel = null; }
}

function onVisibility() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') request();
}

export async function acquire() {
  active = true;
  if (!listenerBound && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    listenerBound = true;
  }
  await request();
}

export async function release() {
  active = false;
  if (sentinel) {
    try { await sentinel.release(); } catch (e) {}
    sentinel = null;
  }
}

// Test-only introspection.
export function _isHeld() { return !!sentinel; }
export function _isActive() { return active; }
