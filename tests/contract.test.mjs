/**
 * Unit tests — contract numbers and lists (src/utils/contract.js)
 *
 * Uses a made-up event (no real client data).
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContract, nextAgreementNo, dateMinusDays } from '../src/utils/contract.js';

// ============================================================
// CONSTANTS — a wedding with a home function two days earlier
// ============================================================
const EVENT = {
  eventType: 'Wedding',
  mainEvent: { name: 'Wedding', date: '2026-11-08', time: '10:00', location: 'Church', items: ['Stage', 'Arch', 'Cake'] },
  subEvents: [{ id: 'home', name: 'Home Function', date: '2026-11-06', time: '18:00', location: 'Home', items: ['Band', 'Chairs', 'Tables'] }],
  itemPrices: {
    'main::Stage': { qty: 1, rate: 60000 }, 'main::Arch': { qty: 1, rate: 0 }, 'main::Cake': { qty: 2, rate: 1250 },
    'home::Band': { qty: 1, rate: 15000 },
  },
  bundles: [{ id: 'b1', name: 'Seating', amount: 8000, itemKeys: ['home::Chairs', 'home::Tables'] }],
};

// ============================================================
// buildContract
// ============================================================
test('functions are in date order with totals and Annexure lines', () => {
  const c = buildContract(EVENT, {}, { advance: 40000 });
  assert.deepEqual(c.functions.map(f => [f.name, f.date, f.total]), [['Home Function', '2026-11-06', 23000], ['Wedding', '2026-11-08', 62500]]);
  assert.deepEqual(c.functions[0].lines, [
    { name: 'Band', qty: 1, days: 1, amount: 15000, included: false },
    { name: 'Seating (Chairs, Tables)', qty: 1, amount: 8000, included: false },
  ]);
  assert.deepEqual(c.functions[1].lines[1], { name: 'Arch', qty: 1, days: 1, amount: 0, included: true });
  assert.equal(c.showDays, false);
  assert.deepEqual([c.price, c.advance, c.balance], [85500, 40000, 45500]);
  assert.equal(c.firstDate, '2026-11-06');
  assert.equal(c.balanceDueDate, '2026-11-05'); // default: 1 day before the first function
});

test('typed amount and due date win; balance never goes negative', () => {
  const c = buildContract(EVENT, {}, { amount: '80000', advance: '90000', balanceDueDate: '2026-11-01' });
  assert.deepEqual([c.price, c.balance, c.balanceDueDate], [80000, 0, '2026-11-01']);
});

test('company terms override the defaults', () => {
  const c = buildContract(EVENT, { contractTerms: { courtCity: 'Ernakulam', nearPct: 40, balanceDaysBefore: 3 } }, {});
  assert.equal(c.terms.courtCity, 'Ernakulam');
  assert.equal(c.terms.nearPct, 40);
  assert.equal(c.terms.farDays, 60); // untouched default
  assert.equal(c.balanceDueDate, '2026-11-03');
  assert.equal(buildContract(EVENT, { contractTerms: { nearPct: '' } }, {}).terms.nearPct, 50); // blank box → default
});

test('hidden-price quotes show quantities only, with each section’s final amount', () => {
  const c = buildContract({ ...EVENT, hidePrices: true, finalAmounts: { main: 70000, home: 30000 } }, {}, {});
  assert.equal(c.price, 100000);
  assert.ok(c.functions.every(f => f.lines.every(l => l.amount === null && !l.included)));
});

// ============================================================
// nextAgreementNo / dateMinusDays
// ============================================================
test('agreement numbers run in order per financial year', () => {
  const oct = new Date(2026, 9, 13);
  assert.equal(nextAgreementNo('KC', [], oct), 'KC-AGR-2627-001');
  const events = [{ contract: { agreementNo: 'KC-AGR-2627-004' } }, { contract: { agreementNo: 'KC-AGR-2526-009' } }, {}];
  assert.equal(nextAgreementNo('KC', events, oct), 'KC-AGR-2627-005');
  assert.equal(nextAgreementNo('KC', events, new Date(2027, 1, 1)), 'KC-AGR-2627-005'); // Feb is still FY 26-27
  assert.equal(nextAgreementNo('KC', events, new Date(2027, 3, 1)), 'KC-AGR-2728-001');
});

test('dateMinusDays crosses month ends', () => {
  assert.equal(dateMinusDays('2026-12-01', 1), '2026-11-30');
  assert.equal(dateMinusDays('', 1), '');
});

test('multi-day function: date range, Days on lines, balance due before the first day', () => {
  const ev = { ...EVENT, mainEvent: { ...EVENT.mainEvent, endDate: '2026-11-09' },
    itemPrices: { ...EVENT.itemPrices, 'main::Stage': { ...EVENT.itemPrices['main::Stage'], days: 2 } } };
  const c = buildContract(ev, {}, {});
  const w = c.functions.find(f => f.id === 'main');
  assert.deepEqual([w.date, w.endDate, w.days], ['2026-11-08', '2026-11-09', 2]);
  assert.equal(w.lines.find(l => l.name === 'Stage').days, 2);
  assert.equal(c.showDays, true);
  assert.equal(c.balanceDueDate, '2026-11-05');
});

// ============================================================
// Quote discount
// ============================================================
test('buildContract: default price takes off the quote discount', () => {
  const c = buildContract({ ...EVENT, quoteDetails: { discount: '10%' } });
  assert.equal(c.quoteDiscount, Math.round(c.quoteTotal * 0.1));
  assert.equal(c.price, c.quoteTotal - c.quoteDiscount);
  const typed = buildContract({ ...EVENT, quoteDetails: { discount: '5000' } }, {}, { amount: 90000 });
  assert.equal(typed.price, 90000);
});
