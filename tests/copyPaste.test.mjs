/**
 * Unit tests — Duplicate event and Copy / Paste quote items (src/utils/copyPaste.js)
 *
 * Made-up events only (no real company data).
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateEventData, copyQuoteItems, pasteQuoteItems, clipItemCount } from '../src/utils/copyPaste.js';

// ============================================================
// TEST DATA
// ============================================================
const EV = {
  id: 'e1', status: 'completed', createdAt: 'x', updatedAt: 'y',
  clientName: 'Test Family', clientPhone: '9000000000', eventType: 'Wedding', notes: 'n',
  mainEvent: { name: 'Wedding', date: '2026-11-08', items: ['Stage', 'Lights', 'Chairs'] },
  subEvents: [{ id: 's1', name: 'Haldi', date: '2026-11-07', items: ['Stage', 'Flowers'] }],
  itemPrices: { 'main::Stage': { qty: 1, rate: 5000, days: 1 }, 'main::Lights': { qty: 10, rate: 100, days: 2 }, 'main::Chairs': { qty: 50, rate: 20, days: 1 }, 's1::Stage': { qty: 1, rate: 2000, days: 1 }, 's1::Flowers': { qty: 3, rate: 300, days: 1 } },
  bundles: [{ id: 'b1', name: 'Stage pack', itemKeys: ['main::Stage', 'main::Lights'], amount: 6500 }],
  quoteDetails: { gstEnabled: true, gstRate: '18', discount: '10%', revisedLabel: true },
  quoteRevisions: [{ at: 'z' }], billDetails: { invoiceNo: 'X-1' }, contract: { agreementNo: 'A-1' },
};
const GROUPS = [{ id: 'main', name: 'Wedding', items: EV.mainEvent.items }, { id: 's1', name: 'Haldi', items: EV.subEvents[0].items }];

// ============================================================
// DUPLICATE
// ============================================================
test('duplicate: "(Copy)" name, quote kept, bill / contract / versions / status left out', () => {
  const d = duplicateEventData(EV);
  assert.equal(d.clientName, 'Test Family (Copy)');
  assert.deepEqual(d.mainEvent, EV.mainEvent);
  assert.deepEqual(d.itemPrices, EV.itemPrices);
  assert.deepEqual(d.bundles, EV.bundles);
  assert.equal(d.quoteDetails.discount, '10%');
  assert.equal(d.quoteDetails.revisedLabel, false);
  for (const k of ['id', 'status', 'createdAt', 'updatedAt', 'billDetails', 'contract', 'quoteRevisions']) assert.equal(k in d, false, k);
  assert.equal(d.copiedFrom, 'e1');
});

test('duplicate: the original is not changed', () => {
  const before = JSON.stringify(EV);
  const d = duplicateEventData(EV);
  d.mainEvent.items.push('X');
  assert.equal(JSON.stringify(EV), before);
});

// ============================================================
// COPY / PASTE
// ============================================================
const clip = copyQuoteItems({ groups: GROUPS, itemPrices: EV.itemPrices, bundles: EV.bundles, eventId: 'e1', from: 'Test Family' });

test('copy: every event with its items, prices and groups', () => {
  assert.equal(clipItemCount(clip), 5);
  assert.deepEqual(clip.sections[0].items[1], { name: 'Lights', qty: 10, rate: 100, days: 2 });
  assert.deepEqual(clip.sections[0].groups, [{ name: 'Stage pack', amount: 6500, items: ['Stage', 'Lights'] }]);
  assert.equal(clip.sections[1].groups.length, 0);
});

test('paste into one event: adds items and the group, skips names already there', () => {
  const target = { sectionItems: { main: ['Chairs'] }, itemPrices: { 'main::Chairs': { qty: 5, rate: 1, days: 1 } }, bundles: [] };
  const r = pasteQuoteItems(target, clip, [{ from: 0, to: 'main' }, { from: 1, to: 'main' }], () => 'nb');
  assert.deepEqual(r.sectionItems.main, ['Chairs', 'Stage', 'Lights', 'Flowers']);
  assert.equal(r.added, 3);
  assert.equal(r.skipped, 2);                       // Chairs (already there) + Haldi's Stage (same name)
  assert.deepEqual(r.itemPrices['main::Chairs'], { qty: 5, rate: 1, days: 1 });   // existing price untouched
  assert.deepEqual(r.itemPrices['main::Lights'], { qty: 10, rate: 100, days: 2 });
  assert.deepEqual(r.bundles, [{ id: 'nb', name: 'Stage pack', itemKeys: ['main::Stage', 'main::Lights'], amount: 6500 }]);
});

test('paste: a group with fewer than 2 new items is not made', () => {
  const target = { sectionItems: { main: ['Lights'] }, itemPrices: {}, bundles: [] };
  const r = pasteQuoteItems(target, clip, [{ from: 0, to: 'main' }]);
  assert.equal(r.bundles.length, 0);
});

test('paste each event into the matching event', () => {
  const target = { sectionItems: { main: [], s9: [] }, itemPrices: {}, bundles: [] };
  const r = pasteQuoteItems(target, clip, [{ from: 0, to: 'main' }, { from: 1, to: 's9' }]);
  assert.deepEqual(r.sectionItems.s9, ['Stage', 'Flowers']);
  assert.equal(r.added, 5);
  assert.deepEqual(r.itemPrices['s9::Flowers'], { qty: 3, rate: 300, days: 1 });
});
