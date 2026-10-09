/**
 * Unit tests — reading a backup file for "Import company" (src/utils/tenantImport.js)
 *
 * Pure functions, no Firebase: part of `npm run test:unit`.
 * Uses a tiny made-up backup (no real client data in the repo).
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, parseEmails, slugify } from '../src/utils/tenantImport.js';

// ============================================================
// CONSTANTS — a fake backup shaped like export-bluebell.html's output
// ============================================================
const BACKUP = {
  sourceProject: 'old-app',
  events: [
    { id: 'e1', data: { status: 'completed', clientName: 'A', totalAmount: 100, profit: 100, sheetSyncedAt: 'x', createdAt: { __timestamp: '2026-01-01T00:00:00.000Z' }, billDetails: { invoiceNo: 'BB-1' } } },
    { id: 'e2', data: { status: 'draft', clientName: 'B', mainEvent: { items: ['Stage'] } } },
  ],
  config: [
    { id: 'settings', data: { companyName: 'Test Co', sheetSyncUrl: 'u', sheetSyncSecret: 's', sheetViewUrl: 'v', invoicePrefix: 'TC' } },
    { id: 'categories', data: { list: [{ name: 'Decor', items: ['Stage'] }] } },
  ],
};

// ============================================================
// parseBackup
// ============================================================
test('parseBackup cleans old-app fields and counts what will be imported', () => {
  const r = parseBackup(JSON.stringify(BACKUP));
  assert.equal(r.ok, true);
  assert.equal(r.companyName, 'Test Co');
  assert.deepEqual(r.settings, { companyName: 'Test Co', invoicePrefix: 'TC' });
  assert.deepEqual(r.categories, [{ name: 'Decor', items: ['Stage'] }]);
  assert.equal(r.events[0].data.profit, undefined);
  assert.equal(r.events[0].data.sheetSyncedAt, undefined);
  assert.equal(r.events[0].data.totalAmount, 100);
  assert.equal(r.events[0].data.createdAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(r.counts, { events: 2, bills: 1, categories: 1, costs: 0, byStatus: { completed: 1, draft: 1 } });
  assert.deepEqual([r.owners, r.staff, r.financials, r.jobLogColumns, r.tenantId], [[], [], [], null, '']); // v1 has none of these
});

test('parseBackup reads a full EventScope backup (v2): Job Log, team and contact for a complete restore', () => {
  const v2 = {
    ...BACKUP, format: 'eventscope-backup', version: 2, tenantId: 'test-co',
    tenant: { name: 'Test Co', plan: 'pilot', status: 'active' },
    config: [...BACKUP.config, { id: 'jobLog', data: { columns: [{ id: 'labour', label: 'Labour', type: 'cost' }] } }],
    financials: [{ id: 'e1', data: { values: { labour: 1200 }, updatedAt: '2026-10-01T00:00:00Z' } }],
    members: [{ uid: 'u1', email: 'Boss@Gmail.com', role: 'owner' }, { uid: 'u2', email: 'staff@gmail.com', role: 'staff' }, { email: 'bad', role: 'staff' }],
    invites: [{ email: 'new@gmail.com', role: 'staff' }, { email: 'boss@gmail.com', role: 'staff' }],
    other: { private: [{ id: 'contact', data: { recoveryEmail: 'r@gmail.com' } }] },
  };
  const r = parseBackup(v2);
  assert.equal(r.ok, true);
  assert.deepEqual([r.tenantId, r.tenantName, r.plan], ['test-co', 'Test Co', 'pilot']);
  assert.deepEqual(r.jobLogColumns, [{ id: 'labour', label: 'Labour', type: 'cost' }]);
  assert.deepEqual(r.financials, [{ id: 'e1', data: { values: { labour: 1200 }, updatedAt: '2026-10-01T00:00:00Z' } }]);
  assert.deepEqual(r.owners, ['boss@gmail.com']);                    // lower-cased, owner wins over a staff invite
  assert.deepEqual(r.staff, ['staff@gmail.com', 'new@gmail.com']);
  assert.deepEqual(r.contact, { recoveryEmail: 'r@gmail.com' });
  assert.equal(r.counts.costs, 1);
  assert.equal(parseBackup({ ...v2, financials: [{ id: 'x/y', data: {} }] }).ok, false);
});

test('parseBackup rejects files that aren’t backups', () => {
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup({ hello: 1 }).ok, false);
  assert.equal(parseBackup({ events: [], config: [] }).ok, false); // no settings
  assert.equal(parseBackup({ ...BACKUP, events: [{ id: 'a/b', data: {} }] }).ok, false);
});

// ============================================================
// parseEmails / slugify
// ============================================================
test('parseEmails splits, lower-cases, de-duplicates and flags bad ones', () => {
  assert.deepEqual(parseEmails('A@Gmail.com\nb@gmail.com, a@gmail.com  oops'), {
    valid: ['a@gmail.com', 'b@gmail.com'],
    invalid: ['oops'],
  });
  assert.deepEqual(parseEmails(''), { valid: [], invalid: [] });
});

test('slugify makes a safe company id', () => {
  assert.equal(slugify('Blue Bell Events!'), 'blue-bell-events');
  assert.equal(slugify('  ---  '), '');
});

// ============================================================
// Owner's "Download full backup" → restore round trip
// ============================================================
import { buildCompanyBackup, backupFileName } from '../src/utils/companyBackup.js';

test('an owner backup restores everything through parseBackup', () => {
  const file = buildCompanyBackup({
    tenantId: 'test-co', tenant: { name: 'Test Co', plan: 'pilot', status: 'active' },
    events: BACKUP.events, config: [...BACKUP.config, { id: 'jobLog', data: { columns: [{ id: 'c', label: 'C', type: 'cost' }] } }],
    financials: [{ id: 'e1', data: { values: { c: 5 } } }], private: [{ id: 'contact', data: { phone: '1' } }],
    members: [{ uid: 'u1', email: 'o@x.com', role: 'owner', name: 'O', tenantId: 'test-co' }], invites: [{ email: 's@x.com', role: 'staff', tenantId: 'test-co' }],
    exportedAt: '2026-10-09T00:00:00.000Z',
  });
  const r = parseBackup(JSON.parse(JSON.stringify(file)));
  assert.equal(r.ok, true);
  assert.deepEqual([r.tenantId, r.tenantName, r.plan, r.owners, r.staff], ['test-co', 'Test Co', 'pilot', ['o@x.com'], ['s@x.com']]);
  assert.equal(r.events.length, 2);
  assert.equal(r.financials.length, 1);
  assert.deepEqual(r.contact, { phone: '1' });
  assert.equal(file.members[0].tenantId, undefined); // only email/role/name/uid are kept
  assert.match(backupFileName('Kochi Celebrations!', new Date('2026-10-09T05:00:00Z')), /^eventscope-backup-kochi-celebrations-2026-10-0\d\.json$/);
});
