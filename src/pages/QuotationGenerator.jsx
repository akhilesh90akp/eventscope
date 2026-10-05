/**
 * QuotationGenerator — Professional quotation document builder
 *
 * Generates a print-ready quotation for an event. Groups items by main event
 * and sub-events. Allows adding/removing items, setting per-item quantities
 * and rates, reordering items via drag-and-drop, grouping items into priced
 * bundles, and hiding itemized pricing in favor of one final amount per
 * section. Supports printing and WhatsApp sharing.
 *
 * Pricing model (also read by BillGenerator — see utils/helpers.js):
 *   - Each item's price lives in itemPrices[`${sectionId}::${name}`] = {qty, rate}
 *   - event.bundles = [{ id, name, itemKeys, amount }] groups 2+ items (from
 *     the SAME section) under one shared price. Membership is explicit and
 *     fixed (set via "Create Group", cleared via "Ungroup") — not inferred
 *     from drag position, so reordering can never accidentally break a bundle.
 *   - event.hidePrices (bool) + event.finalAmounts ({ [sectionId]: number }):
 *     when on, per-item/bundle prices are hidden everywhere; each section
 *     instead gets one manually-entered final amount, and the grand total is
 *     the sum of those. Disabled while any bundle exists (ungroup first).
 *   - Item order is just the order of names in mainEvent.items / a given
 *     sub-event's items — reordering (via drag) rewrites that array directly,
 *     so Bill automatically shows the same order with no extra data needed.
 *
 * Save flow: handleSave awaits AppContext.updateEvent() and only confirms
 * success once Firestore actually returns it. See CODE_STRUCTURE.md §4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Select from '../components/Select';
import Toggle from '../components/Toggle';
import Modal from '../components/Modal';
import {
  formatCurrency, formatDateReadable, calcGST, waLink,
  buildLineEntries, flattenLineEntries, computeSectionTotal,
} from '../utils/helpers';
import {
  ArrowLeft, Printer, MessageSquare, X, Plus, Save, Package,
  ChevronDown, ChevronRight, GripVertical, Layers, Ungroup,
} from 'lucide-react';

// ============================================================
// HELPERS
// ============================================================

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Wraps one line entry (item or bundle) to make it draggable via dnd-kit */
function SortableEntry({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-1">
      <button
        {...attributes} {...listeners}
        className="mt-2 p-1.5 text-bb-muted hover:text-bb-text cursor-grab active:cursor-grabbing touch-none shrink-0"
        title="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ============================================================
// QuotationGenerator — MAIN COMPONENT
// ============================================================

/** Builds and previews a printable quotation document for an event */
export default function QuotationGenerator() {
  const { eventId } = useParams();
  const { events, settings, categories, updateEvent, showToast } = useApp();
  const navigate = useNavigate();
  const event = events.find(e => e.id === eventId);

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------

  /**
   * Derives the editor's working state from an event: per-section item
   * name arrays (order = the order actually persisted), item prices keyed
   * eventId::itemName, bundles, and hide-prices settings. Used both for
   * the initial lazy state below and the load-sync effect, so an event
   * that arrives asynchronously from Firestore (not yet ready on first
   * render) is handled the same way as one that's already loaded.
   */
  const deriveState = (ev) => {
    if (!ev) return { sectionItems: {}, itemPrices: {}, bundles: [], hidePrices: false, finalAmounts: {} };
    const stored = ev.itemPrices || {};
    const sectionItems = {};
    if (ev.mainEvent) {
      sectionItems.main = [...(ev.mainEvent.items || [])];
      (ev.subEvents || []).forEach(s => { sectionItems[s.id] = [...(s.items || [])]; });
    } else {
      sectionItems.main = [...(ev.items || [])];
    }
    const itemPrices = {};
    Object.entries(sectionItems).forEach(([sectionId, names]) => {
      names.forEach(name => {
        const key = `${sectionId}::${name}`;
        itemPrices[key] = stored[key] || stored[name] || { qty: 1, rate: 0 };
      });
    });
    return {
      sectionItems,
      itemPrices,
      bundles: ev.bundles || [],
      hidePrices: ev.hidePrices || false,
      finalAmounts: ev.finalAmounts || {},
    };
  };

  const [sectionItems, setSectionItems] = useState(() => deriveState(event).sectionItems);
  const [itemPrices, setItemPrices] = useState(() => deriveState(event).itemPrices);
  const [bundles, setBundles] = useState(() => deriveState(event).bundles);
  const [hidePrices, setHidePrices] = useState(() => deriveState(event).hidePrices);
  const [finalAmounts, setFinalAmounts] = useState(() => deriveState(event).finalAmounts);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstRate, setGstRate] = useState(String(settings.defaultGstRate || 18));
  const [validityDays, setValidityDays] = useState(15);

  // Add item state — each section (main event / each sub-event) gets its
  // own free-text "add item" box, so items go into the section actually
  // being edited instead of always landing on the main event.
  const [newItemNames, setNewItemNames] = useState({}); // { [sectionId]: string }
  // Which section's "Add from Categories" modal is open (null = closed).
  const [categoryModalSection, setCategoryModalSection] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});

  // Bundle creation: which standalone (not-yet-bundled) items are
  // checkbox-selected per section — used to enable the top "Group" button.
  const [selectedForGroup, setSelectedForGroup] = useState({}); // { [sectionId]: Set<name> }
  // Which existing bundles are checkbox-selected (via their header checkbox)
  // — used to enable the top "Ungroup" button.
  const [selectedBundles, setSelectedBundles] = useState(new Set());
  // Which individual members of an existing bundle are checkbox-selected —
  // lets a user pull specific items back out of a group without dissolving
  // the whole thing (checked without the bundle's own header checkbox).
  const [selectedBundleMembers, setSelectedBundleMembers] = useState(new Set()); // Set<key>
  const [groupModalSection, setGroupModalSection] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [groupAmount, setGroupAmount] = useState('');

  // Ref for printable section (must be before early return)
  const pdfRef = useRef(null);

  // `saving` disables the Save button while the Firestore write is in flight.
  const [saving, setSaving] = useState(false);

  // Drag sensor: small activation distance so it doesn't fight with taps
  // on the qty/rate inputs or the remove button within the same row.
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Track whether initial data has loaded yet, since `event` (and its
  // items) can arrive asynchronously from Firestore after first render.
  const loadedRef = useRef(!!event);

  // ------------------------------------------------------------
  // DATA LOADING / EFFECTS
  // ------------------------------------------------------------

  // Sync editor state once the event actually loads (handles the async
  // Firestore listener — event may not be ready on first render).
  useEffect(() => {
    if (event && !loadedRef.current) {
      const derived = deriveState(event);
      setSectionItems(derived.sectionItems);
      setItemPrices(derived.itemPrices);
      setBundles(derived.bundles);
      setHidePrices(derived.hidePrices);
      setFinalAmounts(derived.finalAmounts);
      loadedRef.current = true;
    }
  }, [event]);

  // ------------------------------------------------------------
  // DERIVED / CALCULATED VALUES
  // ------------------------------------------------------------

  // Build event groups (main + sub-events) with their current item names,
  // in save order. Always rendered as its own section, headline included.
  const printGroups = useMemo(() => {
    if (!event) return [];
    if (event.mainEvent) {
      const groups = [{
        id: 'main',
        name: event.mainEvent.name || event.eventType || 'Main Event',
        date: event.mainEvent.date || '',
        location: event.mainEvent.location || '',
        items: sectionItems.main || [],
      }];
      (event.subEvents || []).forEach(s => {
        groups.push({
          id: s.id,
          name: s.name || 'Sub Event',
          date: s.date || '',
          location: s.location || '',
          items: sectionItems[s.id] || [],
        });
      });
      return groups;
    }
    // Old format - single group
    return [{
      id: 'main',
      name: event.eventType || 'Event',
      date: event.date || '',
      location: event.eventLocation || '',
      items: sectionItems.main || [],
    }];
  }, [event, sectionItems]);

  // Each section's total, respecting hide-prices/bundles (see utils/helpers.js)
  const sectionTotals = useMemo(() => {
    const totals = {};
    printGroups.forEach(g => {
      totals[g.id] = computeSectionTotal(g.id, g.items, itemPrices, bundles, hidePrices, finalAmounts);
    });
    return totals;
  }, [printGroups, itemPrices, bundles, hidePrices, finalAmounts]);

  // Grand subtotal across all sections
  const subtotal = useMemo(
    () => Object.values(sectionTotals).reduce((s, v) => s + v, 0),
    [sectionTotals]
  );

  // Calculate GST breakdown
  const gstData = useMemo(() => calcGST(subtotal, gstEnabled ? Number(gstRate) : 0), [subtotal, gstEnabled, gstRate]);

  // Whether the top "Group" button should be enabled: 2+ standalone items
  // selected, all within the same section (a bundle can't span sections).
  const groupSections = useMemo(
    () => Object.entries(selectedForGroup).filter(([, set]) => set.size > 0).map(([id]) => id),
    [selectedForGroup]
  );
  const groupSectionId = groupSections.length === 1 ? groupSections[0] : null;
  const standaloneSelectedCount = groupSectionId ? (selectedForGroup[groupSectionId]?.size || 0) : 0;

  // If exactly one existing bundle's header checkbox is checked, that bundle
  // is the target to merge newly-selected standalone items into (rather than
  // creating a brand new bundle).
  const mergeTargetBundle = useMemo(() => {
    if (selectedBundles.size !== 1) return null;
    const id = Array.from(selectedBundles)[0];
    return bundles.find(b => b.id === id) || null;
  }, [selectedBundles, bundles]);

  const canMergeIntoExisting = !!mergeTargetBundle && standaloneSelectedCount >= 1 &&
    (!groupSectionId || mergeTargetBundle.itemKeys[0]?.split('::')[0] === groupSectionId);
  const canCreateNewGroup = !mergeTargetBundle && !!groupSectionId && standaloneSelectedCount >= 2;
  const canGroup = canMergeIntoExisting || canCreateNewGroup;

  // Whether the top "Ungroup" button should be enabled: any bundle checked
  // via its header checkbox (full dissolve), or any individual member
  // checked inside a bundle (pulls just that item out).
  const canUngroup = selectedBundles.size > 0 || selectedBundleMembers.size > 0;

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-bb-muted">Event not found</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  // ------------------------------------------------------------
  // EVENT HANDLERS — ITEMS
  // ------------------------------------------------------------

  /** Adds a custom free-text item to the given section's quotation (main event or a specific sub-event) */
  const handleAddItem = (sectionId) => {
    const name = (newItemNames[sectionId] || '').trim();
    if (!name) return;
    if ((sectionItems[sectionId] || []).includes(name)) return;
    setSectionItems(s => ({ ...s, [sectionId]: [...(s[sectionId] || []), name] }));
    setItemPrices(p => ({ ...p, [`${sectionId}::${name}`]: { qty: 1, rate: 0 } }));
    setNewItemNames(n => ({ ...n, [sectionId]: '' }));
  };

  /** Adds a predefined item from a category to the given section's quotation */
  const handleAddFromCategory = (sectionId, itemName) => {
    if ((sectionItems[sectionId] || []).includes(itemName)) return;
    setSectionItems(s => ({ ...s, [sectionId]: [...(s[sectionId] || []), itemName] }));
    setItemPrices(p => ({ ...p, [`${sectionId}::${itemName}`]: { qty: 1, rate: 0 } }));
  };

  /** Removes an item from the quotation and its price data. If it belonged to a bundle, removes it from that bundle too (deleting the bundle if it drops to 1 member). */
  const handleRemoveItem = (sectionId, name) => {
    const key = `${sectionId}::${name}`;
    setSectionItems(s => ({ ...s, [sectionId]: (s[sectionId] || []).filter(n => n !== name) }));
    setItemPrices(p => {
      const next = { ...p };
      delete next[key];
      return next;
    });
    setBundles(bs => bs
      .map(b => b.itemKeys.includes(key) ? { ...b, itemKeys: b.itemKeys.filter(k => k !== key) } : b)
      .filter(b => b.itemKeys.length >= 2)); // a "bundle" of 1 item isn't a bundle anymore
  };

  /** Toggles a category's expanded state in the add-from-category modal */
  const toggleCategory = (catId) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — REORDER
  // ------------------------------------------------------------

  /** Handles a drag-drop reorder within one section's line entries (items and/or bundles, each bundle moving as one block). */
  const handleDragEnd = (sectionId, entries) => (dragEvent) => {
    const { active, over } = dragEvent;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex(e => (e.type === 'bundle' ? `bundle:${e.bundle.id}` : e.key) === active.id);
    const newIndex = entries.findIndex(e => (e.type === 'bundle' ? `bundle:${e.bundle.id}` : e.key) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(entries, oldIndex, newIndex);
    const newNames = flattenLineEntries(reordered, sectionId);
    setSectionItems(s => ({ ...s, [sectionId]: newNames }));
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — BUNDLES (CREATE GROUP / UNGROUP)
  // ------------------------------------------------------------

  /** Toggles one standalone item's checkbox selection, within a given section — feeds the top "Group" button. */
  const toggleSelectForGroup = (sectionId, name) => {
    setSelectedForGroup(prev => {
      const current = new Set(prev[sectionId] || []);
      if (current.has(name)) current.delete(name); else current.add(name);
      return { ...prev, [sectionId]: current };
    });
  };

  /** Toggles one existing bundle's header checkbox — feeds the top "Ungroup" button. */
  const toggleSelectBundle = (bundleId) => {
    setSelectedBundles(prev => {
      const next = new Set(prev);
      if (next.has(bundleId)) next.delete(bundleId); else next.add(bundleId);
      return next;
    });
  };

  /** Toggles one bundle member's own checkbox — lets it be pulled out of its group individually via "Ungroup", without checking the group's header. */
  const toggleSelectBundleMember = (key) => {
    setSelectedBundleMembers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  /** Opens the "Create Group" popup for whichever section currently has 2+ standalone items selected. */
  const openGroupModal = (sectionId) => {
    setGroupModalSection(sectionId);
    setGroupName('');
    setGroupAmount('');
  };

  /**
   * Top "Group" button click handler. Routes between two behaviors:
   * - If exactly one existing bundle is checked (via its header) and 1+
   *   standalone items are also checked, merge those items straight into
   *   that bundle (no modal — there's already a price to work with).
   * - Otherwise, if 2+ standalone items are checked in one section, open
   *   the "Create Group" modal to build a brand new bundle, as before.
   */
  const handleGroupClick = () => {
    if (canMergeIntoExisting) {
      const sectionId = mergeTargetBundle.itemKeys[0].split('::')[0];
      const namesToAdd = Array.from(selectedForGroup[sectionId] || []);
      if (namesToAdd.length === 0) return;
      const keysToAdd = namesToAdd.map(n => `${sectionId}::${n}`);
      setBundles(bs => bs.map(b => b.id === mergeTargetBundle.id
        ? { ...b, itemKeys: [...b.itemKeys, ...keysToAdd] }
        : b));
      setSelectedForGroup(prev => ({ ...prev, [sectionId]: new Set() }));
      setSelectedBundles(new Set());
      showToast(`Added ${namesToAdd.length} item${namesToAdd.length > 1 ? 's' : ''} to "${mergeTargetBundle.name}"`);
    } else if (canCreateNewGroup) {
      openGroupModal(groupSectionId);
    }
  };

  /** Confirms bundle creation: groups the selected items under one shared price and clears their individual selection. */
  const handleCreateGroup = () => {
    const sectionId = groupModalSection;
    const names = Array.from(selectedForGroup[sectionId] || []);
    if (names.length < 2) return;
    const amount = Number(groupAmount) || 0;
    const bundle = {
      id: `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: groupName.trim() || names.join(' + '),
      itemKeys: names.map(n => `${sectionId}::${n}`),
      amount,
    };
    setBundles(bs => [...bs, bundle]);
    setSelectedForGroup(prev => ({ ...prev, [sectionId]: new Set() }));
    setGroupModalSection(null);
  };

  /**
   * Handles the top "Ungroup" button. Two things can be selected at once,
   * and both are applied together:
   * - Bundles checked via their own header checkbox are fully dissolved —
   *   every member returns to being a normal, individually-priced item.
   * - Individual members checked inside a (not fully-checked) bundle are
   *   pulled out of that bundle only, leaving the rest of the group intact.
   *   If this drops a bundle below 2 remaining members, it auto-dissolves
   *   too, since a "bundle" of 1 item isn't a bundle (same rule as
   *   handleRemoveItem).
   */
  const handleUngroupSelected = () => {
    setBundles(bs => bs
      .filter(b => !selectedBundles.has(b.id))
      .map(b => ({ ...b, itemKeys: b.itemKeys.filter(k => !selectedBundleMembers.has(k)) }))
      .filter(b => b.itemKeys.length >= 2));
    setSelectedBundles(new Set());
    setSelectedBundleMembers(new Set());
  };

  /**
   * Updates one bundle member's qty/rate, then re-syncs the bundle's total
   * amount to the sum of all its members' qty * rate — this is what lets
   * filling in member prices "calculate and give the final group price"
   * automatically, without a separate recalculate step.
   */
  const updateBundleMemberPrice = (bundle, key, field, value) => {
    const nextPrices = { ...itemPrices, [key]: { ...itemPrices[key], [field]: value } };
    setItemPrices(nextPrices);
    const sum = bundle.itemKeys.reduce((s, k) => {
      const p = nextPrices[k] || { qty: 1, rate: 0 };
      return s + (Number(p.qty) || 0) * (Number(p.rate) || 0);
    }, 0);
    setBundles(bs => bs.map(b => b.id === bundle.id ? { ...b, amount: sum } : b));
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — SAVE
  // ------------------------------------------------------------

  /** Persists the current items, prices, bundles, and hide-prices settings back to the event in context. Awaits the write; toasts real success/failure. */
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updateData = { itemPrices, bundles, hidePrices, finalAmounts, totalAmount: subtotal };

      if (event.mainEvent) {
        updateData.mainEvent = { ...event.mainEvent, items: sectionItems.main || [] };
        updateData.subEvents = (event.subEvents || []).map(s => ({ ...s, items: sectionItems[s.id] || [] }));
      } else {
        updateData.items = sectionItems.main || [];
      }

      const result = await updateEvent(eventId, updateData);
      if (result.success) {
        showToast('Quotation saved');
      } else {
        showToast(result.error || 'Failed to save quotation', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — PRINT / SHARE
  // ------------------------------------------------------------

  /** Triggers the browser print dialog with descriptive PDF filename */
  const handlePrint = () => {
    const dateStr = displayDate ? formatDateReadable(displayDate) : formatDateReadable(new Date().toISOString());
    document.title = `Quotation - ${event.clientName || 'Client'} ${event.eventType || 'Event'} ${dateStr}`;
    window.print();
    document.title = 'EventScope';
  };

  /** Generates a formatted WhatsApp message with quotation details */
  const generateWhatsAppMsg = () => {
    let msg = `*QUOTATION*\n`;
    msg += `From: ${settings.companyName}\n`;
    msg += `To: ${event.clientName}\n`;
    msg += `Date: ${formatDateReadable(new Date().toISOString())}\n\n`;
    msg += `*Event:* ${event.eventType}\n`;
    const mainDate = event.mainEvent?.date || event.date;
    if (mainDate) msg += `*Event Date:* ${formatDateReadable(mainDate)}\n\n`;
    msg += `*Items:*\n`;
    let idx = 0;
    printGroups.forEach(group => {
      group.items.forEach(name => {
        idx++;
        const key = `${group.id}::${name}`;
        const p = itemPrices[key] || { qty: 1, rate: 0 };
        msg += `${idx}. ${name} - Qty: ${p.qty} × ₹${p.rate} = ₹${(p.qty * p.rate).toLocaleString('en-IN')}\n`;
      });
    });
    msg += `\n*Subtotal:* ${formatCurrency(subtotal)}`;
    if (gstEnabled) {
      msg += `\n*GST (${gstRate}%):* ${formatCurrency(gstData.tax)}`;
    }
    msg += `\n*Total:* ${formatCurrency(gstData.total)}\n`;
    msg += `\nValid for ${validityDays} days.\n`;
    msg += `\n${settings.companyName} | ${settings.phone}`;
    return msg;
  };

  /** Opens WhatsApp with the pre-filled quotation message */
  const handleWhatsApp = () => {
    const phone = event.clientWhatsapp || event.clientPhone;
    if (phone) {
      window.open(waLink(phone, generateWhatsAppMsg()), '_blank');
    }
  };

  // Get the main event date for display
  const displayDate = event.mainEvent?.date || event.date || '';

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  return (
    <div className="space-y-4 pb-8">
      {/* Controls - hidden in print */}
      <div data-no-print className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-bb-card text-bb-muted hover:text-bb-text transition-colors cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-bb-text">Quotation</h1>
        </div>

        {/* Items & Pricing Card */}
        <Card>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-bb-muted uppercase">Items & Pricing</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                size="sm" variant="outline" icon={Layers}
                disabled={!canGroup}
                onClick={handleGroupClick}
              >
                Group
              </Button>
              <Button
                size="sm" variant="outline" icon={Ungroup}
                disabled={!canUngroup}
                onClick={handleUngroupSelected}
              >
                Ungroup
              </Button>
              <Toggle
                label="Hide Prices"
                checked={hidePrices}
                onChange={e => setHidePrices(e.target.checked)}
              />
            </div>
          </div>

          <div className="space-y-5">
            {printGroups.map(group => {
              const entries = buildLineEntries(group.id, group.items, bundles);
              const entryIds = entries.map(en => en.type === 'bundle' ? `bundle:${en.bundle.id}` : en.key);
              const selected = selectedForGroup[group.id] || new Set();

              return (
                <div key={group.id}>
                  {/* Section headline — separates Main Event from each Sub Event */}
                  <p className="text-xs font-bold uppercase tracking-wide text-bb-accent mb-2">
                    {group.name}{group.date ? ` — ${formatDateReadable(group.date)}` : ''}
                  </p>

                  {/* Unified rendering for both modes — bundles stay visually
                      grouped either way; hidePrices only hides the price-
                      related inputs (rate, group total), never the grouping
                      itself. Reordering works in both modes too. */}
                  <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(group.id, entries)}>
                    <SortableContext items={entryIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {entries.map(entry => {
                          if (entry.type === 'bundle') {
                            const b = entry.bundle;
                            return (
                              <SortableEntry key={`bundle:${b.id}`} id={`bundle:${b.id}`}>
                                <div className="p-2 bg-bb-accent/5 border border-bb-accent/30 rounded-lg space-y-2">
                                  {/* Header: checkbox selects the whole bundle for Ungroup */}
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={selectedBundles.has(b.id)}
                                      onChange={() => toggleSelectBundle(b.id)}
                                      className="w-4 h-4 accent-bb-accent shrink-0"
                                      title="Select this group to ungroup"
                                    />
                                    <span className="text-sm font-semibold text-bb-text">{b.name}</span>
                                  </div>
                                  {/* Member rows — same layout/font size as standalone items below, one per line. Qty always shown; rate only when prices aren't hidden. */}
                                  <div className="space-y-1.5 pl-6">
                                    {b.itemKeys.map(k => {
                                      const memberName = k.split('::').slice(1).join('::');
                                      const p = itemPrices[k] || { qty: 1, rate: 0 };
                                      return (
                                        <div key={k} className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={selectedBundleMembers.has(k)}
                                            onChange={() => toggleSelectBundleMember(k)}
                                            className="w-4 h-4 accent-bb-accent shrink-0"
                                            title="Select to pull this item out of the group"
                                          />
                                          <p className="flex-1 min-w-0 text-sm text-bb-text truncate">{memberName}</p>
                                          <input
                                            type="number" min="1" placeholder="Qty"
                                            value={p.qty === '' ? '' : (p.qty || 1)}
                                            onChange={e => updateBundleMemberPrice(b, k, 'qty', e.target.value === '' ? '' : Number(e.target.value))}
                                            className="w-16 bg-bb-bg border border-bb-border rounded px-2 py-1.5 text-sm text-bb-text text-center"
                                          />
                                          {!hidePrices && (
                                            <>
                                              <span className="text-bb-muted text-sm">×</span>
                                              <input
                                                type="number" min="0" placeholder="Rate"
                                                value={p.rate || ''}
                                                onChange={e => updateBundleMemberPrice(b, k, 'rate', Number(e.target.value) || 0)}
                                                className="w-24 bg-bb-bg border border-bb-border rounded px-2 py-1 text-sm text-bb-text text-right"
                                              />
                                            </>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {/* Total Group Price — hidden entirely while Hide Prices is on, since the section's Final Amount below takes over as the actual charged total */}
                                  {!hidePrices && (
                                    <div className="flex items-center gap-2 pt-1.5 border-t border-bb-accent/20">
                                      <span className="text-xs font-semibold text-bb-muted uppercase flex-1">Total Group Price</span>
                                      <span className="text-bb-muted text-sm">₹</span>
                                      <input
                                        type="number" min="0"
                                        value={b.amount || ''}
                                        onChange={e => setBundles(bs => bs.map(x => x.id === b.id ? { ...x, amount: Number(e.target.value) || 0 } : x))}
                                        className="w-28 bg-bb-bg border border-bb-border rounded px-2 py-1 text-sm font-semibold text-bb-text text-right"
                                      />
                                    </div>
                                  )}
                                </div>
                              </SortableEntry>
                            );
                          }

                          const { key, name } = entry;
                          return (
                            <SortableEntry key={key} id={key}>
                              <div className="flex items-center gap-2 p-2 bg-bb-input rounded-lg">
                                <input
                                  type="checkbox"
                                  checked={selected.has(name)}
                                  onChange={() => toggleSelectForGroup(group.id, name)}
                                  className="w-4 h-4 accent-bb-accent shrink-0"
                                  title="Select for grouping"
                                />
                                <p className="flex-1 min-w-0 text-sm text-bb-text truncate">{name}</p>
                                <input
                                  type="number" min="1" placeholder="Qty"
                                  value={itemPrices[key]?.qty === '' ? '' : (itemPrices[key]?.qty || 1)}
                                  onChange={e => setItemPrices(p => ({ ...p, [key]: { ...p[key], qty: e.target.value === '' ? '' : Number(e.target.value) } }))}
                                  className="w-16 bg-bb-bg border border-bb-border rounded px-2 py-1.5 text-sm text-bb-text text-center"
                                />
                                {!hidePrices && (
                                  <>
                                    <span className="text-bb-muted text-sm">×</span>
                                    <input
                                      type="number" min="0" placeholder="Rate"
                                      value={itemPrices[key]?.rate || ''}
                                      onChange={e => setItemPrices(p => ({ ...p, [key]: { ...p[key], rate: Number(e.target.value) || 0 } }))}
                                      className="w-24 bg-bb-bg border border-bb-border rounded px-2 py-1 text-sm text-bb-text text-right"
                                    />
                                  </>
                                )}
                                <button
                                  onClick={() => handleRemoveItem(group.id, name)}
                                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                  title="Remove item"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </SortableEntry>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>

                  {/* Final Amount — only shown while Hide Prices is on; this becomes the section's actual charged total instead of the itemized/bundle sum above */}
                  {hidePrices && (
                    <Input
                      label={`${group.name} — Final Amount (₹)`}
                      type="number" min="0"
                      value={finalAmounts[group.id] ?? ''}
                      onChange={e => setFinalAmounts(f => ({ ...f, [group.id]: Number(e.target.value) || 0 }))}
                      className="mt-2"
                    />
                  )}

                  {group.items.length === 0 && (
                    <p className="text-sm text-bb-muted text-center py-3">No items in this section yet</p>
                  )}

                  {!hidePrices && (
                    <p className="text-right text-sm font-semibold text-bb-text mt-2">
                      Section Total: {formatCurrency(sectionTotals[group.id] || 0)}
                    </p>
                  )}

                  {/* Add Item — scoped to this section, so items land on the
                      main event or the specific sub-event being edited. */}
                  <div className="mt-3 pt-3 border-t border-bb-border/60 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={`Add item to ${group.name}...`}
                        value={newItemNames[group.id] || ''}
                        onChange={e => setNewItemNames(n => ({ ...n, [group.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleAddItem(group.id)}
                        className="flex-1 bg-bb-input border border-bb-border rounded-lg px-3 py-2 text-sm text-bb-text placeholder:text-bb-muted/60 focus:outline-none focus:ring-2 focus:ring-bb-accent"
                      />
                      <Button size="sm" icon={Plus} onClick={() => handleAddItem(group.id)}>Add</Button>
                    </div>
                    <Button size="sm" variant="outline" icon={Package} onClick={() => setCategoryModalSection(group.id)}>
                      Add from Categories
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* GST & Validity */}
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-bb-border">
            <Toggle label="Include GST" checked={gstEnabled} onChange={e => setGstEnabled(e.target.checked)} />
            {gstEnabled && (
              <Select
                label="GST Rate"
                options={['5', '12', '18', '28']}
                value={gstRate}
                onChange={e => setGstRate(e.target.value)}
                className="w-28"
              />
            )}
            <Input
              label="Validity (days)"
              type="number"
              value={validityDays}
              onChange={e => setValidityDays(Number(e.target.value))}
              className="w-32"
            />
          </div>
        </Card>

        {/* Action Buttons */}
        <div data-no-print className="flex gap-2 flex-wrap">
          <Button icon={Save} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Quotation'}</Button>
          <Button icon={Printer} variant="secondary" onClick={handlePrint}>Print / PDF</Button>
          <Button icon={MessageSquare} variant="success" onClick={handleWhatsApp}>Share via WhatsApp</Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>Back</Button>
        </div>
      </div>

      {/* Create Group Modal */}
      <Modal isOpen={!!groupModalSection} onClose={() => setGroupModalSection(null)} title="Create Group" size="md">
        {groupModalSection && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-bb-muted uppercase mb-1">Items in this group</p>
              <p className="text-sm text-bb-text">
                {Array.from(selectedForGroup[groupModalSection] || []).join(', ')}
              </p>
            </div>
            <Input
              label="Group Name"
              placeholder="e.g. Stage Package"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
            />
            <Input
              label="Group Price (₹)"
              type="number" min="0"
              value={groupAmount}
              onChange={e => setGroupAmount(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setGroupModalSection(null)}>Cancel</Button>
              <Button onClick={handleCreateGroup}>Create Group</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Category Selection Modal - Accordion style — scoped to whichever section's "Add from Categories" was clicked */}
      <Modal
        isOpen={!!categoryModalSection}
        onClose={() => setCategoryModalSection(null)}
        title={`Add from Categories — ${printGroups.find(g => g.id === categoryModalSection)?.name || ''}`}
        size="lg"
      >
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {categories.map(cat => {
            const availableItems = (cat.items || []).filter(i => !(sectionItems[categoryModalSection] || []).includes(i));
            const isExpanded = expandedCategories[cat.id];
            return (
              <div key={cat.id} className="border border-bb-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bb-input transition-colors cursor-pointer"
                >
                  <span className="text-sm font-medium text-bb-text">
                    {cat.icon} {cat.name}
                    <span className="ml-2 text-xs text-bb-muted">({availableItems.length} available)</span>
                  </span>
                  {isExpanded ? <ChevronDown size={16} className="text-bb-muted" /> : <ChevronRight size={16} className="text-bb-muted" />}
                </button>
                {isExpanded && availableItems.length > 0 && (
                  <div className="px-4 pb-3 space-y-1">
                    {availableItems.map(item => (
                      <button
                        key={item}
                        onClick={() => handleAddFromCategory(categoryModalSection, item)}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm text-bb-text hover:bg-bb-accent/10 hover:text-bb-accent transition-colors cursor-pointer"
                      >
                        <Plus size={14} className="inline mr-2" />{item}
                      </button>
                    ))}
                  </div>
                )}
                {isExpanded && availableItems.length === 0 && (
                  <p className="px-4 pb-3 text-xs text-bb-muted">All items already added</p>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* === Quotation Preview - printable document === */}
      <div ref={pdfRef} className="print-doc" style={{backgroundColor: 'white', color: '#1f2937', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', maxWidth: '800px', margin: '0 auto', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}>
        <table style={{width: '100%', borderCollapse: 'collapse', padding: '0', margin: '0'}}>
          <tbody>
            {/* Row 1: Title */}
            <tr>
              <td colSpan="5" style={{textAlign: 'center', padding: '24px 24px 12px'}}>
                <span style={{fontSize: '20px', fontWeight: '800', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#652D90'}}>QUOTATION</span>
                <div style={{height: '3px', width: '80px', margin: '8px auto 0', backgroundColor: '#652D90', borderRadius: '2px'}} />
              </td>
            </tr>

            {/* Row 2: Company address left, Logo right */}
            <tr>
              <td colSpan="3" style={{verticalAlign: 'top', padding: '12px 24px', fontSize: '11px', color: '#4b5563', lineHeight: '1.7'}}>
                {/* Company block — from the tenant's own settings */}
                <span style={{fontWeight: '700', fontSize: '13px', color: '#1f2937'}}>{settings.companyName}</span>
                {settings.tagline && <span style={{color: '#4b5563'}}> — {settings.tagline}</span>}<br/>
                {(settings.address || '').split('\n').filter(Boolean).map((line, i) => (
                  <React.Fragment key={i}>{line}<br/></React.Fragment>
                ))}
                {[settings.phone && `Ph: ${settings.phone}`, settings.gstin && `GSTIN: ${settings.gstin}`].filter(Boolean).join(' | ')}
              </td>
              <td colSpan="2" style={{verticalAlign: 'top', textAlign: 'right', padding: '12px 24px'}}>
                {settings.logo && <img src={settings.logo} alt={settings.companyName || 'Logo'} style={{height: '40px', width: 'auto', marginLeft: 'auto', display: 'block'}} />}
              </td>
            </tr>

            {/* Row 3: Thin gray separator */}
            <tr>
              <td colSpan="5" style={{padding: '0 24px'}}>
                <div style={{height: '1px', backgroundColor: '#e5e7eb'}} />
              </td>
            </tr>

            {/* Row 4: Two boxes with purple top border */}
            <tr>
              <td colSpan="3" style={{verticalAlign: 'top', padding: '16px 24px 12px', width: '60%'}}>
                <div style={{borderTop: '3px solid #652D90', padding: '12px 0 0'}}>
                  <span style={{fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#652D90'}}>BILL TO/ CLIENT</span><br/>
                  <span style={{fontSize: '14px', fontWeight: '700', color: '#1f2937', lineHeight: '2'}}>{event.clientName}</span><br/>
                  {event.clientPhone && <span style={{fontSize: '11px', color: '#6b7280'}}>Phone: {event.clientPhone}</span>}
                  {event.clientAddress && <><br/><span style={{fontSize: '11px', color: '#6b7280'}}>{event.clientAddress}</span></>}
                </div>
              </td>
              <td colSpan="2" style={{verticalAlign: 'top', padding: '16px 24px 12px', width: '40%'}}>
                <div style={{borderTop: '3px solid #652D90', padding: '12px 0 0', fontSize: '11px', color: '#4b5563', lineHeight: '1.9'}}>
                  <span style={{fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#652D90'}}>EVENT DETAILS</span><br/>
                  {event.eventType && <>Event: {event.eventType}<br/></>}
                  {displayDate && <>Date: {formatDateReadable(displayDate)}<br/></>}
                  {(event.mainEvent?.location || event.eventLocation) && <>Venue: {event.mainEvent?.location || event.eventLocation}<br/></>}
                  Quote Date: {formatDateReadable(new Date().toISOString())}<br/>
                  Valid for: {validityDays} Days
                </div>
              </td>
            </tr>

            {/* Items grouped by Event — sections with no items are skipped here (they're just empty in the editor, not shown to the client) */}
            {printGroups.filter(g => g.items.length > 0).map((group) => {
              const entries = buildLineEntries(group.id, group.items, bundles);
              let slNo = 0;

              return (
                <React.Fragment key={group.id}>
                  {/* Row 5: Event section header */}
                  <tr>
                    <td colSpan="5" style={{padding: '16px 24px 6px'}}>
                      <span style={{fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#652D90'}}>
                        {group.name}{group.date ? ` — ${formatDateReadable(group.date)}` : ''}{group.location ? `, ${group.location}` : ''}
                      </span>
                      <div style={{height: '2px', marginTop: '6px', backgroundColor: '#652D90', opacity: 0.3, borderRadius: '1px'}} />
                    </td>
                  </tr>

                  {/* Row 6: Table column headers.
                      Hide-prices mode uses the same 5 logical columns but
                      redistributes them: Particulars stretches across the
                      old Particulars+Qty+Rate slots, and Qty moves to sit
                      at the true right edge (the old Amount slot) instead
                      of leaving two empty columns after it. */}
                  {hidePrices ? (
                    <tr style={{backgroundColor: '#f5f0fa'}}>
                      <th colSpan="1" style={{padding: '8px 12px 8px 24px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px'}}>Sl.</th>
                      <th colSpan="3" style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Particulars</th>
                      <th colSpan="1" style={{padding: '8px 12px 8px 12px', textAlign: 'right', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '90px', paddingRight: '24px'}}>Qty</th>
                    </tr>
                  ) : (
                    <tr style={{backgroundColor: '#f5f0fa'}}>
                      <th style={{padding: '8px 12px 8px 24px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px'}}>Sl.</th>
                      <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Particulars</th>
                      <th style={{padding: '8px 12px', textAlign: 'center', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '50px'}}>Qty</th>
                      <th style={{padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '90px'}}>Rate (₹)</th>
                      <th style={{padding: '8px 12px 8px 12px', textAlign: 'right', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '100px', paddingRight: '24px'}}>Amount (₹)</th>
                    </tr>
                  )}

                  {hidePrices ? (
                    // ---- Hide-prices mode: bundle-aware, item name + quantity only, redistributed across the same 5 columns (see header comment above) ----
                    entries.map((entry) => {
                      if (entry.type === 'bundle') {
                        const b = entry.bundle;
                        const memberNames = b.itemKeys.map(k => k.split('::').slice(1).join('::'));
                        slNo++;
                        return (
                          <tr key={`bundle:${b.id}`} style={{borderBottom: '1px solid #f0f0f0'}}>
                            <td colSpan="1" style={{padding: '10px 12px 10px 24px', color: '#6b7280', fontSize: '12px'}}>{slNo}</td>
                            <td colSpan="3" style={{padding: '10px 12px', color: '#1f2937', fontSize: '12px'}}>
                              <span style={{fontWeight: '600'}}>{b.name}</span>
                              {memberNames.map((mn, i) => (
                                <div key={i} style={{fontSize: '12px', color: '#1f2937', marginTop: '2px'}}>{mn}</div>
                              ))}
                            </td>
                            <td colSpan="1" style={{padding: '10px 12px 10px 12px', textAlign: 'right', color: '#4b5563', fontSize: '12px', paddingRight: '24px'}}>
                              <div style={{visibility: 'hidden', fontWeight: '600'}}>&nbsp;</div>
                              {b.itemKeys.map((k, i) => (
                                <div key={i} style={{marginTop: i === 0 ? 0 : '2px'}}>{(itemPrices[k] || { qty: 1 }).qty}</div>
                              ))}
                            </td>
                          </tr>
                        );
                      }
                      slNo++;
                      const { key, name } = entry;
                      const p = itemPrices[key] || { qty: 1, rate: 0 };
                      return (
                        <tr key={key} style={{borderBottom: '1px solid #f0f0f0'}}>
                          <td colSpan="1" style={{padding: '10px 12px 10px 24px', color: '#6b7280', fontSize: '12px'}}>{slNo}</td>
                          <td colSpan="3" style={{padding: '10px 12px', color: '#1f2937', fontSize: '12px'}}>{name}</td>
                          <td colSpan="1" style={{padding: '10px 12px 10px 12px', textAlign: 'right', color: '#4b5563', fontSize: '12px', paddingRight: '24px'}}>{p.qty}</td>
                        </tr>
                      );
                    })
                  ) : (
                    // ---- Normal mode: standalone items priced individually, bundles as one grouped row ----
                    entries.map((entry) => {
                      if (entry.type === 'bundle') {
                        const b = entry.bundle;
                        const memberNames = b.itemKeys.map(k => k.split('::').slice(1).join('::'));
                        slNo++;
                        return (
                          <tr key={`bundle:${b.id}`} style={{borderBottom: '1px solid #f0f0f0'}}>
                            <td style={{padding: '10px 12px 10px 24px', color: '#6b7280', fontSize: '12px'}}>{slNo}</td>
                            <td style={{padding: '10px 12px', color: '#1f2937', fontSize: '12px'}}>
                              <span style={{fontWeight: '600'}}>{b.name}</span>
                              {memberNames.map((mn, i) => (
                                <div key={i} style={{fontSize: '12px', color: '#1f2937', marginTop: '2px'}}>{mn}</div>
                              ))}
                            </td>
                            <td style={{padding: '10px 12px', textAlign: 'center', color: '#4b5563', fontSize: '12px'}}>
                              <div style={{visibility: 'hidden'}}>&nbsp;</div>
                              {b.itemKeys.map((k, i) => (
                                <div key={i} style={{marginTop: i === 0 ? 0 : '2px'}}>{(itemPrices[k] || { qty: 1 }).qty}</div>
                              ))}
                            </td>
                            <td style={{padding: '10px 12px', textAlign: 'right', color: '#4b5563', fontSize: '12px'}}>
                              <div style={{visibility: 'hidden'}}>&nbsp;</div>
                              {b.itemKeys.map((k, i) => {
                                const rate = (itemPrices[k] || { rate: 0 }).rate;
                                return <div key={i} style={{marginTop: i === 0 ? 0 : '2px'}}>{rate > 0 ? formatCurrency(rate) : '—'}</div>;
                              })}
                            </td>
                            <td style={{padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#1f2937', fontSize: '12px', paddingRight: '24px'}}>
                              <div style={{visibility: 'hidden'}}>&nbsp;</div>
                              {formatCurrency(b.amount)}
                            </td>
                          </tr>
                        );
                      }
                      slNo++;
                      const { key, name } = entry;
                      const p = itemPrices[key] || { qty: 1, rate: 0 };
                      return (
                        <tr key={key} style={{borderBottom: '1px solid #f0f0f0'}}>
                          <td style={{padding: '10px 12px 10px 24px', color: '#6b7280', fontSize: '12px'}}>{slNo}</td>
                          <td style={{padding: '10px 12px', color: '#1f2937', fontSize: '12px'}}>{name}</td>
                          <td style={{padding: '10px 12px', textAlign: 'center', color: '#4b5563', fontSize: '12px'}}>{p.qty}</td>
                          <td style={{padding: '10px 12px', textAlign: 'right', color: '#4b5563', fontSize: '12px'}}>{formatCurrency(p.rate)}</td>
                          <td style={{padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#1f2937', fontSize: '12px', paddingRight: '24px'}}>{formatCurrency(p.qty * p.rate)}</td>
                        </tr>
                      );
                    })
                  )}

                  {/* Section subtotal row — for hide-prices mode this IS the manually-entered final amount */}
                  <tr>
                    <td colSpan="5" style={{textAlign: 'right', padding: '10px 24px 16px'}}>
                      <span style={{fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginRight: '16px'}}>
                        {hidePrices ? 'Final Amount' : 'Subtotal'}
                      </span>
                      <span style={{fontSize: '14px', fontWeight: '700', color: '#1f2937'}}>{formatCurrency(sectionTotals[group.id] || 0)}</span>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}

            {/* Fallback if no items */}
            {printGroups.every(g => g.items.length === 0) && (
              <tr>
                <td colSpan="5" style={{textAlign: 'center', padding: '24px', color: '#6b7280', fontSize: '12px', fontStyle: 'italic'}}>
                  No items added to this quotation yet.
                </td>
              </tr>
            )}

            {/* Summary section */}
            {printGroups.some(g => g.items.length > 0) && (
              <>
                <tr><td colSpan="5" style={{padding: '4px 0'}} /></tr>

                <tr>
                  <td colSpan="5" style={{padding: '0 24px'}}>
                    <table style={{width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden'}}>
                      <tbody>
                        <tr style={{backgroundColor: '#f5f0fa'}}>
                          <td colSpan="2" style={{padding: '8px 16px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#652D90'}}>SUMMARY</td>
                        </tr>
                        {printGroups.filter(g => g.items.length > 0).map((group) => (
                          <tr key={group.id} style={{borderBottom: '1px solid #f3f4f6'}}>
                            <td style={{fontSize: '12px', color: '#4b5563', padding: '8px 16px'}}>{group.name}</td>
                            <td style={{fontSize: '12px', color: '#1f2937', fontWeight: '500', textAlign: 'right', padding: '8px 16px'}}>{formatCurrency(sectionTotals[group.id] || 0)}</td>
                          </tr>
                        ))}
                        <tr style={{borderTop: '1px solid #e5e7eb'}}>
                          <td style={{fontSize: '12px', color: '#6b7280', padding: '8px 16px'}}>Subtotal</td>
                          <td style={{fontSize: '12px', color: '#1f2937', fontWeight: '500', textAlign: 'right', padding: '8px 16px'}}>{formatCurrency(subtotal)}</td>
                        </tr>
                        {gstEnabled && (
                          <>
                            <tr style={{borderTop: '1px solid #f3f4f6'}}>
                              <td style={{fontSize: '12px', color: '#6b7280', padding: '6px 16px'}}>CGST ({Number(gstRate)/2}%)</td>
                              <td style={{fontSize: '12px', color: '#1f2937', textAlign: 'right', padding: '6px 16px'}}>{formatCurrency(gstData.cgst)}</td>
                            </tr>
                            <tr style={{borderTop: '1px solid #f3f4f6'}}>
                              <td style={{fontSize: '12px', color: '#6b7280', padding: '6px 16px'}}>SGST ({Number(gstRate)/2}%)</td>
                              <td style={{fontSize: '12px', color: '#1f2937', textAlign: 'right', padding: '6px 16px'}}>{formatCurrency(gstData.sgst)}</td>
                            </tr>
                          </>
                        )}
                        <tr style={{borderTop: '2px solid #652D90'}}>
                          <td style={{fontSize: '16px', fontWeight: '700', color: '#1f2937', padding: '12px 16px'}}>GRAND TOTAL</td>
                          <td style={{fontSize: '16px', fontWeight: '700', color: '#652D90', textAlign: 'right', padding: '12px 16px'}}>{formatCurrency(gstData.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </>
            )}

            {/* Terms & Conditions */}
            <tr>
              <td colSpan="5" style={{padding: '20px 24px 8px'}}>
                <span style={{fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#652D90'}}>TERMS & CONDITIONS</span>
                <div style={{marginTop: '8px', fontSize: '11px', color: '#4b5563', lineHeight: '1.6'}}>
                  <div style={{padding: '2px 0'}}>1. This quotation is valid for {validityDays} days from the date of issue.</div>
                  <div style={{padding: '2px 0'}}>2. Prices are subject to change after the validity period.</div>
                  <div style={{padding: '2px 0'}}>3. 50% advance payment required to confirm booking.</div>
                  {settings.termsAndConditions?.map((t, i) => (
                    <div key={i} style={{padding: '2px 0'}}>{i + 4}. {t}</div>
                  ))}
                </div>
              </td>
            </tr>

            {/* Validity bar */}
            <tr>
              <td colSpan="5" style={{padding: '12px 24px'}}>
                <div style={{backgroundColor: '#f3f4f6', borderRadius: '4px', padding: '10px 16px', textAlign: 'center'}}>
                  <span style={{fontSize: '11px', color: '#6b7280', fontStyle: 'italic'}}>
                    This quotation is valid for <span style={{fontWeight: '700', color: '#1f2937'}}>{validityDays} days</span> from the date of issue.
                  </span>
                </div>
              </td>
            </tr>

            {/* Footer */}
            <tr>
              <td colSpan="5" style={{textAlign: 'center', padding: '16px 24px 24px', borderTop: '1px solid #e5e7eb'}}>
                <span style={{fontSize: '14px', fontWeight: '700', color: '#1f2937'}}>{settings.companyName}</span><br/>
                <span style={{fontSize: '11px', color: '#6b7280', marginTop: '4px', display: 'inline-block'}}>{settings.phone}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
