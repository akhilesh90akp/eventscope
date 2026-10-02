/**
 * DraftsList — Draft events management page
 *
 * Displays all draft events in an expandable card list with search filtering.
 * Each card shows client info, event details, items, and action buttons.
 * Backward compatible with old event format (no mainEvent/subEvents).
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
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { formatCurrency, formatDateReadable, daysUntil, telLink, waLink, sortByActiveDate, getAllEventDates, getActiveDate } from '../utils/helpers';
import {
  Search, Phone, MessageSquare, Edit, FileText, CheckCircle,
  Trash2, CalendarDays, MapPin, PackageOpen, ChevronDown, ChevronUp,
  Home, Navigation, IndianRupee,
} from 'lucide-react';

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
 * Helper: get display date for an event (backward compatible)
 */
function getEventDate(ev) {
  if (ev.mainEvent?.date) return ev.mainEvent.date;
  return ev.date || '';
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
  const { events, deleteEvent, updateEvent, showToast } = useApp();
  const navigate = useNavigate();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

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
    const result = await updateEvent(id, { status: 'confirmed' });
    if (result.success) {
      showToast('Event confirmed');
    } else {
      showToast(result.error || 'Failed to confirm event', 'error');
    }
  };

  /** Executes the delete after modal confirmation — only toasts success if the write actually succeeded */
  const handleDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null); // close modal immediately regardless of outcome
    const result = await deleteEvent(id);
    if (result.success) {
      showToast('Event deleted');
    }
    // On failure, deleteEvent() already shows its own error toast.
  };

  /** Toggles the expanded/collapsed state of a draft card */
  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-bb-text">Drafts</h1>

      {/* Search */}
      <Input
        placeholder="Search drafts..."
        icon={Search}
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

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
        <div className="space-y-3">
          {drafts.map(ev => {
            const eventDates = getAllEventDates(ev);
            const activeDateStr = getActiveDate(ev);
            const activeDays = daysUntil(activeDateStr);
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
                                {formatDateReadable(d.date)}
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
                        <Button size="sm" variant="secondary" icon={Edit} onClick={() => navigate(`/edit/${ev.id}`)}>Edit</Button>
                        <Button size="sm" variant="secondary" icon={FileText} onClick={() => navigate(`/quotation/${ev.id}`)}>Quote</Button>
                        <Button size="sm" variant="success" icon={CheckCircle} onClick={() => confirmEvent(ev.id)}>Confirm</Button>
                        <Button size="sm" variant="outline" icon={Trash2} className="border-red-500 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(ev.id)}>Delete</Button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons - Always visible in collapsed view */}
                  {!isExpanded && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-bb-border">
                      <Button size="sm" variant="secondary" icon={Edit} onClick={() => navigate(`/edit/${ev.id}`)}>Edit</Button>
                      <Button size="sm" variant="secondary" icon={FileText} onClick={() => navigate(`/quotation/${ev.id}`)}>Quote</Button>
                      <Button size="sm" variant="success" icon={CheckCircle} onClick={() => confirmEvent(ev.id)}>Confirm</Button>
                      <Button size="sm" variant="outline" icon={Trash2} className="border-red-500 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(ev.id)}>Delete</Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Draft?" size="sm">
        <p className="text-bb-muted mb-4">This action cannot be undone. Are you sure you want to delete this draft?</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
