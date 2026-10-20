/**
 * Dashboard — Home page with overview statistics
 *
 * Displays key metrics (drafts, confirmed, completed, revenue) and the
 * upcoming confirmed events (nearest first), drawn with the same card face
 * as the Confirmed page. Each stat card opens its page (Revenue → Reports,
 * owners only).
 *
 * Phones: roomier tiles and EventCardPhone cards (Quote · Call · WhatsApp,
 * every function listed); laptops keep the compact cards.
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
import EventSummary from '../components/EventSummary';
import EventCardPhone, { EventItemsSheet, EventMoreSheet } from '../components/EventCardPhone';
import { PlanTag } from '../components/UpgradeCard';
import { SectionLabel } from '../components/PhoneUI';
import { useIsPhone } from '../components/useIsPhone';
import { formatCurrency, telLink, sortByActiveDate } from '../utils/helpers';
import { FileText, CheckCircle, PartyPopper, IndianRupee, Phone, CalendarDays } from 'lucide-react';

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
    { label: 'Revenue', value: formatCurrency(revenue), icon: IndianRupee, color: 'text-bb-gold', to: isOwner ? '/reports' : null },
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
    <div className="space-y-5 lg:space-y-6">
      {/* Stats Grid */}
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

      {/* Confirmed Events */}
      <div>
        {!isPhone && <h2 className="text-lg font-semibold text-bb-text mb-3">Confirmed Events</h2>}
        {isPhone && <SectionLabel className="mb-3" right={displayEvents.length > 0 && (
          <button onClick={() => navigate('/confirmed')} className="text-[14px] font-semibold text-bb-accent-hover min-h-[40px] px-1 cursor-pointer">See all</button>
        )}>Confirmed events</SectionLabel>}

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
          <div className="space-y-3">
            {displayEvents.map(ev => (
              // Same card face as the Confirmed page; tapping opens that event there
              <Card key={ev.id} hover onClick={() => navigate('/confirmed', { state: { expandId: ev.id } })}>
                <EventSummary
                  ev={ev}
                  right={ev.clientPhone && (
                    <a
                      href={telLink(ev.clientPhone)}
                      onClick={e => e.stopPropagation()}
                      aria-label={`Call ${ev.clientName}`}
                      className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                    >
                      <Phone size={14} />
                    </a>
                  )}
                />
              </Card>
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
