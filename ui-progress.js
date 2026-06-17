import { getExercises, getSessionsByBodyPart, getSessionsForExercise, getRunLogs } from './db.js';

const CHART_COLORS = { line: '#F3A64E', vol: 'rgba(243,166,78,0.3)', run: '#4CAF7D', grid: '#2A3F58', text: '#8EA3B8' };
const activeCharts = [];

export async function renderProgressTab(el) {
  activeCharts.forEach(c => { try { c.destroy(); } catch(e) {} });
  activeCharts.length = 0;
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
