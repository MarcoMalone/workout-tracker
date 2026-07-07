import { getSetting, setSetting, getExercises, addExercise, deleteExercise, getTemplates, addTemplate, deleteTemplate, getAllSessions, getRunLogs, exportAllData, importAllData } from './db.js';
import { showHelpCenter } from './ui-help.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const COLLAPSE_LIMIT = 3;
let exLibExpanded = false;
let tplLibExpanded = false;

// Hide rows beyond the limit (kept in the DOM so their inputs still save) and
// append a Show all / Show fewer toggle. Used for the editable checklists.
function collapseRows(container, rowSelector, limit = COLLAPSE_LIMIT) {
  const rows = container.querySelectorAll(rowSelector);
  if (rows.length <= limit) return;
  rows.forEach((r, i) => { if (i >= limit) r.style.display = 'none'; });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'collapse-toggle';
  let expanded = false;
  const label = () => { btn.textContent = expanded ? 'Show fewer ▴' : `Show all ${rows.length} ▾`; };
  btn.addEventListener('click', () => {
    expanded = !expanded;
    rows.forEach((r, i) => { if (i >= limit) r.style.display = expanded ? '' : 'none'; });
    label();
  });
  label();
  container.appendChild(btn);
}

export async function renderSettingsTab(el) {
  const [apiKey, healthCtx, preCL, postCL] = await Promise.all([
    getSetting('anthropicApiKey'), getSetting('healthContext'),
    getSetting('preChecklist'), getSetting('postChecklist')
  ]);
  el.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">Settings</h1>

      <button class="btn btn-ghost btn-full" id="open-help-center" style="margin-bottom:18px">❓ Help Center &amp; FAQ</button>

      <p class="section-title">Coach</p>
      <div class="settings-group card">
        <label class="settings-label">Anthropic API Key</label>
        <input type="password" class="input" id="api-key-input" value="${esc(apiKey)}" placeholder="sk-ant-...">
        <button class="btn btn-secondary settings-save-btn" id="save-api-key">Save Key</button>
      </div>

      <p class="section-title" style="margin-top:20px">Coach Profile</p>
      <div class="settings-group card">
        <label class="settings-label">Your system prompt — shapes every coaching response</label>
        <p class="settings-hint">Include your sport, injury history, current PT stage, and goals. This is injected into every Coach request so the AI knows who it's talking to.</p>
        <textarea class="input" id="health-ctx" rows="7" placeholder="e.g. Recreational baseball player (pitcher). Managing right hip and groin issues — in PT for hip IR and VMO strengthening. Priority: stay active without aggravating hip. Flag any exercise that risks hip impingement or groin strain.">${esc(healthCtx)}</textarea>
        <button class="btn btn-secondary settings-save-btn" id="save-health-ctx">Save</button>
      </div>

      <p class="section-title" style="margin-top:20px">Checklists</p>
      <div class="settings-group card">
        <label class="settings-label">Pre-Workout Items</label>
        <div id="pre-cl-list"></div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-ghost" id="add-pre-item" style="flex:1;min-width:100px">+ Add item</button>
          <button class="btn btn-ghost" id="reset-pre-cl" style="flex:1;min-width:100px;color:var(--text-3)">↺ Reset defaults</button>
        </div>
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

      <p class="section-title" style="margin-top:20px">Appearance</p>
      <div class="settings-group card">
        <label class="settings-label">Theme</label>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-secondary" id="theme-dark-btn" style="flex:1">Dark</button>
          <button class="btn btn-secondary" id="theme-light-btn" style="flex:1">Light</button>
        </div>
      </div>

      <p class="section-title" style="margin-top:20px">Data & Backup</p>
      <div class="settings-group card">
        <p class="settings-hint">Your data lives only on this device. Export a backup regularly — restore it on a new phone or after clearing your browser. Your API key is never included in a backup.</p>
        <button class="btn btn-secondary btn-full" id="export-json-btn">⬇ Export Backup (JSON)</button>
        <button class="btn btn-ghost btn-full" id="restore-json-btn" style="margin-top:8px">⬆ Restore from Backup</button>
        <input type="file" id="json-file-input" accept="application/json,.json" class="hidden">
        <div style="height:1px;background:var(--border);margin:12px 0"></div>
        <button class="btn btn-ghost btn-full" id="import-csv-btn">Import from Google Sheets (CSV or Excel)</button>
        <input type="file" id="csv-file-input" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="hidden">
      </div>
    </div>
  `;

  el.querySelector('#open-help-center').addEventListener('click', () => showHelpCenter());
  el.querySelector('#save-api-key').addEventListener('click', async () => {
    await setSetting('anthropicApiKey', el.querySelector('#api-key-input').value.trim());
    showToast('API key saved');
  });
  el.querySelector('#save-health-ctx').addEventListener('click', async () => {
    await setSetting('healthContext', el.querySelector('#health-ctx').value);
    showToast('Health notes saved');
  });

  // Checklist editor
  const PRE_DEFAULTS = [
    'Dynamic warm-up done? (arm circles, leg swings — 5 min)',
    'Joints feel okay? (no unusual pain)',
    'Hydrated?',
    'Any new soreness since last session?'
  ];
  const preItems = preCL ?? [...PRE_DEFAULTS];
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
  el.querySelector('#reset-pre-cl').addEventListener('click', () => {
    preItems.length = 0;
    PRE_DEFAULTS.forEach(d => preItems.push(d));
    renderChecklistEditor(el.querySelector('#pre-cl-list'), preItems, 'pre');
    showToast('Reset to defaults — tap Save to keep');
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

  // Export — full snapshot of every store (API key excluded by exportAllData)
  el.querySelector('#export-json-btn').addEventListener('click', async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `workout-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Backup exported');
  });

  // Restore from a JSON backup
  el.querySelector('#restore-json-btn').addEventListener('click', () => el.querySelector('#json-file-input').click());
  el.querySelector('#json-file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { alert('That file is not valid JSON.'); e.target.value = ''; return; }
    if (!confirm('Restore from this backup? Entries with matching IDs are overwritten; nothing already on this device is deleted.')) { e.target.value = ''; return; }
    try {
      const counts = await importAllData(data);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      showToast(`Restored ${total} records`);
      await renderSettingsTab(el);
    } catch (err) {
      alert(err.message || 'Restore failed.');
    }
    e.target.value = '';
  });

  el.querySelector('#import-csv-btn').addEventListener('click', () => el.querySelector('#csv-file-input').click());
  el.querySelector('#csv-file-input').addEventListener('change', async e => {
    const { importCSV } = await import('./onboarding.js');
    await importCSV(e.target.files[0], el);
  });

  const applyTheme = (theme) => {
    localStorage.setItem('theme', theme);
    document.body.classList.toggle('light', theme === 'light');
    el.querySelector('#theme-dark-btn').style.borderColor = theme === 'dark' ? 'var(--blue)' : '';
    el.querySelector('#theme-light-btn').style.borderColor = theme === 'light' ? 'var(--blue)' : '';
  };
  const currentTheme = localStorage.getItem('theme') || 'dark';
  el.querySelector('#theme-dark-btn').style.borderColor = currentTheme === 'dark' ? 'var(--blue)' : '';
  el.querySelector('#theme-light-btn').style.borderColor = currentTheme === 'light' ? 'var(--blue)' : '';
  el.querySelector('#theme-dark-btn').addEventListener('click', () => applyTheme('dark'));
  el.querySelector('#theme-light-btn').addEventListener('click', () => applyTheme('light'));
}

function renderChecklistEditor(container, items, prefix) {
  container.innerHTML = items.map((item, i) =>
    `<div class="cl-row"><input class="input cl-item-input" value="${esc(item)}" data-idx="${i}"><button class="cl-remove-btn" data-idx="${i}" title="Remove">&times;</button></div>`
  ).join('');
  container.querySelectorAll('.cl-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => { items.splice(Number(btn.dataset.idx), 1); renderChecklistEditor(container, items, prefix); });
  });
  collapseRows(container, '.cl-row');
}

async function renderExerciseLibrary(container) {
  const exercises = await getExercises();
  if (exercises.length === 0) { container.innerHTML = '<p style="color:var(--text-3);padding:12px">No exercises yet</p>'; return; }
  const shown = exLibExpanded ? exercises : exercises.slice(0, COLLAPSE_LIMIT);
  const rowHtml = ex => `<div class="lib-row"><span>${esc(ex.name)} <span class="template-tag tag-${esc(ex.bodyPartGroup)}">${esc(ex.bodyPartGroup)}</span></span><button class="btn btn-ghost lib-del-btn" style="min-height:36px;font-size:13px" data-id="${esc(ex.id)}">Delete</button></div>`;
  container.innerHTML = shown.map(rowHtml).join('')
    + (exercises.length > COLLAPSE_LIMIT ? `<button type="button" class="collapse-toggle" id="ex-lib-toggle">${exLibExpanded ? 'Show fewer ▴' : `Show all ${exercises.length} ▾`}</button>` : '');
  container.querySelectorAll('.lib-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => { await deleteExercise(btn.dataset.id); await renderExerciseLibrary(container); });
  });
  container.querySelector('#ex-lib-toggle')?.addEventListener('click', () => { exLibExpanded = !exLibExpanded; renderExerciseLibrary(container); });
}

async function renderTemplateLibrary(container, el) {
  const templates = await getTemplates();
  if (templates.length === 0) { container.innerHTML = '<p style="color:var(--text-3);padding:12px">No templates yet</p>'; return; }
  const shown = tplLibExpanded ? templates : templates.slice(0, COLLAPSE_LIMIT);
  const rowHtml = t => `<div class="lib-row"><span>${esc(t.name)} <span class="template-tag tag-${esc(t.bodyPartGroup)}">${esc(t.bodyPartGroup)}</span></span><div style="display:flex;gap:4px"><button class="btn btn-ghost lib-edit-btn" style="min-height:36px;font-size:13px" data-id="${esc(t.id)}">Edit</button><button class="btn btn-ghost lib-del-btn" style="min-height:36px;font-size:13px;color:var(--danger)" data-id="${esc(t.id)}">Del</button></div></div>`;
  container.innerHTML = shown.map(rowHtml).join('')
    + (templates.length > COLLAPSE_LIMIT ? `<button type="button" class="collapse-toggle" id="tpl-lib-toggle">${tplLibExpanded ? 'Show fewer ▴' : `Show all ${templates.length} ▾`}</button>` : '');
  container.querySelectorAll('.lib-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => { if (confirm('Delete this template?')) { await deleteTemplate(btn.dataset.id); await renderTemplateLibrary(container, el); } });
  });
  container.querySelectorAll('.lib-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => { const tpl = templates.find(t => t.id === btn.dataset.id); if (tpl) showTemplateEditor(el, tpl); });
  });
  container.querySelector('#tpl-lib-toggle')?.addEventListener('click', () => { tplLibExpanded = !tplLibExpanded; renderTemplateLibrary(container, el); });
}

function showExerciseForm(el, existing) {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 class="modal-title" style="margin-bottom:0">${existing ? 'Edit' : 'Add'} Exercise</h2>
        <button class="modal-dismiss-btn" id="ex-dismiss-btn">&times;</button>
      </div>
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
        ${['lbs','reps','seconds','miles'].map(u => `<option value="${u}" ${existing?.unit === u ? 'selected' : ''}>${u === 'reps' ? 'reps (bodyweight)' : u}</option>`).join('')}
      </select>
      <div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="ex-timed" ${existing?.isTimed ? 'checked' : ''}> Timed</label>
        <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="ex-uni" ${existing?.isUnilateral ? 'checked' : ''}> Unilateral</label>
        <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="ex-bw" ${existing?.isBodyweight ? 'checked' : ''}> Bodyweight (no weight field)</label>
      </div>
      <button class="btn btn-primary btn-full" id="save-ex-btn" style="margin-top:16px">Save</button>
    </div>
  `;
  overlay.querySelector('#ex-dismiss-btn').addEventListener('click', () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; });
  const unitSel = overlay.querySelector('#ex-unit');
  const bwChk = overlay.querySelector('#ex-bw');
  bwChk.addEventListener('change', () => { if (bwChk.checked) unitSel.value = 'reps'; });
  unitSel.addEventListener('change', () => { if (unitSel.value === 'reps') bwChk.checked = true; });
  overlay.querySelector('#save-ex-btn').addEventListener('click', async () => {
    const exercise = {
      id: existing?.id || crypto.randomUUID(),
      name: overlay.querySelector('#ex-name').value.trim(),
      bodyPartGroup: overlay.querySelector('#ex-part').value,
      equipment: overlay.querySelector('#ex-equip').value.trim(),
      machineId: overlay.querySelector('#ex-machine').value.trim() || null,
      unit: unitSel.value,
      isTimed: overlay.querySelector('#ex-timed').checked,
      isUnilateral: overlay.querySelector('#ex-uni').checked,
      isBodyweight: bwChk.checked,
      notes: ''
    };
    if (!exercise.name) { alert('Name required'); return; }
    await addExercise(exercise);
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    await renderSettingsTab(el);
  });
}

export async function showTemplateEditor(el, existing, onSave) {
  const exercises = await getExercises();
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  const selectedExIds = existing?.exercises.map(e => e.exerciseId) ?? [];
  const dismiss = () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; };
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 class="modal-title" style="margin-bottom:0">${existing ? 'Edit' : 'New'} Template</h2>
        <button class="modal-dismiss-btn" id="tpl-dismiss-btn">&times;</button>
      </div>
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
      ${existing ? `<button class="btn btn-ghost btn-full" id="del-tpl-btn" style="margin-top:8px;color:var(--danger)">🗑 Delete Template</button>` : ''}
    </div>
  `;
  overlay.querySelector('#tpl-dismiss-btn').addEventListener('click', dismiss);
  if (existing) {
    overlay.querySelector('#del-tpl-btn').addEventListener('click', async () => {
      if (!confirm(`Delete "${existing.name}"? This cannot be undone.`)) return;
      await deleteTemplate(existing.id);
      dismiss();
      if (onSave) await onSave();
      else await renderSettingsTab(el);
    });
  }
  overlay.querySelector('#save-tpl-btn').addEventListener('click', async () => {
    const name = overlay.querySelector('#tpl-name').value.trim();
    if (!name) { alert('Name required'); return; }
    const checked = Array.from(overlay.querySelectorAll('#tpl-ex-list input:checked'));
    const exList = checked.map((inp, i) => {
      const exId = inp.value;
      const existingEx = existing?.exercises.find(e => e.exerciseId === exId);
      const exDef = exercises.find(e => e.id === exId);
      if (existingEx) return { ...existingEx, order: i };
      return { exerciseId: exId, defaultSets: 3, targetReps: exDef?.isTimed ? null : 12, defaultSeconds: exDef?.isTimed ? 30 : null, order: i };
    });
    await addTemplate({ id: existing?.id || crypto.randomUUID(), name, bodyPartGroup: overlay.querySelector('#tpl-part').value, exercises: exList, createdAt: existing?.createdAt || Date.now() });
    dismiss();
    if (onSave) await onSave();
    else await renderSettingsTab(el);
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

