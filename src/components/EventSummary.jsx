/**
 * EventSummary — the top part of an event card: name, countdown, chips,
 * amount, dates (active one highlighted) and venue
 *
 * Shared by Home (upcoming confirmed events) and the Confirmed / Completed
 * pages so both show events the same way. `right` adds extra controls next
 * to the countdown (e.g. the expand arrow or a call button).
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import Badge from './Badge';
import { formatCurrency, formatDateReadable, daysUntil, getAllEventDates, getActiveDate } from '../utils/helpers';
import { CalendarDays, MapPin } from 'lucide-react';

// ============================================================
// HELPERS
// ============================================================

/** Countdown chip colour: red when close/overdue, amber within a week, green otherwise */
const countdownClass = (days) => (
  days <= 3 ? 'bg-red-100 text-red-700' : days <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
);
const countdownText = (days) => (
  days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`
);

// ============================================================
// EventSummary — MAIN COMPONENT
// ============================================================

export default function EventSummary({ ev, right = null }) {
  const eventDates = getAllEventDates(ev);
  const activeDateStr = getActiveDate(ev);
  const activeDays = daysUntil(activeDateStr);
  const venue = ev.mainEvent?.location || ev.eventLocation;

  return (
    <div>
      {/* Line 1: client name, countdown, extra controls */}
      <div className="flex items-center justify-between mb-1.5">
        <p className="font-semibold text-bb-text truncate flex-1 mr-2">{ev.clientName}</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeDays !== null && ev.status === 'confirmed' && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${countdownClass(activeDays)}`}>
              {countdownText(activeDays)}
            </span>
          )}
          {right}
        </div>
      </div>

      {/* Line 2: chips + total amount */}
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <Badge variant={ev.status}>{ev.eventType}</Badge>
        <Badge variant={ev.status}>{ev.status}</Badge>
        {ev.totalAmount > 0 && (
          <span className="font-bold text-emerald-600 text-sm ml-auto">{formatCurrency(ev.totalAmount)}</span>
        )}
      </div>

      <div className="space-y-1 text-sm">
        {/* Line 3: all dates, the next upcoming one highlighted */}
        {eventDates.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <CalendarDays size={14} className="text-bb-muted flex-shrink-0" />
            {eventDates.map((d, idx) => {
              const isActive = d.date === activeDateStr;
              return (
                <span key={idx} className={isActive ? 'text-bb-accent font-semibold' : d.isPast ? 'text-bb-muted/50 line-through' : 'text-bb-muted'}>
                  {formatDateReadable(d.date)}
                  {eventDates.length > 1 && <span className="text-[10px] ml-0.5">({d.isMain ? 'main' : d.label})</span>}
                  {idx < eventDates.length - 1 && <span className="text-bb-muted mx-0.5">•</span>}
                </span>
              );
            })}
          </div>
        )}
        {/* Line 4: venue — own row so it truncates consistently */}
        {venue && (
          <div className="flex items-center gap-1 text-bb-muted min-w-0">
            <MapPin size={14} className="flex-shrink-0" />
            <span className="truncate">{venue}</span>
          </div>
        )}
      </div>
    </div>
  );
}
