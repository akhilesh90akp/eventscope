/**
 * Unit tests — calendar dates, busy-ness and reminders (src/utils/calendar.js)
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthGrid, addDays, eventFunctions, filterFunctions, groupByDate, dayCount, dayLoad,
  capacityWarnings, capacityQuestion, upcomingReminders, expandDays, assignLanes,
} from '../src/utils/calendar.js';

// ============================================================
// CONSTANTS — made-up events
// ============================================================
const EVENTS = [
  { id: 'w', status: 'confirmed', clientName: 'A & B', eventType: 'Wedding',
    mainEvent: { name: 'Wedding', date: '2026-11-08', time: '10:00', location: 'Church', items: ['Stage'] },
    subEvents: [{ id: 'h', name: 'Home Function', date: '2026-11-06', time: '18:00', items: [] }],
    itemPrices: { 'main::Stage': { qty: 1, rate: 50000 } } },
  { id: 'r', status: 'confirmed', clientName: 'C', eventType: 'Reception', mainEvent: { date: '2026-11-08', time: '18:30' } },
  { id: 'd', status: 'draft', clientName: 'D', eventType: 'Corporate', mainEvent: { date: '2026-11-08' } },
  { id: 'o', status: 'completed', clientName: 'E', eventType: 'Wedding', date: '2026-10-03' }, // old format
];

// ============================================================
// TESTS
// ============================================================
test('November 2026 starts on a Sunday and needs 5 weeks', () => {
  const g = monthGrid(2026, 10);
  assert.equal(g.length, 5);
  assert.deepEqual(g[0][0], { date: '2026-11-01', inMonth: true });
  assert.deepEqual(g[4][6], { date: '2026-12-05', inMonth: false });
  assert.equal(monthGrid(2026, 9)[0][0].date, '2026-09-27'); // Oct 2026 starts Thursday
});

test('each function is its own calendar entry, in time order', () => {
  const fns = eventFunctions(EVENTS);
  assert.deepEqual(fns.map(f => [f.date, f.name, f.client]), [
    ['2026-10-03', 'Wedding', 'E'],
    ['2026-11-06', 'Home Function', 'A & B'],
    ['2026-11-08', 'Corporate', 'D'],
    ['2026-11-08', 'Wedding', 'A & B'],
    ['2026-11-08', 'Reception', 'C'],
  ]);
  assert.equal(fns.find(f => f.key === 'w::main').amount, 50000);
  assert.equal(fns.find(f => f.key === 'w::h').amount, null); // no priced items
});

test('drafts are shown but don’t fill a day', () => {
  const byDate = groupByDate(expandDays(eventFunctions(EVENTS)));
  assert.equal(byDate['2026-11-08'].length, 3);
  assert.equal(dayCount(byDate['2026-11-08']), 2);
});

test('filters by status and type', () => {
  const fns = eventFunctions(EVENTS);
  assert.equal(filterFunctions(fns, { status: 'draft' }).length, 1);
  assert.equal(filterFunctions(fns, { type: 'Wedding' }).length, 3);
  assert.equal(filterFunctions(fns, { status: 'confirmed', type: 'Wedding' }).length, 2);
});

test('day load against the daily limit', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(n => dayLoad(n, 3)), ['free', 'some', 'near', 'full', 'over']);
  assert.deepEqual([1, 2].map(n => dayLoad(n, 2)), ['some', 'full']);
  assert.equal(dayLoad(1, 1), 'full');
});

test('confirming warns only for dates that would go over the limit', () => {
  const draft = EVENTS.find(e => e.id === 'd');
  assert.deepEqual(capacityWarnings(draft, EVENTS, 2), [{ date: '2026-11-08', count: 3 }]);
  assert.deepEqual(capacityWarnings(draft, EVENTS, 3), []);
});

test('reminders: confirmed functions ahead, sent 2 days before', () => {
  const r = upcomingReminders(eventFunctions(EVENTS), '2026-11-01', 14);
  assert.deepEqual(r.map(x => [x.key, x.remindOn]), [['w::h', '2026-11-04'], ['w::main', '2026-11-06'], ['r::main', '2026-11-06']]);
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('the confirm question names the dates that go over', () => {
  const draft = EVENTS.find(e => e.id === 'd');
  assert.match(capacityQuestion(draft, EVENTS, 2), /^This puts 3 events on .*8 Nov.* — your limit is 2 a day\. Confirm anyway\?$/);
  assert.equal(capacityQuestion(draft, EVENTS, 3), '');
});

// ============================================================
// MULTI-DAY FUNCTIONS
// ============================================================
const EXPO = { id: 'x', status: 'confirmed', clientName: 'Expo', eventType: 'Corporate', mainEvent: { name: 'Expo', date: '2026-11-18', endDate: '2026-11-20' } };
const FEST = { id: 'f', status: 'confirmed', clientName: 'Fest', eventType: 'Corporate', mainEvent: { name: 'Fest', date: '2026-11-19', endDate: '2026-11-21' } };
const LATER = { id: 'l', status: 'draft', clientName: 'Later', eventType: 'Corporate', mainEvent: { name: 'Later', date: '2026-11-22', endDate: '2026-11-23' } };

test('a 3-day function fills all three days, as Day 1/2/3', () => {
  const days = expandDays(eventFunctions([EXPO]));
  assert.deepEqual(days.map(d => [d.date, d.dayIndex, d.days, d.fnKey]), [
    ['2026-11-18', 1, 3, 'x::main'], ['2026-11-19', 2, 3, 'x::main'], ['2026-11-20', 3, 3, 'x::main'],
  ]);
  assert.equal(new Set(days.map(d => d.key)).size, 3);
  assert.ok(days.every(d => d.startDate === '2026-11-18' && d.endDate === '2026-11-20'));
});

test('overlapping multi-day functions get separate lanes; a later one reuses lane 0', () => {
  const lanes = assignLanes(eventFunctions([EXPO, FEST, LATER, ...EVENTS]));
  assert.deepEqual(lanes, { 'x::main': 0, 'f::main': 1, 'l::main': 0 });
});

test('every day of a multi-day function counts toward the limit, also when confirming', () => {
  const byDate = groupByDate(expandDays(eventFunctions([EXPO, FEST])));
  assert.equal(dayCount(byDate['2026-11-19']), 2);
  assert.equal(dayCount(byDate['2026-11-21']), 1);
  const draft = { ...FEST, status: 'draft' };
  assert.deepEqual(capacityWarnings(draft, [EXPO, draft], 1), [{ date: '2026-11-19', count: 2 }, { date: '2026-11-20', count: 2 }]);
});

test('reminders use the first day of a multi-day function', () => {
  const r = upcomingReminders(eventFunctions([EXPO]), '2026-11-10', 14);
  assert.deepEqual(r.map(x => [x.date, x.remindOn]), [['2026-11-18', '2026-11-16']]);
});
