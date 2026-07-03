// @vitest-environment jsdom
//
// Integration smoke test for the standardized Walk/Run detail editing.
// Mounts the real renderHistoryTab, clicks into a cardio detail view, and
// exercises edit-date / context-tag / notes / delete against a real
// (fake-)IndexedDB — asserting the DB actually changes.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { initDB, _resetForTest, addWalkLog, addRunLog, getWalkLogs, getRunLogs } from '../db.js';
import { renderHistoryTab } from '../ui-history.js';

// Let async click handlers (await persist() → re-render) settle.
const flush = () => new Promise(r => setTimeout(r, 0));

let container;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  _resetForTest();
  await initDB();
  window.confirm = () => true;      // auto-accept delete confirmations
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => { container.remove(); });

function detailButtons() {
  return {
    editDate: container.querySelector('#edit-date-btn'),
    dateInput: container.querySelector('#date-input'),
    saveDate: container.querySelector('#save-date-btn'),
    addContext: container.querySelector('#add-context-btn'),
    contextInput: container.querySelector('#context-input'),
    saveContext: container.querySelector('#save-context-btn'),
    editNotes: container.querySelector('#edit-notes-btn'),
    notesInput: container.querySelector('#notes-input'),
    saveNotes: container.querySelector('#save-notes-btn'),
    del: container.querySelector('#delete-cardio-btn'),
  };
}

async function openDetail(type) {
  await renderHistoryTab(container);
  const row = [...container.querySelectorAll('.history-row')].find(r => r.dataset.type === type);
  expect(row, `expected a ${type} row in history`).toBeTruthy();
  row.click();              // → showDetail → showCardioDetail (synchronous render)
}

test('walk detail exposes the standardized edit controls', async () => {
  await addWalkLog({ id: 'w-1', date: '2026-06-10', durationMinutes: 60, speedMph: 2.2, distanceMiles: 2.2, calories: null, notes: '' });
  await openDetail('walk');
  const b = detailButtons();
  expect(b.editDate).toBeTruthy();
  expect(b.addContext).toBeTruthy();
  expect(b.editNotes).toBeTruthy();
  expect(b.del).toBeTruthy();
});

test('editing a walk date persists to the DB', async () => {
  await addWalkLog({ id: 'w-1', date: '2026-06-10', durationMinutes: 60, speedMph: 2.2, distanceMiles: 2.2, calories: null, notes: '' });
  await openDetail('walk');
  const b = detailButtons();
  b.editDate.click();
  b.dateInput.value = '2026-07-01';
  b.saveDate.click();
  await flush();
  const walks = await getWalkLogs();
  expect(walks).toHaveLength(1);
  expect(walks[0].date).toBe('2026-07-01');
});

test('adding a context tag to a walk persists to the DB', async () => {
  await addWalkLog({ id: 'w-1', date: '2026-06-10', durationMinutes: 60, speedMph: 2.2, distanceMiles: 2.2, calories: null, notes: '' });
  await openDetail('walk');
  const b = detailButtons();
  b.addContext.click();
  b.contextInput.value = 'Recovery day';
  b.saveContext.click();
  await flush();
  const walks = await getWalkLogs();
  expect(walks[0].workoutContext).toBe('Recovery day');
});

test('editing walk notes persists to the DB', async () => {
  await addWalkLog({ id: 'w-1', date: '2026-06-10', durationMinutes: 60, speedMph: 2.2, distanceMiles: 2.2, calories: null, notes: '' });
  await openDetail('walk');
  const b = detailButtons();
  b.editNotes.click();
  b.notesInput.value = 'felt great, no hip pain';
  b.saveNotes.click();
  await flush();
  const walks = await getWalkLogs();
  expect(walks[0].notes).toBe('felt great, no hip pain');
});

test('deleting a walk removes it from the DB', async () => {
  await addWalkLog({ id: 'w-1', date: '2026-06-10', durationMinutes: 60, speedMph: 2.2, distanceMiles: 2.2, calories: null, notes: '' });
  await openDetail('walk');
  detailButtons().del.click();
  await flush();
  expect(await getWalkLogs()).toHaveLength(0);
});

test('run detail edits and deletes persist to the DB', async () => {
  await addRunLog({ id: 'r-1', date: '2026-06-15', distanceMiles: 2.5, durationMinutes: 28, paceMinPerMile: 11.2, perceivedEffort: 6, notes: '', bodyPartGroup: 'legs' });
  await openDetail('run');
  // context tag round-trip
  let b = detailButtons();
  b.addContext.click();
  b.contextInput.value = 'Tempo run';
  b.saveContext.click();
  await flush();
  expect((await getRunLogs())[0].workoutContext).toBe('Tempo run');
  // delete
  detailButtons().del.click();
  await flush();
  expect(await getRunLogs()).toHaveLength(0);
});
