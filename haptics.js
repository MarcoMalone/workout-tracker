// Short, named haptic patterns for the active workout. Feature-detected: no-ops
// when the Vibration API is absent (notably iOS Safari) or when the user has
// turned haptics off in Settings. Every haptic is always paired with a visual
// change at the call site, so nothing is lost where vibration is unavailable.
const PATTERNS = {
  tap: 15,          // a set was committed
  rest: 200,        // rest timer hit zero
  pr: [40, 60, 40], // personal record (reserved until live PR detection ships)
};

// Default ON — only 'off' disables.
export function hapticsEnabled() {
  try { return localStorage.getItem('haptics') !== 'off'; } catch (e) { return true; }
}

export function haptic(kind) {
  if (!hapticsEnabled()) return;
  const pattern = PATTERNS[kind];
  if (pattern == null) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch (e) {}
}
