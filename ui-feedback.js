// One place for user feedback: toasts (info/success/error, with an optional
// action button used for Undo) and a themed confirm sheet that replaces the raw
// browser confirm(). Everything reuses the app's existing overlay + toast styling.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer = null;

// toast(msg, { type: 'info'|'success'|'error', action: {label, onClick}, duration })
// One at a time — a new toast replaces any showing one. Toasts with an action
// (e.g. Undo) dwell longer so there's time to tap.
export function toast(msg, opts = {}) {
  const { type = 'info', action = null, duration } = opts;
  document.querySelectorAll('.toast').forEach(t => t.remove());
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }

  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const span = document.createElement('span');
  span.className = 'toast-msg';
  span.textContent = msg;
  t.appendChild(span);

  if (action && action.label) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.type = 'button';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      t.remove();
      try { action.onClick && action.onClick(); } catch (e) {}
    });
    t.appendChild(btn);
  }

  document.body.appendChild(t);
  const ms = duration != null ? duration : (action ? 6000 : 2500);
  toastTimer = setTimeout(() => { t.remove(); toastTimer = null; }, ms);
  return t;
}

// Convenience: an "X · Undo" toast that reverses an action.
export function undoToast(message, undoFn) {
  return toast(message, { action: { label: 'Undo', onClick: undoFn } });
}

// Back-compat alias for the old showToast(msg, duration) call sites.
export const showToast = (msg, duration) => toast(msg, duration != null ? { duration } : {});

// Themed replacement for confirm(). Resolves true on confirm, false on
// cancel/backdrop/dismiss. danger:true → red confirm button.
export function confirmSheet({ title, body = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) { resolve(false); return; }
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="modal-sheet confirm-sheet">
        <h2 class="modal-title" style="margin-bottom:0">${esc(title)}</h2>
        ${body ? `<p class="confirm-body">${esc(body)}</p>` : ''}
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-full" id="cf-yes" style="margin-top:18px">${esc(confirmLabel)}</button>
        <button class="btn btn-ghost btn-full" id="cf-no" style="margin-top:8px">${esc(cancelLabel)}</button>
      </div>`;
    let done = false;
    const close = val => {
      if (done) return;
      done = true;
      overlay.classList.add('hidden');
      overlay.innerHTML = '';
      overlay.onclick = null;
      resolve(val);
    };
    overlay.querySelector('#cf-yes').addEventListener('click', () => close(true));
    overlay.querySelector('#cf-no').addEventListener('click', () => close(false));
    overlay.onclick = e => { if (e.target === overlay) close(false); };
  });
}
