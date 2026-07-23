// App version + human-readable changelog. Shown in Settings → About, and the
// newest entry is surfaced once when the version changes (see whatsnew.js).
// Bump APP_VERSION and prepend an entry when you ship something user-visible.
export const APP_VERSION = '1.2.0';

// Newest first. Keep entries short and plain-language — a tester reads these.
export const CHANGELOG = [
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
