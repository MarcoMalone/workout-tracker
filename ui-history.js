import { getAllSessions, getRunLogs, getWalkLogs } from './db.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function renderHistoryTab(el) {
  const [sessions, runs, walks] = await Promise.all([getAllSessions(), getRunLogs(), getWalkLogs()]);
  const all = [
    ...sessions.map(s => ({ ...s, _type: 'workout' })),
    ...runs.map(r => ({ ...r, _type: 'run', bodyPartGroup: 'legs' })),
    ...walks.map(w => ({ ...w, _type: 'walk', bodyPartGroup: 'legs' }))
  ].sort((a, b) => b.date.localeCompare(a.date));

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
            : esc(item.templateName);
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
  el.innerHTML = `
    <div class="screen">
      <div class="detail-header">
        <button class="btn btn-ghost" id="back-btn">← Back</button>
        <h2>${esc(item.templateName)}</h2>
        <span class="history-date">${item.date}</span>
      </div>
      ${item.sessionNotes ? `<div class="detail-notes">${esc(item.sessionNotes)}</div>` : ''}
      ${item.exercises.map(ex => `
        <div class="card detail-exercise">
          <p class="ex-name">${esc(ex.exerciseName)}</p>
          ${ex.notes ? `<p class="detail-ex-note">${esc(ex.notes)}</p>` : ''}
          ${ex.sets.map(s => `<div class="detail-set-row">
            <span class="set-num">Set ${esc(s.setNumber)}${s.isDropSet ? ' ↓' : ''}</span>
            <span>${s.isTimed ? `${esc(s.seconds)}s` : `${esc(s.weight)} × ${esc(s.reps)}`}${s.side ? ` (${esc(s.side)})` : ''}</span>
          </div>`).join('')}
        </div>
      `).join('')}
    </div>
  `;
  el.querySelector('#back-btn').addEventListener('click', () => renderHistoryTab(el));
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
