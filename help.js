import { showHelpCenter } from './ui-help.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Definitions: the single source of truth for in-app jargon help ──────────────
// Every explainer everywhere reads from here, so the copy stays consistent and is
// written once. { label, short, body, range? }.
export const DEFS = {
  acwr: {
    label: 'Training load (ACWR)',
    short: 'Your last 7 days of training compared to your last 28.',
    body: "A quick read on whether you're ramping up faster than your body has adapted to. Load here is total training minutes — lifting plus cardio.",
    range: 'Around 0.8–1.3 is steady and sustainable. Above ~1.5 means recent load is climbing quickly — worth easing into.',
  },
  e1rm: {
    label: 'Estimated 1-rep max',
    short: 'Your projected best single lift, from the weight and reps you logged.',
    body: "It's an estimate, not a test — treat it as a trend to beat over time, not a number to max out on.",
  },
  readiness: {
    label: 'Readiness',
    short: 'A 0–100 read on how recovered you are today.',
    body: "It blends your morning check-in — sleep, energy, soreness, and mood. Higher means you're primed; lower is a nudge to keep the session steady rather than chase a PR.",
  },
  volume: {
    label: 'Weekly volume (hard sets)',
    short: 'Your working sets per muscle group this week (Mon–Sun).',
    body: 'Hard sets are the ones that actually drive progress — a set counts once you log weight, reps, or seconds.',
    range: 'Most guidance lands around 10–20 sets per muscle per week. Below the band means room to add; above means already plenty of stimulus.',
  },
  stall: {
    label: 'Stall',
    short: 'No progress on a lift for three or more sessions.',
    body: "Hitting the same weight and reps repeatedly is normal — usually just a sign it's time to change something, often a deload or a variation.",
  },
  deload: {
    label: 'Deload',
    short: 'A lighter stretch to let your body catch up.',
    body: 'Dropping the weight about 10% for a session or two often clears a stall and eases injury risk — then you build back up.',
  },
  asymmetry: {
    label: 'L/R asymmetry',
    short: 'The strength gap between your left and right side on a one-sided lift.',
    body: "Small differences are normal. A gap above ~15% is worth watching — especially on a side you're rehabbing.",
  },
  dropSet: {
    label: 'Drop set',
    short: 'Right after a set, drop the weight and immediately do more reps.',
    body: 'It pushes a set past failure for extra stimulus. Log the lighter continuation as its own set.',
  },
  unilateral: {
    label: 'Unilateral',
    short: 'A one-sided exercise — one arm or leg at a time.',
    body: 'Tracked per side (L/R) so you can see and close any imbalance.',
  },
};

// ── One-time / never-nag help state (single localStorage object) ────────────────
function readReg() { try { return JSON.parse(localStorage.getItem('wt.help') || '{}'); } catch (e) { return {}; } }
export function helpSeen(key) { return !!readReg()[key]; }
export function markHelpSeen(key) {
  try { const r = readReg(); r[key] = Date.now(); localStorage.setItem('wt.help', JSON.stringify(r)); } catch (e) {}
}

// ── The one explainer surface: a themed bottom sheet for a single term ──────────
// Reuses the app's #modal-overlay / .modal-sheet so it matches every other sheet.
export function showTermSheet(term) {
  const d = DEFS[term];
  if (!d) return;
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet term-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 class="modal-title" style="margin-bottom:0">${esc(d.label)}</h2>
        <button class="modal-dismiss-btn" id="term-dismiss" aria-label="Dismiss">✕</button>
      </div>
      <p class="term-short">${esc(d.short)}</p>
      ${d.body ? `<p class="term-body">${esc(d.body)}</p>` : ''}
      ${d.range ? `<p class="term-range">${esc(d.range)}</p>` : ''}
      <button class="btn btn-ghost btn-full" id="term-more" style="margin-top:14px">Learn more →</button>
    </div>`;
  const close = () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; overlay.onclick = null; };
  overlay.querySelector('#term-dismiss').addEventListener('click', close);
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector('#term-more').addEventListener('click', () => { close(); showHelpCenter(); });
}

// ── Call-site helpers ───────────────────────────────────────────────────────────
// Render these as plain HTML, then call wireInfo(container) once after innerHTML.
export function infoBtnHTML(term) {
  const d = DEFS[term];
  const label = d ? `About ${d.label}` : 'More info';
  return `<button type="button" class="info-btn" data-term="${esc(term)}" aria-label="${esc(label)}">i</button>`;
}
export function termSpan(text, term) {
  return `<span class="gloss" data-term="${esc(term)}" role="button" tabindex="0">${esc(text)}</span>`;
}

// Wire every info button / glossary term inside a container to its explainer.
// Idempotent per element (guards against double-wiring on re-render).
export function wireInfo(container) {
  if (!container) return;
  container.querySelectorAll('.info-btn[data-term], .gloss[data-term]').forEach(elm => {
    if (elm._infoWired) return;
    elm._infoWired = true;
    elm.addEventListener('click', () => showTermSheet(elm.dataset.term));
    if (elm.classList.contains('gloss')) {
      elm.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showTermSheet(elm.dataset.term); }
      });
    }
  });
}
