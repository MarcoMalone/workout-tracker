import { describe, it, expect } from 'vitest';
import { SEED_EXERCISES, SEED_TEMPLATES } from '../seed-data.js';

describe('scaffold', () => {
  it('SEED_EXERCISES is an array', () => {
    expect(Array.isArray(SEED_EXERCISES)).toBe(true);
  });
  it('SEED_TEMPLATES is an array', () => {
    expect(Array.isArray(SEED_TEMPLATES)).toBe(true);
  });
});
