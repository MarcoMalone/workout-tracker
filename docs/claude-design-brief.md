# Workout Tracker App — UI Design Brief

## What This App Is

A personal workout logging PWA for iPhone. Users log strength training sessions and runs, view progression charts, and get AI coaching feedback before and after workouts. Think: a native-feeling fitness log that lives on the home screen.

---

## Platform & Constraints

- **Device:** iPhone (mobile-first, portrait orientation)
- **Install:** PWA — Add to Home Screen via Safari
- **Mode:** Dark mode preferred (gym lighting, battery life)
- **Tap targets:** Minimum 48px for all interactive elements
- **Safe areas:** Content respects iPhone notch (top) and home indicator (bottom)

---

## Color Direction

- **Primary:** Navy blue — deep, rich (not bright/electric). Something like `#1A3050` or `#1D3461`.
- **Accent:** One strong accent color for active states, buttons, chart highlights. Options to explore:
  - Gold/amber — premium athletic feel
  - Teal — modern fitness app feel
  - Electric blue — high-energy, high contrast on dark
- **Background:** Very dark navy or near-black (not pure black — something like `#0F1923`)
- **Surface cards:** Slightly lighter than background, subtle elevation
- **Text:** Off-white primary, muted gray secondary

---

## Navigation

Five bottom-tab navigation bar, persistent across all screens:

| Tab | Icon suggestion | Purpose |
|-----|----------------|---------|
| Log | Dumbbell or pencil | Start/continue a workout session |
| History | Clock or list | Past sessions |
| Progress | Chart/graph | Progression charts by body part |
| Coach | Sparkle or chat bubble | AI coaching check-ins |
| Settings | Gear | App configuration |

Active tab uses accent color. Inactive tabs use muted gray. Tab bar sits above iPhone home indicator with proper safe-area inset.

---

## Key Screens

### 1. Log Tab — Home State

Clean, focused. No clutter.

- Today's date, large
- Prominent "Start Workout" CTA button (full-width or large pill)
- Quick-start row: recently used workout templates as horizontally scrollable chips/cards
- "Log a Run" secondary option (smaller, below or alongside)

### 2. Log Tab — Active Workout Session

This is the most-used screen. Must be fast to interact with, one-handed.

Each exercise appears as a card:

```
┌──────────────────────────────────────┐
│ Barbell Curl (A18)          📝 Note  │
│ Previous: 130×12, 130×12, 130×10     │  ← muted, smaller text
├──────────────────────────────────────┤
│ Set 1   [  130  ] lbs  ×  [ 12 ]  ✓ │
│ Set 2   [  130  ] lbs  ×  [    ]    │
│ Set 3   [       ] lbs  ×  [    ]    │
│                    + Drop Set        │
│                    + Add Set         │
└──────────────────────────────────────┘
```

- "Previous" line: last session's sets, displayed in muted/dimmed style below exercise name
- Weight and reps are large tappable input fields — numeric keyboard
- Checkmark to mark a set complete (completed sets visually dimmed or checked)
- Note icon opens a bottom drawer for per-exercise notes
- Cards stack vertically, scroll through exercises

Bottom of screen: "Finish Workout" button, always visible (sticky).

### 3. History Tab

- Simple vertical list, newest first
- Each row: date (left), workout name (center), total volume or run distance (right)
- Filter chips at top: All / Arms / Legs / Core / Runs
- Tap a row → full session detail (all exercises, sets, weights, notes)

### 4. Progress Tab

Segmented control at top: **Arms | Legs | Core**

Each body part view contains:
- **Volume chart** — total weight lifted per session, bar chart with trend line
- **Per-exercise cards** — one card per exercise with a small line chart showing weight over time
- **Legs view** also includes run data: distance/pace over time alongside lifting sessions

Charts should feel clean, not cluttered. One primary data line, muted secondary. Date on x-axis, value on y-axis.

Date range toggle: Last 8 / Last 12 / Last 20 sessions.

### 5. Coach Tab

Three distinct sections stacked vertically:

**Pre-Workout Check-In**
- Label: "How are you feeling today?"
- Multi-line text input (large, comfortable to type in)
- "Ask Coach" primary button
- Coach response appears below in a styled response card (readable, comfortable line height)

**Post-Workout Debrief**
- Available after logging a session
- "Get Debrief" button — no required input (Claude reads the session automatically)
- Optional text input: "Anything specific?"
- Response in styled card below

**Export Summary** (bottom, secondary)
- Subtle button: "Copy training summary to clipboard"
- Copies a formatted text summary for use elsewhere

### 6. Settings Tab

List-style settings layout (iOS native feel):

Sections:
- **Coach** — API key input (masked), test connection
- **Health Notes** — large multi-line text editor (personal health context for coaching)
- **Checklists** — pre/post workout checklist items, editable list
- **Exercise Library** — searchable list, add/edit exercises
- **Workout Templates** — list of templates, tap to edit
- **Data** — Export JSON, Import JSON, Import from CSV

---

## Visual Style Reference

- **Inspiration:** Somewhere between Apple Fitness+ dark UI and a premium fitness app (Strong, Hevy). Clean, dark, purposeful. Not gamified, not loud.
- **Cards:** Slightly elevated from background, subtle border or shadow. Rounded corners (12–16px radius).
- **Typography:** Bold headings, regular body. High contrast. No tiny text.
- **Inputs:** Large, clearly tappable, with visible focus states.
- **Charts:** Minimal axes, no gridline clutter. Accent color for data lines/bars.
- **Buttons:** Full-width primary CTAs for main actions. Pill or rounded-rect shape.
- **Icons:** SF Symbols style (line icons, not filled, consistent weight)

---

## Checklist Modals

Pre-workout checklist pops as a modal sheet when starting a session:
- Each item is a large toggle row (Y/N)
- "Start Workout" button at bottom

Post-workout checklist pops as a modal sheet when finishing:
- Same toggle layout
- Session notes text field
- 1–5 star rating tap row
- "Finish" button

---

## Stretch Display (in checklist / settings)

Post-workout stretches shown as a scrollable list under the post-workout checklist. Each stretch: name + duration. Grouped by body part (Arms / Legs / Core). Tappable to mark done.

---

## Tone

Clean. Focused. Zero clutter. This is a tool, not a social app — every pixel should serve the workout. Dark and purposeful. Performance over decoration.
