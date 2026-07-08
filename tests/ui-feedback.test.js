// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { toast, undoToast, confirmSheet, showToast } from '../ui-feedback.js';

beforeEach(() => { document.body.innerHTML = '<div id="modal-overlay" class="hidden"></div>'; });

describe('toast', () => {
  test('renders the message with a type class', () => {
    toast('Saved', { type: 'success' });
    const t = document.querySelector('.toast');
    expect(t).toBeTruthy();
    expect(t.classList.contains('toast-success')).toBe(true);
    expect(t.textContent).toContain('Saved');
  });

  test('one at a time — a new toast replaces the previous', () => {
    toast('first');
    toast('second');
    const all = document.querySelectorAll('.toast');
    expect(all.length).toBe(1);
    expect(all[0].textContent).toContain('second');
  });

  test('action button fires the callback and dismisses', () => {
    const cb = vi.fn();
    toast('Removed', { action: { label: 'Undo', onClick: cb } });
    const btn = document.querySelector('.toast-action');
    expect(btn.textContent).toBe('Undo');
    btn.click();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.toast')).toBeNull();
  });

  test('undoToast wires the undo fn', () => {
    const undo = vi.fn();
    undoToast('Deleted', undo);
    document.querySelector('.toast-action').click();
    expect(undo).toHaveBeenCalled();
  });

  test('showToast alias still renders', () => {
    showToast('hi');
    expect(document.querySelector('.toast').textContent).toContain('hi');
  });
});

describe('confirmSheet', () => {
  test('resolves true on confirm and closes the overlay', async () => {
    const p = confirmSheet({ title: 'Delete goal?', confirmLabel: 'Delete', danger: true });
    document.getElementById('cf-yes').click();
    expect(await p).toBe(true);
    const overlay = document.getElementById('modal-overlay');
    expect(overlay.classList.contains('hidden')).toBe(true);
    expect(overlay.innerHTML).toBe('');
  });

  test('resolves false on cancel', async () => {
    const p = confirmSheet({ title: 'Delete goal?' });
    document.getElementById('cf-no').click();
    expect(await p).toBe(false);
  });

  test('resolves false on backdrop tap', async () => {
    const p = confirmSheet({ title: 'Delete goal?' });
    document.getElementById('modal-overlay').click();
    expect(await p).toBe(false);
  });

  test('renders a danger button + body copy', async () => {
    const p = confirmSheet({ title: 'Discard workout?', body: 'All logged data will be lost.', danger: true });
    expect(document.querySelector('.btn-danger')).toBeTruthy();
    expect(document.getElementById('modal-overlay').textContent).toContain('All logged data will be lost.');
    document.getElementById('cf-no').click();
    await p;
  });
});
