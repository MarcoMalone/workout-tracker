// Screen Wake Lock for active workouts — keeps the phone display awake while a
// session is in progress. Feature-detected; no-ops where unsupported or when the
// user turns it off.
//
// iOS/WebKit gotcha (why this is more than one request() call): WebKit only grants
// the lock during a user gesture ("transient activation"). A request made with no
// tap behind it — after the auto-update reload restores a workout, or when the app
// comes back from the background (visibilitychange) — is rejected, and the lock also
// drops whenever the app is backgrounded. So while a workout is active we re-request
// on EVERY tap until the lock is actually held. iOS may also refuse it outright
// (e.g. Low Power Mode); then the chip says so instead of claiming the screen is on.
let sentinel = null;
let pending = null;
let active = false;
let listenersBound = false;

export function wakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

// Default ON — only 'off' disables.
export function wakeLockEnabled() {
  try { return localStorage.getItem('keepScreenOn') !== 'off'; } catch (e) { return true; }
}

// Tell the UI whether the screen is really being held awake right now.
function notify() {
  if (typeof document === 'undefined') return;
  try { document.dispatchEvent(new CustomEvent('wakelockchange', { detail: { held: !!sentinel } })); } catch (e) {}
}

function request() {
  if (!active || !wakeLockEnabled() || !wakeLockSupported()) return Promise.resolve();
  if (sentinel) return Promise.resolve();
  if (pending) return pending; // one request in flight at a time — no orphaned locks
  pending = (async () => {
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!active) { try { await s.release(); } catch (e) {} return; } // workout ended meanwhile
      sentinel = s;
      s.addEventListener?.('release', () => { if (sentinel === s) { sentinel = null; notify(); } });
    } catch (e) {
      sentinel = null;
    } finally {
      pending = null;
      notify();
    }
  })();
  return pending;
}

function onVisibility() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') request();
}

// Any tap while a workout is active and the lock isn't held → try again, inside the
// gesture so WebKit allows it. Cheap: request() returns immediately once held.
function onGesture() {
  if (active && !sentinel) request();
}

export async function acquire() {
  active = true;
  if (!listenersBound && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('click', onGesture, true);
    document.addEventListener('touchend', onGesture, true);
    listenersBound = true;
  }
  await request();
}

export async function release() {
  active = false;
  if (sentinel) {
    const s = sentinel;
    sentinel = null;
    try { await s.release(); } catch (e) {}
  }
  notify();
}

// Whether the lock is actually held right now (the chip uses this).
export function wakeLockHeld() { return !!sentinel; }

// Test-only introspection.
export function _isHeld() { return !!sentinel; }
export function _isActive() { return active; }
