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

export function buildPreWorkoutContext(recentSessions, userNote, healthContext) {
  const system = healthContext ? `${SYSTEM_BASE}\n\n${healthContext}` : SYSTEM_BASE;
  const sessionBlock = recentSessions.map(buildSessionSummary).join('\n\n');
  const userMessage = `Recent training sessions:\n\n${sessionBlock}\n\n---\nPre-workout check-in: ${userNote}`;
  return { system, userMessage };
}

export function buildPostWorkoutContext(justFinished, recentSessions, healthContext) {
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

export function buildExportSummary(sessions, runs, walks = []) {
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
  if (walks.length > 0) {
    const totalMiles = walks.reduce((sum, w) => sum + w.distanceMiles, 0).toFixed(1);
    lines.push(`### Treadmill Walks (${walks.length} sessions, ${totalMiles} mi total)`);
    for (const w of walks.slice(0, 6)) {
      const calPart = w.calories != null ? `, ~${w.calories} cal` : '';
      lines.push(`${w.date}: ${w.distanceMiles} mi, ${Math.round(w.durationMinutes)} min at ${w.speedMph} mph${calPart}${w.notes ? ` — ${w.notes}` : ''}`);
    }
    lines.push('');
  }
  const allNotes = sessions.flatMap(s => [s.sessionNotes, ...s.exercises.map(e => e.notes)]).filter(Boolean);
  if (allNotes.length > 0) {
    lines.push('### Things to flag for your Health Project:');
    for (const note of allNotes.slice(0, 8)) lines.push(`- ${note}`);
  }
  return lines.join('\n');
}
