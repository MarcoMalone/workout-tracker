// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { haptic, hapticsEnabled } from '../haptics.js';
import { acquire, release, wakeLockSupported, wakeLockEnabled, _isHeld } from '../wakelock.js';
import { cloneLastSet, stripEmptySets } from '../ui-log.js';

// The base test env's localStorage is a non-functional stub. Install a real
// in-memory Storage so the on/off preference paths are exercisable.
const _store = new Map();
globalThis.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: k => { _store.delete(k); },
  clear: () => { _store.clear(); },
};
function resetPrefs() { _store.clear(); }

// ── haptics ────────────────────────────────────────────────────────────────
describe('haptics', () => {
  beforeEach(() => { resetPrefs(); });
  afterEach(() => { delete navigator.vibrate; });

  test('enabled by default; disabled only by the "off" flag', () => {
    expect(hapticsEnabled()).toBe(true);
    localStorage.setItem('haptics', 'off');
    expect(hapticsEnabled()).toBe(false);
  });

  test('vibrates with the pattern for a known kind when supported', () => {
    const spy = vi.fn();
    navigator.vibrate = spy;
    haptic('tap');
    expect(spy).toHaveBeenCalledWith(15);
    haptic('rest');
    expect(spy).toHaveBeenCalledWith(200);
  });

  test('no-ops when the user turned haptics off', () => {
    localStorage.setItem('haptics', 'off');
    const spy = vi.fn();
    navigator.vibrate = spy;
    haptic('tap');
    expect(spy).not.toHaveBeenCalled();
  });

  test('does not throw when the Vibration API is absent', () => {
    delete navigator.vibrate;
    expect(() => haptic('rest')).not.toThrow();
  });

  test('ignores unknown kinds', () => {
    const spy = vi.fn();
    navigator.vibrate = spy;
    haptic('nope');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── wake lock ────────────────────────────────────────────────────────────────
describe('wake lock', () => {
  beforeEach(async () => { resetPrefs(); await release(); });
  afterEach(async () => { await release(); delete navigator.wakeLock; });

  test('supported reflects API presence', () => {
    delete navigator.wakeLock;
    expect(wakeLockSupported()).toBe(false);
    navigator.wakeLock = { request: () => {} };
    expect(wakeLockSupported()).toBe(true);
  });

  test('acquires and releases a sentinel when enabled and supported', async () => {
    const sentinel = { release: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn() };
    navigator.wakeLock = { request: vi.fn().mockResolvedValue(sentinel) };
    await acquire();
    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(_isHeld()).toBe(true);
    await release();
    expect(sentinel.release).toHaveBeenCalled();
    expect(_isHeld()).toBe(false);
  });

  test('no-ops when the user turned it off', async () => {
    localStorage.setItem('keepScreenOn', 'off');
    expect(wakeLockEnabled()).toBe(false);
    navigator.wakeLock = { request: vi.fn() };
    await acquire();
    expect(navigator.wakeLock.request).not.toHaveBeenCalled();
    expect(_isHeld()).toBe(false);
  });

  test('does not throw when unsupported', async () => {
    delete navigator.wakeLock;
    await expect(acquire()).resolves.not.toThrow?.();
    expect(_isHeld()).toBe(false);
  });
});

// ── cloneLastSet ────────────────────────────────────────────────────────────
describe('stripEmptySets', () => {
  test('drops sets with no weight/reps/seconds and renumbers', () => {
    const out = stripEmptySets([
      { exerciseId: 'a', sets: [
        { setNumber: 1, weight: 135, reps: 8, seconds: null },
        { setNumber: 2, weight: null, reps: null, seconds: null }, // empty → dropped
        { setNumber: 3, weight: 185, reps: 6, seconds: null },
      ] },
    ]);
    expect(out[0].sets).toHaveLength(2);
    expect(out[0].sets.map(s => s.setNumber)).toEqual([1, 2]);
    expect(out[0].sets[1].weight).toBe(185);
  });

  test('keeps timed/bodyweight sets; tolerates empty input', () => {
    expect(stripEmptySets([{ sets: [{ seconds: 45 }, { weight: null, reps: null, seconds: null }] }])[0].sets).toHaveLength(1);
    expect(stripEmptySets([{ sets: [{ reps: 10 }] }])[0].sets).toHaveLength(1);
    expect(stripEmptySets([])).toEqual([]);
    expect(stripEmptySets(undefined)).toEqual([]);
  });
});

describe('cloneLastSet', () => {
  test('clones the last set, marks it done, never a drop set', () => {
    const sets = [
      { setNumber: 1, weight: 135, reps: 8, seconds: null, side: null, isDropSet: false },
      { setNumber: 2, weight: 185, reps: 6, seconds: null, side: null, isDropSet: false },
    ];
    const c = cloneLastSet(sets);
    expect(c).toMatchObject({ setNumber: 3, weight: 185, reps: 6, done: true, isDropSet: false, parentSetIndex: null });
  });

  test('carries side and seconds for timed/unilateral work', () => {
    const c = cloneLastSet([{ setNumber: 1, weight: null, reps: null, seconds: 45, side: 'L' }]);
    expect(c.seconds).toBe(45);
    expect(c.side).toBe('L');
    expect(c.weight).toBeNull();
  });

  test('returns null for an empty or missing set list', () => {
    expect(cloneLastSet([])).toBeNull();
    expect(cloneLastSet(null)).toBeNull();
    expect(cloneLastSet(undefined)).toBeNull();
  });
});
