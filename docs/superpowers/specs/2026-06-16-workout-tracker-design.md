# Workout Tracker PWA — Design Spec

**Date:** 2026-06-16  
**Author:** Marco Di Leo  
**Status:** Approved for implementation

---

## 1. Overview

A personal Progressive Web App (PWA) for iPhone that replaces the current workflow of logging workouts in Apple Notes and manually copying data to Google Sheets. The app handles structured exercise logging, progression visualization, and an AI coaching layer powered by Claude Sonnet 4.6.

**Goals:**
- Log workouts faster than Notes with inline previous-session reference
- See progression charts per body part (arms, legs, core) without touching a spreadsheet
- Get contextual coaching before and after each session without switching apps
- Work fully offline at the gym; Claude coaching requires internet

**Non-goals:**
- No backend, no server, no authentication
- No social features, sharing, or cloud sync
- No Strava auto-sync (manual run logging only, revisit later)
- No live mid-set coaching (pre/post session only)

---

## 2. Architecture

### 2.1 Hosting

**GitHub Pages** — free, permanent `https://` URL, zero maintenance.

Setup: push static files to a public repo, enable Pages in repo settings. One-time iPhone install: visit URL in Safari → Share → Add to Home Screen → installed as PWA.

### 2.2 Storage

**IndexedDB** via the `idb` wrapper library (~3KB). All data lives on-device. Nothing transmitted to any server except explicit Claude API calls initiated by the user.

Five object stores:
- `exercise_definitions`
- `workout_templates`
- `logged_sessions`
- `run_logs`
- `app_settings` (key-value: health context file, API key, checklist config)

### 2.3 Offline Strategy

Service worker with cache-first strategy. On first load, all app assets (HTML, CSS, JS, Chart.js) are cached. Subsequent loads serve from cache — no network needed. Claude Coach tab gracefully degrades when offline ("Connect to use Coach").

### 2.4 Tech Stack

- Vanilla JavaScript (ES modules, no framework)
- `idb` v8 — IndexedDB wrapper (loaded from `esm.sh` CDN, no npm)
- Chart.js v4 — progression charts (CDN)
- Anthropic JS SDK — browser-side (`dangerouslyAllowBrowser: true`, loaded from `esm.sh` CDN)
- Service worker — offline caching
- Web App Manifest — PWA installability

No build step required. All dependencies loaded via CDN ES module imports. Files served as-is from GitHub Pages.

### 2.5 API Key Security

The Anthropic API key is entered once in Settings and stored in IndexedDB. It is never transmitted anywhere except directly to `api.anthropic.com`. Acceptable for a single-user personal app with no other users.

---

## 3. Data Model

### 3.1 Exercise Definitions

```js
{
  id: string,                    // uuid
  name: string,                  // "Barbell Curl"
  bodyPartGroup: 'arms' | 'legs' | 'core',
  equipment: string,             // "barbell", "dumbbell", "cable", "machine", "bodyweight"
  machineId: string | null,      // "A18", "seat level 4", etc.
  unit: 'lbs' | 'seconds' | 'miles',
  isTimed: boolean,              // true for Dead Hangs, planks
  isUnilateral: boolean,         // true for single-arm/single-leg — logs L and R separately
  notes: string                  // default form cues or ortho notes for this exercise
}
```

### 3.2 Workout Templates

```js
{
  id: string,
  name: string,                  // "Arm A", "Arm B", "Leg Day", "Core"
  bodyPartGroup: 'arms' | 'legs' | 'core',
  exercises: [
    {
      exerciseId: string,
      defaultSets: number,
      targetReps: number | null, // null for timed exercises
      order: number
    }
  ],
  createdAt: number
}
```

**Pre-loaded templates:** Arm A and Arm B are pre-populated from Marco's existing workout logs (the June 11 Workout A and June 13 Workout B logs shared during the design brainstorm session — implementer should reference those to populate the exercise list). Leg Day and Core start empty — built in-app.

### 3.3 Logged Sessions

```js
{
  id: string,
  templateId: string,
  templateName: string,          // denormalized for display after template edits
  bodyPartGroup: 'arms' | 'legs' | 'core',
  date: string,                  // ISO 8601 "2026-06-16"
  startedAt: number,             // unix ms
  finishedAt: number | null,
  sessionRating: number | null,  // 1–5, collected at post-workout time
  preChecklist: { [key: string]: boolean },
  postChecklist: { [key: string]: boolean },
  sessionNotes: string,          // how I felt overall, energy level, context
  exercises: [
    {
      exerciseId: string,
      exerciseName: string,      // denormalized
      notes: string,             // per-exercise: shoulder tight, elbow clicking, etc.
      sets: [
        {
          setNumber: number,
          weight: number | null,
          reps: number | null,
          seconds: number | null,  // for timed exercises
          side: 'L' | 'R' | null, // for unilateral
          isDropSet: boolean,
          parentSetIndex: number | null  // links drop set to parent
        }
      ]
    }
  ]
}
```

### 3.4 Run Logs

```js
{
  id: string,
  date: string,                  // ISO 8601
  distanceMiles: number,
  durationMinutes: number,
  paceMinPerMile: number,        // computed: durationMinutes / distanceMiles
  perceivedEffort: number,       // 1–10
  notes: string,
  bodyPartGroup: 'legs'          // always 'legs' — runs appear in legs dashboard
}
```

### 3.5 Health Context File

Single text blob stored in `app_settings` under key `healthContext`. Free-form markdown. Sent (cached) with every Claude API call. Editable in Settings.

**Suggested structure for Marco to populate:**

```markdown
## Current Limitations
- [injury notes, ortho restrictions]

## Things to Monitor
- [body parts, symptoms to watch]

## Medications / Supplements
- [anything relevant to training]

## Training History Context
- [surgery dates, recovery milestones, baseline notes]
```

### 3.6 App Settings Keys

| Key | Type | Purpose |
|-----|------|---------|
| `anthropicApiKey` | string | Claude API key |
| `healthContext` | string | Health context file content |
| `preChecklist` | string[] | Ordered checklist items for pre-workout |
| `postChecklist` | string[] | Ordered checklist items for post-workout |
| `onboardingComplete` | boolean | First-launch flag |

---

## 4. Features

### 4.1 Navigation

Five bottom-tab navigation items, iPhone-native feel, large tap targets (min 48px):

```
[ Log ] [ History ] [ Progress ] [ Coach ] [ Settings ]
```

Active tab indicated with color. Bottom safe-area inset handled for iPhone home bar.

### 4.2 Log Tab

**Home state (no active session):**
- "Start Workout" button, prominent
- Today's date
- Quick-start buttons for recent templates

**Template selection:**
- List of templates grouped by body part
- "New Template" button at bottom

**Active session — exercise log screen:**

Each exercise displayed as a card:

```
┌─────────────────────────────────────────┐
│ Barbell Curl (A18)              📝 Note │
│ Previous: 130×12, 130×12, 130×10        │
├─────────────────────────────────────────┤
│ Set 1  [130 lbs] × [12]  ✓             │
│ Set 2  [130 lbs] × [  ]                │
│ Set 3  [    ] × [  ]                   │
│                          + Drop Set    │
│                          + Add Set     │
└─────────────────────────────────────────┘
```

- Previous session data loads automatically — looks up the last logged session containing this exercise by exercise ID, regardless of which template was used
- Weight field pre-fills with previous session's weight — tap to change
- Reps field is blank — tap to enter
- ✓ tap to mark set complete
- Timed exercises show `[seconds]` instead of weight × reps
- Unilateral exercises show L and R rows per set
- Drop sets attach below parent set, indented
- Note icon opens a text input drawer (per-exercise notes saved to session)
- Machine ID shown in header if defined on the exercise

**Pre-workout checklist** — modal when "Start Workout" is tapped:
- Rendered from `preChecklist` setting
- Binary Y/N toggle per item
- "Start" button enabled after viewing (not required to answer all Y)

**Post-workout checklist** — modal when "Finish Workout" is tapped:
- Rendered from `postChecklist` setting  
- Session notes text field (free text, health context for this session)
- "Finish" saves session to IndexedDB

**Run logging:**
- Available as a session type: "Log a Run"
- Fields: date, distance (miles), duration (min:sec), perceived effort (1–10), notes

### 4.3 History Tab

- Reverse-chronological list of sessions (workouts + runs)
- Filter chips: All / Arms / Legs / Core / Runs
- Each row: date, template name, total volume (for lifts) or distance (for runs)
- Tap to open full session detail (all sets, weights, notes, checklist answers)
- Pull-to-refresh (no-op, data is local — just visual affordance)

### 4.4 Progress Tab

Three sub-views accessed by a segmented control: **Arms | Legs | Core**

**Per body part view:**

1. **Session Volume Chart** — total lbs per session over last 12 sessions, bar chart, trend line overlay

2. **Per-Exercise Cards** — one card per exercise in that body part group:
   - Line chart: max weight per session over last 12 sessions
   - Secondary line: total volume per session
   - Last session summary below chart: "Last: 130×12, 130×12 · 3 weeks of improvement"

3. **Legs view extras:**
   - Runs section below lifting charts
   - Distance over time (line chart)
   - Pace over time (line chart, lower = better)
   - Combined "training load" view: runs + leg sessions on same timeline

All charts use Chart.js. Date range selector: Last 8 / Last 12 / Last 20 sessions.

### 4.5 Coach Tab

Three sections:

**Pre-Workout Check-In**
- Text input: "How are you feeling? Any soreness, tightness, or injuries to flag?"
- "Ask Coach" button
- Claude response appears below, formatted
- Runs before starting a session, can be done from any screen

**Post-Workout Debrief**
- Available after finishing a session (button also accessible anytime)
- No input required — Claude reviews the session you just logged
- Option to add a note: "Anything specific you want feedback on?"
- "Get Debrief" button
- Claude response appears below

**Update My Health Project** (bottom of Coach tab)
- Button: "Generate summary for my Claude Health Project"
- Generates a formatted 2–4 week training summary (all sessions, notable notes, trends)
- Copies text to clipboard
- Marco pastes into his personal Claude Health Project for broader planning conversations

### 4.6 Settings Tab

- **Health Context File** — multi-line text editor, save button, character count
- **Anthropic API Key** — masked input, save, test connection button
- **Pre-Workout Checklist** — add/remove/reorder items
- **Post-Workout Checklist** — add/remove/reorder items
- **Exercise Library** — list of all exercise definitions, add/edit/delete
- **Workout Templates** — list of templates, tap to edit exercise list and order
- **Export Data** — download full IndexedDB as JSON (backup)
- **Import Data** — upload JSON backup to restore
- **Import from Google Sheets** — CSV import (see Section 5)

---

## 5. Onboarding & First Launch

### 5.1 First-Launch Flow

On first open (`onboardingComplete !== true`):

**Step 1 — Welcome screen**
- App name, brief description
- Two buttons: "Import my Google Sheets data" / "Start fresh"

**Step 2 — API key (skippable)**
- Prompt to enter Anthropic API key
- Explains: "Used only for the Coach tab. Costs ~$0.005 per session. Skip to use the app without coaching."
- Skip link → proceeds to Step 3

**Step 3 — Health context file (skippable)**
- Explains what it's for
- Multi-line text editor with suggested structure pre-filled as a template
- "Save & Continue" / "Skip, I'll add this later"

**Step 4 — Done**
- Brief feature tour (3 swipe cards: Log → Progress → Coach)
- "Let's go" → lands on Log tab

### 5.2 Google Sheets CSV Import

**Expected CSV format:**

```
Date,Workout,Exercise,Set,Reps,Weight_lbs,Volume,Notes
2026-06-11,Arm A,Barbell Curl,1,12,130,1560,
2026-06-11,Arm A,Barbell Curl,2,12,130,1560,
```

**Import logic:**

1. Parse CSV rows
2. Group by `Date` + `Workout` → one `logged_session` per unique Date+Workout pair
3. Within each session, group by `Exercise` → one exercise entry with sets array
4. Each row → one set: `{ setNumber: Set, reps: Reps, weight: Weight_lbs, notes: Notes }`
5. Body part group inferred from Workout name:
   - "Arm A" / "Arm B" → `arms`
   - "Leg Day" / "Leg A" / "Leg B" → `legs`
   - "Core" → `core`
   - Unknown → prompted to assign manually
6. Exercise definitions created automatically for any exercise name not already in library
7. Summary shown: "X sessions imported, Y exercises, Z sets" with first/last date range
8. Errors (malformed rows) listed with line numbers — skipped, not blocking

**Access:** Settings → Import from Google Sheets (also available during onboarding)

---

## 6. Claude Coach Integration

### 6.1 Context Architecture

No conversation history is maintained across sessions. Each API call is stateless from Claude's perspective. Relevant context is injected fresh on every call.

**System prompt (cached):**

```
You are a personal fitness coach assistant. Your role is to give specific, 
actionable guidance before and after workouts based on the user's health 
context, injury history, and recent training data.

Be direct and specific. Reference actual exercises, weights, and notes from 
the data. When injury or soreness is flagged, err toward caution. Keep 
responses to 150-250 words — this is read on a phone.

[HEALTH CONTEXT FILE CONTENT — changes rarely, cached after first call]
```

The health context file is appended to the system prompt. Prompt caching means after the first call, the health context portion costs almost nothing on subsequent calls.

**User message structure (per call):**

```
Recent [body part] sessions:

[Last 4 sessions of that body part group, summarized:]
[DATE] [Template name]: 
  Barbell Curl: 130×12, 130×12, 130×10 (note: shoulder tight on last set)
  Incline DB Curl: 40×12, 40×12
  ...
  Session notes: "felt strong, elbow fine"

[DATE] [Template name]:
  ...

---
Today's check-in: [user's free-text input]
```

The session summary is generated by the app from IndexedDB — not raw data dump, but a readable formatted summary. Notes are included verbatim.

**Cross-workout-type awareness:** When pulling recent sessions, the app queries by `bodyPartGroup`, not template name. An Arm B check-in includes the last 2 Arm A sessions too. Shoulder notes from Arm A surface when the user opens Arm B.

### 6.2 Pre-Workout Check-In

Triggered by user tapping "Ask Coach" on the Coach tab.

Input: user's free-text note about how they're feeling.

Context sent: health context (cached) + last 4 sessions of today's target body part + user's note.

Expected response: specific adjustments to today's session. Reference exercise names. Flag if something should be avoided. Keep under 250 words.

### 6.3 Post-Workout Debrief

Triggered after finishing a session or manually from Coach tab.

Input: the just-logged session (all exercises, sets, weights, notes) + optional user note.

Context sent: health context (cached) + just-logged session + last 3 sessions of that body part for trend context.

Expected response: what went well, what to watch, recommendation for next session. Keep under 250 words.

### 6.4 Token Budget Estimate

Per coaching interaction:
- System prompt (health context, cached): ~800 tokens → ~$0.00024 after cache
- Session summaries: ~600 tokens → ~$0.0018
- User message: ~200 tokens → ~$0.0006
- Claude response: ~400 tokens → ~$0.006
- **Total per interaction: ~$0.008**

At 3 workouts/week, 2 Coach interactions each: ~$2.50/year with Sonnet 4.6.

### 6.5 Health Project Export

Generates a text summary for pasting into personal Claude:

```
## Training Summary — [date range]

### Arms ([X] sessions)
Arm A (last: [date]): [recent volume trend]
Notable notes: [any injury/soreness notes from sessions]

Arm B (last: [date]): ...

### Legs ([X] sessions)
...

### Runs ([X] runs)
...

### Things to flag for your Health Project:
[Any repeated soreness mentions, injury notes, unusual fatigue]
```

Copies to clipboard via `navigator.clipboard.writeText()`. User pastes into personal Claude.

---

## 7. Running Integration

### 7.1 When to Run on Leg Days

The app will surface this recommendation to Claude: **lift before running on leg days**. Running first pre-fatigues the muscles needed for squats and compounds, increasing injury risk during leg rehab. The health context file should note this constraint so Claude reinforces it in coaching.

### 7.2 Run Logging

Manual entry only (Strava auto-sync deferred). Fields:
- Date (default: today)
- Distance (miles, decimal)
- Duration (mm:ss input)
- Pace (computed automatically: duration / distance)
- Perceived effort (1–10 slider)
- Notes (free text)

Accessible from: Log tab → "Log a Run", or floating action button on Legs progress view.

### 7.3 Legs Dashboard Integration

The Legs progress view shows lifting sessions and runs on the same timeline. Visual distinction: bars for lifting volume, line for run distance. This lets Marco see the combined load at a glance — important for managing leg rehab safely.

When Claude is asked about legs, the context includes both recent leg lifting sessions and recent runs.

---

## 8. Checklist Defaults

### Pre-Workout
1. Dynamic warm-up done? (arm circles, leg swings, hip rotations — 5 min)
2. Joints feel okay? (no unusual pain or clicking)
3. Hydrated?
4. Any new soreness or tightness since last session?

### Post-Workout
1. Static stretches done?
2. Hydrated?
3. Anything to note for next time?

Session rating (1–5) is a separate field on the post-workout screen, not a checklist item — because it's numeric, not binary.

**Recommended post-workout stretches (defaults, editable in Settings):**

*Arms days:*
- Cross-body shoulder stretch — 30s each side
- Overhead tricep stretch — 30s each side
- Bicep doorframe stretch — 30s each side
- Wrist flexor/extensor stretch — 30s each direction

*Legs days:*
- Standing quad stretch — 30s each side
- Standing hamstring stretch (forward fold) — 60s
- Hip flexor lunge stretch — 45s each side
- Calf stretch against wall — 30s each side
- Seated piriformis stretch — 45s each side

*Core days:*
- Child's pose — 60s
- Cat-cow — 10 reps
- Supine spinal twist — 45s each side
- Cobra pose — 30s

All checklist items and stretch lists are editable in Settings → Post-Workout Checklist.

---

## 9. UI/UX Direction

**To be finalized in a Claude Design session.**

Known decisions:
- **Primary color:** Navy blue (exact hex TBD in design session)
- **Mobile-first:** All interactive elements min 48px tap target
- **Dark mode:** Dark background preferred (gym environment, battery life)
- **Typography:** Clean sans-serif, high contrast for readability in dim light
- **iPhone safe areas:** Bottom nav above home indicator, top content below notch

**Design session inputs to bring:**
- Color palette: navy primary + one accent color (suggest options: gold/amber, teal, or electric blue)
- Chart color scheme
- Card and input field visual treatment
- Navigation bar style (translucent vs solid)

---

## 10. Out of Scope

- Strava API integration (deferred — manual run logging for now)
- Any backend, database, or cloud sync
- Multi-user or sharing features
- Calorie / nutrition tracking
- Body weight / measurements tracking
- Apple Health / HealthKit integration
- Push notifications
- Heart rate or wearable integration
- AI-generated workout programs (Claude advises, Marco decides)
