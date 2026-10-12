/**
 * startupTiming — records how long each step of opening the app took, so a
 * slow start on a particular phone can be pinned down from one screenshot
 * (shown small at the bottom of Settings).
 *
 * Times are seconds since the page started loading (performance.now()), so
 * they include downloading the app itself:
 *   signin  — Google sign-in state known
 *   company — the user's company is known
 *   events  — the first list of events has arrived
 * Saved in this browser only (localStorage); nothing is sent anywhere.
 */

// ============================================================
// CONSTANTS
// ============================================================
const KEY = 'eventscope-startup';
const marks = {};

// ============================================================
// RECORDING
// ============================================================

/** Notes the first time a step is reached; saves once the last step is in */
export function markStartup(step) {
  if (marks[step] != null) return;
  marks[step] = Math.round(performance.now()) / 1000;
  if (step === 'events' || step === 'signedOut') {
    try {
      const installed = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
      localStorage.setItem(KEY, JSON.stringify({ ...marks, at: new Date().toISOString(), installed }));
    } catch { /* storage blocked — timing is only a diagnostic */ }
  }
}

// ============================================================
// READING
// ============================================================

/** "Last start-up: sign-in 0.4 s · company 0.5 s · events 1.2 s (installed app)" — or '' */
export function lastStartupText() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!t) return '';
    const s = (v) => (v == null ? '–' : `${v.toFixed(1)} s`);
    return `Last start-up: sign-in ${s(t.signin)} · company ${s(t.company)} · events ${s(t.events)}${t.installed ? ' (installed app)' : ' (browser)'}`;
  } catch {
    return '';
  }
}
