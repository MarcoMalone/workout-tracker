import { getTemplates, getTemplate, getExercise, getLastSessionForExercise, saveSession, getSetting } from './db.js';
import { switchTab } from './app.js';

export let activeSession = null;

export async function renderLogTab(el) {
  if (activeSession !== null) {
    renderActiveSession(el);
    return;
  }
  const templates = await getTemplates();
  el.innerHTML = `
    <div class="screen">
      <div class="log-home-header">
        <h1 class="log-date">${formatDate(new Date())}</h1>
        <p class="log-subtitle">What are we doing today?</p>
      </div>
      <button class="btn btn-primary btn-full log-start-btn" id="start-run-btn">Log a Run</button>
      <div class="template-section">
        <p class="section-title">Workouts</p>
        <div class="template-list" id="template-list"></div>
        <button class="btn btn-ghost btn-full" id="new-template-btn" style="margin-top:8px">+ New Template</button>
      </div>
    </div>
  `;
  const list = el.querySelector('#template-list');
  for (const tpl of templates) {
    const btn = document.createElement('button');
    btn.className = 'template-card';
    btn.innerHTML = `<span class="template-name">${tpl.name}</span><span class="template-tag tag-${tpl.bodyPartGroup}">${tpl.bodyPartGroup}</span>`;
    btn.addEventListener('click', () => showPreChecklist(el, tpl));
    list.appendChild(btn);
  }
  el.querySelector('#new-template-btn').addEventListener('click', () => {
    import('./ui-settings.js').then(m => m.showTemplateEditor(el));
  });
  el.querySelector('#start-run-btn').addEventListener('click', () => {
    console.log('run');
  });
}

async function renderActiveSession(el) {
  const template = await getTemplate(activeSession.templateId);
  el.innerHTML = `
    <div class="screen session-screen">
      <div class="session-header">
        <span class="session-name">${activeSession.templateName}</span>
        <button class="btn btn-ghost session-finish-btn" id="finish-btn">Finish</button>
      </div>
      <div id="exercise-cards"></div>
    </div>
  `;
  const cardsEl = el.querySelector('#exercise-cards');
  for (let i = 0; i < template.exercises.length; i++) {
    const tplEx = template.exercises[i];
    const exDef = await getExercise(tplEx.exerciseId);
    const prev = await getLastSessionForExercise(tplEx.exerciseId);
    activeSession.exercises[i].exerciseName = exDef.name;
    cardsEl.appendChild(buildExerciseCard(i, exDef, prev, activeSession.exercises[i]));
  }
  el.querySelector('#finish-btn').addEventListener('click', () => showPostChecklist(el));
}

function buildExerciseCard(exIdx, exDef, prev, sessionEx) {
  const card = document.createElement('div');
  card.className = 'exercise-card card';
  card.dataset.exIdx = exIdx;

  const prevText = prev
    ? prev.sets.map(s => s.seconds != null ? `${s.seconds}s` : `${s.weight}×${s.reps}`).join(', ')
    : 'No previous data';
  const machineLabel = exDef.machineId ? ` (${exDef.machineId})` : '';

  card.innerHTML = `
    <div class="ex-header">
      <span class="ex-name">${exDef.name}${machineLabel}</span>
      <button class="ex-note-btn" title="Add note">📝</button>
    </div>
    <div class="ex-prev">Previous: ${prevText}</div>
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
  sessionEx.sets.forEach((_, sIdx) => appendSetRow(setsEl, exIdx, sIdx, exDef, prev));

  card.querySelector('.ex-note-btn').addEventListener('click', () => {
    card.querySelector(`#note-${exIdx}`).classList.toggle('hidden');
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

function appendSetRow(setsEl, exIdx, sIdx, exDef, prev, isDropSet = false) {
  const prevSet = prev?.sets[sIdx];
  const prevWeight = prevSet?.weight ?? '';
  const row = document.createElement('div');
  row.className = `set-row${isDropSet ? ' drop-set' : ''}`;

  if (exDef.isTimed) {
    row.innerHTML = `<span class="set-num">Set ${sIdx + 1}${isDropSet ? ' ↓' : ''}</span><input type="number" class="set-input" placeholder="${prevSet?.seconds ?? ''}" inputmode="numeric" data-field="seconds"><span class="set-unit">sec</span><button class="set-check" aria-label="Mark done">✓</button>`;
    row.querySelector('[data-field="seconds"]').addEventListener('input', e => {
      activeSession.exercises[exIdx].sets[sIdx].seconds = Number(e.target.value) || null;
    });
  } else if (exDef.isUnilateral) {
    row.innerHTML = `<span class="set-num">Set ${sIdx + 1}</span><input type="number" class="set-input w-input" value="${prevWeight}" inputmode="decimal"><span class="set-unit">${exDef.unit || 'lbs'}</span><span class="set-sep">×</span><input type="number" class="set-input r-input" placeholder="reps" inputmode="numeric"><select class="set-side"><option value="L">L</option><option value="R">R</option></select><button class="set-check">✓</button>`;
    row.querySelector('.w-input').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].weight = Number(e.target.value) || null; });
    row.querySelector('.r-input').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].reps = Number(e.target.value) || null; });
    row.querySelector('.set-side').addEventListener('change', e => { activeSession.exercises[exIdx].sets[sIdx].side = e.target.value; });
  } else {
    row.innerHTML = `<span class="set-num">Set ${sIdx + 1}${isDropSet ? ' ↓' : ''}</span><input type="number" class="set-input w-input" value="${prevWeight}" inputmode="decimal"><span class="set-unit">${exDef.unit || 'lbs'}</span><span class="set-sep">×</span><input type="number" class="set-input r-input" placeholder="reps" inputmode="numeric"><button class="set-check">✓</button>`;
    row.querySelector('.w-input').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].weight = Number(e.target.value) || null; });
    row.querySelector('.r-input').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].reps = Number(e.target.value) || null; });
  }

  row.querySelector('.set-check').addEventListener('click', function () {
    this.classList.toggle('done');
    row.classList.toggle('set-done');
  });
  setsEl.appendChild(row);
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

async function showPreChecklist(el, template) {
  const raw = await getSetting('preChecklist');
  const items = raw ?? [
    'Dynamic warm-up done? (arm circles, leg swings — 5 min)',
    'Joints feel okay? (no unusual pain)',
    'Hydrated?',
    'Any new soreness since last session?'
  ];
  const answers = {};
  items.forEach((_, i) => { answers[i] = false; });

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-title">Pre-Workout Check</h2>
      <div class="checklist" id="pre-checklist"></div>
      <button class="btn btn-primary btn-full" id="start-session-btn">Start ${template.name}</button>
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
  overlay.querySelector('#start-session-btn').addEventListener('click', () => {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    startSession(el, template, answers);
  });
}

function startSession(el, template, answers) {
  activeSession = {
    id: crypto.randomUUID(),
    templateId: template.id,
    templateName: template.name,
    bodyPartGroup: template.bodyPartGroup,
    date: new Date().toISOString().split('T')[0],
    startedAt: Date.now(),
    finishedAt: null,
    sessionRating: null,
    preChecklist: answers,
    postChecklist: {},
    sessionNotes: '',
    exercises: template.exercises.map(e => ({
      exerciseId: e.exerciseId,
      exerciseName: '',
      notes: '',
      sets: Array.from({ length: e.defaultSets }, (_, i) => ({
        setNumber: i + 1, weight: null, reps: null, seconds: null,
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
      <textarea class="input session-notes-input" placeholder="How did it go? Anything to note…" rows="3" id="session-notes"></textarea>
      <button class="btn btn-primary btn-full" id="save-session-btn" style="margin-top:16px">Save Workout</button>
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
    activeSession.finishedAt = Date.now();
    activeSession.postChecklist = answers;
    activeSession.sessionNotes = overlay.querySelector('#session-notes').value;
    activeSession.sessionRating = rating;
    await saveSession(activeSession);
    activeSession = null;
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    await switchTab('log');
  });
}
