// claude-api.js
import Anthropic from './vendor/anthropic-sdk.js';

const SYSTEM_BASE = `You are a personal fitness coach. Priority order: (1) injury prevention — flag anything that risks aggravating a known issue; (2) keeping the athlete active, strong, and progressing. Be direct and specific: reference actual exercises, weights, and trends from the logged data. No generic advice, no disclaimers. Keep responses under 200 words — this is read on a phone.`;

export function buildSessionSummary(session) {
  const title = session.workoutLabel ? `${session.templateName} — ${session.workoutLabel}` : session.templateName;
  const lines = [`${session.date} — ${title}`];
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

export function buildPreWorkoutContext(recentSessions, userNote, healthContext, readinessNote = '') {
  const system = healthContext ? `${SYSTEM_BASE}\n\n${healthContext}` : SYSTEM_BASE;
  const sessionBlock = recentSessions.map(buildSessionSummary).join('\n\n');
  const readinessBlock = readinessNote ? `\n\n${readinessNote}` : '';
  const userMessage = `Recent training sessions:\n\n${sessionBlock}${readinessBlock}\n\n---\nPre-workout check-in: ${userNote}`;
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
  const MAX_RETRIES = 2;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage }]
      });
      return response.content[0].text;
    } catch (err) {
      lastErr = err;
      const msg = (err.message || '').toLowerCase();
      const retryable = msg.includes('timeout') || msg.includes('stream') || msg.includes('connection') || msg.includes('network') || (err.status >= 500);
      if (!retryable || attempt === MAX_RETRIES) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function buildAdjustedWorkoutTemplate(template, exerciseDefs, sorenessNote, healthContext, apiKey) {
  const system = `You are a fitness coach adjusting workout templates based on athlete condition. Return ONLY valid JSON — no prose, no markdown.${healthContext ? '\n\n' + healthContext : ''}`;
  const exLines = template.exercises.map((tplEx, idx) => {
    const def = exerciseDefs.find(e => e.id === tplEx.exerciseId) || {};
    const name = def.name || tplEx.exerciseId;
    const weight = tplEx.defaultWeight ? `@ ${tplEx.defaultWeight} lbs` : '(bodyweight)';
    const reps = tplEx.defaultSeconds ? `${tplEx.defaultSets} × ${tplEx.defaultSeconds}s` : `${tplEx.defaultSets} × ${tplEx.targetReps || '?'} reps`;
    return `${idx}. ${name} — ${reps} ${weight}`;
  }).join('\n');
  const userMessage = `Athlete condition: "${sorenessNote}"\n\nTemplate: ${template.name}\nExercises:\n${exLines}\n\nReturn a JSON array. Only include exercises that need adjustment. Format: [{"idx": <number>, "defaultWeight": <number|null>, "targetReps": <number|null>, "skip": <boolean>, "note": <string>}]. Conservative approach — reduce load 20-30% for sore muscles, skip if clearly aggravating.`;
  const response = await callClaude(system, userMessage, apiKey);
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[0]);
}

// Parse a coach's goal-suggestion reply (a JSON array, possibly wrapped in
// prose) into clean daily-goal objects. Returns [] on anything unparseable.
export function parseGoalSuggestions(text) {
  const m = (text || '').match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(g => g && typeof g.title === 'string' && g.title.trim())
      .map(g => ({
        title: String(g.title).trim(),
        target: Math.max(1, Math.round(Number(g.target) || 1)),
        unit: g.unit ? String(g.unit).trim() : '',
        why: g.why ? String(g.why).trim() : '',
      }))
      .slice(0, 4);
  } catch { return []; }
}

export function buildGoalSuggestionPrompt(healthContext, recentSummaries, painNote, currentGoalTitles = []) {
  const system = `You are a fitness coach proposing simple DAILY goals for an athlete. Return ONLY a JSON array — no prose, no markdown. Each element: {"title": string, "target": number (daily count; 1 means a yes/no habit), "unit": string (short, e.g. "hangs", "min", "sessions", or ""), "why": string (one short sentence)}. Propose 2-3 goals that fit their profile, training, and any flagged pain. Favor injury prevention and consistency. Do not duplicate existing goals.${healthContext ? '\n\n' + healthContext : ''}`;
  const userMessage = `Recent training:\n${recentSummaries || '(no recent sessions)'}\n\n${painNote || 'No active pain.'}\n\nExisting daily goals: ${currentGoalTitles.length ? currentGoalTitles.join(', ') : 'none'}\n\nPropose 2-3 daily goals as a JSON array.`;
  return { system, userMessage };
}

export async function buildGoalSuggestions(healthContext, recentSummaries, painNote, currentGoalTitles, apiKey) {
  const { system, userMessage } = buildGoalSuggestionPrompt(healthContext, recentSummaries, painNote, currentGoalTitles);
  const response = await callClaude(system, userMessage, apiKey);
  return parseGoalSuggestions(response);
}

export const APP_HELP_SYSTEM = `You are the in-app help assistant for a personal workout-tracker PWA. Answer the user's how-to / where-do-I question about USING THE APP — briefly and concretely (2-4 sentences), naming the exact tab and button. Do NOT give training or medical advice; for that, point them to the Coach tab. If you don't know, say so.

APP MAP:
- Log tab: tap a template to start a workout; the gear on a template edits it. "Morning Check-In" card logs how you feel today (sleep/energy/soreness/mood -> a readiness score the Coach uses). "Daily Goals" section adds/tracks daily goals. "This Week" bars + streak. Quick "Log a Run"/"Log a Walk". During a workout: tap the check to complete a set (auto-starts a rest timer with -15s/+15s); "+ Add Exercise"; the X on an exercise removes it; edit date/time and jot session notes; "Finish" opens the post-workout checklist + rating.
- History tab: every logged workout/run/walk. Tap one for detail; you can edit its DATE and CONTEXT TAG and delete it. Editing a saved workout's written notes after the fact is not available yet (add notes during the workout or on the Finish screen); runs and walks DO allow editing notes from their History detail.
- Progress tab: 12-week heatmap; Training Load (ACWR) gauge and This Week volume board (each has a "?" explainer button); Lifts to Watch (stalled lifts); per-exercise strength charts + PR board; segmented control to switch body part.
- Coach tab (needs an Anthropic API key set in Settings): Body Check-In (tap a body region to log pain 0-10); Pre-Workout Check-In (advice factoring readiness, training load, pain, goals); Post-Workout Debrief; Goal Coach (suggests daily goals); export a training summary.
- Settings tab: Anthropic API key; Coach Profile (a persistent note about you and your injuries injected into every Coach request -- the place to record an ONGOING injury like "avoiding arms, forearm strain"); edit Checklists, Exercise Library, Workout Templates; Theme; Data & Backup (export/restore JSON, import from Google Sheets).`;

export async function askHelp(question, apiKey) {
  return callClaude(APP_HELP_SYSTEM, question, apiKey);
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
