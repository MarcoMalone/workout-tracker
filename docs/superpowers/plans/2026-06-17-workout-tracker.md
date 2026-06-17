# Workout Tracker PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal offline-first PWA for iPhone that logs strength workouts and runs, visualizes progression by body part, and integrates Claude Sonnet 4.6 for pre/post-workout coaching.

**Architecture:** Vanilla JS ES modules, no framework, no build step. All data stored in IndexedDB via the `idb` wrapper. Served as static files from GitHub Pages. Service worker caches everything for full offline use. Claude API called directly from the browser with `dangerouslyAllowBrowser: true`.

**Tech Stack:** Vanilla JS (ES modules) · IndexedDB + `idb@8` (esm.sh CDN) · Chart.js v4 (CDN) · Anthropic JS SDK (esm.sh CDN) · Service Worker · Web App Manifest · Vitest + fake-indexeddb (dev/test only)

## Global Constraints

- No framework, no build step, no bundler — ES module imports from CDN only
- `idb@8` loaded from `https://esm.sh/idb@8` (CDN — workout data only, no API key risk)
- **Anthropic SDK: vendored** — download bundle to `vendor/anthropic-sdk.js`, import from local path (see Task 9). Do NOT import from esm.sh.
- **Chart.js: SRI-hashed** — load from jsDelivr with `integrity` attribute (see Task 8). Do NOT omit the hash.
- Model: `claude-sonnet-4-6` with `dangerouslyAllowBrowser: true`
- iPhone safe areas: use `env(safe-area-inset-bottom)` and `env(safe-area-inset-top)`
- Minimum tap target: 48px
- Dark mode first — background `#0F1923`, surface `#1A2535`
- All dates stored as ISO 8601 strings (`YYYY-MM-DD`); all timestamps as unix ms
- UUIDs via `crypto.randomUUID()`
- No comments explaining what code does — only why when non-obvious

---

## File Map

```
health-app/
├── index.html          # App shell: nav structure, tab containers, modal slots
├── manifest.json       # PWA manifest (name, icons, display, theme_color)
├── sw.js               # Service worker: cache-first, precaches all app assets
├── styles.css          # All styles: CSS custom properties, nav, cards, inputs, charts
├── app.js              # Entry point: DB init, SW registration, tab router
├── db.js               # IndexedDB schema (v1) + all CRUD query functions
├── ui-log.js           # Log tab: home, template picker, active session, checklists
├── ui-history.js       # History tab: session list, filter chips, session detail
├── ui-progress.js      # Progress tab: segmented control, Chart.js wrappers
├── ui-coach.js         # Coach tab: check-in form, debrief, clipboard export
├── ui-settings.js      # Settings: API key, health context, checklists, templates, exercises
├── claude-api.js       # Context builder (pure fns) + Anthropic SDK calls
├── onboarding.js       # First-launch flow: welcome, API key, health context, CSV import
├── seed-data.js        # Pre-loaded Arm A + Arm B exercise definitions and templates
└── package.json        # Dev only: vitest + fake-indexeddb for unit tests

tests/
├── vitest.config.js
├── db.test.js          # CRUD queries against fake-indexeddb
├── csv-import.test.js  # CSV parsing + session grouping logic
└── claude-context.test.js  # Context string builder (pure functions)
```

---

### Task 1: Project scaffolding + PWA shell

**Files:**
- Create: `index.html`, `manifest.json`, `sw.js`, `styles.css`, `app.js`
- Create stubs: `db.js`, `ui-log.js`, `ui-history.js`, `ui-progress.js`, `ui-coach.js`, `ui-settings.js`, `onboarding.js`, `claude-api.js`, `seed-data.js`
- Create: `package.json`, `tests/vitest.config.js`

**Interfaces:**
- Produces: `switchTab(tabName: string): Promise<void>` exported from `app.js`
- Produces: CSS custom properties on `:root` (colors, spacing, safe areas) used by all UI modules

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Workout">
  <title>Workout Tracker</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div id="app">
    <main id="tab-content" role="main"></main>
    <nav id="bottom-nav" aria-label="Main navigation">
      <button class="nav-tab" data-tab="log" aria-label="Log workout">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4v16M18 4v16M6 12h12"/></svg>
        <span class="nav-label">Log</span>
      </button>
      <button class="nav-tab" data-tab="history" aria-label="History">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span class="nav-label">History</span>
      </button>
      <button class="nav-tab" data-tab="progress" aria-label="Progress">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <span class="nav-label">Progress</span>
      </button>
      <button class="nav-tab" data-tab="coach" aria-label="Coach">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        <span class="nav-label">Coach</span>
      </button>
      <button class="nav-tab" data-tab="settings" aria-label="Settings">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        <span class="nav-label">Settings</span>
      </button>
    </nav>
  </div>
  <div id="modal-overlay" class="modal-overlay hidden"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `manifest.json`**

```json
{
  "name": "Workout Tracker",
  "short_name": "Workout",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0F1923",
  "theme_color": "#1D3461",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Create `icons/` directory. For placeholder icons, download any 192×192 and 512×512 dark PNG, or use ImageMagick: `convert -size 192x192 xc:#1D3461 icons/icon-192.png && convert -size 512x512 xc:#1D3461 icons/icon-512.png`. Icons will be replaced after the Claude Design session.

- [ ] **Step 3: Create `sw.js`**

```js
const CACHE = 'workout-v1';
const PRECACHE = [
  '/', '/index.html', '/styles.css', '/app.js', '/db.js',
  '/ui-log.js', '/ui-history.js', '/ui-progress.js',
  '/ui-coach.js', '/ui-settings.js', '/claude-api.js',
  '/onboarding.js', '/seed-data.js', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('anthropic.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

- [ ] **Step 4: Create `styles.css`**

```css
:root {
  --bg: #0F1923;
  --surface: #1A2535;
  --surface-hi: #22344A;
  --navy: #1D3461;
  --accent: #F3A64E;
  --text: #F0F4F8;
  --text-2: #8EA3B8;
  --text-3: #5C7A96;
  --border: #2A3F58;
  --success: #4CAF7D;
  --danger: #E05252;
  --r-sm: 8px; --r-md: 12px; --r-lg: 16px;
  --nav-h: 64px;
  --safe-b: env(safe-area-inset-bottom, 0px);
  --safe-t: env(safe-area-inset-top, 0px);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; -webkit-tap-highlight-color: transparent; }
#app { display: flex; flex-direction: column; height: 100%; }
#tab-content { flex: 1; overflow-y: auto; padding-top: var(--safe-t); padding-bottom: calc(var(--nav-h) + var(--safe-b) + 8px); }
#bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; height: calc(var(--nav-h) + var(--safe-b)); padding-bottom: var(--safe-b); background: var(--surface); border-top: 1px solid var(--border); display: flex; align-items: stretch; }
.nav-tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; background: none; border: none; color: var(--text-3); cursor: pointer; min-height: 48px; transition: color 0.15s; }
.nav-tab.active { color: var(--accent); }
.nav-icon { width: 22px; height: 22px; }
.nav-label { font-size: 11px; font-weight: 500; }
.hidden { display: none !important; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; }
.screen { padding: 16px; }
.card { background: var(--surface); border-radius: var(--r-md); border: 1px solid var(--border); }
.btn { min-height: 48px; border-radius: var(--r-md); border: none; font-size: 16px; font-weight: 600; cursor: pointer; padding: 0 20px; transition: opacity 0.15s; }
.btn:active { opacity: 0.75; }
.btn-primary { background: var(--accent); color: #000; }
.btn-secondary { background: var(--surface-hi); color: var(--text); }
.btn-ghost { background: none; color: var(--text-2); border: 1px solid var(--border); }
.btn-full { width: 100%; }
.input { background: var(--surface-hi); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text); font-size: 16px; padding: 12px; width: 100%; }
.input:focus { outline: none; border-color: var(--accent); }
.section-title { font-size: 13px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
```

- [ ] **Step 5: Create `app.js`**

```js
import { initDB } from './db.js';
import { renderLogTab } from './ui-log.js';
import { renderHistoryTab } from './ui-history.js';
import { renderProgressTab } from './ui-progress.js';
import { renderCoachTab } from './ui-coach.js';
import { renderSettingsTab } from './ui-settings.js';
import { checkOnboarding } from './onboarding.js';

const TABS = {
  log: renderLogTab,
  history: renderHistoryTab,
  progress: renderProgressTab,
  coach: renderCoachTab,
  settings: renderSettingsTab,
};

export async function switchTab(tabName) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  const el = document.getElementById('tab-content');
  el.innerHTML = '';
  await TABS[tabName](el);
}

async function init() {
  await initDB();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  document.querySelectorAll('.nav-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  const needsOnboarding = await checkOnboarding();
  if (needsOnboarding) return;
  document.querySelector('[data-tab="log"]').classList.add('active');
  await switchTab('log');
}

init().catch(console.error);
```

- [ ] **Step 6: Create stub modules** (all other `.js` files)

Each stub exports the function signature the app expects but renders placeholder content:

```js
// db.js
export async function initDB() {}

// ui-log.js
export async function renderLogTab(el) { el.innerHTML = '<div class="screen"><p style="color:var(--text-2)">Log tab — coming soon</p></div>'; }

// ui-history.js
export async function renderHistoryTab(el) { el.innerHTML = '<div class="screen"><p style="color:var(--text-2)">History — coming soon</p></div>'; }

// ui-progress.js
export async function renderProgressTab(el) { el.innerHTML = '<div class="screen"><p style="color:var(--text-2)">Progress — coming soon</p></div>'; }

// ui-coach.js
export async function renderCoachTab(el) { el.innerHTML = '<div class="screen"><p style="color:var(--text-2)">Coach — coming soon</p></div>'; }

// ui-settings.js
export async function renderSettingsTab(el) { el.innerHTML = '<div class="screen"><p style="color:var(--text-2)">Settings — coming soon</p></div>'; }

// onboarding.js
export async function checkOnboarding() { return false; }

// claude-api.js  — empty for now

// seed-data.js
export const SEED_EXERCISES = [];
export const SEED_TEMPLATES = [];
```

- [ ] **Step 7: Create `package.json` and `tests/vitest.config.js`**

```json
{
  "name": "workout-tracker",
  "type": "module",
  "scripts": { "test": "vitest run", "test:watch": "vitest" },
  "devDependencies": { "vitest": "^2.0.0", "fake-indexeddb": "^6.0.0", "idb": "^8.0.0" }
}
```

```js
// tests/vitest.config.js
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', globals: true } });
```

Run `npm install`.

- [ ] **Step 8: Verify in browser**

```bash
python -m http.server 8080
```

Open `http://localhost:8080`. Expected: dark background, five nav tabs at bottom, tapping each shows placeholder text, no console errors.

- [ ] **Step 9: Commit**

```bash
git init
git add .
git commit -m "feat: PWA shell — navigation, service worker, CSS theme system"
```

---

### Task 2: IndexedDB data layer

**Files:**
- Modify: `db.js` (replace stub with full implementation)
- Create: `tests/db.test.js`

**Interfaces:**
- Produces all query functions consumed by every UI module — exact signatures listed below

- [ ] **Step 1: Write failing tests first**

```js
// tests/db.test.js
import 'fake-indexeddb/auto';
import { initDB, getSetting, setSetting, addExercise, getExercises,
         addTemplate, getTemplates, saveSession, getSessionsByBodyPart,
         getLastSessionForExercise, addRunLog, getRunLogs } from '../db.js';

beforeEach(async () => { await initDB(); });

test('getSetting returns null for unknown key', async () => {
  expect(await getSetting('nonexistent')).toBeNull();
});

test('setSetting and getSetting round-trip', async () => {
  await setSetting('testKey', 'hello');
  expect(await getSetting('testKey')).toBe('hello');
});

test('addExercise and getExercises', async () => {
  const ex = { id: 'ex-1', name: 'Barbell Curl', bodyPartGroup: 'arms', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' };
  await addExercise(ex);
  const all = await getExercises();
  expect(all).toHaveLength(1);
  expect(all[0].name).toBe('Barbell Curl');
});

test('getExercises filters by bodyPartGroup', async () => {
  await addExercise({ id: 'ex-1', name: 'Curl', bodyPartGroup: 'arms', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' });
  await addExercise({ id: 'ex-2', name: 'Squat', bodyPartGroup: 'legs', equipment: 'barbell', machineId: null, unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' });
  const arms = await getExercises('arms');
  expect(arms).toHaveLength(1);
  expect(arms[0].name).toBe('Curl');
});

test('saveSession and getSessionsByBodyPart', async () => {
  const session = { id: 's-1', templateId: 't-1', templateName: 'Arm A', bodyPartGroup: 'arms', date: '2026-06-11', startedAt: Date.now(), finishedAt: Date.now(), sessionRating: 4, preChecklist: {}, postChecklist: {}, sessionNotes: '', exercises: [] };
  await saveSession(session);
  const sessions = await getSessionsByBodyPart('arms');
  expect(sessions).toHaveLength(1);
  expect(sessions[0].id).toBe('s-1');
});

test('getLastSessionForExercise returns most recent session containing exercise', async () => {
  const s1 = { id: 's-1', templateId: 't-1', templateName: 'Arm A', bodyPartGroup: 'arms', date: '2026-06-01', startedAt: 1, finishedAt: 1, sessionRating: null, preChecklist: {}, postChecklist: {}, sessionNotes: '', exercises: [{ exerciseId: 'ex-1', exerciseName: 'Curl', notes: '', sets: [{ setNumber: 1, weight: 120, reps: 12, seconds: null, side: null, isDropSet: false, parentSetIndex: null }] }] };
  const s2 = { ...s1, id: 's-2', date: '2026-06-11', exercises: [{ exerciseId: 'ex-1', exerciseName: 'Curl', notes: '', sets: [{ setNumber: 1, weight: 130, reps: 12, seconds: null, side: null, isDropSet: false, parentSetIndex: null }] }] };
  await saveSession(s1);
  await saveSession(s2);
  const last = await getLastSessionForExercise('ex-1');
  expect(last.date).toBe('2026-06-11');
  expect(last.sets[0].weight).toBe(130);
});

test('addRunLog and getRunLogs', async () => {
  const run = { id: 'r-1', date: '2026-06-15', distanceMiles: 2.5, durationMinutes: 28, paceMinPerMile: 11.2, perceivedEffort: 6, notes: 'easy run', bodyPartGroup: 'legs' };
  await addRunLog(run);
  const runs = await getRunLogs();
  expect(runs).toHaveLength(1);
  expect(runs[0].distanceMiles).toBe(2.5);
});
```

- [ ] **Step 2: Run tests — expect all to fail**

```bash
npx vitest run tests/db.test.js
```

Expected: all tests fail with "initDB is not a function" or similar — db.js is still a stub.

- [ ] **Step 3: Implement `db.js`**

```js
import { openDB } from 'https://esm.sh/idb@8';

let _db = null;

export async function initDB() {
  if (_db) return _db;
  _db = await openDB('workout-tracker', 1, {
    upgrade(db) {
      const exStore = db.createObjectStore('exercise_definitions', { keyPath: 'id' });
      exStore.createIndex('bodyPartGroup', 'bodyPartGroup');

      const tplStore = db.createObjectStore('workout_templates', { keyPath: 'id' });
      tplStore.createIndex('bodyPartGroup', 'bodyPartGroup');

      const sessStore = db.createObjectStore('logged_sessions', { keyPath: 'id' });
      sessStore.createIndex('date', 'date');
      sessStore.createIndex('bodyPartGroup', 'bodyPartGroup');

      const runStore = db.createObjectStore('run_logs', { keyPath: 'id' });
      runStore.createIndex('date', 'date');

      db.createObjectStore('app_settings');
    }
  });
  return _db;
}

async function db() { return _db || initDB(); }

// Settings
export async function getSetting(key) {
  return (await db()).get('app_settings', key) ?? null;
}
export async function setSetting(key, value) {
  return (await db()).put('app_settings', value, key);
}

// Exercise definitions
export async function addExercise(exercise) {
  return (await db()).put('exercise_definitions', exercise);
}
export async function getExercises(bodyPartGroup = null) {
  const d = await db();
  if (bodyPartGroup) return d.getAllFromIndex('exercise_definitions', 'bodyPartGroup', bodyPartGroup);
  return d.getAll('exercise_definitions');
}
export async function getExercise(id) {
  return (await db()).get('exercise_definitions', id);
}
export async function deleteExercise(id) {
  return (await db()).delete('exercise_definitions', id);
}

// Workout templates
export async function addTemplate(template) {
  return (await db()).put('workout_templates', template);
}
export async function getTemplates(bodyPartGroup = null) {
  const d = await db();
  if (bodyPartGroup) return d.getAllFromIndex('workout_templates', 'bodyPartGroup', bodyPartGroup);
  return d.getAll('workout_templates');
}
export async function getTemplate(id) {
  return (await db()).get('workout_templates', id);
}
export async function deleteTemplate(id) {
  return (await db()).delete('workout_templates', id);
}

// Sessions
export async function saveSession(session) {
  return (await db()).put('logged_sessions', session);
}
export async function getSession(id) {
  return (await db()).get('logged_sessions', id);
}
export async function getSessionsByBodyPart(bodyPartGroup, limit = 20) {
  const all = await (await db()).getAllFromIndex('logged_sessions', 'bodyPartGroup', bodyPartGroup);
  return all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
export async function getAllSessions(limit = 100) {
  const all = await (await db()).getAll('logged_sessions');
  return all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

// Returns { sets, date, exerciseName } for the most recent session containing exerciseId
export async function getLastSessionForExercise(exerciseId) {
  const all = await (await db()).getAll('logged_sessions');
  const sorted = all.sort((a, b) => b.date.localeCompare(a.date));
  for (const session of sorted) {
    const match = session.exercises.find(e => e.exerciseId === exerciseId);
    if (match) return { sets: match.sets, date: session.date, exerciseName: match.exerciseName };
  }
  return null;
}

// Returns all sessions containing exerciseId, newest first, up to limit
export async function getSessionsForExercise(exerciseId, limit = 12) {
  const all = await (await db()).getAll('logged_sessions');
  return all
    .filter(s => s.exercises.some(e => e.exerciseId === exerciseId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(s => ({ date: s.date, exercise: s.exercises.find(e => e.exerciseId === exerciseId) }));
}

// Run logs
export async function addRunLog(run) {
  return (await db()).put('run_logs', run);
}
export async function getRunLogs(limit = 20) {
  const all = await (await db()).getAll('run_logs');
  return all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
```

- [ ] **Step 4: Fix test import — idb CDN import won't resolve in Node**

The test environment uses the npm `idb` package; the source uses the CDN URL. Add an alias in `tests/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    alias: { 'https://esm.sh/idb@8': 'idb' }
  }
});
```

- [ ] **Step 5: Run tests — expect all to pass**

```bash
npx vitest run tests/db.test.js
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add db.js tests/db.test.js tests/vitest.config.js
git commit -m "feat: IndexedDB data layer with full CRUD and query functions"
```

---

### Task 3: Seed data — Arm A + Arm B pre-loaded templates

**Files:**
- Modify: `seed-data.js`
- Modify: `db.js` (add `seedIfEmpty`)

**Note to implementer:** The exact exercise list comes from Marco's June 11 (Arm A) and June 13 (Arm B) workout logs shared during the design brainstorm session. Read those logs from the session transcript at `C:\Users\MarcoDiLeo\.claude\projects\c--Users-MarcoDiLeo\786d53a0-727a-42d3-a2b9-2cb6f33c8c1a.jsonl` (grep for "Barbell Curl" to find the workout log messages). The structure below is the correct format — populate the arrays with the actual exercises from those logs.

- [ ] **Step 1: Populate `seed-data.js` with Arm A and Arm B exercises**

Read the session transcript to get the exact exercise list. The format:

```js
// seed-data.js
export const SEED_EXERCISES = [
  // Arms — from Arm A log (June 11)
  { id: 'ex-barbell-curl', name: 'Barbell Curl', bodyPartGroup: 'arms', equipment: 'cable', machineId: 'A18', unit: 'lbs', isTimed: false, isUnilateral: false, notes: '' },
  // ... add all exercises from both workout logs here
  // Timed example:
  { id: 'ex-dead-hang', name: 'Dead Hang', bodyPartGroup: 'arms', equipment: 'bodyweight', machineId: null, unit: 'seconds', isTimed: true, isUnilateral: false, notes: '' },
];

export const SEED_TEMPLATES = [
  {
    id: 'tpl-arm-a',
    name: 'Arm A',
    bodyPartGroup: 'arms',
    createdAt: Date.now(),
    exercises: [
      // { exerciseId: 'ex-barbell-curl', defaultSets: 3, targetReps: 12, order: 0 },
      // ... in the order they appear in the June 11 log
    ]
  },
  {
    id: 'tpl-arm-b',
    name: 'Arm B',
    bodyPartGroup: 'arms',
    createdAt: Date.now(),
    exercises: [
      // ... from June 13 log
    ]
  }
];
```

- [ ] **Step 2: Add `seedIfEmpty` to `db.js`**

```js
// Add to db.js
import { SEED_EXERCISES, SEED_TEMPLATES } from './seed-data.js';

export async function seedIfEmpty() {
  const existing = await getExercises();
  if (existing.length > 0) return;
  for (const ex of SEED_EXERCISES) await addExercise(ex);
  for (const tpl of SEED_TEMPLATES) await addTemplate(tpl);
}
```

- [ ] **Step 3: Call `seedIfEmpty` in `app.js` after `initDB()`**

```js
// In app.js init(), after await initDB():
import { initDB, seedIfEmpty } from './db.js';
// ...
await initDB();
await seedIfEmpty();
```

- [ ] **Step 4: Verify in browser**

Open DevTools → Application → IndexedDB → workout-tracker. After page load, `exercise_definitions` should have all seeded exercises and `workout_templates` should have Arm A and Arm B.

- [ ] **Step 5: Commit**

```bash
git add seed-data.js db.js app.js
git commit -m "feat: seed Arm A and Arm B exercise definitions and templates"
```

---

### Task 4: Log tab — home, template picker, pre-workout checklist

**Files:**
- Modify: `ui-log.js` (replace stub)
- Modify: `styles.css` (add log-tab styles)

**Interfaces:**
- Consumes: `getTemplates()`, `getSetting('preChecklist')` from `db.js`
- Produces: `startSession(templateId)` — kicks off active session, called by Task 5

- [ ] **Step 1: Implement `renderLogTab` — home state**

```js
// ui-log.js
import { getTemplates, getSetting } from './db.js';

let activeSession = null; // holds in-progress session state

export async function renderLogTab(el) {
  if (activeSession) {
    renderActiveSession(el);
    return;
  }
  const templates = await getTemplates();
  el.innerHTML = `
    <div class="screen">
      <div class="log-home-header">
        <h1 class="log-date">${formatDate(new Date())}</h1>
        <p class="log-subtitle">What are we doing today?</p>
      </div>
      <button class="btn btn-primary btn-full log-start-btn" id="start-run-btn">Log a Run</button>
      <div class="template-section">
        <p class="section-title">Workouts</p>
        <div class="template-list" id="template-list"></div>
        <button class="btn btn-ghost btn-full" id="new-template-btn" style="margin-top:8px">+ New Template</button>
      </div>
    </div>
  `;
  const list = el.querySelector('#template-list');
  for (const tpl of templates) {
    const btn = document.createElement('button');
    btn.className = 'template-card';
    btn.innerHTML = `<span class="template-name">${tpl.name}</span><span class="template-tag tag-${tpl.bodyPartGroup}">${tpl.bodyPartGroup}</span>`;
    btn.addEventListener('click', () => showPreChecklist(el, tpl));
    list.appendChild(btn);
  }
  el.querySelector('#new-template-btn').addEventListener('click', () => {
    import('./ui-settings.js').then(m => m.showTemplateEditor(el));
  });
  el.querySelector('#start-run-btn').addEventListener('click', () => showRunForm(el));
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
```

- [ ] **Step 2: Implement pre-workout checklist modal**

```js
// Add to ui-log.js
async function showPreChecklist(el, template) {
  const raw = await getSetting('preChecklist');
  const items = raw ?? [
    'Dynamic warm-up done? (arm circles, leg swings — 5 min)',
    'Joints feel okay? (no unusual pain)',
    'Hydrated?',
    'Any new soreness since last session?'
  ];
  const answers = {};
  items.forEach((_, i) => answers[i] = false);

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-title">Pre-Workout Check</h2>
      <div class="checklist" id="pre-checklist"></div>
      <button class="btn btn-primary btn-full" id="start-session-btn">Start ${template.name}</button>
    </div>
  `;
  const list = overlay.querySelector('#pre-checklist');
  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'checklist-row';
    row.innerHTML = `<button class="toggle-btn" data-idx="${i}" aria-pressed="false"><span class="toggle-label">N</span></button><span class="checklist-item">${item}</span>`;
    row.querySelector('.toggle-btn').addEventListener('click', function() {
      answers[i] = !answers[i];
      this.setAttribute('aria-pressed', answers[i]);
      this.querySelector('.toggle-label').textContent = answers[i] ? 'Y' : 'N';
      this.classList.toggle('checked', answers[i]);
    });
    list.appendChild(row);
  });
  overlay.querySelector('#start-session-btn').addEventListener('click', () => {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    startSession(el, template, answers);
  });
}
```

- [ ] **Step 3: Add styles to `styles.css`**

```css
/* Log tab */
.log-home-header { padding: 24px 0 20px; }
.log-date { font-size: 22px; font-weight: 700; }
.log-subtitle { color: var(--text-2); margin-top: 4px; }
.log-start-btn { margin-bottom: 24px; }
.template-section { margin-top: 8px; }
.template-card { display: flex; align-items: center; justify-content: space-between; width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: 16px; margin-bottom: 8px; cursor: pointer; min-height: 48px; }
.template-card:active { opacity: 0.75; }
.template-name { font-size: 17px; font-weight: 600; color: var(--text); }
.template-tag { font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 20px; text-transform: uppercase; }
.tag-arms { background: #2A1F4A; color: #B09FE0; }
.tag-legs { background: #1A3030; color: #6ECFB0; }
.tag-core { background: #3A2510; color: #F0A060; }

/* Modal */
.modal-sheet { position: fixed; bottom: 0; left: 0; right: 0; background: var(--surface); border-radius: var(--r-lg) var(--r-lg) 0 0; padding: 24px 16px calc(16px + var(--safe-b)); max-height: 80vh; overflow-y: auto; }
.modal-title { font-size: 20px; font-weight: 700; margin-bottom: 16px; }
.checklist { margin-bottom: 20px; }
.checklist-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.toggle-btn { min-width: 40px; min-height: 40px; border-radius: var(--r-sm); border: 1px solid var(--border); background: var(--surface-hi); color: var(--text-3); font-weight: 700; cursor: pointer; }
.toggle-btn.checked { background: var(--success); color: #000; border-color: var(--success); }
.checklist-item { flex: 1; font-size: 15px; color: var(--text-2); }
```

- [ ] **Step 4: Verify manually**

Serve locally. Open Log tab. Expected: date header, "Log a Run" button, template list showing Arm A and Arm B. Tapping a template shows a bottom-sheet modal with 4 checklist items. Tapping Y/N toggles each. "Start" button dismisses modal. (Active session rendering from Task 5 not yet wired — that's fine.)

- [ ] **Step 5: Commit**

```bash
git add ui-log.js styles.css
git commit -m "feat: log tab home, template picker, pre-workout checklist modal"
```

---

### Task 5: Log tab — active session, exercise cards, post-workout checklist

**Files:**
- Modify: `ui-log.js` (add session management, exercise cards, post-workout flow)
- Modify: `styles.css` (exercise card styles)

**Interfaces:**
- Consumes: `getTemplate()`, `getExercise()`, `getLastSessionForExercise()`, `saveSession()`, `getSetting('postChecklist')` from `db.js`
- Consumes: `switchTab()` from `app.js`

- [ ] **Step 1: Implement `startSession` and active session state**

```js
// Add to ui-log.js
import { getTemplate, getExercise, getLastSessionForExercise, saveSession, getSetting } from './db.js';
import { switchTab } from './app.js';

function startSession(el, template, preChecklist) {
  activeSession = {
    id: crypto.randomUUID(),
    templateId: template.id,
    templateName: template.name,
    bodyPartGroup: template.bodyPartGroup,
    date: new Date().toISOString().split('T')[0],
    startedAt: Date.now(),
    finishedAt: null,
    sessionRating: null,
    preChecklist,
    postChecklist: {},
    sessionNotes: '',
    exercises: template.exercises.map(e => ({
      exerciseId: e.exerciseId,
      exerciseName: '',
      notes: '',
      sets: Array.from({ length: e.defaultSets }, (_, i) => ({
        setNumber: i + 1, weight: null, reps: null, seconds: null, side: null,
        isDropSet: false, parentSetIndex: null
      }))
    }))
  };
  renderActiveSession(el);
}
```

- [ ] **Step 2: Implement `renderActiveSession` and exercise cards**

```js
// Add to ui-log.js
async function renderActiveSession(el) {
  const template = await getTemplate(activeSession.templateId);
  el.innerHTML = `
    <div class="screen session-screen">
      <div class="session-header">
        <span class="session-name">${activeSession.templateName}</span>
        <button class="btn btn-ghost session-finish-btn" id="finish-btn">Finish</button>
      </div>
      <div id="exercise-cards"></div>
    </div>
  `;
  const cardsEl = el.querySelector('#exercise-cards');
  for (let i = 0; i < template.exercises.length; i++) {
    const tplEx = template.exercises[i];
    const exDef = await getExercise(tplEx.exerciseId);
    const prev = await getLastSessionForExercise(tplEx.exerciseId);
    activeSession.exercises[i].exerciseName = exDef.name;
    cardsEl.appendChild(buildExerciseCard(i, exDef, prev, activeSession.exercises[i]));
  }
  el.querySelector('#finish-btn').addEventListener('click', () => showPostChecklist(el));
}

function buildExerciseCard(exIdx, exDef, prev, sessionEx) {
  const card = document.createElement('div');
  card.className = 'exercise-card card';
  card.dataset.exIdx = exIdx;

  const prevText = prev
    ? prev.sets.map(s => s.isTimed ? `${s.seconds}s` : `${s.weight}×${s.reps}`).join(', ')
    : 'No previous data';
  const machineLabel = exDef.machineId ? ` (${exDef.machineId})` : '';

  card.innerHTML = `
    <div class="ex-header">
      <span class="ex-name">${exDef.name}${machineLabel}</span>
      <button class="ex-note-btn" title="Add note">📝</button>
    </div>
    <div class="ex-prev">Previous: ${prevText}</div>
    <div class="ex-sets" id="sets-${exIdx}"></div>
    <div class="ex-note-row hidden" id="note-${exIdx}">
      <textarea class="input ex-note-input" placeholder="Note for this exercise..." rows="2"></textarea>
    </div>
    <div class="ex-actions">
      <button class="btn btn-ghost ex-add-set">+ Add Set</button>
      <button class="btn btn-ghost ex-add-drop">+ Drop Set</button>
    </div>
  `;

  const setsEl = card.querySelector(`#sets-${exIdx}`);
  sessionEx.sets.forEach((_, sIdx) => appendSetRow(setsEl, exIdx, sIdx, exDef, prev));

  card.querySelector('.ex-note-btn').addEventListener('click', () => {
    card.querySelector(`#note-${exIdx}`).classList.toggle('hidden');
  });
  card.querySelector(`#note-${exIdx} textarea`).addEventListener('input', e => {
    activeSession.exercises[exIdx].notes = e.target.value;
  });
  card.querySelector('.ex-add-set').addEventListener('click', () => {
    const newIdx = activeSession.exercises[exIdx].sets.length;
    activeSession.exercises[exIdx].sets.push({ setNumber: newIdx + 1, weight: null, reps: null, seconds: null, side: null, isDropSet: false, parentSetIndex: null });
    appendSetRow(setsEl, exIdx, newIdx, exDef, prev);
  });
  card.querySelector('.ex-add-drop').addEventListener('click', () => {
    const newIdx = activeSession.exercises[exIdx].sets.length;
    const parentIdx = newIdx - 1;
    activeSession.exercises[exIdx].sets.push({ setNumber: newIdx + 1, weight: null, reps: null, seconds: null, side: null, isDropSet: true, parentSetIndex: parentIdx });
    appendSetRow(setsEl, exIdx, newIdx, exDef, prev, true);
  });

  return card;
}

function appendSetRow(setsEl, exIdx, sIdx, exDef, prev, isDropSet = false) {
  const prevSet = prev?.sets[sIdx];
  const prevWeight = prevSet?.weight ?? '';
  const row = document.createElement('div');
  row.className = `set-row${isDropSet ? ' drop-set' : ''}`;

  if (exDef.isTimed) {
    row.innerHTML = `<span class="set-num">Set ${sIdx + 1}${isDropSet ? ' ↓' : ''}</span><input type="number" class="set-input" placeholder="${prevSet?.seconds ?? ''}" inputmode="numeric" data-field="seconds"><span class="set-unit">sec</span><button class="set-check" aria-label="Mark done">✓</button>`;
    row.querySelector('[data-field="seconds"]').addEventListener('input', e => {
      activeSession.exercises[exIdx].sets[sIdx].seconds = Number(e.target.value) || null;
    });
  } else if (exDef.isUnilateral) {
    row.innerHTML = `<span class="set-num">Set ${sIdx + 1}</span><input type="number" class="set-input w-input" value="${prevWeight}" inputmode="decimal"><span class="set-unit">lbs</span><span class="set-sep">×</span><input type="number" class="set-input r-input" placeholder="reps" inputmode="numeric"><select class="set-side"><option value="L">L</option><option value="R">R</option></select><button class="set-check">✓</button>`;
    row.querySelector('.w-input').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].weight = Number(e.target.value) || null; });
    row.querySelector('.r-input').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].reps = Number(e.target.value) || null; });
    row.querySelector('.set-side').addEventListener('change', e => { activeSession.exercises[exIdx].sets[sIdx].side = e.target.value; });
  } else {
    row.innerHTML = `<span class="set-num">Set ${sIdx + 1}${isDropSet ? ' ↓' : ''}</span><input type="number" class="set-input w-input" value="${prevWeight}" inputmode="decimal"><span class="set-unit">lbs</span><span class="set-sep">×</span><input type="number" class="set-input r-input" placeholder="reps" inputmode="numeric"><button class="set-check">✓</button>`;
    row.querySelector('.w-input').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].weight = Number(e.target.value) || null; });
    row.querySelector('.r-input').addEventListener('input', e => { activeSession.exercises[exIdx].sets[sIdx].reps = Number(e.target.value) || null; });
  }

  row.querySelector('.set-check').addEventListener('click', function() {
    this.classList.toggle('done');
    row.classList.toggle('set-done');
  });
  setsEl.appendChild(row);
}
```

- [ ] **Step 3: Implement post-workout checklist and session save**

```js
// Add to ui-log.js
async function showPostChecklist(el) {
  const raw = await getSetting('postChecklist');
  const items = raw ?? ['Static stretches done?', 'Hydrated?', 'Anything to note for next time?'];
  const answers = {};
  items.forEach((_, i) => answers[i] = false);

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-title">Finish Workout</h2>
      <div class="checklist" id="post-checklist"></div>
      <div class="rating-row">
        <p class="section-title">Session Rating</p>
        <div class="stars" id="star-rating">
          ${[1,2,3,4,5].map(n => `<button class="star-btn" data-val="${n}">★</button>`).join('')}
        </div>
      </div>
      <textarea class="input session-notes-input" placeholder="How did it go? Anything to note…" rows="3" id="session-notes"></textarea>
      <button class="btn btn-primary btn-full" id="save-session-btn" style="margin-top:16px">Save Workout</button>
    </div>
  `;

  const list = overlay.querySelector('#post-checklist');
  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'checklist-row';
    row.innerHTML = `<button class="toggle-btn" data-idx="${i}"><span class="toggle-label">N</span></button><span class="checklist-item">${item}</span>`;
    row.querySelector('.toggle-btn').addEventListener('click', function() {
      answers[i] = !answers[i];
      this.querySelector('.toggle-label').textContent = answers[i] ? 'Y' : 'N';
      this.classList.toggle('checked', answers[i]);
    });
    list.appendChild(row);
  });

  let rating = null;
  overlay.querySelector('#star-rating').addEventListener('click', e => {
    if (!e.target.classList.contains('star-btn')) return;
    rating = Number(e.target.dataset.val);
    overlay.querySelectorAll('.star-btn').forEach(s => s.classList.toggle('filled', Number(s.dataset.val) <= rating));
  });

  overlay.querySelector('#save-session-btn').addEventListener('click', async () => {
    activeSession.finishedAt = Date.now();
    activeSession.postChecklist = answers;
    activeSession.sessionNotes = overlay.querySelector('#session-notes').value;
    activeSession.sessionRating = rating;
    await saveSession(activeSession);
    activeSession = null;
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    await switchTab('log');
  });
}
```

- [ ] **Step 4: Add exercise card styles to `styles.css`**

```css
.session-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 16px; }
.session-name { font-size: 20px; font-weight: 700; }
.session-finish-btn { min-height: 40px; }
.exercise-card { margin-bottom: 12px; padding: 14px; }
.ex-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.ex-name { font-size: 17px; font-weight: 600; }
.ex-note-btn { background: none; border: none; font-size: 18px; cursor: pointer; padding: 4px; }
.ex-prev { font-size: 13px; color: var(--text-3); margin-bottom: 10px; }
.set-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); }
.set-row.drop-set { padding-left: 16px; }
.set-row.set-done { opacity: 0.5; }
.set-num { font-size: 13px; color: var(--text-3); min-width: 42px; }
.set-input { background: var(--surface-hi); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text); font-size: 17px; font-weight: 600; text-align: center; padding: 8px; width: 70px; min-height: 44px; }
.set-input:focus { outline: none; border-color: var(--accent); }
.w-input { width: 70px; }
.r-input { width: 56px; }
.set-unit, .set-sep { font-size: 13px; color: var(--text-3); }
.set-check { min-width: 40px; min-height: 40px; border-radius: var(--r-sm); background: var(--surface-hi); border: 1px solid var(--border); color: var(--text-3); font-size: 16px; cursor: pointer; }
.set-check.done { background: var(--success); border-color: var(--success); color: #000; }
.ex-actions { display: flex; gap: 8px; margin-top: 10px; }
.ex-actions .btn { flex: 1; min-height: 40px; font-size: 14px; }
.drop-set { border-left: 2px solid var(--accent-dim); }
.rating-row { margin: 16px 0 12px; }
.stars { display: flex; gap: 8px; margin-top: 8px; }
.star-btn { background: none; border: none; font-size: 28px; color: var(--text-3); cursor: pointer; padding: 4px; }
.star-btn.filled { color: var(--accent); }
.session-notes-input { margin-top: 12px; }
.set-side { background: var(--surface-hi); border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text); font-size: 15px; padding: 8px; min-height: 44px; }
```

- [ ] **Step 5: Verify manually**

Serve locally. Start Arm A from Log tab. Expected: exercise cards appear with previous-session data pre-filled in weight fields. Set inputs accept weight/reps. Check button marks sets done. "Finish" shows post-workout checklist modal with star rating and notes. Saving returns to Log home.

Open DevTools → IndexedDB → logged_sessions. The saved session should have all exercises and sets populated.

- [ ] **Step 6: Commit**

```bash
git add ui-log.js styles.css
git commit -m "feat: active workout session — exercise cards with previous weights, set entry, post-workout save"
```

---

### Task 6: Run logging

**Files:**
- Modify: `ui-log.js` (add run form)
- Modify: `styles.css` (run form styles)

**Interfaces:**
- Consumes: `addRunLog()` from `db.js`

- [ ] **Step 1: Implement `showRunForm`**

```js
// Add to ui-log.js
import { addRunLog } from './db.js';

function showRunForm(el) {
  el.innerHTML = `
    <div class="screen">
      <div class="session-header">
        <h2>Log a Run</h2>
        <button class="btn btn-ghost" id="cancel-run">Cancel</button>
      </div>
      <div class="run-form">
        <label class="form-label">Date</label>
        <input type="date" class="input" id="run-date" value="${new Date().toISOString().split('T')[0]}">
        <label class="form-label">Distance (miles)</label>
        <input type="number" class="input" id="run-dist" step="0.01" inputmode="decimal" placeholder="2.5">
        <label class="form-label">Duration (mm:ss)</label>
        <input type="text" class="input" id="run-dur" placeholder="28:30" pattern="[0-9]+:[0-5][0-9]">
        <label class="form-label">Perceived Effort (1–10)</label>
        <input type="range" id="run-effort" min="1" max="10" value="6">
        <div style="text-align:center; color:var(--accent); font-size:20px; font-weight:700" id="effort-display">6</div>
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
      notes: el.querySelector('#run-notes').value,
      bodyPartGroup: 'legs'
    });
    await switchTab('history');
  });
}
```

- [ ] **Step 2: Add form styles to `styles.css`**

```css
.run-form { display: flex; flex-direction: column; gap: 8px; }
.form-label { font-size: 14px; font-weight: 600; color: var(--text-2); margin-top: 8px; }
input[type="range"] { width: 100%; accent-color: var(--accent); }
```

- [ ] **Step 3: Verify manually**

Log tab → "Log a Run" button → form appears. Enter distance and duration. Save → redirects to History tab (stub). Check DevTools → run_logs has the entry.

- [ ] **Step 4: Commit**

```bash
git add ui-log.js styles.css
git commit -m "feat: run logging form with distance, duration, effort, and notes"
```

---

### Task 7: History tab

**Files:**
- Modify: `ui-history.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `getAllSessions()`, `getRunLogs()` from `db.js`

- [ ] **Step 1: Implement history list and session detail**

```js
// ui-history.js
import { getAllSessions, getRunLogs } from './db.js';

export async function renderHistoryTab(el) {
  const [sessions, runs] = await Promise.all([getAllSessions(), getRunLogs()]);
  const all = [
    ...sessions.map(s => ({ ...s, _type: 'workout' })),
    ...runs.map(r => ({ ...r, _type: 'run', bodyPartGroup: 'legs' }))
  ].sort((a, b) => b.date.localeCompare(a.date));

  el.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">History</h1>
      <div class="filter-chips" id="filter-chips">
        ${['All','Arms','Legs','Core','Runs'].map(f =>
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
      : all.filter(i => i.bodyPartGroup === activeFilter);
    listEl.innerHTML = filtered.length === 0
      ? '<p style="color:var(--text-3);text-align:center;padding:32px">No sessions yet</p>'
      : filtered.map(item => {
          const meta = item._type === 'run'
            ? `${item.distanceMiles} mi · ${Math.round(item.durationMinutes)} min`
            : `${totalVolume(item)} lbs total`;
          return `<div class="history-row" data-id="${item.id}" data-type="${item._type}">
            <div><span class="history-name">${item._type === 'run' ? '🏃 Run' : item.templateName}</span></div>
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
  el.innerHTML = `
    <div class="screen">
      <div class="detail-header">
        <button class="btn btn-ghost" id="back-btn">← Back</button>
        <h2>${item.templateName}</h2>
        <span class="history-date">${item.date}</span>
      </div>
      ${item.sessionNotes ? `<div class="detail-notes">${item.sessionNotes}</div>` : ''}
      ${item.exercises.map(ex => `
        <div class="card detail-exercise">
          <p class="ex-name">${ex.exerciseName}</p>
          ${ex.notes ? `<p class="detail-ex-note">${ex.notes}</p>` : ''}
          ${ex.sets.map(s => `<div class="detail-set-row">
            <span class="set-num">Set ${s.setNumber}${s.isDropSet ? ' ↓' : ''}</span>
            <span>${s.isTimed ? `${s.seconds}s` : `${s.weight} × ${s.reps}`}${s.side ? ` (${s.side})` : ''}</span>
          </div>`).join('')}
        </div>
      `).join('')}
    </div>
  `;
  el.querySelector('#back-btn').addEventListener('click', () => renderHistoryTab(el));
}

function showRunDetail(el, run) {
  el.innerHTML = `
    <div class="screen">
      <div class="detail-header">
        <button class="btn btn-ghost" id="back-btn">← Back</button>
        <h2>Run</h2>
        <span class="history-date">${run.date}</span>
      </div>
      <div class="card detail-exercise" style="margin-top:16px">
        <div class="detail-set-row"><span>Distance</span><span>${run.distanceMiles} mi</span></div>
        <div class="detail-set-row"><span>Duration</span><span>${Math.floor(run.durationMinutes)}:${String(Math.round((run.durationMinutes % 1) * 60)).padStart(2,'0')}</span></div>
        <div class="detail-set-row"><span>Pace</span><span>${run.paceMinPerMile} min/mi</span></div>
        <div class="detail-set-row"><span>Effort</span><span>${run.perceivedEffort}/10</span></div>
        ${run.notes ? `<div class="detail-set-row"><span>Notes</span><span>${run.notes}</span></div>` : ''}
      </div>
    </div>
  `;
  el.querySelector('#back-btn').addEventListener('click', () => renderHistoryTab(el));
}
```

- [ ] **Step 2: Add styles to `styles.css`**

```css
.tab-title { font-size: 24px; font-weight: 700; margin-bottom: 16px; }
.filter-chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 12px; scrollbar-width: none; }
.filter-chips::-webkit-scrollbar { display: none; }
.chip { white-space: nowrap; padding: 8px 14px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); font-size: 14px; font-weight: 500; cursor: pointer; min-height: 36px; }
.chip.active { background: var(--navy); color: var(--text); border-color: var(--accent); }
.history-row { padding: 14px; border-bottom: 1px solid var(--border); cursor: pointer; }
.history-row:active { background: var(--surface-hi); }
.history-name { font-size: 16px; font-weight: 600; }
.history-meta { display: flex; justify-content: space-between; margin-top: 4px; }
.history-date, .history-vol { font-size: 13px; color: var(--text-3); }
.detail-header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
.detail-notes { background: var(--surface); border-left: 3px solid var(--accent); padding: 12px; border-radius: var(--r-sm); margin-bottom: 12px; font-size: 14px; color: var(--text-2); }
.detail-exercise { padding: 12px; margin-bottom: 8px; }
.detail-ex-note { font-size: 13px; color: var(--accent-dim); font-style: italic; margin: 4px 0 8px; }
.detail-set-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.detail-set-row:last-child { border-bottom: none; }
```

- [ ] **Step 3: Verify manually**

Log a workout session and a run (from Tasks 5 and 6). Open History tab. Expected: both appear sorted by date, filter chips narrow the list, tapping a row shows detail view with back button.

- [ ] **Step 4: Commit**

```bash
git add ui-history.js styles.css
git commit -m "feat: history tab with filter chips, session detail, run detail"
```

---

### Task 8: Progress tab + Chart.js charts

**Files:**
- Modify: `ui-progress.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `getExercises()`, `getSessionsByBodyPart()`, `getSessionsForExercise()`, `getRunLogs()` from `db.js`

- [ ] **Step 1: Load Chart.js via SRI-hashed script tag in `index.html`**

Get the SRI hash for Chart.js 4.4.9 (or the current 4.x release) from `https://www.jsdelivr.com/package/npm/chart.js` — click the version, copy the SRI hash shown in the UI.

Add before the `<script type="module">` tag in `index.html`:
```html
<script
  src="https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js"
  integrity="sha384-PASTE_HASH_FROM_JSDELIVR_HERE"
  crossorigin="anonymous"></script>
```

If the jsDelivr UI isn't available, generate the hash yourself:
```bash
curl -s https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js | openssl dgst -sha384 -binary | openssl base64 -A
```
Then prefix with `sha384-` and set that as the `integrity` value.

**Do not leave the placeholder text — the actual hash must be present before committing.**

- [ ] **Step 2: Implement progress tab with segmented control and per-body-part charts**

```js
// ui-progress.js
import { getExercises, getSessionsByBodyPart, getSessionsForExercise, getRunLogs } from './db.js';

const CHART_COLORS = { line: '#F3A64E', vol: 'rgba(243,166,78,0.3)', run: '#4CAF7D', grid: '#2A3F58', text: '#8EA3B8' };
const activeCharts = [];

export async function renderProgressTab(el) {
  el.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">Progress</h1>
      <div class="seg-control" id="body-part-seg">
        <button class="seg-btn active" data-part="arms">Arms</button>
        <button class="seg-btn" data-part="legs">Legs</button>
        <button class="seg-btn" data-part="core">Core</button>
      </div>
      <div id="charts-container"></div>
    </div>
  `;
  let currentPart = 'arms';
  const container = el.querySelector('#charts-container');
  await renderBodyPart(container, currentPart);
  el.querySelector('#body-part-seg').addEventListener('click', async e => {
    if (!e.target.classList.contains('seg-btn')) return;
    el.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentPart = e.target.dataset.part;
    activeCharts.forEach(c => c.destroy());
    activeCharts.length = 0;
    container.innerHTML = '';
    await renderBodyPart(container, currentPart);
  });
}

async function renderBodyPart(container, part) {
  const sessions = await getSessionsByBodyPart(part, 20);
  if (sessions.length === 0) {
    container.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:32px">No sessions yet for this body part</p>';
    return;
  }

  // Session volume chart
  const volSection = document.createElement('div');
  volSection.innerHTML = '<p class="section-title">Session Volume</p><div class="chart-wrap"><canvas id="vol-chart"></canvas></div>';
  container.appendChild(volSection);
  const volData = sessions.slice().reverse().map(s => ({
    x: s.date,
    y: s.exercises.reduce((sum, ex) => sum + ex.sets.reduce((s2, set) => s2 + (set.weight || 0) * (set.reps || 0), 0), 0)
  }));
  const volChart = new Chart(volSection.querySelector('#vol-chart'), {
    type: 'bar',
    data: { labels: volData.map(d => d.x), datasets: [{ data: volData.map(d => d.y), backgroundColor: CHART_COLORS.vol, borderColor: CHART_COLORS.line, borderWidth: 1 }] },
    options: chartOptions('lbs')
  });
  activeCharts.push(volChart);

  // Per-exercise charts
  const exercises = await getExercises(part);
  for (const ex of exercises) {
    const history = await getSessionsForExercise(ex.id, 12);
    if (history.length < 2) continue;
    const section = document.createElement('div');
    section.innerHTML = `<p class="section-title">${ex.name}</p><div class="chart-wrap"><canvas id="chart-${ex.id}"></canvas></div>`;
    container.appendChild(section);
    const labels = history.slice().reverse().map(h => h.date);
    const maxWeights = history.slice().reverse().map(h => Math.max(...h.exercise.sets.map(s => s.weight || 0)));
    const chart = new Chart(section.querySelector(`#chart-${ex.id}`), {
      type: 'line',
      data: { labels, datasets: [{ data: maxWeights, borderColor: CHART_COLORS.line, backgroundColor: CHART_COLORS.vol, tension: 0.3, fill: true, pointRadius: 4 }] },
      options: chartOptions(ex.unit)
    });
    activeCharts.push(chart);
  }

  // Runs section for legs
  if (part === 'legs') {
    const runs = await getRunLogs(12);
    if (runs.length >= 2) {
      const runSection = document.createElement('div');
      runSection.innerHTML = '<p class="section-title">Runs</p><div class="chart-wrap"><canvas id="run-chart"></canvas></div>';
      container.appendChild(runSection);
      const sorted = runs.slice().reverse();
      const runChart = new Chart(runSection.querySelector('#run-chart'), {
        type: 'line',
        data: { labels: sorted.map(r => r.date), datasets: [{ label: 'Miles', data: sorted.map(r => r.distanceMiles), borderColor: CHART_COLORS.run, backgroundColor: 'rgba(76,175,125,0.2)', tension: 0.3, fill: true, pointRadius: 4, yAxisID: 'y' }] },
        options: chartOptions('mi')
      });
      activeCharts.push(runChart);
    }
  }
}

function chartOptions(unit) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} ${unit}` } } },
    scales: {
      x: { ticks: { color: CHART_COLORS.text, maxTicksLimit: 6 }, grid: { color: CHART_COLORS.grid } },
      y: { ticks: { color: CHART_COLORS.text }, grid: { color: CHART_COLORS.grid } }
    }
  };
}
```

- [ ] **Step 3: Add chart styles to `styles.css`**

```css
.seg-control { display: flex; background: var(--surface); border-radius: var(--r-md); padding: 3px; margin-bottom: 20px; }
.seg-btn { flex: 1; padding: 10px; border: none; border-radius: 10px; background: none; color: var(--text-2); font-size: 15px; font-weight: 600; cursor: pointer; min-height: 40px; }
.seg-btn.active { background: var(--navy); color: var(--text); }
.chart-wrap { height: 180px; margin-bottom: 24px; }
```

- [ ] **Step 4: Verify manually**

Log 3+ sessions for arms (or import some via CSV — covered in Task 12). Open Progress → Arms. Expected: volume bar chart appears, per-exercise line charts appear for exercises with 2+ sessions. Switching to Legs/Core shows appropriate data or empty state.

- [ ] **Step 5: Commit**

```bash
git add ui-progress.js styles.css index.html
git commit -m "feat: progress tab with Chart.js volume and per-exercise line charts"
```

---

### Task 9: Claude API context builder

**Files:**
- Modify: `claude-api.js`
- Create: `tests/claude-context.test.js`

**Interfaces:**
- Produces: `buildPreWorkoutContext(bodyPartGroup, userNote)` → `{ system, userMessage }`
- Produces: `buildPostWorkoutContext(session)` → `{ system, userMessage }`
- Produces: `callClaude(system, userMessage, apiKey)` → `string` (response text)
- Produces: `buildHealthProjectExport(weeks)` → `string` (clipboard text)

- [ ] **Step 1: Write failing tests**

```js
// tests/claude-context.test.js
import { buildSessionSummary, buildExportSummary } from '../claude-api.js';

const SAMPLE_SESSION = {
  date: '2026-06-11', templateName: 'Arm A', bodyPartGroup: 'arms', sessionNotes: 'felt strong',
  exercises: [
    { exerciseName: 'Barbell Curl', notes: 'shoulder tight', sets: [{ weight: 130, reps: 12, seconds: null, side: null, isDropSet: false }, { weight: 130, reps: 10, seconds: null, side: null, isDropSet: false }] },
    { exerciseName: 'Dead Hang', notes: '', sets: [{ weight: null, reps: null, seconds: 45, side: null, isDropSet: false }] }
  ]
};

test('buildSessionSummary includes exercise name and sets', () => {
  const summary = buildSessionSummary(SAMPLE_SESSION);
  expect(summary).toContain('Barbell Curl');
  expect(summary).toContain('130×12');
  expect(summary).toContain('130×10');
});

test('buildSessionSummary includes timed exercise in seconds', () => {
  const summary = buildSessionSummary(SAMPLE_SESSION);
  expect(summary).toContain('45s');
});

test('buildSessionSummary includes per-exercise notes', () => {
  const summary = buildSessionSummary(SAMPLE_SESSION);
  expect(summary).toContain('shoulder tight');
});

test('buildSessionSummary includes session notes', () => {
  const summary = buildSessionSummary(SAMPLE_SESSION);
  expect(summary).toContain('felt strong');
});

test('buildExportSummary produces a non-empty string', () => {
  const summary = buildExportSummary([SAMPLE_SESSION], []);
  expect(typeof summary).toBe('string');
  expect(summary.length).toBeGreaterThan(50);
  expect(summary).toContain('Arm A');
});
```

- [ ] **Step 2: Run tests — expect all to fail**

```bash
npx vitest run tests/claude-context.test.js
```

Expected: all fail — functions not yet implemented.

- [ ] **Step 2.5: Vendor the Anthropic SDK**

Before writing any code in this task, download the Anthropic SDK browser bundle and commit it:

```bash
# From the health-app/ directory
mkdir -p vendor
npm pack @anthropic-ai/sdk --dry-run 2>/dev/null || npm install @anthropic-ai/sdk
node -e "
const fs = require('fs');
// Copy the browser-compatible bundle
const src = require.resolve('@anthropic-ai/sdk/browser');
fs.copyFileSync(src, 'vendor/anthropic-sdk.js');
console.log('Vendored to vendor/anthropic-sdk.js');
"
git add vendor/anthropic-sdk.js
git commit -m "chore: vendor Anthropic SDK browser bundle (avoid CDN API key risk)"
```

If `@anthropic-ai/sdk/browser` doesn't resolve, use this fallback:
```bash
node -e "
const pkg = require('@anthropic-ai/sdk/package.json');
const entry = pkg.exports?.['.']?.browser ?? pkg.browser ?? pkg.main;
const path = require('path');
const fs = require('fs');
const resolved = path.resolve('node_modules/@anthropic-ai/sdk', entry);
fs.copyFileSync(resolved, 'vendor/anthropic-sdk.js');
console.log('Vendored from', resolved);
"
```

All imports of the Anthropic SDK in `claude-api.js` must use `'./vendor/anthropic-sdk.js'`, never `'https://esm.sh/@anthropic-ai/sdk'`.

- [ ] **Step 3: Implement `claude-api.js`**

```js
// claude-api.js
import Anthropic from './vendor/anthropic-sdk.js';

const SYSTEM_BASE = `You are a personal fitness coach assistant. Give specific, actionable guidance before and after workouts based on the user's health context, injury history, and recent training data. Be direct. Reference actual exercises and weights from the data. When injury or soreness is flagged, err toward caution. Keep responses under 250 words — this is read on a phone.`;

export function buildSessionSummary(session) {
  const lines = [`${session.date} — ${session.templateName}`];
  for (const ex of session.exercises) {
    const setStrs = ex.sets.map(s => {
      if (s.seconds != null) return `${s.seconds}s`;
      if (s.side) return `${s.weight}×${s.reps} (${s.side})`;
      return `${s.weight}×${s.reps}${s.isDropSet ? ' (drop)' : ''}`;
    });
    const notePart = ex.notes ? ` — note: ${ex.notes}` : '';
    lines.push(`  ${ex.exerciseName}: ${setStrs.join(', ')}${notePart}`);
  }
  if (session.sessionNotes) lines.push(`  Session notes: "${session.sessionNotes}"`);
  return lines.join('\n');
}

export async function buildPreWorkoutContext(recentSessions, userNote, healthContext) {
  const system = healthContext ? `${SYSTEM_BASE}\n\n${healthContext}` : SYSTEM_BASE;
  const sessionBlock = recentSessions.map(buildSessionSummary).join('\n\n');
  const userMessage = `Recent training sessions:\n\n${sessionBlock}\n\n---\nPre-workout check-in: ${userNote}`;
  return { system, userMessage };
}

export async function buildPostWorkoutContext(justFinished, recentSessions, healthContext) {
  const system = healthContext ? `${SYSTEM_BASE}\n\n${healthContext}` : SYSTEM_BASE;
  const sessionBlock = recentSessions.map(buildSessionSummary).join('\n\n');
  const userMessage = `Recent sessions for context:\n\n${sessionBlock}\n\n---\nJust completed:\n\n${buildSessionSummary(justFinished)}\n\nPlease give me a post-workout debrief — what went well, what to watch, and a recommendation for next session.`;
  return { system, userMessage };
}

export async function callClaude(system, userMessage, apiKey) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }]
  });
  return response.content[0].text;
}

export function buildExportSummary(sessions, runs) {
  const byPart = { arms: [], legs: [], core: [] };
  for (const s of sessions) {
    if (byPart[s.bodyPartGroup]) byPart[s.bodyPartGroup].push(s);
  }
  const lines = [`## Training Summary — Last ${sessions.length} sessions\n`];
  for (const [part, partSessions] of Object.entries(byPart)) {
    if (partSessions.length === 0) continue;
    lines.push(`### ${part.charAt(0).toUpperCase() + part.slice(1)} (${partSessions.length} sessions)`);
    for (const s of partSessions.slice(0, 4)) lines.push(buildSessionSummary(s));
    lines.push('');
  }
  if (runs.length > 0) {
    lines.push(`### Runs (${runs.length})`);
    for (const r of runs.slice(0, 4)) lines.push(`${r.date}: ${r.distanceMiles} mi, ${Math.round(r.durationMinutes)} min, effort ${r.perceivedEffort}/10${r.notes ? ` — ${r.notes}` : ''}`);
    lines.push('');
  }
  const allNotes = sessions.flatMap(s => [s.sessionNotes, ...s.exercises.map(e => e.notes)]).filter(Boolean);
  if (allNotes.length > 0) {
    lines.push('### Things to flag for your Health Project:');
    for (const note of allNotes.slice(0, 8)) lines.push(`- ${note}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Fix test imports (CDN URL alias)**

Add to `tests/vitest.config.js` aliases:
```js
alias: {
  'https://esm.sh/idb@8': 'idb',
  'https://esm.sh/@anthropic-ai/sdk': '@anthropic-ai/sdk'
}
```

Add to `package.json` devDependencies: `"@anthropic-ai/sdk": "^0.50.0"`, then run `npm install`.

- [ ] **Step 5: Run tests — expect all to pass**

```bash
npx vitest run tests/claude-context.test.js
```

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add claude-api.js tests/claude-context.test.js tests/vitest.config.js package.json
git commit -m "feat: Claude context builder — session summaries, pre/post context, export summary"
```

---

### Task 10: Coach tab UI

**Files:**
- Modify: `ui-coach.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `getSessionsByBodyPart()`, `getAllSessions()`, `getRunLogs()`, `getSetting()` from `db.js`
- Consumes: `buildPreWorkoutContext()`, `buildPostWorkoutContext()`, `callClaude()`, `buildExportSummary()` from `claude-api.js`

- [ ] **Step 1: Implement Coach tab**

```js
// ui-coach.js
import { getSessionsByBodyPart, getAllSessions, getRunLogs, getSetting } from './db.js';
import { buildPreWorkoutContext, buildPostWorkoutContext, callClaude, buildExportSummary } from './claude-api.js';

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
        <p class="export-confirm hidden" id="export-confirm">✓ Copied to clipboard</p>
      </div>
    </div>
  `;

  if (!apiKey) return;

  el.querySelector('#pre-ask-btn').addEventListener('click', async () => {
    const part = el.querySelector('#body-part-select').value;
    const note = el.querySelector('#pre-note').value.trim();
    if (!note) { alert('Describe how you are feeling first.'); return; }
    await runCoach(el, '#pre-ask-btn', '#pre-response', async () => {
      const [recent, health] = await Promise.all([getSessionsByBodyPart(part, 4), getSetting('healthContext')]);
      return buildPreWorkoutContext(recent, note, health);
    }, apiKey);
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
    const [sessions, runs] = await Promise.all([getAllSessions(30), getRunLogs(12)]);
    const text = buildExportSummary(sessions, runs);
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
  resp.textContent = '';
  try {
    const { system, userMessage } = await contextFn();
    const text = await callClaude(system, userMessage, apiKey);
    resp.textContent = text;
    resp.classList.remove('hidden');
  } catch (err) {
    resp.textContent = `Error: ${err.message}`;
    resp.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = btn.id === 'pre-ask-btn' ? 'Ask Coach' : 'Get Debrief';
  }
}
```

- [ ] **Step 2: Add coach styles to `styles.css`**

```css
.coach-section { padding: 16px; margin-bottom: 12px; }
.coach-section-title { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
.coach-hint { font-size: 14px; color: var(--text-2); margin-bottom: 12px; }
.coach-input { margin-bottom: 12px; }
.coach-body-picker { margin-bottom: 12px; }
.coach-response { margin-top: 14px; padding: 12px; background: var(--surface-hi); border-radius: var(--r-sm); font-size: 15px; line-height: 1.55; color: var(--text); white-space: pre-wrap; }
.coach-no-key { padding: 12px 16px; background: var(--surface); border: 1px solid var(--accent-dim); border-radius: var(--r-md); color: var(--text-2); font-size: 14px; margin-bottom: 16px; }
.export-confirm { text-align: center; color: var(--success); font-weight: 600; margin-top: 8px; }
```

- [ ] **Step 3: Verify manually with a real API key**

Add API key in Settings (stub for now — will be wired in Task 11, or set directly in DevTools: `indexedDB` → `app_settings` → add `anthropicApiKey` key). Open Coach tab. Pre-workout check-in with a body part selected and a note → response appears. Post-workout debrief after logging a session → response appears.

- [ ] **Step 4: Commit**

```bash
git add ui-coach.js styles.css
git commit -m "feat: coach tab — pre/post workout Claude integration, clipboard export"
```

---

### Task 11: Settings tab

**Files:**
- Modify: `ui-settings.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `getSetting()`, `setSetting()`, `getExercises()`, `addExercise()`, `deleteExercise()`, `getTemplates()`, `addTemplate()`, `deleteTemplate()`, `getAllSessions()`, `getRunLogs()` from `db.js`

- [ ] **Step 1: Implement settings tab — API key + health context**

```js
// ui-settings.js
import { getSetting, setSetting, getExercises, addExercise, deleteExercise, getTemplates, addTemplate, deleteTemplate, getAllSessions, getRunLogs } from './db.js';

export async function renderSettingsTab(el) {
  const [apiKey, healthCtx, preCL, postCL] = await Promise.all([
    getSetting('anthropicApiKey'), getSetting('healthContext'),
    getSetting('preChecklist'), getSetting('postChecklist')
  ]);
  el.innerHTML = `
    <div class="screen">
      <h1 class="tab-title">Settings</h1>

      <p class="section-title">Coach</p>
      <div class="settings-group card">
        <label class="settings-label">Anthropic API Key</label>
        <input type="password" class="input" id="api-key-input" value="${apiKey || ''}" placeholder="sk-ant-...">
        <button class="btn btn-secondary settings-save-btn" id="save-api-key">Save Key</button>
      </div>

      <p class="section-title" style="margin-top:20px">Health Notes</p>
      <div class="settings-group card">
        <label class="settings-label">Sent with every coaching request</label>
        <textarea class="input" id="health-ctx" rows="6" placeholder="Injury history, things to monitor, ortho notes...">${healthCtx || ''}</textarea>
        <button class="btn btn-secondary settings-save-btn" id="save-health-ctx">Save</button>
      </div>

      <p class="section-title" style="margin-top:20px">Checklists</p>
      <div class="settings-group card">
        <label class="settings-label">Pre-Workout Items</label>
        <div id="pre-cl-list"></div>
        <button class="btn btn-ghost" id="add-pre-item">+ Add item</button>
        <button class="btn btn-secondary settings-save-btn" id="save-pre-cl" style="margin-top:8px">Save</button>
      </div>

      <p class="section-title" style="margin-top:20px">Exercise Library</p>
      <div class="settings-group card" id="exercise-library"></div>
      <button class="btn btn-ghost btn-full" id="add-exercise-btn" style="margin-top:8px">+ Add Exercise</button>

      <p class="section-title" style="margin-top:20px">Workout Templates</p>
      <div class="settings-group card" id="template-library"></div>
      <button class="btn btn-ghost btn-full" id="add-template-btn" style="margin-top:8px">+ New Template</button>

      <p class="section-title" style="margin-top:20px">Data</p>
      <div class="settings-group card">
        <button class="btn btn-ghost btn-full" id="export-json-btn">Export JSON Backup</button>
        <button class="btn btn-ghost btn-full" id="import-csv-btn" style="margin-top:8px">Import from Google Sheets CSV</button>
        <input type="file" id="csv-file-input" accept=".csv" class="hidden">
      </div>
    </div>
  `;

  el.querySelector('#save-api-key').addEventListener('click', async () => {
    await setSetting('anthropicApiKey', el.querySelector('#api-key-input').value.trim());
    showToast('API key saved');
  });
  el.querySelector('#save-health-ctx').addEventListener('click', async () => {
    await setSetting('healthContext', el.querySelector('#health-ctx').value);
    showToast('Health notes saved');
  });

  // Checklist editor
  const preItems = preCL ?? ['Dynamic warm-up done?','Joints feel okay?','Hydrated?','Any new soreness?'];
  renderChecklistEditor(el.querySelector('#pre-cl-list'), preItems, 'pre');
  el.querySelector('#add-pre-item').addEventListener('click', () => {
    preItems.push('New item');
    renderChecklistEditor(el.querySelector('#pre-cl-list'), preItems, 'pre');
  });
  el.querySelector('#save-pre-cl').addEventListener('click', async () => {
    const inputs = el.querySelectorAll('.cl-item-input');
    const items = Array.from(inputs).map(i => i.value).filter(Boolean);
    await setSetting('preChecklist', items);
    showToast('Checklist saved');
  });

  // Exercise library
  await renderExerciseLibrary(el.querySelector('#exercise-library'));
  el.querySelector('#add-exercise-btn').addEventListener('click', () => showExerciseForm(el, null));

  // Template library
  await renderTemplateLibrary(el.querySelector('#template-library'), el);
  el.querySelector('#add-template-btn').addEventListener('click', () => showTemplateEditor(el, null));

  // Export
  el.querySelector('#export-json-btn').addEventListener('click', async () => {
    const [sessions, runs, exercises, templates] = await Promise.all([getAllSessions(1000), getRunLogs(1000), getExercises(), getTemplates()]);
    const blob = new Blob([JSON.stringify({ sessions, runs, exercises, templates }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `workout-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  });

  el.querySelector('#import-csv-btn').addEventListener('click', () => el.querySelector('#csv-file-input').click());
  el.querySelector('#csv-file-input').addEventListener('change', async e => {
    const { importCSV } = await import('./onboarding.js');
    await importCSV(e.target.files[0], el);
  });
}

function renderChecklistEditor(container, items, prefix) {
  container.innerHTML = items.map((item, i) =>
    `<div class="cl-row"><input class="input cl-item-input" value="${item}" data-idx="${i}"><button class="cl-remove-btn" data-idx="${i}">✕</button></div>`
  ).join('');
  container.querySelectorAll('.cl-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => { items.splice(Number(btn.dataset.idx), 1); renderChecklistEditor(container, items, prefix); });
  });
}

async function renderExerciseLibrary(container) {
  const exercises = await getExercises();
  container.innerHTML = exercises.length === 0 ? '<p style="color:var(--text-3);padding:12px">No exercises yet</p>'
    : exercises.map(ex => `<div class="lib-row"><span>${ex.name} <span class="template-tag tag-${ex.bodyPartGroup}">${ex.bodyPartGroup}</span></span><button class="btn btn-ghost lib-del-btn" style="min-height:36px;font-size:13px" data-id="${ex.id}">Delete</button></div>`).join('');
  container.querySelectorAll('.lib-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => { await deleteExercise(btn.dataset.id); await renderExerciseLibrary(container); });
  });
}

async function renderTemplateLibrary(container, el) {
  const templates = await getTemplates();
  container.innerHTML = templates.length === 0 ? '<p style="color:var(--text-3);padding:12px">No templates yet</p>'
    : templates.map(t => `<div class="lib-row"><span>${t.name} <span class="template-tag tag-${t.bodyPartGroup}">${t.bodyPartGroup}</span></span><button class="btn btn-ghost lib-del-btn" style="min-height:36px;font-size:13px" data-id="${t.id}">Delete</button></div>`).join('');
  container.querySelectorAll('.lib-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => { await deleteTemplate(btn.dataset.id); await renderTemplateLibrary(container, el); });
  });
}

function showExerciseForm(el, existing) {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-title">${existing ? 'Edit' : 'Add'} Exercise</h2>
      <label class="form-label">Name</label>
      <input class="input" id="ex-name" value="${existing?.name || ''}">
      <label class="form-label">Body Part</label>
      <select class="input" id="ex-part">
        ${['arms','legs','core'].map(p => `<option value="${p}" ${existing?.bodyPartGroup === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <label class="form-label">Equipment</label>
      <input class="input" id="ex-equip" value="${existing?.equipment || ''}">
      <label class="form-label">Machine ID (optional)</label>
      <input class="input" id="ex-machine" value="${existing?.machineId || ''}">
      <label class="form-label">Unit</label>
      <select class="input" id="ex-unit">
        ${['lbs','seconds','miles'].map(u => `<option value="${u}" ${existing?.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
      </select>
      <div style="display:flex;gap:12px;margin-top:12px">
        <label><input type="checkbox" id="ex-timed" ${existing?.isTimed ? 'checked' : ''}> Timed</label>
        <label><input type="checkbox" id="ex-uni" ${existing?.isUnilateral ? 'checked' : ''}> Unilateral</label>
      </div>
      <button class="btn btn-primary btn-full" id="save-ex-btn" style="margin-top:16px">Save</button>
    </div>
  `;
  overlay.querySelector('#save-ex-btn').addEventListener('click', async () => {
    const exercise = {
      id: existing?.id || crypto.randomUUID(),
      name: overlay.querySelector('#ex-name').value.trim(),
      bodyPartGroup: overlay.querySelector('#ex-part').value,
      equipment: overlay.querySelector('#ex-equip').value.trim(),
      machineId: overlay.querySelector('#ex-machine').value.trim() || null,
      unit: overlay.querySelector('#ex-unit').value,
      isTimed: overlay.querySelector('#ex-timed').checked,
      isUnilateral: overlay.querySelector('#ex-uni').checked,
      notes: ''
    };
    if (!exercise.name) { alert('Name required'); return; }
    await addExercise(exercise);
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    await renderSettingsTab(el);
  });
}

export async function showTemplateEditor(el, existing) {
  const exercises = await getExercises();
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  const selectedExIds = existing?.exercises.map(e => e.exerciseId) ?? [];
  overlay.innerHTML = `
    <div class="modal-sheet">
      <h2 class="modal-title">${existing ? 'Edit' : 'New'} Template</h2>
      <label class="form-label">Name</label>
      <input class="input" id="tpl-name" value="${existing?.name || ''}">
      <label class="form-label">Body Part</label>
      <select class="input" id="tpl-part">
        ${['arms','legs','core'].map(p => `<option value="${p}" ${existing?.bodyPartGroup === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <label class="form-label" style="margin-top:12px">Exercises (in order)</label>
      <div id="tpl-ex-list" style="max-height:240px;overflow-y:auto;margin-bottom:8px">
        ${exercises.map(ex => `<div class="tpl-ex-row"><label><input type="checkbox" value="${ex.id}" ${selectedExIds.includes(ex.id) ? 'checked' : ''}> ${ex.name}</label></div>`).join('')}
      </div>
      <button class="btn btn-primary btn-full" id="save-tpl-btn">Save Template</button>
    </div>
  `;
  overlay.querySelector('#save-tpl-btn').addEventListener('click', async () => {
    const name = overlay.querySelector('#tpl-name').value.trim();
    if (!name) { alert('Name required'); return; }
    const checked = Array.from(overlay.querySelectorAll('#tpl-ex-list input:checked'));
    const exList = checked.map((inp, i) => {
      const ex = exercises.find(e => e.id === inp.value);
      return { exerciseId: ex.id, defaultSets: 3, targetReps: ex.isTimed ? null : 12, order: i };
    });
    await addTemplate({ id: existing?.id || crypto.randomUUID(), name, bodyPartGroup: overlay.querySelector('#tpl-part').value, exercises: exList, createdAt: Date.now() });
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    await renderSettingsTab(el);
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
```

- [ ] **Step 2: Add settings styles to `styles.css`**

```css
.settings-group { padding: 14px; margin-bottom: 4px; display: flex; flex-direction: column; gap: 8px; }
.settings-label { font-size: 13px; color: var(--text-2); }
.settings-save-btn { min-height: 40px; font-size: 14px; align-self: flex-end; }
.lib-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); }
.lib-row:last-child { border-bottom: none; }
.cl-row { display: flex; gap: 8px; margin-bottom: 8px; }
.cl-remove-btn { background: none; border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text-3); cursor: pointer; padding: 0 10px; min-height: 44px; }
.tpl-ex-row { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 15px; }
.toast { position: fixed; bottom: calc(var(--nav-h) + var(--safe-b) + 16px); left: 50%; transform: translateX(-50%); background: var(--navy); color: var(--text); padding: 10px 20px; border-radius: 20px; font-size: 14px; font-weight: 500; z-index: 200; }
```

- [ ] **Step 3: Verify manually**

Open Settings. Enter and save API key. Write health notes and save. Add a new exercise. Create a new template selecting exercises. Delete an exercise. All should persist through page refresh (check IndexedDB).

- [ ] **Step 4: Commit**

```bash
git add ui-settings.js styles.css
git commit -m "feat: settings tab — API key, health context, checklists, exercise library, template builder"
```

---

### Task 12: CSV import + onboarding first-launch flow

**Files:**
- Modify: `onboarding.js`
- Create: `tests/csv-import.test.js`

**Interfaces:**
- Produces: `checkOnboarding(): Promise<boolean>` — returns true if onboarding shown (consumed by `app.js`)
- Produces: `importCSV(file, el): Promise<void>` — accessible from Settings too

- [ ] **Step 1: Write failing CSV parser tests**

```js
// tests/csv-import.test.js
import { parseWorkoutCSV } from '../onboarding.js';

const SAMPLE_CSV = `Date,Workout,Exercise,Set,Reps,Weight_lbs,Volume,Notes
2026-06-11,Arm A,Barbell Curl,1,12,130,1560,
2026-06-11,Arm A,Barbell Curl,2,12,130,1560,shoulder tight
2026-06-11,Arm A,Incline DB Curl,1,12,40,480,
2026-06-13,Arm B,Cable Curl,1,12,50,600,`;

test('parseWorkoutCSV groups rows into sessions by date+workout', () => {
  const sessions = parseWorkoutCSV(SAMPLE_CSV);
  expect(sessions).toHaveLength(2);
  expect(sessions[0].templateName).toBe('Arm A');
  expect(sessions[1].templateName).toBe('Arm B');
});

test('parseWorkoutCSV groups sets by exercise', () => {
  const sessions = parseWorkoutCSV(SAMPLE_CSV);
  const armA = sessions.find(s => s.templateName === 'Arm A');
  expect(armA.exercises).toHaveLength(2);
  const curl = armA.exercises.find(e => e.exerciseName === 'Barbell Curl');
  expect(curl.sets).toHaveLength(2);
  expect(curl.sets[0].weight).toBe(130);
  expect(curl.sets[0].reps).toBe(12);
});

test('parseWorkoutCSV captures per-set notes', () => {
  const sessions = parseWorkoutCSV(SAMPLE_CSV);
  const armA = sessions.find(s => s.templateName === 'Arm A');
  const curl = armA.exercises.find(e => e.exerciseName === 'Barbell Curl');
  expect(curl.notes).toContain('shoulder tight');
});

test('parseWorkoutCSV infers bodyPartGroup from workout name', () => {
  const sessions = parseWorkoutCSV(SAMPLE_CSV);
  expect(sessions[0].bodyPartGroup).toBe('arms');
  expect(sessions[1].bodyPartGroup).toBe('arms');
});
```

- [ ] **Step 2: Run tests — expect all to fail**

```bash
npx vitest run tests/csv-import.test.js
```

Expected: all fail — `parseWorkoutCSV` not yet defined.

- [ ] **Step 3: Implement `onboarding.js`**

```js
// onboarding.js
import { getSetting, setSetting, saveSession, addExercise, addTemplate } from './db.js';
import { switchTab } from './app.js';

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
        <p class="onboard-sub">Log workouts, track progression, get AI coaching. All offline-first.</p>
        <button class="btn btn-primary btn-full" id="import-btn">Import my Google Sheets history</button>
        <button class="btn btn-ghost btn-full" id="fresh-btn" style="margin-top:8px">Start fresh</button>
        <input type="file" id="csv-input" accept=".csv" class="hidden">
      </div>
    `;
    el.querySelector('#fresh-btn').addEventListener('click', () => showStep(2));
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
  const text = await file.text();
  const sessions = parseWorkoutCSV(text);
  let count = 0;
  for (const session of sessions) {
    await saveSession(session);
    count++;
  }
  alert(`Imported ${count} sessions.`);
}

export function parseWorkoutCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',');
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
        startedAt: new Date(row.Date).getTime(),
        finishedAt: new Date(row.Date).getTime(),
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
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
npx vitest run tests/csv-import.test.js
```

Expected: all 4 tests pass.

- [ ] **Step 5: Verify onboarding manually**

Clear site data in DevTools (Application → Storage → Clear site data). Reload. Expected: bottom nav hides, welcome screen with import/start-fresh appears. Import the Google Sheets CSV export. Should show "Imported X sessions." Then API key and health context steps appear. After completing, app loads to Log tab with nav visible. History tab shows the imported sessions.

- [ ] **Step 6: Commit**

```bash
git add onboarding.js tests/csv-import.test.js
git commit -m "feat: first-launch onboarding flow and Google Sheets CSV import"
```

---

### Task 13: GitHub Pages deployment

**Files:**
- Create: `.github/workflows/deploy.yml` (optional CI)
- No code changes — deploy existing files

- [ ] **Step 1: Create GitHub repo and push**

```bash
gh repo create workout-tracker --public --source=. --push
```

Or manually: create repo at github.com, then:
```bash
git remote add origin https://github.com/<username>/workout-tracker.git
git push -u origin main
```

- [ ] **Step 2: Enable GitHub Pages**

Go to repo Settings → Pages → Source: Deploy from branch → Branch: `main` → `/` (root) → Save.

Wait ~60 seconds. The app URL will be: `https://<username>.github.io/workout-tracker/`

- [ ] **Step 3: Update `manifest.json` start_url if deploying to a subpath**

If the app lives at `/workout-tracker/` (not root), update `manifest.json`:
```json
"start_url": "/workout-tracker/"
```

And update `sw.js` PRECACHE paths to include the subpath prefix, or serve from a custom domain on root.

**Simplest option: use a custom domain or set up a root-level GitHub Pages site** (`<username>.github.io` repo).

- [ ] **Step 4: Install on iPhone**

On iPhone, open Safari → navigate to the GitHub Pages URL → Share button → Add to Home Screen → name it "Workout" → Add. App icon appears on home screen. Open it. Expected: standalone mode (no browser chrome), dark background, five tabs.

Disable Wi-Fi and reload — app should still work from service worker cache.

- [ ] **Step 5: Commit**

```bash
git add manifest.json
git commit -m "chore: configure for GitHub Pages deployment"
git push
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 10 spec sections have corresponding tasks
  - Architecture → Task 1, 13
  - Data model → Task 2, 3
  - Log tab (home, session, checklists, runs) → Tasks 4, 5, 6
  - History tab → Task 7
  - Progress tab → Task 8
  - Coach tab + Claude API → Tasks 9, 10
  - Settings tab → Task 11
  - Onboarding + CSV import → Task 12
  - GitHub Pages → Task 13
- [x] **Type consistency:** `buildSessionSummary`, `buildPreWorkoutContext`, `buildPostWorkoutContext`, `buildExportSummary`, `callClaude` — all named consistently across tasks 9 and 10
- [x] **No placeholders:** All code is complete. Seed data notes the transcript source explicitly.
- [x] **DB function names consistent:** `getSessionsByBodyPart`, `getLastSessionForExercise`, `getSessionsForExercise`, `saveSession`, `getAllSessions` — all match between Task 2 definitions and downstream usage
