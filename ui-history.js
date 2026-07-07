import { getAllSessions, getRunLogs, getWalkLogs, deleteSession, saveSession, addRunLog, addWalkLog, deleteRunLog, deleteWalkLog } from './db.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function detailToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

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
  if (type === 'run' || type === 'walk') { showCardioDetail(el, item, type); return; }
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
      <label class="form-label" style="margin:4px 0 4px">Session notes</label>
      <textarea class="input" id="detail-session-notes" rows="3" placeholder="Add a note about this session…" style="width:100%;box-sizing:border-box;margin-bottom:12px">${esc(item.sessionNotes || '')}</textarea>
      ${item.exercises.map((ex, i) => `
        <div class="card detail-exercise">
          <p class="ex-name">${esc(displayName(ex.exerciseName))}</p>
          ${ex.sets.map(s => `<div class="detail-set-row">
            <span class="set-num">Set ${esc(s.setNumber)}${s.isDropSet ? ' ↓' : ''}</span>
            <span>${s.seconds != null ? `${esc(s.seconds)}s` : `${esc(s.weight)} × ${esc(s.reps)}`}${s.side ? ` (${esc(s.side)})` : ''}</span>
          </div>`).join('')}
          <textarea class="input detail-ex-note-input" data-ex-idx="${i}" rows="2" placeholder="Note for this exercise…" style="width:100%;box-sizing:border-box;margin-top:8px">${esc(ex.notes || '')}</textarea>
        </div>
      `).join('')}
    </div>
  `;
  const sessionNotesEl = el.querySelector('#detail-session-notes');
  sessionNotesEl.addEventListener('change', async () => {
    item.sessionNotes = sessionNotesEl.value;
    await saveSession(item);
    detailToast('Saved');
  });
  el.querySelectorAll('.detail-ex-note-input').forEach(t => {
    t.addEventListener('change', async () => {
      item.exercises[Number(t.dataset.exIdx)].notes = t.value;
      await saveSession(item);
      detailToast('Saved');
    });
  });
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

// Unified detail view for cardio (walk / run) — mirrors showDetail's edit affordances:
// editable date, add/edit context tag, editable notes, delete.
function showCardioDetail(el, item, type) {
  const isRun = type === 'run';
  const title = isRun ? '🏃 Run' : '🚶 Walk';
  const save = isRun ? addRunLog : addWalkLog;
  const del = isRun ? deleteRunLog : deleteWalkLog;

  let statsRows;
  if (isRun) {
    const min = Math.floor(item.durationMinutes);
    const sec = String(Math.round((item.durationMinutes % 1) * 60)).padStart(2, '0');
    statsRows = `
      <div class="detail-set-row"><span>Distance</span><span>${esc(item.distanceMiles)} mi</span></div>
      <div class="detail-set-row"><span>Duration</span><span>${min}:${sec}</span></div>
      <div class="detail-set-row"><span>Pace</span><span>${esc(item.paceMinPerMile)} min/mi</span></div>
      <div class="detail-set-row"><span>Effort</span><span>${esc(item.perceivedEffort)}/10</span></div>`;
  } else {
    statsRows = `
      <div class="detail-set-row"><span>Distance</span><span>${esc(item.distanceMiles)} mi</span></div>
      <div class="detail-set-row"><span>Duration</span><span>${Math.round(item.durationMinutes)} min</span></div>
      <div class="detail-set-row"><span>Speed</span><span>${esc(item.speedMph)} mph</span></div>
      ${item.calories != null ? `<div class="detail-set-row"><span>Calories</span><span>${esc(item.calories)} <span style="color:var(--text-3);font-size:12px">(treadmill est.)</span></span></div>` : ''}`;
  }

  el.innerHTML = `
    <div class="screen">
      <div class="detail-header">
        <button class="btn btn-ghost" id="back-btn">← Back</button>
        <h2>${title}</h2>
        <span class="history-date">${item.date}</span>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="copy-notes-btn" style="flex:1;font-size:12px;min-width:80px">📋 Notes</button>
        <button class="btn btn-ghost" id="edit-date-btn" style="flex:1;font-size:12px;min-width:80px">📅 Date</button>
        <button class="btn btn-ghost" id="delete-cardio-btn" style="flex:1;font-size:12px;min-width:80px;color:var(--danger);border-color:rgba(224,82,82,0.3)">🗑 Delete</button>
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
          <input type="text" class="input" id="context-input" placeholder="e.g. Recovery day, Tired…" value="${esc(item.workoutContext || '')}" style="flex:1;font-size:15px">
          <button class="btn btn-primary" id="save-context-btn" style="min-height:40px">Save</button>
          <button class="btn btn-ghost" id="cancel-context-btn" style="min-height:40px">&times;</button>
        </div>
      </div>
      <div class="card detail-exercise" style="margin-top:4px">
        ${statsRows}
      </div>
      <div id="notes-section" style="margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <p class="section-title" style="margin:0">Notes</p>
          <button class="btn btn-ghost" id="edit-notes-btn" style="font-size:12px;min-height:32px;padding:0 10px">${item.notes ? 'Edit' : '+ Add'}</button>
        </div>
        <div id="notes-view">${item.notes ? `<div class="detail-notes">${esc(item.notes)}</div>` : '<p style="color:var(--text-3);font-size:14px;margin:0">No notes</p>'}</div>
        <div id="notes-edit-row" style="display:none">
          <textarea class="input" id="notes-input" rows="3" style="width:100%;box-sizing:border-box">${esc(item.notes || '')}</textarea>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button class="btn btn-primary" id="save-notes-btn" style="flex:1;min-height:40px">Save</button>
            <button class="btn btn-ghost" id="cancel-notes-btn" style="min-height:40px">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Strip the synthetic _type field (added in renderHistoryTab) before persisting.
  const persist = async () => { const { _type, ...rec } = item; await save(rec); };

  el.querySelector('#back-btn').addEventListener('click', () => renderHistoryTab(el));

  el.querySelector('#copy-notes-btn').addEventListener('click', () => {
    if (!item.notes) { alert('No notes recorded.'); return; }
    navigator.clipboard.writeText(`${title} — ${item.date}\n${item.notes}`).then(() => alert('Copied!'));
  });

  el.querySelector('#edit-date-btn').addEventListener('click', () => {
    const row = el.querySelector('#date-edit-row');
    row.style.display = row.style.display === 'flex' ? 'none' : 'flex';
  });
  el.querySelector('#save-date-btn').addEventListener('click', async () => {
    const newDate = el.querySelector('#date-input').value;
    if (!newDate) return;
    item.date = newDate;
    await persist();
    showCardioDetail(el, item, type);
  });
  el.querySelector('#cancel-date-btn').addEventListener('click', () => {
    el.querySelector('#date-edit-row').style.display = 'none';
  });

  const addCtxBtn = el.querySelector('#add-context-btn');
  const editCtxBtn = el.querySelector('#edit-context-btn');
  const ctxInputRow = el.querySelector('#context-input-row');
  if (addCtxBtn) addCtxBtn.addEventListener('click', () => { ctxInputRow.style.display = 'flex'; el.querySelector('#context-input').focus(); });
  if (editCtxBtn) editCtxBtn.addEventListener('click', () => { ctxInputRow.style.display = 'flex'; });
  el.querySelector('#save-context-btn').addEventListener('click', async () => {
    const val = el.querySelector('#context-input').value.trim();
    item.workoutContext = val || null;
    await persist();
    showCardioDetail(el, item, type);
  });
  el.querySelector('#cancel-context-btn').addEventListener('click', () => { ctxInputRow.style.display = 'none'; });

  el.querySelector('#edit-notes-btn').addEventListener('click', () => {
    el.querySelector('#notes-view').style.display = 'none';
    el.querySelector('#notes-edit-row').style.display = 'block';
    el.querySelector('#notes-input').focus();
  });
  el.querySelector('#save-notes-btn').addEventListener('click', async () => {
    item.notes = el.querySelector('#notes-input').value.trim();
    await persist();
    showCardioDetail(el, item, type);
  });
  el.querySelector('#cancel-notes-btn').addEventListener('click', () => {
    el.querySelector('#notes-edit-row').style.display = 'none';
    el.querySelector('#notes-view').style.display = 'block';
  });

  el.querySelector('#delete-cardio-btn').addEventListener('click', async () => {
    if (!confirm(`Delete this ${type} from ${item.date}? This cannot be undone.`)) return;
    await del(item.id);
    renderHistoryTab(el);
  });
}
