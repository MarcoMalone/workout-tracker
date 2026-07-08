import { getTemplates, getTemplate, getExercise, getExercises, getLastSessionForExercise, saveSession, getSetting, setSetting, addRunLog, addWalkLog, getRunLogs, getWalkLogs, getAllSessions, deleteTemplate, addTemplate, getReadiness, getReadinessLog, saveReadiness, getGoals, getGoalLog, saveGoals, setGoalProgress, getPainLog } from './db.js';
import { readinessScore, goalStreak, painSummary } from './metrics.js';
import { showHelpCenter } from './ui-help.js';
import { switchTab } from './app.js';
import { haptic } from './haptics.js';
import { acquire as acquireWakeLock, release as releaseWakeLock, wakeLockEnabled, wakeLockSupported } from './wakelock.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Build the Log-home "This Week" bars + activity streak from logged data.
// Strength days scale by volume; cardio-only days show a short bar. Streak
// counts consecutive days of any activity ending today (or yesterday if today
// hasn't been trained yet).
function computeHomeStats(sessions, runs, walks) {
  const map = {}; // dateStr -> { vol, strength }
  const bump = (dateStr, vol, strength) => {
    if (!dateStr) return;
    const m = map[dateStr] || (map[dateStr] = { vol: 0, strength: false });
    m.vol += vol;
    if (strength) m.strength = true;
  };
  for (const s of sessions) {
    const vol = (s.exercises || []).reduce((a, ex) =>
      a + ex.sets.reduce((b, st) => b + (st.weight || 0) * (st.reps || 0), 0), 0);
    bump(s.date, vol, true);
  }
  for (const r of runs) bump(r.date, 0, false);
  for (const w of walks) bump(w.date, 0, false);

  const today = new Date();
  const dow = today.getDay();               // 0 = Sun
  const fromMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - fromMon);
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const m = map[localDateStr(d)];
    week.push({ day: dayLabels[i], vol: m ? m.vol : 0, active: !!m, strength: m ? m.strength : false });
  }
  const maxVol = Math.max(1, ...week.map(w => w.vol));
  const bars = week.map(w => {
    let h = 0;
    if (w.vol > 0) h = Math.max(24, Math.round((w.vol / maxVol) * 100));
    else if (w.active) h = 22;
    return { day: w.day, h, hot: w.strength };
  });
  const weekCount = week.filter(w => w.active).length;

  let streak = 0;
  const cur = new Date(today);
  if (!map[localDateStr(cur)]) cur.setDate(cur.getDate() - 1); // today not trained yet is OK
  while (map[localDateStr(cur)]) { streak++; cur.setDate(cur.getDate() - 1); }

  return { bars, weekCount, streak };
}

export let activeSession = null;

// Test-only: reset module-level session state between test cases.
export function _resetSessionForTest() { activeSession = null; }

let _pendingCoachNote = null;
export function setPendingCoachNote(note, bodyPart) {
  _pendingCoachNote = { note, bodyPart };
}

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
  releaseWakeLock(); // no active workout on the Log home → let the screen sleep
  const [templates, recent, runs, walks, todayReadiness] = await Promise.all([
    getTemplates(), getAllSessions(200), getRunLogs(60), getWalkLogs(60), getReadiness(localDateStr())
  ]);
  const lastArms = recent.find(s => s.bodyPartGroup === 'arms');
  const lastLegs = recent.find(s => s.bodyPartGroup === 'legs');
  const lastLine = (lastArms || lastLegs) ? `
    <p class="section-title" style="margin-bottom:6px;margin-top:24px">Last performed</p>
    <div class="last-workout-row">
      ${lastArms ? `<span class="last-chip"><span class="last-chip-label">Arms</span>${esc(lastArms.templateName)} · ${shortDate(lastArms.date)}</span>` : ''}
      ${lastLegs ? `<span class="last-chip"><span class="last-chip-label">Legs</span>${esc(lastLegs.templateName)} · ${shortDate(lastLegs.date)}</span>` : ''}
    </div>` : '';

  const coachBanner = _pendingCoachNote
    ? `<div class="coach-pending-banner" id="coach-pending-banner">
        <span>Coach note ready for <strong>${esc(_pendingCoachNote.bodyPart)}</strong> — tap a template to start</span>
        <button class="coach-banner-dismiss" id="dismiss-coach-banner">✕</button>
       </div>`
    : '';

  const { bars, weekCount, streak } = computeHomeStats(recent, runs, walks);
  const streakPill = streak > 0
    ? `<div class="log-streak">🔥&nbsp;<b>${streak}</b>-day streak</div>` : '';
  const barsHtml = bars.map(b =>
    `<div class="week-bar${b.hot ? ' hot' : ''}">${b.h > 0 ? `<span class="fill" style="height:${b.h}%"></span>` : ''}<span class="day">${b.day}</span></div>`
  ).join('');
  const now = new Date();
  const kicker = `${now.toLocaleDateString('en-US', { weekday: 'long' })} · ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const runIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="4" r="1.7"/><path d="M12 21l1.5-5-3-2.5 1-5 3.5 3 3 .5"/><path d="M5 14l3-.5 1.5 2.5"/></svg>`;
  const walkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="1.7"/><path d="M9 21l2-6 3 2v4"/><path d="M11 15l-1-5 4 1 2 3"/></svg>`;
  const readinessCard = todayReadiness
    ? `<div class="card readiness-card">
         <div class="rd-info"><span class="rd-label">Readiness</span><span class="rd-sub">logged today</span></div>
         <div class="rd-right"><span class="rd-score">${readinessScore(todayReadiness)}</span><button class="btn btn-ghost rd-btn" id="readiness-btn">Update</button></div>
       </div>`
    : `<div class="card readiness-card">
         <div class="rd-info"><span class="rd-label">Morning check-in</span><span class="rd-sub">30s — sharpens your coach</span></div>
         <button class="btn btn-secondary rd-btn" id="readiness-btn">Check in</button>
       </div>`;

  el.innerHTML = `
    <div class="screen">
      <div class="log-home-header">
        <button class="help-fab" id="help-btn" aria-label="Help and FAQ">?</button>
        <div class="log-kicker">${kicker}</div>
        <h1 class="log-hero">Let's<br><span class="hero-accent">move.</span></h1>
        ${streakPill}
        ${coachBanner}
      </div>
      <div class="card week-card">
        <div class="week-hd"><b>This Week</b><span>${weekCount} active ${weekCount === 1 ? 'day' : 'days'}</span></div>
        <div class="week-bars-wrap"><div class="week-bars">${barsHtml}</div></div>
      </div>
      ${readinessCard}
      <div id="daily-goals"></div>
      <div class="log-cardio-row">
        <button class="btn log-cardio-btn cardio-run" id="start-run-btn">${runIcon} Log a Run</button>
        <button class="btn log-cardio-btn cardio-walk" id="start-walk-btn">${walkIcon} Log a Walk</button>
      </div>
      ${lastLine}
      <div class="template-section">
        <p class="section-title">Workouts</p>
        ${templates.length === 0 ? `<p class="tpl-empty">No workouts yet — build one below, or add starter splits / paste a template from Settings.</p>` : ''}
        <div class="template-list" id="template-list"></div>
        <button class="btn btn-ghost btn-full" id="new-template-btn" style="margin-top:10px">+ New Template</button>
      </div>
    </div>
  `;
  const list = el.querySelector('#template-list');
  for (const tpl of templates) {
    const tplSessions = recent.filter(s => s.templateId === tpl.id && s.finishedAt && s.startedAt && (s.finishedAt - s.startedAt) > 60000);
    let durationTag = '';
    if (tplSessions.length >= 2) {
      const avgMs = tplSessions.slice(0, 3).reduce((sum, s) => sum + (s.finishedAt - s.startedAt), 0) / Math.min(tplSessions.length, 3);
      durationTag = `<span class="tpl-duration">~${Math.round(avgMs / 60000)}m</span>`;
    }
    const card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML = `<span class="template-name">${esc(tpl.name)}</span><span class="tpl-card-right">${durationTag}<span class="template-tag tag-${esc(tpl.bodyPartGroup)}">${esc(tpl.bodyPartGroup)}</span><button class="tpl-gear-btn" title="Edit template">⚙</button></span>`;
    card.addEventListener('click', e => {
      if (!e.target.closest('.tpl-gear-btn')) {
        const note = _pendingCoachNote?.note || '';
        _pendingCoachNote = null;
        showPreChecklist(el, tpl, note);
      }
    });
    card.querySelector('.tpl-gear-btn').addEventListener('click', e => {
      e.stopPropagation();
      import('./ui-settings.js').then(m => m.showTemplateEditor(el, tpl, () => renderLogTab(el)));
    });
    list.appendChild(card);
  }
  el.querySelector('#dismiss-coach-banner')?.addEventListener('click', () => {
    _pendingCoachNote = null;
    el.querySelector('#coach-pending-banner')?.remove();
  });
  el.querySelector('#new-template-btn').addEventListener('click', () => {
    import('./ui-settings.js').then(m => m.showTemplateEditor(el, null, () => renderLogTab(el)));
  });
  el.querySelector('#start-run-btn').addEventListener('click', () => showRunForm(el));
  el.querySelector('#start-walk-btn').addEventListener('click', () => showWalkForm(el));
  el.querySelector('#readiness-btn')?.addEventListener('click', () => showReadinessCheckin(el));
  el.querySelector('#help-btn')?.addEventListener('click', () => showHelpCenter());
  renderGoalsSection(el.querySelector('#daily-goals'), el);
}

// ── Daily goals ───────────────────────────────────────────────────────────────
function refreshGoals(el) {
  const c = el.querySelector('#daily-goals');
  if (c) renderGoalsSection(c, el);
}

async function renderGoalsSection(container, el) {
  if (!container) return;
  const [goals, log] = await Promise.all([getGoals(), getGoalLog()]);
  const today = localDateStr();
  const rows = goals.map(g => {
    const target = g.target || 1;
    const count = (log[g.id] || {})[today] || 0;
    const done = count >= target;
    const streak = goalStreak(log[g.id] || {}, target);
    const sub = `${count}/${target}${g.unit ? ` ${esc(g.unit)}` : ''}${streak > 0 ? ` · 🔥 ${streak}` : ''}`;
    const control = target > 1
      ? `<div class="goal-steps"><button class="goal-dec" data-id="${g.id}" aria-label="Decrease">−</button><button class="goal-inc" data-id="${g.id}" aria-label="Increase">+</button></div>`
      : `<button class="goal-toggle${done ? ' done' : ''}" data-id="${g.id}" aria-label="Toggle done">${done ? '✓' : ''}</button>`;
    return `<div class="goal-row${done ? ' goal-done' : ''}">
      <div class="goal-main" data-id="${g.id}"><span class="goal-title">${esc(g.title)}</span><span class="goal-sub">${sub}</span></div>
      ${control}
    </div>`;
  }).join('');
  container.innerHTML = `
    <div class="goals-head"><p class="section-title" style="margin:0">Daily Goals</p><button class="goals-add-btn" id="add-goal-btn">+ Goal</button></div>
    ${goals.length ? `<div class="goals-list">${rows}</div>` : `<p class="goals-empty">No goals yet — tap + Goal to set a daily target like "3× 1-min hangs" or "PT every day."</p>`}
  `;
  container.querySelector('#add-goal-btn').addEventListener('click', () => showGoalModal(el, null));
  container.querySelectorAll('.goal-main').forEach(m => m.addEventListener('click', () => showGoalModal(el, m.dataset.id)));
  container.querySelectorAll('.goal-inc').forEach(b => b.addEventListener('click', () => bumpGoal(b.dataset.id, 1, el)));
  container.querySelectorAll('.goal-dec').forEach(b => b.addEventListener('click', () => bumpGoal(b.dataset.id, -1, el)));
  container.querySelectorAll('.goal-toggle').forEach(b => b.addEventListener('click', () => toggleGoal(b.dataset.id, el)));
}

async function bumpGoal(id, delta, el) {
  const log = await getGoalLog();
  const cur = (log[id] || {})[localDateStr()] || 0;
  await setGoalProgress(id, localDateStr(), Math.max(0, cur + delta));
  refreshGoals(el);
}

async function toggleGoal(id, el) {
  const [goals, log] = await Promise.all([getGoals(), getGoalLog()]);
  const g = goals.find(x => x.id === id);
  if (!g) return;
  const target = g.target || 1;
  const cur = (log[id] || {})[localDateStr()] || 0;
  await setGoalProgress(id, localDateStr(), cur >= target ? 0 : target);
  refreshGoals(el);
}

async function showGoalModal(el, goalId) {
  const goals = await getGoals();
  const existing = goalId ? goals.find(g => g.id === goalId) : null;
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 class="modal-title" style="margin-bottom:0">${existing ? 'Edit' : 'New'} Goal</h2>
        <button class="modal-dismiss-btn" id="goal-dismiss" aria-label="Dismiss">✕</button>
      </div>
      <label class="form-label">Goal</label>
      <input class="input" id="goal-title" placeholder="e.g. Dead hangs" value="${esc(existing?.title || '')}">
      <div style="display:flex;gap:10px">
        <div style="flex:1"><label class="form-label">Daily target</label><input type="number" class="input" id="goal-target" inputmode="numeric" min="1" value="${existing?.target || 1}"></div>
        <div style="flex:1"><label class="form-label">Unit <span class="form-hint">optional</span></label><input class="input" id="goal-unit" placeholder="hangs, min, sets" value="${esc(existing?.unit || '')}"></div>
      </div>
      <p class="settings-hint" style="margin-top:10px">Target 1 = a simple daily habit (tap to check off). Higher targets show a counter.</p>
      <button class="btn btn-primary btn-full" id="goal-save" style="margin-top:14px">${existing ? 'Save' : 'Add Goal'}</button>
      ${existing ? `<button class="btn btn-ghost btn-full" id="goal-delete" style="margin-top:8px;color:var(--danger)">🗑 Delete Goal</button>` : ''}
    </div>
  `;
  const close = () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; };
  overlay.querySelector('#goal-dismiss').addEventListener('click', close);
  overlay.querySelector('#goal-save').addEventListener('click', async () => {
    const title = overlay.querySelector('#goal-title').value.trim();
    if (!title) { alert('Give the goal a name.'); return; }
    const target = Math.max(1, Number(overlay.querySelector('#goal-target').value) || 1);
    const unit = overlay.querySelector('#goal-unit').value.trim();
    const list = await getGoals();
    if (existing) {
      const g = list.find(x => x.id === goalId);
      Object.assign(g, { title, target, unit });
    } else {
      list.push({ id: crypto.randomUUID(), title, target, unit });
    }
    await saveGoals(list);
    close();
    refreshGoals(el);
  });
  if (existing) overlay.querySelector('#goal-delete').addEventListener('click', async () => {
    if (!confirm(`Delete "${existing.title}"?`)) return;
    await saveGoals((await getGoals()).filter(g => g.id !== goalId));
    close();
    refreshGoals(el);
  });
}

const RD_METRICS = [
  { key: 'sleep', label: 'Sleep quality', lo: 'Poor', hi: 'Great' },
  { key: 'energy', label: 'Energy', lo: 'Drained', hi: 'Fresh' },
  { key: 'soreness', label: 'Soreness', lo: 'None', hi: 'Very sore' },
  { key: 'mood', label: 'Mood', lo: 'Low', hi: 'High' },
];

async function showReadinessCheckin(el) {
  const existing = await getReadiness(localDateStr());
  const answers = { sleep: 3, energy: 3, soreness: 2, mood: 3, ...(existing || {}) };
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <h2 class="modal-title" style="margin-bottom:0">Morning Check-In</h2>
        <button class="modal-dismiss-btn" id="rd-dismiss" aria-label="Dismiss">✕</button>
      </div>
      <p class="settings-hint" style="margin-bottom:14px">How ready do you feel? This feeds your coach's pre-workout advice.</p>
      <div id="rd-rows"></div>
      <button class="btn btn-primary btn-full" id="rd-save" style="margin-top:16px">Save Check-In</button>
    </div>
  `;
  const rows = overlay.querySelector('#rd-rows');
  RD_METRICS.forEach(m => {
    const row = document.createElement('div');
    row.className = 'rd-row';
    row.innerHTML = `
      <div class="rd-row-head"><span class="rd-metric">${m.label}</span></div>
      <div class="rd-scale" data-key="${m.key}">
        ${[1, 2, 3, 4, 5].map(n => `<button class="rd-pill${answers[m.key] === n ? ' on' : ''}" data-val="${n}">${n}</button>`).join('')}
      </div>
      <div class="rd-ends"><span>${m.lo}</span><span>${m.hi}</span></div>`;
    row.querySelector('.rd-scale').addEventListener('click', e => {
      const btn = e.target.closest('.rd-pill');
      if (!btn) return;
      answers[m.key] = Number(btn.dataset.val);
      row.querySelectorAll('.rd-pill').forEach(p => p.classList.toggle('on', p === btn));
    });
    rows.appendChild(row);
  });
  overlay.querySelector('#rd-dismiss').addEventListener('click', () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; });
  overlay.querySelector('#rd-save').addEventListener('click', async () => {
    await saveReadiness(localDateStr(), {
      sleep: answers.sleep, energy: answers.energy, soreness: answers.soreness, mood: answers.mood
    });
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    showToast(`Readiness ${readinessScore(answers)}/100 logged`);
    renderLogTab(el);
  });
}

async function renderActiveSession(el) {
  clearRest();
  acquireWakeLock(); // keep the screen awake for the duration of the workout
  el.innerHTML = `
    <div class="screen session-screen">
      <div class="session-header">
        <span class="session-name">${esc(activeSession.templateName)}</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="discard-btn" style="min-height:36px;font-size:14px;color:var(--danger);border-color:var(--danger)">Discard</button>
          <button class="btn btn-ghost session-finish-btn" id="finish-btn" style="min-height:36px;font-size:14px">Finish</button>
        </div>
      </div>
      ${(wakeLockEnabled() && wakeLockSupported()) ? '<div class="screen-on-chip">☀ Screen stays on</div>' : ''}
      <div class="session-time-row">
        <span class="session-time-label">Date</span>
        <input type="date" class="session-time-input" id="session-date" value="${activeSession.date}">
      </div>
      <div class="session-time-row">
        <span class="session-time-label">Started</span>
        <input type="time" class="session-time-input" id="session-start-time" value="${toTimeInput(activeSession.startedAt)}">
      </div>
      ${activeSession.sorenessNote ? `<div class="soreness-banner">⚠ ${esc(activeSession.sorenessNote)}</div>` : ''}
      <div id="exercise-cards"></div>
      <button class="btn btn-ghost btn-full" id="add-exercise-btn" style="margin-top:8px">+ Add Exercise</button>
      <div style="margin-top:16px">
        <p class="section-title" style="margin-bottom:6px">Session Notes</p>
        <textarea class="input" id="session-notes-during" rows="3" placeholder="Jot notes, observations, or anything to remember…" style="width:100%;box-sizing:border-box">${esc(activeSession.sessionNotes || '')}</textarea>
      </div>
      <div class="session-time-row" style="margin-top:12px">
        <span class="session-time-label">End Time</span>
        <input type="time" class="session-time-input" id="session-end-time" value="${activeSession._endTimeStr || ''}">
      </div>
      <div style="height:80px"></div>
    </div>
    <div id="rest-timer" class="rest-timer hidden"></div>
    <div class="sticky-finish-bar">
      <button class="btn btn-primary btn-full" id="sticky-finish-btn">Finish Workout</button>
    </div>
  `;
  // Iterate the session's own exercise list (the source of truth) — never the
  // original template, which drifts out of sync the moment an exercise is
  // deleted or added. Each card resolves its own definition by exerciseId.
  const cardsEl = el.querySelector('#exercise-cards');
  for (let i = 0; i < activeSession.exercises.length; i++) {
    const ex = activeSession.exercises[i];
    const exDef = await getExercise(ex.exerciseId);
    const prev = await getLastSessionForExercise(ex.exerciseId);
    ex.exerciseName = exDef.name;
    prefillFromLastSession(ex, exDef, prev); // start from what you actually did last time
    cardsEl.appendChild(buildExerciseCard(i, exDef, prev, ex, el));
  }
  el.querySelector('#finish-btn').addEventListener('click', () => showPostChecklist(el));
  el.querySelector('#sticky-finish-btn').addEventListener('click', () => showPostChecklist(el));
  el.querySelector('#discard-btn').addEventListener('click', () => {
    if (confirm('Discard this workout? All logged data will be lost.')) {
      clearRest();
      activeSession = null;
      renderLogTab(el);
    }
  });
  el.querySelector('#add-exercise-btn').addEventListener('click', () => showAddExerciseModal(el, cardsEl));
  el.querySelector('#session-notes-during').addEventListener('input', e => {
    activeSession.sessionNotes = e.target.value;
  });
  el.querySelector('#session-date').addEventListener('change', e => {
    if (!e.target.value) return;
    const [y, mo, d] = e.target.value.split('-').map(Number);
    const old = new Date(activeSession.startedAt);
    activeSession.date = e.target.value;
    activeSession.startedAt = new Date(y, mo - 1, d, old.getHours(), old.getMinutes(), 0, 0).getTime();
  });
  el.querySelector('#session-start-time').addEventListener('change', e => {
    if (e.target.value) activeSession.startedAt = fromTimeInput(e.target.value);
  });
  el.querySelector('#session-end-time').addEventListener('change', e => {
    activeSession._endTimeStr = e.target.value;
  });
}

// Overwrite a session exercise's sets with the values from its most recent
// session (matched by set index), once. Runs only on first render (guarded by
// _prefilled) so it never clobbers edits after a delete/add re-render. Exercises
// with no history keep their template defaults.
function prefillFromLastSession(sessionEx, exDef, prev) {
  if (sessionEx._prefilled) return;
  sessionEx._prefilled = true;
  if (!prev) return;
  sessionEx.sets.forEach((set, si) => {
    const ps = prev.sets[si];
    if (!ps) return;
    if (exDef.isTimed) {
      if (ps.seconds != null) set.seconds = ps.seconds;
    } else {
      if (ps.weight != null) set.weight = ps.weight;
      if (ps.reps != null) set.reps = ps.reps;
    }
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
    ${exDef.isUnilateral ? `<div class="asym-chip hidden" id="asym-${exIdx}"></div>` : ''}
    <div class="ex-note-row hidden" id="note-${exIdx}">
      <textarea class="input ex-note-input" placeholder="Note for this exercise..." rows="2"></textarea>
    </div>
    <div class="ex-actions">
      <button class="btn btn-ghost ex-add-set">+ Add Set</button>
      <button class="btn btn-ghost ex-repeat-set">Repeat</button>
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
    updateAsym();
  });
  // Repeat last set: clone the exercise's last set's values, append it already
  // marked done, start rest, and pulse — one tap for a straight set.
  card.querySelector('.ex-repeat-set').addEventListener('click', () => {
    const sets = activeSession.exercises[exIdx].sets;
    const clone = cloneLastSet(sets);
    if (!clone) return;
    sets.push(clone);
    appendSetRow(setsEl, exIdx, sets.length - 1, exDef, prev, false);
    pulseRow(setsEl.lastElementChild);
    haptic('tap');
    startRest(exDef.id);
    updateAsym();
  });

  // Live L/R asymmetry flag (unilateral exercises only): recompute as sets/sides change.
  const asymEl = card.querySelector(`#asym-${exIdx}`);
  const updateAsym = () => {
    if (!asymEl) return;
    const a = computeAsymmetry(sessionEx, exDef);
    if (a) {
      asymEl.textContent = `⚠ L/R imbalance — ${a.weaker} side ${a.gap}% lower`;
      asymEl.classList.remove('hidden');
    } else {
      asymEl.classList.add('hidden');
    }
  };
  updateAsym();
  if (exDef.isUnilateral) {
    card.addEventListener('input', updateAsym);
    card.addEventListener('change', updateAsym);
  }

  return card;
}

// Side-to-side imbalance for a unilateral exercise, from the current session's
// sets. Uses weight (loaded), reps (bodyweight), or seconds (timed). Returns
// { gap, weaker } when both sides have data and the gap exceeds 15%, else null.
export function computeAsymmetry(sessionEx, exDef) {
  if (!exDef || !exDef.isUnilateral) return null;
  const metric = exDef.isTimed ? 'seconds' : (exDef.isBodyweight ? 'reps' : 'weight');
  const sides = { L: [], R: [] };
  for (const s of sessionEx.sets) {
    const v = s[metric];
    if (v != null && (s.side === 'L' || s.side === 'R')) sides[s.side].push(v);
  }
  if (!sides.L.length || !sides.R.length) return null;
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const l = avg(sides.L), r = avg(sides.R);
  const hi = Math.max(l, r), lo = Math.min(l, r);
  if (hi <= 0) return null;
  const gap = Math.round((1 - lo / hi) * 100);
  if (gap < 15) return null;
  return { gap, weaker: l < r ? 'L' : 'R' };
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
    const nowDone = !this.classList.contains('done');
    this.classList.toggle('done');
    row.classList.toggle('set-done');
    activeSession.exercises[exIdx].sets[sIdx].done = nowDone; // model-backed: survives re-render
    if (nowDone) { startRest(exDef.id); haptic('tap'); pulseRow(row); }
  });
  row.querySelector('.set-remove-btn').addEventListener('click', () => {
    if (activeSession.exercises[exIdx].sets.length <= 1) return;
    activeSession.exercises[exIdx].sets.splice(sIdx, 1);
    activeSession.exercises[exIdx].sets.forEach((s, i) => { s.setNumber = i + 1; });
    refreshSets(setsEl, exIdx, exDef, prev);
  });
  // Restore a previously-committed set's checked state after any re-render.
  if (currentSet.done) {
    row.classList.add('set-done');
    row.querySelector('.set-check')?.classList.add('done');
  }
  setsEl.appendChild(row);
}

// ── Rest timer ────────────────────────────────────────────────────────────────
// Foreground countdown that auto-starts when a set is checked off. Docked above
// the finish bar; +15s extends, Skip cancels. (iOS PWAs can't fire reliable
// background notifications, so this is a visible-while-open cue by design.)
const REST_DEFAULT = 90;
let restInterval = null;
let restRemaining = 0;
let restTarget = REST_DEFAULT;
let restExId = null;

async function startRest(exId) {
  const bar = document.getElementById('rest-timer');
  if (!bar) return;
  restExId = exId || null;
  const map = (await getSetting('restByExercise')) || {};
  restTarget = (restExId && map[restExId]) || REST_DEFAULT;
  restRemaining = restTarget;
  clearInterval(restInterval);
  bar.classList.remove('hidden', 'rest-done');
  renderRest(bar);
  restInterval = setInterval(tickRest, 1000);
}

// Remember the chosen rest for this exercise so it auto-starts there next time.
async function persistRest() {
  if (!restExId) return;
  const map = (await getSetting('restByExercise')) || {};
  map[restExId] = restTarget;
  await setSetting('restByExercise', map);
}

function tickRest() {
  const bar = document.getElementById('rest-timer');
  if (!bar) { clearInterval(restInterval); restInterval = null; return; } // session left the DOM
  restRemaining -= 1;
  if (restRemaining <= 0) {
    clearInterval(restInterval);
    restInterval = null;
    bar.classList.add('rest-done');
    renderRest(bar, true);
    haptic('rest');
    maybeRestBeep();
    setTimeout(() => {
      const b = document.getElementById('rest-timer');
      if (b) { b.classList.add('hidden'); b.classList.remove('rest-done'); b.innerHTML = ''; }
    }, 4000);
    return;
  }
  renderRest(bar);
}

function renderRest(bar, done = false) {
  const secs = Math.max(restRemaining, 0);
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  bar.innerHTML = done
    ? `<span class="rest-label">Rest done — go</span><button class="rest-btn" id="rest-dismiss">Got it</button>`
    : `<span class="rest-big">${label}</span><div class="rest-actions"><button class="rest-btn" id="rest-sub">−15</button><button class="rest-btn" id="rest-add">+15</button><button class="rest-btn rest-skip" id="rest-skip">Skip</button></div>`;
  bar.querySelector('#rest-add')?.addEventListener('click', () => { restTarget += 15; restRemaining += 15; persistRest(); renderRest(bar); });
  bar.querySelector('#rest-sub')?.addEventListener('click', () => { restTarget = Math.max(15, restTarget - 15); restRemaining = Math.max(1, restRemaining - 15); persistRest(); renderRest(bar); });
  bar.querySelector('#rest-skip')?.addEventListener('click', clearRest);
  bar.querySelector('#rest-dismiss')?.addEventListener('click', clearRest);
}

function clearRest() {
  clearInterval(restInterval);
  restInterval = null;
  restRemaining = 0;
  restExId = null;
  const bar = document.getElementById('rest-timer');
  if (bar) { bar.classList.add('hidden'); bar.classList.remove('rest-done'); bar.innerHTML = ''; }
}

// Short volt-lime flash on a set row to confirm a commit without reading text.
// CSS honors prefers-reduced-motion; this just toggles the class (restarting the
// animation via a forced reflow).
function pulseRow(row) {
  if (!row) return;
  row.classList.remove('set-pulse');
  void row.offsetWidth;
  row.classList.add('set-pulse');
  setTimeout(() => row.classList.remove('set-pulse'), 400);
}

// Clone an exercise's last set for one-tap "Repeat set". Carries weight/reps/
// seconds/side, marks it done, and is never a drop set. Returns null if empty.
export function cloneLastSet(sets) {
  if (!sets || !sets.length) return null;
  const last = sets[sets.length - 1];
  return {
    setNumber: sets.length + 1,
    weight: last.weight ?? null,
    reps: last.reps ?? null,
    seconds: last.seconds ?? null,
    side: last.side ?? null,
    isDropSet: false,
    parentSetIndex: null,
    done: true,
  };
}

// Optional short beep when the rest timer hits zero (off by default). Web Audio,
// no asset to load; fully guarded so an unsupported context never throws.
function maybeRestBeep() {
  try {
    if (localStorage.getItem('restBeep') !== 'on') return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => { try { ctx.close(); } catch (e) {} };
  } catch (e) {}
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function shortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(msg, duration = 2500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

async function generateAdjustedTemplate(template, sorenessNote, apiKey) {
  const [{ buildAdjustedWorkoutTemplate }, exercises, painLog] = await Promise.all([
    import('./claude-api.js'),
    getExercises(),
    getPainLog()
  ]);
  const healthContext = await getSetting('healthContext');
  const combinedNote = [painSummary(painLog), sorenessNote].filter(Boolean).join(' ');
  const adjustments = await buildAdjustedWorkoutTemplate(template, exercises, combinedNote, healthContext, apiKey);
  if (!adjustments || adjustments.length === 0) return null;

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const adjustedTemplate = {
    id: `tpl-adjusted-${Date.now()}`,
    name: `${dateStr} ${template.name} (adjusted)`,
    bodyPartGroup: template.bodyPartGroup,
    createdAt: Date.now(),
    exercises: template.exercises.map((ex, idx) => {
      const adj = adjustments.find(a => a.idx === idx);
      if (!adj) return { ...ex };
      if (adj.skip) return null;
      return {
        ...ex,
        defaultWeight: (adj.defaultWeight != null) ? adj.defaultWeight : ex.defaultWeight,
        targetReps: (adj.targetReps != null) ? adj.targetReps : ex.targetReps,
      };
    }).filter(Boolean)
  };
  await addTemplate(adjustedTemplate);
  return adjustedTemplate;
}

const ARM_STRETCH_ITEMS = [
  'Massage gun mid-back (if tight)',
  'Lat stretch',
  'Chest / doorway stretch',
  'Tricep stretch',
  'Cross-body shoulder stretch',
  'Wrist flexor stretch',
  'Wrist extensor stretch',
  'Prayer stretch',
  'Quad stretch',
  'Calf stretch',
  'Ankle circles',
];

const ARM_WARMUP_ITEMS = [
  'Massage gun to left mid-back (if tight)',
  'Arm circles — 10 forward, 10 backward',
  'Banded pull-aparts — 2×15',
  'Wrist circles — 10 each direction',
  'Light shoulder rotations — 10 each',
];

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

async function showPreChecklist(el, template, prefilledNote = '') {
  const isLegDay = template.bodyPartGroup === 'legs';
  const isArmDay = template.bodyPartGroup === 'arms';
  const raw = await getSetting('preChecklist');
  const items = isArmDay ? ARM_WARMUP_ITEMS : isLegDay ? LEG_WARMUP_ITEMS : (raw ?? DEFAULT_CHECKLIST_ITEMS);
  const answers = {};
  items.forEach((_, i) => { answers[i] = false; });

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  const modalTitle = isArmDay ? 'Arm Day Warm-Up' : isLegDay ? 'Leg Day Warm-Up' : 'Pre-Workout Check';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 class="modal-title" style="margin-bottom:0">${modalTitle}</h2>
        <button class="modal-dismiss-btn" id="dismiss-checklist" aria-label="Dismiss">✕</button>
      </div>
      <div class="checklist" id="pre-checklist"></div>
      <input type="text" class="input" id="soreness-note" placeholder="Anything sore or tight today? (e.g. left hip, slept 5 hrs)" style="margin-bottom:14px" value="${esc(prefilledNote)}">
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
  overlay.querySelector('#start-session-btn').addEventListener('click', async () => {
    const sorenessNote = overlay.querySelector('#soreness-note').value.trim();
    if (sorenessNote.length > 5 && !template.id.startsWith('tpl-pt')) {
      const apiKey = await getSetting('anthropicApiKey');
      if (apiKey) {
        const startBtn = overlay.querySelector('#start-session-btn');
        startBtn.textContent = 'Tailoring workout…';
        startBtn.disabled = true;
        try {
          const adjusted = await generateAdjustedTemplate(template, sorenessNote, apiKey);
          if (adjusted) {
            overlay.classList.add('hidden');
            overlay.innerHTML = '';
            showToast(`Adjusted: ${adjusted.name} (delete after workout)`);
            startSession(el, adjusted, answers, sorenessNote);
            return;
          }
        } catch (e) { /* fall through to original */ }
      }
    }
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
  clearRest();
  const raw = await getSetting('postChecklist');
  const items = raw ?? ['Static stretches done?', 'Hydrated?', 'Anything to note for next time?'];
  const isArmDay = activeSession?.bodyPartGroup === 'arms';
  const answers = {};
  items.forEach((_, i) => { answers[i] = false; });
  const stretchAnswers = {};
  if (isArmDay) ARM_STRETCH_ITEMS.forEach((_, i) => { stretchAnswers[i] = false; });

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-title">Finish Workout</h2>
      <div class="checklist" id="post-checklist"></div>
      ${isArmDay ? `<p class="section-title" style="margin:12px 0 6px">Arm Stretches</p><div class="checklist" id="arm-stretch-checklist"></div>` : ''}
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
          <input type="time" class="input" id="end-time" value="${activeSession?._endTimeStr || toTimeInput(Date.now())}">
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
  if (isArmDay) {
    const stretchList = overlay.querySelector('#arm-stretch-checklist');
    ARM_STRETCH_ITEMS.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'checklist-row';
      row.innerHTML = `<button class="toggle-btn" data-idx="${i}"><span class="toggle-label">N</span></button><span class="checklist-item">${item}</span>`;
      row.querySelector('.toggle-btn').addEventListener('click', function () {
        stretchAnswers[i] = !stretchAnswers[i];
        this.querySelector('.toggle-label').textContent = stretchAnswers[i] ? 'Y' : 'N';
        this.classList.toggle('checked', stretchAnswers[i]);
      });
      stretchList.appendChild(row);
    });
  }

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
        <label class="form-label">Context tag <span class="form-hint">— shows in history</span></label>
        <input type="text" class="input" id="walk-context" placeholder="e.g. Recovery day, Tired, Full energy">
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
      workoutContext: el.querySelector('#walk-context').value.trim() || null,
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
        <label class="form-label">Context tag <span class="form-hint">— shows in history</span></label>
        <input type="text" class="input" id="run-context" placeholder="e.g. Recovery day, Tired, Full energy">
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
      workoutContext: el.querySelector('#run-context').value.trim() || null,
      notes: el.querySelector('#run-notes').value,
      bodyPartGroup: 'legs'
    });
    await switchTab('history');
  });
}
