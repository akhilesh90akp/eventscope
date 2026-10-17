/**
 * Unit tests — purchases (src/utils/purchases.js)
 *
 * Made-up purchases only (no real company data).
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fyStart, fyLabel, fyRange, purchaseYears, purchasesBetween, summarizePurchases,
  sortPurchases, cleanPurchase, eventProfitBetween,
} from '../src/utils/purchases.js';

// ============================================================
// CONSTANTS
// ============================================================
const LIST = [
  { id: 'a', mode: 'total', date: '2026-09-30', amount: 70000, note: 'Onam season' },
  { id: 'b', mode: 'item', date: '2026-09-12', name: 'LED par lights', qty: 12, category: 'Lighting', amount: 24000 },
  { id: 'c', mode: 'item', date: '2026-08-28', name: 'Chairs', qty: 20, category: 'Furniture', amount: 15000 },
  { id: 'd', mode: 'item', date: '2026-03-20', name: 'Old tool kit', qty: 1, category: 'Equipment', amount: 2750 },
];

// ============================================================
// FINANCIAL YEAR
// ============================================================
test('fyStart / fyLabel / fyRange: April–March years', () => {
  assert.equal(fyStart('2026-04-01'), 2026);
  assert.equal(fyStart('2027-03-31'), 2026);
  assert.equal(fyStart('2026-03-31'), 2025);
  assert.equal(fyStart(''), null);
  assert.equal(fyLabel(2026), 'FY 2026–27');
  assert.equal(fyLabel(2099), 'FY 2099–00');
  assert.deepEqual(fyRange(2026), ['2026-04-01', '2027-03-31']);
});

test('purchaseYears: newest first, includes this year', () => {
  assert.deepEqual(purchaseYears(LIST, '2026-10-17'), [2026, 2025]);
  assert.deepEqual(purchaseYears([], '2027-01-05'), [2026]);
});

// ============================================================
// TOTALS
// ============================================================
test('purchasesBetween + summarizePurchases', () => {
  const fy = purchasesBetween(LIST, ...fyRange(2026));
  assert.equal(fy.length, 3);
  const s = summarizePurchases(fy);
  assert.equal(s.total, 109000);
  assert.equal(s.count, 3);
  assert.deepEqual(s.biggestCategory, { name: 'Lighting', amount: 24000 });
  assert.equal(s.byCategory['Total only'], 70000);
  assert.equal(purchasesBetween(LIST, '', '').length, 4);
});

test('sortPurchases: newest date first', () => {
  assert.deepEqual(sortPurchases(LIST).map(p => p.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(sortPurchases([...LIST].reverse()).map(p => p.id), ['a', 'b', 'c', 'd']);
});

// ============================================================
// CLEANING THE FORM
// ============================================================
test('cleanPurchase: total and item entries, errors', () => {
  assert.deepEqual(cleanPurchase({ date: '2026-09-30', amount: '70,000', note: ' x ' }, 'total'),
    { mode: 'total', date: '2026-09-30', name: '', qty: 1, category: '', amount: 70000, note: 'x' });
  assert.deepEqual(cleanPurchase({ date: '2026-09-12', name: ' Lights ', qty: '12', category: '', amount: '24000' }, 'item'),
    { mode: 'item', date: '2026-09-12', name: 'Lights', qty: 12, category: 'Other', amount: 24000, note: '' });
  assert.match(cleanPurchase({ date: '', amount: 5 }, 'total').error, /date/);
  assert.match(cleanPurchase({ date: '2026-01-01', amount: '0' }, 'total').error, /amount/);
  assert.match(cleanPurchase({ date: '2026-01-01', amount: '10', name: '' }, 'item').error, /bought/);
});

// ============================================================
// PROFIT AFTER PURCHASES
// ============================================================
test('eventProfitBetween: completed events with Job Log entries in the period', () => {
  const events = [
    { id: 'e1', status: 'completed', mainEvent: { date: '2026-05-10' }, totalAmount: 100000 },
    { id: 'e2', status: 'completed', mainEvent: { date: '2026-06-10' }, totalAmount: 50000 },
    { id: 'e3', status: 'confirmed', mainEvent: { date: '2026-07-10' }, totalAmount: 80000 },
    { id: 'e4', status: 'completed', mainEvent: { date: '2025-07-10' }, totalAmount: 80000 },
  ];
  const cols = [{ id: 'labour', name: 'Labour', type: 'cost' }];
  const fin = { e1: { values: { labour: 30000 } }, e4: { values: { labour: 1 } } };
  const r = eventProfitBetween(events, fin, cols, ...fyRange(2026));
  assert.deepEqual(r, { profit: 70000, profitEvents: 1, completed: 2 });
});
