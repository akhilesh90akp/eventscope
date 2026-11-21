/**
 * Unit tests — Day sheet and Staff & wages money rules (src/utils/staffCosts.js)
 *
 * Pure functions, no Firebase: `npm run test:unit`. These figures decide what
 * staff are paid and what each event earned, so every rule is pinned down here,
 * including the sample day the mockups were checked against (14 Nov: 3 events).
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitRupees, daysInMonth, datesOfMonth, monthlyDayCost, dayPay, overtimePay,
  computeDay, staffMonth, advanceStatus, computeMonth,
} from '../src/utils/staffCosts.js';

// ============================================================
// SAMPLE STAFF (made up)
// ============================================================
const BIJU = { id: 'biju', name: 'Biju K', pay: 'monthly', amount: 30000, worksIn: 'events', ot: { mode: 'hour', rate: 100 } };
const RAFEEQ = { id: 'rafeeq', name: 'Rafeeq M', pay: 'monthly', amount: 27000, worksIn: 'events', ot: { mode: 'hour', rate: 100 } };
const MANOJ = { id: 'manoj', name: 'Manoj S', pay: 'monthly', amount: 24000, worksIn: 'events', ot: { mode: 'hour', rate: 80 } };
const SANTHOSH = { id: 'santhosh', name: 'Santhosh P', pay: 'daily', amount: 1000, worksIn: 'events', ot: { mode: 'hour', rate: 100 } };
const ANIL = { id: 'anil', name: 'Anil T', pay: 'daily', amount: 900, worksIn: 'events', ot: { mode: 'night', rate: 300 } };
const VINOD = { id: 'vinod', name: 'Vinod R', pay: 'daily', amount: 800, worksIn: 'events' };
const PRIYA = { id: 'priya', name: 'Priya N', pay: 'monthly', amount: 18000, worksIn: 'office' };
const ALL = [BIJU, RAFEEQ, MANOJ, SANTHOSH, ANIL, VINOD, PRIYA];
const SUM = (a) => a.reduce((t, x) => t + x, 0);

// ============================================================
// ROUNDING
// ============================================================
test('splitRupees: whole rupees, leftover to the first parts, always adds up', () => {
  assert.deepEqual(splitRupees(27300, 3), [9100, 9100, 9100]);
  assert.deepEqual(splitRupees(4300, 3), [1434, 1433, 1433]);
  assert.deepEqual(splitRupees(10, 3), [4, 3, 3]);
  assert.deepEqual(splitRupees(0, 2), [0, 0]);
  assert.deepEqual(splitRupees(100, 0), []);
  for (const [t, n] of [[1, 7], [99999, 13], [5, 5], [7, 2]]) assert.equal(SUM(splitRupees(t, n)), t);
});

test('monthly salary: ÷ days in that month, month always adds up to the salary', () => {
  assert.equal(daysInMonth(2026, 11), 30); assert.equal(daysInMonth(2026, 12), 31); assert.equal(daysInMonth(2027, 2), 28); assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(monthlyDayCost(30000, '2026-11-14'), 1000);
  assert.equal(monthlyDayCost(30000, '2026-12-01'), 968); assert.equal(monthlyDayCost(30000, '2026-12-31'), 967);
  for (const [salary, month] of [[30000, '2026-11'], [30000, '2026-12'], [30000, '2027-02'], [30000, '2028-02'], [27000, '2026-12'], [18001, '2027-01'], [24999, '2027-02']]) {
    assert.equal(SUM(datesOfMonth(month).map(d => monthlyDayCost(salary, d))), salary, `${salary} in ${month}`);
  }
});

test('day pay and overtime', () => {
  assert.equal(dayPay(RAFEEQ, '2026-11-14'), 900); assert.equal(dayPay(MANOJ, '2026-11-14'), 800);
  assert.equal(dayPay(SANTHOSH, '2026-11-14'), 1000);
  assert.equal(overtimePay(BIJU, 2), 200); assert.equal(overtimePay(SANTHOSH, 3), 300);
  assert.equal(overtimePay(ANIL, 4), 300, 'fixed per late night, whatever the hours');
  assert.equal(overtimePay(ANIL, 0), 0); assert.equal(overtimePay(VINOD, 3), 0, 'no overtime rate set');
  assert.equal(overtimePay(BIJU, 1.5), 150);
});

// ============================================================
// ONE DAY — the 14 Nov sample (3 events) the mockups were checked on
// ============================================================
const SHEET14 = {
  staff: { biju: { where: 'events', otHours: 2 }, rafeeq: { where: 'events' }, santhosh: { where: 'events', otHours: 3 }, anil: { where: 'events' }, vinod: { where: 'warehouse' }, manoj: { where: 'leave' } },
  costs: [{ label: 'Food', amount: 3000, column: 'other' }, { label: 'Truck fuel', amount: 4000, column: 'transport' }, { label: 'Mini truck fuel', amount: 2000, column: 'transport' }, { label: 'Small shopping', amount: 14000, column: 'other' }, { label: 'Other', amount: '', column: 'other' }],
};
test('computeDay: 14 Nov sample matches the checked mockups', () => {
  const d = computeDay({ date: '2026-11-14', staff: ALL, sheet: SHEET14, eventIds: ['e11', 'e12', 'e13'] });
  assert.deepEqual(d.rows.map(r => [r.id, r.where, r.total]), [['biju', 'events', 1200], ['rafeeq', 'events', 900], ['manoj', 'leave', 800], ['santhosh', 'events', 1300], ['anil', 'events', 900], ['vinod', 'warehouse', 800]]);
  assert.equal(d.staffAtEvents, 4300); assert.equal(d.running, 1600); assert.equal(d.shared, 23000);
  assert.equal(d.eventDay, 27300); assert.equal(d.total, 28900); assert.deepEqual(d.each, [9100, 9100, 9100]);
  assert.deepEqual(d.shares.e11, { labour: 1434, other: 5666, transport: 2000 });
  assert.deepEqual(d.shares.e12, { labour: 1433, other: 5667, transport: 2000 });
  // every column total and every event share matches the day exactly
  const col = (c) => SUM(Object.values(d.shares).map(s => s[c] || 0));
  assert.equal(col('labour'), 4300); assert.equal(col('transport'), 6000); assert.equal(col('other'), 17000);
  for (const [i, id] of ['e11', 'e12', 'e13'].entries()) assert.equal(SUM(Object.values(d.shares[id])), d.each[i]);
  assert.ok(!d.rows.some(r => r.id === 'priya'), 'office staff are never part of a day');
});

test('computeDay: uneven splits still add up to the rupee', () => {
  const sheet = { staff: { biju: { where: 'events', otHours: 1 } }, costs: [{ amount: 1001, column: 'transport' }, { amount: 2, column: 'other' }] };
  const d = computeDay({ date: '2026-12-05', staff: [BIJU, RAFEEQ], sheet, eventIds: ['a', 'b', 'c'] });
  // Dec: Biju 968 + 100 OT, Rafeeq (not on sheet, monthly) defaults to events: 27000/31 → 871 on 5 Dec
  assert.equal(d.staffAtEvents, 968 + 100 + 871);
  assert.equal(SUM(d.each), d.eventDay);
  for (const c of ['labour', 'transport', 'other']) assert.equal(SUM(Object.values(d.shares).map(s => s[c] || 0)), c === 'labour' ? d.staffAtEvents : c === 'transport' ? 1001 : 2);
  for (const [i, id] of ['a', 'b', 'c'].entries()) assert.equal(SUM(Object.values(d.shares[id])), d.each[i]);
});

test('computeDay: a day with no events is all running cost', () => {
  const sheet = { staff: { biju: { where: 'warehouse' }, vinod: { where: 'warehouse' } }, costs: [{ amount: 1500, column: 'other' }, { amount: 900, column: 'other' }] };
  const d = computeDay({ date: '2026-11-19', staff: ALL, sheet, eventIds: [] });
  assert.equal(d.eventDay, 0); assert.equal(d.running, 1000 + 900 + 800 + 800 + 2400); assert.deepEqual(d.shares, {});
  assert.ok(d.rows.every(r => r.where !== 'events'));
});

test('computeDay: a day not filled counts monthly staff only, as running cost', () => {
  const d = computeDay({ date: '2026-11-17', staff: ALL, sheet: null, eventIds: ['x'] });
  assert.equal(d.filled, false); assert.equal(d.running, 1000 + 900 + 800); assert.equal(d.eventDay, 0);
  assert.deepEqual(d.shares, { x: {} }); assert.ok(d.rows.every(r => r.where === 'notfilled'));
});

test('computeDay: daily-wage staff only when ticked, not when on leave; start/end dates respected', () => {
  const d = computeDay({ date: '2026-11-14', staff: [SANTHOSH, { ...VINOD, startDate: '2026-11-20' }, { ...BIJU, endDate: '2026-11-10' }], sheet: { staff: { santhosh: { where: 'leave' } }, costs: [] }, eventIds: ['e'] });
  assert.deepEqual(d.rows, []);
});

// ============================================================
// MONTH — company and person
// ============================================================
test('computeMonth: office pay separate, totals = event-day + running, shares add up per event', () => {
  const sheets = { '2026-11-14': SHEET14 };
  const m = computeMonth({ month: '2026-11', staff: ALL, sheets, eventsByDate: { '2026-11-14': ['e11', 'e12', 'e13'] }, upTo: '2026-11-20' });
  assert.equal(m.days.length, 20); assert.equal(m.total, m.eventDay + m.running);
  assert.equal(m.eventDay, 27300); assert.equal(m.office, 20 * 600);
  // 19 other days: monthly events team 2,700 each, as running cost (not filled)
  assert.equal(m.running, 1600 + 19 * 2700);
  assert.equal(SUM(Object.values(m.shares).map(s => SUM(Object.values(s)))), 27300);
});

test('staffMonth: monthly person — full salary, overtime from sheets, paid early and advance back', () => {
  const payments = [
    { staffId: 'biju', date: '2026-11-02', type: 'advance', amount: 10000, recoverPerPay: 2000 },
    { staffId: 'biju', date: '2026-11-04', type: 'early', amount: 300 }, { staffId: 'biju', date: '2026-11-09', type: 'early', amount: 500 }, { staffId: 'biju', date: '2026-11-18', type: 'early', amount: 1500 },
  ];
  const sheets = { '2026-11-14': SHEET14, '2026-11-18': { staff: { biju: { where: 'events', otHours: 4 } }, costs: [] }, '2026-11-25': { staff: { biju: { where: 'events', otHours: 3 } } }, '2026-11-28': { staff: { biju: { where: 'events', otHours: 3 } } } };
  const b = staffMonth(BIJU, '2026-11', sheets, payments);
  assert.equal(b.earned, 30000); assert.equal(b.ot, 1200); assert.equal(b.paidEarly, 2300);
  assert.equal(b.advanceOwed, 10000); assert.equal(b.plannedBack, 2000);
  assert.equal(b.toPay, 30000 + 1200 - 2300); // before Mark as paid, nothing taken back yet
  const paidNow = [...payments, { staffId: 'biju', date: '2026-11-30', type: 'pay', amount: 26900, advanceBack: 2000 }];
  const after = staffMonth(BIJU, '2026-11', sheets, paidNow);
  assert.equal(after.advanceBack, 2000); assert.equal(after.toPay, 0); assert.equal(after.advanceOwed, 8000);
  assert.deepEqual(advanceStatus('biju', paidNow), { total: 10000, back: 2000, owed: 8000, recoverPerPay: 2000 });
});

test('staffMonth: leave does not cut monthly pay; daily wage only on worked days; 31-day month exact', () => {
  const sheets = { '2026-12-03': { staff: { manoj: { where: 'leave' }, santhosh: { where: 'events', otHours: 2 } } }, '2026-12-04': { staff: { santhosh: { where: 'leave' } } }, '2026-12-05': { staff: { santhosh: { where: 'warehouse' } } } };
  const m = staffMonth(MANOJ, '2026-12', sheets, []);
  assert.equal(m.earned, 24000); assert.equal(m.leave, 1); assert.equal(m.days, 30);
  const s = staffMonth(SANTHOSH, '2026-12', sheets, [{ staffId: 'santhosh', date: '2026-12-03', type: 'pay', amount: 1200 }]);
  assert.equal(s.days, 2); assert.equal(s.earned, 2000); assert.equal(s.ot, 200); assert.equal(s.toPay, 1000);
});

test('advanceStatus: never owes less than zero; latest recovery amount used', () => {
  const p = [{ staffId: 'x', date: '2026-01-01', type: 'advance', amount: 1000, recoverPerPay: 500 }, { staffId: 'x', date: '2026-02-01', type: 'pay', amount: 0, advanceBack: 1500 }];
  assert.equal(advanceStatus('x', p).owed, 0);
});

test('start date mid-month: only days from the start count; what was left carries into the next month', async () => {
  const { staffMonth, carriedIn } = await import('../src/utils/staffCosts.js');
  const p = { id: 'b', pay: 'monthly', amount: 30000, worksIn: 'events' };
  const nov = staffMonth(p, '2026-11', {}, [], '2026-11-21');
  assert.equal(nov.earned, 10000);                         // 21–30 Nov = 10 days × 1,000
  const pays = [{ staffId: 'b', type: 'pay', date: '2026-11-30', amount: 9000 }, { staffId: 'b', type: 'pay', date: '2026-11-10', amount: 5000 }]; // the 10 Nov one is before the start → ignored
  assert.equal(staffMonth(p, '2026-11', {}, pays, '2026-11-21').toPay, 1000);
  assert.equal(carriedIn(p, '2026-12', {}, pays, '2026-11-21'), 1000);
  assert.equal(carriedIn(p, '2026-11', {}, pays, '2026-11-21'), 0);
  const over = [{ staffId: 'b', type: 'pay', date: '2026-11-30', amount: 12000 }];
  assert.equal(carriedIn(p, '2026-12', {}, over, '2026-11-21'), -2000);       // paid 2,000 too much
  assert.equal(carriedIn(p, '2027-01', {}, over, '2026-11-21'), 28000);       // + all of December unpaid (31 days = 30,000)
});

test('a pay made in early December for November counts in November', async () => {
  const { staffMonth } = await import('../src/utils/staffCosts.js');
  const p = { id: 'b', pay: 'monthly', amount: 30000, worksIn: 'events' };
  const pays = [{ staffId: 'b', type: 'pay', date: '2026-12-02', forMonth: '2026-11', amount: 30000 }];
  assert.equal(staffMonth(p, '2026-11', {}, pays).toPay, 0);
  assert.equal(staffMonth(p, '2026-12', {}, pays).toPay, 30000); // Dec: full salary, nothing paid
});
