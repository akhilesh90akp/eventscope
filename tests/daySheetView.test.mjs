/** Day sheet ↔ events ↔ Job Log join (src/utils/daySheetView.js) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daySheetConfig, daySheetColumnIds, eventsByDate, daySheetEventIds, allShares, mergeDaySheetShares, monthsBetween } from '../src/utils/daySheetView.js';

const ev = (id, date, status = 'confirmed', extra = {}) => ({ id, status, clientName: id, mainEvent: { date, time: extra.time || '', ...extra.main }, subEvents: extra.subs || [] });

test('which events share a day: confirmed/completed, first day on/after start, multi-day counted each day', () => {
  const events = [
    ev('a', '2026-11-14', 'confirmed', { time: '10:00' }),
    ev('b', '2026-11-14', 'completed', { time: '08:00' }),
    ev('d', '2026-11-14', 'draft'),
    ev('old', '2026-11-01', 'completed', { subs: [{ id: 's', date: '2026-11-14' }] }), // started before → keeps typed values
    ev('m', '2026-11-15', 'confirmed', { main: { multiDay: true, endDate: '2026-11-17' } }),
  ];
  const by = eventsByDate(events, '2026-11-10');
  assert.deepEqual(by['2026-11-14'], ['b', 'a']);  // time order
  assert.deepEqual([by['2026-11-15'], by['2026-11-16'], by['2026-11-17']], [['m'], ['m'], ['m']]);
  assert.deepEqual([...daySheetEventIds(events, '2026-11-10')].sort(), ['a', 'b', 'd', 'm']);
  assert.equal(daySheetEventIds(events, '').size, 0);
});

test('Day sheet columns = staff column + where day costs went', () => {
  const cfg = daySheetConfig({ daySheets: { enabled: true, startDate: '2026-11-01', costRows: [{ label: 'Fuel', column: 'transport' }] } });
  assert.deepEqual(daySheetColumnIds(cfg, { '2026-11-14': { date: '2026-11-14', costs: [{ amount: 5, column: 'other' }] }, '2026-10-01': { date: '2026-10-01', costs: [{ column: 'rental' }] } }), ['labour', 'transport', 'other']);
});

test('months between', () => {
  assert.deepEqual(monthsBetween('2026-11-20', '2027-02-01'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('14 Nov sample end to end: shares merged over typed values, typed values kept underneath', () => {
  const cfg = daySheetConfig({ daySheets: { enabled: true, startDate: '2026-11-01' } });
  const staff = [
    { id: 'biju', name: 'Biju', pay: 'monthly', amount: 30000, worksIn: 'events', ot: { mode: 'hour', rate: 100 } }, // 1000/day in Nov
    { id: 'san', name: 'Santhosh', pay: 'daily', amount: 1000, worksIn: 'events', ot: { mode: 'hour', rate: 100 } },
    { id: 'off', name: 'Priya', pay: 'monthly', amount: 18000, worksIn: 'office' },
  ];
  const sheets = { '2026-11-14': { date: '2026-11-14', staff: { biju: { where: 'events', otHours: 2 }, san: { where: 'events', otHours: 3 } },
    costs: [{ label: 'Food', amount: 3000, column: 'other' }, { label: 'Fuel', amount: 4000, column: 'transport' }] } };
  const events = [ev('e1', '2026-11-14', 'confirmed', { time: '09:00' }), ev('e2', '2026-11-14', 'confirmed', { time: '18:00' })];
  const shares = allShares({ cfg, staff, sheets, events, today: '2026-11-20', columnOrder: ['labour', 'transport', 'other'] });
  // staff at events 1200 + 1300 = 2500, costs 7000 → 9500, 4750 each
  assert.deepEqual(shares, { e1: { labour: 1250, transport: 2000, other: 1500 }, e2: { labour: 1250, transport: 2000, other: 1500 } });
  const typed = { e1: { values: { labour: 99999, rental: 5000 }, formulas: { labour: '99999' } } };
  const merged = mergeDaySheetShares(typed, { onSheets: new Set(['e1', 'e2', 'e3']), shares, colIds: ['labour', 'transport', 'other'] });
  assert.deepEqual(merged.e1.values, { labour: 1250, rental: 5000, transport: 2000, other: 1500 });
  assert.deepEqual(merged.e1.formulas, {});
  assert.deepEqual(merged.e3.values, { labour: null, transport: null, other: null }); // days not filled yet
  assert.equal(typed.e1.values.labour, 99999);   // stored values untouched
  const forStaff = mergeDaySheetShares(typed, { onSheets: new Set(['e1']), shares, colIds: ['labour'], hideCols: ['labour'] });
  assert.equal(forStaff.e1.values.labour, null);
  // switched off → nothing changes
  assert.deepEqual(allShares({ cfg: { ...cfg, enabled: false }, staff, sheets, events, today: '2026-11-20' }), {});
  assert.equal(mergeDaySheetShares(typed, { onSheets: new Set(), shares, colIds: ['labour'] }), typed);
});

test('period costs for Reports: running, office, bonus — clipped to start date and today', async () => {
  const { periodStaffCosts } = await import('../src/utils/daySheetView.js');
  const cfg = daySheetConfig({ daySheets: { enabled: true, startDate: '2026-11-10' } });
  const staff = [
    { id: 'm', name: 'M', pay: 'monthly', amount: 30000, worksIn: 'events' },     // 1,000/day in Nov
    { id: 'o', name: 'O', pay: 'monthly', amount: 18000, worksIn: 'office' },     // 600/day in Nov
  ];
  const sheets = { '2026-11-14': { date: '2026-11-14', staff: { m: { where: 'events' } }, costs: [{ amount: 500, column: 'other' }] } };
  const events = [ev('e', '2026-11-14')];
  const payments = [{ type: 'bonus', date: '2026-11-15', amount: 700 }, { type: 'bonus', date: '2026-11-01', amount: 999 }];
  const r = periodStaffCosts({ cfg, staff, sheets, events, payments, from: '2026-11-01', to: '2026-11-30', today: '2026-11-20' });
  // 10–20 Nov = 11 days: 10 days running (1,000) + 14 Nov at the event (1,000 + 500 shared)
  assert.deepEqual(r, { running: 10000, office: 6600, bonus: 700, eventDay: 1500, days: 11 });
  assert.equal(periodStaffCosts({ cfg, staff, sheets, events, payments, from: '2026-10-01', to: '2026-10-31', today: '2026-11-20' }).days, 0);
});
