/**
 * Unit tests — money, bill and Job Log math in src/utils/helpers.js
 *
 * Pure functions, no Firebase or network: `npm run test:unit`.
 * These numbers end up on bills and in profit reports, so every rule the
 * Bill page and Job Log rely on is pinned down here.
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMoney, calcGST, roundOff, getEventBill, getEventRevenue,
  computeEventFinancials, inviteKey, genInvoiceNo, nextInvoiceNo,
  functionDays, functionEnd, formatDateRange, functionDateText, itemDays, lineAmount, usesDays,
  computeSectionTotal, getAllEventDates, getEventSections, parseDiscount, parseMoneyExpr,
} from '../src/utils/helpers.js';

// ============================================================
// CONSTANTS
// ============================================================
const COLS = [
  { id: 'labour', label: 'Labour', type: 'cost' },
  { id: 'vendors', label: 'Paid to vendors', type: 'cost' },
  { id: 'commReceived', label: 'Vendor commissions received', type: 'income' },
  { id: 'notes', label: 'Notes', type: 'text' },
];

// ============================================================
// PARSING
// ============================================================
test('parseMoney accepts the ways people type amounts', () => {
  assert.equal(parseMoney('148000'), 148000);
  assert.equal(parseMoney('1,48,000'), 148000);
  assert.equal(parseMoney('₹1,48,000'), 148000);
  assert.equal(parseMoney('Rs. 2500'), 2500);
  assert.equal(parseMoney(' 99.5 '), 99.5);
  assert.equal(parseMoney(1200), 1200);
});

test('parseMoney treats blanks as empty and rejects words', () => {
  for (const blank of ['', '   ', '-', '—', null, undefined]) assert.equal(parseMoney(blank), null);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('12abc'), null);
});

// ============================================================
// GST & ROUNDING
// ============================================================
test('calcGST splits intra-state into CGST+SGST, inter-state into IGST', () => {
  assert.deepEqual(calcGST(1000, 18, false), { cgst: 90, sgst: 90, igst: 0, tax: 180, total: 1180 });
  assert.deepEqual(calcGST(1000, 18, true), { cgst: 0, sgst: 0, igst: 180, tax: 180, total: 1180 });
  assert.deepEqual(calcGST(1000, 0), { cgst: 0, sgst: 0, igst: 0, tax: 0, total: 1000 });
});

test('roundOff rounds to the rupee and reports the difference', () => {
  assert.deepEqual(roundOff(1180.4), { rounded: 1180, diff: -0.4 });
  assert.deepEqual(roundOff(1180.5), { rounded: 1181, diff: 0.5 });
});

// ============================================================
// BILL SUMMARY (must match the Bill page)
// ============================================================
test('getEventBill: revenue = subtotal − discount, GST on top, balance after advance', () => {
  const ev = {
    totalAmount: 485000,
    billDetails: { invoiceNo: 'INV-1', discount: 15000, advance: 300000, gstEnabled: true, gstRate: 18, interState: false },
  };
  const b = getEventBill(ev);
  assert.equal(b.subtotal, 485000);
  assert.equal(b.revenue, 470000);
  assert.equal(b.gst, 84600);
  assert.equal(b.billTotal, 554600);
  assert.equal(b.advance, 300000);
  assert.equal(b.balance, 254600);
  assert.equal(b.invoiceNo, 'INV-1');
  assert.equal(b.hasBill, true);
  assert.equal(getEventRevenue(ev), 470000);
});

test('getEventBill: no bill yet → no GST, whole amount due', () => {
  const b = getEventBill({ totalAmount: 120000 });
  assert.equal(b.revenue, 120000);
  assert.equal(b.gst, 0);
  assert.equal(b.billTotal, 120000);
  assert.equal(b.balance, 120000);
  assert.equal(b.hasBill, false);
});

test('getEventBill: overpayment never shows a negative balance; discount never makes revenue negative', () => {
  assert.equal(getEventBill({ totalAmount: 1000, billDetails: { advance: 5000 } }).balance, 0);
  assert.equal(getEventBill({ totalAmount: 1000, billDetails: { discount: 5000 } }).revenue, 0);
});

test('getEventBill: falls back to item prices when no total was saved', () => {
  const ev = { itemPrices: { 'main::Stage': { qty: 2, rate: 1000 }, 'main::Lights': { qty: 1, rate: 500 } } };
  assert.equal(getEventBill(ev).revenue, 2500);
});

test('getEventBill: copes with empty/odd events', () => {
  assert.equal(getEventBill({}).revenue, 0);
  assert.equal(getEventBill(undefined).revenue, 0);
  assert.equal(getEventBill({ itemPrices: 'bad' }).revenue, 0);
});

// ============================================================
// JOB LOG PROFIT
// ============================================================
test('computeEventFinancials: profit = revenue + income − costs; notes ignored', () => {
  const r = computeEventFinancials(100000, { labour: 20000, vendors: 30000, commReceived: 5000, notes: 'paid in cash' }, COLS);
  assert.equal(r.totalCost, 50000);
  assert.equal(r.income, 5000);
  assert.equal(r.profit, 55000);
  assert.equal(r.margin, 55);
  assert.equal(r.hasAny, true);
});

test('computeEventFinancials: nothing entered → "pending" (hasAny false)', () => {
  assert.equal(computeEventFinancials(100000, {}, COLS).hasAny, false);
  assert.equal(computeEventFinancials(100000, { notes: 'only a note' }, COLS).hasAny, false);
  assert.equal(computeEventFinancials(100000, { labour: null, vendors: '' }, COLS).hasAny, false);
});

test('computeEventFinancials: losses and zero revenue', () => {
  const loss = computeEventFinancials(10000, { labour: 15000 }, COLS);
  assert.equal(loss.profit, -5000);
  assert.equal(loss.margin, -50);
  assert.equal(computeEventFinancials(0, { labour: 100 }, COLS).margin, null);
});

test('computeEventFinancials: only counts the columns passed in (removed columns excluded)', () => {
  const active = COLS.filter(c => c.id !== 'vendors');
  assert.equal(computeEventFinancials(100000, { labour: 10000, vendors: 90000 }, active).totalCost, 10000);
});

// ============================================================
// IDS
// ============================================================
test('inviteKey normalises emails so invites match regardless of case/spaces', () => {
  assert.equal(inviteKey('  Anu.Planner@Gmail.com '), 'anu.planner@gmail.com');
  assert.equal(inviteKey(undefined), '');
});

test('genInvoiceNo uses a neutral default prefix', () => {
  assert.match(genInvoiceNo(undefined, 0), /^INV-/);
});

test('nextInvoiceNo never repeats a number in the same financial year', () => {
  const oct26 = new Date('2026-10-08');
  const evs = [
    { billDetails: { invoiceNo: 'BB-B2C2627-001' } },
    { billDetails: { invoiceNo: 'BB-B2C2627-007' } },  // typed by hand
    { billDetails: { invoiceNo: 'BB-B2C2526-050' } },  // last financial year
    { billDetails: { invoiceNo: 'XX-B2C2627-099' } },  // other prefix
    { status: 'draft' },
  ];
  assert.equal(nextInvoiceNo('BB', evs, oct26), 'BB-B2C2627-008');
  assert.equal(nextInvoiceNo('BB', [], oct26), 'BB-B2C2627-001');
  assert.equal(nextInvoiceNo('BB', evs, new Date('2027-04-02')), 'BB-B2C2728-001'); // new year restarts
});

// ============================================================
// MULTI-DAY FUNCTIONS AND DAYS ON ITEMS
// ============================================================

test('functionDays: single date = 1; start–end counts both days; bad/backwards end = 1', () => {
  assert.equal(functionDays({ date: '2026-11-07' }), 1);
  assert.equal(functionDays({ date: '2026-11-07', endDate: '2026-11-08' }), 2);
  assert.equal(functionDays({ date: '2026-11-30', endDate: '2026-12-02' }), 3);
  assert.equal(functionDays({ date: '2026-11-07', endDate: '2026-11-07' }), 1);
  assert.equal(functionDays({ date: '2026-11-07', endDate: '2026-11-01' }), 1);
  assert.equal(functionDays({ date: '2026-11-07', endDate: '2062-11-07' }), 31);   // typo guard
  assert.equal(functionDays(null), 1);
  assert.equal(functionEnd({ date: '2026-11-07', endDate: '2026-11-08' }), '2026-11-08');
  assert.equal(functionEnd({ date: '2026-11-07', endDate: '2026-11-01' }), '2026-11-07');
});

test('formatDateRange / functionDateText read naturally', () => {
  assert.equal(formatDateRange('2026-11-07', '2026-11-08'), '7–8 Nov 2026');
  assert.equal(formatDateRange('2026-11-30', '2026-12-01'), '30 Nov – 1 Dec 2026');
  assert.equal(formatDateRange('2026-12-31', '2027-01-01'), '31 Dec 2026 – 1 Jan 2027');
  assert.equal(formatDateRange('2026-11-07', ''), '7 Nov 2026');
  assert.equal(functionDateText({ date: '2026-11-07', endDate: '2026-11-08' }), '7–8 Nov 2026 (2 days)');
  assert.equal(functionDateText({ date: '2026-11-07' }), '7 Nov 2026');
});

test('lineAmount = qty × rate × days; old prices (no days) are 1 day', () => {
  assert.equal(lineAmount({ qty: 72, rate: 75, days: 2 }), 10800);
  assert.equal(lineAmount({ qty: 72, rate: 75 }), 5400);
  assert.equal(itemDays({ days: '' }), 1);
  assert.equal(itemDays({ days: 0 }), 1);
  assert.equal(usesDays({ a: { qty: 1, rate: 5 } }), false);
  assert.equal(usesDays({ a: { qty: 1, rate: 5 }, b: { qty: 1, rate: 5, days: 3 } }), true);
});

test('section totals and the bill include days; bundles stay a fixed amount', () => {
  const prices = { 'main::Serial bulbs': { qty: 72, rate: 75, days: 2 }, 'main::Stage': { qty: 1, rate: 35000, days: 2 }, 'main::Generator': { qty: 1, rate: 8500, days: 1 } };
  assert.equal(computeSectionTotal('main', ['Serial bulbs', 'Stage', 'Generator'], prices, [], false, {}), 89300);
  const bundles = [{ id: 'b', amount: 20000, itemKeys: ['main::Stage'] }];
  assert.equal(computeSectionTotal('main', ['Serial bulbs', 'Stage'], prices, bundles, false, {}), 30800);
  assert.equal(getEventBill({ itemPrices: prices, mainEvent: { items: ['Serial bulbs'] } }).subtotal, 89300);
});

test('a multi-day function is not "past" until its last day; sections carry the range', () => {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date(); const yday = new Date(); yday.setDate(today.getDate() - 1);
  const ev = { mainEvent: { name: 'Expo', date: iso(yday), endDate: iso(today), items: ['Stage'] }, subEvents: [] };
  const [d] = getAllEventDates(ev);
  assert.equal(d.isPast, false);
  assert.equal(d.endDate, iso(today));
  const { eventGroups } = getEventSections(ev);
  assert.equal(eventGroups[0].days, 2);
  assert.equal(eventGroups[0].endDate, iso(today));
});

// ============================================================
// DISCOUNT (quote → bill)
// ============================================================
test('parseDiscount: amount, percent, blank, too big', () => {
  assert.deepEqual(parseDiscount('5000', 100000), { amount: 5000, pct: null });
  assert.deepEqual(parseDiscount('₹5,000', 100000), { amount: 5000, pct: null });
  assert.deepEqual(parseDiscount('10%', 85500), { amount: 8550, pct: 10 });
  assert.deepEqual(parseDiscount('', 1000), { amount: 0, pct: null });
  assert.deepEqual(parseDiscount('abc', 1000), { amount: 0, pct: null });
  assert.equal(parseDiscount('9999', 1000).amount, 1000);
});

test('getEventBill: uses the quote discount until the bill sets its own', () => {
  const ev = { totalAmount: 100000, quoteDetails: { discount: '10%' }, billDetails: { invoiceNo: 'INV-2' } };
  assert.equal(getEventBill(ev).revenue, 90000);
  assert.equal(getEventBill({ ...ev, billDetails: { invoiceNo: 'INV-2', discount: 2000 } }).revenue, 98000);
  assert.equal(getEventBill({ ...ev, billDetails: { invoiceNo: 'INV-2', discount: 0 } }).revenue, 100000);
});

test('parseMoneyExpr: sums in Job Log cells', () => {
  assert.deepEqual(parseMoneyExpr('12000+15000+3500'), { value: 30500, formula: '12000+15000+3500' });
  assert.deepEqual(parseMoneyExpr('₹12,000 + 500 - 200'), { value: 12300, formula: '12000+500-200' });
  assert.deepEqual(parseMoneyExpr('4500'), { value: 4500, formula: null });
  assert.deepEqual(parseMoneyExpr('-300'), { value: -300, formula: null });
  assert.deepEqual(parseMoneyExpr(''), { value: null, formula: null });
  assert.equal(parseMoneyExpr('12k'), null);
  assert.equal(parseMoneyExpr('1++2'), null);
});

test('functionDatesProblem / functionDatesToSave', async () => {
  const { functionDatesProblem, functionDatesToSave } = await import('../src/utils/helpers.js');
  assert.equal(functionDatesProblem({ date: '' }, true), 'Required');
  assert.equal(functionDatesProblem({ date: '2026-11-18', multiDay: true }), 'Choose the end date');
  assert.equal(functionDatesProblem({ date: '2026-11-18', multiDay: true, endDate: '2026-11-18' }), 'End date must be after the start date');
  assert.equal(functionDatesProblem({ date: '2026-11-01', multiDay: true, endDate: '2026-12-15' }), 'At most 31 days');
  assert.equal(functionDatesProblem({ date: '2026-11-18', multiDay: true, endDate: '2026-11-20' }), '');
  assert.deepEqual(functionDatesToSave({ date: '2026-11-18', multiDay: false, endDate: '2026-11-20' }), { date: '2026-11-18', endDate: '' });
  assert.deepEqual(functionDatesToSave({ date: '2026-11-18', multiDay: true, endDate: '2026-11-20' }), { date: '2026-11-18', endDate: '2026-11-20' });
});
