/**
 * push — turning event-reminder notifications on/off for THIS device.
 *
 * Uses Firebase Cloud Messaging (free). The browser gives us a "push token"
 * for this device; AppContext saves it under the company
 * (tenants/{id}/pushTokens) and the daily Google script
 * (tools/drive-backup/Reminders.gs) sends reminders to those tokens.
 * public/sw.js shows them — even when the app is closed.
 *
 * iPhone: only works for the app added to the Home Screen (iOS 16.4+).
 * No Firestore here — saving/removing the token is in AppContext.
 */

// ============================================================
// IMPORTS
// ============================================================
import app from '../firebase';

// ============================================================
// CONSTANTS
// ============================================================
const KEY = 'eventscope-push-token-id';   // this device's saved token doc id (localStorage)

// ============================================================
// SUPPORT / STATUS
// ============================================================

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/**
 * 'on' | 'off' | 'blocked' | 'ios-install' | 'unsupported' for this device.
 * ios-install = iPhone/iPad in Safari: must be added to the Home Screen first.
 */
export function pushStatus() {
  if (isIOS() && !isStandalone()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  return Notification.permission === 'granted' && saved ? 'on' : 'off';
}

/** sha-256 of the token → a short, safe document id */
async function tokenId(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

// ============================================================
// TURN ON / OFF
// ============================================================

/**
 * Asks permission (must run from a tap), gets this device's push token.
 * Returns { id, token } to save, or throws with a friendly message.
 */
export async function requestPushToken() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications weren’t allowed. You can allow them later in your browser or phone settings.');
  const [{ getMessaging, getToken, isSupported }, reg] = await Promise.all([
    import('firebase/messaging'),
    navigator.serviceWorker.ready,
  ]);
  if (!(await isSupported())) throw new Error('This browser can’t receive reminders.');
  const token = await getToken(getMessaging(app), { serviceWorkerRegistration: reg });
  if (!token) throw new Error('Couldn’t set up reminders on this device — please try again.');
  return { id: await tokenId(token), token };
}

/** Remembers / forgets which token doc belongs to this device */
export function rememberTokenId(id) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}
export function savedTokenId() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** Stops this device's token from receiving anything (best effort) */
export async function dropPushToken() {
  try {
    const { getMessaging, deleteToken } = await import('firebase/messaging');
    await deleteToken(getMessaging(app));
  } catch { /* already gone */ }
}

/** Shows a local notification right away — confirms this device displays them */
export async function showTestNotification() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('EventScope reminders are on', {
    body: 'You’ll get a reminder 2 days before each confirmed event, and on the day, at 9 am.',
    icon: import.meta.env.BASE_URL + 'icons/icon-192.png',
    tag: 'eventscope-test',
  });
}

/** Short description of the device, stored with the token (helps tidy up later) */
export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  return `${os} · ${br}${isStandalone() ? ' (installed)' : ''}`;
}
