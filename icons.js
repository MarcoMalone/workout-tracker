// Kinetic icon set — workout tracker
// 24x24 grid · fill:none · stroke:currentColor · stroke-width 2 · round caps + joins.
// No color, no fills: every glyph inherits the current text color, so light/dark and
// --accent / --success / --danger all work by setting `color` on the parent.
//
// Usage:
//   import { icon } from './icons.js';
//   btn.innerHTML = icon('check', 20);
//   el.innerHTML = `${icon('flame', 18)} <span>11 days</span>`;
//
// The size argument is the rendered px box (defaults to 20). Stroke stays optically
// even at 16-24px; below 16px prefer bumping to 2.25 via the `stroke` option.

const P = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const icons = {
  // --- set logging -------------------------------------------------------
  check: `<path d="M4 12.5l5.2 5.2L20 6.7"/>`,
  removeX: `<path d="M6.5 6.5l11 11"/><path d="M17.5 6.5l-11 11"/>`,
  settingsGear: `<circle cx="12" cy="12" r="3"/><path d="M12.9 2.4l.35 1.9a1.4 1.4 0 0 0 .9 1.05l.6.25a1.4 1.4 0 0 0 1.37-.2l1.5-1.2 1.93 1.93-1.2 1.5a1.4 1.4 0 0 0-.2 1.37l.25.6a1.4 1.4 0 0 0 1.05.9l1.9.35v2.74l-1.9.35a1.4 1.4 0 0 0-1.05.9l-.25.6a1.4 1.4 0 0 0 .2 1.37l1.2 1.5-1.93 1.93-1.5-1.2a1.4 1.4 0 0 0-1.37-.2l-.6.25a1.4 1.4 0 0 0-.9 1.05l-.35 1.9h-2.74l-.35-1.9a1.4 1.4 0 0 0-.9-1.05l-.6-.25a1.4 1.4 0 0 0-1.37.2l-1.5 1.2-1.93-1.93 1.2-1.5a1.4 1.4 0 0 0 .2-1.37l-.25-.6a1.4 1.4 0 0 0-1.05-.9l-1.9-.35v-2.74l1.9-.35a1.4 1.4 0 0 0 1.05-.9l.25-.6a1.4 1.4 0 0 0-.2-1.37l-1.2-1.5 1.93-1.93 1.5 1.2a1.4 1.4 0 0 0 1.37.2l.6-.25a1.4 1.4 0 0 0 .9-1.05l.35-1.9z"/>`,
  settingsSliders: `<path d="M3 7h12"/><path d="M19 7h2"/><path d="M3 17h4"/><path d="M11 17h10"/><circle cx="17" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>`,
  closeX: `<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6"/><path d="M15 9l-6 6"/>`,
  chainLink: `<path d="M9.5 17H7.5a5 5 0 0 1 0-10h2"/><path d="M14.5 7h2a5 5 0 0 1 0 10h-2"/><path d="M8.5 12h7"/>`,
  swap: `<path d="M8 4L4 8l4 4"/><path d="M4 8h16"/><path d="M16 20l4-4-4-4"/><path d="M20 16H4"/>`,
  returnArrow: `<path d="M9 14l-5-5 5-5"/><path d="M4 9h10a5 5 0 0 1 0 10h-3"/>`,
  reorder: `<path d="M7 4v16"/><path d="M3 8l4-4 4 4"/><path d="M17 20V4"/><path d="M13 16l4 4 4-4"/>`,
  dragHandle: `<path d="M7 9.5h10"/><path d="M7 14.5h10"/>`,
  arrowUp: `<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>`,
  arrowDown: `<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>`,
  rotate: `<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 4v5h-5"/>`,
  star: `<path d="M12 3l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.85 6.2 20.9l1.1-6.45-4.7-4.6 6.5-.95z"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.9 4.9l1.5 1.5"/><path d="M17.6 17.6l1.5 1.5"/><path d="M19.1 4.9l-1.5 1.5"/><path d="M6.4 17.6l-1.5 1.5"/>`,
  warning: `<path d="M10.3 3.9L2.4 17.8a1.9 1.9 0 0 0 1.65 2.85h15.9a1.9 1.9 0 0 0 1.65-2.85L13.7 3.9a1.95 1.95 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><path d="M12 17.2h.01"/>`,
  flame: `<path d="M8.6 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.05-2.15-.2-4.05 2-6 .5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.45-2.3 1-3a2.5 2.5 0 0 0 2.6 2.5z"/>`,

  // --- history & progress ------------------------------------------------
  copy: `<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5.5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.5"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 11h18"/>`,
  trash: `<path d="M3.5 6.5h17"/><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7"/><path d="M18.5 6.5l-.8 12.8a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5.5 6.5"/><path d="M10.2 11v6"/><path d="M13.8 11v6"/>`,
  backArrow: `<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>`,
  trophy: `<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 5.5H5.2a2.2 2.2 0 0 0 0 4.4H6"/><path d="M17 5.5h1.8a2.2 2.2 0 0 1 0 4.4H18"/><path d="M12 14v3.5"/><path d="M8.5 20.5h7"/><path d="M9.5 20.5c.3-1.8 1.1-2.7 2.5-3 1.4.3 2.2 1.2 2.5 3"/>`,
  trendUp: `<path d="M3 17l5.5-5.5 3.5 3.5L21 6.5"/><path d="M15.5 6.5H21v5.5"/>`,   // deltas, % change, PR notification
  trendBars: `<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8.5 20v-5"/><path d="M13 20v-9"/><path d="M17.5 20V7"/>`, // volume visualization, chart sections

  // --- settings, help & coach --------------------------------------------
  helpQuestion: `<circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 2.3-2.7 4"/><path d="M12 17.3h.01"/>`,
  mail: `<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M3.5 7l8.5 5.5L20.5 7"/>`,
  reset: `<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v5h5"/>`,
  download: `<path d="M12 3v11"/><path d="M7.5 9.5L12 14l4.5-4.5"/><path d="M4 18.5v.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5"/>`,
  upload: `<path d="M12 14V3"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M4 18.5v.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5"/>`,
  chevronDown: `<path d="M6 9.5l6 6 6-6"/>`,
  chevronUp: `<path d="M18 14.5l-6-6-6 6"/>`,
  playTriangle: `<path d="M8 5.5l11 6.5-11 6.5z"/>`,
  sparkles: `<path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z"/><path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>`,
  note: `<path d="M12 20h8"/><path d="M15.5 3.5a2.1 2.1 0 0 1 3 3L7 18l-4 1 1-4z"/>`,

  // --- already in the app, normalized to this weight ---------------------
  navLog: `<path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/>`,
  navHistory: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  navProgress: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
  navCoach: `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`,
  navSettings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>`,
  run: `<circle cx="16" cy="4" r="1.7"/><path d="M12 21l1.5-5-3-2.5 1-5 3.5 3 3 .5"/><path d="M5 14l3-.5 1.5 2.5"/>`,
  walk: `<circle cx="13" cy="4" r="1.7"/><path d="M9 21l2-6 3 2v4"/><path d="M11 15l-1-5 4 1 2 3"/>`,

  // --- alternates, kept on the bench ------------------------------------
  dragHandleDots: `<circle cx="9" cy="6" r="0.6"/><circle cx="15" cy="6" r="0.6"/><circle cx="9" cy="12" r="0.6"/><circle cx="15" cy="12" r="0.6"/><circle cx="9" cy="18" r="0.6"/><circle cx="15" cy="18" r="0.6"/>`,
  swapShuffle: `<path d="M3 7h4l10 10h4"/><path d="M18 4l3 3-3 3"/><path d="M18 14l3 3-3 3"/><path d="M3 17h4l2.5-2.5"/><path d="M14.5 9.5L17 7"/>`,
};

// Map of the emoji each glyph replaces, so a flag can fall back to the old UI.
export const emojiFallback = {
  check: '✓', removeX: '×', settingsGear: '⚙', settingsSliders: '⚙', closeX: '✕',
  chainLink: '⛓', swap: '⇄', returnArrow: '↩', reorder: '⇅', dragHandle: '⣿',
  arrowUp: '↑', arrowDown: '↓', rotate: '⟳', star: '★', sun: '☀', warning: '⚠',
  flame: '🔥', copy: '📋', calendar: '📅', trash: '🗑', backArrow: '←', trophy: '🏆',
  trendUp: '📈', trendBars: '📈', helpQuestion: '❓', mail: '✉', reset: '↺',
  download: '⬇', upload: '⬆', chevronDown: '▾', chevronUp: '▴', playTriangle: '▸',
  sparkles: '🎉', run: '🏃', walk: '🚶', note: '📝',
};

export const USE_EMOJI = false; // flip true to A/B the old emoji UI

/**
 * Returns an inline SVG string for `name`.
 * @param {string} name  key from `icons`
 * @param {number} size  rendered px box, default 20
 * @param {{stroke?: number, cls?: string, label?: string}} [opts]
 */
export function icon(name, size = 20, opts = {}) {
  if (USE_EMOJI && emojiFallback[name]) return emojiFallback[name];
  const body = icons[name];
  if (!body) { console.warn(`icon: unknown "${name}"`); return ''; }
  const sw = opts.stroke ? ` stroke-width="${opts.stroke}"` : '';
  const cls = opts.cls ? ` class="${opts.cls}"` : '';
  const a11y = opts.label
    ? ` role="img" aria-label="${opts.label}"`
    : ' aria-hidden="true" focusable="false"';
  return `<svg ${P}${sw}${cls}${a11y} width="${size}" height="${size}">${body}</svg>`;
}
