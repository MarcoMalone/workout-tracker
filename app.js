import { initDB, seedIfEmpty } from './db.js';
import { renderLogTab } from './ui-log.js';
import { renderHistoryTab } from './ui-history.js';
import { renderProgressTab } from './ui-progress.js';
import { renderCoachTab } from './ui-coach.js';
import { renderSettingsTab } from './ui-settings.js';
import { checkOnboarding } from './onboarding.js';
import { migrateNewTemplates } from './migrate-data.js';

const TABS = {
  log: renderLogTab,
  history: renderHistoryTab,
  progress: renderProgressTab,
  coach: renderCoachTab,
  settings: renderSettingsTab,
};

export async function switchTab(tabName) {
  if (!TABS[tabName]) return;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  const el = document.getElementById('tab-content');
  el.innerHTML = '';
  await TABS[tabName](el);
  try { localStorage.setItem('lastTab', tabName); } catch (e) {}
  updateResumeBar(tabName);
}

// Show a "resume workout" bar above the tab bar whenever a session is in progress
// and we're not on the Log tab (where the active session itself is shown).
function updateResumeBar(tabName) {
  const bar = document.getElementById('resume-bar');
  if (!bar) return;
  let s = null;
  try { const raw = localStorage.getItem('activeSession'); s = raw ? JSON.parse(raw) : null; } catch (e) {}
  if (s && tabName !== 'log') {
    bar.textContent = `▸ Resume workout: ${s.templateName || 'in progress'}`;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

async function init() {
  const theme = localStorage.getItem('theme') || 'dark';
  if (theme === 'light') document.body.classList.add('light');
  await initDB();
  await seedIfEmpty();
  await migrateNewTemplates();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  document.querySelectorAll('.nav-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.getElementById('resume-bar')?.addEventListener('click', () => switchTab('log'));
  // Universal "tap the backdrop to close" for every sheet rendered into the shared
  // overlay (same as its ✕). confirmSheet manages its own backdrop + resolves the
  // promise, so we skip it here to avoid a dangling await.
  const overlay = document.getElementById('modal-overlay');
  overlay?.addEventListener('click', e => {
    if (e.target === overlay && !overlay.querySelector('.confirm-sheet')) {
      overlay.classList.add('hidden');
      overlay.innerHTML = '';
    }
  });
  const needsOnboarding = await checkOnboarding();
  if (needsOnboarding) return;
  let startTab = null;
  try { startTab = localStorage.getItem('lastTab'); } catch (e) {}
  if (!startTab || !TABS[startTab]) startTab = 'log';
  await switchTab(startTab); // return to the tab you were last on (switchTab sets the active state)
  import('./whatsnew.js').then(m => m.maybeShowWhatsNew()).catch(() => {});
}

init().catch(console.error);
