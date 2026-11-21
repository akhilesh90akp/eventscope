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
 * completed, with a function that day, whose FIRST day is on/after `from`.
 * Order = the day's function order (time), each event once per day.
 */
export const eventsByDate = (events = [], from = '') => {
  const first = firstDates(events);
  const out = {};
  eventDays(events).forEach(f => {
    if (from && (first[f.eventId] || '') < from) return;
    const list = out[f.date] || (out[f.date] = []);
    if (!list.includes(f.eventId)) list.push(f.eventId);
  });
  return out;
};

/** Event ids that use Day sheets (first day on/after the start date) */
export const daySheetEventIds = (events = [], from = '') => {
  if (!from) return new Set();
  const first = firstDates(events);
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
  const byDate = eventsByDate(events, cfg.startDate);
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
 *   hideCols: columns to blank instead (e.g. staff pay for non-owners)
 * Each merged event gets fromDaySheet: [colIds] so pages show those cells read-only.
 * An event with no share yet (its days not filled) shows those cells blank.
 */
export const mergeDaySheetShares = (financials = {}, { onSheets, shares = {}, colIds = [], hideCols = [] }) => {
  if (!onSheets || !onSheets.size || !colIds.length) return financials;
  const out = { ...financials };
  onSheets.forEach(id => {
    const raw = financials[id] || {};
    const mine = shares[id];
    const values = { ...(raw.values || {}) };
    const formulas = { ...(raw.formulas || {}) };
    colIds.forEach(c => {
      values[c] = hideCols.includes(c) ? null : mine ? (mine[c] || 0) : null;
      delete formulas[c];
    });
    out[id] = { ...raw, values, formulas, fromDaySheet: colIds };
  });
  return out;
};
