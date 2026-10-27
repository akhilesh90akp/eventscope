/**
 * install — "Install app" support (add EventScope to the home screen).
 *
 * Android / Chrome / Edge send a `beforeinstallprompt` event once the app can be
 * installed; we keep it so a button can open the install box with one tap.
 * iPhone / iPad can't be installed from a button (Apple's rule), so there the
 * button shows the Add to Home Screen steps instead.
 *
 * No React, no Firebase. initInstall() runs once from main.jsx, early, because
 * the browser fires the event only once.
 */

// ============================================================
// STATE
// ============================================================
let deferred = null;                 // the saved install prompt (Android / Chrome / Edge)
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

// ============================================================
// DEVICE CHECKS
// ============================================================
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

// ============================================================
// PUBLIC API
// ============================================================

/** Start listening for the browser's install events (call once, at start-up) */
export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

/** 'installed' (already open as an app) | 'prompt' (one tap works) | 'ios' (show the steps) | 'none' (can't install here) */
export function installState() {
  if (isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return 'none';
}

/** Opens the browser's install box. Returns 'accepted' | 'dismissed' | 'unavailable' */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const saved = deferred;
  deferred = null;                    // an install prompt can only be used once
  saved.prompt();
  let outcome = 'dismissed';
  try { outcome = (await saved.userChoice).outcome; } catch { /* closed */ }
  notify();
  return outcome;
}

/** Call fn whenever the install state may have changed. Returns an unsubscribe function. */
export function subscribeInstall(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
