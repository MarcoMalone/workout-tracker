// App version + human-readable changelog. Shown in Settings → About, and the
// newest entry is surfaced once when the version changes (see whatsnew.js).
// Bump APP_VERSION and prepend an entry when you ship something user-visible.
export const APP_VERSION = '1.7.22';

// Newest first. Keep entries short and plain-language — a tester reads these.
export const CHANGELOG = [
  {
    v: '1.7.22',
    date: '2026-08-27',
    items: [
      'Better run graphs: mile splits now compare against your run\'s own range (fastest, slowest, and average called out) instead of flat zero-based bars, and the pace/heart-rate/cadence charts plot against distance with a scrub line you can drag, an average-pace line, and a zoomed-in pace scale.',
    ],
  },
  {
    v: '1.7.21',
    date: '2026-08-27',
    items: [
      'Open a Strava run to see its graphs — mile splits, heart rate, pace, and cadence over the run. They load from Strava the first time and are saved for next time.',
    ],
  },
  {
    v: '1.7.20',
    date: '2026-08-26',
    items: [
      'Redesigned the welcome screen to match the app — a proper dumbbell brand mark instead of the emoji, and cleaner styling across the whole first-run flow.',
    ],
  },
  {
    v: '1.7.19',
    date: '2026-08-26',
    items: [
      'Importing Strava history now replaces a run you logged by hand with the richer Strava version (heart rate, elevation, cadence) instead of leaving a duplicate. Matching runs are pre-checked as "replaces your manual entry" — uncheck any you\'d rather keep.',
    ],
  },
  {
    v: '1.7.18',
    date: '2026-08-26',
    items: [
      'The app now updates itself automatically — it checks for a new version on launch and each time you switch back to it, so it no longer gets stuck on an old version.',
    ],
  },
  {
    v: '1.7.17',
    date: '2026-08-25',
    items: [
      'Strava now connects on the installed iPhone app: tap Connect Strava, approve, then copy the code it shows and paste it in Settings → Strava → Paste connection code. (Connect now opens in a separate tab so the app no longer shows a "page not found" behind it.)',
    ],
  },
  {
    v: '1.7.14',
    date: '2026-08-25',
    items: [
      'Fixed the home-screen app icon — the app now installs to your phone as a real app (Share → Add to Home Screen) with a proper dumbbell icon.',
    ],
  },
  {
    v: '1.7.13',
    date: '2026-08-25',
    items: [
      'Strava sync is live: Settings → Strava → "Sync now" pulls new runs/walks, "Import history" backfills your past activities. Pick what to import; likely duplicates of hand-logged runs are flagged. Imported runs show HR, cadence, elevation, and a View on Strava link.',
    ],
  },
  {
    v: '1.7.12',
    date: '2026-08-25',
    items: [
      'Strava: you can now Connect your Strava account in Settings (read-only). Runs/walks syncing lands next — this is the connection step.',
    ],
  },
  {
    v: '1.7.11',
    date: '2026-08-14',
    items: [
      'New look: the emoji icons across the app are replaced with a sleek, cohesive line-icon set — buttons, controls, stats, run/walk, and headers. Theme-aware (light + dark).',
    ],
  },
  {
    v: '1.7.10',
    date: '2026-08-14',
    items: [
      'Adding a set mid-workout now pre-fills it with your last set\'s weight & reps (or, if you haven\'t logged one yet, the last time you did the exercise) — no more retyping.',
    ],
  },
  {
    v: '1.7.9',
    date: '2026-08-12',
    items: [
      'Fixed cross-exercise drop sets getting cut off — the drop\'s name now sits on its own line so weight/reps/✓ are always visible.',
      'The ⚙ gear on each exercise is now a full settings panel: start side (left- or right-first for per-side exercises), machine setup, this-workout note, and the superset link — all in one place, off the main card.',
      'Reorder exercises mid-workout — new ⇅ Reorder button next to Add Exercise (drag, supersets move together).',
      'Added "Cambered Bar Tricep Pushdowns" as its own exercise (separate from the rope version).',
    ],
  },
  {
    v: '1.7.8',
    date: '2026-08-12',
    items: [
      'Rest timer now runs off your phone\'s clock — it keeps counting while you\'re out of the app and shows the right time (or "Rest done") the moment you come back.',
      'New ⚙ Setup note per exercise: record seat height, pad/pin positions, etc. once and see them every time you log that exercise (separate from the per-workout 📝 note).',
      '"Drop into…" exercise picker now has a search box.',
    ],
  },
  {
    v: '1.7.7',
    date: '2026-08-10',
    items: [
      'Walks now record a start time too (log form + editable in History + shown in the list), matching runs.',
    ],
  },
  {
    v: '1.7.6',
    date: '2026-08-10',
    items: [
      'Logged workouts are now editable — tap a workout in History, hit "Edit sets," and fix any weight/reps (or seconds), add or remove sets, then Save.',
      'Runs now record a start time (editable in History and shown in the list) — helpful for two-a-day context.',
    ],
  },
  {
    v: '1.7.5',
    date: '2026-08-10',
    items: [
      'Runs are now editable from History — tap a run, then Edit under Stats to fix distance, duration, or effort (pace recalculates automatically).',
      'Walks are editable too: duration, speed, distance, and calories.',
    ],
  },
  {
    v: '1.7.4',
    date: '2026-08-10',
    items: [
      'Add Exercise (during a workout) now has a search box — type to filter by name or body part instead of scrolling the whole list.',
    ],
  },
  {
    v: '1.7.3',
    date: '2026-08-05',
    items: [
      'Build Me a Workout can now see your saved workouts — say "combine Legs A and Legs B" or "like Arm A but 30 min" and it uses them.',
      'Template editor: new Reorder button — drag exercises to reorder as name chips; supersets move as one block and can be unlinked there.',
    ],
  },
  {
    v: '1.7.2',
    date: '2026-07-30',
    items: [
      'Legs A: last slot is now a Nordic Hamstring Curl / Single-Leg Hamstring Curl choice (3×12) — tap the chip to switch to single-leg when there\'s no anchor.',
      'Legs B: added Leg Press (3×10–12) right after Hip Thrusts; everything else stays the same.',
    ],
  },
  {
    v: '1.7.1',
    date: '2026-07-30',
    items: [
      'Drop sets no longer show up in progress charts (they still appear in "Previous").',
      'Legs A: swapped Leg Press for Sumo Goblet Squat (3×12, 25 lb) to cut quad volume.',
    ],
  },
  {
    v: '1.7.0',
    date: '2026-07-30',
    items: [
      'Linked (superset) exercises now show their previous reps/weights and grip/variant switcher, and have a shared note.',
      'Cross-exercise drop sets: tap ⇄ on any drop to make it a different exercise (e.g. pushdowns as the drop for overhead extension).',
      'Link 3+ exercises into one circuit.',
    ],
  },
  {
    v: '1.6.1',
    date: '2026-07-23',
    items: [
      'Walk duration now accepts minutes or mm:ss (e.g. 47:23) — you can log seconds, same as runs.',
    ],
  },
  {
    v: '1.6.0',
    date: '2026-07-23',
    items: [
      'Walks & Runs now show as weekly miles bars — each week stacked by session and shaded by distance. Tap a bar to see that week\'s sessions.',
      'Removed the little 12-week grids under each exercise tab.',
    ],
  },
  {
    v: '1.5.0',
    date: '2026-07-23',
    items: [
      'Create exercise variations: check "Has variations" when adding an exercise, list the grips/angles, and it makes one linked exercise each.',
      'Group existing exercises: a new Settings tool links exercises that are variations of one movement.',
      'Add a whole variation group to a workout slot in one tap in the template editor.',
      'Arm B triceps now default to Overhead and swap to Pushdowns for bad-wrist days (tap to switch).',
      'Choice slots now always start on your main variant.',
    ],
  },
  {
    v: '1.4.1',
    date: '2026-07-23',
    items: [
      'Arm A seated rows now rotate close-grip → wide-grip, like the pulldowns.',
      'Renamed "MN Lat Pulldown (A18)" to "Neutral-Grip Lat Pulldown" and dropped the old machine code.',
    ],
  },
  {
    v: '1.4.0',
    date: '2026-07-23',
    items: [
      'Rotating grips: Arm A pulldowns now cycle close → machine-neutral → wide automatically, each its own chart. Tap to switch mid-workout.',
      'Any template slot can rotate through variants — auto-advance (grips) or choice (optional swaps). Set it up in the template editor.',
      'Added close-grip & wide-grip lat pulldown, plus landmine/bottoms-up KB press options for shoulder-stability swaps.',
      'The Ask-the-Coach builder now runs on a smarter model (Claude Sonnet 5) at the same speed.',
    ],
  },
  {
    v: '1.3.0',
    date: '2026-07-23',
    items: [
      'Progressive overload: when you hit all your reps, the exercise suggests a small weight bump next time.',
      'Progress tab now shows your weekly running and walking, not just lifting volume.',
      'Ask-the-Coach workout builder is more reliable and tells you why if it can\'t build one.',
      'Coach-built workouts reuse your existing exercises instead of making near-duplicates.',
      'New in Settings: merge duplicate exercises so their history and charts combine.',
    ],
  },
  {
    v: '1.2.0',
    date: '2026-07-23',
    items: [
      'Reworked leg days: Legs A (quad), Legs B (glute/hip), and a new Legs C (full PT + core + foot/ankle).',
      'Arm A and Arm B now finish with a short core block.',
      'Run duration accepts plain minutes or mm:ss.',
    ],
  },
  {
    v: '1.1.0',
    date: '2026-07-09',
    items: [
      'Ask the Coach to build you a workout: describe what you want and it designs one from your exercises, then starts it.',
      'Supersets: link exercises (in a template or mid-workout) and log them in rounds.',
      'Faster Progress tab and a tidier, collapsible Settings screen.',
    ],
  },
  {
    v: '1.0.0',
    date: '2026-07-08',
    items: [
      'Calmer confirmations everywhere, with one-tap Undo for deletes.',
      'New Privacy and About screens; clear your API key anytime.',
      'A backup reminder, and a preview of what a restore will change.',
    ],
  },
  {
    v: '0.9.0',
    date: '2026-07-08',
    items: [
      'Contextual help: tap any ⓘ or underlined term for a plain-language explainer.',
      'Progress charts restyled to match the rest of the app.',
    ],
  },
  {
    v: '0.8.0',
    date: '2026-07-07',
    items: [
      'Your screen stays awake during a workout, with a haptic buzz when you log a set.',
      'Bigger, glanceable rest timer and a one-tap "Repeat set".',
    ],
  },
];
