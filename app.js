import { initDB, seedIfEmpty } from './db.js';
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
  if (!TABS[tabName]) return;
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  const el = document.getElementById('tab-content');
  el.innerHTML = '';
  await TABS[tabName](el);
}

async function init() {
  await initDB();
  await seedIfEmpty();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  document.querySelectorAll('.nav-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  const needsOnboarding = await checkOnboarding();
  if (needsOnboarding) return;
  document.querySelector('[data-tab="log"]').classList.add('active');
  await switchTab('log');
}

init().catch(console.error);
