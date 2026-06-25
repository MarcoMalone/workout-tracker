import { getTemplates, getTemplate, getExercise, getExercises, getLastSessionForExercise, saveSession, getSetting, addRunLog, addWalkLog, getAllSessions } from './db.js';
import { switchTab } from './app.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export let activeSession = null;

function toTimeInput(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fromTimeInput(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export async function renderLogTab(el) {
  if (activeSession !== null) {
    renderActiveSession(el);
    return;
  }
  const [templates, recent] = await Promise.all([getTemplates(), getAllSessions(50)]);
  const lastArms = recent.find(s => s.bodyPartGroup === 'arms');
  const lastLegs = recent.find(s => s.bodyPartGroup === 'legs');
  const lastLine = (lastArms || lastLegs) ? `
    <div class="last-workout-row">
      ${lastArms ? `<span class="last-chip"><span class="last-chip-label">Arms</span>${esc(lastArms.templateName)} · ${shortDate(lastArms.date)}</span>` : ''}
      ${lastLegs ? `<span class="last-chip"><span class="last-chip-label">Legs</span>${esc(lastLegs.templateName)} · ${shortDate(lastLegs.date)}</span>` : ''}
    </div>` : '';

  el.innerHTML = `
    <div class="screen">
      <div class="log-home-header">
        <h1 class="log-date">${formatDate(new Date())}</h1>
        <p class="log-subtitle">What are we doing today?</p>
        ${lastLine}
      </div>
      <div class="log-cardio-row">
        <button class="btn btn-secondary log-cardio-btn" id="start-run-btn">🏃 Log a Run</button>
        <button class="btn btn-secondary log-cardio-btn" id="start-walk-btn">🚶 Log a Walk</button>
      </div>
      <div class="template-section">
        <p class="section-title">Workouts</p>
        <div class="template-list" id="template-list"></div>
        <button class="btn btn-ghost btn-full" id="new-template-btn" style="margin-top:8px">+ New Template</button>
      </div>
    </div>
  `;
  const list = el.querySelector('#template-list');
  for (const tpl of templates) {
    // Compute estimated duration from last 3 sessions for this template
    const tplSessions = recent.filter(s => s.templateId === tpl.id && s.finishedAt && s.startedAt && (s.finishedAt - s.startedAt) > 60000);
    let durationTag = '';
    if (tplSessions.length >= 2) {
      const avgMs = tplSessions.slice(0, 3).reduce((sum, s) => sum + (s.finishedAt - s.startedAt), 0) / Math.min(tplSessions.length, 3);
      const avgMin = Math.round(avgMs / 60000);
      durationTag = `<span class="tpl-duration">~${avgMin}m</span>`;
    }
    const btn = document.createElement('button');
    btn.className = 'template-card';
    btn.innerHTML = `<span class="template-name">${esc(tpl.name)}</span><span class="tpl-card-right">${durationTag}<span class="template-tag tag-${esc(tpl.bodyPartGroup)}">${esc(tpl.bodyPartGroup)}</span></span>`;
    btn.addEventListener('click', () => showPreChecklist(el, tpl));
    list.appendChild(btn);
  }
  el.querySelector('#new-template-btn').addEventListener('click', () => {
    import('./ui-settings.js').then(m => m.showTemplateEditor(el));
  });
  el.querySelector('#start-run-btn').addEventListener('click', () => showRunForm(el));
  el.querySelector('#start-walk-btn').addEventListener('click', () => showWalkForm(el));
}

async function renderActiveSession(el) {
  const template = await getTemplate(activeSession.templateId);
  el.innerHTML = `
    <div class="screen session-screen">
      <div class="session-header">
        <span class="session-name">${esc(activeSession.templateName)}</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="discard-btn" style="min-height:36px;font-size:14px;color:var(--danger);border-color:var(--danger)">Discard</button>
          <button class="btn btn-ghost session-finish-btn" id="finish-btn" style="min-height:36px;font-size:14px">Finish</button>
        </div>
      </div>
      ${activeSession.sorenessNote ? `<div class="soreness-banner">⚠ ${esc(activeSession.sorenessNote)}</div>` : ''}
      <div id="exercise-cards"></div>
      <button class="btn btn-ghost btn-full" id="add-exercise-btn" style="margin-top:8px">+ Add Exercise</button>
      <div style="margin-top:16px">
        <p class="section-title" style="margin-bottom:6px">Session Notes</p>
        <textarea class="input" id="session-notes-during" rows="3" placeholder="Jot notes, observations, or anything to remember…" style="width:100%;box-sizing:border-box">${esc(activeSession.sessionNotes || '')}</textarea>
      </div>
      <div style="height:80px"></div>
    </div>
    <div class="sticky-finish-bar">
      <button class="btn btn-primary btn-full" id="sticky-finish-btn">Finish Workout</button>
    </div>
  `;
  const cardsEl = el.querySelector('#exercise-cards');
  for (let i = 0; i < template.exercises.length; i++) {
    const tplEx = template.exercises[i];
    const exDef = await getExercise(tplEx.exerciseId);
    const prev = await getLastSessionForExercise(tplEx.exerciseId);
    activeSession.exercises[i].exerciseName = exDef.name;
    cardsEl.appendChild(buildExerciseCard(i, exDef, prev, activeSession.exercises[i], el));
  }
  for (let i = template.exercises.length; i < activeSession.exercises.length; i++) {
    const ex = activeSession.exercises[i];
    const exDef = await getExercise(ex.exerciseId);
    const prev = await getLastSessionForExercise(ex.exerciseId);
    cardsEl.appendChild(buildExerciseCard(i, exDef, prev, ex, el));
  }
  el.querySelector('#finish-btn').addEventListener('click', () => showPostChecklist(el));
  el.querySelector('#sticky-finish-btn').addEventListener('click', () => showPostChecklist(el));
  el.querySelector('#discard-btn').addEventListener('click', () => {
    if (confirm('Discard this workout? All logged data will be lost.')) {
      activeSession = null;
      renderLogTab(el);
    }
  });
  el.querySelector('#add-exercise-btn').addEventListener('click', () => showAddExerciseModal(el, cardsEl));
  el.querySelector('#session-notes-during').addEventListener('input', e => {
    activeSession.sessionNotes = e.target.value;
  });
}

function buildExerciseCard(exIdx, exDef, prev, sessionEx, el) {
  const card = document.createElement('div');
  card.className = 'exercise-card card';
  card.dataset.exIdx = exIdx;

  const prevText = prev
    ? prev.sets.map(s => s.seconds != null ? `${s.seconds}s` : `${s.weight}×${s.reps}`).join(', ')
    : 'No previous data';
  const displayName = (exDef.name || '').replace(/_/g, ' ');
  const machineLabel = exDef.machineId ? ` (${esc(exDef.machineId)})` : '';

  card.innerHTML = `
    <div class="ex-header">
      <span class="ex-name">${esc(displayName)}${machineLabel}</span>
      <div style="display:flex;gap:4px;align-items:center">
        <button class="ex-note-btn" title="Add note">📝</button>
        <button class="ex-remove-btn" title="Remove exercise">✕</button>
      </div>
    </div>
    <div class="ex-prev">Previous: ${esc(prevText)}</div>
    <div class="ex-sets" id="sets-${exIdx}"></div>
    <div class="ex-note-row hidden" id="note-${exIdx}">
      <textarea class="input ex-note-input" placeholder="Note for this exercise..." rows="2"></textarea>
    </div>
    <div class="ex-actions">
      <button class="btn btn-ghost ex-add-set">+ Add Set</button>
      <button class="btn btn-ghost ex-add-drop">+ Drop Set</button>
    </div>
  `;

  const setsEl = card.querySelector(`#sets-${exIdx}`);
  refreshSets(setsEl, exIdx, exDef, prev);

  card.querySelector('.ex-note-btn').addEventListener('click', () => {
    card.querySelector(`#note-${exIdx}`).classList.toggle('hidden');
  });
  card.querySelector('.ex-remove-btn').addEventListener('click', async () => {
    if (!confirm(`Remove ${displayName} from this workout?`)) return;
    activeSession.exercises.splice(exIdx, 1);
    await renderActiveSession(el);
  });
  card.querySelector(`#note-${exIdx} textarea`).addEventListener('input', e => {
    activeSession.exercises[exIdx].notes = e.target.value;
  });
  card.querySelector('.ex-add-set').addEventListener('click', () => {
    const newIdx = activeSession.exercises[exIdx].sets.length;
    activeSession.exercises[exIdx].sets.push({
      setNumber: newIdx + 1, weight: null, reps: null, seconds: null,
      side: null, isDropSet: false, parentSetIndex: null
    });
    appendSetRow(setsEl, exIdx, newIdx, exDef, prev);
  });
  card.querySelector('.ex-add-drop').addEventListener('click', () => {
    const newIdx = activeSession.exercises[exIdx].sets.length;
    const parentIdx = newIdx - 1;
    activeSession.exercises[exIdx].sets.push({
      setNumber: newIdx + 1, weight: null, reps: null, seconds: null,
      side: null, isDropSet: true, parentSetIndex: parentIdx
    });
    appendSetRow(setsEl, exIdx, newIdx, exDef, prev, true);
  });

  return card;
}

function refreshSets(setsEl, exIdx, exDef, prev) {
  setsEl.innerHTML = '';
  activeSession.exercises[exIdx].sets.forEach((set, sIdx) => {
    appendSetRow(setsEl, exIdx, sIdx, exDef, prev, set.isDropSet);
  });
}

function appendSetRow(setsEl, exIdx, sIdx, exDef, prev, isDropSet = false) {
  const currentSet = activeSession.exercises[exIdx].sets[sIdx];
  const prevSet = prev?.sets[sIdx];
  const weight = currentSet.weight ?? prevSet?.weight ?? '';
  const reps = currentSet.reps ?? prevSet?.reps ?? '';
  const unit = exDef.unit || 'lbs';
  const setLabel = `Set ${sIdx + 1}${isDropSet ? ' ↓' : ''}`;
  const row = document.createElement('div');
  row.className = `set-row${isDropSet ? ' drop-set' : ''}`;

  // Pre-select side based on set index: even sets → L, odd → R (for unilateral)
  const autoSide = sIdx % 2 === 0 ? 'L' : 'R';
  const side = currentSet.side ?? autoSide;
  if (exDef.isUnilateral && !currentSet.side) activeSession.exercises[exIdx].sets[sIdx].side = side;

  const sideSelect = `<select class="set-side"><option value="L"${side === 'L' ? ' selected' : ''}>L</option><option value="R"${side === 'R' ? ' selected' : ''}>R</option></select>`;

  if (exDef.isTimed && exDef.isUnilateral) {
    // Timed + unilateral (Side Plank, Side Star Plank, Kneeling Hip Flexor Stretch, Modified Pigeon)
    const seconds = currentSet.seconds ?? prevSet?.seconds ?? '';
    row.innerHTML = `<span class="set-num">${setLabel}</span><input type="number" class="set-input r-input" value="${seconds}" inputmode="numeric" data-field="seconds"><span class="set-unit">sec</span>${sideSelect}<button class="set-check">✓</button><button class="set-remove-btn" title="Remove set">×</button>`;
    row.querySelector('[data-field="seconds"]').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].seconds = Number(e.target.value) || null; });
    row.querySelector('.set-side').addEventListener('change', e => { activeSession.exercises[exIdx].sets[sIdx].side = e.target.value; });
  } else if (exDef.isTimed) {
    const seconds = currentSet.seconds ?? prevSet?.seconds ?? '';
    row.innerHTML = `<span class="set-num">${setLabel}</span><input type="number" class="set-input r-input" value="${seconds}" inputmode="numeric" data-field="seconds"><span class="set-unit">sec</span><button class="set-check" aria-label="Mark done">✓</button><button class="set-remove-btn" title="Remove set">×</button>`;
    row.querySelector('[data-field="seconds"]').addEventListener('input', e => {
      activeSession.exercises[exIdx].sets[sIdx].seconds = Number(e.target.value) || null;
    });
  } else if (exDef.isBodyweight && exDef.isUnilateral) {
    // Bodyweight unilateral: reps + side, no weight (Straight Leg Raise VMO, Glute Iso, etc.)
    row.innerHTML = `<span class="set-num">${setLabel}</span><button class="step-btn step-dn">−</button><input type="number" class="set-input r-input" value="${reps}" inputmode="numeric"><button class="step-btn step-up">+</button><span class="set-unit">reps</span>${sideSelect}<button class="set-check">✓</button><button class="set-remove-btn" title="Remove set">×</button>`;
    const rInp = row.querySelector('.r-input');
    rInp.addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].reps = Number(e.target.value) || null; });
    row.querySelector('.set-side').addEventListener('change', e => { activeSession.exercises[exIdx].sets[sIdx].side = e.target.value; });
    row.querySelector('.step-dn').addEventListener('click', () => { const v = Math.max(0, (Number(rInp.value) || 0) - 1); rInp.value = v; activeSession.exercises[exIdx].sets[sIdx].reps = v; });
    row.querySelector('.step-up').addEventListener('click', () => { const v = (Number(rInp.value) || 0) + 1; rInp.value = v; activeSession.exercises[exIdx].sets[sIdx].reps = v; });
  } else if (exDef.isBodyweight) {
    // Bodyweight: reps only, no weight (Butterfly Bridge, Dead Bug, Bird Dog, Ab Wheel, etc.)
    row.innerHTML = `<span class="set-num">${setLabel}</span><button class="step-btn step-dn">−</button><input type="number" class="set-input r-input" value="${reps}" inputmode="numeric"><button class="step-btn step-up">+</button><span class="set-unit">reps</span><button class="set-check">✓</button><button class="set-remove-btn" title="Remove set">×</button>`;
    const rInp = row.querySelector('.r-input');
    rInp.addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].reps = Number(e.target.value) || null; });
    row.querySelector('.step-dn').addEventListener('click', () => { const v = Math.max(0, (Number(rInp.value) || 0) - 1); rInp.value = v; activeSession.exercises[exIdx].sets[sIdx].reps = v; });
    row.querySelector('.step-up').addEventListener('click', () => { const v = (Number(rInp.value) || 0) + 1; rInp.value = v; activeSession.exercises[exIdx].sets[sIdx].reps = v; });
  } else if (exDef.isUnilateral) {
    row.innerHTML = `<span class="set-num">${setLabel}</span><input type="number" class="set-input w-input" value="${weight}" inputmode="decimal"><span class="set-unit">${unit}</span><button class="step-btn step-dn">−</button><input type="number" class="set-input r-input" value="${reps}" inputmode="numeric"><button class="step-btn step-up">+</button>${sideSelect}<button class="set-check">✓</button><button class="set-remove-btn" title="Remove set">×</button>`;
    row.querySelector('.w-input').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].weight = Number(e.target.value) || null; });
    const rInp = row.querySelector('.r-input');
    rInp.addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].reps = Number(e.target.value) || null; });
    row.querySelector('.set-side').addEventListener('change', e => { activeSession.exercises[exIdx].sets[sIdx].side = e.target.value; });
    row.querySelector('.step-dn').addEventListener('click', () => { const v = Math.max(0, (Number(rInp.value) || 0) - 1); rInp.value = v; activeSession.exercises[exIdx].sets[sIdx].reps = v; });
    row.querySelector('.step-up').addEventListener('click', () => { const v = (Number(rInp.value) || 0) + 1; rInp.value = v; activeSession.exercises[exIdx].sets[sIdx].reps = v; });
  } else {
    row.innerHTML = `<span class="set-num">${setLabel}</span><input type="number" class="set-input w-input" value="${weight}" inputmode="decimal"><span class="set-unit">${unit}</span><button class="step-btn step-dn">−</button><input type="number" class="set-input r-input" value="${reps}" inputmode="numeric"><button class="step-btn step-up">+</button><button class="set-check">✓</button><button class="set-remove-btn" title="Remove set">×</button>`;
    row.querySelector('.w-input').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].weight = Number(e.target.value) || null; });
    const rInp = row.querySelector('.r-input');
    rInp.addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].reps = Number(e.target.value) || null; });
    row.querySelector('.step-dn').addEventListener('click', () => { const v = Math.max(0, (Number(rInp.value) || 0) - 1); rInp.value = v; activeSession.exercises[exIdx].sets[sIdx].reps = v; });
    row.querySelector('.step-up').addEventListener('click', () => { const v = (Number(rInp.value) || 0) + 1; rInp.value = v; activeSession.exercises[exIdx].sets[sIdx].reps = v; });
  }

  row.querySelector('.set-check').addEventListener('click', function () {
    this.classList.toggle('done');
    row.classList.toggle('set-done');
  });
  row.querySelector('.set-remove-btn').addEventListener('click', () => {
    if (activeSession.exercises[exIdx].sets.length <= 1) return;
    activeSession.exercises[exIdx].sets.splice(sIdx, 1);
    activeSession.exercises[exIdx].sets.forEach((s, i) => { s.setNumber = i + 1; });
    refreshSets(setsEl, exIdx, exDef, prev);
  });
  setsEl.appendChild(row);
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function shortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const LEG_WARMUP_ITEMS = [
  'Walking hamstring stretch (5 each leg)',
  'Quad stretches — standing (5 each)',
  'Walking hip rotations / stepovers',
  'Straight-leg kicks (10 each)',
  "World's greatest stretch — lunge into glute (5 each)",
  'Butt kicks (10)',
  'High knee skips (10)',
  'Skips (20)',
  'Calf stretch (30s each)',
  'Side-to-side lunges (5 each)',
];

const DEFAULT_CHECKLIST_ITEMS = [
  'Dynamic warm-up done? (arm circles, leg swings — 5 min)',
  'Joints feel okay? (no unusual pain)',
  'Hydrated?',
  'Any new soreness since last session?',
];

async function showPreChecklist(el, template) {
  const isLegDay = template.bodyPartGroup === 'legs';
  const raw = await getSetting('preChecklist');
  const items = isLegDay ? LEG_WARMUP_ITEMS : (raw ?? DEFAULT_CHECKLIST_ITEMS);
  const answers = {};
  items.forEach((_, i) => { answers[i] = false; });

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 class="modal-title" style="margin-bottom:0">${isLegDay ? 'Leg Day Warm-Up' : 'Pre-Workout Check'}</h2>
        <button class="modal-dismiss-btn" id="dismiss-checklist" aria-label="Dismiss">✕</button>
      </div>
      <div class="checklist" id="pre-checklist"></div>
      <input type="text" class="input" id="soreness-note" placeholder="Anything sore or tight today? (e.g. left hip, slept 5 hrs)" style="margin-bottom:14px">
      <button class="btn btn-primary btn-full" id="start-session-btn">Start ${esc(template.name)}</button>
    </div>
  `;
  const list = overlay.querySelector('#pre-checklist');
  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'checklist-row';
    row.innerHTML = `<button class="toggle-btn" data-idx="${i}" aria-pressed="false"><span class="toggle-label">N</span></button><span class="checklist-item">${item}</span>`;
    row.querySelector('.toggle-btn').addEventListener('click', function () {
      answers[i] = !answers[i];
      this.setAttribute('aria-pressed', answers[i]);
      this.querySelector('.toggle-label').textContent = answers[i] ? 'Y' : 'N';
      this.classList.toggle('checked', answers[i]);
    });
    list.appendChild(row);
  });
  overlay.querySelector('#dismiss-checklist').addEventListener('click', () => {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  });
  overlay.querySelector('#start-session-btn').addEventListener('click', () => {
    const sorenessNote = overlay.querySelector('#soreness-note').value.trim();
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    startSession(el, template, answers, sorenessNote);
  });
}

function startSession(el, template, answers, sorenessNote = '') {
  activeSession = {
    id: crypto.randomUUID(),
    templateId: template.id,
    templateName: template.name,
    bodyPartGroup: template.bodyPartGroup,
    date: localDateStr(),
    startedAt: Date.now(),
    finishedAt: null,
    sessionRating: null,
    sorenessNote,
    preChecklist: answers,
    postChecklist: {},
    sessionNotes: '',
    exercises: template.exercises.map(e => ({
      exerciseId: e.exerciseId,
      exerciseName: '',
      notes: '',
      sets: Array.from({ length: e.defaultSets }, (_, i) => ({
        setNumber: i + 1,
        weight: e.defaultWeight ?? null,
        reps: e.targetReps ?? null,
        seconds: e.defaultSeconds ?? null,
        side: null, isDropSet: false, parentSetIndex: null
      }))
    }))
  };
  renderActiveSession(el);
}

async function showPostChecklist(el) {
  const raw = await getSetting('postChecklist');
  const items = raw ?? ['Static stretches done?', 'Hydrated?', 'Anything to note for next time?'];
  const answers = {};
  items.forEach((_, i) => { answers[i] = false; });

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-title">Finish Workout</h2>
      <div class="checklist" id="post-checklist"></div>
      <div class="rating-row">
        <p class="section-title">Session Rating</p>
        <div class="stars" id="star-rating">
          ${[1, 2, 3, 4, 5].map(n => `<button class="star-btn" data-val="${n}">★</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <div style="flex:1">
          <label class="form-label" style="margin-bottom:4px">Start Time</label>
          <input type="time" class="input" id="start-time" value="${toTimeInput(activeSession?.startedAt || Date.now())}">
        </div>
        <div style="flex:1">
          <label class="form-label" style="margin-bottom:4px">End Time</label>
          <input type="time" class="input" id="end-time" value="${toTimeInput(Date.now())}">
        </div>
      </div>
      <div style="margin-top:12px">
        <label class="form-label" style="margin-bottom:4px">Name this workout <span class="form-hint">— optional</span></label>
        <input class="input" id="workout-label" placeholder="e.g. Workout with Orlando" value="${esc(activeSession?.workoutLabel || '')}">
      </div>
      <div style="margin-top:8px">
        <label class="form-label" style="margin-bottom:4px">Context tag <span class="form-hint">— shows on progress chart</span></label>
        <input class="input" id="workout-context" placeholder="e.g. Pitching in 2 days, Tired, Full energy" value="${esc(activeSession?.workoutContext || '')}">
      </div>
      <textarea class="input session-notes-input" placeholder="How did it go? Anything to note…" rows="3" id="session-notes" style="margin-top:8px">${esc(activeSession?.sessionNotes || '')}</textarea>
      <button class="btn btn-primary btn-full" id="save-session-btn" style="margin-top:16px">Save Workout</button>
      <button class="btn btn-ghost btn-full" id="cancel-finish-btn" style="margin-top:8px">← Back to Workout</button>
    </div>
  `;

  const list = overlay.querySelector('#post-checklist');
  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'checklist-row';
    row.innerHTML = `<button class="toggle-btn" data-idx="${i}"><span class="toggle-label">N</span></button><span class="checklist-item">${item}</span>`;
    row.querySelector('.toggle-btn').addEventListener('click', function () {
      answers[i] = !answers[i];
      this.querySelector('.toggle-label').textContent = answers[i] ? 'Y' : 'N';
      this.classList.toggle('checked', answers[i]);
    });
    list.appendChild(row);
  });

  let rating = null;
  overlay.querySelector('#star-rating').addEventListener('click', e => {
    if (!e.target.classList.contains('star-btn')) return;
    rating = Number(e.target.dataset.val);
    overlay.querySelectorAll('.star-btn').forEach(s => s.classList.toggle('filled', Number(s.dataset.val) <= rating));
  });

  overlay.querySelector('#save-session-btn').addEventListener('click', async () => {
    const startTimeVal = overlay.querySelector('#start-time').value;
    const endTimeVal = overlay.querySelector('#end-time').value;
    if (startTimeVal) activeSession.startedAt = fromTimeInput(startTimeVal);
    activeSession.finishedAt = endTimeVal ? fromTimeInput(endTimeVal) : Date.now();
    activeSession.postChecklist = answers;
    activeSession.sessionNotes = overlay.querySelector('#session-notes').value;
    activeSession.sessionRating = rating;
    const labelVal = overlay.querySelector('#workout-label').value.trim();
    activeSession.workoutLabel = labelVal || null;
    const ctxVal = overlay.querySelector('#workout-context').value.trim();
    activeSession.workoutContext = ctxVal || null;
    await saveSession(activeSession);
    activeSession = null;
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    await switchTab('log');
  });
  overlay.querySelector('#cancel-finish-btn').addEventListener('click', () => {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  });
}

async function showAddExerciseModal(el, cardsEl) {
  const exercises = await getExercises();
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-title">Add Exercise</h2>
      <div style="max-height:55vh;overflow-y:auto">
        ${exercises.map(ex => `<button class="template-card add-ex-pick" data-id="${esc(ex.id)}" style="margin-bottom:8px"><span class="template-name">${esc(ex.name)}</span><span class="template-tag tag-${esc(ex.bodyPartGroup)}">${esc(ex.bodyPartGroup)}</span></button>`).join('')}
      </div>
      <button class="btn btn-ghost btn-full" id="cancel-add-ex" style="margin-top:12px">Cancel</button>
    </div>
  `;
  overlay.querySelector('#cancel-add-ex').addEventListener('click', () => {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  });
  overlay.querySelectorAll('.add-ex-pick').forEach(btn => {
    btn.addEventListener('click', async () => {
      const exId = btn.dataset.id;
      const exDef = await getExercise(exId);
      const prev = await getLastSessionForExercise(exId);
      const newIdx = activeSession.exercises.length;
      activeSession.exercises.push({
        exerciseId: exId,
        exerciseName: exDef.name,
        notes: '',
        sets: Array.from({ length: 3 }, (_, i) => ({
          setNumber: i + 1, weight: null, reps: null, seconds: null,
          side: null, isDropSet: false, parentSetIndex: null
        }))
      });
      overlay.classList.add('hidden');
      overlay.innerHTML = '';
      cardsEl.appendChild(buildExerciseCard(newIdx, exDef, prev, activeSession.exercises[newIdx], el));
    });
  });
}

function showWalkForm(el) {
  const todayStr = localDateStr();
  el.innerHTML = `
    <div class="screen">
      <div class="session-header">
        <h2>🚶 Log a Walk</h2>
        <button class="btn btn-ghost" id="cancel-walk">Cancel</button>
      </div>
      <div class="run-form">
        <label class="form-label">Date</label>
        <input type="date" class="input" id="walk-date" value="${todayStr}">
        <label class="form-label">Duration (minutes)</label>
        <input type="number" class="input" id="walk-dur" step="1" inputmode="numeric" placeholder="90">
        <label class="form-label">Speed (mph)</label>
        <input type="number" class="input" id="walk-speed" step="0.1" inputmode="decimal" value="2.2">
        <p class="walk-dist-preview" id="walk-dist-preview"></p>
        <label class="form-label">Treadmill Distance (mi) <span class="form-hint">— optional, overrides calculation</span></label>
        <input type="number" class="input" id="walk-dist-override" step="0.01" inputmode="decimal" placeholder="leave blank to auto-calculate">
        <label class="form-label">Calories <span class="form-hint">— treadmill estimate</span></label>
        <input type="number" class="input" id="walk-cals" step="1" inputmode="numeric" placeholder="optional">
        <label class="form-label">Notes</label>
        <textarea class="input" id="walk-notes" rows="2" placeholder="How did it go?"></textarea>
        <button class="btn btn-primary btn-full" id="save-walk-btn" style="margin-top:16px">Save Walk</button>
      </div>
    </div>
  `;

  function updateDistPreview() {
    const dur = parseFloat(el.querySelector('#walk-dur').value);
    const speed = parseFloat(el.querySelector('#walk-speed').value);
    const preview = el.querySelector('#walk-dist-preview');
    if (dur && speed) {
      preview.textContent = `≈ ${(dur / 60 * speed).toFixed(2)} mi`;
      preview.style.cssText = 'text-align:center;color:var(--accent);font-size:18px;font-weight:700;padding:4px 0';
    } else {
      preview.textContent = '';
    }
  }

  el.querySelector('#walk-dur').addEventListener('input', updateDistPreview);
  el.querySelector('#walk-speed').addEventListener('input', updateDistPreview);
  el.querySelector('#cancel-walk').addEventListener('click', () => renderLogTab(el));
  el.querySelector('#save-walk-btn').addEventListener('click', async () => {
    const dur = parseFloat(el.querySelector('#walk-dur').value);
    const speed = parseFloat(el.querySelector('#walk-speed').value);
    if (!dur || !speed) { alert('Enter duration and speed.'); return; }
    const overrideVal = el.querySelector('#walk-dist-override').value;
    const distanceMiles = overrideVal
      ? parseFloat(overrideVal)
      : parseFloat((dur / 60 * speed).toFixed(2));
    const calsVal = el.querySelector('#walk-cals').value;
    await addWalkLog({
      id: crypto.randomUUID(),
      date: el.querySelector('#walk-date').value,
      durationMinutes: dur,
      speedMph: speed,
      distanceMiles,
      calories: calsVal ? Number(calsVal) : null,
      notes: el.querySelector('#walk-notes').value
    });
    await switchTab('history');
  });
}

function showRunForm(el) {
  el.innerHTML = `
    <div class="screen">
      <div class="session-header">
        <h2>Log a Run</h2>
        <button class="btn btn-ghost" id="cancel-run">Cancel</button>
      </div>
      <div class="run-form">
        <label class="form-label">Date</label>
        <input type="date" class="input" id="run-date" value="${localDateStr()}">
        <label class="form-label">Distance (miles)</label>
        <input type="number" class="input" id="run-dist" step="0.01" inputmode="decimal" placeholder="2.5">
        <label class="form-label">Duration (mm:ss)</label>
        <input type="text" class="input" id="run-dur" placeholder="28:30" pattern="[0-9]+:[0-5][0-9]">
        <label class="form-label">Perceived Effort (1–10)</label>
        <input type="range" id="run-effort" min="1" max="10" value="6">
        <div style="text-align:center; color:var(--accent); font-size:20px; font-weight:700" id="effort-display">6</div>
        <label class="form-label">Notes</label>
        <textarea class="input" id="run-notes" rows="2" placeholder="How did it feel?"></textarea>
        <button class="btn btn-primary btn-full" id="save-run-btn" style="margin-top:16px">Save Run</button>
      </div>
    </div>
  `;
  el.querySelector('#run-effort').addEventListener('input', e => {
    el.querySelector('#effort-display').textContent = e.target.value;
  });
  el.querySelector('#cancel-run').addEventListener('click', () => renderLogTab(el));
  el.querySelector('#save-run-btn').addEventListener('click', async () => {
    const dist = parseFloat(el.querySelector('#run-dist').value);
    const durStr = el.querySelector('#run-dur').value;
    const [min, sec] = durStr.split(':').map(Number);
    const durationMinutes = min + (sec / 60);
    if (!dist || !durStr.includes(':')) { alert('Enter distance and duration.'); return; }
    await addRunLog({
      id: crypto.randomUUID(),
      date: el.querySelector('#run-date').value,
      distanceMiles: dist,
      durationMinutes,
      paceMinPerMile: parseFloat((durationMinutes / dist).toFixed(2)),
      perceivedEffort: Number(el.querySelector('#run-effort').value),
      notes: el.querySelector('#run-notes').value,
      bodyPartGroup: 'legs'
    });
    await switchTab('history');
  });
}
