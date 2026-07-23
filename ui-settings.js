import { getSetting, setSetting, getExercises, addExercise, deleteExercise, getTemplates, addTemplate, deleteTemplate, getAllSessions, getRunLogs, exportAllData, importAllData, backupSummary, getExerciseUsageCounts, mergeExercises } from './db.js';
import { showHelpCenter, openFeedback } from './ui-help.js';
import { showPasteTemplateModal } from './template-import.js';
import { toast, showToast, confirmSheet } from './ui-feedback.js';
import { APP_VERSION, CHANGELOG } from './version.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function lastBackupLabel() {
  let ts = 0;
  try { ts = Number(localStorage.getItem('lastBackup')) || 0; } catch (e) { ts = 0; }
  if (!ts) return '⚠ No backup yet — export one to keep your data safe.';
  const days = Math.floor((Date.now() - ts) / 86400000);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `Last backup: ${when}.`;
}
function refreshLastBackup(el) {
  const n = el.querySelector('#last-backup');
  if (n) n.textContent = lastBackupLabel();
}

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

// Wire a localStorage-backed on/off switch. `defaultOn` sets the value used when
// the key was never written (only the opposite string flips it).
function wirePrefToggle(el, id, key, defaultOn) {
  const btn = el.querySelector('#' + id);
  if (!btn) return;
  const isOn = () => defaultOn ? localStorage.getItem(key) !== 'off' : localStorage.getItem(key) === 'on';
  const paint = () => { btn.classList.toggle('on', isOn()); btn.setAttribute('aria-checked', String(isOn())); };
  paint();
  btn.addEventListener('click', () => {
    localStorage.setItem(key, isOn() ? 'off' : 'on');
    paint();
  });
}

export async function renderSettingsTab(el) {
  const [apiKey, healthCtx, preCL, postCL] = await Promise.all([
    getSetting('anthropicApiKey'), getSetting('healthContext'),
    getSetting('preChecklist'), getSetting('postChecklist')
  ]);
  el.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">Settings</h1>

      <button class="btn btn-ghost btn-full" id="open-help-center" style="margin-bottom:8px">❓ Help Center &amp; FAQ</button>
      <button class="btn btn-ghost btn-full" id="send-feedback" style="margin-bottom:18px">✉ Send feedback</button>

      <p class="section-title">Coach</p>
      <div class="settings-group card">
        <label class="settings-label">Anthropic API Key</label>
        <input type="password" class="input" id="api-key-input" value="${esc(apiKey)}" placeholder="sk-ant-...">
        <p class="settings-hint" style="margin-top:8px">Only for the optional AI coach. When you ask it something, your workout details and question go to Anthropic using this key. Stored only on this device; never included in a backup.</p>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-secondary settings-save-btn" id="save-api-key" style="flex:1;margin:0">Save Key</button>
          <button class="btn btn-ghost" id="clear-api-key" style="flex:1">Clear</button>
        </div>
      </div>

      <details class="settings-collapsible">
        <summary class="section-title" style="margin-top:20px">Coach Profile <span class="collapse-caret">▾</span></summary>
        <div class="settings-group card">
          <label class="settings-label">Your system prompt — shapes every coaching response</label>
          <p class="settings-hint">Include your sport, injury history, current PT stage, and goals. This is injected into every Coach request so the AI knows who it's talking to.</p>
          <textarea class="input" id="health-ctx" rows="7" placeholder="e.g. Recreational baseball player (pitcher). Managing right hip and groin issues — in PT for hip IR and VMO strengthening. Priority: stay active without aggravating hip. Flag any exercise that risks hip impingement or groin strain.">${esc(healthCtx)}</textarea>
          <button class="btn btn-secondary settings-save-btn" id="save-health-ctx">Save</button>
        </div>
      </details>

      <details class="settings-collapsible">
        <summary class="section-title" style="margin-top:20px">Checklists <span class="collapse-caret">▾</span></summary>
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
      </details>

      <details class="settings-collapsible">
        <summary class="section-title" style="margin-top:20px">Exercise Library <span class="collapse-caret">▾</span></summary>
        <div class="settings-group card" id="exercise-library"></div>
        <button class="btn btn-ghost btn-full" id="add-exercise-btn" style="margin-top:8px">+ Add Exercise</button>
        <button class="btn btn-ghost btn-full" id="merge-exercises-btn" style="margin-top:8px">⇄ Merge duplicate exercises</button>
        <p class="settings-hint" style="margin-top:6px">Combine two exercises that are really the same (e.g. a coach-built "Cable Row" and your "Seated Cable Rows") so their history and charts merge.</p>
      </details>

      <details class="settings-collapsible">
        <summary class="section-title" style="margin-top:20px">Workout Templates <span class="collapse-caret">▾</span></summary>
        <div class="settings-group card" id="template-library"></div>
        <button class="btn btn-ghost btn-full" id="add-template-btn" style="margin-top:8px">+ New Template</button>
        <button class="btn btn-ghost btn-full" id="paste-template-btn" style="margin-top:8px">Paste a template (AI-assisted)</button>
      </details>

      <p class="section-title" style="margin-top:20px">Appearance</p>
      <div class="settings-group card">
        <label class="settings-label">Theme</label>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-secondary" id="theme-dark-btn" style="flex:1">Dark</button>
          <button class="btn btn-secondary" id="theme-light-btn" style="flex:1">Light</button>
        </div>
      </div>

      <p class="section-title" style="margin-top:20px">Workout feel</p>
      <div class="settings-group card">
        <div class="pref-row">
          <div class="pref-text"><span class="settings-label" style="margin:0">Keep screen on</span><p class="settings-hint" style="margin:2px 0 0">Stops your phone sleeping during a workout.</p></div>
          <button class="pref-toggle" id="pref-keepScreenOn" role="switch" aria-label="Keep screen on"></button>
        </div>
        <div class="pref-row">
          <div class="pref-text"><span class="settings-label" style="margin:0">Haptic feedback</span><p class="settings-hint" style="margin:2px 0 0">Buzz when you log a set and when rest ends (Android; iOS is silent).</p></div>
          <button class="pref-toggle" id="pref-haptics" role="switch" aria-label="Haptic feedback"></button>
        </div>
        <div class="pref-row">
          <div class="pref-text"><span class="settings-label" style="margin:0">Auto rest timer</span><p class="settings-hint" style="margin:2px 0 0">Start a rest countdown automatically when you check off a set.</p></div>
          <button class="pref-toggle" id="pref-restTimer" role="switch" aria-label="Auto rest timer"></button>
        </div>
        <div class="pref-row">
          <div class="pref-text"><span class="settings-label" style="margin:0">Rest-timer beep</span><p class="settings-hint" style="margin:2px 0 0">Play a short beep when the rest timer hits zero.</p></div>
          <button class="pref-toggle" id="pref-restBeep" role="switch" aria-label="Rest-timer beep"></button>
        </div>
      </div>

      <p class="section-title" style="margin-top:20px">Data & Privacy</p>
      <div class="settings-group card">
        <p class="settings-hint"><b style="color:var(--text)">Your data stays on this phone.</b> No account, no server — nothing is uploaded. (The one exception: the optional AI coach sends what you ask to Anthropic, using your own key.) If you clear your browser or lose the phone, your data is gone unless you've exported a backup.</p>
        <p class="settings-hint" id="last-backup" style="margin-top:6px"></p>
        <button class="btn btn-secondary btn-full" id="export-json-btn">⬇ Export Backup (JSON)</button>
        <button class="btn btn-ghost btn-full" id="restore-json-btn" style="margin-top:8px">⬆ Restore from Backup</button>
        <input type="file" id="json-file-input" accept="application/json,.json" class="hidden">
        <div style="height:1px;background:var(--border);margin:12px 0"></div>
        <button class="btn btn-ghost btn-full" id="import-csv-btn">Import from Google Sheets (CSV or Excel)</button>
        <input type="file" id="csv-file-input" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="hidden">
      </div>

      <details class="settings-collapsible" open>
        <summary class="section-title" style="margin-top:20px">About <span class="collapse-caret">▾</span></summary>
        <div class="settings-group card">
          <p class="settings-label" style="margin:0">Workout Tracker <span style="color:var(--text-3);font-weight:700">v${esc(APP_VERSION)}</span></p>
          <p class="settings-hint" style="margin:4px 0 12px">A private, on-device training log — no accounts, no servers.</p>
          <p class="section-title" style="margin-bottom:6px">What's new</p>
          ${CHANGELOG.slice(0, 3).map(c => `<div class="changelog-entry"><span class="changelog-v">v${esc(c.v)} · ${esc(c.date)}</span><ul class="whatsnew-list">${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}
        </div>
      </details>
    </div>
  `;

  el.querySelector('#open-help-center').addEventListener('click', () => showHelpCenter());
  el.querySelector('#send-feedback').addEventListener('click', () => openFeedback());

  wirePrefToggle(el, 'pref-keepScreenOn', 'keepScreenOn', true);
  wirePrefToggle(el, 'pref-haptics', 'haptics', true);
  wirePrefToggle(el, 'pref-restTimer', 'restTimer', true);
  wirePrefToggle(el, 'pref-restBeep', 'restBeep', false);
  el.querySelector('#paste-template-btn').addEventListener('click', () => showPasteTemplateModal(async () => {
    await renderTemplateLibrary(el.querySelector('#template-library'), el);
    await renderExerciseLibrary(el.querySelector('#exercise-library'), el);
    showToast('Template added');
  }));
  el.querySelector('#save-api-key').addEventListener('click', async () => {
    await setSetting('anthropicApiKey', el.querySelector('#api-key-input').value.trim());
    showToast('API key saved');
  });
  el.querySelector('#clear-api-key').addEventListener('click', async () => {
    await setSetting('anthropicApiKey', '');
    el.querySelector('#api-key-input').value = '';
    toast('API key cleared');
  });
  refreshLastBackup(el);
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
  await renderExerciseLibrary(el.querySelector('#exercise-library'), el);
  el.querySelector('#add-exercise-btn').addEventListener('click', () => showExerciseForm(el, null));
  el.querySelector('#merge-exercises-btn').addEventListener('click', () => showMergeExercises(el));

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
    try { localStorage.setItem('lastBackup', String(Date.now())); } catch (e) {}
    refreshLastBackup(el);
    showToast('Backup exported');
  });

  // Restore from a JSON backup
  el.querySelector('#restore-json-btn').addEventListener('click', () => el.querySelector('#json-file-input').click());
  el.querySelector('#json-file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { toast('That file is not valid JSON.', { type: 'error' }); e.target.value = ''; return; }
    const sum = backupSummary(data);
    if (!(await confirmSheet({ title: 'Restore from backup?', body: `This file has ${sum.workouts} workouts, ${sum.templates} templates, ${sum.exercises} exercises, ${sum.runs} runs and ${sum.walks} walks. Entries with matching IDs are overwritten; nothing already on this device is deleted.`, confirmLabel: 'Restore', danger: true }))) { e.target.value = ''; return; }
    try {
      const counts = await importAllData(data);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      showToast(`Restored ${total} records`);
      await renderSettingsTab(el);
    } catch (err) {
      toast(err.message || 'Restore failed.', { type: 'error' });
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

async function renderExerciseLibrary(container, el) {
  const exercises = await getExercises();
  if (exercises.length === 0) { container.innerHTML = '<p style="color:var(--text-3);padding:12px">No exercises yet</p>'; return; }
  const shown = exLibExpanded ? exercises : exercises.slice(0, COLLAPSE_LIMIT);
  const rowHtml = ex => `<div class="lib-row"><span>${esc(ex.name)}${ex.isUnilateral ? ' <span class="uni-tag">per side</span>' : ''} <span class="template-tag tag-${esc(ex.bodyPartGroup)}">${esc(ex.bodyPartGroup)}</span></span><div style="display:flex;gap:4px"><button class="btn btn-ghost lib-edit-btn" style="min-height:36px;font-size:13px" data-id="${esc(ex.id)}">Edit</button><button class="btn btn-ghost lib-del-btn" style="min-height:36px;font-size:13px;color:var(--danger)" data-id="${esc(ex.id)}">Del</button></div></div>`;
  container.innerHTML = shown.map(rowHtml).join('')
    + (exercises.length > COLLAPSE_LIMIT ? `<button type="button" class="collapse-toggle" id="ex-lib-toggle">${exLibExpanded ? 'Show fewer ▴' : `Show all ${exercises.length} ▾`}</button>` : '');
  container.querySelectorAll('.lib-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => { const ex = exercises.find(e => e.id === btn.dataset.id); if (ex) showExerciseForm(el, ex); });
  });
  container.querySelectorAll('.lib-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => { if (await confirmSheet({ title: 'Delete exercise?', confirmLabel: 'Delete', danger: true })) { await deleteExercise(btn.dataset.id); await renderExerciseLibrary(container, el); } });
  });
  container.querySelector('#ex-lib-toggle')?.addEventListener('click', () => { exLibExpanded = !exLibExpanded; renderExerciseLibrary(container, el); });
}

async function renderTemplateLibrary(container, el) {
  const templates = await getTemplates();
  if (templates.length === 0) { container.innerHTML = '<p style="color:var(--text-3);padding:12px">No templates yet</p>'; return; }
  const shown = tplLibExpanded ? templates : templates.slice(0, COLLAPSE_LIMIT);
  const rowHtml = t => `<div class="lib-row"><span>${esc(t.name)} <span class="template-tag tag-${esc(t.bodyPartGroup)}">${esc(t.bodyPartGroup)}</span></span><div style="display:flex;gap:4px"><button class="btn btn-ghost lib-edit-btn" style="min-height:36px;font-size:13px" data-id="${esc(t.id)}">Edit</button><button class="btn btn-ghost lib-del-btn" style="min-height:36px;font-size:13px;color:var(--danger)" data-id="${esc(t.id)}">Del</button></div></div>`;
  container.innerHTML = shown.map(rowHtml).join('')
    + (templates.length > COLLAPSE_LIMIT ? `<button type="button" class="collapse-toggle" id="tpl-lib-toggle">${tplLibExpanded ? 'Show fewer ▴' : `Show all ${templates.length} ▾`}</button>` : '');
  container.querySelectorAll('.lib-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => { if (await confirmSheet({ title: 'Delete template?', confirmLabel: 'Delete', danger: true })) { await deleteTemplate(btn.dataset.id); await renderTemplateLibrary(container, el); } });
  });
  container.querySelectorAll('.lib-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => { const tpl = templates.find(t => t.id === btn.dataset.id); if (tpl) showTemplateEditor(el, tpl); });
  });
  container.querySelector('#tpl-lib-toggle')?.addEventListener('click', () => { tplLibExpanded = !tplLibExpanded; renderTemplateLibrary(container, el); });
}

// Merge duplicate exercises. Lists the library with per-exercise logged-session
// counts; the athlete checks the ones that are really the same movement, picks
// which to keep (defaults to the one with the most history), and merges — all
// logged sets and template entries repoint onto the keeper. See mergeExercises().
async function showMergeExercises(el) {
  const [exercises, usage] = await Promise.all([getExercises(), getExerciseUsageCounts()]);
  const sorted = exercises.slice().sort((a, b) =>
    a.bodyPartGroup.localeCompare(b.bodyPartGroup) || a.name.localeCompare(b.name));
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  const rows = sorted.map(ex => {
    const n = usage[ex.id] || 0;
    return `<label class="merge-row">
      <input type="checkbox" class="merge-cb" data-id="${esc(ex.id)}" data-name="${esc(ex.name)}">
      <span class="merge-name">${esc(ex.name)} <span class="template-tag tag-${esc(ex.bodyPartGroup)}">${esc(ex.bodyPartGroup)}</span></span>
      <span class="merge-count">${n} logged</span>
    </label>`;
  }).join('');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 class="modal-title" style="margin-bottom:0">Merge Duplicates</h2>
        <button class="modal-dismiss-btn" id="merge-dismiss">&times;</button>
      </div>
      <p class="settings-hint" style="margin-bottom:12px">Check the exercises that are the same movement, choose which one to keep, then merge. All logged history moves onto the kept exercise. This can't be undone — back up first if unsure.</p>
      <div class="merge-list">${rows}</div>
      <label class="form-label" style="margin-top:14px">Keep</label>
      <select class="input" id="merge-keep"><option value="">— select 2+ above —</option></select>
      <button class="btn btn-primary btn-full" id="merge-go" style="margin-top:14px" disabled>Merge</button>
    </div>
  `;
  const close = () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; };
  const keepSel = overlay.querySelector('#merge-keep');
  const goBtn = overlay.querySelector('#merge-go');
  const refresh = () => {
    const checked = [...overlay.querySelectorAll('.merge-cb:checked')];
    keepSel.innerHTML = checked.length
      ? checked.map(c => `<option value="${esc(c.dataset.id)}">${esc(c.dataset.name)}</option>`).join('')
      : '<option value="">— select 2+ above —</option>';
    // Default the keeper to the checked exercise with the most logged history.
    if (checked.length) {
      let best = checked[0];
      for (const c of checked) if ((usage[c.dataset.id] || 0) > (usage[best.dataset.id] || 0)) best = c;
      keepSel.value = best.dataset.id;
    }
    goBtn.disabled = checked.length < 2;
  };
  overlay.querySelectorAll('.merge-cb').forEach(cb => cb.addEventListener('change', refresh));
  overlay.querySelector('#merge-dismiss').addEventListener('click', close);
  goBtn.addEventListener('click', async () => {
    const checked = [...overlay.querySelectorAll('.merge-cb:checked')];
    const keepId = keepSel.value;
    const fromIds = checked.map(c => c.dataset.id).filter(id => id !== keepId);
    if (!keepId || !fromIds.length) return;
    const keepName = checked.find(c => c.dataset.id === keepId)?.dataset.name || 'it';
    if (!(await confirmSheet({ title: `Merge ${fromIds.length + 1} into "${keepName}"?`, body: 'Logged history and templates will repoint onto the kept exercise; the others are deleted.', confirmLabel: 'Merge', danger: true }))) return;
    try {
      const res = await mergeExercises(keepId, fromIds);
      close();
      showToast(`Merged — ${res.removed} removed, ${res.sessions} session${res.sessions === 1 ? '' : 's'} updated`);
      await renderExerciseLibrary(el.querySelector('#exercise-library'), el);
    } catch (err) {
      toast(err.message || 'Merge failed', { type: 'error' });
    }
  });
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
        ${['arms','legs','core'].map(p => `<option value="${p}" ${existing?.bodyPartGroup === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}
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
    if (!exercise.name) { toast('Name required', { type: 'error' }); return; }
    await addExercise(exercise);
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    await renderSettingsTab(el);
  });
}

// Assign superset group ids from per-row "linked with the one above" flags.
// Consecutive linked rows share an id; standalone rows get null. Pure.
export function assignSupersetIds(linkedAbove) {
  const ids = new Array(linkedAbove.length).fill(null);
  for (let i = 1; i < linkedAbove.length; i++) {
    if (linkedAbove[i]) {
      if (!ids[i - 1]) ids[i - 1] = crypto.randomUUID();
      ids[i] = ids[i - 1];
    }
  }
  return ids;
}

export async function showTemplateEditor(el, existing, onSave) {
  const exercises = await getExercises();
  const exById = Object.fromEntries(exercises.map(e => [e.id, e]));
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  const dismiss = () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; };

  // Working copy: an ordered, per-exercise list with editable sets/reps and a
  // "linked with above" (superset) flag derived from the saved supersetId.
  const sorted = existing ? existing.exercises.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
  const chosen = sorted.map((e, i) => ({
    exerciseId: e.exerciseId,
    defaultSets: e.defaultSets ?? 3,
    targetReps: e.targetReps ?? null,
    defaultSeconds: e.defaultSeconds ?? null,
    linkedAbove: i > 0 && !!e.supersetId && e.supersetId === sorted[i - 1].supersetId,
  }));

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
        ${['arms', 'legs', 'core'].map(p => `<option value="${p}" ${existing?.bodyPartGroup === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}
      </select>
      <label class="form-label" style="margin-top:12px">Exercises <span class="form-hint">— reorder, set sets × reps, and ⛓ to superset with the one above</span></label>
      <div id="tpl-ex-list" style="max-height:300px;overflow-y:auto;margin-bottom:8px"></div>
      <select class="input" id="tpl-add-ex"><option value="">+ Add exercise…</option>${exercises.map(ex => `<option value="${esc(ex.id)}">${esc(ex.name)}</option>`).join('')}</select>
      <button class="btn btn-primary btn-full" id="save-tpl-btn" style="margin-top:12px">Save Template</button>
      ${existing ? `<button class="btn btn-ghost btn-full" id="del-tpl-btn" style="margin-top:8px;color:var(--danger)">🗑 Delete Template</button>` : ''}
    </div>
  `;

  const listEl = overlay.querySelector('#tpl-ex-list');
  function renderList() {
    if (!chosen.length) { listEl.innerHTML = '<p class="settings-hint" style="padding:8px 0">No exercises yet — add one below.</p>'; return; }
    listEl.innerHTML = chosen.map((r, i) => {
      const d = exById[r.exerciseId];
      const name = d ? d.name.replace(/_/g, ' ') : r.exerciseId;
      const timed = !!(d && d.isTimed);
      const uni = !!(d && d.isUnilateral);
      const repLabel = uni ? (timed ? 's/side' : 'reps/side') : (timed ? 's' : 'reps');
      const repField = timed ? 'defaultSeconds' : 'targetReps';
      const repVal = timed ? (r.defaultSeconds ?? '') : (r.targetReps ?? '');
      const cfg = `<input class="tpl-mini" type="number" inputmode="numeric" min="1" value="${r.defaultSets}" data-i="${i}" data-f="defaultSets" aria-label="Sets"><span class="tpl-x">×</span><input class="tpl-mini" type="number" inputmode="numeric" value="${repVal}" data-i="${i}" data-f="${repField}" aria-label="${uni ? 'Per side' : 'Reps'}"><span class="tpl-x">${repLabel}</span>`;
      return `<div class="tpl-ex-row${r.linkedAbove ? ' tpl-linked' : ''}">
        ${i > 0 ? `<button class="tpl-link${r.linkedAbove ? ' on' : ''}" data-i="${i}" title="${r.linkedAbove ? 'Linked as a superset — tap to unlink' : 'Superset with the exercise above'}" aria-label="Superset with above">⛓</button>` : '<span class="tpl-link-spacer"></span>'}
        <div class="tpl-ex-main">${r.linkedAbove ? '<span class="tpl-linked-tag">superset with above</span>' : ''}<span class="tpl-ex-name">${esc(name)}${uni ? ' <span class="uni-tag">per side</span>' : ''}</span><div class="tpl-ex-cfg">${cfg}</div></div>
        <div class="tpl-ex-ctrls">
          <button class="tpl-move" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="tpl-move" data-i="${i}" data-d="1" ${i === chosen.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="tpl-remove" data-i="${i}" aria-label="Remove">✕</button>
        </div>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.tpl-mini').forEach(inp => inp.addEventListener('input', () => {
      chosen[+inp.dataset.i][inp.dataset.f] = inp.value === '' ? null : Number(inp.value);
    }));
    listEl.querySelectorAll('.tpl-link').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.i; chosen[i].linkedAbove = !chosen[i].linkedAbove; renderList(); }));
    listEl.querySelectorAll('.tpl-move').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i, j = i + (+b.dataset.d);
      if (j < 0 || j >= chosen.length) return;
      [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
      renderList();
    }));
    listEl.querySelectorAll('.tpl-remove').forEach(b => b.addEventListener('click', () => { chosen.splice(+b.dataset.i, 1); renderList(); }));
  }
  renderList();

  overlay.querySelector('#tpl-add-ex').addEventListener('change', e => {
    const id = e.target.value;
    if (!id) return;
    const d = exById[id];
    chosen.push({ exerciseId: id, defaultSets: 3, targetReps: d?.isTimed ? null : 12, defaultSeconds: d?.isTimed ? 30 : null, linkedAbove: false });
    e.target.value = '';
    renderList();
  });

  overlay.querySelector('#tpl-dismiss-btn').addEventListener('click', dismiss);
  if (existing) {
    overlay.querySelector('#del-tpl-btn').addEventListener('click', async () => {
      if (!(await confirmSheet({ title: 'Delete template?', body: `Delete "${existing.name}"?`, confirmLabel: 'Delete', danger: true }))) return;
      await deleteTemplate(existing.id);
      dismiss();
      if (onSave) await onSave();
      else await renderSettingsTab(el);
    });
  }
  overlay.querySelector('#save-tpl-btn').addEventListener('click', async () => {
    const name = overlay.querySelector('#tpl-name').value.trim();
    if (!name) { toast('Name required', { type: 'error' }); return; }
    if (!chosen.length) { toast('Add at least one exercise', { type: 'error' }); return; }
    const ids = assignSupersetIds(chosen.map(r => r.linkedAbove));
    const exList = chosen.map((r, i) => {
      const d = exById[r.exerciseId];
      return {
        exerciseId: r.exerciseId,
        defaultSets: Math.max(1, Number(r.defaultSets) || 1),
        targetReps: d?.isTimed ? null : (Number(r.targetReps) || null),
        defaultSeconds: d?.isTimed ? (Number(r.defaultSeconds) || null) : null,
        order: i,
        supersetId: ids[i],
      };
    });
    await addTemplate({ id: existing?.id || crypto.randomUUID(), name, bodyPartGroup: overlay.querySelector('#tpl-part').value, exercises: exList, createdAt: existing?.createdAt || Date.now() });
    dismiss();
    if (onSave) await onSave();
    else await renderSettingsTab(el);
  });
}

// showToast/toast/confirmSheet now come from ui-feedback.js.

