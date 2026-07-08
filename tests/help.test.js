// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { DEFS, showTermSheet, wireInfo, termSpan, infoBtnHTML, helpSeen, markHelpSeen } from '../help.js';

// The base test env's localStorage is a non-functional stub; install a real one.
const _store = new Map();
globalThis.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: k => { _store.delete(k); },
  clear: () => { _store.clear(); },
};

// ── DEFS integrity ───────────────────────────────────────────────────────────
describe('DEFS', () => {
  test('every term has label + short + body, and keys are unique', () => {
    const keys = Object.keys(DEFS);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) {
      expect(DEFS[k].label, k).toBeTruthy();
      expect(DEFS[k].short, k).toBeTruthy();
      expect(DEFS[k].body, k).toBeTruthy();
    }
  });

  test('covers the jargon the wire-ups reference', () => {
    for (const k of ['acwr', 'e1rm', 'readiness', 'volume', 'stall', 'deload', 'asymmetry']) {
      expect(DEFS[k], k).toBeDefined();
    }
  });
});

// ── showTermSheet + wireInfo ───────────────────────────────────────────────────
describe('showTermSheet', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="modal-overlay" class="hidden"></div>'; });

  test('renders the term label + short into the overlay and shows it', () => {
    showTermSheet('acwr');
    const overlay = document.getElementById('modal-overlay');
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(overlay.textContent).toContain(DEFS.acwr.label);
    expect(overlay.textContent).toContain('last 28');
  });

  test('dismiss closes and clears the overlay', () => {
    showTermSheet('e1rm');
    document.getElementById('term-dismiss').click();
    const overlay = document.getElementById('modal-overlay');
    expect(overlay.classList.contains('hidden')).toBe(true);
    expect(overlay.innerHTML).toBe('');
  });

  test('unknown term is a no-op (overlay stays hidden)', () => {
    showTermSheet('does-not-exist');
    expect(document.getElementById('modal-overlay').classList.contains('hidden')).toBe(true);
  });
});

describe('wireInfo', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="modal-overlay" class="hidden"></div>'; });

  test('opens the sheet from an info button', () => {
    const c = document.createElement('div');
    c.innerHTML = infoBtnHTML('stall');
    document.body.appendChild(c);
    wireInfo(c);
    c.querySelector('.info-btn').click();
    expect(document.getElementById('modal-overlay').textContent).toContain(DEFS.stall.label);
  });

  test('opens the sheet from a glossary term', () => {
    const c = document.createElement('div');
    c.innerHTML = termSpan('deload', 'deload');
    document.body.appendChild(c);
    wireInfo(c);
    c.querySelector('.gloss').click();
    expect(document.getElementById('modal-overlay').textContent).toContain(DEFS.deload.label);
  });

  test('is idempotent — re-wiring does not double-bind', () => {
    const c = document.createElement('div');
    c.innerHTML = infoBtnHTML('volume');
    document.body.appendChild(c);
    wireInfo(c); wireInfo(c);
    expect(c.querySelector('.info-btn')._infoWired).toBe(true);
  });
});

// ── help registry ──────────────────────────────────────────────────────────────
describe('help registry', () => {
  beforeEach(() => _store.clear());

  test('helpSeen/markHelpSeen round-trips', () => {
    expect(helpSeen('tip-first-stall')).toBe(false);
    markHelpSeen('tip-first-stall');
    expect(helpSeen('tip-first-stall')).toBe(true);
  });

  test('tolerates corrupt storage', () => {
    _store.set('wt.help', 'not json');
    expect(helpSeen('anything')).toBe(false);
    expect(() => markHelpSeen('x')).not.toThrow();
  });
});
