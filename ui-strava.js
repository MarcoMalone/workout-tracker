// Strava sync + import-preview UI. Pulls new runs/walks from the broker, dedupes
// against existing logs, flags likely manual duplicates, and imports the chosen ones.
import { getRunLogs, getWalkLogs, addRunLog, addWalkLog, deleteRunLog, deleteWalkLog } from './db.js';
import { alreadyImported, findManualDuplicate } from './strava.js';
import { stravaFetchActivities, getStravaLastSync, setStravaLastSync } from './strava-client.js';
import { toast } from './ui-feedback.js';
import { icon } from './icons.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowEpoch = () => Math.floor(Date.now() / 1000);

// Sync (or backfill), dedupe, and show an import preview. `onDone` re-renders the caller.
export async function runStravaSync(onDone, { backfill = false } = {}) {
  toast(backfill ? 'Importing Strava history…' : 'Checking Strava…', { duration: 1600 });
  let result;
  try {
    const after = backfill ? 0 : Math.max(0, (await getStravaLastSync()) - 7 * 86400); // 7-day overlap
    result = await stravaFetchActivities({ mode: backfill ? 'backfill' : 'sync', after });
  } catch (e) {
    if (e.code === 'reconnect') toast('Strava session expired — reconnect in Settings.', { type: 'error', duration: 6000 });
    else if (e.code === 'not_connected') toast('Connect Strava first.', { type: 'error' });
    else toast(`Sync failed: ${e.message}`, { type: 'error', duration: 5000 });
    return;
  }
  const [runs, walks] = await Promise.all([getRunLogs(100000), getWalkLogs(100000)]);
  const existingIds = new Set([...runs, ...walks].map(r => r.id));
  const candidates = [
    ...result.runs.map(r => ({ ...r, _kind: 'run' })),
    ...result.walks.map(w => ({ ...w, _kind: 'walk' })),
  ].filter(a => !alreadyImported(a, existingIds));
  if (!candidates.length) {
    toast('Strava is up to date — nothing new.', { type: 'success' });
    if (!backfill) await setStravaLastSync(nowEpoch());
    return;
  }
  // Flag candidates that match a same-kind manual entry, keeping the matched log so
  // importing can replace the thinner hand-logged run with the richer Strava version.
  for (const c of candidates) {
    c._dupeOf = findManualDuplicate(c, c._kind === 'run' ? runs : walks);
    c._dupe = !!c._dupeOf;
  }
  candidates.sort((a, b) => (b.date + (b.startTime || '')).localeCompare(a.date + (a.startTime || '')));
  showImportPreview(candidates, backfill, onDone);
}

function showImportPreview(candidates, backfill, onDone) {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  const row = (c, i) => `
    <label class="strava-imp-row">
      <input type="checkbox" class="strava-imp-cb" data-i="${i}" checked>
      <span class="strava-imp-main">
        <span class="strava-imp-title">${icon(c._kind === 'run' ? 'run' : 'walk', 15)} ${c._kind === 'run' ? 'Run' : 'Walk'} · ${esc(c.date)}${c.startTime ? ' ' + esc(c.startTime) : ''}</span>
        <span class="strava-imp-sub">${esc(c.distanceMiles)} mi · ${Math.round(c.durationMinutes)} min${c.avgHr ? ' · ' + c.avgHr + ' bpm' : ''}${c._dupe ? ' · <span class="strava-dupe">replaces your manual entry</span>' : ''}</span>
      </span>
    </label>`;
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 class="modal-title" style="margin-bottom:0">${backfill ? 'Import Strava history' : 'New from Strava'}</h2>
        <button class="modal-dismiss-btn" id="strava-imp-dismiss" aria-label="Dismiss">${icon('closeX', 18)}</button>
      </div>
      <p class="settings-hint" style="margin-bottom:10px">${candidates.length} activit${candidates.length === 1 ? 'y' : 'ies'} found. Uncheck any you want to skip. Rows marked "replaces your manual entry" overwrite the run you logged by hand with the richer Strava version (HR, elevation, cadence).</p>
      <div style="max-height:52vh;overflow-y:auto">${candidates.map(row).join('')}</div>
      <button class="btn btn-primary btn-full" id="strava-imp-go" style="margin-top:12px">Import selected</button>
    </div>`;
  const close = () => { overlay.classList.add('hidden'); overlay.innerHTML = ''; };
  overlay.querySelector('#strava-imp-dismiss').addEventListener('click', close);
  overlay.querySelector('#strava-imp-go').addEventListener('click', async () => {
    const chosen = [...overlay.querySelectorAll('.strava-imp-cb')].filter(cb => cb.checked).map(cb => candidates[+cb.dataset.i]);
    let n = 0, replaced = 0;
    for (const c of chosen) {
      const { _kind, _dupe, _dupeOf, ...rec } = c;
      if (_dupeOf) { // replace: delete the thinner manual entry first, then add the Strava one
        if (_kind === 'run') await deleteRunLog(_dupeOf.id); else await deleteWalkLog(_dupeOf.id);
        replaced++;
      }
      if (_kind === 'run') await addRunLog(rec); else await addWalkLog(rec);
      n++;
    }
    if (!backfill) await setStravaLastSync(nowEpoch()); // advance watermark only after resolving
    close();
    toast(`Imported ${n} activit${n === 1 ? 'y' : 'ies'}${replaced ? `, replaced ${replaced} manual` : ''}.`, { type: 'success' });
    if (typeof onDone === 'function') await onDone();
  });
}
