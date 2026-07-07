import { getExercises, addExercise, addTemplate } from './db.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The copy-paste format users hand to Claude/ChatGPT ("fill this out for a
// beginner push day"), then paste the result back in.
export const TEMPLATE_FORMAT = `{
  "name": "My Push Day",
  "group": "arms",
  "exercises": [
    { "name": "Bench Press", "sets": 3, "reps": 8 },
    { "name": "Overhead Press", "sets": 3, "reps": 10 },
    { "name": "Plank", "sets": 3, "seconds": 45 }
  ]
}`;

// Parse a pasted template (JSON, possibly wrapped in prose) into a normalized
// object. Throws a friendly Error on anything unusable. Pure — unit-tested.
export function parseTemplateJSON(text) {
  const m = (text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Could not find a template — paste the JSON block (the part with { }).');
  let obj;
  try { obj = JSON.parse(m[0]); } catch { throw new Error('That JSON has a typo somewhere — check it and try again.'); }
  const name = (obj.name || '').toString().trim();
  if (!name) throw new Error('The template needs a "name".');
  const group = ['arms', 'legs', 'core'].includes(obj.group) ? obj.group : 'arms';
  const num = v => (v != null && v !== '' && !isNaN(Number(v))) ? Number(v) : null;
  const exercises = (Array.isArray(obj.exercises) ? obj.exercises : [])
    .filter(e => e && (e.name || '').toString().trim())
    .map(e => ({
      name: e.name.toString().trim(),
      sets: Math.max(1, Math.round(num(e.sets) || 3)),
      reps: num(e.reps) != null ? Math.round(num(e.reps)) : null,
      seconds: num(e.seconds) != null ? Math.round(num(e.seconds)) : null,
      weight: num(e.weight),
    }));
  if (!exercises.length) throw new Error('Add at least one exercise with a "name".');
  return { name, group, exercises };
}

// Create any missing exercise definitions (matched by name) and add the
// template. Returns a small summary.
export async function importTemplate(parsed) {
  const byName = {};
  for (const ex of await getExercises()) byName[ex.name.toLowerCase()] = ex;

  const tplExercises = [];
  for (let i = 0; i < parsed.exercises.length; i++) {
    const e = parsed.exercises[i];
    let def = byName[e.name.toLowerCase()];
    if (!def) {
      def = {
        id: `ex-${slug(e.name) || 'exercise'}-${crypto.randomUUID().slice(0, 4)}`,
        name: e.name,
        bodyPartGroup: parsed.group,
        equipment: e.weight != null ? 'weight' : 'bodyweight',
        machineId: null,
        unit: e.seconds != null ? 'seconds' : (e.weight != null ? 'lbs' : 'reps'),
        isTimed: e.seconds != null,
        isUnilateral: false,
        isBodyweight: e.weight == null && e.seconds == null,
        notes: '',
      };
      await addExercise(def);
      byName[e.name.toLowerCase()] = def;
    }
    const tplEx = { exerciseId: def.id, defaultSets: e.sets, targetReps: e.seconds != null ? null : e.reps, defaultSeconds: e.seconds, order: i };
    if (e.weight != null) tplEx.defaultWeight = e.weight;
    tplExercises.push(tplEx);
  }

  const tpl = {
    id: `tpl-${slug(parsed.name) || 'template'}-${crypto.randomUUID().slice(0, 4)}`,
    name: parsed.name,
    bodyPartGroup: parsed.group,
    createdAt: Date.now(),
    exercises: tplExercises,
  };
  await addTemplate(tpl);
  return { name: parsed.name, exerciseCount: tplExercises.length };
}

// Modal for pasting a template. onDone(result) fires after a successful import.
export function showPasteTemplateModal(onDone) {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <h2 class="modal-title" style="margin-bottom:0">Paste a Template</h2>
        <button class="modal-dismiss-btn" id="pt-dismiss" aria-label="Dismiss">✕</button>
      </div>
      <p class="settings-hint" style="margin-bottom:10px">1. Copy this format. 2. Paste it to Claude or ChatGPT and ask it to fill it out (e.g. "a beginner push day"). 3. Paste the result below and Import. <strong>group</strong> must be arms, legs, or core.</p>
      <pre class="pt-format" id="pt-format">${esc(TEMPLATE_FORMAT)}</pre>
      <button class="btn btn-ghost btn-full" id="pt-copy" style="margin-bottom:12px">📋 Copy format</button>
      <textarea class="input" id="pt-input" rows="6" placeholder="Paste the filled-in template here…" style="width:100%;box-sizing:border-box"></textarea>
      <button class="btn btn-primary btn-full" id="pt-import" style="margin-top:10px">Import Template</button>
      <div class="coach-response hidden" id="pt-msg"></div>
    </div>
  `;
  const close = () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; };
  overlay.querySelector('#pt-dismiss').addEventListener('click', close);
  overlay.querySelector('#pt-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(TEMPLATE_FORMAT).then(() => {
      const b = overlay.querySelector('#pt-copy');
      b.textContent = '✓ Copied';
      setTimeout(() => { b.textContent = '📋 Copy format'; }, 1500);
    });
  });
  overlay.querySelector('#pt-import').addEventListener('click', async () => {
    const msg = overlay.querySelector('#pt-msg');
    try {
      const result = await importTemplate(parseTemplateJSON(overlay.querySelector('#pt-input').value));
      close();
      if (onDone) onDone(result);
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.remove('hidden');
    }
  });
}
