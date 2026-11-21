/**
 * daySheetView — joins Day sheets to events and the Job Log (pure, no Firestore)
 *
 * Day-sheet costs are NEVER written into financials/. Each event's share is
 * worked out here at read time and laid over the Job Log values, only for:
 *   - events whose first day is on/after the Day sheets start date, and
 *   - the Job Log columns that come from Day sheets (staff column + the
 *     columns the day's costs go to).
 * Older events keep exactly what was typed. Switching Day sheets off brings
 * every typed value back, untouched.
 *
 * Money rules live in staffCosts.js; this file only decides which events
 * count on which day and merges the result.
 */

import { eventFunctions, expandDays } from './calendar.js';
import { computeMonth, monthOf } from './staffCosts.js';

// ============================================================
// SETTINGS
// ============================================================

/** Settings → Day sheets with defaults filled in */
export const daySheetConfig = (settings = {}) => {
  const d = settings.daySheets || {};
  return {
    enabled: !!d.enabled,
    startDate: d.startDate || '',
    staffColumn: d.staffColumn || 'labour',
    costRows: Array.isArray(d.costRows) ? d.costRows : [],     // [{ label, column }] shown empty on each new sheet
    payCycle: d.payCycle || 'daily',                            // daily-wage staff: 'daily' | 'weekly' | 'monthly'
    defaultOt: d.defaultOt || { mode: 'hour', rate: 0 },
  };
};

/** Job Log columns filled from Day sheets: the staff column + every column a day cost went to */
export const daySheetColumnIds = (cfg, sheets = {}) => {
  const ids = new Set([cfg.staffColumn]);
  cfg.costRows.forEach(r => r.column && ids.add(r.column));
  Object.values(sheets).forEach(s => {
    if (cfg.startDate && s.date < cfg.startDate) return;
    (s.costs || []).forEach(c => c.column && ids.add(c.column));
  });
  return [...ids];
};

/** A new, empty sheet: monthly staff pre-ticked (Events if there are events, else Warehouse), the "every day" cost rows empty */
export const blankSheet = (team, hasEvents, costRows = []) => ({
  staff: Object.fromEntries(team.filter(p => p.pay === 'monthly' && p.worksIn !== 'office').map(p => [p.id, { where: hasEvents ? 'events' : 'warehouse', otHours: '' }])),
  costs: costRows.map((r, i) => ({ id: `row${i + 1}`, label: r.label, column: r.column, amount: '' })),
  notes: '',
});

// ============================================================
// EVENTS PER DAY
// ============================================================

const COUNTS = new Set(['confirmed', 'completed']);

/** Each counted function-day: { date, eventId, client, name, location, time, amount } (confirmed/completed only) */
export const eventDays = (events = []) =>
  expandDays(eventFunctions(events).filter(f => COUNTS.has(f.status)));

/** First day of each event (any status) → { [eventId]: date } */
export const firstDates = (events = []) => {
  const out = {};
  eventFunctions(events).forEach(f => { if (!out[f.eventId] || f.date < out[f.eventId]) out[f.eventId] = f.date; });
  return out;
};

/**
 * { [date]: [eventId…] } — events that share each day's costs: confirmed or
 * completed, with a function that day. Order = the day's function order
 * (time), each event once per day. An event that started before the Day
 * sheets start date still takes its share of a later day (so nothing is
 * counted twice as running cost), but that share is not shown — its Job Log
 * keeps the typed values, which already cover it.
 */
export const eventsByDate = (events = []) => {
  const out = {};
  eventDays(events).forEach(f => {
    const list = out[f.date] || (out[f.date] = []);
    if (!list.includes(f.eventId)) list.push(f.eventId);
  });
  return out;
};

/** Event ids that use Day sheets: confirmed/completed, first day on/after the start date */
export const daySheetEventIds = (events = [], from = '') => {
  if (!from) return new Set();
  const first = firstDates(events.filter(e => e.status === 'confirmed' || e.status === 'completed'));
  return new Set(Object.keys(first).filter(id => first[id] >= from));
};

// ============================================================
// ALL SHARES
// ============================================================

/** 'YYYY-MM' months from a's month to b's month, inclusive */
export const monthsBetween = (a, b) => {
  const out = [];
  let [y, m] = monthOf(a).split('-').map(Number);
  const [ey, em] = monthOf(b).split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
};

/**
 * Every event's Day sheet share since the start date, up to `today`.
 * → { [eventId]: { [columnId]: rupees } }
 */
export const allShares = ({ cfg, staff = [], sheets = {}, events = [], columnOrder, today }) => {
  if (!cfg.enabled || !cfg.startDate || today < cfg.startDate) return {};
  const byDate = eventsByDate(events);
  const shares = {};
  monthsBetween(cfg.startDate, today).forEach(month => {
    const m = computeMonth({ month, staff, sheets, eventsByDate: byDate, upTo: today, from: cfg.startDate, staffColumn: cfg.staffColumn, columnOrder });
    Object.entries(m.shares).forEach(([id, cols]) => {
      shares[id] = shares[id] || {};
      Object.entries(cols).forEach(([c, v]) => { shares[id][c] = (shares[id][c] || 0) + v; });
    });
  });
  return shares;
};

// ============================================================
// JOB LOG MERGE
// ============================================================

/**
 * Lays Day sheet shares over the typed Job Log values (a new object; the
 * stored financials are not touched).
 *   onSheets: Set of event ids using Day sheets · colIds: Day sheet column ids
 *   staffColumn: worked out only, never typed (read-only) — typed labour would count staff twice
 *   other Day sheet columns: typed amount (costs for just this event, e.g. a hired truck) + the share
 *   hideCols: columns to blank instead (staff pay for non-owners)
 * Each merged event gets:
 *   fromDaySheet: [staffColumn] read-only cells · addsDaySheet: [cols] typed + share
 *   daySheetShare: { col: rupees } · typed: the stored values (what the input boxes show)
 */
export const mergeDaySheetShares = (financials = {}, { onSheets, shares = {}, colIds = [], staffColumn = 'labour', hideCols = [] }) => {
  if (!onSheets || !onSheets.size || !colIds.length) return financials;
  const out = { ...financials };
  onSheets.forEach(id => {
    const raw = financials[id] || {};
    const typed = raw.values || {};
    const mine = shares[id] || {};
    const values = { ...typed };
    const formulas = { ...(raw.formulas || {}) };
    const blank = (v) => v === null || v === undefined || v === '';
    colIds.forEach(c => {
      const share = mine[c];
      if (c === staffColumn || hideCols.includes(c)) {
        values[c] = hideCols.includes(c) ? null : (share ?? null);
        delete formulas[c];
      } else if (!blank(typed[c]) || share !== undefined) {
        values[c] = (blank(typed[c]) ? 0 : Number(typed[c]) || 0) + (share || 0);
      }
    });
    out[id] = { ...raw, values, formulas, typed, daySheetShare: mine,
      fromDaySheet: colIds.filter(c => c === staffColumn || hideCols.includes(c)),
      addsDaySheet: colIds.filter(c => c !== staffColumn && !hideCols.includes(c)) };
  });
  return out;
};

// ============================================================
// REPORTS — costs that belong to no event
// ============================================================

/**
 * Day sheet costs in a period (dates from..to, '' = open), counted only from
 * the start date up to today: running cost (warehouse, leave, no-event or
 * unfilled days), office salaries, bonuses paid, and what was shared into events.
 * → { running, office, bonus, eventDay, days }
 */
export const periodStaffCosts = ({ cfg, staff = [], sheets = {}, events = [], payments = [], columnOrder, from = '', to = '', today }) => {
  const out = { running: 0, office: 0, bonus: 0, eventDay: 0, days: 0 };
  if (!cfg.enabled || !cfg.startDate) return out;
  const start = from && from > cfg.startDate ? from : cfg.startDate;
  const end = to && to < today ? to : today;
  if (end < start) return out;
  const byDate = eventsByDate(events);
  monthsBetween(start, end).forEach(month => {
    const m = computeMonth({ month, staff, sheets, eventsByDate: byDate, upTo: end, from: start, staffColumn: cfg.staffColumn, columnOrder });
    out.running += m.running; out.office += m.office; out.eventDay += m.eventDay; out.days += m.days.length;
  });
  out.bonus = payments.filter(p => p.type === 'bonus' && p.date >= start && p.date <= end).reduce((t, p) => t + Math.round(Number(p.amount) || 0), 0);
  return out;
};
