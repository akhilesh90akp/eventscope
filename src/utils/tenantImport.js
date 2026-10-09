/**
 * tenantImport — reads a backup file from an older app and turns it into a
 * clean, ready-to-save company (used by the Admin page's "Import company").
 *
 * Input — either of:
 *   v1: the JSON made by public/export-bluebell.html
 *       { sourceProject, account, events: [{ id, data }], config: [{ id, data }] }
 *   v2: an EventScope backup (daily Drive backup or an owner's "Download full
 *       backup"), which adds the Job Log and the team so a restore is complete:
 *       { format: 'eventscope-backup', version: 2, tenantId, tenant,
 *         events, config (settings, categories, jobLog), financials: [{ id, data }],
 *         members: [{ email, role }], invites: [{ email, role }], other: { private: [...] } }
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

/** A Firestore document id we can safely write back (no slashes, not empty) */
const okId = (id) => typeof id === 'string' && id.length > 0 && !id.includes('/');

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
  const rawJobLog = configDoc('jobLog');
  const jobLogColumns = Array.isArray(rawJobLog?.columns) && rawJobLog.columns.length ? unwrapDates(rawJobLog.columns) : null;

  // Job Log costs/income per event (v2 only)
  const financials = [];
  for (const f of Array.isArray(data.financials) ? data.financials : []) {
    if (!okId(f?.id) || !f.data) return { ok: false, error: 'The backup has a damaged Job Log record — please use another backup.' };
    financials.push({ id: f.id, data: unwrapDates(f.data) });
  }

  // Who was in the company (v2 only) — used to pre-fill the owner/staff boxes
  const people = [...(Array.isArray(data.members) ? data.members : []), ...(Array.isArray(data.invites) ? data.invites : [])]
    .filter(m => m && EMAIL_RE.test(String(m.email || '').trim()))
    .map(m => ({ email: String(m.email).trim().toLowerCase(), role: m.role === 'owner' ? 'owner' : 'staff' }));
  const owners = [...new Set(people.filter(m => m.role === 'owner').map(m => m.email))];
  const staff = [...new Set(people.filter(m => m.role === 'staff' && !owners.includes(m.email)).map(m => m.email))];

  // Owner's private contact record (v2 only)
  const contactRaw = Array.isArray(data.other?.private) ? data.other.private.find(d => d?.id === 'contact')?.data : null;
  const contact = contactRaw && typeof contactRaw === 'object' ? unwrapDates(contactRaw) : null;

  const events = [];
  for (const e of data.events) {
    if (!okId(e?.id) || !e.data) {
      return { ok: false, error: 'The backup has a damaged event record — please export it again.' };
    }
    events.push({ id: e.id, data: omit(unwrapDates(e.data), DROP_EVENT) });
  }

  const byStatus = events.reduce((acc, e) => {
    const s = e.data.status || 'draft';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const tenant = data.tenant && typeof data.tenant === 'object' ? data.tenant : {};
  return {
    ok: true,
    companyName: settings.companyName || '',
    sourceProject: data.sourceProject || '',
    // v2 hints so a restore can reuse the original company id / name / plan
    tenantId: okId(data.tenantId) ? data.tenantId : '',
    tenantName: typeof tenant.name === 'string' ? tenant.name : '',
    plan: typeof tenant.plan === 'string' ? tenant.plan : '',
    settings,
    categories,
    jobLogColumns,
    events,
    financials,
    owners,
    staff,
    contact,
    counts: {
      events: events.length,
      bills: events.filter(e => e.data.billDetails).length,
      categories: categories?.length || 0,
      costs: financials.length,
      byStatus,
    },
  };
}
