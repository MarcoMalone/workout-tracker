// Robust pointer-drag reordering for the `.reorder-list` chip UI, shared by the
// in-workout reorder (ui-log.js) and the template-editor reorder (ui-settings.js).
//
// Reorders the DOM nodes LIVE during the drag (no mid-gesture rebuild — a full
// innerHTML rebuild on every move destroyed the element under the finger and reset
// scroll). On release it reports the new order of the rows' `data-gi` values; the
// caller remaps its groups and re-renders exactly once.
//
// Move/up are bound on `window` (NOT the handle) and guarded by pointerId. A previous
// version used setPointerCapture + handle listeners; when capture didn't take on iOS
// the pointerup landed on another element, so `end` — and thus onDrop — never ran, and
// the workout wasn't reordered on Done even though the rows visibly moved. window
// listeners always see the release.
//
// Call after each render(), passing the `.reorder-list` element and an onDrop(order)
// callback where `order` is an array of the rows' data-gi ints in their new order.
export function enableReorderDrag(listEl, onDrop) {
  if (!listEl) return;
  listEl.querySelectorAll('.reorder-handle').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      const dragEl = handle.closest('.reorder-group');
      if (!dragEl) return;
      const pid = e.pointerId;
      dragEl.classList.add('dragging');

      const move = ev => {
        if (ev.pointerId !== pid) return;
        ev.preventDefault();
        // Insert the dragged row before the first other row whose midpoint is below
        // the pointer; if none, it belongs at the end.
        let ref = null;
        for (const g of listEl.querySelectorAll('.reorder-group')) {
          if (g === dragEl) continue;
          const r = g.getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) { ref = g; break; }
        }
        if (ref) { if (dragEl.nextElementSibling !== ref) listEl.insertBefore(dragEl, ref); }
        else if (listEl.lastElementChild !== dragEl) listEl.appendChild(dragEl);
      };
      const end = ev => {
        if (ev.pointerId !== pid) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        dragEl.classList.remove('dragging');
        const order = [...listEl.querySelectorAll('.reorder-group')].map(g => +g.dataset.gi);
        onDrop(order);
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
  });
}
