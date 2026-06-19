import { getSetting, setSetting, getExercises, addExercise, deleteExercise, getTemplates, addTemplate, deleteTemplate, getAllSessions, getRunLogs } from './db.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function renderSettingsTab(el) {
  const [apiKey, healthCtx, preCL, postCL] = await Promise.all([
    getSetting('anthropicApiKey'), getSetting('healthContext'),
    getSetting('preChecklist'), getSetting('postChecklist')
  ]);
  el.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">Settings</h1>

      <p class="section-title">Coach</p>
      <div class="settings-group card">
        <label class="settings-label">Anthropic API Key</label>
        <input type="password" class="input" id="api-key-input" value="${esc(apiKey)}" placeholder="sk-ant-...">
        <button class="btn btn-secondary settings-save-btn" id="save-api-key">Save Key</button>
      </div>

      <p class="section-title" style="margin-top:20px">Health Notes</p>
      <div class="settings-group card">
        <label class="settings-label">Sent with every coaching request</label>
        <textarea class="input" id="health-ctx" rows="6" placeholder="Injury history, things to monitor, ortho notes...">${esc(healthCtx)}</textarea>
        <button class="btn btn-secondary settings-save-btn" id="save-health-ctx">Save</button>
      </div>

      <p class="section-title" style="margin-top:20px">Checklists</p>
      <div class="settings-group card">
        <label class="settings-label">Pre-Workout Items</label>
        <div id="pre-cl-list"></div>
        <button class="btn btn-ghost" id="add-pre-item">+ Add item</button>
        <button class="btn btn-secondary settings-save-btn" id="save-pre-cl" style="margin-top:8px">Save</button>
      </div>
      <div class="settings-group card">
        <label class="settings-label">Post-Workout Items</label>
        <div id="post-cl-list"></div>
        <button class="btn btn-ghost" id="add-post-item">+ Add item</button>
        <button class="btn btn-secondary settings-save-btn" id="save-post-cl" style="margin-top:8px">Save</button>
      </div>

      <p class="section-title" style="margin-top:20px">Exercise Library</p>
      <div class="settings-group card" id="exercise-library"></div>
      <button class="btn btn-ghost btn-full" id="add-exercise-btn" style="margin-top:8px">+ Add Exercise</button>

      <p class="section-title" style="margin-top:20px">Workout Templates</p>
      <div class="settings-group card" id="template-library"></div>
      <button class="btn btn-ghost btn-full" id="add-template-btn" style="margin-top:8px">+ New Template</button>

      <p class="section-title" style="margin-top:20px">Data</p>
      <div class="settings-group card">
        <button class="btn btn-ghost btn-full" id="export-json-btn">Export JSON Backup</button>
        <button class="btn btn-ghost btn-full" id="import-csv-btn" style="margin-top:8px">Import from Google Sheets (CSV or Excel)</button>
        <input type="file" id="csv-file-input" accept=".csv,.xlsx" class="hidden">
      </div>
    </div>
  `;

  el.querySelector('#save-api-key').addEventListener('click', async () => {
    await setSetting('anthropicApiKey', el.querySelector('#api-key-input').value.trim());
    showToast('API key saved');
  });
  el.querySelector('#save-health-ctx').addEventListener('click', async () => {
    await setSetting('healthContext', el.querySelector('#health-ctx').value);
    showToast('Health notes saved');
  });

  // Checklist editor
  const preItems = preCL ?? ['Dynamic warm-up done?','Joints feel okay?','Hydrated?','Any new soreness?'];
  renderChecklistEditor(el.querySelector('#pre-cl-list'), preItems, 'pre');
  el.querySelector('#add-pre-item').addEventListener('click', () => {
    preItems.push('New item');
    renderChecklistEditor(el.querySelector('#pre-cl-list'), preItems, 'pre');
  });
  el.querySelector('#save-pre-cl').addEventListener('click', async () => {
    const inputs = el.querySelector('#pre-cl-list').querySelectorAll('.cl-item-input');
    const items = Array.from(inputs).map(i => i.value).filter(Boolean);
    await setSetting('preChecklist', items);
    showToast('Checklist saved');
  });

  const postItems = postCL ?? ['Rate your session (1–5)?','Cool-down done?','Any new soreness?'];
  renderChecklistEditor(el.querySelector('#post-cl-list'), postItems, 'post');
  el.querySelector('#add-post-item').addEventListener('click', () => {
    postItems.push('New item');
    renderChecklistEditor(el.querySelector('#post-cl-list'), postItems, 'post');
  });
  el.querySelector('#save-post-cl').addEventListener('click', async () => {
    const inputs = el.querySelectorAll('#post-cl-list .cl-item-input');
    const items = Array.from(inputs).map(i => i.value).filter(Boolean);
    await setSetting('postChecklist', items);
    showToast('Post-checklist saved');
  });

  // Exercise library
  await renderExerciseLibrary(el.querySelector('#exercise-library'));
  el.querySelector('#add-exercise-btn').addEventListener('click', () => showExerciseForm(el, null));

  // Template library
  await renderTemplateLibrary(el.querySelector('#template-library'), el);
  el.querySelector('#add-template-btn').addEventListener('click', () => showTemplateEditor(el, null));

  // Export
  el.querySelector('#export-json-btn').addEventListener('click', async () => {
    const [sessions, runs, exercises, templates] = await Promise.all([getAllSessions(1000), getRunLogs(1000), getExercises(), getTemplates()]);
    const blob = new Blob([JSON.stringify({ sessions, runs, exercises, templates }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `workout-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  });

  el.querySelector('#import-csv-btn').addEventListener('click', () => el.querySelector('#csv-file-input').click());
  el.querySelector('#csv-file-input').addEventListener('change', async e => {
    const { importCSV } = await import('./onboarding.js');
    await importCSV(e.target.files[0], el);
  });
}

function renderChecklistEditor(container, items, prefix) {
  container.innerHTML = items.map((item, i) =>
    `<div class="cl-row"><input class="input cl-item-input" value="${esc(item)}" data-idx="${i}"><button class="cl-remove-btn" data-idx="${i}">âœ•</button></div>`
  ).join('');
  container.querySelectorAll('.cl-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => { items.splice(Number(btn.dataset.idx), 1); renderChecklistEditor(container, items, prefix); });
  });
}

async function renderExerciseLibrary(container) {
  const exercises = await getExercises();
  container.innerHTML = exercises.length === 0 ? '<p style="color:var(--text-3);padding:12px">No exercises yet</p>'
    : exercises.map(ex => `<div class="lib-row"><span>${esc(ex.name)} <span class="template-tag tag-${esc(ex.bodyPartGroup)}">${esc(ex.bodyPartGroup)}</span></span><button class="btn btn-ghost lib-del-btn" style="min-height:36px;font-size:13px" data-id="${esc(ex.id)}">Delete</button></div>`).join('');
  container.querySelectorAll('.lib-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => { await deleteExercise(btn.dataset.id); await renderExerciseLibrary(container); });
  });
}

async function renderTemplateLibrary(container, el) {
  const templates = await getTemplates();
  container.innerHTML = templates.length === 0 ? '<p style="color:var(--text-3);padding:12px">No templates yet</p>'
    : templates.map(t => `<div class="lib-row"><span>${esc(t.name)} <span class="template-tag tag-${esc(t.bodyPartGroup)}">${esc(t.bodyPartGroup)}</span></span><button class="btn btn-ghost lib-del-btn" style="min-height:36px;font-size:13px" data-id="${esc(t.id)}">Delete</button></div>`).join('');
  container.querySelectorAll('.lib-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => { await deleteTemplate(btn.dataset.id); await renderTemplateLibrary(container, el); });
  });
}

function showExerciseForm(el, existing) {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-title">${existing ? 'Edit' : 'Add'} Exercise</h2>
      <label class="form-label">Name</label>
      <input class="input" id="ex-name" value="${esc(existing?.name || '')}">
      <label class="form-label">Body Part</label>
      <select class="input" id="ex-part">
        ${['arms','legs','core'].map(p => `<option value="${p}" ${existing?.bodyPartGroup === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <label class="form-label">Equipment</label>
      <input class="input" id="ex-equip" value="${esc(existing?.equipment || '')}">
      <label class="form-label">Machine ID (optional)</label>
      <input class="input" id="ex-machine" value="${esc(existing?.machineId || '')}">
      <label class="form-label">Unit</label>
      <select class="input" id="ex-unit">
        ${['lbs','seconds','miles'].map(u => `<option value="${u}" ${existing?.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
      </select>
      <div style="display:flex;gap:12px;margin-top:12px">
        <label><input type="checkbox" id="ex-timed" ${existing?.isTimed ? 'checked' : ''}> Timed</label>
        <label><input type="checkbox" id="ex-uni" ${existing?.isUnilateral ? 'checked' : ''}> Unilateral</label>
      </div>
      <button class="btn btn-primary btn-full" id="save-ex-btn" style="margin-top:16px">Save</button>
    </div>
  `;
  overlay.querySelector('#save-ex-btn').addEventListener('click', async () => {
    const exercise = {
      id: existing?.id || crypto.randomUUID(),
      name: overlay.querySelector('#ex-name').value.trim(),
      bodyPartGroup: overlay.querySelector('#ex-part').value,
      equipment: overlay.querySelector('#ex-equip').value.trim(),
      machineId: overlay.querySelector('#ex-machine').value.trim() || null,
      unit: overlay.querySelector('#ex-unit').value,
      isTimed: overlay.querySelector('#ex-timed').checked,
      isUnilateral: overlay.querySelector('#ex-uni').checked,
      notes: ''
    };
    if (!exercise.name) { alert('Name required'); return; }
    await addExercise(exercise);
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    await renderSettingsTab(el);
  });
}

export async function showTemplateEditor(el, existing) {
  const exercises = await getExercises();
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  const selectedExIds = existing?.exercises.map(e => e.exerciseId) ?? [];
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-title">${existing ? 'Edit' : 'New'} Template</h2>
      <label class="form-label">Name</label>
      <input class="input" id="tpl-name" value="${esc(existing?.name || '')}">
      <label class="form-label">Body Part</label>
      <select class="input" id="tpl-part">
        ${['arms','legs','core'].map(p => `<option value="${p}" ${existing?.bodyPartGroup === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <label class="form-label" style="margin-top:12px">Exercises (in order)</label>
      <div id="tpl-ex-list" style="max-height:240px;overflow-y:auto;margin-bottom:8px">
        ${exercises.map(ex => `<div class="tpl-ex-row"><label><input type="checkbox" value="${ex.id}" ${selectedExIds.includes(ex.id) ? 'checked' : ''}> ${esc(ex.name)}</label></div>`).join('')}
      </div>
      <button class="btn btn-primary btn-full" id="save-tpl-btn">Save Template</button>
    </div>
  `;
  overlay.querySelector('#save-tpl-btn').addEventListener('click', async () => {
    const name = overlay.querySelector('#tpl-name').value.trim();
    if (!name) { alert('Name required'); return; }
    const checked = Array.from(overlay.querySelectorAll('#tpl-ex-list input:checked'));
    const exList = checked.map((inp, i) => {
      const ex = exercises.find(e => e.id === inp.value);
      return { exerciseId: ex.id, defaultSets: 3, targetReps: ex.isTimed ? null : 12, order: i };
    });
    await addTemplate({ id: existing?.id || crypto.randomUUID(), name, bodyPartGroup: overlay.querySelector('#tpl-part').value, exercises: exList, createdAt: Date.now() });
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    await renderSettingsTab(el);
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

