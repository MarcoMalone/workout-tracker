import { getAllSessions, getRunLogs, getWalkLogs, deleteSession, saveSession, addRunLog, addWalkLog, deleteRunLog, deleteWalkLog } from './db.js';
import { toast, undoToast } from './ui-feedback.js';
import { groupExercises, roundSlots } from './supersets.js';
import { parseDuration, computeRunPace, computeWalkDistance, formatMinSec, formatClock, blankSetsFor } from './ui-log.js';
import { icon } from './icons.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Read-only value for one saved set (weight×reps / seconds), with side.
function setValueText(s) {
  const v = s.seconds != null ? `${esc(s.seconds)}s` : `${esc(s.weight)} × ${esc(s.reps)}`;
  return `${v}${s.side ? ` (${esc(s.side)})` : ''}`;
}

// Build the exercises section of a saved session's detail view, interleaving any
// supersets (consecutive shared supersetId) into rounds — mirroring how they were
// logged. Standalone exercises render as a normal card. Each exercise keeps its
// original array index so the note textarea (data-ex-idx) still saves correctly.
function detailExercisesHTML(item, displayName) {
  return groupExercises(item.exercises).map(g => {
    if (g.exIdxs.length < 2) {
      const i = g.exIdxs[0];
      const ex = item.exercises[i];
      const sets = ex.sets.map(s => `<div class="detail-set-row">
          <span class="set-num">Set ${esc(s.setNumber)}${s.isDropSet ? ' ↓' : ''}</span>
          <span>${setValueText(s)}</span>
        </div>`).join('');
      return `<div class="card detail-exercise">
        <p class="ex-name">${esc(displayName(ex.exerciseName))}</p>
        ${sets}
        <textarea class="input detail-ex-note-input" data-ex-idx="${i}" rows="2" placeholder="Note for this exercise…" style="width:100%;box-sizing:border-box;margin-top:8px">${esc(ex.notes || '')}</textarea>
      </div>`;
    }
    // Superset: interleave by round.
    const names = g.exIdxs.map(i => displayName(item.exercises[i].exerciseName)).join(' + ');
    const slotsByEx = {};
    let roundCount = 0;
    for (const i of g.exIdxs) { slotsByEx[i] = roundSlots(item.exercises[i].sets); roundCount = Math.max(roundCount, slotsByEx[i].length); }
    let roundsHtml = '';
    for (let r = 0; r < roundCount; r++) {
      let rows = '';
      for (const i of g.exIdxs) {
        const ex = item.exercises[i];
        const slot = slotsByEx[i][r];
        if (!slot || slot.workIdx == null) continue;
        const idxs = [slot.workIdx, ...slot.dropIdxs];
        rows += idxs.map((si, k) => `<div class="detail-set-row">
            <span class="set-num">${esc(displayName(ex.exerciseName))}${k > 0 ? ` ↓${k}` : ''}</span>
            <span>${setValueText(ex.sets[si])}</span>
          </div>`).join('');
      }
      roundsHtml += `<div class="detail-round"><div class="detail-round-hd">Round ${r + 1}</div>${rows}</div>`;
    }
    const notes = g.exIdxs.map(i => {
      const ex = item.exercises[i];
      return `<textarea class="input detail-ex-note-input" data-ex-idx="${i}" rows="2" placeholder="Note for ${esc(displayName(ex.exerciseName))}…" style="width:100%;box-sizing:border-box;margin-top:8px">${esc(ex.notes || '')}</textarea>`;
    }).join('');
    return `<div class="card detail-exercise detail-superset">
      <p class="ex-name"><span class="superset-tag">${icon('chainLink', 13)} Superset</span> ${esc(names)}</p>
      ${roundsHtml}
      ${notes}
    </div>`;
  }).join('');
}

// Editable ("Edit sets" mode) rendering of a session's exercises. Unlike the view,
// supersets are NOT interleaved — each exercise is its own card with editable set
// rows, which keeps editing unambiguous; the superset linkage (supersetId) is
// untouched, so the read-only view re-interleaves correctly on save. Each set is
// weight×reps, or seconds if the exercise is timed (any set carries seconds).
function detailExercisesEditHTML(item, displayName) {
  const cards = item.exercises.map((ex, i) => {
    const timed = (ex.sets || []).some(s => s.seconds != null);
    const superTag = ex.supersetId ? `<span class="uni-tag">${icon('chainLink', 12)} superset</span> ` : '';
    const rows = (ex.sets || []).map((s, si) => {
      const drop = s.isDropSet ? '<span class="uni-tag">drop</span>' : '';
      const side = s.side ? `<span class="uni-tag">${esc(s.side)}</span>` : '';
      const fields = timed
        ? `<input type="number" class="set-input hist-set-input" inputmode="numeric" data-ex="${i}" data-s="${si}" data-f="seconds" value="${s.seconds ?? ''}" aria-label="Seconds"><span class="set-unit">sec</span>`
        : `<input type="number" class="set-input hist-set-input" inputmode="decimal" data-ex="${i}" data-s="${si}" data-f="weight" value="${s.weight ?? ''}" aria-label="Weight"><span class="set-unit">lbs</span><span class="tpl-x">×</span><input type="number" class="set-input hist-set-input" inputmode="numeric" data-ex="${i}" data-s="${si}" data-f="reps" value="${s.reps ?? ''}" aria-label="Reps"><span class="set-unit">reps</span>`;
      return `<div class="hist-set-row"><span class="set-num">${si + 1}</span>${fields}${side}${drop}<button class="hist-set-remove" data-ex="${i}" data-s="${si}" aria-label="Remove set">×</button></div>`;
    }).join('');
    return `<div class="card detail-exercise">
      <p class="ex-name">${superTag}${esc(displayName(ex.exerciseName))}</p>
      ${rows || '<p class="settings-hint" style="margin:4px 0">No sets — add one below.</p>'}
      <button class="btn btn-ghost hist-add-set" data-ex="${i}" style="font-size:12px;min-height:32px;margin-top:6px">+ Add set</button>
    </div>`;
  }).join('');
  return `${cards}
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn btn-primary" id="save-sets-btn" style="flex:1;min-height:44px">Save changes</button>
      <button class="btn btn-ghost" id="cancel-sets-btn" style="min-height:44px">Cancel</button>
    </div>`;
}

function detailToast(msg) {
  toast(msg, { duration: 1500 });
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
            ? `${item.distanceMiles} mi · ${Math.round(item.durationMinutes)} min${item.startTime ? ` · ${formatClock(item.startTime)}` : ''}`
            : `${totalVolume(item)} lbs total`;
          const name = item._type === 'run' ? `${icon('run', 16)} Run`
            : item._type === 'walk' ? `${icon('walk', 16)} Walk`
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
        <button class="btn btn-ghost" id="back-btn">${icon('backArrow', 15)} Back</button>
        <h2>${esc(displayName(item.workoutLabel ? `${item.templateName} — ${item.workoutLabel}` : item.templateName))}</h2>
        <span class="history-date">${item.date}</span>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="copy-notes-btn" style="flex:1;font-size:12px;min-width:80px">${icon('copy', 15)} Notes</button>
        <button class="btn btn-ghost" id="edit-date-btn" style="flex:1;font-size:12px;min-width:80px">${icon('calendar', 15)} Date</button>
        <button class="btn btn-ghost" id="delete-session-btn" style="flex:1;font-size:12px;min-width:80px;color:var(--danger);border-color:rgba(224,82,82,0.3)">${icon('trash', 15)} Delete</button>
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
      <div style="display:flex;align-items:center;justify-content:space-between;margin:8px 0 4px">
        <p class="section-title" style="margin:0">Exercises</p>
        <button class="btn btn-ghost" id="edit-sets-btn" style="font-size:12px;min-height:32px;padding:0 10px">Edit sets</button>
      </div>
      <div id="detail-ex-wrap"></div>
    </div>
  `;
  const sessionNotesEl = el.querySelector('#detail-session-notes');
  sessionNotesEl.addEventListener('change', async () => {
    item.sessionNotes = sessionNotesEl.value;
    await saveSession(item);
    detailToast('Saved');
  });

  // Exercises area: view (read-only, superset-interleaved) ↔ edit (flat, editable
  // sets). A JSON snapshot of exercises is taken on entering edit so Cancel reverts.
  const exWrap = el.querySelector('#detail-ex-wrap');
  const editBtn = el.querySelector('#edit-sets-btn');
  let setsSnapshot = null;

  function renderView() {
    exWrap.innerHTML = detailExercisesHTML(item, displayName);
    exWrap.querySelectorAll('.detail-ex-note-input').forEach(t => {
      t.addEventListener('change', async () => {
        item.exercises[Number(t.dataset.exIdx)].notes = t.value;
        await saveSession(item);
        detailToast('Saved');
      });
    });
    editBtn.style.display = '';
  }

  function renderEdit() {
    exWrap.innerHTML = detailExercisesEditHTML(item, displayName);
    exWrap.querySelectorAll('.hist-set-input').forEach(inp => inp.addEventListener('input', () => {
      const s = item.exercises[+inp.dataset.ex].sets[+inp.dataset.s];
      const v = inp.value.trim();
      s[inp.dataset.f] = v === '' ? null : Number(v);
    }));
    exWrap.querySelectorAll('.hist-set-remove').forEach(b => b.addEventListener('click', () => {
      item.exercises[+b.dataset.ex].sets.splice(+b.dataset.s, 1);
      renderEdit();
    }));
    exWrap.querySelectorAll('.hist-add-set').forEach(b => b.addEventListener('click', () => {
      const ex = item.exercises[+b.dataset.ex];
      ex.sets.push(...blankSetsFor(ex.sets));
      renderEdit();
    }));
    exWrap.querySelector('#save-sets-btn').addEventListener('click', async () => {
      item.exercises.forEach(ex => (ex.sets || []).forEach((s, k) => { s.setNumber = k + 1; }));
      await saveSession(item);
      setsSnapshot = null;
      renderView();
      detailToast('Saved');
    });
    exWrap.querySelector('#cancel-sets-btn').addEventListener('click', () => {
      item.exercises = setsSnapshot;
      setsSnapshot = null;
      renderView();
    });
  }

  editBtn.addEventListener('click', () => {
    setsSnapshot = JSON.parse(JSON.stringify(item.exercises));
    editBtn.style.display = 'none';
    renderEdit();
  });

  renderView();
  el.querySelector('#back-btn').addEventListener('click', () => renderHistoryTab(el));
  el.querySelector('#copy-notes-btn').addEventListener('click', () => {
    const titleStr = displayName(item.workoutLabel ? `${item.templateName} — ${item.workoutLabel}` : item.templateName);
    const lines = [`${titleStr} — ${item.date}`];
    if (item.sessionNotes) lines.push(`Session: ${item.sessionNotes}`);
    item.exercises.forEach(ex => {
      if (ex.notes) lines.push(`${displayName(ex.exerciseName)}: ${ex.notes}`);
    });
    if (lines.length === 1) { toast('No notes recorded for this session.'); return; }
    navigator.clipboard.writeText(lines.join('\n')).then(() => toast('Copied!', { type: 'success' }));
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
    await deleteSession(item.id);
    renderHistoryTab(el);
    undoToast('Workout deleted', async () => { await saveSession(item); renderHistoryTab(el); });
  });
}

// Unified detail view for cardio (walk / run) — mirrors showDetail's edit affordances:
// editable date, add/edit context tag, editable notes, delete.
function showCardioDetail(el, item, type) {
  const isRun = type === 'run';
  const title = isRun ? `${icon('run', 20)} Run` : `${icon('walk', 20)} Walk`;
  const save = isRun ? addRunLog : addWalkLog;
  const del = isRun ? deleteRunLog : deleteWalkLog;

  let statsRows, statsEditForm;
  if (isRun) {
    statsRows = `
      ${item.startTime ? `<div class="detail-set-row"><span>Started</span><span>${formatClock(item.startTime)}</span></div>` : ''}
      <div class="detail-set-row"><span>Distance</span><span>${esc(item.distanceMiles)} mi</span></div>
      <div class="detail-set-row"><span>Duration</span><span>${formatMinSec(item.durationMinutes)}</span></div>
      <div class="detail-set-row"><span>Pace</span><span>${esc(item.paceMinPerMile)} min/mi</span></div>
      ${item.perceivedEffort != null ? `<div class="detail-set-row"><span>Effort</span><span>${esc(item.perceivedEffort)}/10</span></div>` : ''}
      ${item.avgHr != null ? `<div class="detail-set-row"><span>Avg HR</span><span>${esc(item.avgHr)} bpm</span></div>` : ''}
      ${item.maxHr != null ? `<div class="detail-set-row"><span>Max HR</span><span>${esc(item.maxHr)} bpm</span></div>` : ''}
      ${item.avgCadence != null ? `<div class="detail-set-row"><span>Cadence</span><span>${esc(Math.round(item.avgCadence * 2))} spm</span></div>` : ''}
      ${item.elevationGain != null ? `<div class="detail-set-row"><span>Elevation</span><span>${esc(Math.round(item.elevationGain))} m</span></div>` : ''}
      ${item.source === 'strava' && item.stravaId ? `<div class="detail-set-row"><span>Source</span><a href="https://www.strava.com/activities/${esc(item.stravaId)}" target="_blank" rel="noopener" style="color:var(--blue)">${icon('run', 13)} View on Strava</a></div>` : ''}`;
    statsEditForm = `
      <label class="form-label">Start time</label>
      <input type="time" class="input" id="edit-time" value="${esc(item.startTime || '')}">
      <label class="form-label">Distance (miles)</label>
      <input type="number" class="input" id="edit-dist" step="0.01" inputmode="decimal" value="${esc(item.distanceMiles)}">
      <label class="form-label">Duration (minutes or mm:ss)</label>
      <input type="text" class="input" id="edit-dur" placeholder="16 or 28:30" pattern="[0-9]+(:[0-5][0-9])?" value="${formatMinSec(item.durationMinutes)}">
      <p class="walk-dist-preview" id="edit-pace-preview"></p>
      <label class="form-label">Perceived Effort (1–10)</label>
      <input type="range" id="edit-effort" min="1" max="10" value="${esc(item.perceivedEffort)}">
      <div style="text-align:center;color:var(--accent);font-size:20px;font-weight:700" id="edit-effort-display">${esc(item.perceivedEffort)}</div>`;
  } else {
    statsRows = `
      ${item.startTime ? `<div class="detail-set-row"><span>Started</span><span>${formatClock(item.startTime)}</span></div>` : ''}
      <div class="detail-set-row"><span>Distance</span><span>${esc(item.distanceMiles)} mi</span></div>
      <div class="detail-set-row"><span>Duration</span><span>${Math.round(item.durationMinutes)} min</span></div>
      <div class="detail-set-row"><span>Speed</span><span>${esc(item.speedMph)} mph</span></div>
      ${item.calories != null ? `<div class="detail-set-row"><span>Calories</span><span>${esc(item.calories)} <span style="color:var(--text-3);font-size:12px">(treadmill est.)</span></span></div>` : ''}
      ${item.avgHr != null ? `<div class="detail-set-row"><span>Avg HR</span><span>${esc(item.avgHr)} bpm</span></div>` : ''}
      ${item.source === 'strava' && item.stravaId ? `<div class="detail-set-row"><span>Source</span><a href="https://www.strava.com/activities/${esc(item.stravaId)}" target="_blank" rel="noopener" style="color:var(--blue)">${icon('walk', 13)} View on Strava</a></div>` : ''}`;
    statsEditForm = `
      <label class="form-label">Start time</label>
      <input type="time" class="input" id="edit-time" value="${esc(item.startTime || '')}">
      <label class="form-label">Duration (minutes or mm:ss)</label>
      <input type="text" class="input" id="edit-dur" placeholder="90 or 47:23" pattern="[0-9]+(:[0-5][0-9])?" value="${esc(Math.round(item.durationMinutes))}">
      <label class="form-label">Speed (mph)</label>
      <input type="number" class="input" id="edit-speed" step="0.1" inputmode="decimal" value="${esc(item.speedMph)}">
      <p class="walk-dist-preview" id="edit-dist-preview"></p>
      <label class="form-label">Treadmill Distance (mi) <span class="form-hint">— overrides calc; clear to auto-calculate</span></label>
      <input type="number" class="input" id="edit-dist" step="0.01" inputmode="decimal" value="${esc(item.distanceMiles)}">
      <label class="form-label">Calories <span class="form-hint">— treadmill estimate</span></label>
      <input type="number" class="input" id="edit-cals" step="1" inputmode="numeric" value="${item.calories != null ? esc(item.calories) : ''}" placeholder="optional">`;
  }

  el.innerHTML = `
    <div class="screen">
      <div class="detail-header">
        <button class="btn btn-ghost" id="back-btn">${icon('backArrow', 15)} Back</button>
        <h2>${title}</h2>
        <span class="history-date">${item.date}</span>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="copy-notes-btn" style="flex:1;font-size:12px;min-width:80px">${icon('copy', 15)} Notes</button>
        <button class="btn btn-ghost" id="edit-date-btn" style="flex:1;font-size:12px;min-width:80px">${icon('calendar', 15)} Date</button>
        <button class="btn btn-ghost" id="delete-cardio-btn" style="flex:1;font-size:12px;min-width:80px;color:var(--danger);border-color:rgba(224,82,82,0.3)">${icon('trash', 15)} Delete</button>
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
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <p class="section-title" style="margin:0">Stats</p>
          <button class="btn btn-ghost" id="edit-stats-btn" style="font-size:12px;min-height:32px;padding:0 10px">Edit</button>
        </div>
        <div id="stats-view">${statsRows}</div>
        <div id="stats-edit-row" style="display:none">
          ${statsEditForm}
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn btn-primary" id="save-stats-btn" style="flex:1;min-height:40px">Save</button>
            <button class="btn btn-ghost" id="cancel-stats-btn" style="min-height:40px">Cancel</button>
          </div>
        </div>
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
    if (!item.notes) { toast('No notes recorded.'); return; }
    navigator.clipboard.writeText(`${isRun ? 'Run' : 'Walk'} — ${item.date}\n${item.notes}`).then(() => toast('Copied!', { type: 'success' }));
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

  // ── Stats editing (distance / duration / pace / effort for runs; duration /
  // speed / distance / calories for walks). Pace and auto-distance are derived, so
  // they recompute on save from the edited inputs rather than being typed directly.
  const statsEditRow = el.querySelector('#stats-edit-row');
  const statsView = el.querySelector('#stats-view');
  el.querySelector('#edit-stats-btn').addEventListener('click', () => {
    const editing = statsEditRow.style.display === 'block';
    statsEditRow.style.display = editing ? 'none' : 'block';
    statsView.style.display = editing ? 'block' : 'none';
  });
  el.querySelector('#cancel-stats-btn').addEventListener('click', () => {
    statsEditRow.style.display = 'none';
    statsView.style.display = 'block';
  });
  const previewCss = 'text-align:center;color:var(--accent);font-size:16px;font-weight:700;padding:2px 0';
  if (isRun) {
    const distEl = el.querySelector('#edit-dist');
    const durEl = el.querySelector('#edit-dur');
    const effortEl = el.querySelector('#edit-effort');
    const pacePreview = el.querySelector('#edit-pace-preview');
    const updatePace = () => {
      const pace = computeRunPace(parseFloat(distEl.value), parseDuration(durEl.value));
      pacePreview.textContent = pace ? `≈ ${pace} min/mi` : '';
      pacePreview.style.cssText = pace ? previewCss : '';
    };
    distEl.addEventListener('input', updatePace);
    durEl.addEventListener('input', updatePace);
    effortEl.addEventListener('input', () => { el.querySelector('#edit-effort-display').textContent = effortEl.value; });
    updatePace();
    el.querySelector('#save-stats-btn').addEventListener('click', async () => {
      const dist = parseFloat(distEl.value);
      const dur = parseDuration(durEl.value);
      if (!dist || dist <= 0 || !dur || dur <= 0) { toast('Enter a valid distance and duration.', { type: 'error' }); return; }
      item.startTime = el.querySelector('#edit-time').value || null;
      item.distanceMiles = dist;
      item.durationMinutes = dur;
      item.paceMinPerMile = computeRunPace(dist, dur);
      item.perceivedEffort = Number(effortEl.value);
      await persist();
      showCardioDetail(el, item, type);
    });
  } else {
    const durEl = el.querySelector('#edit-dur');
    const speedEl = el.querySelector('#edit-speed');
    const distEl = el.querySelector('#edit-dist');
    const calsEl = el.querySelector('#edit-cals');
    const distPreview = el.querySelector('#edit-dist-preview');
    const updateDist = () => {
      const auto = computeWalkDistance(parseDuration(durEl.value), parseFloat(speedEl.value), '');
      distPreview.textContent = auto ? `auto-calc ≈ ${auto} mi (clear distance below to use)` : '';
      distPreview.style.cssText = auto ? previewCss : '';
    };
    durEl.addEventListener('input', updateDist);
    speedEl.addEventListener('input', updateDist);
    updateDist();
    el.querySelector('#save-stats-btn').addEventListener('click', async () => {
      const dur = parseDuration(durEl.value);
      const speed = parseFloat(speedEl.value);
      if (!dur || dur <= 0 || !speed || speed <= 0) { toast('Enter a valid duration and speed.', { type: 'error' }); return; }
      item.startTime = el.querySelector('#edit-time').value || null;
      item.durationMinutes = dur;
      item.speedMph = speed;
      item.distanceMiles = computeWalkDistance(dur, speed, distEl.value);
      const calsVal = calsEl.value.trim();
      item.calories = calsVal === '' ? null : Number(calsVal);
      await persist();
      showCardioDetail(el, item, type);
    });
  }

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
    await del(item.id);
    renderHistoryTab(el);
    undoToast('Deleted', async () => { if (type === 'run') await addRunLog(item); else await addWalkLog(item); renderHistoryTab(el); });
  });
}
