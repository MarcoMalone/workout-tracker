import { getSessionsByBodyPart, getAllSessions, getRunLogs, getWalkLogs, getSetting, getReadiness } from './db.js';
import { buildPreWorkoutContext, buildPostWorkoutContext, callClaude, buildExportSummary } from './claude-api.js';
import { readinessScore } from './metrics.js';

const localDateStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function readinessNoteFor(entry) {
  if (!entry) return '';
  return `Today's readiness: ${readinessScore(entry)}/100 (sleep ${entry.sleep}/5, energy ${entry.energy}/5, soreness ${entry.soreness}/5, mood ${entry.mood}/5).`;
}
import { switchTab } from './app.js';
import { setPendingCoachNote } from './ui-log.js';

export async function renderCoachTab(el) {
  const apiKey = await getSetting('anthropicApiKey');
  el.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">Coach</h1>
      ${!apiKey ? '<div class="coach-no-key">Add your Anthropic API key in Settings to use the Coach tab.</div>' : ''}
      <div class="coach-section card" id="pre-section">
        <h2 class="coach-section-title">Pre-Workout Check-In</h2>
        <p class="coach-hint">How are you feeling? Any soreness, tightness, or injuries to flag?</p>
        <div class="coach-body-picker">
          <select class="input" id="body-part-select">
            <option value="arms">Arms</option>
            <option value="legs">Legs</option>
            <option value="core">Core</option>
          </select>
        </div>
        <textarea class="input coach-input" id="pre-note" rows="3" placeholder="e.g. left shoulder tight, slept 6 hrs, legs still sore from Tuesday" ${!apiKey ? 'disabled' : ''}></textarea>
        <button class="btn btn-primary btn-full" id="pre-ask-btn" ${!apiKey ? 'disabled' : ''}>Ask Coach</button>
        <div class="coach-response hidden" id="pre-response"></div>
      </div>
      <div class="coach-section card" id="post-section">
        <h2 class="coach-section-title">Post-Workout Debrief</h2>
        <p class="coach-hint">Get feedback on your most recent session.</p>
        <textarea class="input coach-input" id="post-note" rows="2" placeholder="Anything specific you want feedback on? (optional)" ${!apiKey ? 'disabled' : ''}></textarea>
        <button class="btn btn-secondary btn-full" id="post-ask-btn" ${!apiKey ? 'disabled' : ''}>Get Debrief</button>
        <div class="coach-response hidden" id="post-response"></div>
      </div>
      <div class="coach-section card" id="export-section">
        <h2 class="coach-section-title">Update My Health Project</h2>
        <p class="coach-hint">Copy a summary of recent training for your personal Claude app.</p>
        <button class="btn btn-ghost btn-full" id="export-btn">Copy Training Summary</button>
        <p class="export-confirm hidden" id="export-confirm">&#x2713; Copied to clipboard</p>
      </div>
    </div>
  `;

  if (!apiKey) return;

  el.querySelector('#pre-ask-btn').addEventListener('click', async () => {
    const part = el.querySelector('#body-part-select').value;
    const note = el.querySelector('#pre-note').value.trim();
    if (!note) { alert('Describe how you are feeling first.'); return; }
    await runCoach(el, '#pre-ask-btn', '#pre-response', async () => {
      const [recent, health, readiness] = await Promise.all([
        getSessionsByBodyPart(part, 4), getSetting('healthContext'), getReadiness(localDateStr())
      ]);
      return buildPreWorkoutContext(recent, note, health, readinessNoteFor(readiness));
    }, apiKey);
    const resp = el.querySelector('#pre-response');
    if (!resp.classList.contains('hidden') && !resp.textContent.startsWith('Error:')) {
      el.querySelector('#coach-start-btn')?.remove();
      const startBtn = document.createElement('button');
      startBtn.id = 'coach-start-btn';
      startBtn.className = 'btn btn-secondary btn-full';
      startBtn.style.marginTop = '10px';
      const label = part.charAt(0).toUpperCase() + part.slice(1);
      startBtn.textContent = `→ Start ${label} Workout`;
      startBtn.addEventListener('click', () => {
        setPendingCoachNote(note, part);
        switchTab('log');
      });
      resp.after(startBtn);
    }
  });

  el.querySelector('#post-ask-btn').addEventListener('click', async () => {
    await runCoach(el, '#post-ask-btn', '#post-response', async () => {
      const [all, health] = await Promise.all([getAllSessions(10), getSetting('healthContext')]);
      if (all.length === 0) throw new Error('No sessions logged yet.');
      const recent = all.slice(1, 4);
      const extraNote = el.querySelector('#post-note').value.trim();
      const latest = extraNote ? { ...all[0], sessionNotes: (all[0].sessionNotes + ' ' + extraNote).trim() } : all[0];
      return buildPostWorkoutContext(latest, recent, health);
    }, apiKey);
  });

  el.querySelector('#export-btn').addEventListener('click', async () => {
    const [sessions, runs, walks] = await Promise.all([getAllSessions(30), getRunLogs(12), getWalkLogs(12)]);
    const text = buildExportSummary(sessions, runs, walks);
    await navigator.clipboard.writeText(text);
    const confirm = el.querySelector('#export-confirm');
    confirm.classList.remove('hidden');
    setTimeout(() => confirm.classList.add('hidden'), 3000);
  });
}

async function runCoach(el, btnSel, respSel, contextFn, apiKey) {
  const btn = el.querySelector(btnSel);
  const resp = el.querySelector(respSel);
  btn.disabled = true;
  btn.textContent = 'Thinking…';
  resp.classList.add('hidden');
  resp.innerHTML = '';
  try {
    const { system, userMessage } = await contextFn();
    const text = await callClaude(system, userMessage, apiKey);
    const textEl = document.createElement('p');
    textEl.style.cssText = 'margin:0;white-space:pre-wrap';
    textEl.textContent = text;
    const copyBtn = document.createElement('button');
    copyBtn.className = 'coach-copy-btn';
    copyBtn.textContent = '📋 Copy response';
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy response'; }, 2000);
    });
    resp.appendChild(textEl);
    resp.appendChild(copyBtn);
    resp.classList.remove('hidden');
  } catch (err) {
    resp.textContent = `Error: ${err.message}`;
    resp.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = btn.id === 'pre-ask-btn' ? 'Ask Coach' : 'Get Debrief';
  }
}
