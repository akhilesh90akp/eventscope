/**
 * useDaySheets — what the Day sheet and Staff & wages pages need, worked out
 * once from AppContext: settings, which events are on which day, and a
 * day()/month() calculator using the money rules in utils/staffCosts.js.
 *
 * Fillers (non-owners) have no pay data: their day() results carry costs and
 * who worked where, but staff pay comes out as 0 and the pages hide money.
 */

// ============================================================
// IMPORTS
// ============================================================
import { useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { computeDay, computeMonth, isActiveOn, staffMonth, carriedIn, datesOfMonth } from '../utils/staffCosts';
import { eventDays, eventsByDate } from '../utils/daySheetView';
import { isoDate } from '../utils/calendar';

// ============================================================
// useDaySheets — MAIN HOOK
// ============================================================
export function useDaySheets() {
  const app = useApp();
  const { daySheetCfg: cfg, events, staff, staffRoster, daySheets, jobLogColumns, allJobLogColumns, isOwner } = app;
  const today = isoDate(new Date());
  const columnOrder = useMemo(() => (allJobLogColumns || jobLogColumns).map(c => c.id), [allJobLogColumns, jobLogColumns]);

  // Owners see full staff (with pay); fillers see the roster (names only)
  const people = useMemo(() => (isOwner ? staff : (staffRoster.people || [])), [isOwner, staff, staffRoster]);

  const byDate = useMemo(() => eventsByDate(events, cfg.startDate), [events, cfg.startDate]);
  /** { [date]: [{ eventId, client, name, location, time, eventType }] } — function-days that share costs */
  const fnsByDate = useMemo(() => {
    const out = {};
    const first = new Set();
    eventDays(events).forEach(f => {
      if (!(byDate[f.date] || []).includes(f.eventId)) return;
      const k = `${f.date}|${f.eventId}`;
      if (first.has(k)) return;
      first.add(k);
      (out[f.date] = out[f.date] || []).push(f);
    });
    Object.keys(out).forEach(d => out[d].sort((a, b) => byDate[d].indexOf(a.eventId) - byDate[d].indexOf(b.eventId)));
    return out;
  }, [events, byDate]);

  const day = useCallback((date) => computeDay({
    date, staff: people, sheet: daySheets[date] || null, eventIds: byDate[date] || [],
    staffColumn: cfg.staffColumn, columnOrder,
  }), [people, daySheets, byDate, cfg.staffColumn, columnOrder]);

  /** Same as day(), for a sheet still being typed */
  const computeWith = useCallback((date, sheet) => computeDay({
    date, staff: people, sheet, eventIds: byDate[date] || [], staffColumn: cfg.staffColumn, columnOrder,
  }), [people, byDate, cfg.staffColumn, columnOrder]);

  const month = useCallback((ym, upTo = today) => computeMonth({
    month: ym, staff: people, sheets: daySheets, eventsByDate: byDate, upTo,
    from: cfg.startDate, staffColumn: cfg.staffColumn, columnOrder,
  }), [people, daySheets, byDate, cfg.startDate, cfg.staffColumn, columnOrder, today]);

  /** Events team people on the books that day (office people are listed apart) */
  const teamOn = useCallback((date) => people.filter(p => p.worksIn !== 'office' && isActiveOn(p, date)), [people]);
  const officeOn = useCallback((date) => people.filter(p => p.worksIn === 'office' && isActiveOn(p, date)), [people]);

  const columnLabel = useCallback((id) => (allJobLogColumns || jobLogColumns).find(c => c.id === id)?.label || 'Other expenses', [allJobLogColumns, jobLogColumns]);

  return { ...app, cfg, today, people, byDate, fnsByDate, day, computeWith, month, teamOn, officeOn, columnOrder, columnLabel };
}

/** Everyone on the books at some point in the month: [{ p, s: staffMonth, carried, due }] (owners) */
export function useStaffMonth(ym) {
  const { staff, staffPayments, daySheets, daySheetCfg: cfg } = useApp();
  return useMemo(() => {
    const dates = datesOfMonth(ym);
    return staff
      .filter(p => dates.some(d => isActiveOn(p, d)))
      .sort((a, b) => (a.worksIn === 'office') - (b.worksIn === 'office') || (a.pay === 'daily') - (b.pay === 'daily') || a.name.localeCompare(b.name))
      .map(p => {
        const s = staffMonth(p, ym, daySheets, staffPayments, cfg.startDate);
        const carried = carriedIn(p, ym, daySheets, staffPayments, cfg.startDate);
        return { p, s, carried, due: s.toPay + carried };
      });
  }, [staff, staffPayments, daySheets, ym, cfg.startDate]);
}
