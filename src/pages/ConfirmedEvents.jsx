/**
 * ConfirmedEvents — Confirmed and completed events management
 *
 * Displays all confirmed/completed events with expandable details.
 * Provides functionality to add items (choosing main or sub-event),
 * set per-item pricing, mark events as done, and navigate to generators.
 * Backward compatible with old event format.
 * Phones get EventCardPhone (one action row + ⋯ sheet + items sheet);
 * laptops (1024px+) keep the fold-open cards.
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
import StickyBar from '../components/StickyBar';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import { useConfirm } from '../components/useConfirm';
import CostsPanel from '../components/CostsPanel';
import EventSummary from '../components/EventSummary';
import EventCardPhone, { EventItemsSheet, EventMoreSheet } from '../components/EventCardPhone';
import { useIsPhone } from '../components/useIsPhone';
import { telLink, waLink, sortByActiveDate, openJobLog, functionDays, itemDays, lineAmount, getAllEventDates } from '../utils/helpers';
import {
  Search, Phone, MessageSquare, FileText, CheckCircle2,
  MapPin, PackageOpen, Plus, Receipt, Edit3,
  ChevronDown, ChevronUp, Home, Navigation, Trash2, MoreVertical,
  ArrowLeftRight, ExternalLink, FileSignature,
  Lock,
} from 'lucide-react';
import { PlanTag } from '../components/UpgradeCard';

// ============================================================
// CONSTANTS
// ============================================================

/**
 * One group of buttons on an event card. Groups are set apart by extra space
 * (not divider lines, which end up dangling at the start of a wrapped row).
 */
const ACTION_GROUP = 'flex flex-wrap items-center gap-2';

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

// ============================================================
// ConfirmedEvents — MAIN COMPONENT
// ============================================================

/**
 * Lists confirmed OR completed events (one status per page — the two are
 * separate pages in the nav, each mounted with its own `status` prop).
 * Handles pricing, item addition, and marking events completed.
 */
export default function ConfirmedEvents({ status = 'confirmed' }) {
  const { events, categories, updateEvent, deleteEvent, showToast, isOwner, isSuspended, askUnlock, canUse } = useApp();
  // Read-only (plan ended / paused): these buttons show a lock and explain why
  const guard = (fn) => (...args) => (isSuspended ? askUnlock() : fn(...args));
  const lk = (icon) => (isSuspended ? Lock : icon);
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const isPhone = useIsPhone();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [search, setSearch] = useState('');
  const [addItemModal, setAddItemModal] = useState(null); // event id for add-item modal
  const [priceModal, setPriceModal] = useState(null); // event id for pricing modal
  const [newItem, setNewItem] = useState('');
  const [addItemTarget, setAddItemTarget] = useState('main'); // which event to add item to
  const [prices, setPrices] = useState({});
  const [expandedId, setExpandedId] = useState(location.state?.expandId || null); // Home links open one event
  const [moveId, setMoveId] = useState(null); // event id for the "Move to..." status-change modal
  const [itemsId, setItemsId] = useState(null); // phone: event whose items sheet is open
  const [moreId, setMoreId] = useState(null);   // phone: event whose ⋯ sheet is open
  const [range, setRange] = useState('all');    // phone quick filter: all | month | next30

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------
  const statusFilter = status; // 'confirmed' | 'completed' — fixed per page
  const pageLabel = status === 'completed' ? 'Completed' : 'Confirmed';

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

  // Phone quick filter (Confirmed): this month / next 30 days, by the event's next date
  const inRange = (ev) => {
    if (range === 'all') return true;
    const next = getAllEventDates(ev).find(d => !d.isPast);
    if (!next) return false;
    const d = new Date(`${next.date}T00:00:00`), now = new Date(); now.setHours(0, 0, 0, 0);
    if (range === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return (d - now) / 86400000 <= 30;
  };
  const phoneEvents = status === 'confirmed' ? confirmedEvents.filter(inRange) : confirmedEvents;
  const moreEv = events.find(e => e.id === moreId);
  const itemsEv = events.find(e => e.id === itemsId);
  /** Closes the ⋯ sheet, then runs the action */
  const fromMore = (fn) => () => { setMoreId(null); fn(); };

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
          const newPrices = { ...(ev.itemPrices || {}), [`main::${item.trim()}`]: { qty: 1, rate: 0, days: functionDays(ev.mainEvent) } };
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
        const target = (ev.subEvents || []).find(s => s.id === addItemTarget);
        const newPrices = { ...(ev.itemPrices || {}), [`${addItemTarget}::${item.trim()}`]: { qty: 1, rate: 0, days: functionDays(target) } };
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
        p[key] = stored[key] || stored[item] || { qty: 1, rate: 0, days: functionDays(ev.mainEvent) };
      });
      (ev.subEvents || []).forEach(s => {
        (s.items || []).forEach(item => {
          const key = `${s.id}::${item}`;
          p[key] = stored[key] || stored[item] || { qty: 1, rate: 0, days: functionDays(s) };
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
    const total = Object.values(prices).reduce((sum, p) => sum + lineAmount(p), 0);
    const result = await updateEvent(eventId, { itemPrices: prices, totalAmount: total });
    setPriceModal(null);
    if (result.success) {
      showToast('Quotation saved');
    } else {
      showToast(result.error || 'Failed to save quotation', 'error');
    }
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — STATUS & DELETE
  // ------------------------------------------------------------

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
  /** Asks first (app pop-up), then deletes. Only toasts success if the write actually succeeded. */
  const handleDelete = async (ev) => {
    const ok = await confirm({
      title: 'Delete this event?',
      message: <><b className="text-bb-text">{ev.clientName || 'This event'}</b> and its quote, bill, contract and Job Log costs will be deleted.</>,
      note: 'This can’t be undone.',
      confirmLabel: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    const result = await deleteEvent(ev.id);
    if (result.success) showToast('Event deleted');
    // On failure, deleteEvent() already shows its own error toast.
  };


  // ------------------------------------------------------------
  // EVENT HANDLERS — CARD UI
  // ------------------------------------------------------------

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

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="hidden lg:flex items-center gap-3">
        <h1 className="text-xl font-bold text-bb-text">{pageLabel} Events<span className="inline-flex items-center justify-center align-middle min-w-[1.75rem] h-7 px-2 ml-2 rounded-full bg-violet-100 text-violet-700 text-sm font-bold tabular-nums" data-testid="title-count">{events.filter(e => e.status === statusFilter).length}</span></h1>
        <span className="flex-1" />
        {/* Job Log is a wide grid — laptop/tablet only (md and up) */}
        {status === 'completed' && isOwner && (
          <span className="hidden md:inline-flex"><Button size="sm" icon={ExternalLink} onClick={openJobLog}>Open Job Log</Button></span>
        )}
      </div>

      {/* Search — stays pinned while scrolling */}
      <StickyBar>
        <Input
          placeholder="Search events..."
          icon={Search}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </StickyBar>

      {/* === PHONE: quick filters (Confirmed) === */}
      {isPhone && status === 'confirmed' && confirmedEvents.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mt-1" data-testid="range-chips">
          {[['all', `All ${confirmedEvents.length}`], ['month', 'This month'], ['next30', 'Next 30 days']].map(([k, label]) => (
            <button key={k} onClick={() => setRange(k)}
              className={`shrink-0 min-h-[38px] px-3.5 rounded-full text-[13.5px] font-semibold border cursor-pointer ${range === k ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300 text-bb-text'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* === PHONE: one card per event (laptops: fold-open cards below) === */}
      {isPhone && confirmedEvents.length > 0 && (
        <div className="space-y-4" data-testid="phone-list">
          {phoneEvents.length === 0 && <p className="text-center text-gray-600 py-8">No events in this range.</p>}
          {phoneEvents.map(ev => (
            <EventCardPhone key={ev.id} ev={ev} variant={status} locked={isSuspended}
              on={{
                quote: () => navigate(`/quotation/${ev.id}`),
                bill: () => navigate(`/bill/${ev.id}`),
                markDone: status === 'confirmed' ? guard(() => markDone(ev.id)) : undefined,
                jobLog: status === 'completed' && isOwner && canUse('jobLog') ? () => navigate(`/job/${ev.id}`) : undefined,
                items: () => setItemsId(ev.id),
                more: () => setMoreId(ev.id),
              }} />
          ))}
        </div>
      )}

      {confirmedEvents.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <PackageOpen size={44} className="mx-auto text-bb-muted mb-3" />
            <p className="text-bb-muted font-medium">No {status} events</p>
            <p className="text-sm text-bb-muted/60 mt-1">
              {status === 'completed' ? 'Mark a confirmed event as completed to see it here' : 'Confirm a draft to see it here'}
            </p>
          </div>
        </Card>
      ) : (
        !isPhone && <div className="space-y-3">
          {confirmedEvents.map(ev => {
            const allItems = getAllItems(ev);
            const isExpanded = expandedId === ev.id;
            return (
              <Card key={ev.id}>
                <div className="space-y-3">
                  {/* Collapsed Header - Clickable */}
                  <div className="cursor-pointer" onClick={() => toggleExpand(ev.id)}>
                    <EventSummary
                      ev={ev}
                      right={isExpanded
                        ? <ChevronUp size={18} className="text-bb-muted" />
                        : <ChevronDown size={18} className="text-bb-muted" />}
                    />
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
                                        {price.qty} × ₹{price.rate.toLocaleString('en-IN')}{itemDays(price) > 1 ? ` × ${itemDays(price)} days` : ''} = ₹{lineAmount(price).toLocaleString('en-IN')}
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

                      {/* Costs & income — completed events only (same data as the Job Log) */}
                      {ev.status === 'completed' && canUse('jobLog') && <CostsPanel event={ev} />}

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
                        <Button size="sm" variant="secondary" icon={lk(Edit3)} onClick={guard(() => navigate(`/edit/${ev.id}`))}>Edit</Button>
                        <Button size="sm" variant="secondary" icon={lk(Plus)} onClick={guard(() => { setAddItemModal(ev.id); setAddItemTarget('main'); })}>Add Item</Button>
                        <Button icon={isSuspended ? Lock : undefined} size="sm" variant="secondary" onClick={guard(() => openPriceModal(ev))}>Set Prices</Button>
                        <Button size="sm" variant="secondary" icon={FileText} onClick={() => navigate(`/quotation/${ev.id}`)}>Quote</Button>
                        <Button size="sm" variant="secondary" icon={Receipt} onClick={() => navigate(`/bill/${ev.id}`)}>Bill</Button>
                        <Button size="sm" variant="secondary" icon={FileSignature} onClick={() => navigate(`/contract/${ev.id}`)} >Contract{!canUse('contracts') && <PlanTag feature="contracts" />}</Button>
                        {ev.status === 'confirmed' && (
                          <Button size="sm" variant="success" icon={lk(CheckCircle2)} onClick={guard(() => markDone(ev.id))}>Mark Done</Button>
                        )}
                        <Button size="sm" variant="outline" icon={lk(Trash2)} className="border-red-500 text-red-500 hover:bg-red-50" onClick={guard(() => handleDelete(ev))}>Delete</Button>
                        {getMoveOptions(ev.status).length > 0 && (
                          <Button size="sm" variant="ghost" icon={MoreVertical} onClick={() => setMoveId(ev.id)} title="Move to..." />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons - Always visible in collapsed view. Grouped: contact ·
                      edit/delete · items/prices · documents · status, with extra space between
                      groups; rows wrap cleanly on any screen. */}
                  {!isExpanded && (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 border-t border-bb-border">
                      {(ev.clientPhone || ev.clientWhatsapp) && (
                        <div className={ACTION_GROUP}>
                          {ev.clientPhone && (
                            <a href={telLink(ev.clientPhone)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-emerald-600 text-emerald-600 hover:bg-emerald-50 transition-colors">
                              <Phone size={14} /> Call
                            </a>
                          )}
                          <a href={waLink(ev.clientWhatsapp || ev.clientPhone)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-emerald-600 text-emerald-600 hover:bg-emerald-50 transition-colors">
                            <MessageSquare size={14} /> WhatsApp
                          </a>
                        </div>
                      )}
                      <div className={ACTION_GROUP}>
                        <Button size="sm" variant="secondary" icon={lk(Edit3)} onClick={guard(() => navigate(`/edit/${ev.id}`))}>Edit</Button>
                        <Button size="sm" variant="outline" icon={lk(Trash2)} className="border-red-500 text-red-500 hover:bg-red-50" onClick={guard(() => handleDelete(ev))}>Delete</Button>
                      </div>
                      <div className={ACTION_GROUP}>
                        <Button size="sm" variant="secondary" icon={lk(Plus)} onClick={guard(() => { setAddItemModal(ev.id); setAddItemTarget('main'); })}>Add Item</Button>
                        <Button icon={isSuspended ? Lock : undefined} size="sm" variant="secondary" onClick={guard(() => openPriceModal(ev))}>Set Prices</Button>
                      </div>
                      <div className={ACTION_GROUP}>
                        <Button size="sm" variant="secondary" icon={FileText} onClick={() => navigate(`/quotation/${ev.id}`)}>Quote</Button>
                        <Button size="sm" variant="secondary" icon={Receipt} onClick={() => navigate(`/bill/${ev.id}`)}>Bill</Button>
                        <Button size="sm" variant="secondary" icon={FileSignature} onClick={() => navigate(`/contract/${ev.id}`)} >Contract{!canUse('contracts') && <PlanTag feature="contracts" />}</Button>
                        {/* Completed has no "Mark Done", so "Move to…" sits with the documents */}
                        {ev.status !== 'confirmed' && getMoveOptions(ev.status).length > 0 && (
                          <Button size="sm" variant="ghost" icon={MoreVertical} onClick={() => setMoveId(ev.id)} title="Move to..." aria-label="Move to" />
                        )}
                      </div>
                      {ev.status === 'confirmed' && (
                        <div className={ACTION_GROUP}>
                          <Button size="sm" variant="success" icon={lk(CheckCircle2)} onClick={guard(() => markDone(ev.id))}>Mark Done</Button>
                          {getMoveOptions(ev.status).length > 0 && (
                            <Button size="sm" variant="ghost" icon={MoreVertical} onClick={() => setMoveId(ev.id)} title="Move to..." aria-label="Move to" />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* === PHONE SHEETS: items on an event · ⋯ actions === */}
      {itemsEv && <EventItemsSheet ev={itemsEv} onClose={() => setItemsId(null)} onEdit={() => navigate(`/quotation/${itemsEv.id}`)} />}
      {moreEv && (
        <EventMoreSheet ev={moreEv} onClose={() => setMoreId(null)} locked={isSuspended}
          contractTag={!canUse('contracts') ? <PlanTag feature="contracts" /> : null}
          on={{
            edit: fromMore(guard(() => navigate(`/edit/${moreEv.id}`))),
            addItems: fromMore(guard(() => { setAddItemModal(moreEv.id); setAddItemTarget('main'); })),
            setPrices: fromMore(guard(() => openPriceModal(moreEv))),
            quote: fromMore(() => navigate(`/quotation/${moreEv.id}`)),
            contract: fromMore(() => navigate(`/contract/${moreEv.id}`)),
            move: getMoveOptions(moreEv.status).length ? fromMore(() => setMoveId(moreEv.id)) : undefined,
            markDone: moreEv.status === 'confirmed' ? fromMore(guard(() => markDone(moreEv.id))) : undefined,
            delete: fromMore(guard(() => handleDelete(moreEv))),
          }} />
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
              // Phone: name (and event) on their own line, qty × rate × days = amount below
              <div key={key} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 p-2 bg-bb-input rounded-lg">
                <div className="basis-full sm:basis-auto sm:flex-1 min-w-0">
                  <p className="text-sm text-bb-text break-words sm:truncate">{itemName}</p>
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
                <span className="text-bb-muted text-sm">×</span>
                <input
                  type="number"
                  min="1"
                  placeholder="Days"
                  aria-label={`${itemName} days`}
                  value={itemDays(val)}
                  onChange={e => setPrices(p => ({ ...p, [key]: { ...p[key], days: Math.max(1, Math.round(Number(e.target.value)) || 1) } }))}
                  className="w-14 bg-bb-bg border border-bb-border rounded px-2 py-1 text-sm text-bb-text text-center"
                />
                <span className="text-[11px] text-bb-muted -ml-1">days</span>
                <span className="text-xs text-bb-muted w-20 text-right ml-auto sm:ml-0">
                  = ₹{lineAmount(val).toLocaleString('en-IN')}
                </span>
              </div>
            );
          })}

          {/* Total and save */}
          <div className="pt-3 border-t border-bb-border flex justify-between items-center">
            <p className="font-semibold text-bb-text">
              Total: ₹{Object.values(prices).reduce((s, p) => s + lineAmount(p), 0).toLocaleString('en-IN')}
            </p>
            <Button onClick={savePrices}>Save Prices</Button>
          </div>
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
