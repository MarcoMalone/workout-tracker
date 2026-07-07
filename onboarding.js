import { getSetting, setSetting, saveSession, addExercise, addTemplate } from './db.js';
import { switchTab } from './app.js';
import { STARTER_TEMPLATES } from './seed-data.js';
import { showPasteTemplateModal } from './template-import.js';

export async function checkOnboarding() {
  const done = await getSetting('onboardingComplete');
  if (done) return false;
  renderOnboarding();
  return true;
}

function renderOnboarding() {
  const content = document.getElementById('tab-content');
  const nav = document.getElementById('bottom-nav');
  nav.classList.add('hidden');
  let step = 1;

  function showStep(n) {
    step = n;
    content.innerHTML = '';
    if (n === 1) renderWelcome(content);
    else if (n === 2) renderApiKeyStep(content);
    else if (n === 3) renderHealthContextStep(content);
    else finish();
  }

  function renderWelcome(el) {
    el.innerHTML = `
      <div class="onboard-screen">
        <div class="onboard-hero">💪</div>
        <h1 class="onboard-title">Workout Tracker</h1>
        <p class="onboard-sub">Log workouts, track progression, get AI coaching. Works offline. How do you want to start?</p>
        <button class="btn btn-primary btn-full" id="start-splits">Use starter splits <span style="font-weight:400;opacity:.8">— Arms · Legs · Core</span></button>
        <button class="btn btn-secondary btn-full" id="start-build" style="margin-top:8px">Build my own</button>
        <button class="btn btn-secondary btn-full" id="start-paste" style="margin-top:8px">Paste a template <span style="font-weight:400;opacity:.8">— AI-assisted</span></button>
        <button class="btn btn-ghost btn-full" id="import-btn" style="margin-top:8px">Import Google Sheets history</button>
        <input type="file" id="csv-input" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="hidden">
        <p class="onboard-note" id="start-note"></p>
      </div>
    `;
    el.querySelector('#start-splits').addEventListener('click', async () => {
      for (const tpl of STARTER_TEMPLATES) await addTemplate(tpl);
      showStep(2);
    });
    el.querySelector('#start-build').addEventListener('click', () => showStep(2));
    el.querySelector('#start-paste').addEventListener('click', () => {
      showPasteTemplateModal(result => {
        const note = el.querySelector('#start-note');
        if (note) note.textContent = `Added "${result.name}". Paste another, pick another option, or you're set.`;
      });
    });
    el.querySelector('#import-btn').addEventListener('click', () => el.querySelector('#csv-input').click());
    el.querySelector('#csv-input').addEventListener('change', async e => {
      await importCSV(e.target.files[0], el);
      showStep(2);
    });
  }

  function renderApiKeyStep(el) {
    el.innerHTML = `
      <div class="onboard-screen">
        <h2 class="onboard-step-title">Anthropic API Key</h2>
        <p class="onboard-step-sub">Powers the Coach tab. Costs about $0.005 per workout session. Skip anytime — you can add it later in Settings.</p>
        <input type="password" class="input" id="api-key" placeholder="sk-ant-...">
        <button class="btn btn-primary btn-full" id="save-key-btn" style="margin-top:12px">Save & Continue</button>
        <button class="btn btn-ghost btn-full" id="skip-key-btn" style="margin-top:8px">Skip for now</button>
      </div>
    `;
    el.querySelector('#save-key-btn').addEventListener('click', async () => {
      const val = el.querySelector('#api-key').value.trim();
      if (val) await setSetting('anthropicApiKey', val);
      showStep(3);
    });
    el.querySelector('#skip-key-btn').addEventListener('click', () => showStep(3));
  }

  function renderHealthContextStep(el) {
    const placeholder = `## Current Limitations\n- \n\n## Things to Monitor\n- \n\n## Training History Context\n- `;
    el.innerHTML = `
      <div class="onboard-screen">
        <h2 class="onboard-step-title">Health Notes</h2>
        <p class="onboard-step-sub">Injury history, things to monitor, ortho notes. Sent with every coaching request. You can skip and fill this in later.</p>
        <textarea class="input" id="health-ctx" rows="8" placeholder="${placeholder}"></textarea>
        <button class="btn btn-primary btn-full" id="save-ctx-btn" style="margin-top:12px">Save & Start</button>
        <button class="btn btn-ghost btn-full" id="skip-ctx-btn" style="margin-top:8px">Skip for now</button>
      </div>
    `;
    el.querySelector('#save-ctx-btn').addEventListener('click', async () => {
      const val = el.querySelector('#health-ctx').value.trim();
      if (val) await setSetting('healthContext', val);
      finish();
    });
    el.querySelector('#skip-ctx-btn').addEventListener('click', () => finish());
  }

  async function finish() {
    await setSetting('onboardingComplete', true);
    nav.classList.remove('hidden');
    document.querySelector('[data-tab="log"]').classList.add('active');
    await switchTab('log');
  }

  showStep(1);
}

export async function importCSV(file, el) {
  let text;
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    text = window.XLSX.utils.sheet_to_csv(sheet);
  } else {
    text = await file.text();
  }
  const sessions = parseWorkoutCSV(text);
  let count = 0;
  for (const session of sessions) {
    await saveSession(session);
    count++;
  }
  alert(`Imported ${count} sessions.`);
}

function parseCSVRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim()); current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseWorkoutCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = parseCSVRow(lines[0]);
  const rows = lines.slice(1).map(line => {
    const vals = parseCSVRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]));
  });

  const sessionMap = new Map();
  for (const row of rows) {
    const key = `${row.Date}__${row.Workout}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        id: crypto.randomUUID(),
        templateId: '',
        templateName: row.Workout,
        bodyPartGroup: inferBodyPartGroup(row.Workout),
        date: row.Date,
        startedAt: null,
        finishedAt: null,
        isImported: true,
        sessionRating: null,
        preChecklist: {},
        postChecklist: {},
        sessionNotes: '',
        exercises: []
      });
    }
    const session = sessionMap.get(key);
    let ex = session.exercises.find(e => e.exerciseName === row.Exercise);
    if (!ex) {
      ex = { exerciseId: row.Exercise.toLowerCase().replace(/\s+/g, '-'), exerciseName: row.Exercise, notes: '', sets: [] };
      session.exercises.push(ex);
    }
    if (row.Notes && !ex.notes.includes(row.Notes)) {
      ex.notes = [ex.notes, row.Notes].filter(Boolean).join('; ');
    }
    ex.sets.push({
      setNumber: Number(row.Set),
      weight: Number(row.Weight_lbs) || null,
      reps: Number(row.Reps) || null,
      seconds: null,
      side: null,
      isDropSet: false,
      parentSetIndex: null
    });
  }
  return Array.from(sessionMap.values());
}

function inferBodyPartGroup(workoutName) {
  const n = workoutName.toLowerCase();
  if (n.includes('arm') || n.includes('curl') || n.includes('tricep') || n.includes('bicep')) return 'arms';
  if (n.includes('leg') || n.includes('squat') || n.includes('run')) return 'legs';
  if (n.includes('core') || n.includes('ab') || n.includes('plank')) return 'core';
  return 'arms';
}
