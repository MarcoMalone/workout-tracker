import { describe, test, expect } from 'vitest';
import { backupSummary } from '../db.js';
import { APP_VERSION, CHANGELOG } from '../version.js';

describe('backupSummary', () => {
  test('counts each store from a snapshot', () => {
    const data = { stores: { logged_sessions: [1, 2, 3], workout_templates: [1], exercise_definitions: [1, 2], run_logs: [], walk_logs: [1] } };
    expect(backupSummary(data)).toEqual({ workouts: 3, templates: 1, exercises: 2, runs: 0, walks: 1 });
  });

  test('missing / invalid data → zeros, no throw', () => {
    const zero = { workouts: 0, templates: 0, exercises: 0, runs: 0, walks: 0 };
    expect(backupSummary(null)).toEqual(zero);
    expect(backupSummary({})).toEqual(zero);
    expect(backupSummary({ stores: { logged_sessions: 'nope' } }).workouts).toBe(0);
  });
});

describe('version', () => {
  test('APP_VERSION is a non-empty string', () => {
    expect(typeof APP_VERSION).toBe('string');
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });

  test('CHANGELOG entries are well-formed and the newest matches APP_VERSION', () => {
    expect(Array.isArray(CHANGELOG)).toBe(true);
    expect(CHANGELOG.length).toBeGreaterThan(0);
    for (const c of CHANGELOG) {
      expect(typeof c.v).toBe('string');
      expect(typeof c.date).toBe('string');
      expect(Array.isArray(c.items)).toBe(true);
      expect(c.items.length).toBeGreaterThan(0);
    }
    expect(CHANGELOG[0].v).toBe(APP_VERSION);
  });
});
