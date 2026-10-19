/**
 * companyBackup — builds an owner's "Download full backup" file.
 *
 * Same format (eventscope-backup, version 2) as the daily Drive backup made by
 * tools/drive-backup/Code.gs, so either file can be restored the same way:
 * Admin → Import company (see parseBackup in tenantImport.js).
 *
 * Pure function, no Firebase — the reading happens in AppContext
 * (downloadCompanyBackup). Covered by tests/tenantImport.test.mjs.
 */

// ============================================================
// FILE NAME
// ============================================================

/** "Kochi Celebrations" + date → "eventscope-backup-kochi-celebrations-2026-10-09.json" */
export function backupFileName(companyName, now = new Date()) {
  const slug = String(companyName || 'company').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'company';
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return `eventscope-backup-${slug}-${d}.json`;
}

// ============================================================
// BACKUP CONTENTS
// ============================================================

/**
 * @param {object} p
 * @param {string} p.tenantId
 * @param {object} p.tenant      tenants/{id} doc
 * @param {Array<{id,data}>} p.events, p.config, p.financials, p.private, p.purchases
 * @param {Array<{uid,email,role,name}>} p.members
 * @param {Array<{email,role}>} p.invites
 */
export function buildCompanyBackup({ tenantId, tenant, events, config, financials, private: priv, purchases, members, invites, exportedAt = new Date().toISOString(), sourceProject = '' }) {
  return {
    format: 'eventscope-backup',
    version: 2,
    exportedAt,
    sourceProject,
    tenantId,
    tenant: tenant || {},
    events: events || [],
    config: config || [],
    financials: financials || [],
    members: (members || []).map(m => ({ uid: m.uid || '', email: m.email || '', role: m.role || 'staff', name: m.name || '' })),
    invites: (invites || []).map(i => ({ email: i.email, role: i.role || 'staff' })),
    // same place the daily Drive backup puts them (other sub-collections)
    other: {
      ...(priv && priv.length ? { private: priv } : {}),
      ...(purchases && purchases.length ? { purchases } : {}),
    },
  };
}
