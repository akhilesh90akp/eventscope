/**
 * calendar — dates, busy-ness and reminders for the Calendar page.
 *
 * Pure functions, no Firebase and no React (covered by
 * tests/calendar.test.mjs). An event can have several functions on different
 * days (main event + sub-events, e.g. a home function two days before a
 * wedding); the calendar works with those functions, one per date.
 *
 * Busy-ness counts confirmed and completed functions only. Drafts are
 * enquiries — shown (dashed) but they don't fill a day.
 */

// ============================================================
// IMPORTS
// ============================================================
import { computeSectionTotal } from './helpers.js';

// ============================================================
// CONSTANTS
// ============================================================

/** Default "max events a day" until the owner changes it */
export const DEFAULT_MAX_PER_DAY = 3;

/** Statuses that occupy a day (drafts are tentative) */
const COUNTS = new Set(['confirmed', 'completed']);

// ============================================================
// DATES (local calendar dates as 'YYYY-MM-DD' — no time zones)
// ============================================================

export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 'YYYY-MM-DD' + n days */
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}

/**
 * The weeks shown for a month (Sunday first), padded with the days of the
 * neighbouring months: [[{ date, inMonth }, × 7], …] — 4 to 6 weeks.
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const lastDay = new Date(year, month + 1, 0).getDate();
  const cells = first.getDay() + lastDay;
  const weeks = Math.ceil(cells / 7);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      row.push({ date: isoDate(dt), inMonth: dt.getMonth() === month });
    }
    out.push(row);
  }
  return out;
}

// ============================================================
// FUNCTIONS (one per date) FROM EVENTS
// ============================================================

/**
 * Every dated function of every event:
 * [{ key, eventId, date, time, name, client, status, eventType, location, amount, isMain }]
 * amount = that function's quote total (null if it has no priced items).
 */
export function eventFunctions(events = []) {
  const out = [];
  events.forEach((ev) => {
    if (!ev || ev.status === 'deleted') return;
    const base = { eventId: ev.id, client: ev.clientName || 'Client', status: ev.status || 'draft', eventType: ev.eventType || '' };
    const total = (sectionId, items) => (items && items.length
      ? computeSectionTotal(sectionId, items, ev.itemPrices || {}, ev.bundles || [], !!ev.hidePrices, ev.finalAmounts || {})
      : null);
    if (ev.mainEvent?.date) {
      out.push({ ...base, key: `${ev.id}::main`, date: ev.mainEvent.date, time: ev.mainEvent.time || '', name: ev.mainEvent.name || ev.eventType || 'Event', location: ev.mainEvent.location || '', amount: total('main', ev.mainEvent.items), isMain: true });
    } else if (ev.date) {
      out.push({ ...base, key: `${ev.id}::main`, date: ev.date, time: ev.time || '', name: ev.eventType || 'Event', location: ev.eventLocation || '', amount: ev.totalAmount ?? null, isMain: true });
    }
    (ev.subEvents || []).forEach((s, i) => {
      if (!s?.date) return;
      out.push({ ...base, key: `${ev.id}::${s.id || i}`, date: s.date, time: s.time || '', name: s.name || 'Function', location: s.location || '', amount: total(s.id || s.name, s.items), isMain: false });
    });
  });
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** Keeps the functions matching the page filters: status ('all' | 'confirmed' | 'draft' | 'completed') and event type */
export function filterFunctions(fns, { status = 'all', type = '' } = {}) {
  return fns.filter(f => (status === 'all' || f.status === status) && (!type || f.eventType === type));
}

/** { 'YYYY-MM-DD': [functions…] } */
export function groupByDate(fns) {
  return fns.reduce((acc, f) => { (acc[f.date] = acc[f.date] || []).push(f); return acc; }, {});
}

// ============================================================
// BUSY-NESS
// ============================================================

/** How many functions occupy the day (confirmed + completed) */
export const dayCount = (fnsOnDay = []) => fnsOnDay.filter(f => COUNTS.has(f.status)).length;

/** 'free' | 'some' | 'near' | 'full' | 'over' for a day with `count` functions and a daily limit of `max` */
export function dayLoad(count, max = DEFAULT_MAX_PER_DAY) {
  if (!count) return 'free';
  if (count > max) return 'over';
  if (count === max) return 'full';
  if (max > 2 && count === max - 1) return 'near';
  return 'some';
}

/**
 * Before confirming an event: which of its dates would reach or pass the
 * limit? Returns [{ date, count }] where count includes this event.
 */
export function capacityWarnings(event, events, max = DEFAULT_MAX_PER_DAY) {
  const byDate = groupByDate(eventFunctions(events.filter(e => e.id !== event.id)));
  const mine = eventFunctions([{ ...event, status: 'confirmed' }]);
  const dates = [...new Set(mine.map(f => f.date))];
  return dates
    .map(date => ({ date, count: dayCount(byDate[date]) + mine.filter(f => f.date === date).length }))
    .filter(d => d.count > max);
}

/**
 * The question to ask before confirming, or '' when every date is within the
 * limit: "This puts 4 events on Sun, 22 Nov — your limit is 3 a day. Confirm anyway?"
 */
export function capacityQuestion(event, events, max = DEFAULT_MAX_PER_DAY) {
  const over = capacityWarnings(event, events, max);
  if (!over.length) return '';
  const fmt = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); };
  const list = over.map(o => `${o.count} events on ${fmt(o.date)}`).join(' and ');
  return `This puts ${list} — your limit is ${max} a day. Confirm anyway?`;
}

// ============================================================
// REMINDERS (owners get a push notification 2 days before, at 9 am)
// ============================================================

export const REMINDER_DAYS_BEFORE = 2;

/** Upcoming confirmed functions in the next `days` days, each with the day its reminder goes out */
export function upcomingReminders(fns, today, days = 14) {
  const until = addDays(today, days);
  return fns
    .filter(f => f.status === 'confirmed' && f.date >= today && f.date <= until)
    .map(f => ({ ...f, remindOn: addDays(f.date, -REMINDER_DAYS_BEFORE) }));
}
