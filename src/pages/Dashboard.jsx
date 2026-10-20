/**
 * Dashboard — Home page with overview statistics
 *
 * Displays key metrics (drafts, confirmed, completed, revenue) and the
 * upcoming confirmed events (nearest first). Each tile opens its page
 * (Revenue → Reports, owners only).
 *
 * Phones and laptops share the event card (EventCard: Quote · Call ·
 * WhatsApp · ⋯, every function listed); laptops show two per row under a
 * PageHeader with "New event".
 *
 * Read-only vs. Firestore: only reads `events` from AppContext.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import EventCard, { EventItemsSheet, EventMoreSheet } from '../components/EventCard';
import { PlanTag } from '../components/UpgradeCard';
import { SectionLabel } from '../components/PhoneUI';
import { useIsPhone } from '../components/useIsPhone';
import { formatRupees, sortByActiveDate } from '../utils/helpers';
import { FileText, CheckCircle, PartyPopper, IndianRupee, CalendarDays, Plus } from 'lucide-react';

// ============================================================
// Dashboard — MAIN COMPONENT
// ============================================================

/** Main dashboard view with stats and upcoming events */
export default function Dashboard() {
  const { events, isOwner, updateEvent, showToast, isSuspended, askUnlock, canUse } = useApp();
  const navigate = useNavigate();
  const [itemsId, setItemsId] = useState(null); // phone: items sheet
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
    { label: 'Drafts', value: drafts.length, icon: FileText, color: 'text-amber-400', to: '/drafts' },
    { label: 'Confirmed', value: confirmed.length, icon: CheckCircle, color: 'text-emerald-400', to: '/confirmed' },
    { label: 'Completed', value: completed.length, icon: PartyPopper, color: 'text-blue-400', to: '/completed' },
    { label: 'Revenue', value: formatRupees(revenue), icon: IndianRupee, color: 'text-bb-gold', to: isOwner ? '/reports' : null },
  ];

  // ------------------------------------------------------------
  // EVENT HANDLERS — phone cards
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
    <div className="space-y-5 lg:space-y-7">
      {/* Laptop: page title with the main action */}
      {!isPhone && (
        <PageHeader title="Home" sub="Your business at a glance and the confirmed events coming up"
          actions={<Button icon={Plus} onClick={() => navigate('/new')}>New event</Button>} />
      )}

      {/* Number tiles — each opens its list */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
        {stats.map(s => (
          <Card key={s.label} hover={!!s.to} onClick={s.to ? () => navigate(s.to) : undefined} className="max-lg:!p-4 max-lg:rounded-2xl lg:rounded-2xl">
            <div className="flex items-center gap-3 lg:gap-4" role={s.to ? 'link' : undefined} aria-label={s.to ? `Open ${s.label}` : undefined}>
              <div className={`${s.color} lg:w-11 lg:h-11 lg:rounded-xl lg:bg-bb-bg lg:flex lg:items-center lg:justify-center`}>
                <s.icon size={22} />
              </div>
              <div>
                <p className="text-xs lg:text-[13px] text-bb-muted">{s.label}</p>
                <p className="text-lg lg:text-[22px] font-bold text-bb-text tabular-nums">{s.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Confirmed events — the same card on phones and laptops (two per row on laptops) */}
      <div>
        <SectionLabel className="mb-3" right={displayEvents.length > 0 && (
          <button onClick={() => navigate('/confirmed')} className="text-[14px] font-semibold text-bb-accent-hover min-h-[40px] px-1 cursor-pointer">See all</button>
        )}>Confirmed events</SectionLabel>

        {displayEvents.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <CalendarDays size={40} className="mx-auto text-bb-muted mb-3" />
              <p className="text-bb-muted">No confirmed events</p>
              <p className="text-sm text-bb-muted/60 mt-1">Confirm a draft to see it here</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[repeat(2,minmax(0,1fr))] lg:gap-5 items-start" data-testid="phone-list">
            {displayEvents.map(ev => (
              <EventCard key={ev.id} ev={ev} variant="home"
                on={{
                  quote: () => navigate(`/quotation/${ev.id}`),
                  markDone: guard(() => markDone(ev.id)),
                  items: () => setItemsId(ev.id),
                  more: () => setMoreId(ev.id),
                }} locked={isSuspended} />
            ))}
          </div>
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
