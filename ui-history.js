import { getAllSessions, getRunLogs, getWalkLogs, deleteSession, saveSession } from './db.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function renderHistoryTab(el) {
  const [sessions, runs, walks] = await Promise.all([getAllSessions(), getRunLogs(), getWalkLogs()]);
  // Only dedup imported sessions (startedAt is null/undefined = came from CSV import).
  // Live-logged sessions always show, even if same date+template (e.g. two sessions same day).
  const seen = new Set();
  const all = [
    ...sessions.map(s => ({ ...s, _type: 'workout' })),
    ...runs.map(r => ({ ...r, _type: 'run', bodyPartGroup: 'legs' })),
    ...walks.map(w => ({ ...w, _type: 'walk', bodyPartGroup: 'legs' }))
  ].sort((a, b) => b.date.localeCompare(a.date)).filter(item => {
    if (item._type !== 'workout') return true;
    // A live session has a meaningful gap between startedAt and finishedAt (>30s).
    // Imported sessions have startedAt=null (new) or startedAt===finishedAt (old imports).
    const isLive = item.startedAt && item.finishedAt && (item.finishedAt - item.startedAt) > 30000;
    if (isLive) return true; // never dedup a real logged session
    const key = `${item.date}__${item.templateName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  el.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">History</h1>
      <div class="filter-chips" id="filter-chips">
        ${['All','Arms','Legs','Core','Runs','Walks'].map(f =>
          `<button class="chip${f==='All'?' active':''}" data-filter="${f.toLowerCase()}">${f}</button>`
        ).join('')}
      </div>
      <div class="history-list" id="history-list"></div>
    </div>
  `;

  let activeFilter = 'all';
  const listEl = el.querySelector('#history-list');

  function renderList() {
    const filtered = activeFilter === 'all' ? all
      : activeFilter === 'runs' ? all.filter(i => i._type === 'run')
      : activeFilter === 'walks' ? all.filter(i => i._type === 'walk')
      : all.filter(i => i.bodyPartGroup === activeFilter);
    listEl.innerHTML = filtered.length === 0
      ? '<p style="color:var(--text-3);text-align:center;padding:32px">No sessions yet</p>'
      : filtered.map(item => {
          const meta = (item._type === 'run' || item._type === 'walk')
            ? `${item.distanceMiles} mi · ${Math.round(item.durationMinutes)} min`
            : `${totalVolume(item)} lbs total`;
          const name = item._type === 'run' ? '🏃 Run'
            : item._type === 'walk' ? '🚶 Walk'
            : esc(item.workoutLabel ? `${item.templateName} — ${item.workoutLabel}` : item.templateName);
          return `<div class="history-row" data-id="${item.id}" data-type="${item._type}">
            <div><span class="history-name">${name}</span></div>
            <div class="history-meta"><span class="history-date">${item.date}</span><span class="history-vol">${meta}</span></div>
          </div>`;
        }).join('');
    listEl.querySelectorAll('.history-row').forEach(row => {
      row.addEventListener('click', () => showDetail(el, all.find(i => i.id === row.dataset.id), row.dataset.type));
    });
  }

  el.querySelector('#filter-chips').addEventListener('click', e => {
    if (!e.target.classList.contains('chip')) return;
    el.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    activeFilter = e.target.dataset.filter;
    renderList();
  });

  renderList();
}

function totalVolume(session) {
  return session.exercises.reduce((sum, ex) =>
    sum + ex.sets.reduce((s2, set) => s2 + (set.weight || 0) * (set.reps || 0), 0), 0
  ).toLocaleString();
}

function showDetail(el, item, type) {
  if (type === 'run') { showRunDetail(el, item); return; }
  if (type === 'walk') { showWalkDetail(el, item); return; }
  const displayName = n => (n || '').replace(/_/g, ' ');
  el.innerHTML = `
    <div class="screen">
      <div class="detail-header">
        <button class="btn btn-ghost" id="back-btn">← Back</button>
        <h2>${esc(displayName(item.workoutLabel ? `${item.templateName} — ${item.workoutLabel}` : item.templateName))}</h2>
        <span class="history-date">${item.date}</span>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="copy-notes-btn" style="flex:1;font-size:12px;min-width:80px">📋 Notes</button>
        <button class="btn btn-ghost" id="edit-date-btn" style="flex:1;font-size:12px;min-width:80px">📅 Date</button>
        <button class="btn btn-ghost" id="delete-session-btn" style="flex:1;font-size:12px;min-width:80px;color:var(--danger);border-color:rgba(224,82,82,0.3)">🗑 Delete</button>
      </div>
      <div id="date-edit-row" style="display:none;gap:8px;margin-bottom:12px;align-items:center">
        <input type="date" class="input" id="date-input" value="${item.date}" style="flex:1;font-size:15px">
        <button class="btn btn-primary" id="save-date-btn" style="min-height:40px">Save</button>
        <button class="btn btn-ghost" id="cancel-date-btn" style="min-height:40px">Cancel</button>
      </div>
      <div id="context-tag-section" style="margin-bottom:12px">
        ${item.workoutContext
          ? `<div style="display:flex;align-items:center;gap:8px">
               <span class="detail-context-tag">&#9889; ${esc(item.workoutContext)}</span>
               <button class="btn btn-ghost" id="edit-context-btn" style="font-size:12px;min-height:32px;padding:0 10px">Edit</button>
             </div>`
          : `<button class="btn btn-ghost" id="add-context-btn" style="font-size:12px;min-height:32px;padding:0 10px;border-style:dashed;color:var(--text-3)">&#9889; Add context tag</button>`
        }
        <div id="context-input-row" style="display:none;gap:8px;align-items:center;margin-top:6px">
          <input type="text" class="input" id="context-input" placeholder="e.g. Pitching in 2 days, Tired…" value="${esc(item.workoutContext || '')}" style="flex:1;font-size:15px">
          <button class="btn btn-primary" id="save-context-btn" style="min-height:40px">Save</button>
          <button class="btn btn-ghost" id="cancel-context-btn" style="min-height:40px">&times;</button>
        </div>
      </div>
      ${item.sessionNotes ? `<div class="detail-notes">${esc(item.sessionNotes)}</div>` : ''}
      ${item.exercises.map(ex => `
        <div class="card detail-exercise">
          <p class="ex-name">${esc(displayName(ex.exerciseName))}</p>
          ${ex.notes ? `<p class="detail-ex-note">${esc(ex.notes)}</p>` : ''}
          ${ex.sets.map(s => `<div class="detail-set-row">
            <span class="set-num">Set ${esc(s.setNumber)}${s.isDropSet ? ' ↓' : ''}</span>
            <span>${s.seconds != null ? `${esc(s.seconds)}s` : `${esc(s.weight)} × ${esc(s.reps)}`}${s.side ? ` (${esc(s.side)})` : ''}</span>
          </div>`).join('')}
        </div>
      `).join('')}
    </div>
  `;
  el.querySelector('#back-btn').addEventListener('click', () => renderHistoryTab(el));
  el.querySelector('#copy-notes-btn').addEventListener('click', () => {
    const titleStr = displayName(item.workoutLabel ? `${item.templateName} — ${item.workoutLabel}` : item.templateName);
    const lines = [`${titleStr} — ${item.date}`];
    if (item.sessionNotes) lines.push(`Session: ${item.sessionNotes}`);
    item.exercises.forEach(ex => {
      if (ex.notes) lines.push(`${displayName(ex.exerciseName)}: ${ex.notes}`);
    });
    if (lines.length === 1) { alert('No notes recorded for this session.'); return; }
    navigator.clipboard.writeText(lines.join('\n')).then(() => alert('Copied!'));
  });
  el.querySelector('#edit-date-btn').addEventListener('click', () => {
    const row = el.querySelector('#date-edit-row');
    row.style.display = row.style.display === 'flex' ? 'none' : 'flex';
  });
  el.querySelector('#save-date-btn').addEventListener('click', async () => {
    const newDate = el.querySelector('#date-input').value;
    if (!newDate) return;
    item.date = newDate;
    await saveSession(item);
    showDetail(el, item, 'workout');
  });
  el.querySelector('#cancel-date-btn').addEventListener('click', () => {
    el.querySelector('#date-edit-row').style.display = 'none';
  });
  const addCtxBtn = el.querySelector('#add-context-btn');
  const editCtxBtn = el.querySelector('#edit-context-btn');
  const ctxInputRow = el.querySelector('#context-input-row');
  if (addCtxBtn) addCtxBtn.addEventListener('click', () => {
    ctxInputRow.style.display = 'flex';
    el.querySelector('#context-input').focus();
  });
  if (editCtxBtn) editCtxBtn.addEventListener('click', () => {
    ctxInputRow.style.display = 'flex';
  });
  el.querySelector('#save-context-btn').addEventListener('click', async () => {
    const val = el.querySelector('#context-input').value.trim();
    item.workoutContext = val || null;
    await saveSession(item);
    showDetail(el, item, 'workout');
  });
  el.querySelector('#cancel-context-btn').addEventListener('click', () => {
    ctxInputRow.style.display = 'none';
  });
  el.querySelector('#delete-session-btn').addEventListener('click', async () => {
    if (!confirm(`Delete "${displayName(item.templateName)}" from ${item.date}? This cannot be undone.`)) return;
    await deleteSession(item.id);
    renderHistoryTab(el);
  });
}

function showWalkDetail(el, walk) {
  el.innerHTML = `
    <div class="screen">
      <div class="detail-header">
        <button class="btn btn-ghost" id="back-btn">← Back</button>
        <h2>🚶 Walk</h2>
        <span class="history-date">${walk.date}</span>
      </div>
      <div class="card detail-exercise" style="margin-top:16px">
        <div class="detail-set-row"><span>Distance</span><span>${esc(walk.distanceMiles)} mi</span></div>
        <div class="detail-set-row"><span>Duration</span><span>${Math.round(walk.durationMinutes)} min</span></div>
        <div class="detail-set-row"><span>Speed</span><span>${esc(walk.speedMph)} mph</span></div>
        ${walk.calories != null ? `<div class="detail-set-row"><span>Calories</span><span>${esc(walk.calories)} <span style="color:var(--text-3);font-size:12px">(treadmill est.)</span></span></div>` : ''}
        ${walk.notes ? `<div class="detail-set-row"><span>Notes</span><span>${esc(walk.notes)}</span></div>` : ''}
      </div>
    </div>
  `;
  el.querySelector('#back-btn').addEventListener('click', () => renderHistoryTab(el));
}

function showRunDetail(el, run) {
  const min = Math.floor(run.durationMinutes);
  const sec = String(Math.round((run.durationMinutes % 1) * 60)).padStart(2, '0');
  el.innerHTML = `
    <div class="screen">
      <div class="detail-header">
        <button class="btn btn-ghost" id="back-btn">← Back</button>
        <h2>Run</h2>
        <span class="history-date">${run.date}</span>
      </div>
      <div class="card detail-exercise" style="margin-top:16px">
        <div class="detail-set-row"><span>Distance</span><span>${esc(run.distanceMiles)} mi</span></div>
        <div class="detail-set-row"><span>Duration</span><span>${min}:${sec}</span></div>
        <div class="detail-set-row"><span>Pace</span><span>${esc(run.paceMinPerMile)} min/mi</span></div>
        <div class="detail-set-row"><span>Effort</span><span>${run.perceivedEffort}/10</span></div>
        ${run.notes ? `<div class="detail-set-row"><span>Notes</span><span>${esc(run.notes)}</span></div>` : ''}
      </div>
    </div>
  `;
  el.querySelector('#back-btn').addEventListener('click', () => renderHistoryTab(el));
}
