/**
 * tenantImport — reads a backup file from an older app and turns it into a
 * clean, ready-to-save company (used by the Admin page's "Import company").
 *
 * Input: the JSON made by public/export-bluebell.html
 *   { sourceProject, account, events: [{ id, data }], config: [{ id, data }] }
 *
 * Pure functions, no Firebase — the actual saving is adminImportCompany()
 * in AppContext. Covered by tests/tenantImport.test.mjs.
 */

// ============================================================
// CONSTANTS
// ============================================================

/** Settings fields from the old app that the new app no longer uses */
const DROP_SETTINGS = ['sheetSyncUrl', 'sheetSyncSecret', 'sheetViewUrl'];

/** Event fields from the old app that the new app no longer uses
 *  (profit was just a copy of the total — real profit now comes from the Job Log) */
const DROP_EVENT = ['sheetSyncedAt', 'profit'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================
// HELPERS
// ============================================================

/** Undoes the export's { __timestamp: ISO } wrapper — the app stores dates as ISO strings */
function unwrapDates(v) {
  if (Array.isArray(v)) return v.map(unwrapDates);
  if (v && typeof v === 'object') {
    if (typeof v.__timestamp === 'string' && Object.keys(v).length === 1) return v.__timestamp;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unwrapDates(x)]));
  }
  return v;
}

const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/** "Blue Bell Events!" → "blue-bell-events" (company id in the database) */
export function slugify(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Splits a box of emails (one per line, or commas) into clean lower-case addresses */
export function parseEmails(text) {
  const all = String(text || '').split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
  return { valid: [...new Set(all.filter(e => EMAIL_RE.test(e)))], invalid: all.filter(e => !EMAIL_RE.test(e)) };
}

// ============================================================
// MAIN — parse a backup file
// ============================================================

/**
 * Checks and cleans a backup. Returns
 *   { ok: true, companyName, settings, categories, events, counts }
 * or { ok: false, error } with a message the admin can act on.
 */
export function parseBackup(json) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return { ok: false, error: 'This file isn’t a valid backup (couldn’t read it as JSON).' };
  }
  if (!data || !Array.isArray(data.events) || !Array.isArray(data.config)) {
    return { ok: false, error: 'This doesn’t look like an EventScope backup file.' };
  }

  const configDoc = (id) => data.config.find(c => c?.id === id)?.data || null;
  const rawSettings = configDoc('settings');
  const rawCategories = configDoc('categories');
  if (!rawSettings) return { ok: false, error: 'The backup has no company settings — was it exported from the right account?' };

  const settings = omit(unwrapDates(rawSettings), DROP_SETTINGS);
  const categories = Array.isArray(rawCategories?.list) ? unwrapDates(rawCategories.list) : null;

  const events = [];
  for (const e of data.events) {
    if (!e?.id || typeof e.id !== 'string' || e.id.includes('/') || !e.data) {
      return { ok: false, error: 'The backup has a damaged event record — please export it again.' };
    }
    events.push({ id: e.id, data: omit(unwrapDates(e.data), DROP_EVENT) });
  }

  const byStatus = events.reduce((acc, e) => {
    const s = e.data.status || 'draft';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return {
    ok: true,
    companyName: settings.companyName || '',
    sourceProject: data.sourceProject || '',
    settings,
    categories,
    events,
    counts: {
      events: events.length,
      bills: events.filter(e => e.data.billDetails).length,
      categories: categories?.length || 0,
      byStatus,
    },
  };
}
