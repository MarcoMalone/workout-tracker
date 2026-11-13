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
// How far to auto-scroll this frame for a pointer at clientY inside a scroller whose
// bounding rect is `rect`. Within EDGE px of the top/bottom: scroll toward that edge,
// up to MAX px/frame at the very edge (or beyond it). Otherwise 0.
const EDGE = 70;
const MAX = 14;
export function edgeScrollStep(clientY, rect) {
  const fromTop = clientY - rect.top;
  const fromBottom = rect.bottom - clientY;
  if (fromTop < EDGE) return -Math.ceil(MAX * Math.min(1, (EDGE - fromTop) / EDGE));
  if (fromBottom < EDGE) return Math.ceil(MAX * Math.min(1, (EDGE - fromBottom) / EDGE));
  return 0;
}

// The element that actually scrolls the list: nearest ancestor (or the list itself)
// with scrollable overflow.
function findScroller(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

export function enableReorderDrag(listEl, onDrop) {
  if (!listEl) return;
  listEl.querySelectorAll('.reorder-handle').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      const dragEl = handle.closest('.reorder-group');
      if (!dragEl) return;
      const pid = e.pointerId;
      dragEl.classList.add('dragging');
      const scroller = findScroller(listEl);
      let lastY = e.clientY;
      let raf = 0;

      // Insert the dragged row before the first other row whose midpoint is below
      // the pointer; if none, it belongs at the end.
      const place = y => {
        let ref = null;
        for (const g of listEl.querySelectorAll('.reorder-group')) {
          if (g === dragEl) continue;
          const r = g.getBoundingClientRect();
          if (y < r.top + r.height / 2) { ref = g; break; }
        }
        if (ref) { if (dragEl.nextElementSibling !== ref) listEl.insertBefore(dragEl, ref); }
        else if (listEl.lastElementChild !== dragEl) listEl.appendChild(dragEl);
      };

      // Edge auto-scroll: while the finger is held near the top/bottom of the list's
      // scroller, keep scrolling (faster the closer to the edge) and keep re-placing
      // the row, so an exercise can travel the whole list — not just the visible part.
      const tick = () => {
        raf = 0;
        if (!scroller) return;
        const step = edgeScrollStep(lastY, scroller.getBoundingClientRect());
        if (!step) return;
        const before = scroller.scrollTop;
        scroller.scrollTop = before + step;
        if (scroller.scrollTop !== before) place(lastY);
        raf = requestAnimationFrame(tick);
      };

      const move = ev => {
        if (ev.pointerId !== pid) return;
        ev.preventDefault();
        lastY = ev.clientY;
        place(lastY);
        if (!raf) raf = requestAnimationFrame(tick);
      };
      const end = ev => {
        if (ev.pointerId !== pid) return;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
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
