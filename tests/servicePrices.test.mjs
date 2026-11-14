/**
 * Unit tests — default service prices (src/utils/servicePrices.js)
 *
 * Made-up services only (no real company data).
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceOf, findDefaultPrice, startingPrice, startingPricesFor, cleanPrice, editServiceItem, saveCategoryRows, unitShort } from '../src/utils/servicePrices.js';

// ============================================================
// TEST DATA
// ============================================================
const CATS = [
  { id: 'av', name: 'Conference & AV', icon: '🎤', items: ['Projector & Screen', 'LED Wall', 'Mic'], prices: { 'Projector & Screen': { rate: 18000, unit: 'day' }, 'LED Wall': { rate: 60000, unit: 'event' } } },
  { id: 'food', name: 'Catering', icon: '🍽️', items: ['Lunch Buffet'], prices: { 'Lunch Buffet': { rate: 650, unit: 'person' } } },
  { id: 'old', name: 'Old', icon: '📦', items: ['Chairs'] },          // saved before prices existed
];

// ============================================================
// READING
// ============================================================
test('priceOf / findDefaultPrice: case ignored, old categories have none', () => {
  assert.deepEqual(priceOf(CATS[0], 'LED Wall'), { rate: 60000, unit: 'event' });
  assert.equal(priceOf(CATS[0], 'Mic'), null);
  assert.equal(priceOf(CATS[2], 'Chairs'), null);
  assert.deepEqual(findDefaultPrice(CATS, '  lunch buffet '), { rate: 650, unit: 'person' });
  assert.equal(findDefaultPrice(CATS, 'Something typed'), null);
  assert.equal(unitShort('sqft'), 'sq ft');
});

test('startingPrice: per day uses the function days, other units 1 day, no price = ₹0', () => {
  assert.deepEqual(startingPrice(CATS, 'Projector & Screen', 3), { qty: 1, rate: 18000, days: 3 });
  assert.deepEqual(startingPrice(CATS, 'LED Wall', 3), { qty: 1, rate: 60000, days: 1 });
  assert.deepEqual(startingPrice(CATS, 'Mic', 2), { qty: 1, rate: 0, days: 2 });
});

test('startingPricesFor: only items without a price yet, only items with a default', () => {
  const r = startingPricesFor(CATS, [{ id: 'main', items: ['Projector & Screen', 'Mic', 'LED Wall'], days: 2 }, { id: 's1', items: ['Lunch Buffet'], days: 1 }], { 'main::LED Wall': { qty: 2, rate: 5, days: 1 } });
  assert.deepEqual(r, { 'main::Projector & Screen': { qty: 1, rate: 18000, days: 2 }, 's1::Lunch Buffet': { qty: 1, rate: 650, days: 1 } });
});

// ============================================================
// EDITING
// ============================================================
test('cleanPrice: commas and ₹ allowed; blank, 0 and letters clear it', () => {
  assert.deepEqual(cleanPrice('₹1,40,000', 'day'), { rate: 140000, unit: 'day' });
  assert.deepEqual(cleanPrice('500', 'nonsense'), { rate: 500, unit: 'item' });
  assert.equal(cleanPrice('', 'day'), null);
  assert.equal(cleanPrice('0', 'day'), null);
  assert.equal(cleanPrice('abc', 'day'), null);
});

test('editServiceItem: set price, rename (price follows), move category, clear price', () => {
  let r = editServiceItem(CATS, { fromCat: 'av', oldName: 'Mic', toCat: 'av', name: 'Mic', rate: '1500', unit: 'day' });
  assert.deepEqual(r.categories[0].prices.Mic, { rate: 1500, unit: 'day' });
  r = editServiceItem(r.categories, { fromCat: 'av', oldName: 'Mic', toCat: 'av', name: 'Wireless Mic', rate: '1500', unit: 'day' });
  assert.deepEqual(r.categories[0].items, ['Projector & Screen', 'LED Wall', 'Wireless Mic']);
  assert.equal('Mic' in r.categories[0].prices, false);
  r = editServiceItem(r.categories, { fromCat: 'av', oldName: 'Wireless Mic', toCat: 'old', name: 'Wireless Mic', rate: '1500', unit: 'day' });
  assert.deepEqual(r.categories[0].items, ['Projector & Screen', 'LED Wall']);
  assert.deepEqual(r.categories[2].items, ['Chairs', 'Wireless Mic']);
  assert.deepEqual(r.categories[2].prices, { 'Wireless Mic': { rate: 1500, unit: 'day' } });
  r = editServiceItem(r.categories, { fromCat: 'av', oldName: 'LED Wall', toCat: 'av', name: 'LED Wall', rate: '', unit: 'event' });
  assert.equal('LED Wall' in r.categories[0].prices, false);
  assert.equal(CATS[0].items.length, 3);   // input not changed
});

test('editServiceItem: blank name and a name already in that category are refused', () => {
  assert.ok(editServiceItem(CATS, { fromCat: 'av', oldName: 'Mic', toCat: 'av', name: ' ' }).error);
  assert.match(editServiceItem(CATS, { fromCat: 'av', oldName: 'Mic', toCat: 'av', name: 'led wall' }).error, /already in Conference/);
});

test('saveCategoryRows: names, prices, new rows; empty rows dropped; twice refused', () => {
  const r = saveCategoryRows(CATS[0], { icon: '🎬', name: ' AV ', rows: [
    { oldName: 'Projector & Screen', name: 'Projector', rate: '20,000', unit: 'day' },
    { oldName: 'LED Wall', name: 'LED Wall', rate: '', unit: 'event' },
    { oldName: null, name: '', rate: '5', unit: 'day' },
    { oldName: null, name: 'Podium', rate: '3500', unit: 'event' },
  ] });
  assert.deepEqual(r.category.items, ['Projector', 'LED Wall', 'Podium']);
  assert.deepEqual(r.category.prices, { Projector: { rate: 20000, unit: 'day' }, Podium: { rate: 3500, unit: 'event' } });
  assert.equal(r.category.name, 'AV');
  assert.equal(r.category.icon, '🎬');
  assert.ok(saveCategoryRows(CATS[0], { name: 'X', rows: [{ name: 'A' }, { name: 'a' }] }).error);
});
