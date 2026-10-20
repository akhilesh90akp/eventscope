/**
 * Unit tests — Fit to budget and quote revisions (src/utils/quoteFit.js)
 *
 * Made-up quotes only (no real company data).
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitUnits, fitToBudget, applyFit, makeRevision, addRevision, MAX_REVISIONS } from '../src/utils/quoteFit.js';
import { computeSectionTotal } from '../src/utils/helpers.js';

// ============================================================
// FIXTURES — a wedding: home function + main day, one group
// ============================================================
const groups = [
  { id: 'main', name: 'Wedding', items: ['Stage', 'Arch', 'Flowers', 'Chairs', 'Generator'] },
  { id: 's1', name: 'Home function', items: ['Pandal', 'Lights'] },
];
const itemPrices = {
  'main::Stage': { qty: 1, rate: 45000, days: 1 },
  'main::Arch': { qty: 1, rate: 12000, days: 1 },
  'main::Flowers': { qty: 1, rate: 6500, days: 1 },
  'main::Chairs': { qty: 200, rate: 30, days: 1 },
  'main::Generator': { qty: 1, rate: 8500, days: 1 },
  's1::Pandal': { qty: 1, rate: 18000, days: 1 },
  's1::Lights': { qty: 10, rate: 400, days: 2 },
};
const bundles = [{ id: 'b1', name: 'Stage & entrance', itemKeys: ['main::Stage', 'main::Arch', 'main::Flowers'], amount: 63500 }];
const quote = { groups, itemPrices, bundles, hidePrices: false, finalAmounts: {} };
const totalOf = (q) => q.groups.reduce((t, g) => t + computeSectionTotal(g.id, g.items, q.itemPrices, q.bundles, q.hidePrices, q.finalAmounts), 0);

// ============================================================
// fitUnits
// ============================================================
test('fitUnits: one line per group / single item, in quote order', () => {
  const u = fitUnits(quote);
  assert.deepEqual(u.map(x => x.id), ['bundle:b1', 'main::Chairs', 'main::Generator', 's1::Pandal', 's1::Lights']);
  assert.equal(u.reduce((t, x) => t + x.amount, 0), totalOf(quote));   // 63500+6000+8500+18000+8000 = 104000
  assert.equal(u.find(x => x.id === 's1::Lights').units, 20);
});

test('fitUnits: hidden prices → one line per event (its final amount); empty ones skipped', () => {
  const u = fitUnits({ ...quote, hidePrices: true, finalAmounts: { main: 80000, s1: 0 } });
  assert.deepEqual(u.map(x => [x.id, x.amount]), [['section:main', 80000]]);
});

// ============================================================
// fitToBudget
// ============================================================
test('fitToBudget: lands exactly on the target, rounded to ₹100', () => {
  const u = fitUnits(quote);
  const r = fitToBudget(u, 80000);
  assert.equal(r.ok, true);
  assert.equal(r.total, 80000);
  assert.equal(r.pct, 23);                                  // 1 − 80000/104000
  Object.entries(r.amounts).forEach(([id, a]) => { if (id !== 'bundle:b1') assert.equal(a % 100, 0, id); });
});

test('fitToBudget: locked lines keep their price, the rest come down more', () => {
  const u = fitUnits(quote);
  const r = fitToBudget(u, 80000, { locked: new Set(['main::Generator']) });
  assert.equal(r.amounts['main::Generator'], 8500);
  assert.equal(r.total, 80000);
  assert.ok(r.pct > 23);
});

test('fitToBudget: refuses impossible targets with a reason', () => {
  const u = fitUnits(quote);
  assert.equal(fitToBudget(u, 0).ok, false);
  assert.match(fitToBudget(u, 5000, { locked: new Set(['main::Generator']) }).reason, /already add up/);
  assert.match(fitToBudget(u, 90000, { locked: new Set(u.map(x => x.id)) }).reason, /locked/);
  assert.equal(fitToBudget([], 1000).ok, false);
});

test('fitToBudget: can raise prices too (negative pct)', () => {
  const r = fitToBudget(fitUnits(quote), 120000);
  assert.equal(r.total, 120000);
  assert.ok(r.pct < 0);
});

test('fitToBudget: ₹1 rounding and ₹1,000 rounding both hit the target', () => {
  [1, 1000].forEach(round => assert.equal(fitToBudget(fitUnits(quote), 77777, { round }).total, 77777));
});

// ============================================================
// applyFit
// ============================================================
test('applyFit: new rates / group price; the quote then totals the target', () => {
  const u = fitUnits(quote);
  const r = fitToBudget(u, 80000);
  const next = applyFit(quote, u, r.amounts);
  const q2 = { ...quote, ...next };
  assert.equal(Math.round(totalOf(q2)), 80000);
  assert.equal(next.bundles[0].amount, r.amounts['bundle:b1']);
  assert.equal(quote.itemPrices['main::Chairs'].rate, 30);   // original untouched
  assert.equal(next.itemPrices['s1::Lights'].qty, 10);       // qty and days kept
  assert.equal(next.itemPrices['s1::Lights'].days, 2);
});

test('applyFit: hidden prices change the final amounts', () => {
  const q = { ...quote, hidePrices: true, finalAmounts: { main: 80000, s1: 25000 } };
  const u = fitUnits(q);
  const r = fitToBudget(u, 70000);
  const next = applyFit(q, u, r.amounts);
  assert.equal(next.finalAmounts.main + next.finalAmounts.s1, 70000);
});

// ============================================================
// revisions
// ============================================================
test('makeRevision / addRevision: deep copy, newest first, capped', () => {
  const rev = makeRevision({ itemPrices, bundles, hidePrices: false, finalAmounts: {}, quoteDetails: { discount: '' }, sectionItems: { main: ['Stage'] } }, 104000, 'Original', new Date('2026-10-18T10:00:00Z'));
  assert.equal(rev.total, 104000);
  assert.equal(rev.at, '2026-10-18T10:00:00.000Z');
  rev.data.itemPrices['main::Stage'].rate = 1;
  assert.equal(itemPrices['main::Stage'].rate, 45000);
  let list = [];
  for (let i = 0; i < MAX_REVISIONS + 3; i++) list = addRevision(list, { id: String(i) });
  assert.equal(list.length, MAX_REVISIONS);
  assert.equal(list[0].id, String(MAX_REVISIONS + 2));
});
