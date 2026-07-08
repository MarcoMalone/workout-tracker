import { APP_VERSION, CHANGELOG } from './version.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Show the latest changelog once, only when the stored version changes — never on
// a first run (no stored version yet) and never when unchanged. Stamps the current
// version so it won't show again until the next bump.
export function maybeShowWhatsNew() {
  let seen;
  try { seen = localStorage.getItem('lastSeenVersion'); } catch (e) { return; }
  try { localStorage.setItem('lastSeenVersion', APP_VERSION); } catch (e) {}
  if (!seen || seen === APP_VERSION) return; // first run or unchanged → don't nag

  const entry = CHANGELOG[0];
  if (!entry) return;
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 class="modal-title" style="margin-bottom:0">What's new</h2>
        <button class="modal-dismiss-btn" id="wn-x" aria-label="Dismiss">✕</button>
      </div>
      <p class="settings-hint" style="margin-bottom:10px">Version ${esc(APP_VERSION)}</p>
      <ul class="whatsnew-list">${entry.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      <button class="btn btn-primary btn-full" id="wn-ok" style="margin-top:14px">Got it</button>
    </div>`;
  const close = () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; overlay.onclick = null; };
  overlay.querySelector('#wn-x').addEventListener('click', close);
  overlay.querySelector('#wn-ok').addEventListener('click', close);
  overlay.onclick = e => { if (e.target === overlay) close(); };
}
