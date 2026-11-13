import { describe, it, expect } from 'vitest';
import { sessionTimes } from '../ui-log.js';
import { edgeScrollStep } from '../reorder-drag.js';

describe('sessionTimes — anchored to the day the workout started', () => {
  const at = (y, mo, d, h, m) => new Date(y, mo - 1, d, h, m, 0, 0).getTime();

  it('reads start and end on the session date, not today', () => {
    // Finished/logged two days later — times must still land on Nov 10.
    const now = at(2026, 11, 12, 20, 0);
    const t = sessionTimes('2026-11-10', '06:30', '07:45', null, now);
    expect(t.startedAt).toBe(at(2026, 11, 10, 6, 30));
    expect(t.finishedAt).toBe(at(2026, 11, 10, 7, 45));
  });

  it('an end time before the start rolls past midnight; start day is kept', () => {
    const t = sessionTimes('2026-11-10', '23:30', '00:40', null);
    expect(t.startedAt).toBe(at(2026, 11, 10, 23, 30));
    expect(t.finishedAt).toBe(at(2026, 11, 11, 0, 40));
  });

  it('no start input keeps the existing start; no end input uses now', () => {
    const start = at(2026, 11, 10, 6, 0);
    const now = at(2026, 11, 10, 7, 0);
    expect(sessionTimes('2026-11-10', '', '', start, now)).toEqual({ startedAt: start, finishedAt: now });
  });
});

describe('edgeScrollStep — drag auto-scroll near the list edges', () => {
  const rect = { top: 100, bottom: 700 };
  it('does nothing in the middle of the list', () => {
    expect(edgeScrollStep(400, rect)).toBe(0);
  });
  it('scrolls up near the top and down near the bottom', () => {
    expect(edgeScrollStep(110, rect)).toBeLessThan(0);
    expect(edgeScrollStep(690, rect)).toBeGreaterThan(0);
  });
  it('is fastest at (or past) the edge', () => {
    expect(edgeScrollStep(700, rect)).toBeGreaterThan(edgeScrollStep(660, rect));
    expect(edgeScrollStep(900, rect)).toBe(edgeScrollStep(700, rect));
  });
});
