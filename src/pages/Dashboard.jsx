/**
 * Dashboard — Home page with overview statistics
 *
 * Displays key metrics (drafts, confirmed, completed, revenue) and the
 * upcoming confirmed events (nearest first), drawn with the same card face
 * as the Confirmed page. Each stat card opens its page (Revenue → Reports,
 * owners only).
 *
 * Phones: roomier tiles and EventCardPhone cards (Quote · Call · WhatsApp,
 * every function listed). Laptops: "Home" title row with today's date,
 * tiles with icon boxes and ›, and the long EventCardLaptop (Quote only).
 *
 * Firestore: reads `events`; the only write is "Mark as done".
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import EventCardLaptop from '../components/EventCardLaptop';
import { PageHeader } from '../components/LaptopUI';
import EventCardPhone, { EventItemsSheet, EventMoreSheet } from '../components/EventCardPhone';
import { PlanTag } from '../components/UpgradeCard';
import { SectionLabel } from '../components/PhoneUI';
import { useIsPhone } from '../components/useIsPhone';
import { sortByActiveDate, formatRupees } from '../utils/helpers';
import { FileText, CheckCircle, PartyPopper, IndianRupee, CalendarDays, ChevronRight } from 'lucide-react';

// ============================================================
// Dashboard — MAIN COMPONENT
// ============================================================

/** Main dashboard view with stats and upcoming events */
export default function Dashboard() {
  const { events, isOwner, updateEvent, showToast, isSuspended, askUnlock, canUse } = useApp();
  const navigate = useNavigate();
  const [itemsId, setItemsId] = useState(null); // items list (phone sheet / laptop dialog)
  const [moreId, setMoreId] = useState(null);   // phone: an event's ⋯ menu
  const isPhone = useIsPhone();

  // ------------------------------------------------------------
  // DERIVED / CALCULATED VALUES
  // ------------------------------------------------------------

  // Categorize events by status
  const drafts = events.filter(e => e.status === 'draft');
  const confirmed = events.filter(e => e.status === 'confirmed');
  const completed = events.filter(e => e.status === 'completed');
  const revenue = completed.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  // Get confirmed events sorted by active date (nearest first)
  const displayEvents = sortByActiveDate(confirmed);

  // Stats card configuration
  const stats = [
    { label: 'Drafts', value: drafts.length, icon: FileText, color: 'text-amber-400', box: 'bg-amber-50 text-amber-600', to: '/drafts' },
    { label: 'Confirmed', value: confirmed.length, icon: CheckCircle, color: 'text-emerald-400', box: 'bg-emerald-50 text-emerald-600', to: '/confirmed' },
    { label: 'Completed', value: completed.length, icon: PartyPopper, color: 'text-blue-400', box: 'bg-blue-50 text-blue-600', to: '/completed' },
    { label: 'Revenue', value: formatRupees(revenue), icon: IndianRupee, color: 'text-bb-gold', box: 'bg-violet-50 text-bb-accent-hover', to: isOwner ? '/reports' : null },
  ];

  // ------------------------------------------------------------
  // EVENT HANDLERS — event cards
  // ------------------------------------------------------------
  const guard = (fn) => (...args) => (isSuspended ? askUnlock() : fn(...args));
  const fromMore = (fn) => () => { setMoreId(null); fn(); };

  /** Confirmed → Completed */
  const markDone = async (id) => {
    const result = await updateEvent(id, { status: 'completed' });
    showToast(result.success ? 'Event marked as completed' : (result.error || 'Failed to update event'), result.success ? 'success' : 'error');
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Laptop: title row with today's date */}
      {!isPhone && <PageHeader title="Home" sub={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />}

      {/* Stats Grid */}
      {isPhone ? (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <Card key={s.label} hover={!!s.to} onClick={s.to ? () => navigate(s.to) : undefined} className="max-lg:!p-4 max-lg:rounded-2xl">
            <div className="flex items-center gap-3" role={s.to ? 'link' : undefined} aria-label={s.to ? `Open ${s.label}` : undefined}>
              <div className={`${s.color}`}>
                <s.icon size={22} />
              </div>
              <div>
                <p className="text-xs text-bb-muted">{s.label}</p>
                <p className="text-lg font-bold text-bb-text">{s.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      ) : (
      /* Laptop: number tiles with an icon box and › (each opens its list) */
      <div className="grid grid-cols-4 gap-4" data-testid="home-tiles">
        {stats.map(s => (
          <button key={s.label} disabled={!s.to} onClick={s.to ? () => navigate(s.to) : undefined}
            aria-label={s.to ? `Open ${s.label}` : s.label}
            className={`flex items-center gap-3 bg-white border border-bb-border rounded-2xl px-4 py-3.5 text-left ${s.to ? 'cursor-pointer hover:border-bb-accent/50' : 'cursor-default'}`}>
            <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${s.box}`}><s.icon size={19} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12.5px] text-bb-muted font-medium">{s.label}</span>
              <span className="block text-[18px] font-bold text-bb-text tabular-nums truncate">{s.value}</span>
            </span>
            {s.to && <ChevronRight size={17} className="text-bb-muted shrink-0" />}
          </button>
        ))}
      </div>
      )}

      {/* Confirmed Events */}
      <div>
        <SectionLabel className="mb-3" right={displayEvents.length > 0 && (
          <button onClick={() => navigate('/confirmed')} className="text-[14px] font-semibold text-bb-accent-hover min-h-[40px] px-1 cursor-pointer">See all</button>
        )}>{isPhone ? 'Confirmed events' : 'Confirmed events · coming up'}</SectionLabel>

        {displayEvents.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <CalendarDays size={40} className="mx-auto text-bb-muted mb-3" />
              <p className="text-bb-muted">No confirmed events</p>
              <p className="text-sm text-bb-muted/60 mt-1">Confirm a draft to see it here</p>
            </div>
          </Card>
        ) : (
          isPhone ? (
          /* Phone: the same card as the Confirmed page, with Quote · Call · WhatsApp */
          <div className="space-y-4" data-testid="phone-list">
            {displayEvents.map(ev => (
              <EventCardPhone key={ev.id} ev={ev} variant="home"
                on={{
                  quote: () => navigate(`/quotation/${ev.id}`),
                  markDone: guard(() => markDone(ev.id)),
                  items: () => setItemsId(ev.id),
                  more: () => setMoreId(ev.id),
                }} locked={isSuspended} />
            ))}
          </div>
          ) : (
          /* Laptop: the long card, with Quote · Call · WhatsApp · ✎ · ⋯ */
          <div className="space-y-4" data-testid="laptop-list">
            {displayEvents.map(ev => (
              <EventCardLaptop key={ev.id} ev={ev} variant="home" locked={isSuspended}
                on={{
                  quote: () => navigate(`/quotation/${ev.id}`),
                  items: () => setItemsId(ev.id),
                  markDone: guard(() => markDone(ev.id)),
                  edit: guard(() => navigate(`/edit/${ev.id}`)),
                  addItems: guard(() => navigate(`/quotation/${ev.id}`)),
                }} />
            ))}
          </div>
          )
        )}
      </div>
      {moreId && (() => {
        const ev = events.find(e => e.id === moreId);
        return ev && (
          <EventMoreSheet ev={ev} onClose={() => setMoreId(null)} locked={isSuspended}
            contractTag={!canUse('contracts') ? <PlanTag feature="contracts" /> : null}
            on={{
              edit: fromMore(guard(() => navigate(`/edit/${ev.id}`))),
              bill: fromMore(() => navigate(`/bill/${ev.id}`)),
              contract: fromMore(() => navigate(`/contract/${ev.id}`)),
              markDone: fromMore(guard(() => markDone(ev.id))),
            }} />
        );
      })()}
      {itemsId && <EventItemsSheet ev={events.find(e => e.id === itemsId)} onClose={() => setItemsId(null)} onEdit={() => navigate(`/quotation/${itemsId}`)} />}
    </div>
  );
}
