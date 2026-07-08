import { getSessionsByBodyPart, getAllSessions, getRunLogs, getWalkLogs, getSetting, getReadiness, getGoals, saveGoals, getGoalLog, getPainLog, setPain } from './db.js';
import { buildPreWorkoutContext, buildPostWorkoutContext, callClaude, buildExportSummary, buildSessionSummary, buildGoalSuggestions } from './claude-api.js';
import { readinessScore, computeACWR, painSummary } from './metrics.js';
import { toast } from './ui-feedback.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const localDateStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function readinessNoteFor(entry) {
  if (!entry) return '';
  return `Today's readiness: ${readinessScore(entry)}/100 (sleep ${entry.sleep}/5, energy ${entry.energy}/5, soreness ${entry.soreness}/5, mood ${entry.mood}/5).`;
}

function goalsNoteFor(goals, log, today) {
  const active = (goals || []).filter(g => g.title);
  if (!active.length) return '';
  const lines = active.map(g => {
    const c = (log[g.id] || {})[today] || 0;
    return `- ${g.title}: ${c}/${g.target || 1}${g.unit ? ` ${g.unit}` : ''} today`;
  });
  return `Daily goals (help me stay on track / suggest adjustments):\n${lines.join('\n')}`;
}
import { switchTab } from './app.js';
import { setPendingCoachNote } from './ui-log.js';

export async function renderCoachTab(el) {
  const apiKey = await getSetting('anthropicApiKey');
  el.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">Coach</h1>
      ${!apiKey ? '<div class="coach-no-key">Add your Anthropic API key in Settings to use the Coach tab.</div>' : ''}
      <div class="coach-section card" id="body-section">
        <h2 class="coach-section-title">Body Check-In</h2>
        <p class="coach-hint">Tap where it hurts — the coach factors active pain into its advice.</p>
        <div id="body-map"></div>
      </div>
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
      <div class="coach-section card" id="goal-coach-section">
        <h2 class="coach-section-title">Goal Coach</h2>
        <p class="coach-hint">Get daily-goal ideas based on your training, profile, and any flagged pain — add the ones you like.</p>
        <button class="btn btn-secondary btn-full" id="suggest-goals-btn" ${!apiKey ? 'disabled' : ''}>Suggest daily goals</button>
        <div class="coach-response hidden" id="goal-suggestions"></div>
      </div>
      <div class="coach-section card" id="export-section">
        <h2 class="coach-section-title">Update My Health Project</h2>
        <p class="coach-hint">Copy a summary of recent training for your personal Claude app.</p>
        <button class="btn btn-ghost btn-full" id="export-btn">Copy Training Summary</button>
        <p class="export-confirm hidden" id="export-confirm">&#x2713; Copied to clipboard</p>
      </div>
    </div>
  `;

  renderBodyMap(el.querySelector('#body-map'));

  if (!apiKey) return;

  el.querySelector('#pre-ask-btn').addEventListener('click', async () => {
    const part = el.querySelector('#body-part-select').value;
    const note = el.querySelector('#pre-note').value.trim();
    if (!note) { toast('Describe how you are feeling first.', { type: 'error' }); return; }
    await runCoach(el, '#pre-ask-btn', '#pre-response', async () => {
      const today = localDateStr();
      const [recent, health, readiness, goals, goalLog, painLog, allSessions, runs, walks] = await Promise.all([
        getSessionsByBodyPart(part, 4), getSetting('healthContext'), getReadiness(today), getGoals(), getGoalLog(), getPainLog(),
        getAllSessions(200), getRunLogs(50), getWalkLogs(50)
      ]);
      const acwr = computeACWR(allSessions, runs, walks);
      const acwrNote = acwr.hasBaseline ? `Training load (ACWR): ${acwr.ratio.toFixed(2)} — ${acwr.zone} (0.8-1.3 is the safe zone).` : '';
      const statusNote = [readinessNoteFor(readiness), acwrNote, painSummary(painLog), goalsNoteFor(goals, goalLog, today)].filter(Boolean).join('\n\n');
      return buildPreWorkoutContext(recent, note, health, statusNote);
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

  el.querySelector('#suggest-goals-btn').addEventListener('click', async () => {
    const btn = el.querySelector('#suggest-goals-btn');
    const out = el.querySelector('#goal-suggestions');
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    out.classList.add('hidden');
    out.innerHTML = '';
    try {
      const [health, sessions, painLog, goals] = await Promise.all([
        getSetting('healthContext'), getAllSessions(8), getPainLog(), getGoals()
      ]);
      const summaries = sessions.slice(0, 5).map(buildSessionSummary).join('\n');
      const suggestions = await buildGoalSuggestions(health, summaries, painSummary(painLog), goals.map(g => g.title), apiKey);
      if (!suggestions.length) {
        out.textContent = 'No suggestions came back — try again.';
        out.classList.remove('hidden');
        return;
      }
      out.innerHTML = suggestions.map((s, i) =>
        `<div class="goal-sug"><div class="goal-sug-main"><b>${esc(s.title)}</b><span>${s.target > 1 ? `${s.target}${s.unit ? ' ' + esc(s.unit) : ''} daily` : 'daily habit'}${s.why ? ` — ${esc(s.why)}` : ''}</span></div><button class="btn btn-ghost goal-sug-add" data-i="${i}">+ Add</button></div>`
      ).join('');
      out.classList.remove('hidden');
      out.querySelectorAll('.goal-sug-add').forEach(b => b.addEventListener('click', async () => {
        const s = suggestions[Number(b.dataset.i)];
        const list = await getGoals();
        list.push({ id: crypto.randomUUID(), title: s.title, target: s.target, unit: s.unit });
        await saveGoals(list);
        b.textContent = '✓ Added';
        b.disabled = true;
      }));
    } catch (err) {
      out.textContent = `Error: ${err.message}`;
      out.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Suggest daily goals';
    }
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

// ── Body map / pain logger ────────────────────────────────────────────────────
// A blocky mannequin (front/back). Each shape is a tappable region; lateral
// shapes carry a body-side (L/R) so they log as e.g. "R forearm". Fill encodes
// current pain level. Front faces the viewer (viewer-left = body Right); back
// faces away (viewer-left = body Left) — hence the L/R labels flip per view.
const BODY = {
  front: [
    { region: 'neck', shape: 'circle', cx: 60, cy: 20, r: 13 },
    { region: 'shoulder', side: 'R', shape: 'rect', x: 27, y: 38, w: 15, h: 12, rx: 5 },
    { region: 'shoulder', side: 'L', shape: 'rect', x: 78, y: 38, w: 15, h: 12, rx: 5 },
    { region: 'chest', shape: 'rect', x: 45, y: 40, w: 30, h: 24, rx: 6 },
    { region: 'bicep', side: 'R', shape: 'rect', x: 24, y: 50, w: 13, h: 20, rx: 5 },
    { region: 'bicep', side: 'L', shape: 'rect', x: 83, y: 50, w: 13, h: 20, rx: 5 },
    { region: 'elbow', side: 'R', shape: 'rect', x: 24, y: 70, w: 13, h: 9, rx: 4 },
    { region: 'elbow', side: 'L', shape: 'rect', x: 83, y: 70, w: 13, h: 9, rx: 4 },
    { region: 'forearm', side: 'R', shape: 'rect', x: 24, y: 79, w: 13, h: 22, rx: 5 },
    { region: 'forearm', side: 'L', shape: 'rect', x: 83, y: 79, w: 13, h: 22, rx: 5 },
    { region: 'wrist', side: 'R', shape: 'rect', x: 25, y: 101, w: 11, h: 9, rx: 4 },
    { region: 'wrist', side: 'L', shape: 'rect', x: 84, y: 101, w: 11, h: 9, rx: 4 },
    { region: 'core', shape: 'rect', x: 47, y: 66, w: 26, h: 26, rx: 6 },
    { region: 'hip', side: 'R', shape: 'rect', x: 42, y: 94, w: 14, h: 14, rx: 5 },
    { region: 'hip', side: 'L', shape: 'rect', x: 64, y: 94, w: 14, h: 14, rx: 5 },
    { region: 'groin', shape: 'rect', x: 53, y: 97, w: 14, h: 12, rx: 5 },
    { region: 'quad', side: 'R', shape: 'rect', x: 45, y: 112, w: 14, h: 42, rx: 6 },
    { region: 'quad', side: 'L', shape: 'rect', x: 61, y: 112, w: 14, h: 42, rx: 6 },
    { region: 'knee', side: 'R', shape: 'rect', x: 45, y: 154, w: 14, h: 11, rx: 5 },
    { region: 'knee', side: 'L', shape: 'rect', x: 61, y: 154, w: 14, h: 11, rx: 5 },
    { region: 'shin', side: 'R', shape: 'rect', x: 46, y: 167, w: 12, h: 40, rx: 6 },
    { region: 'shin', side: 'L', shape: 'rect', x: 62, y: 167, w: 12, h: 40, rx: 6 },
    { region: 'ankle', side: 'R', shape: 'rect', x: 46, y: 207, w: 12, h: 9, rx: 4 },
    { region: 'ankle', side: 'L', shape: 'rect', x: 62, y: 207, w: 12, h: 9, rx: 4 },
    { region: 'foot', side: 'R', shape: 'rect', x: 43, y: 217, w: 16, h: 12, rx: 4 },
    { region: 'foot', side: 'L', shape: 'rect', x: 61, y: 217, w: 16, h: 12, rx: 4 },
  ],
  back: [
    { region: 'neck', shape: 'circle', cx: 60, cy: 20, r: 13 },
    { region: 'traps', shape: 'rect', x: 46, y: 36, w: 28, h: 12, rx: 5 },
    { region: 'shoulder', side: 'L', shape: 'rect', x: 27, y: 40, w: 15, h: 12, rx: 5 },
    { region: 'shoulder', side: 'R', shape: 'rect', x: 78, y: 40, w: 15, h: 12, rx: 5 },
    { region: 'upper back', side: 'L', shape: 'rect', x: 46, y: 48, w: 14, h: 22, rx: 6 },
    { region: 'upper back', side: 'R', shape: 'rect', x: 60, y: 48, w: 14, h: 22, rx: 6 },
    { region: 'tricep', side: 'L', shape: 'rect', x: 24, y: 52, w: 13, h: 20, rx: 5 },
    { region: 'tricep', side: 'R', shape: 'rect', x: 83, y: 52, w: 13, h: 20, rx: 5 },
    { region: 'elbow', side: 'L', shape: 'rect', x: 24, y: 72, w: 13, h: 9, rx: 4 },
    { region: 'elbow', side: 'R', shape: 'rect', x: 83, y: 72, w: 13, h: 9, rx: 4 },
    { region: 'forearm', side: 'L', shape: 'rect', x: 24, y: 81, w: 13, h: 22, rx: 5 },
    { region: 'forearm', side: 'R', shape: 'rect', x: 83, y: 81, w: 13, h: 22, rx: 5 },
    { region: 'wrist', side: 'L', shape: 'rect', x: 25, y: 103, w: 11, h: 9, rx: 4 },
    { region: 'wrist', side: 'R', shape: 'rect', x: 84, y: 103, w: 11, h: 9, rx: 4 },
    { region: 'lower back', shape: 'rect', x: 47, y: 72, w: 26, h: 22, rx: 6 },
    { region: 'glutes', shape: 'rect', x: 44, y: 96, w: 32, h: 16, rx: 6 },
    { region: 'hamstring', side: 'L', shape: 'rect', x: 45, y: 114, w: 14, h: 40, rx: 6 },
    { region: 'hamstring', side: 'R', shape: 'rect', x: 61, y: 114, w: 14, h: 40, rx: 6 },
    { region: 'knee', side: 'L', shape: 'rect', x: 45, y: 154, w: 14, h: 10, rx: 5 },
    { region: 'knee', side: 'R', shape: 'rect', x: 61, y: 154, w: 14, h: 10, rx: 5 },
    { region: 'calf', side: 'L', shape: 'rect', x: 46, y: 166, w: 12, h: 40, rx: 6 },
    { region: 'calf', side: 'R', shape: 'rect', x: 62, y: 166, w: 12, h: 40, rx: 6 },
    { region: 'ankle', side: 'L', shape: 'rect', x: 46, y: 206, w: 12, h: 9, rx: 4 },
    { region: 'ankle', side: 'R', shape: 'rect', x: 62, y: 206, w: 12, h: 9, rx: 4 },
    { region: 'heel', side: 'L', shape: 'rect', x: 43, y: 216, w: 16, h: 12, rx: 4 },
    { region: 'heel', side: 'R', shape: 'rect', x: 61, y: 216, w: 16, h: 12, rx: 4 },
  ],
};

// The stored/coach-facing key for a zone, e.g. "R forearm" or "chest".
const zoneKey = z => z.side ? `${z.side} ${z.region}` : z.region;

function painBucket(level) { return level >= 7 ? 'sev' : level >= 4 ? 'mod' : level >= 1 ? 'mild' : 'none'; }
function painFill(level) {
  return { none: 'var(--surface-hi)', mild: '#f2c53d', mod: '#e58a2a', sev: '#e05252' }[painBucket(level)];
}

function bodyZonesSVG(view, painLog) {
  return BODY[view].map(z => {
    const k = zoneKey(z);
    const fill = painFill(painLog[k]?.level || 0);
    const attrs = `class="bp-zone" data-region="${esc(k)}" fill="${fill}"`;
    return z.shape === 'circle'
      ? `<circle ${attrs} cx="${z.cx}" cy="${z.cy}" r="${z.r}"></circle>`
      : `<rect ${attrs} x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="${z.rx}"></rect>`;
  }).join('');
}

async function renderBodyMap(container, view = 'front') {
  if (!container) return;
  const painLog = await getPainLog();
  const active = Object.entries(painLog).filter(([, v]) => v.level > 0).sort((a, b) => b[1].level - a[1].level);
  container.innerHTML = `
    <div class="bp-toggle">
      <button class="bp-tab${view === 'front' ? ' on' : ''}" data-view="front">Front</button>
      <button class="bp-tab${view === 'back' ? ' on' : ''}" data-view="back">Back</button>
    </div>
    <svg class="bp-svg" viewBox="0 0 120 236" role="img" aria-label="Body map — tap a region to log pain">
      <text class="bp-lr" x="18" y="34">${view === 'front' ? 'R' : 'L'}</text>
      <text class="bp-lr" x="102" y="34">${view === 'front' ? 'L' : 'R'}</text>
      ${bodyZonesSVG(view, painLog)}
    </svg>
    <div class="bp-active">
      ${active.length
        ? active.map(([r, v]) => `<span class="bp-chip bp-${painBucket(v.level)}">${esc(r)} ${v.level}/10</span>`).join('')
        : '<span class="bp-none">Nothing flagged — tap a region if something is bothering you.</span>'}
    </div>
  `;
  container.querySelectorAll('.bp-tab').forEach(b => b.addEventListener('click', () => renderBodyMap(container, b.dataset.view)));
  container.querySelectorAll('.bp-zone').forEach(z => z.addEventListener('click', () => showPainSheet(container, z.dataset.region, view)));
}

function showPainSheet(container, region, view) {
  getPainLog().then(painLog => {
    const cur = painLog[region] || { level: 0, note: '' };
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <h2 class="modal-title" style="margin-bottom:0;text-transform:capitalize">${esc(region)}</h2>
          <button class="modal-dismiss-btn" id="bp-dismiss" aria-label="Dismiss">✕</button>
        </div>
        <p class="coach-hint" style="margin-bottom:12px">How much does it bother you right now?</p>
        <div style="display:flex;align-items:center;gap:12px">
          <input type="range" id="bp-level" min="0" max="10" value="${cur.level}" style="flex:1">
          <span id="bp-val" style="font-family:var(--font-mono);font-size:24px;font-weight:800;width:28px;text-align:right">${cur.level}</span>
        </div>
        <label class="form-label" style="margin-top:8px">Note <span class="form-hint">optional — side, quality, when</span></label>
        <input class="input" id="bp-note" placeholder="e.g. right side, sharp with rotation" value="${esc(cur.note || '')}">
        <button class="btn btn-primary btn-full" id="bp-save" style="margin-top:16px">Save</button>
        <button class="btn btn-ghost btn-full" id="bp-clear" style="margin-top:8px">Clear — no pain here</button>
      </div>
    `;
    const close = () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; };
    const levelInput = overlay.querySelector('#bp-level');
    levelInput.addEventListener('input', () => { overlay.querySelector('#bp-val').textContent = levelInput.value; });
    overlay.querySelector('#bp-dismiss').addEventListener('click', close);
    overlay.querySelector('#bp-save').addEventListener('click', async () => {
      await setPain(region, Number(levelInput.value), overlay.querySelector('#bp-note').value.trim(), localDateStr());
      close();
      renderBodyMap(container, view);
    });
    overlay.querySelector('#bp-clear').addEventListener('click', async () => {
      await setPain(region, 0);
      close();
      renderBodyMap(container, view);
    });
  });
}
