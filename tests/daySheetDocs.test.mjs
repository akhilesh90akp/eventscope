/** Excel / Print tables for Day sheets and Staff & wages (src/utils/daySheetDocs.js, staffExcel.printHtml) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayDoc, monthDoc, salaryDoc } from '../src/utils/daySheetDocs.js';
import { printHtml } from '../src/utils/staffExcel.js';
import { computeDay, computeMonth, staffMonth } from '../src/utils/staffCosts.js';

const staff = [
  { id: 'b', name: 'Biju', pay: 'monthly', amount: 30000, worksIn: 'events', ot: { mode: 'hour', rate: 100 } },
  { id: 'o', name: 'Priya', pay: 'monthly', amount: 18000, worksIn: 'office' },
];
const sheet = { staff: { b: { where: 'events', otHours: 2 } }, costs: [{ label: 'Food', amount: 3001, column: 'other' }], notes: 'Truck to Aluva' };

test('day table totals match the day', () => {
  const d = computeDay({ date: '2026-11-14', staff, sheet, eventIds: ['e1', 'e2'] });
  const doc = dayDoc({ d, sheet, fns: [{ client: 'A', name: 'Wedding' }, { client: 'B', name: 'Birthday' }], columnLabel: (c) => c });
  const ev = doc.sections[0];
  assert.equal(ev.rows.reduce((t, r) => t + r.share, 0), ev.total.share);
  assert.deepEqual(ev.rows.map(r => r.share), [2101, 2100]);         // 1,200 + 3,001 = 4,201
  assert.equal(doc.sections[1].total.total, 1200);
  assert.equal(doc.sections[3].total.v, d.total);
  assert.match(printHtml(doc), /Truck to Aluva/);
  assert.match(printHtml(doc), /₹4,201/);
});

test('month and salary tables add up; office in its own section', () => {
  const m = computeMonth({ month: '2026-11', staff, sheets: { '2026-11-14': sheet }, eventsByDate: { '2026-11-14': ['e1'] }, upTo: '2026-11-20' });
  const md = monthDoc({ ym: '2026-11', month: m, byDate: { '2026-11-14': ['e1'] } });
  assert.equal(md.sections[0].rows.reduce((t, r) => t + r.total, 0), m.total);
  assert.equal(md.sections[0].rows.length, 20);
  const list = staff.map(p => ({ p, s: staffMonth(p, '2026-11', { '2026-11-14': sheet }, []) }));
  const sd = salaryDoc({ ym: '2026-11', list });
  assert.deepEqual(sd.sections.map(s => s.heading), ['Events team · 1', 'Office · 1']);
  assert.equal(sd.sections[0].total.toPay, 30200);
  assert.equal(sd.sections[1].total.toPay, 18000);
  assert.match(printHtml(sd), /Salary sheet · November 2026/);
});

test('print escapes text', () => {
  const html = printHtml({ title: '<b>x</b>', sections: [{ columns: [{ header: 'a', key: 'a' }], rows: [{ a: '<img src=x>' }] }] });
  assert.ok(!html.includes('<img src=x>') && html.includes('&lt;img'));
});
