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
  assert.deepEqual(r.counts, { events: 2, bills: 1, categories: 1, byStatus: { completed: 1, draft: 1 } });
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
