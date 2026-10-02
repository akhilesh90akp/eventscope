/**
 * ConfirmedEvents — Confirmed and completed events management
 *
 * Displays all confirmed/completed events with expandable details.
 * Provides functionality to add items (choosing main or sub-event),
 * set per-item pricing, mark events as done, and navigate to generators.
 * Backward compatible with old event format.
 *
 * All updateEvent/deleteEvent calls await the Firestore result before
 * showing a success toast — see CODE_STRUCTURE.md §3-4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { formatCurrency, formatDateReadable, daysUntil, telLink, waLink, sortByActiveDate, getAllEventDates, getActiveDate } from '../utils/helpers';
import {
  Search, Phone, MessageSquare, FileText, CheckCircle2,
  CalendarDays, MapPin, PackageOpen, Plus, Receipt, Edit3,
  ChevronDown, ChevronUp, Home, Navigation, Trash2, MoreVertical,
  ArrowLeftRight,
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

// ============================================================
// ConfirmedEvents — MAIN COMPONENT
// ============================================================

/** Manages confirmed events with pricing, item addition, and completion */
export default function ConfirmedEvents() {
  const { events, categories, updateEvent, deleteEvent, showToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [search, setSearch] = useState('');
  // Opens on whichever tab makes sense for how we got here: EditDraft
  // passes { statusFilter: 'completed' } via navigate() so editing a
  // completed event and saving returns you to Completed, not the default
  // Confirmed; the dedicated "/completed" sidebar link opens straight on
  // that tab by URL alone (no navigation state involved).
  const [statusFilter, setStatusFilter] = useState(
    location.state?.statusFilter || (location.pathname === '/completed' ? 'completed' : 'confirmed')
  ); // 'confirmed' | 'completed'
  const [addItemModal, setAddItemModal] = useState(null); // event id for add-item modal
  const [priceModal, setPriceModal] = useState(null); // event id for pricing modal
  const [newItem, setNewItem] = useState('');
  const [addItemTarget, setAddItemTarget] = useState('main'); // which event to add item to
  const [prices, setPrices] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [deleteId, setDeleteId] = useState(null); // event id for delete confirmation
  const [moveId, setMoveId] = useState(null); // event id for the "Move to..." status-change modal

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------

  // Filter confirmed/completed events by status tab and search query
  const confirmedEvents = sortByActiveDate(
    events
      .filter(e => e.status === statusFilter)
      .filter(e => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          e.clientName?.toLowerCase().includes(q) ||
          e.eventType?.toLowerCase().includes(q) ||
          (e.mainEvent?.location || e.eventLocation || '').toLowerCase().includes(q)
        );
      })
  );

  // ------------------------------------------------------------
  // EVENT HANDLERS — ITEMS & PRICING
  // ------------------------------------------------------------

  /** Adds a new item to an event (choosing target: main or sub-event). Awaits the write and surfaces failures. */
  const handleAddItem = async (eventId, item) => {
    if (!item.trim()) return;
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    let result;
    if (ev.mainEvent) {
      // New format: add to specified target
      if (addItemTarget === 'main') {
        const mainItems = [...(ev.mainEvent.items || [])];
        if (!mainItems.includes(item.trim())) {
          mainItems.push(item.trim());
          // Also add keyed price entry
          const newPrices = { ...(ev.itemPrices || {}), [`main::${item.trim()}`]: { qty: 1, rate: 0 } };
          result = await updateEvent(eventId, { mainEvent: { ...ev.mainEvent, items: mainItems }, itemPrices: newPrices });
        }
      } else {
        // Add to a sub-event
        const subEvents = (ev.subEvents || []).map(s => {
          if (s.id === addItemTarget) {
            const subItems = [...(s.items || [])];
            if (!subItems.includes(item.trim())) {
              subItems.push(item.trim());
            }
            return { ...s, items: subItems };
          }
          return s;
        });
        // Also add keyed price entry
        const newPrices = { ...(ev.itemPrices || {}), [`${addItemTarget}::${item.trim()}`]: { qty: 1, rate: 0 } };
        result = await updateEvent(eventId, { subEvents, itemPrices: newPrices });
      }
    } else {
      // Old format: flat items array
      const items = [...(ev.items || [])];
      if (!items.includes(item.trim())) {
        items.push(item.trim());
        const newPrices = { ...(ev.itemPrices || {}), [`main::${item.trim()}`]: { qty: 1, rate: 0 } };
        result = await updateEvent(eventId, { items, itemPrices: newPrices });
      }
    }
    if (result && !result.success) {
      showToast(result.error || 'Failed to add item', 'error');
    }
    setNewItem('');
  };

  /** Opens the pricing modal with current item prices pre-filled using eventId::itemName keys */
  const openPriceModal = (ev) => {
    const p = {};
    const stored = ev.itemPrices || {};
    if (ev.mainEvent) {
      (ev.mainEvent.items || []).forEach(item => {
        const key = `main::${item}`;
        p[key] = stored[key] || stored[item] || { qty: 1, rate: 0 };
      });
      (ev.subEvents || []).forEach(s => {
        (s.items || []).forEach(item => {
          const key = `${s.id}::${item}`;
          p[key] = stored[key] || stored[item] || { qty: 1, rate: 0 };
        });
      });
    } else {
      (ev.items || []).forEach(item => {
        const key = `main::${item}`;
        p[key] = stored[key] || stored[item] || { qty: 1, rate: 0 };
      });
    }
    setPrices(p);
    setPriceModal(ev.id);
  };

  /** Saves item prices and calculates the total amount. Awaits the write and only toasts success on confirmation. */
  const savePrices = async () => {
    if (!priceModal) return;
    const eventId = priceModal;
    const total = Object.values(prices).reduce((sum, p) => sum + (p.qty * p.rate), 0);
    const result = await updateEvent(eventId, { itemPrices: prices, totalAmount: total });
    setPriceModal(null);
    if (result.success) {
      showToast('Quotation saved');
    } else {
      showToast(result.error || 'Failed to save quotation', 'error');
    }
  };

  /** Marks an event as completed. Awaits the write and only toasts success on confirmation. */
  const markDone = async (id) => {
    const result = await updateEvent(id, { status: 'completed' });
    if (result.success) {
      showToast('Event marked as completed');
    } else {
      showToast(result.error || 'Failed to update event', 'error');
    }
  };

  /**
   * Moves an event to a different status (undo path for accidental
   * "Mark Done" / "Confirm" clicks) — e.g. Completed -> Confirmed or
   * Completed -> Draft, or Confirmed -> Draft. Awaits the write and only
   * toasts success on confirmation.
   */
  const moveEventTo = async (id, newStatus) => {
    const result = await updateEvent(id, { status: newStatus });
    setMoveId(null);
    if (result.success) {
      const label = newStatus === 'draft' ? 'Draft' : newStatus === 'confirmed' ? 'Confirmed' : newStatus;
      showToast(`Event moved to ${label}`);
    } else {
      showToast(result.error || 'Failed to move event', 'error');
    }
  };

  /** Returns the valid "move to" destination statuses for an event's current status */
  const getMoveOptions = (status) => {
    if (status === 'completed') return ['confirmed', 'draft'];
    if (status === 'confirmed') return ['draft'];
    return [];
  };

  /** Executes the delete after modal confirmation. Awaits the write; deleteEvent() shows its own error toast on failure. */
  const handleDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null); // close modal immediately regardless of outcome
    const result = await deleteEvent(id);
    if (result.success) {
      showToast('Event deleted');
    }
  };

  /** Toggles the expanded/collapsed state of an event card */
  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  /** Gets event target options for add-item dropdown */
  const getTargetOptions = (ev) => {
    if (!ev?.mainEvent) return [{ value: 'main', label: 'Event' }];
    const opts = [{ value: 'main', label: ev.mainEvent.name || 'Main Event' }];
    (ev.subEvents || []).forEach(s => {
      opts.push({ value: s.id, label: s.name || 'Sub Event' });
    });
    return opts;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-bb-text">Confirmed Events</h1>

      <Input
        placeholder="Search events..."
        icon={Search}
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Status Filter Tabs */}
      <div className="flex gap-1 bg-bb-input rounded-lg p-1">
        {[
          { key: 'confirmed', label: 'Confirmed' },
          { key: 'completed', label: 'Completed' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              statusFilter === tab.key
                ? 'bg-bb-card text-bb-text shadow-sm'
                : 'text-bb-muted hover:text-bb-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {confirmedEvents.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <PackageOpen size={44} className="mx-auto text-bb-muted mb-3" />
            <p className="text-bb-muted font-medium">No confirmed events</p>
            <p className="text-sm text-bb-muted/60 mt-1">Confirm a draft to see it here</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {confirmedEvents.map(ev => {
            const eventDates = getAllEventDates(ev);
            const activeDateStr = getActiveDate(ev);
            const activeDays = daysUntil(activeDateStr);
            const allItems = getAllItems(ev);
            const isExpanded = expandedId === ev.id;
            return (
              <Card key={ev.id}>
                <div className="space-y-3">
                  {/* Collapsed Header - Clickable */}
                  <div
                    className="cursor-pointer"
                    onClick={() => toggleExpand(ev.id)}
                  >
                    {/* Line 1: Event name + expand arrow */}
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-semibold text-bb-text truncate flex-1 mr-2">{ev.clientName}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {activeDays !== null && ev.status === 'confirmed' && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            activeDays < 0 ? 'bg-red-100 text-red-700' :
                            activeDays <= 3 ? 'bg-red-100 text-red-700' :
                            activeDays <= 7 ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {activeDays < 0 ? `${Math.abs(activeDays)}d ago` : activeDays === 0 ? 'Today' : activeDays === 1 ? 'Tomorrow' : `${activeDays}d`}
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronUp size={18} className="text-bb-muted" />
                        ) : (
                          <ChevronDown size={18} className="text-bb-muted" />
                        )}
                      </div>
                    </div>

                    {/* Line 2: Chips + total amount */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge variant={ev.status}>{ev.eventType}</Badge>
                      <Badge variant={ev.status}>{ev.status}</Badge>
                      {ev.totalAmount > 0 && (
                        <span className="font-bold text-emerald-600 text-sm ml-auto">{formatCurrency(ev.totalAmount)}</span>
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
                      {(ev.mainEvent?.location || ev.eventLocation) && (
                        <div className="flex items-center gap-1 text-bb-muted min-w-0">
                          <MapPin size={14} className="flex-shrink-0" />
                          <span className="truncate">{ev.mainEvent?.location || ev.eventLocation}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="space-y-3 pt-2 border-t border-bb-border">
                      {/* Items with Prices */}
                      {allItems.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-bb-muted uppercase mb-1.5">Items</p>
                          <div className="space-y-1">
                            {(() => {
                              const stored = ev.itemPrices || {};
                              // Build keyed items for display grouped by event
                              const keyedItems = [];
                              if (ev.mainEvent) {
                                (ev.mainEvent.items || []).forEach(item => {
                                  keyedItems.push({ key: `main::${item}`, item, group: ev.mainEvent.name || ev.eventType || 'Main Event' });
                                });
                                (ev.subEvents || []).forEach(s => {
                                  (s.items || []).forEach(item => {
                                    keyedItems.push({ key: `${s.id}::${item}`, item, group: s.name || 'Sub Event' });
                                  });
                                });
                              } else {
                                allItems.forEach(item => {
                                  keyedItems.push({ key: `main::${item}`, item, group: 'Event' });
                                });
                              }
                              const hasMultipleGroups = ev.mainEvent && (ev.subEvents || []).length > 0;
                              return keyedItems.map(({ key, item, group }) => {
                                const price = stored[key] || stored[item];
                                return (
                                  <div key={key} className="flex items-center justify-between text-sm px-2 py-1 rounded bg-bb-input">
                                    <span className="text-bb-text">
                                      {hasMultipleGroups && <span className="text-bb-muted text-xs mr-1">({group})</span>}
                                      {item}
                                    </span>
                                    {price && price.rate > 0 && (
                                      <span className="text-bb-muted text-xs">
                                        {price.qty} × ₹{price.rate.toLocaleString('en-IN')} = ₹{(price.qty * price.rate).toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {ev.notes && (
                        <div>
                          <p className="text-xs font-semibold text-bb-muted uppercase mb-1">Notes</p>
                          <p className="text-sm text-bb-muted bg-bb-input rounded-lg px-3 py-2">{ev.notes}</p>
                        </div>
                      )}

                      {/* Location Details */}
                      <div className="space-y-2">
                        {ev.clientAddress && (
                          <div className="flex items-start gap-2 text-sm text-bb-muted">
                            <Home size={14} className="flex-shrink-0 mt-0.5" />
                            <span>Client Address: <span className="text-bb-text">{ev.clientAddress}</span></span>
                          </div>
                        )}
                        {(ev.mainEvent?.location || ev.eventLocation) && (
                          <div className="flex items-start gap-2 text-sm text-bb-muted">
                            <MapPin size={14} className="flex-shrink-0 mt-0.5" />
                            <span>Event Location: <span className="text-bb-text">{ev.mainEvent?.location || ev.eventLocation}</span></span>
                          </div>
                        )}
                        {ev.houseLocation && (
                          <div className="flex items-start gap-2 text-sm text-bb-muted">
                            <Navigation size={14} className="flex-shrink-0 mt-0.5" />
                            <span>House Location: <span className="text-bb-text">{ev.houseLocation}</span></span>
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
                        <Button size="sm" variant="ghost" icon={Edit3} onClick={() => navigate(`/edit/${ev.id}`)}>Edit</Button>
                        <Button size="sm" variant="secondary" icon={Plus} onClick={() => { setAddItemModal(ev.id); setAddItemTarget('main'); }}>Add Item</Button>
                        <Button size="sm" variant="secondary" onClick={() => openPriceModal(ev)}>Set Prices</Button>
                        <Button size="sm" variant="secondary" icon={FileText} onClick={() => navigate(`/quotation/${ev.id}`)}>Quote</Button>
                        <Button size="sm" variant="secondary" icon={Receipt} onClick={() => navigate(`/bill/${ev.id}`)}>Bill</Button>
                        {ev.status === 'confirmed' && (
                          <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => markDone(ev.id)}>Mark Done</Button>
                        )}
                        <Button size="sm" variant="outline" icon={Trash2} className="border-red-500 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(ev.id)}>Delete</Button>
                        {getMoveOptions(ev.status).length > 0 && (
                          <Button size="sm" variant="ghost" icon={MoreVertical} onClick={() => setMoveId(ev.id)} title="Move to..." />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons - Always visible in collapsed view */}
                  {!isExpanded && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-bb-border">
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
                      <span className="w-px h-5 bg-bb-border" />
                      <Button size="sm" variant="ghost" icon={Edit3} onClick={() => navigate(`/edit/${ev.id}`)}>Edit</Button>
                      <Button size="sm" variant="outline" icon={Trash2} className="border-red-500 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(ev.id)}>Delete</Button>
                      <span className="w-px h-5 bg-bb-border" />
                      <Button size="sm" variant="secondary" icon={Plus} onClick={() => { setAddItemModal(ev.id); setAddItemTarget('main'); }}>Add Item</Button>
                      <Button size="sm" variant="secondary" onClick={() => openPriceModal(ev)}>Set Prices</Button>
                      <span className="w-px h-5 bg-bb-border" />
                      <Button size="sm" variant="secondary" icon={FileText} onClick={() => navigate(`/quotation/${ev.id}`)}>Quote</Button>
                      <Button size="sm" variant="secondary" icon={Receipt} onClick={() => navigate(`/bill/${ev.id}`)}>Bill</Button>
                      <span className="w-px h-5 bg-bb-border" />
                      {ev.status === 'confirmed' && (
                        <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => markDone(ev.id)}>Mark Done</Button>
                      )}
                      {getMoveOptions(ev.status).length > 0 && (
                        <>
                          <span className="w-px h-5 bg-bb-border" />
                          <Button size="sm" variant="ghost" icon={MoreVertical} onClick={() => setMoveId(ev.id)} title="Move to..." />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Item Modal */}
      <Modal isOpen={!!addItemModal} onClose={() => setAddItemModal(null)} title="Add Item" size="md">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Target selector: which event to add item to */}
          {(() => {
            const ev = events.find(e => e.id === addItemModal);
            const targets = getTargetOptions(ev);
            if (targets.length > 1) {
              return (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-bb-text mb-1">Add to:</label>
                  <select
                    value={addItemTarget}
                    onChange={e => setAddItemTarget(e.target.value)}
                    className="w-full bg-bb-input border border-bb-border rounded-lg px-3 py-2 text-sm text-bb-text"
                  >
                    {targets.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              );
            }
            return null;
          })()}

          {/* Custom Input */}
          <div className="flex gap-2">
            <Input placeholder="Custom item..." value={newItem} onChange={e => setNewItem(e.target.value)}
              className="flex-1"
              onKeyDown={e => e.key === 'Enter' && (handleAddItem(addItemModal, newItem))}
            />
            <Button size="sm" onClick={() => handleAddItem(addItemModal, newItem)}>Add</Button>
          </div>

          {/* Category items - browse from predefined categories */}
          <div className="space-y-2 mt-3">
            {categories.map(cat => (
              <div key={cat.id}>
                <p className="text-xs font-semibold text-bb-muted uppercase mb-1">{cat.icon} {cat.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {cat.items.map(item => {
                    const ev = events.find(e => e.id === addItemModal);
                    const allItems = ev ? getAllItems(ev) : [];
                    const selected = allItems.includes(item);
                    return (
                      <button
                        key={item}
                        onClick={() => !selected && handleAddItem(addItemModal, item)}
                        disabled={selected}
                        className={`text-xs px-2 py-1 rounded-full border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-bb-accent/20 border-bb-accent text-bb-accent opacity-50 cursor-not-allowed'
                            : 'bg-bb-input border-bb-border text-bb-text hover:border-bb-accent'
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Set Prices Modal */}
      <Modal isOpen={!!priceModal} onClose={() => setPriceModal(null)} title="Set Prices" size="lg">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {Object.entries(prices).map(([key, val]) => {
            const itemName = key.includes('::') ? key.split('::').slice(1).join('::') : key;
            const eventPrefix = key.includes('::') ? key.split('::')[0] : 'main';
            const ev = events.find(e => e.id === priceModal);
            const groupLabel = eventPrefix === 'main'
              ? (ev?.mainEvent?.name || ev?.eventType || 'Main Event')
              : ((ev?.subEvents || []).find(s => s.id === eventPrefix)?.name || 'Sub Event');
            return (
              <div key={key} className="flex items-center gap-3 p-2 bg-bb-input rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-bb-text truncate">{itemName}</p>
                  {Object.keys(prices).length > 1 && ev?.mainEvent && (ev.subEvents || []).length > 0 && (
                    <p className="text-xs text-bb-muted truncate">{groupLabel}</p>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={val.qty}
                  onChange={e => setPrices(p => ({ ...p, [key]: { ...p[key], qty: Number(e.target.value) || 1 } }))}
                  className="w-16 bg-bb-bg border border-bb-border rounded px-2 py-1 text-sm text-bb-text text-center"
                />
                <span className="text-bb-muted text-sm">×</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Rate"
                  value={val.rate || ''}
                  onChange={e => setPrices(p => ({ ...p, [key]: { ...p[key], rate: Number(e.target.value) || 0 } }))}
                  className="w-24 bg-bb-bg border border-bb-border rounded px-2 py-1 text-sm text-bb-text text-right"
                />
                <span className="text-xs text-bb-muted w-20 text-right">
                  = ₹{(val.qty * val.rate).toLocaleString('en-IN')}
                </span>
              </div>
            );
          })}

          {/* Total and save */}
          <div className="pt-3 border-t border-bb-border flex justify-between items-center">
            <p className="font-semibold text-bb-text">
              Total: ₹{Object.values(prices).reduce((s, p) => s + p.qty * p.rate, 0).toLocaleString('en-IN')}
            </p>
            <Button onClick={savePrices}>Save Prices</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Event?" size="sm">
        <p className="text-bb-muted mb-4">Are you sure you want to delete this event? This action cannot be undone.</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>

      {/* Move-to-status Modal — undo path for accidental Mark Done / Confirm clicks */}
      <Modal isOpen={!!moveId} onClose={() => setMoveId(null)} title="Move Event" size="sm">
        <p className="text-bb-muted mb-4">Move this event back to a different stage:</p>
        <div className="flex flex-col gap-2">
          {getMoveOptions(events.find(e => e.id === moveId)?.status).map(status => (
            <Button
              key={status}
              variant="secondary"
              icon={ArrowLeftRight}
              fullWidth
              onClick={() => moveEventTo(moveId, status)}
            >
              Move to {status === 'draft' ? 'Draft' : 'Confirmed'}
            </Button>
          ))}
          <Button variant="ghost" fullWidth onClick={() => setMoveId(null)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  );
}
