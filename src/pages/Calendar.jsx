/**
 * Calendar — month view of every event function, coloured by how busy each
 * day is against the company's daily limit ("max events a day").
 *
 * - Day colours: free / has events / nearly full / full / over the limit.
 *   Only confirmed and completed functions fill a day; drafts show dashed.
 * - Filters: status and event type. Month or List view.
 * - Tap a day to see its functions (side panel on laptops, below on phones);
 *   tap a function to open the event.
 * - Owners: change the daily limit, see upcoming reminders and turn on
 *   reminder notifications for this device. Staff never see amounts.
 *
 * Logic lives in utils/calendar.js; this file only lays it out.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, AlertTriangle, Bell, CalendarDays } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Input from '../components/Input';
import ReminderSwitch from '../components/ReminderSwitch';
import { EVENT_TYPES } from '../constants/data';
import { formatCurrency } from '../utils/helpers';
import {
  DEFAULT_MAX_PER_DAY, monthGrid, isoDate, eventFunctions, filterFunctions, groupByDate,
  dayCount, dayLoad, upcomingReminders,
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
      <p className="text-xs text-bb-muted mt-0.5">
        {[f.name, time12(f.time), f.location].filter(Boolean).join(' · ')}
      </p>
      {showAmount && f.amount != null && (
        <p className={`text-sm font-semibold mt-1 ${f.status === 'draft' ? 'text-bb-muted' : 'text-emerald-600'}`}>
          {f.status === 'draft' ? 'Quote ' : ''}{formatCurrency(f.amount)}
        </p>
      )}
    </button>
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
  const { events, settings, isOwner, canEditSettings, updateSettings, showToast } = useApp();
  const navigate = useNavigate();
  const today = isoDate(new Date());

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(today);
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('');
  const [view, setView] = useState('month');           // 'month' | 'list'
  const [limitOpen, setLimitOpen] = useState(false);
  const [limitInput, setLimitInput] = useState('');

  // ------------------------------------------------------------
  // DERIVED / CALCULATED VALUES
  // ------------------------------------------------------------
  const max = Number(settings.maxEventsPerDay) > 0 ? Number(settings.maxEventsPerDay) : DEFAULT_MAX_PER_DAY;
  const allFns = useMemo(() => eventFunctions(events), [events]);
  const shown = useMemo(() => filterFunctions(allFns, { status, type }), [allFns, status, type]);
  const shownByDate = useMemo(() => groupByDate(shown), [shown]);
  const allByDate = useMemo(() => groupByDate(allFns), [allFns]);   // busy-ness ignores filters
  const weeks = useMemo(() => monthGrid(month.y, month.m), [month]);
  const usedTypes = useMemo(() => [...new Set(allFns.map(f => f.eventType).filter(Boolean))].sort((a, b) => EVENT_TYPES.indexOf(a) - EVENT_TYPES.indexOf(b)), [allFns]);
  const reminders = useMemo(() => (isOwner ? upcomingReminders(allFns, today, 14) : []), [isOwner, allFns, today]);

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

  const saveLimit = async () => {
    const n = Math.round(Number(limitInput));
    if (!(n >= 1 && n <= 50)) { showToast('Enter a number from 1 to 50', 'error'); return; }
    const r = await updateSettings({ maxEventsPerDay: n });
    if (r.success) { showToast(`Daily limit set to ${n}`); setLimitOpen(false); }
  };

  // ------------------------------------------------------------
  // RENDER — pieces
  // ------------------------------------------------------------
  const dayPanel = (
    <div className="space-y-2.5" data-testid="day-panel">
      <div>
        <h2 className="text-base font-semibold text-bb-text">{longDay(selected)}</h2>
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
      <h1 className="text-xl font-bold text-bb-text">Calendar</h1>

      {/* Month switcher, filters, view toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between">
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="p-2 rounded-lg border border-bb-border bg-white cursor-pointer"><ChevronLeft size={16} /></button>
          <span className="min-w-[150px] text-center font-semibold text-bb-text" data-testid="month-title">{monthTitle(month.y, month.m)}</span>
          <button onClick={() => shiftMonth(1)} aria-label="Next month" className="p-2 rounded-lg border border-bb-border bg-white cursor-pointer"><ChevronRight size={16} /></button>
          <button onClick={goToday} className="hidden sm:block px-3 py-1.5 rounded-lg border border-bb-border bg-white text-sm font-medium cursor-pointer">Today</button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {STATUS_FILTERS.map(s => (
            <button key={s.id} onClick={() => setStatus(s.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border cursor-pointer ${status === s.id ? 'bg-bb-accent text-white border-bb-accent' : 'bg-white text-bb-muted border-bb-border'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <select aria-label="Event type" value={type} onChange={e => setType(e.target.value)} className="bg-white border border-bb-border rounded-lg px-3 py-1.5 text-sm">
          <option value="">All event types</option>
          {usedTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="hidden md:flex ml-auto gap-1.5">
          {['month', 'list'].map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg border text-sm font-medium cursor-pointer ${view === v ? 'bg-white border-bb-accent text-bb-text' : 'bg-white border-bb-border text-bb-muted'}`}>
              {v === 'month' ? 'Month' : 'List'}
            </button>
          ))}
        </div>
      </div>

      {/* Colour key + daily limit (laptop) */}
      <div className="hidden md:flex flex-wrap gap-2 items-stretch">
        <Legend />
        <div className="ml-auto flex items-center gap-2 bg-white border border-bb-border rounded-lg px-3 py-1.5 text-xs text-bb-text">
          Max <b>{max}</b> events a day
          {canEditSettings && <button onClick={() => { setLimitInput(String(max)); setLimitOpen(true); }} className="underline text-bb-accent cursor-pointer">change</button>}
        </div>
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
                    className={`relative text-left min-h-[52px] md:min-h-[96px] p-1 md:p-1.5 border-r border-b border-bb-border [&:nth-child(7n)]:border-r-0 cursor-pointer
                      ${inMonth ? LOAD_BG[load] : 'bg-gray-50 text-gray-300'} ${isSel ? 'outline outline-2 -outline-offset-2 outline-bb-accent z-10' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs md:text-sm font-semibold ${date === today ? 'bg-bb-accent text-white rounded-full px-1.5' : ''}`}>{Number(date.slice(8))}</span>
                      {inMonth && LOAD_BADGE[load] && <span className={`hidden md:inline text-[10px] font-bold px-1.5 rounded ${LOAD_BADGE[load]}`}>{count}/{max}{load === 'over' ? ' !' : ''}</span>}
                    </div>
                    {/* laptop: names; phone: dots */}
                    <div className="hidden md:block">
                      {fns.slice(0, 2).map(f => <div key={f.key} className={`mt-1 text-[11px] font-medium rounded px-1.5 py-0.5 truncate ${CHIP[f.status] || CHIP.draft}`}>{f.client}</div>)}
                      {fns.length > 2 && <div className="text-[10.5px] text-bb-muted mt-0.5">+{fns.length - 2} more</div>}
                    </div>
                    <div className="md:hidden flex justify-center gap-0.5 mt-1">
                      {fns.slice(0, 4).map(f => <i key={f.key} className={`w-1.5 h-1.5 rounded-full ${DOT[f.status] || DOT.draft}`} />)}
                    </div>
                  </button>
                );
              })}
            </div>
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
          {/* phone: compact key */}
          <div className="md:hidden flex flex-col gap-2 items-start"><Legend compact /></div>
          <Card>{dayPanel}</Card>
          {remindersPanel && <Card>{remindersPanel}</Card>}
          {!isOwner && <p className="text-xs text-bb-muted px-1">Amounts are visible to owners only.</p>}
          {canEditSettings && (
            <button onClick={() => { setLimitInput(String(max)); setLimitOpen(true); }} className="md:hidden text-xs text-bb-accent underline px-1 cursor-pointer">Change daily limit ({max})</button>
          )}
        </div>
      </div>

      {/* Daily limit (owners) */}
      <Modal isOpen={limitOpen} onClose={() => setLimitOpen(false)} title="Max events a day" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-bb-muted">How many events can your team handle on one day? Days at the limit turn red, and you’ll get a warning before confirming more.</p>
          <Input label="Events per day" type="number" min="1" max="50" value={limitInput} onChange={e => setLimitInput(e.target.value)} />
          <Button fullWidth onClick={saveLimit}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}
