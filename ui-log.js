import { getTemplates, getSetting } from './db.js';
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

function renderActiveSession(el) {
  console.log('active session not yet implemented');
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
  console.log('startSession called', template.name);
}
