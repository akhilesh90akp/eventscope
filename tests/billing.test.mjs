/**
 * Unit tests — plans, pilot and access dates (src/utils/billing.js)
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRACE_DAYS, planPrice, planName, hasFeature, planFor, teamLimit, showsEventScopeMark,
  addDays, addMonths, daysBetween, periodEnd, blockAfterMs, todayIST,
  pilotFields, renewalRange, paidFields, accessInfo, adminStatus, DEFAULT_PILOT,
} from '../src/utils/billing.js';

// ============================================================
// DEFAULT PILOT
// ============================================================
test('new companies get a 60-day pilot (day 1 counts)', () => {
  assert.deepEqual(DEFAULT_PILOT, { length: 60, unit: 'days' });
  const f = pilotFields({ start: '2026-10-14', ...DEFAULT_PILOT });
  assert.equal(f.accessUntil, '2026-12-12');
  assert.equal(f.pilotUnit, 'days');
  assert.equal(f.blockAfterMs, blockAfterMs('2026-12-12'));
});

// ============================================================
// PLANS
// ============================================================
test('prices: monthly, yearly = 10 months', () => {
  assert.equal(planPrice('basic'), 999);
  assert.equal(planPrice('standard', 'yearly'), 15990);
  assert.equal(planPrice('premium', 'yearly'), 25990);
  assert.equal(planPrice('trial'), 0);
  assert.equal(planName('trial'), 'Free pilot');
  assert.equal(planName('premium'), 'Premium');
});

test('features and team limits per plan', () => {
  assert.equal(hasFeature('trial', 'contracts'), true);
  assert.equal(hasFeature('basic', 'jobLog'), false);
  assert.equal(hasFeature('standard', 'jobLog'), true);
  assert.equal(hasFeature('standard', 'contracts'), false);
  assert.equal(hasFeature('premium', 'contracts'), true);
  assert.equal(planFor('reports'), 'Standard');
  assert.equal(planFor('contracts'), 'Premium');
  assert.equal(teamLimit('basic'), 2);
  assert.equal(teamLimit('standard'), 5);
  assert.equal(teamLimit('premium'), Infinity);
  assert.equal(teamLimit('trial'), Infinity);
  assert.equal(showsEventScopeMark('standard'), true);
  assert.equal(showsEventScopeMark('premium'), false);
  assert.equal(showsEventScopeMark('trial'), false);
});

// ============================================================
// DATES
// ============================================================
test('date helpers', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-10-14', 3), '2027-01-14');
  assert.equal(daysBetween('2026-10-17', '2027-01-13'), 88);
  assert.equal(periodEnd('2026-10-14', 3, 'months'), '2027-01-13');
  assert.equal(periodEnd('2026-10-14', 30, 'days'), '2026-11-12');
  // writes stop at midnight IST after the last grace day
  assert.equal(new Date(blockAfterMs('2027-01-13')).toISOString(), '2027-01-18T18:30:00.000Z');
  assert.equal(todayIST(Date.parse('2026-10-17T20:00:00Z')), '2026-10-18');
});

test('pilotFields / paidFields / renewalRange', () => {
  const f = pilotFields({ start: '2026-10-14', length: 3, unit: 'months' });
  assert.equal(f.accessUntil, '2027-01-13');
  assert.equal(f.plan, 'trial');
  assert.equal(f.blockAfterMs, blockAfterMs('2027-01-13'));
  assert.equal(pilotFields({ start: '2026-10-14', length: 3, unit: 'months', autoSuspend: false }).blockAfterMs, null);
  // paying early continues from the old end date
  assert.deepEqual(renewalRange({ accessUntil: '2027-01-13' }, 'yearly', '2026-12-20'), { start: '2027-01-14', end: '2028-01-13' });
  // paying after it ended starts today
  assert.deepEqual(renewalRange({ accessUntil: '2026-10-10' }, 'monthly', '2026-10-17'), { start: '2026-10-17', end: '2026-11-16' });
  assert.deepEqual(paidFields({ plan: 'standard', cycle: 'yearly', until: '2028-01-13' }),
    { plan: 'standard', cycle: 'yearly', accessUntil: '2028-01-13', autoSuspend: true, blockAfterMs: blockAfterMs('2028-01-13') });
});

// ============================================================
// ACCESS STATE
// ============================================================
test('accessInfo: pilot active → ending → grace → ended', () => {
  const t = { plan: 'trial', status: 'active', ...pilotFields({ start: '2026-10-14', length: 3, unit: 'months' }) };
  assert.deepEqual([accessInfo(t, '2026-10-17').phase, accessInfo(t, '2026-10-17').daysLeft], ['active', 89]);
  assert.equal(accessInfo(t, '2027-01-01').phase, 'ending');
  assert.equal(accessInfo(t, '2027-01-13').daysLeft, 1);
  const g = accessInfo(t, '2027-01-14');
  assert.deepEqual([g.phase, g.graceLeft, g.readOnly], ['grace', GRACE_DAYS, false]);
  assert.equal(accessInfo(t, '2027-01-18').graceLeft, 1);
  const e = accessInfo(t, '2027-01-19');
  assert.deepEqual([e.phase, e.readOnly], ['ended', true]);
  assert.equal(accessInfo(t, '2027-01-19', true).readOnly, false);           // "I've paid" keeps it working
  assert.equal(accessInfo({ ...t, autoSuspend: false }, '2027-03-01').readOnly, false);
  assert.equal(accessInfo({ ...t, status: 'suspended' }, '2026-10-17').readOnly, true);
});

test('accessInfo: monthly plans warn 7 days ahead, yearly 14', () => {
  const m = { plan: 'basic', cycle: 'monthly', status: 'active', accessUntil: '2026-11-16' };
  assert.equal(accessInfo(m, '2026-11-08').phase, 'active');
  assert.equal(accessInfo(m, '2026-11-10').phase, 'ending');
  assert.equal(accessInfo({ ...m, cycle: 'yearly' }, '2026-11-04').phase, 'ending');
  assert.equal(accessInfo({ plan: 'standard', status: 'active' }).kind, 'open');
});

test('adminStatus labels', () => {
  const t = { plan: 'trial', status: 'active', ...pilotFields({ start: '2026-10-14', length: 3, unit: 'months' }) };
  assert.equal(adminStatus(t, accessInfo(t, '2026-10-17'), d => d, '2026-10-17').label, 'Pilot');
  assert.equal(adminStatus({ ...t, pilotExtended: true }, accessInfo(t, '2026-10-17'), d => d, '2026-10-17').label, 'Pilot extended');
  assert.equal(adminStatus(t, accessInfo(t, '2027-01-15'), d => d, '2027-01-15').label, 'Pilot ended');
  assert.equal(adminStatus(t, accessInfo(t, '2027-02-01'), d => d, '2027-02-01').label, 'Suspended · pilot ended');
  const p = { plan: 'standard', cycle: 'yearly', status: 'active', accessUntil: '2026-10-10' };
  assert.equal(adminStatus(p, accessInfo(p, '2026-10-12'), d => d, '2026-10-12').label, 'Payment due');
  assert.equal(adminStatus(p, accessInfo(p, '2026-10-20'), d => d, '2026-10-20').label, 'Suspended · not paid');
  assert.equal(adminStatus(p, accessInfo(p, '2026-10-20', true), d => d, '2026-10-20').label, 'Paid — confirm?');
  assert.equal(adminStatus({ ...p, status: 'suspended' }, accessInfo({ ...p, status: 'suspended' }, '2026-10-01'), d => d, '2026-10-01').label, 'Suspended by you');
  assert.equal(adminStatus({ ...p, accessUntil: '2027-10-10', reactivatedAt: '2026-10-15T10:00:00Z' }, accessInfo({ ...p, accessUntil: '2027-10-10' }, '2026-10-17'), d => d, '2026-10-17').label, 'Reactivated');
});

test('upiLink fills payee, amount and note', async () => {
  const { upiLink } = await import('../src/utils/billing.js');
  assert.equal(upiLink({ upiId: 'abc@upi', payeeName: 'Event Scope', amount: 15990, note: 'Standard yearly' }),
    'upi://pay?pa=abc%40upi&pn=Event%20Scope&am=15990.00&cu=INR&tn=Standard%20yearly');
});
