/**
 * Calendar — month view of every event function, coloured by how busy each
 * day is against the company's daily limit ("max events a day").
 *
 * - Day colours: free / has events / nearly full / full / over the limit.
 *   Only confirmed and completed functions fill a day; drafts show dashed.
 *   Every day of a multi-day function counts.
 * - Multi-day functions: one bar across their days on laptops, a thin line
 *   along the bottom of the days on phones. Overlapping ones stack in lanes
 *   (each keeps its row; alternate shades tell them apart).
 * - Filters: status and event type. Month or List view.
 * - Tap a day to see its functions (side panel on laptops, below on phones);
 *   tap a function to open the event.
 * - Everyone sees what the daily limit means; owners change it in
 *   Settings → Calendar & reminders. Owners also see upcoming reminders and
 *   can turn on reminder notifications for this device. Staff never see amounts.
 *
 * Phones: Month | List switch (remembered on this phone), a filter button
 * (status, event type, Today) and a one-line colour key with ⓘ for details.
 *
 * Logic lives in utils/calendar.js; this file only lays it out.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, AlertTriangle, Bell, CalendarDays, Users, SlidersHorizontal, Info, Phone, MessageSquare, Pencil, FileText, Receipt, FileSignature } from 'lucide-react';
import { useIsPhone } from '../components/useIsPhone';
import BottomSheet from '../components/BottomSheet';
import { SegmentedTabs, IconButton } from '../components/PhoneUI';
import { PageHeader, Seg } from '../components/LaptopUI';
import StickyBar from '../components/StickyBar';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import ReminderSwitch from '../components/ReminderSwitch';
import { EVENT_TYPES } from '../constants/data';
import { formatDateRange, formatRupees, telLink, waLink } from '../utils/helpers';
import {
  DEFAULT_MAX_PER_DAY, monthGrid, isoDate, eventFunctions, filterFunctions, groupByDate,
  expandDays, assignLanes, dayCount, dayLoad, upcomingReminders,
} from '../utils/calendar';

// ============================================================
// CONSTANTS
// ============================================================
const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'draft', label: 'Drafts' },
  { id: 'completed', label: 'Completed' },
];

/** Background per day load (also used for the legend swatches) */
const LOAD_BG = { free: 'bg-white', some: 'bg-violet-50', near: 'bg-amber-50', full: 'bg-rose-50', over: 'bg-rose-100' };
const LOAD_BADGE = { near: 'bg-amber-100 text-amber-700', full: 'bg-rose-200 text-rose-700', over: 'bg-rose-600 text-white' };
const LOAD_LABEL = { free: 'Free', some: 'Has events', near: 'Nearly full', full: 'Full', over: 'Over the limit' };

/** Event chip style per status */
const CHIP = {
  confirmed: 'bg-bb-accent text-white',
  draft: 'bg-white text-violet-700 border border-dashed border-violet-400',
  completed: 'bg-gray-200 text-gray-600',
};
const DOT = {
  confirmed: 'bg-bb-accent',
  draft: 'bg-white border border-dashed border-violet-400',
  completed: 'bg-gray-400',
};
const STATUS_TAG = {
  confirmed: 'bg-violet-100 text-violet-700',
  draft: 'bg-white text-violet-700 border border-dashed border-violet-400',
  completed: 'bg-gray-200 text-gray-600',
};
const STATUS_NAME = { confirmed: 'Confirmed', draft: 'Draft', completed: 'Completed' };

/** Multi-day bars (laptop) and lines (phone): [even lane, odd lane] shades per status */
const BAR = {
  confirmed: ['bg-bb-accent text-white', 'bg-violet-800 text-white'],
  draft: ['bg-white text-violet-700 border border-dashed border-violet-400', 'bg-white text-violet-900 border border-dashed border-violet-600'],
  completed: ['bg-gray-200 text-gray-600', 'bg-gray-300 text-gray-700'],
};
const LINE = {
  confirmed: ['bg-bb-accent', 'bg-violet-800'],
  draft: ['border-t-2 border-dashed border-violet-400', 'border-t-2 border-dashed border-violet-700'],
  completed: ['bg-gray-400', 'bg-gray-500'],
};
const LAPTOP_LANES = 3;   // multi-day rows shown in a laptop cell
const PHONE_LANES = 2;    // lines shown in a phone cell

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================================
// HELPERS
// ============================================================

const monthTitle = (y, m) => new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const longDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
};
const shortDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
/** 0 = Sunday … 6 = Saturday for 'YYYY-MM-DD' */
const weekdayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
/** "18:00" → "6:00 pm" */
const time12 = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** One function in the day list */
function FunctionCard({ f, showAmount, onOpen }) {
  return (
    <button onClick={onOpen} className="w-full text-left bg-white border border-bb-border rounded-xl px-3 py-2.5 hover:border-bb-accent/50 cursor-pointer">
      <div className="flex justify-between gap-2">
        <span className="font-semibold text-bb-text truncate">{f.client}</span>
        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_TAG[f.status] || STATUS_TAG.draft}`}>{STATUS_NAME[f.status] || f.status}</span>
      </div>
      {f.days > 1 && (
        <span className="inline-block mt-1 text-[11px] font-semibold bg-violet-100 text-violet-700 rounded-md px-1.5" data-testid="day-of">
          Day {f.dayIndex} of {f.days}
        </span>
      )}
      <p className="text-xs text-bb-muted mt-0.5">
        {[f.name, f.days > 1 ? formatDateRange(f.startDate || f.date, f.endDate) : '', time12(f.time), f.location].filter(Boolean).join(' · ')}
      </p>
      {showAmount && f.amount != null && (
        <p className={`text-sm font-semibold mt-1 ${f.status === 'draft' ? 'text-bb-muted' : 'text-emerald-600'}`}>
          {f.status === 'draft' ? 'Quote ' : ''}{formatRupees(f.amount)}
        </p>
      )}
    </button>
  );
}

/** Phones: one event as a flat line inside a day's card (no card-in-card) */
const EDGE = { confirmed: 'bg-bb-accent', draft: 'bg-violet-300', completed: 'bg-gray-300' };
function FunctionLine({ f, showAmount, onOpen }) {
  return (
    <button onClick={onOpen} data-testid="fn-line"
      className="w-full flex items-stretch gap-3 text-left py-3.5 border-b border-bb-border last:border-b-0 cursor-pointer active:bg-violet-50">
      <i className={`w-1 rounded-full shrink-0 ${EDGE[f.status] || EDGE.draft}`} />
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline gap-2">
          <b className="flex-1 min-w-0 truncate text-[15.5px] text-bb-text">{f.client}</b>
          {showAmount && f.amount != null && (
            <b className={`shrink-0 text-[14.5px] tabular-nums ${f.status === 'draft' ? 'text-bb-muted font-semibold' : 'text-emerald-700'}`}>{formatRupees(f.amount)}</b>
          )}
        </span>
        <span className="block text-[13.5px] text-gray-600 mt-0.5 truncate">
          {[f.name, time12(f.time)].filter(Boolean).join(' · ')}
          {f.days > 1 && <span className="ml-1.5 text-[11.5px] font-bold bg-violet-100 text-violet-700 rounded-md px-1.5 py-px" data-testid="day-of">Day {f.dayIndex} of {f.days}</span>}
        </span>
        {f.location && <span className="block text-[13px] text-gray-500 mt-0.5 truncate">{f.location}</span>}
        <span className="block text-[12px] font-semibold text-gray-500 mt-1">{STATUS_NAME[f.status] || f.status}</span>
      </span>
    </button>
  );
}

/**
 * Laptop: the chosen day's events as full-width cards under the calendar.
 * One card per event (name, type, status, amount, days-to-go chip) with a tile
 * per function that falls on this day, and Quote · Bill · Contract on the left,
 * Call · WhatsApp · Edit on the right.
 */
function DayCardsLaptop({ fns, events, showAmount, navigate, openEvent }) {
  const byEvent = [];
  fns.forEach(f => { let g = byEvent.find(x => x.eventId === f.eventId); if (!g) { g = { eventId: f.eventId, list: [] }; byEvent.push(g); } g.list.push(f); });
  const act = 'min-h-[36px] px-3 rounded-xl border border-gray-300 bg-white inline-flex items-center gap-2 text-[13.5px] font-semibold cursor-pointer hover:bg-gray-50';
  return (
    <div className="space-y-3" data-testid="day-cards">
      {byEvent.map(g => {
        const first = g.list[0];
        const ev = events.find(e => e.id === g.eventId) || {};
        const phone = ev.clientPhone || ev.clientWhatsapp;
        const isDraft = first.status === 'draft';
        return (
          <article key={g.eventId} className="bg-white border border-bb-border rounded-2xl p-4" data-testid="day-card" data-event={g.eventId}>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-[16px] font-bold text-bb-text">{first.client}</h3>
              {first.eventType && <span className="text-[11.5px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">{first.eventType}</span>}
              <span className={`text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_TAG[first.status] || STATUS_TAG.draft}`}>{STATUS_NAME[first.status] || first.status}</span>
              <span className="flex-1" />
              {showAmount && first.amount != null && <b className={`text-[16.5px] tabular-nums ${isDraft ? 'text-bb-muted' : 'text-emerald-600'}`}>{isDraft ? 'Quote ' : ''}{formatRupees(first.amount)}</b>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {g.list.map(f => {
                const [y, m, d] = f.date.split('-').map(Number);
                const dt = new Date(y, m - 1, d);
                return (
                  <button key={f.key} onClick={() => openEvent(f)} className="flex items-start gap-3 text-left rounded-xl bg-violet-50/40 border border-violet-100/70 px-3 py-2 cursor-pointer hover:bg-violet-50" data-testid="day-tile">
                    <span className="shrink-0 w-10 text-center rounded-lg bg-white border border-bb-border py-0.5">
                      <i className="block not-italic text-[9.5px] font-bold uppercase text-bb-accent-hover">{dt.toLocaleDateString('en-IN', { weekday: 'short' })}</i>
                      <b className="block text-[16px] leading-tight">{d}</b>
                    </span>
                    <span className="min-w-0">
                      <b className="block text-[14px] truncate">{f.name}{f.isMain && <span className="ml-1.5 text-[10.5px] font-bold text-violet-700 bg-violet-100 rounded-full px-2">Main</span>}{f.days > 1 && <span className="ml-1.5 text-[10.5px] font-bold text-violet-700 bg-violet-100 rounded-md px-1.5" data-testid="day-of">Day {f.dayIndex} of {f.days}</span>}</b>
                      <span className="block text-[12.5px] text-gray-600 truncate">{[f.days > 1 ? formatDateRange(f.startDate || f.date, f.endDate) : '', time12(f.time), f.location].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => navigate(`/quotation/${g.eventId}`)} className={act}><FileText size={16} />Quote</button>
              {!isDraft && <button onClick={() => navigate(`/bill/${g.eventId}`)} className={act}><Receipt size={16} />Bill</button>}
              {!isDraft && <button onClick={() => navigate(`/contract/${g.eventId}`)} className={act}><FileSignature size={16} />Contract</button>}
              <span className="flex-1" />
              {phone && <a href={telLink(phone)} aria-label="Call" className="w-9 h-9 rounded-xl border border-emerald-200 text-emerald-700 flex items-center justify-center hover:bg-emerald-50"><Phone size={16} /></a>}
              {phone && <a href={waLink(phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="w-9 h-9 rounded-xl border border-emerald-200 text-emerald-700 flex items-center justify-center hover:bg-emerald-50"><MessageSquare size={16} /></a>}
              <button onClick={() => navigate(`/edit/${g.eventId}`)} aria-label="Edit event" className="w-9 h-9 rounded-xl border border-gray-300 flex items-center justify-center hover:bg-gray-50 cursor-pointer"><Pencil size={16} /></button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** One piece of a multi-day bar (laptop): rounded where the function starts/ends or the week wraps */
function BarPiece({ f, lane, weekday }) {
  const starts = f.dayIndex === 1 || weekday === 0;
  const ends = f.dayIndex === f.days || weekday === 6;
  const label = f.dayIndex === 1 ? `${f.client} · ${f.days} days` : weekday === 0 ? `◂ ${f.client}` : '';
  return (
    <div data-testid="bar" data-lane={lane}
      className={`mt-1 h-[19px] text-[11px] font-medium py-0.5 truncate leading-[15px]
        ${(BAR[f.status] || BAR.draft)[lane % 2]}
        ${starts ? 'rounded-l pl-1.5' : '-ml-1.5 pl-1.5 border-l-0'} ${ends ? 'rounded-r pr-1.5' : '-mr-1.5 border-r-0'}`}>
      {label || '\u00a0'}
    </div>
  );
}

/** One piece of a multi-day line (phone), along the bottom of the day */
function LinePiece({ f, lane, weekday }) {
  const starts = f.dayIndex === 1 || weekday === 0;
  const ends = f.dayIndex === f.days || weekday === 6;
  const isDraft = f.status === 'draft';
  return (
    <i data-testid="line" data-lane={lane}
      className={`absolute ${isDraft ? 'h-0' : 'h-[3px]'} ${lane ? 'bottom-[10px]' : 'bottom-1'}
        ${(LINE[f.status] || LINE.draft)[lane % 2]}
        ${starts ? 'left-2 rounded-l' : 'left-0'} ${ends ? 'right-2 rounded-r' : 'right-0'}`} />
  );
}

/**
 * What's inside a day cell. Laptop: multi-day bars in their lanes (empty
 * lanes keep their space so bars line up across days), then one-day names,
 * then "+N more". Phone: dots for one-day functions, thin lines along the
 * bottom for multi-day ones.
 */
function DayContents({ fns, lanes, weekday }) {
  const multi = fns.filter(f => f.days > 1);
  const singles = fns.filter(f => !(f.days > 1));
  const laneOf = (f) => lanes[f.fnKey] ?? 0;
  const top = multi.length ? Math.max(...multi.map(laneOf)) + 1 : 0;

  // laptop
  const laptopSlots = Math.min(top, LAPTOP_LANES);
  const visibleSingles = singles.slice(0, Math.max(1, LAPTOP_LANES - laptopSlots));
  const laptopHidden = multi.filter(f => laneOf(f) >= LAPTOP_LANES).length + singles.length - visibleSingles.length;
  // phone
  const phoneHidden = multi.filter(f => laneOf(f) >= PHONE_LANES).length + Math.max(0, singles.length - 4);

  return (
    <>
      <div className="hidden md:block">
        {Array.from({ length: laptopSlots }, (_, lane) => {
          const f = multi.find(x => laneOf(x) === lane);
          return f ? <BarPiece key={f.key} f={f} lane={lane} weekday={weekday} /> : <div key={`gap${lane}`} className="mt-1 h-[19px]" />;
        })}
        {visibleSingles.map(f => <div key={f.key} className={`mt-1 text-[11px] font-medium rounded px-1.5 py-0.5 truncate ${CHIP[f.status] || CHIP.draft}`}>{f.client}</div>)}
        {laptopHidden > 0 && <div className="text-[10.5px] text-bb-muted mt-0.5">+{laptopHidden} more</div>}
      </div>
      <div className="md:hidden flex justify-center items-center gap-0.5 mt-1 h-1.5">
        {singles.slice(0, 4).map(f => <i key={f.key} className={`w-1.5 h-1.5 rounded-full ${DOT[f.status] || DOT.draft}`} />)}
        {phoneHidden > 0 && <span className="text-[9px] leading-none font-bold text-bb-muted">+{phoneHidden}</span>}
      </div>
      <div className="md:hidden">
        {multi.filter(f => laneOf(f) < PHONE_LANES).map(f => <LinePiece key={f.key} f={f} lane={laneOf(f)} weekday={weekday} />)}
      </div>
    </>
  );
}

/** The two-box colour key ("Day" busy-ness and "Event" status) */
function Legend({ compact }) {
  const box = 'flex flex-wrap items-center gap-x-3 gap-y-1 bg-white border border-bb-border rounded-lg px-3 py-1.5 text-xs text-bb-muted';
  const head = 'text-[11px] font-semibold uppercase tracking-wider text-bb-text pr-3 border-r border-bb-border';
  const days = compact ? ['some', 'near', 'full', 'over'] : ['free', 'some', 'near', 'full', 'over'];
  const short = { some: 'Busy', near: 'Nearly', full: 'Full', over: 'Over' };
  return (
    <>
      <div className={box}>
        <span className={head}>Day</span>
        {days.map(k => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <i className={`w-3.5 h-3.5 rounded border border-bb-border ${LOAD_BG[k]}`} />{compact ? short[k] : LOAD_LABEL[k]}
          </span>
        ))}
      </div>
      <div className={box}>
        <span className={head}>Event</span>
        {['confirmed', 'draft', 'completed'].map(s => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <i className={`w-2.5 h-2.5 rounded-full ${DOT[s]}`} />{s === 'draft' && !compact ? 'Draft (tentative)' : s === 'completed' && compact ? 'Done' : STATUS_NAME[s]}
          </span>
        ))}
      </div>
    </>
  );
}

// ============================================================
// Calendar — MAIN COMPONENT
// ============================================================

export default function Calendar() {
  const { events, settings, isOwner, canEditSettings } = useApp();
  const navigate = useNavigate();
  const today = isoDate(new Date());

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(today);
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('');
  const isPhone = useIsPhone();
  // 'month' | 'list' — phones remember the last choice
  const [view, setViewState] = useState(() => { try { return localStorage.getItem('es-cal-view') || 'month'; } catch { return 'month'; } });
  const setView = (v) => { setViewState(v); try { localStorage.setItem('es-cal-view', v); } catch { /* private mode */ } };
  const [sheet, setSheet] = useState(null);            // phones: 'filters' | 'key'

  // ------------------------------------------------------------
  // DERIVED / CALCULATED VALUES
  // ------------------------------------------------------------
  const max = Number(settings.maxEventsPerDay) > 0 ? Number(settings.maxEventsPerDay) : DEFAULT_MAX_PER_DAY;
  const allFns = useMemo(() => eventFunctions(events), [events]);
  const shown = useMemo(() => filterFunctions(allFns, { status, type }), [allFns, status, type]);
  const shownByDate = useMemo(() => groupByDate(expandDays(shown)), [shown]);
  const allByDate = useMemo(() => groupByDate(expandDays(allFns)), [allFns]);   // busy-ness ignores filters
  const lanes = useMemo(() => assignLanes(shown), [shown]);
  const weeks = useMemo(() => monthGrid(month.y, month.m), [month]);
  const usedTypes = useMemo(() => [...new Set(allFns.map(f => f.eventType).filter(Boolean))].sort((a, b) => EVENT_TYPES.indexOf(a) - EVENT_TYPES.indexOf(b)), [allFns]);
  const reminders = useMemo(() => (isOwner ? upcomingReminders(allFns, today, 14, Number(settings.reminderDaysBefore) || undefined) : []), [isOwner, allFns, today, settings.reminderDaysBefore]);

  const loadOf = (date) => dayLoad(dayCount(allByDate[date]), max);
  const selFns = shownByDate[selected] || [];
  const selCount = dayCount(allByDate[selected]);
  const selDrafts = (allByDate[selected] || []).filter(f => f.status === 'draft').length;
  const monthPrefix = `${month.y}-${String(month.m + 1).padStart(2, '0')}`;
  const listDates = Object.keys(shownByDate).filter(d => d.startsWith(monthPrefix)).sort();

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const shiftMonth = (n) => setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { const d = new Date(); setMonth({ y: d.getFullYear(), m: d.getMonth() }); setSelected(today); };
  const openEvent = (f) => navigate(f.status === 'draft' ? `/edit/${f.eventId}` : `/${f.status === 'completed' ? 'completed' : 'confirmed'}`, { state: { expandId: f.eventId } });

  const openLimitSettings = () => navigate(isPhone ? '/settings/calendar' : '/settings', { state: { tab: 'calendar' } });

  // ------------------------------------------------------------
  // RENDER — pieces
  // ------------------------------------------------------------
  const dayPanel = (
    <div className="space-y-2.5" data-testid="day-panel">
      <div className={isPhone ? 'px-1' : ''}>
        <h2 className={isPhone ? 'text-[16px] font-bold text-bb-text' : 'text-base font-semibold text-bb-text'}>{longDay(selected)}</h2>
        <p className="text-xs text-bb-muted">
          {selCount} {selCount === 1 ? 'event' : 'events'}{selDrafts ? ` + ${selDrafts} draft${selDrafts > 1 ? 's' : ''}` : ''} · limit {max} a day
        </p>
      </div>
      {selCount > max && (
        <p className="flex gap-2 text-sm font-medium text-rose-700 bg-rose-50 rounded-lg px-3 py-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          {selCount - max} over your daily limit — check crew and vehicles before confirming more.
        </p>
      )}
      {selFns.length === 0
        ? <p className="text-sm text-bb-muted py-3">{selCount || selDrafts ? 'Nothing matches the filters.' : 'Free day.'}</p>
        : isPhone
          ? <div className="bg-white border border-bb-border rounded-2xl px-4">{selFns.map(f => <FunctionLine key={f.key} f={f} showAmount={isOwner} onOpen={() => openEvent(f)} />)}</div>
          : selFns.map(f => <FunctionCard key={f.key} f={f} showAmount={isOwner} onOpen={() => openEvent(f)} />)}
    </div>
  );

  const remindersPanel = isOwner && (
    <div className="space-y-2 pt-1" data-testid="reminders-panel">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-bb-muted flex items-center gap-1.5"><Bell size={13} /> Reminders</h3>
      <ReminderSwitch />
      {reminders.length === 0
        ? <p className="text-xs text-bb-muted">No confirmed events in the next 2 weeks.</p>
        : reminders.slice(0, 5).map(r => (
          <div key={r.key} className="text-xs border-t border-bb-border pt-2">
            <b className="text-bb-text">{r.client} — {r.name}</b>
            <span className="block text-bb-muted">{shortDay(r.date)} · reminder on {shortDay(r.remindOn)}, 9 am</span>
          </div>
        ))}
    </div>
  );

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="space-y-4 pb-8">
      {!isPhone && <PageHeader title="Calendar"
        actions={<Seg label="View" value={view} onChange={setView} testId="cal-view" options={[{ value: 'month', label: 'Month' }, { value: 'list', label: 'List' }]} />} />}

      {/* === PHONE: Month | List · filters · month switcher === */}
      {isPhone && (
        <StickyBar className="!py-3 space-y-3" testId="cal-sticky">
          <div className="flex items-center gap-2">
            <SegmentedTabs className="flex-1" value={view} onChange={setView} testId="cal-view"
              options={[{ value: 'month', label: 'Month' }, { value: 'list', label: 'List' }]} />
            <IconButton icon={SlidersHorizontal} label="Filters" onClick={() => setSheet('filters')} data-testid="cal-filters"
              className={status !== 'all' || type ? '!border-bb-accent !text-bb-accent-hover !bg-violet-50' : ''} />
          </div>
          <div className="flex items-center gap-2">
            <IconButton icon={ChevronLeft} label="Previous month" tone="quiet" onClick={() => shiftMonth(-1)} />
            <span className="flex-1 text-center text-[17px] font-bold text-bb-text" data-testid="month-title">{monthTitle(month.y, month.m)}</span>
            <IconButton icon={ChevronRight} label="Next month" tone="quiet" onClick={() => shiftMonth(1)} />
            <button onClick={goToday} className="min-h-[40px] px-3 rounded-full border border-gray-300 bg-white text-[13.5px] font-semibold cursor-pointer">Today</button>
          </div>
          {(status !== 'all' || type) && (
            <p className="text-[13px] text-gray-600">Showing {STATUS_FILTERS.find(x => x.id === status)?.label.toLowerCase()}{type ? ` · ${type}` : ''} · <button onClick={() => { setStatus('all'); setType(''); }} className="font-semibold text-bb-accent-hover cursor-pointer">Clear</button></p>
          )}
        </StickyBar>
      )}

      {/* Month switcher, filters, view toggle (laptop) */}
      {!isPhone && <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 bg-white border border-bb-border rounded-2xl px-3 py-2 shadow-[0_6px_10px_-8px_rgba(0,0,0,0.18)]" data-testid="cal-filters-strip">
        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between">
          <IconButton icon={ChevronLeft} label="Previous month" tone="quiet" size={32} iconSize={17} onClick={() => shiftMonth(-1)} />
          <b className="min-w-[140px] text-center text-[14px] text-bb-text" data-testid="month-title">{monthTitle(month.y, month.m)}</b>
          <IconButton icon={ChevronRight} label="Next month" tone="quiet" size={32} iconSize={17} onClick={() => shiftMonth(1)} />
          <button onClick={goToday} className="h-[32px] px-3 rounded-lg border border-gray-300 bg-white text-[13px] font-semibold cursor-pointer hover:bg-gray-50">Today</button>
        </div>
        <Seg label="Status" value={status} onChange={setStatus} testId="cal-status" options={STATUS_FILTERS.map(f => ({ value: f.id, label: f.label }))} />
        <select aria-label="Event type" value={type} onChange={e => setType(e.target.value)} className="ml-auto h-[34px] bg-white border border-gray-300 rounded-lg px-3 text-[13px] font-semibold cursor-pointer">
          <option value="">All event types</option>
          {usedTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>}

      {/* Colour key (laptop) */}
      <div className="hidden md:flex flex-wrap gap-2 items-stretch">
        <Legend />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        {/* ---------- Month grid ---------- */}
        {view === 'month' ? (
          <div className="bg-bb-card border border-bb-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-7 border-b border-bb-border">
              {WEEKDAYS.map(d => <div key={d} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-bb-muted text-center md:text-left">{d}</div>)}
            </div>
            <div className="grid grid-cols-7" data-testid="month-grid">
              {weeks.flat().map(({ date, inMonth }) => {
                const fns = shownByDate[date] || [];
                const load = loadOf(date);
                const count = dayCount(allByDate[date]);
                const isSel = date === selected;
                return (
                  <button key={date} onClick={() => setSelected(date)} data-date={date} data-load={load}
                    className={`relative flex flex-col justify-start text-left min-h-[52px] md:min-h-[96px] p-1 md:p-1.5 border-r border-b border-bb-border [&:nth-child(7n)]:border-r-0 cursor-pointer
                      ${inMonth ? LOAD_BG[load] : 'bg-gray-50 text-gray-300'} ${isSel ? 'outline outline-2 -outline-offset-2 outline-bb-accent z-10' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs md:text-sm font-semibold ${date === today ? 'bg-bb-accent text-white rounded-full px-1.5' : ''}`}>{Number(date.slice(8))}</span>
                      {inMonth && LOAD_BADGE[load] && <span className={`hidden md:inline text-[10px] font-bold px-1.5 rounded ${LOAD_BADGE[load]}`}>{count}/{max}{load === 'over' ? ' !' : ''}</span>}
                    </div>
                    <DayContents fns={fns} lanes={lanes} weekday={weekdayOf(date)} />
                  </button>
                );
              })}
            </div>
          </div>
        ) : isPhone ? (
          /* ---------- List view (phone): date label, then one card of flat lines per day ---------- */
          <div className="space-y-5" data-testid="cal-list">
            {listDates.length === 0
              ? <p className="text-[14px] text-gray-600 text-center py-10"><CalendarDays className="mx-auto mb-2" />Nothing this month.</p>
              : listDates.map(d => {
                const n = dayCount(allByDate[d]);
                return (
                  <section key={d} className="space-y-2">
                    <p className="flex items-baseline justify-between px-1">
                      <b className={`text-[14.5px] ${d === today ? 'text-bb-accent-hover' : 'text-bb-text'}`}>{d === today ? 'Today · ' : ''}{longDay(d)}</b>
                      <span className={`text-[12.5px] font-semibold ${n > max ? 'text-rose-700' : 'text-gray-500'}`}>{n} of {max}</span>
                    </p>
                    <div className="bg-white border border-bb-border rounded-2xl px-4">
                      {shownByDate[d].map(f => <FunctionLine key={f.key} f={f} showAmount={isOwner} onOpen={() => openEvent(f)} />)}
                    </div>
                  </section>
                );
              })}
          </div>
        ) : (
          /* ---------- List view (laptop) ---------- */
          <Card>
            {listDates.length === 0
              ? <p className="text-sm text-bb-muted text-center py-8"><CalendarDays className="mx-auto mb-2" />Nothing this month.</p>
              : listDates.map(d => (
                <div key={d} className="py-2 border-b border-bb-border last:border-0">
                  <p className="text-sm font-semibold text-bb-text mb-1.5">{longDay(d)} <span className="text-xs font-normal text-bb-muted">· {dayCount(allByDate[d])}/{max}</span></p>
                  <div className="grid gap-2 md:grid-cols-2">{shownByDate[d].map(f => <FunctionCard key={f.key} f={f} showAmount={isOwner} onOpen={() => openEvent(f)} />)}</div>
                </div>
              ))}
          </Card>
        )}

        {/* ---------- Selected day + reminders ---------- */}
        <div className="space-y-3">
          {/* phone: one-line key, ⓘ explains the day colours */}
          {isPhone && view === 'month' && (
            <div className="flex items-center gap-3 text-[13px] text-gray-600 px-1">
              <span className="inline-flex items-center gap-1.5"><i className={`w-2.5 h-2.5 rounded-full ${DOT.confirmed}`} />Confirmed</span>
              <span className="inline-flex items-center gap-1.5"><i className={`w-2.5 h-2.5 rounded-full ${DOT.draft}`} />Draft</span>
              <span className="inline-flex items-center gap-1.5"><i className={`w-2.5 h-2.5 rounded-full ${DOT.completed}`} />Done</span>
              <IconButton icon={Info} label="What the colours mean" tone="quiet" size={36} iconSize={17} className="ml-auto" onClick={() => setSheet('key')} />
            </div>
          )}
          {isPhone && view === 'month' && <div className="pt-1">{dayPanel}</div>}
          {remindersPanel && <Card>{remindersPanel}</Card>}
          {!isOwner && <p className="text-xs text-bb-muted px-1">Amounts are visible to owners only.</p>}
          {/* Daily limit — what it means; changed in Settings */}
          <Card>
            <div className="space-y-1.5" data-testid="limit-info">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-bb-muted flex items-center gap-1.5"><Users size={13} /> Daily limit: {max} events</h3>
              <p className="text-xs text-bb-muted">
                Your team can handle up to {max} events a day. Busier days turn orange, full days red, and you’re asked before confirming more.
              </p>
              {canEditSettings && (
                <button onClick={openLimitSettings} className="text-xs font-medium text-bb-accent hover:underline cursor-pointer">Edit in Settings →</button>
              )}
            </div>
          </Card>
        </div>
      </div>
      {/* === LAPTOP: the chosen day's events as cards under the calendar === */}
      {!isPhone && view === 'month' && (
        <section className="space-y-3" data-testid="day-section">
          <p className="flex items-baseline gap-2.5 px-1">
            <b className="text-[16px] text-bb-text">{longDay(selected)}</b>
            <span className="text-[12.5px] text-bb-muted">{selCount} {selCount === 1 ? 'event' : 'events'}{selDrafts ? ` + ${selDrafts} draft${selDrafts > 1 ? 's' : ''}` : ''} · limit {max} a day</span>
          </p>
          {selCount > max && (
            <p className="flex gap-2 text-sm font-medium text-rose-700 bg-rose-50 rounded-lg px-3 py-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{selCount - max} over your daily limit — check crew and vehicles before confirming more.</p>
          )}
          {selFns.length === 0
            ? <p className="text-sm text-bb-muted bg-white border border-bb-border rounded-2xl px-4 py-5">{selCount || selDrafts ? 'Nothing matches the filters.' : 'Free day.'}</p>
            : <DayCardsLaptop fns={selFns} events={events} showAmount={isOwner} navigate={navigate} openEvent={openEvent} />}
        </section>
      )}
      {/* === PHONE SHEETS: filters · colour key === */}
      {sheet === 'filters' && (
        <BottomSheet open onClose={() => setSheet(null)} title="Filters" testId="cal-filter-sheet"
          footer={<button onClick={() => setSheet(null)} className="w-full min-h-[48px] rounded-xl bg-bb-accent text-white font-semibold cursor-pointer">Show</button>}>
          <p className="text-[13px] font-semibold text-gray-700 mb-2">Status</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {STATUS_FILTERS.map(x => (
              <button key={x.id} onClick={() => setStatus(x.id)} className={`min-h-[40px] px-3.5 rounded-full border text-[14px] font-semibold cursor-pointer ${status === x.id ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300'}`}>{x.label}</button>
            ))}
          </div>
          <label className="block">
            <span className="block text-[13px] font-semibold text-gray-700 mb-2">Event type</span>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full min-h-[48px] rounded-xl border border-bb-border bg-bb-input px-3.5 text-[16px]">
              <option value="">All event types</option>
              {usedTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </BottomSheet>
      )}
      {sheet === 'key' && (
        <BottomSheet open onClose={() => setSheet(null)} title="What the colours mean" testId="cal-key-sheet">
          <div className="flex flex-col gap-2 items-start pb-2"><Legend /></div>
          <p className="text-[13.5px] text-gray-600 mt-2">Your daily limit is {max} events. Busier days turn orange, full days red, and you’re asked before confirming more.</p>
        </BottomSheet>
      )}
    </div>
  );
}
