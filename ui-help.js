import { getSetting } from './db.js';
import { askHelp } from './claude-api.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Curated answers — work offline / without an API key. The free-form "Ask" box
// below uses the coach model when a key is set.
const FAQ = [
  { q: 'Where do I log how I feel today?', a: 'Log tab → the "Morning Check-In" card. Rate sleep, energy, soreness, and mood — it becomes a 0–100 readiness score your Coach uses for pre-workout advice.' },
  { q: 'I have an injury to tell my coach before working out — where?', a: 'For soreness/pain today: Coach tab → "Body Check-In" (tap the region, set 0–10), or add it to the pre-workout note. For an ongoing injury the coach should remember for weeks (e.g. "avoiding arms — forearm strain"): Settings → Coach Profile. That note is included in every coach request.' },
  { q: 'Where can I change which workouts and exercises are available?', a: 'Settings → "Workout Templates" (edit/add/delete a template) and "Exercise Library" (add/remove exercises). You can also tap the gear on any template card on the Log tab to edit it.' },
  { q: 'How do I fix a note on a workout I already logged?', a: 'History tab → tap the workout. You can change its date and context tag there. Editing the written session notes after saving isn\'t available for strength/PT sessions yet — add notes during the workout or on the Finish screen. Runs and walks do let you edit notes from their History detail.' },
  { q: 'What does the Training Load (7-day vs 28-day) number mean?', a: 'Progress tab → tap the "?" on the Training Load card for the full explanation. Short version: it compares your last 7 days of training to your 28-day average — about 0.8–1.3 is the safe zone, and a big jump above that is when injury risk climbs.' },
  { q: 'How do I back up my data?', a: 'Settings → Data & Backup → "Export Backup (JSON)". Do it regularly — your data lives only on this device. "Restore from Backup" reloads it (e.g. on a new phone). Your API key is never included in a backup.' },
];

export function showHelpCenter() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <h2 class="modal-title" style="margin-bottom:0">Help Center</h2>
        <button class="modal-dismiss-btn" id="help-dismiss" aria-label="Dismiss">✕</button>
      </div>
      <p class="settings-hint" style="margin-bottom:12px">Common questions — tap to expand. Or ask your own below.</p>
      <div class="faq-list">
        ${FAQ.map((f, i) => `<div class="faq-item"><button class="faq-q" data-i="${i}">${esc(f.q)}<span class="faq-caret">▾</span></button><div class="faq-a hidden" id="faq-a-${i}">${esc(f.a)}</div></div>`).join('')}
      </div>
      <p class="section-title" style="margin-top:18px">Ask a question</p>
      <textarea class="input" id="help-q" rows="2" placeholder="e.g. How do I log a drop set?"></textarea>
      <button class="btn btn-secondary btn-full" id="help-ask" style="margin-top:8px">Ask</button>
      <div class="coach-response hidden" id="help-answer"></div>
    </div>
  `;
  const close = () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; };
  overlay.querySelector('#help-dismiss').addEventListener('click', close);
  overlay.querySelectorAll('.faq-q').forEach(b => b.addEventListener('click', () => {
    overlay.querySelector('#faq-a-' + b.dataset.i).classList.toggle('hidden');
    b.classList.toggle('open');
  }));
  overlay.querySelector('#help-ask').addEventListener('click', async () => {
    const q = overlay.querySelector('#help-q').value.trim();
    if (!q) return;
    const out = overlay.querySelector('#help-answer');
    const btn = overlay.querySelector('#help-ask');
    const apiKey = await getSetting('anthropicApiKey');
    if (!apiKey) {
      out.textContent = 'Add your Anthropic API key in Settings to ask free-form questions — the FAQ above works without one.';
      out.classList.remove('hidden');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    out.classList.add('hidden');
    try {
      out.textContent = await askHelp(q, apiKey);
      out.classList.remove('hidden');
    } catch (err) {
      out.textContent = `Error: ${err.message}`;
      out.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ask';
    }
  });
}
