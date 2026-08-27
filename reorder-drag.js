// Robust pointer-drag reordering for the `.reorder-list` chip UI, shared by the
// in-workout reorder (ui-log.js) and the template-editor reorder (ui-settings.js).
//
// The previous implementation called the caller's full-innerHTML render() inside the
// pointermove handler, which — on a touch screen — destroyed the element under the
// finger every step and reset the sheet's scroll, so a drag felt broken. This reorders
// the DOM nodes LIVE (no mid-gesture rebuild) and grabs a pointer capture so the sheet
// can't hijack the gesture as a scroll. On drop it reports the new order of the rows'
// `data-gi` values; the caller remaps its groups and re-renders exactly once.
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
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
      dragEl.classList.add('dragging');

      const move = ev => {
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
      const end = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
        dragEl.classList.remove('dragging');
        const order = [...listEl.querySelectorAll('.reorder-group')].map(g => +g.dataset.gi);
        onDrop(order);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
  });
}
