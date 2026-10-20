/**
 * DraftsList — Draft events management page
 *
 * Displays all draft events in an expandable card list with search filtering.
 * Each card shows client info, event details, items, and action buttons.
 * Backward compatible with old event format (no mainEvent/subEvents).
 * Phones get EventCardPhone (Confirm · Quote · Call · ⋯); laptops (1024px+)
 * keep the fold-open cards.
 *
 * Confirm/Delete actions await the Firestore result before showing a
 * success toast — see CODE_STRUCTURE.md §3-4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import StickyBar from '../components/StickyBar';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import { formatCurrency, formatDateRange, eventCountdown, telLink, waLink, sortByActiveDate, getAllEventDates, getActiveDate } from '../utils/helpers';
import { capacityQuestion, DEFAULT_MAX_PER_DAY } from '../utils/calendar';
import {
  Search, Phone, MessageSquare, Edit, FileText, CheckCircle,
  Trash2, CalendarDays, MapPin, PackageOpen, ChevronDown, ChevronUp,
  Home, Navigation, IndianRupee,
  Lock,
} from 'lucide-react';
import { useConfirm } from '../components/useConfirm';
import EventCardPhone, { EventItemsSheet, EventMoreSheet } from '../components/EventCardPhone';
import { useIsPhone } from '../components/useIsPhone';

// ============================================================
// HELPERS
// ============================================================

/**
 * Helper: get all items from an event (both old and new format)
 */
function getAllItems(ev) {
  if (ev.mainEvent) {
    const items = [...(ev.mainEvent.items || [])];
    (ev.subEvents || []).forEach(s => {
      (s.items || []).forEach(item => {
        if (!items.includes(item)) items.push(item);
      });
    });
    return items;
  }
  return ev.items || [];
}

/**
 * Helper: get event location (backward compatible)
 */
function getEventLocation(ev) {
  if (ev.mainEvent?.location) return ev.mainEvent.location;
  return ev.eventLocation || '';
}

// ============================================================
// DraftsList — MAIN COMPONENT
// ============================================================

/** Lists all draft events with search, expand/collapse, and actions */
export default function DraftsList() {
  const { events, settings, deleteEvent, updateEvent, showToast, isSuspended, askUnlock } = useApp();
  // Read-only (plan ended / paused): these buttons show a lock and explain why
  const guard = (fn) => (...args) => (isSuspended ? askUnlock() : fn(...args));
  const lk = (icon) => (isSuspended ? Lock : icon);
  const confirm = useConfirm();
  const navigate = useNavigate();
  const isPhone = useIsPhone();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [itemsId, setItemsId] = useState(null); // phone: items sheet
  const [moreId, setMoreId] = useState(null);   // phone: ⋯ sheet

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------

  // Filter drafts by search query (client name, type, or location)
  const drafts = sortByActiveDate(
    events
      .filter(e => e.status === 'draft')
      .filter(e => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          e.clientName?.toLowerCase().includes(q) ||
          e.eventType?.toLowerCase().includes(q) ||
          getEventLocation(e).toLowerCase().includes(q)
        );
      })
  );

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------

  /** Promotes a draft to confirmed status — only toasts success if the write actually succeeded */
  const confirmEvent = async (id) => {
    // Warn when this would push a day past the company's daily limit (see Calendar)
    const ev = events.find(e => e.id === id);
    const max = Number(settings.maxEventsPerDay) || DEFAULT_MAX_PER_DAY;
    const question = ev && capacityQuestion(ev, events, max);
    if (question && !(await confirm({
      title: 'Over your daily limit',
      message: <>Confirming <b className="text-bb-text">{ev.clientName}</b>: {question.replace(/ Confirm anyway\?$/, '')}</>,
      note: 'Check crew and vehicles before you confirm.',
      confirmLabel: 'Confirm anyway', cancelLabel: 'Not now', tone: 'warning',
    }))) return;
    const result = await updateEvent(id, { status: 'confirmed' });
    if (result.success) {
      showToast('Event confirmed');
    } else {
      showToast(result.error || 'Failed to confirm event', 'error');
    }
  };
  /** Asks first (app pop-up), then deletes. Only toasts success if the write actually succeeded. */
  const handleDelete = async (ev) => {
    const ok = await confirm({
      title: 'Delete this draft?',
      message: <><b className="text-bb-text">{ev.clientName || 'This draft'}</b> and its quote will be deleted.</>,
      note: 'This can’t be undone.',
      confirmLabel: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    const result = await deleteEvent(ev.id);
    if (result.success) showToast('Event deleted');
    // On failure, deleteEvent() already shows its own error toast.
  };


  /** Toggles the expanded/collapsed state of a draft card */
  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="space-y-4">
      <h1 className="hidden lg:block text-xl font-bold text-bb-text">Drafts<span className="inline-flex items-center justify-center align-middle min-w-[1.75rem] h-7 px-2 ml-2 rounded-full bg-violet-100 text-violet-700 text-sm font-bold tabular-nums" data-testid="title-count">{events.filter(e => e.status === 'draft').length}</span></h1>

      {/* Search — stays pinned while scrolling */}
      <StickyBar>
        <Input
          placeholder="Search drafts..."
          icon={Search}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </StickyBar>

      {/* Drafts List */}
      {drafts.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <PackageOpen size={44} className="mx-auto text-bb-muted mb-3" />
            <p className="text-bb-muted font-medium">No drafts found</p>
            <p className="text-sm text-bb-muted/60 mt-1">
              {search ? 'Try a different search' : 'Create a new draft to get started'}
            </p>
            {!search && (
              <Button className="mt-4" onClick={() => navigate('/new')}>Create Draft</Button>
            )}
          </div>
        </Card>
      ) : (
        isPhone ? (
        /* === PHONE: one card per draft === */
        <div className="space-y-4" data-testid="phone-list">
          {drafts.map(ev => (
            <EventCardPhone key={ev.id} ev={ev} variant="draft" locked={isSuspended}
              on={{
                confirm: guard(() => confirmEvent(ev.id)),
                quote: () => navigate(`/quotation/${ev.id}`),
                items: () => setItemsId(ev.id),
                more: () => setMoreId(ev.id),
              }} />
          ))}
          <p className="text-center text-[13px] text-gray-600 pt-1">Drafts move to Confirmed when you tap <b>Confirm</b>.</p>
        </div>
        ) : (
        /* === LAPTOP: fold-open cards === */
        <div className="space-y-3">
          {drafts.map(ev => {
            const eventDates = getAllEventDates(ev);
            const activeDateStr = getActiveDate(ev);
            const activeDays = eventCountdown(ev);
            const allItems = getAllItems(ev);
            const isExpanded = expandedId === ev.id;
            const location = getEventLocation(ev);
            return (
              <Card key={ev.id}>
                <div className="space-y-3">
                  {/* Collapsed Header - Clickable */}
                  <div
                    className="cursor-pointer"
                    onClick={() => toggleExpand(ev.id)}
                  >
                    {/* Line 1: Event name + arrow */}
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-semibold text-bb-text truncate flex-1 mr-2">{ev.clientName}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {activeDays !== null && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            activeDays < 0 ? 'bg-red-100 text-red-700' :
                            activeDays <= 3 ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {activeDays < 0 ? `${Math.abs(activeDays)}d ago` : activeDays === 0 ? 'Today' : `${activeDays}d`}
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp size={18} className="text-bb-muted" />
                        ) : (
                          <ChevronDown size={18} className="text-bb-muted" />
                        )}
                      </div>
                    </div>

                    {/* Line 2: Chips + budget */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge variant="draft">{ev.eventType}</Badge>
                      {ev.budget > 0 && (
                        <span className="text-sm text-bb-muted ml-auto">{formatCurrency(ev.budget)}</span>
                      )}
                    </div>

                    {/* Line 3: Dates (with active highlighted) */}
                    <div className="space-y-1 text-sm">
                      {eventDates.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CalendarDays size={14} className="text-bb-muted flex-shrink-0" />
                          {eventDates.map((d, idx) => {
                            const isActive = d.date === activeDateStr;
                            return (
                              <span key={idx} className={`${
                                isActive
                                  ? 'text-bb-accent font-semibold'
                                  : d.isPast ? 'text-bb-muted/50 line-through' : 'text-bb-muted'
                              }`}>
                                {formatDateRange(d.date, d.endDate)}
                                {eventDates.length > 1 && (
                                  <span className="text-[10px] ml-0.5">({d.isMain ? 'main' : d.label})</span>
                                )}
                                {idx < eventDates.length - 1 && <span className="text-bb-muted mx-0.5">•</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {/* Line 4: Venue — own row so it gets full width to truncate against consistently */}
                      {location && (
                        <div className="flex items-center gap-1 text-bb-muted min-w-0">
                          <MapPin size={14} className="flex-shrink-0" />
                          <span className="truncate">{location}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="space-y-3 pt-2 border-t border-bb-border">
                      {/* All Items */}
                      {allItems.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-bb-muted uppercase mb-1.5">Items</p>
                          <div className="flex flex-wrap gap-1.5">
                            {allItems.map(item => (
                              <span key={item} className="text-xs px-2 py-0.5 bg-bb-accent/10 text-bb-accent rounded-full">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Budget */}
                      {ev.budget && (
                        <div className="flex items-center gap-2 text-sm text-bb-muted">
                          <IndianRupee size={14} />
                          <span>Budget: <span className="text-bb-text font-medium">{formatCurrency(ev.budget)}</span></span>
                        </div>
                      )}

                      {/* Notes */}
                      {ev.notes && (
                        <div>
                          <p className="text-xs font-semibold text-bb-muted uppercase mb-1">Notes</p>
                          <p className="text-sm text-bb-muted bg-bb-input rounded-lg px-3 py-2">{ev.notes}</p>
                        </div>
                      )}

                      {/* Addresses & Locations */}
                      <div className="space-y-2">
                        {ev.clientAddress && (
                          <div className="flex items-start gap-2 text-sm text-bb-muted">
                            <Home size={14} className="flex-shrink-0 mt-0.5" />
                            <span>Client Address: <span className="text-bb-text">{ev.clientAddress}</span></span>
                          </div>
                        )}
                        {ev.houseLocation && (
                          <div className="flex items-start gap-2 text-sm text-bb-muted">
                            <Navigation size={14} className="flex-shrink-0 mt-0.5" />
                            <span>House Location: <span className="text-bb-text">{ev.houseLocation}</span></span>
                          </div>
                        )}
                        {location && (
                          <div className="flex items-start gap-2 text-sm text-bb-muted">
                            <MapPin size={14} className="flex-shrink-0 mt-0.5" />
                            <span>Event Location: <span className="text-bb-text">{location}</span></span>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-bb-border">
                        {ev.clientPhone && (
                          <a href={telLink(ev.clientPhone)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-emerald-600 text-emerald-600 hover:bg-emerald-50 transition-colors">
                            <Phone size={14} /> Call
                          </a>
                        )}
                        {(ev.clientWhatsapp || ev.clientPhone) && (
                          <a href={waLink(ev.clientWhatsapp || ev.clientPhone)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-emerald-600 text-emerald-600 hover:bg-emerald-50 transition-colors">
                            <MessageSquare size={14} /> WhatsApp
                          </a>
                        )}
                        <Button size="sm" variant="secondary" icon={lk(Edit)} onClick={guard(() => navigate(`/edit/${ev.id}`))}>Edit</Button>
                        <Button size="sm" variant="secondary" icon={FileText} onClick={() => navigate(`/quotation/${ev.id}`)}>Quote</Button>
                        <Button size="sm" variant="success" icon={lk(CheckCircle)} onClick={guard(() => confirmEvent(ev.id))}>Confirm</Button>
                        <Button size="sm" variant="outline" icon={lk(Trash2)} className="border-red-500 text-red-500 hover:bg-red-50" onClick={guard(() => handleDelete(ev))}>Delete</Button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons - Always visible in collapsed view */}
                  {!isExpanded && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-bb-border">
                      <Button size="sm" variant="secondary" icon={lk(Edit)} onClick={guard(() => navigate(`/edit/${ev.id}`))}>Edit</Button>
                      <Button size="sm" variant="secondary" icon={FileText} onClick={() => navigate(`/quotation/${ev.id}`)}>Quote</Button>
                      <Button size="sm" variant="success" icon={lk(CheckCircle)} onClick={guard(() => confirmEvent(ev.id))}>Confirm</Button>
                      <Button size="sm" variant="outline" icon={lk(Trash2)} className="border-red-500 text-red-500 hover:bg-red-50" onClick={guard(() => handleDelete(ev))}>Delete</Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        )
      )}

      {/* === PHONE SHEETS === */}
      {itemsId && <EventItemsSheet ev={events.find(e => e.id === itemsId)} onClose={() => setItemsId(null)} onEdit={() => navigate(`/quotation/${itemsId}`)} />}
      {moreId && (() => {
        const ev = events.find(e => e.id === moreId);
        const close = (fn) => () => { setMoreId(null); fn(); };
        return (
          <EventMoreSheet ev={ev} onClose={() => setMoreId(null)} locked={isSuspended}
            on={{
              edit: close(guard(() => navigate(`/edit/${moreId}`))),
              quote: close(() => navigate(`/quotation/${moreId}`)),
              delete: close(guard(() => handleDelete(ev))),
            }} />
        );
      })()}
    </div>
  );
}
