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

// ============================================================
// SUGGESTIONS / ADD TO SERVICES
// ============================================================
import { serviceMatches, isService, addServiceItem, suggestCategoryId, serviceName } from '../src/utils/servicePrices.js';

test('serviceMatches: word starts first, then contains; taken left out; with price', () => {
  const cats = [{ id: 'a', name: 'AV', items: ['LED Wall', 'Projector', 'Wireless Mic', 'Mic Stand'], prices: { 'Mic Stand': { rate: 300, unit: 'day' } } }];
  assert.deepEqual(serviceMatches(cats, 'mic').map(m => m.name), ['Wireless Mic', 'Mic Stand']);
  assert.deepEqual(serviceMatches(cats, 'ro').map(m => m.name), ['Projector']);
  const t = serviceMatches(cats, 'mic', ['mic stand']);
  assert.deepEqual(t.map(m => [m.name, m.added]), [['Wireless Mic', false], ['Mic Stand', true]]);   // already in the event: last, marked
  const arch = [{ id: 'd', name: 'Decor', items: ['Church Entrance Arch', 'Entrance Arch'] }];
  assert.deepEqual(serviceMatches(arch, 'entrance arch').map(m => m.name), ['Entrance Arch', 'Church Entrance Arch']);   // exact first
  assert.deepEqual(serviceMatches(cats, 'stand')[0].price, { rate: 300, unit: 'day' });
  assert.deepEqual(serviceMatches(cats, ''), []);
  assert.equal(isService(cats, ' led wall '), true);
  assert.equal(isService(cats, 'Drone'), false);
  assert.equal(serviceName(cats, ' led wall '), 'LED Wall');
  assert.equal(serviceName(cats, 'Drone shoot '), 'Drone shoot');
});

test('addServiceItem: adds with price; duplicate refused; suggestCategoryId prefers Miscellaneous', () => {
  const cats = [{ id: 'a', name: 'AV', items: ['Mic'] }, { id: 'm', name: 'Miscellaneous', items: [] }];
  const r = addServiceItem(cats, { catId: 'm', name: ' Drone Shoot ', rate: '12,000', unit: 'event' });
  assert.deepEqual(r.categories[1], { id: 'm', name: 'Miscellaneous', items: ['Drone Shoot'], prices: { 'Drone Shoot': { rate: 12000, unit: 'event' } } });
  assert.deepEqual(addServiceItem(cats, { catId: 'a', name: 'Drone', rate: '' }).categories[0].items, ['Mic', 'Drone']);
  assert.ok(addServiceItem(cats, { catId: 'a', name: 'mic' }).error);
  assert.equal(suggestCategoryId(cats), 'm');
  assert.equal(suggestCategoryId([{ id: 'x', name: 'Decor' }]), 'x');
});

// ============================================================
// FILE IMPORT / EXPORT
// ============================================================
import { parseServicesFile, servicesToCsv } from '../src/utils/servicePrices.js';

test('parseServicesFile: CSV with quotes, units, blank prices; duplicates skipped', () => {
  const csv = 'Category,Icon,Item,Price,Unit\nLighting,💡,Serial Lights,70,item\nLighting,💡,"Oil, Lamp Wick, Match box",,\nScreens,🔊,LED Wall,110,sq ft\nScreens,🔊,serial lights,5,\nPower,⚡,Generator 3KV,"1,400",per day\n';
  const r = parseServicesFile(csv);
  assert.equal(r.categories.length, 3);
  assert.deepEqual(r.categories[0], { name: 'Lighting', icon: '💡', items: ['Serial Lights', 'Oil, Lamp Wick, Match box'], prices: { 'Serial Lights': { rate: 70, unit: 'item' } } });
  assert.deepEqual(r.categories[1].prices, { 'LED Wall': { rate: 110, unit: 'sqft' } });
  assert.deepEqual(r.categories[2].prices['Generator 3KV'], { rate: 1400, unit: 'day' });
  assert.ok(parseServicesFile('Name,Price\nx,1').error);
  assert.ok(parseServicesFile('').error);
});

test('servicesToCsv → parseServicesFile gives the same services back', () => {
  const cats = [{ name: 'A, B', icon: '🎨', items: ['X "big"', 'Y'], prices: { 'X "big"': { rate: 500, unit: 'sqft' } } }];
  const back = parseServicesFile(servicesToCsv(cats)).categories;
  assert.deepEqual(back, [{ name: 'A, B', icon: '🎨', items: ['X "big"', 'Y'], prices: { 'X "big"': { rate: 500, unit: 'sqft' } } }]);
});
