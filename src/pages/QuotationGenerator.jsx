/**
 * QuotationGenerator — Professional quotation document builder
 *
 * Generates a print-ready quotation for an event. Groups items by main event
 * and sub-events. Allows adding/removing items, setting per-item quantities
 * and rates, reordering items via drag-and-drop, grouping items into priced
 * bundles, and hiding itemized pricing in favor of one final amount per
 * section. Supports an in-app PDF (preview → share/save), laptop printing
 * and a WhatsApp text summary.
 *
 * Pricing model (also read by BillGenerator — see utils/helpers.js):
 *   - Each item's price lives in itemPrices[`${sectionId}::${name}`] = {qty, rate, days}
 *     amount = qty × rate × days (days missing on old quotes = 1). New items
 *     start at their function's number of days (multi-day functions).
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
 * Discount (quoteDetails.discount): an amount ("5000") or a percentage
 * ("10%"), taken off before GST; the bill starts with it (helpers.getEventBill).
 *
 * Phones (below 1024px) get QuotePhoneEditor: Details | Preview tabs and a Save
 * icon in the purple title bar, a tools row (Group · Ungroup · Hide prices ·
 * More), tinted foldable events, open groups, an item ⋮ menu (move / remove
 * from group, duplicate, rename, delete), a Price & terms card and a bar pinned
 * to the bottom (total · PDF · Add item, which opens the Add items sheet).
 * Laptops get QuoteLaptopEditor: a title row with WhatsApp · Print · PDF ·
 * Save, a pinned tools row, each event as a list with a compact date band,
 * groups with their price at the end, a Subtotal line, and Price & terms;
 * the document preview below. Both have Fit to budget (FitBudgetSheet) and
 * quote versions (event.quoteRevisions, QuoteRevisionsSheet — utils/quoteFit).
 *
 * Saving: changes auto-save about 1.5 s after you stop typing (toast "✓ Saved");
 * the Save button saves at once, or says "Already saved ✌️". Both await
 * AppContext.updateEvent() — see CODE_STRUCTURE.md §4.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import PdfButton from '../components/PdfButton';
import DaysCell from '../components/DaysCell';
import {
  formatCurrency, formatDateReadable, calcGST, waLink,
  buildLineEntries, flattenLineEntries, computeSectionTotal,
  functionDays, functionEnd, functionDateText, itemDays, lineAmount, usesDays, parseDiscount, formatRupees,
  stableJson,
} from '../utils/helpers';
import {
  MessageSquare, Plus, Save,
  ChevronDown, ChevronRight, Layers, Ungroup,
} from 'lucide-react';
import { useConfirm } from '../components/useConfirm';
import { docBrandColor, showsEventScopeMark } from '../utils/billing';
import { useIsPhone } from '../components/useIsPhone';
import { usePhoneHeader } from '../components/phoneScreens';
import { HeaderIconButton } from '../components/PhoneHeader';
import ActionBar from '../components/ActionBar';
import BottomSheet from '../components/BottomSheet';
import DocFit from '../components/DocFit';
import { UnderlineTabs, IconButton, MenuRow, SectionLabel } from '../components/PhoneUI';
import AddItemsSheet from '../components/AddItemsSheet';
import QuotePhoneEditor, { QuoteTools } from '../components/QuotePhoneEditor';
import QuoteLaptopEditor, { QuoteLaptopTools } from '../components/QuoteLaptopEditor';
import { PageHeader, HeaderText } from '../components/LaptopUI';
import StickyBar from '../components/StickyBar';
import FitBudgetSheet from '../components/FitBudgetSheet';
import QuoteRevisionsSheet from '../components/QuoteRevisionsSheet';
import { fitUnits, applyFit, makeRevision, addRevision } from '../utils/quoteFit';
import {
  Wand2, History, FileSignature, ChevronsDownUp, ChevronsUpDown, Copy, Type, FolderInput, FolderOutput, Trash2, Undo2, Pencil,
} from 'lucide-react';

// ============================================================
// HELPERS
// ============================================================

/** { sectionId: number of days } for an event's functions (main + sub-events) */
const sectionDaysOf = (ev) => {
  if (!ev?.mainEvent) return { main: 1 };
  const out = { main: functionDays(ev.mainEvent) };
  (ev.subEvents || []).forEach(s => { out[s.id] = functionDays(s); });
  return out;
};

/** A fresh price for an item added to a section: 1 × ₹0 × the function's days */
const newPrice = (days) => ({ qty: 1, rate: 0, days: days || 1 });

// ============================================================
// QuotationGenerator — MAIN COMPONENT
// ============================================================

/** Builds and previews a printable quotation document for an event */
export default function QuotationGenerator() {
  const { eventId } = useParams();
  const { events, settings, categories, updateEvent, showToast, isSuspended, askUnlock, tenant } = useApp();
  // Premium: the company's own colour on the document and no EventScope mark
  const brand = docBrandColor(tenant?.plan, settings);
  const showMark = showsEventScopeMark(tenant?.plan);
  const confirm = useConfirm();
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
    if (!ev) return { sectionItems: {}, itemPrices: {}, bundles: [], hidePrices: false, finalAmounts: {}, quoteDetails: {}, revisions: [] };
    const stored = ev.itemPrices || {};
    const sectionItems = {};
    if (ev.mainEvent) {
      sectionItems.main = [...(ev.mainEvent.items || [])];
      (ev.subEvents || []).forEach(s => { sectionItems[s.id] = [...(s.items || [])]; });
    } else {
      sectionItems.main = [...(ev.items || [])];
    }
    const itemPrices = {};
    const daysOf = sectionDaysOf(ev);
    Object.entries(sectionItems).forEach(([sectionId, names]) => {
      names.forEach(name => {
        const key = `${sectionId}::${name}`;
        itemPrices[key] = stored[key] || stored[name] || newPrice(daysOf[sectionId]);
      });
    });
    return {
      sectionItems,
      itemPrices,
      bundles: ev.bundles || [],
      hidePrices: ev.hidePrices || false,
      finalAmounts: ev.finalAmounts || {},
      // GST on/off, GST rate and validity are saved with the quote, so
      // reopening it (or sharing it later) keeps what was chosen.
      quoteDetails: ev.quoteDetails || {},
      revisions: ev.quoteRevisions || [],   // earlier versions (Fit to budget / Restore)
    };
  };

  const [sectionItems, setSectionItems] = useState(() => deriveState(event).sectionItems);
  const [itemPrices, setItemPrices] = useState(() => deriveState(event).itemPrices);
  const [bundles, setBundles] = useState(() => deriveState(event).bundles);
  const [hidePrices, setHidePrices] = useState(() => deriveState(event).hidePrices);
  const [finalAmounts, setFinalAmounts] = useState(() => deriveState(event).finalAmounts);
  const [gstEnabled, setGstEnabled] = useState(() => deriveState(event).quoteDetails.gstEnabled ?? false);
  const [gstRate, setGstRate] = useState(() => deriveState(event).quoteDetails.gstRate ?? String(settings.defaultGstRate || 18));
  const [validityDays, setValidityDays] = useState(() => deriveState(event).quoteDetails.validityDays ?? 15);
  const [discountText, setDiscountText] = useState(() => deriveState(event).quoteDetails.discount ?? '');
  const [revisions, setRevisions] = useState(() => deriveState(event).revisions);
  const [revisedLabel, setRevisedLabel] = useState(() => !!deriveState(event).quoteDetails.revisedLabel);

  // Phones: which tab, and the open sheet / menu
  const isPhone = useIsPhone();
  const [tab, setTab] = useState('details');               // 'details' | 'preview'
  const [sheet, setSheet] = useState(null);                 // 'options' | 'fit' | 'revisions' | null
  const [itemMenu, setItemMenu] = useState(null);           // { sectionId, name, key, bundleId }
  const [groupMenu, setGroupMenu] = useState(null);         // a bundle
  const [moveMenu, setMoveMenu] = useState(null);           // item being moved to a group
  const [renaming, setRenaming] = useState(null);           // { kind: 'item'|'group', sectionId, name, bundleId, value }
  const [addOpen, setAddOpen] = useState(false);              // phone: the Add items sheet
  const [folded, setFolded] = useState(() => new Set());     // phone: events folded shut (this visit only)
  const [scrollTarget, setScrollTarget] = useState(null);     // phone: { key, tick } — the editor scrolls to it
  const [flash, setFlash] = useState(() => new Set());        // phone: item keys highlighted for a moment after adding
  const [undoInfo, setUndoInfo] = useState(null);           // { rev, message } after Fit to budget

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
  const [saveState, setSaveState] = useState('saved');   // 'saved' | 'unsaved' | 'saving' | 'error' (auto-save; shown as toasts)
  const lastSavedRef = useRef(null);                      // JSON of what's saved — null until the quote has loaded
  const autoSaveTimer = useRef(null);

  // Drag sensor: small activation distance so it doesn't fight with taps
  // on the qty/rate inputs or the remove button within the same row.
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Track whether initial data has loaded yet, since `event` (and its
  // items) can arrive asynchronously from Firestore after first render.
  const loadedRef = useRef(!!event);
  const justSyncedRef = useRef(false);

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
      if (derived.quoteDetails.gstEnabled !== undefined) setGstEnabled(derived.quoteDetails.gstEnabled);
      if (derived.quoteDetails.gstRate !== undefined) setGstRate(derived.quoteDetails.gstRate);
      if (derived.quoteDetails.validityDays !== undefined) setValidityDays(derived.quoteDetails.validityDays);
      if (derived.quoteDetails.discount !== undefined) setDiscountText(derived.quoteDetails.discount);
      setRevisions(derived.revisions);
      setRevisedLabel(!!derived.quoteDetails.revisedLabel);
      loadedRef.current = true;
      justSyncedRef.current = true;   // the auto-save baseline is taken once these values have rendered
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
        endDate: functionEnd(event.mainEvent),
        days: functionDays(event.mainEvent),
        location: event.mainEvent.location || '',
        items: sectionItems.main || [],
      }];
      (event.subEvents || []).forEach(s => {
        groups.push({
          id: s.id,
          name: s.name || 'Sub Event',
          date: s.date || '',
          endDate: functionEnd(s),
          days: functionDays(s),
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
      endDate: event.date || '',
      days: 1,
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

  // Discount (amount or %), then GST on what's left
  const discount = useMemo(() => parseDiscount(discountText, subtotal), [discountText, subtotal]);
  const afterDiscount = subtotal - discount.amount;
  const gstData = useMemo(() => calcGST(afterDiscount, gstEnabled ? Number(gstRate) : 0), [afterDiscount, gstEnabled, gstRate]);

  /** Hide-prices helper line per section: groups total + single items total (from the prices entered) */
  const sectionSplit = (group) => {
    const entries = buildLineEntries(group.id, group.items, bundles);
    const groups = entries.filter(e => e.type === 'bundle').reduce((t, e) => t + (Number(e.bundle.amount) || 0), 0);
    const items = entries.filter(e => e.type === 'item').reduce((t, e) => t + lineAmount(itemPrices[e.key] || { qty: 1, rate: 0 }), 0);
    return { groups, items, total: groups + items };
  };

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
  const anyTicked = Object.values(selectedForGroup).some(a => a?.size) || selectedBundles.size > 0 || selectedBundleMembers.size > 0;

  // ------------------------------------------------------------
  // SAVING — auto-save 1.5 s after the last change, plus the Save button
  // ------------------------------------------------------------
  /** Everything the quote saves onto the event */
  const buildUpdateData = () => {
    if (!event) return null;
    const data = {
      itemPrices, bundles, hidePrices, finalAmounts, totalAmount: subtotal,
      quoteDetails: { gstEnabled, gstRate: String(gstRate), validityDays: Number(validityDays) || 15, discount: String(discountText ?? '').trim(), revisedLabel: !!revisedLabel },
      quoteRevisions: revisions,
    };
    if (event.mainEvent) {
      data.mainEvent = { ...event.mainEvent, items: sectionItems.main || [] };
      data.subEvents = (event.subEvents || []).map(s => ({ ...s, items: sectionItems[s.id] || [] }));
    } else {
      data.items = sectionItems.main || [];
    }
    return data;
  };

  /**
   * What "saved" compares: only the quote's own fields (items per event,
   * prices, groups, terms, versions) with keys sorted. The rest of the event
   * comes back from Firestore after each save, sometimes with keys in another
   * order — comparing all of it made a just-saved quote look "not saved yet"
   * and save again.
   */
  const quoteSnap = (data) => (data ? stableJson({
    itemPrices: data.itemPrices, bundles: data.bundles, hidePrices: data.hidePrices, finalAmounts: data.finalAmounts,
    quoteDetails: data.quoteDetails, quoteRevisions: data.quoteRevisions,
    items: data.mainEvent ? [data.mainEvent.items, ...(data.subEvents || []).map(x => x.items)] : data.items,
  }) : null);

  /** Writes the quote. `manual` = Save button (toast "Quotation saved"); quiet auto-saves toast "✓ Saved" on laptops and only update the bar on phones. */
  const saveQuote = async (manual) => {
    clearTimeout(autoSaveTimer.current);
    const data = buildUpdateData();
    const snap = quoteSnap(data);
    setSaveState('saving');
    const result = await updateEvent(eventId, data);
    if (result.success) {
      lastSavedRef.current = snap;
      setSaveState(quoteSnap(latestDataRef.current) === snap ? 'saved' : 'unsaved');
      // Phones show quiet saves in the bottom bar only ("✓ Saved"), so a toast and the bar never disagree
      if (manual) showToast('Quotation saved'); else if (!isPhone) showToast('✓ Saved');
    } else {
      setSaveState('error');
      showToast(result.error || 'Couldn’t save the quotation — tap Save to try again', 'error');
    }
    return result.success;
  };

  // Latest data, so a save that finishes can tell whether more edits came in meanwhile
  const currentData = buildUpdateData();
  const currentSnap = quoteSnap(currentData);
  const latestDataRef = useRef(null);
  latestDataRef.current = currentData;

  // First load sets the baseline (opening a quote never saves by itself);
  // after that, any change schedules a quiet save.
  useEffect(() => {
    if (!loadedRef.current || currentSnap === null) return undefined;
    if (justSyncedRef.current) { justSyncedRef.current = false; return undefined; }   // values from the event are still being applied
    if (lastSavedRef.current === null) { lastSavedRef.current = currentSnap; return undefined; }
    if (currentSnap === lastSavedRef.current) { setSaveState('saved'); return undefined; }
    setSaveState('unsaved');
    clearTimeout(autoSaveTimer.current);
    if (isSuspended) return undefined;   // read-only: Save explains why instead
    autoSaveTimer.current = setTimeout(() => { saveQuote(false); }, 1500);
    return () => clearTimeout(autoSaveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnap]);

  // Phones: client · event · date under the title, ⋮ for quote options
  const headerSub = event ? [event.clientName, event.eventType, (event.mainEvent?.date || event.date) && formatDateReadable(event.mainEvent?.date || event.date)].filter(Boolean).join(' · ') : '';
  const saveClickRef = useRef(null);   // the title bar's Save icon calls the latest handleSave (set below)
  usePhoneHeader({
    sub: headerSub,
    right: <HeaderIconButton icon={Save} label={saveState === 'saving' ? 'Saving…' : 'Save quotation'} bordered onClick={() => saveClickRef.current?.()} data-testid="quote-save" />,
    below: <UnderlineTabs value={tab} onChange={(t) => { setTab(t); window.scrollTo(0, 0); }} testId="quote-tabs"
      options={[{ value: 'details', label: 'Details' }, { value: 'preview', label: 'Preview' }]} />,
  }, [headerSub, tab, saveState]);

  // The "Undo" bar after Fit to budget goes away by itself
  useEffect(() => {
    if (!undoInfo) return undefined;
    const t = setTimeout(() => setUndoInfo(null), 15000);
    return () => clearTimeout(t);
  }, [undoInfo]);

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
    setItemPrices(p => ({ ...p, [`${sectionId}::${name}`]: newPrice(sectionDaysOf(event)[sectionId]) }));
    setNewItemNames(n => ({ ...n, [sectionId]: '' }));
  };

  /** Adds a predefined item from a category to the given section's quotation */
  const handleAddFromCategory = (sectionId, itemName) => {
    if ((sectionItems[sectionId] || []).includes(itemName)) return;
    setSectionItems(s => ({ ...s, [sectionId]: [...(s[sectionId] || []), itemName] }));
    setItemPrices(p => ({ ...p, [`${sectionId}::${itemName}`]: newPrice(sectionDaysOf(event)[sectionId]) }));
  };

  /** Asks first (app pop-up), then removes the item from this quotation */
  const askRemoveItem = async (sectionId, name) => {
    const ok = await confirm({ title: 'Remove this item?', message: <><b className="text-bb-text">{name}</b> will be taken off this quotation.</>, confirmLabel: 'Remove', tone: 'danger' });
    if (ok) handleRemoveItem(sectionId, name);
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

  /** Phones: an item dragged to a new place inside its group (the group's order and the event's item order both follow) */
  const handleMemberDragEnd = (sectionId, bundleId) => ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const b = bundles.find(x => x.id === bundleId);
    if (!b) return;
    const from = b.itemKeys.indexOf(active.id), to = b.itemKeys.indexOf(over.id);
    if (from === -1 || to === -1) return;
    const keys = arrayMove(b.itemKeys, from, to);
    setBundles(bs => bs.map(x => (x.id === bundleId ? { ...x, itemKeys: keys } : x)));
    // The same names, in their new order, fill the places the group's items held in this event
    const order = keys.filter(k => k.startsWith(`${sectionId}::`)).map(k => k.slice(sectionId.length + 2));
    const inGroup = new Set(order);
    let n = 0;
    setSectionItems(si => ({ ...si, [sectionId]: (si[sectionId] || []).map(name => (inGroup.has(name) ? order[n++] : name)) }));
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

  /** Phone: ticking a group's heading ticks (or clears) all its items with it */
  const toggleSelectBundleAll = (bundleId) => {
    const b = bundles.find(x => x.id === bundleId);
    if (!b) return;
    const on = !selectedBundles.has(bundleId);
    setSelectedBundles(prev => { const n = new Set(prev); if (on) n.add(bundleId); else n.delete(bundleId); return n; });
    setSelectedBundleMembers(prev => { const n = new Set(prev); b.itemKeys.forEach(k => { if (on) n.add(k); else n.delete(k); }); return n; });
  };

  /** Phone: ticking an item inside a group; un-ticking one also clears the group's own tick */
  const toggleSelectMemberOfGroup = (bundleId, key) => {
    setSelectedBundleMembers(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    setSelectedBundles(prev => { if (!prev.has(bundleId)) return prev; const n = new Set(prev); n.delete(bundleId); return n; });
  };

  /** Opens the "Create Group" popup for whichever section currently has 2+ standalone items selected. */
  /** Sum of the selected items' prices (qty × rate × days) in a section */
  const selectedSum = (sectionId) => Array.from(selectedForGroup[sectionId] || [])
    .reduce((sum, n) => sum + lineAmount(itemPrices[`${sectionId}::${n}`] || { qty: 1, rate: 0 }), 0);

  /** Opens "Create Group" with the price already added up from the selected items (editable) */
  const openGroupModal = (sectionId) => {
    setGroupModalSection(sectionId);
    setGroupName('');
    const sum = selectedSum(sectionId);
    setGroupAmount(sum > 0 ? String(sum) : '');
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
      const added = selectedSum(sectionId);   // the new items' prices go onto the group price
      setBundles(bs => bs.map(b => b.id === mergeTargetBundle.id
        ? { ...b, itemKeys: [...b.itemKeys, ...keysToAdd], amount: (Number(b.amount) || 0) + added }
        : b));
      setSelectedForGroup(prev => ({ ...prev, [sectionId]: new Set() }));
      setSelectedBundles(new Set());
      setSelectedBundleMembers(new Set());
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
   * Updates one bundle member's qty/rate/days, then re-syncs the bundle's total
   * amount to the sum of all its members' qty × rate × days — this is what lets
   * filling in member prices "calculate and give the final group price"
   * automatically, without a separate recalculate step.
   */
  const updateBundleMemberPrice = (bundle, key, field, value) => {
    const nextPrices = { ...itemPrices, [key]: { ...itemPrices[key], [field]: value } };
    setItemPrices(nextPrices);
    const sum = bundle.itemKeys.reduce((s, k) => s + lineAmount(nextPrices[k] || { qty: 1, rate: 0 }), 0);
    setBundles(bs => bs.map(b => b.id === bundle.id ? { ...b, amount: sum } : b));
  };

  /**
   * "Set all items to N days": every item (and bundle member) of a section
   * gets the function's number of days; bundle totals follow.
   */
  const setSectionDays = (sectionId, days) => {
    const keys = (sectionItems[sectionId] || []).map(n => `${sectionId}::${n}`);
    const next = { ...itemPrices };
    keys.forEach(k => { next[k] = { ...(next[k] || newPrice(1)), days }; });
    setItemPrices(next);
    setBundles(bs => bs.map(b => (b.itemKeys.some(k => keys.includes(k))
      ? { ...b, amount: b.itemKeys.reduce((sum, k) => sum + lineAmount(next[k] || { qty: 1, rate: 0 }), 0) }
      : b)));
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — PHONE (item / group menus, ticked items)
  // ------------------------------------------------------------

  /** One item's qty / rate / days */
  const setItemPrice = (key, field, value) => setItemPrices(p => ({ ...p, [key]: { ...(p[key] || newPrice(1)), [field]: value } }));

  /** Clears every tick */
  const endSelect = () => {
    setSelectedForGroup({});
    setSelectedBundles(new Set());
    setSelectedBundleMembers(new Set());
  };

  /** Takes an item out of its group; the group price drops by the item's price. A group left with 1 item ends. */
  const removeFromGroup = (key) => {
    const p = itemPrices[key] || { qty: 1, rate: 0 };
    setBundles(bs => bs
      .map(b => (b.itemKeys.includes(key) ? { ...b, itemKeys: b.itemKeys.filter(k => k !== key), amount: Math.max(0, (Number(b.amount) || 0) - lineAmount(p)) } : b))
      .filter(b => b.itemKeys.length >= 2));
  };

  /** Moves an item into a group (from no group or another group); prices follow it */
  const moveToGroup = (key, bundleId) => {
    const add = lineAmount(itemPrices[key] || { qty: 1, rate: 0 });
    setBundles(bs => bs
      .map(b => {
        if (b.id === bundleId) return b.itemKeys.includes(key) ? b : { ...b, itemKeys: [...b.itemKeys, key], amount: (Number(b.amount) || 0) + add };
        if (b.itemKeys.includes(key)) return { ...b, itemKeys: b.itemKeys.filter(k => k !== key), amount: Math.max(0, (Number(b.amount) || 0) - add) };
        return b;
      })
      .filter(b => b.itemKeys.length >= 2));
    const target = bundles.find(b => b.id === bundleId);
    showToast(`Moved to "${target?.name || 'group'}"`);
  };

  /** A copy of an item right under it ("Chairs (copy)"), same price, not in a group */
  const duplicateItem = (sectionId, name) => {
    const names = sectionItems[sectionId] || [];
    let copy = `${name} (copy)`;
    for (let n = 2; names.includes(copy); n++) copy = `${name} (copy ${n})`;
    const at = names.indexOf(name);
    setSectionItems(s => ({ ...s, [sectionId]: [...names.slice(0, at + 1), copy, ...names.slice(at + 1)] }));
    setItemPrices(p => ({ ...p, [`${sectionId}::${copy}`]: { ...(p[`${sectionId}::${name}`] || newPrice(1)) } }));
  };

  /** Renames an item (its price and group come along) or a group. Returns an error text or null. */
  const renameThing = ({ kind, sectionId, name, bundleId }, rawValue) => {
    const value = rawValue.trim();
    if (!value) return 'Type a name';
    if (kind === 'group') {
      setBundles(bs => bs.map(b => (b.id === bundleId ? { ...b, name: value } : b)));
      return null;
    }
    if (value === name) return null;
    if ((sectionItems[sectionId] || []).includes(value)) return 'An item with this name is already in this event';
    const oldKey = `${sectionId}::${name}`, newKey = `${sectionId}::${value}`;
    setSectionItems(s => ({ ...s, [sectionId]: (s[sectionId] || []).map(n => (n === name ? value : n)) }));
    setItemPrices(p => { const next = { ...p, [newKey]: p[oldKey] || newPrice(1) }; delete next[oldKey]; return next; });
    setBundles(bs => bs.map(b => ({ ...b, itemKeys: b.itemKeys.map(k => (k === oldKey ? newKey : k)) })));
    return null;
  };

  /** Ungroups one group (its items stay, priced one by one) */
  const dissolveGroup = (bundleId) => setBundles(bs => bs.filter(b => b.id !== bundleId));

  /** Asks, then removes a group and every item in it */
  const askDeleteGroup = async (bundle) => {
    const ok = await confirm({ title: 'Delete this group and its items?', message: <><b className="text-bb-text">{bundle.name}</b> and its {bundle.itemKeys.length} items will be taken off this quotation.</>, confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    bundle.itemKeys.forEach(k => { const [sec, ...rest] = k.split('::'); handleRemoveItem(sec, rest.join('::')); });
    setBundles(bs => bs.filter(b => b.id !== bundle.id));
  };

  /** Select mode: everything ticked, as { sectionId, name } */
  const tickedItems = () => {
    const out = [];
    Object.entries(selectedForGroup).forEach(([sec, set]) => set.forEach(name => out.push({ sectionId: sec, name })));
    selectedBundleMembers.forEach(k => { const [sec, ...rest] = k.split('::'); out.push({ sectionId: sec, name: rest.join('::') }); });
    bundles.filter(b => selectedBundles.has(b.id)).forEach(b => b.itemKeys.forEach(k => { const [sec, ...rest] = k.split('::'); if (!out.some(o => o.sectionId === sec && o.name === rest.join('::'))) out.push({ sectionId: sec, name: rest.join('::') }); }));
    return out;
  };

  /** Select mode: what the ticked things cost (a ticked group counts its group price) */
  const tickedValue = () => {
    const price = (k) => lineAmount(itemPrices[k] || { qty: 1, rate: 0 });
    let t = 0;
    Object.entries(selectedForGroup).forEach(([sec, set]) => set.forEach(name => { t += price(`${sec}::${name}`); }));
    bundles.forEach(b => { if (selectedBundles.has(b.id)) t += Number(b.amount) || 0; });
    selectedBundleMembers.forEach(k => { if (!bundles.some(b => selectedBundles.has(b.id) && b.itemKeys.includes(k))) t += price(k); });
    return t;
  };

  /** Select mode: asks, then removes every ticked item */
  const askRemoveTicked = async () => {
    const list = tickedItems();
    if (!list.length) return;
    const ok = await confirm({ title: `Remove ${list.length} item${list.length > 1 ? 's' : ''}?`, message: list.map(i => i.name).join(', '), confirmLabel: 'Remove', tone: 'danger' });
    if (!ok) return;
    list.forEach(i => handleRemoveItem(i.sectionId, i.name));
    endSelect();
  };

  /** Phone "Add items" sheet: adds the names to that event, then scrolls to the first new one */
  const addItemsToEvent = (sectionId, names) => {
    const fresh = names.filter(n => !(sectionItems[sectionId] || []).includes(n));
    setAddOpen(false);
    if (!fresh.length) { showToast('Those items are already in this event', 'error'); return; }
    setSectionItems(s => ({ ...s, [sectionId]: [...(s[sectionId] || []), ...fresh] }));
    setItemPrices(p => ({ ...p, ...Object.fromEntries(fresh.map(n => [`${sectionId}::${n}`, newPrice(sectionDaysOf(event)[sectionId])])) }));
    const keys = fresh.map(n => `${sectionId}::${n}`);
    setFolded(f => { if (!f.has(sectionId)) return f; const n = new Set(f); n.delete(sectionId); return n; });
    setFlash(new Set(keys));
    setScrollTarget({ key: keys[0], tick: Date.now() });
    setTimeout(() => setFlash(new Set()), 3000);
    showToast(`${fresh.length === 1 ? '1 item' : `${fresh.length} items`} added to ${printGroups.find(g => g.id === sectionId)?.name || 'the event'}`);
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — FIT TO BUDGET & VERSIONS
  // ------------------------------------------------------------

  /** Today's prices, as a revision */
  const snapshot = (label) => makeRevision({ itemPrices, bundles, hidePrices, finalAmounts, sectionItems, quoteDetails: { gstEnabled, gstRate: String(gstRate), validityDays, discount: String(discountText ?? '') } }, afterDiscount, label);

  /** Puts a saved version's prices back */
  const applySnapshot = (d) => {
    if (d.sectionItems) setSectionItems(d.sectionItems);
    setItemPrices(d.itemPrices || {});
    setBundles(d.bundles || []);
    setHidePrices(!!d.hidePrices);
    setFinalAmounts(d.finalAmounts || {});
    const qd = d.quoteDetails || {};
    if (qd.gstEnabled !== undefined) setGstEnabled(qd.gstEnabled);
    if (qd.gstRate !== undefined) setGstRate(qd.gstRate);
    if (qd.validityDays !== undefined) setValidityDays(qd.validityDays);
    setDiscountText(qd.discount ?? '');
  };

  /** Fit to budget → new prices (or a discount); the old prices are kept as a revision */
  const handleFitApply = ({ mode, amounts, target, keepRevision }) => {
    if (isSuspended) { setSheet(null); askUnlock(); return; }
    const rev = snapshot('Before Fit to budget');
    if (keepRevision) setRevisions(r => addRevision(r, rev));
    if (mode === 'discount') {
      setDiscountText(String(Math.max(0, subtotal - target)));
    } else {
      const units = fitUnits({ groups: printGroups, itemPrices, bundles, hidePrices, finalAmounts });
      const next = applyFit({ itemPrices, bundles, finalAmounts }, units, amounts);
      setItemPrices(next.itemPrices);
      setBundles(next.bundles);
      setFinalAmounts(next.finalAmounts);
      setDiscountText('');
    }
    setSheet(null);
    setUndoInfo({ rev, kept: keepRevision, message: mode === 'discount' ? `Discount added — total ${formatRupees(target)}` : `Prices changed to fit ${formatRupees(target)}` });
  };

  /** Undo right after Fit to budget */
  const undoFit = () => {
    if (!undoInfo) return;
    applySnapshot(undoInfo.rev.data);
    if (undoInfo.kept) setRevisions(r => r.filter(x => x.id !== undoInfo.rev.id));
    setUndoInfo(null);
    showToast('Back to the old prices');
  };

  /** Restore an earlier version (today's prices are kept as a version first) */
  const restoreRevision = async (rev) => {
    if (isSuspended) { askUnlock(); return; }
    const ok = await confirm({ title: 'Restore this version?', message: <>The quote goes back to <b className="text-bb-text">{formatRupees(rev.total)}</b>. Today’s prices are kept as a version, so you can switch back.</>, confirmLabel: 'Restore' });
    if (!ok) return;
    setRevisions(r => addRevision(r.filter(x => x.id !== rev.id), snapshot('Before restore')));
    applySnapshot(rev.data);
    setSheet(null);
    showToast('Version restored');
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — SAVE
  // ------------------------------------------------------------

  /** Save button — saves straight away (nothing new to save → a friendly "already saved") */
  const handleSave = async () => {
    if (saving) return;
    if (saveState === 'saved' && currentSnap === lastSavedRef.current) {
      showToast('Already saved ✌️');
      return;
    }
    setSaving(true);
    try { await saveQuote(true); } finally { setSaving(false); }
  };
  saveClickRef.current = handleSave;


  // ------------------------------------------------------------
  // EVENT HANDLERS — PRINT / SHARE
  // ------------------------------------------------------------

  /** File name for Print-to-PDF and the in-app PDF, e.g. "Quotation - Anu & Kevin Wedding 21 Nov 2026" */
  const docTitle = () => {
    const dateStr = displayDate ? formatDateReadable(displayDate) : formatDateReadable(new Date().toISOString());
    return `Quotation - ${event.clientName || 'Client'} ${event.eventType || 'Event'} ${dateStr}`;
  };

  /** Laptop: the browser's print dialog (prints only the document) */
  const handlePrint = () => {
    document.title = docTitle();
    window.print();
    document.title = 'EventScope';
  };

  /** Generates a formatted WhatsApp message with quotation details */
  const generateWhatsAppMsg = () => {
    let msg = revisedLabel ? `*REVISED QUOTATION*\n` : `*QUOTATION*\n`;
    msg += `From: ${settings.companyName}\n`;
    msg += `To: ${event.clientName}\n`;
    msg += `Date: ${formatDateReadable(new Date().toISOString())}\n\n`;
    msg += `*Event:* ${event.eventType}\n`;
    const mainDate = event.mainEvent ? functionDateText(event.mainEvent) : formatDateReadable(event.date);
    if (mainDate) msg += `*Event Date:* ${mainDate}\n\n`;
    msg += `*Items:*\n`;
    let idx = 0;
    printGroups.forEach(group => {
      group.items.forEach(name => {
        idx++;
        const key = `${group.id}::${name}`;
        const p = itemPrices[key] || { qty: 1, rate: 0 };
        const days = itemDays(p) > 1 ? ` × ${itemDays(p)} days` : '';
        msg += `${idx}. ${name} - ${p.qty} × ₹${p.rate}${days} = ₹${lineAmount(p).toLocaleString('en-IN')}\n`;
      });
    });
    msg += `\n*Subtotal:* ${formatCurrency(subtotal)}`;
    if (discount.amount > 0) msg += `\n*Discount${discount.pct ? ` (${discount.pct}%)` : ''}:* − ${formatCurrency(discount.amount)}`;
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

  // Printed table: a Days column only when some item runs more than one day
  const showDays = usesDays(itemPrices);
  const COLS = showDays ? 6 : 5;

  /** Hide item prices; turning it on scrolls to the first Final amount box */
  const setHidePricesAndShow = (on) => {
    setHidePrices(on);
    if (!on) return;
    setSheet(null);
    setTab('details');
    setTimeout(() => {
      const box = document.querySelector('[data-testid="final-amount-box"]');
      if (!box) return;
      const top = box.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      box.querySelector('input')?.focus({ preventScroll: true });
    }, 120);
  };

  // Everything the editor and its tools row need (phone and laptop editors)
  const tickedCount = Object.values(selectedForGroup).reduce((n, set) => n + set.size, 0) + selectedBundleMembers.size;
  const editorQ = {
    printGroups, sectionTotals, itemPrices, bundles, hidePrices, finalAmounts, subtotal, discount, discountText, gstEnabled, gstRate, gstData, validityDays,
    selectedForGroup, selectedBundles, selectedBundleMembers, canGroup, canUngroup, dndSensors,
    setItemPrice, updateBundleMemberPrice, sectionSplit, setSectionDays,
    setBundleAmount: (id, amt) => setBundles(bs => bs.map(x => (x.id === id ? { ...x, amount: amt } : x))),
    setFinalAmount: (sec, v) => setFinalAmounts(f => ({ ...f, [sec]: v })),
    setDiscountText, setValidityDays, setGstEnabled, setGstRate, setHidePrices: setHidePricesAndShow,
    toggleSelectForGroup, toggleSelectBundle, toggleSelectBundleMember, toggleSelectBundleAll, toggleSelectMemberOfGroup,
    categories, addFromCategory: handleAddFromCategory,
    onGroup: handleGroupClick, onUngroup: handleUngroupSelected,
    onDragEnd: handleDragEnd, onMemberDragEnd: handleMemberDragEnd,
    openItemMenu: setItemMenu, openGroupMenu: setGroupMenu,
    openAddItem: () => setAddOpen(true),
    openCategories: setCategoryModalSection,
    onFitBudget: () => setSheet('fit'), onMore: () => setSheet('options'),
    folded, setFolded, scrollTarget, flash,
    onVersions: () => setSheet('revisions'), revisionsCount: revisions.length,
    onSave: handleSave, saveState,
    hasPhone: !!(event.clientWhatsapp || event.clientPhone), onWhatsApp: handleWhatsApp,
    onContract: () => navigate(`/contract/${event.id}`), onPrint: handlePrint,
    pdfNode: !isPhone ? <PdfButton docRef={pdfRef} fileName={`${docTitle()}.pdf`} variant="laptop" /> : null,
    // laptop editor: in-place add, bin, group ⋯ menu, Group (n)
    newItemNames, setNewItemName: (sec, v) => setNewItemNames(n => ({ ...n, [sec]: v })), addItem: handleAddItem,
    removeItem: askRemoveItem, tickedCount,
    renameGroup: (b) => setRenaming({ kind: 'group', bundleId: b.id, name: b.name, value: b.name }),
    ungroupGroup: dissolveGroup, deleteGroup: askDeleteGroup,
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  return (
    <div className="space-y-4 pb-8">
      {/* === LAPTOP: title row, pinned tools, the editor (hidden in print) === */}
      {!isPhone && <div data-no-print className="space-y-4">
        <PageHeader title="Quotation" onBack={() => navigate(-1)}
          sub={[event.clientName, event.eventType, displayDate && formatDateReadable(displayDate)].filter(Boolean).join(' · ')}
          actions={<HeaderText icon={Save} primary onClick={handleSave} disabled={saving} data-testid="hdr-save">{saving ? 'Saving…' : 'Save'}</HeaderText>} />
        <div className="sticky top-0 z-20 -mx-1 px-1 py-2.5 bg-bb-bg border-b border-bb-border" data-testid="quote-sticky">
          <QuoteLaptopTools q={editorQ} />
        </div>
        <QuoteLaptopEditor q={editorQ} />
        <SectionLabel className="pt-2">Preview</SectionLabel>
      </div>}

      {/* === PHONE: Details | Preview, the editor, and the total bar === */}
      {isPhone && (
        <div data-no-print className="space-y-5">
          {/* The tools row stays pinned under the title bar (the tabs are in the bar); the quote scrolls below */}
          {tab === 'details' && (
            <StickyBar className="!py-3 border-b border-bb-border/70" testId="quote-sticky">
              <QuoteTools q={editorQ} />
            </StickyBar>
          )}
          {tab === 'details' && (
            <QuotePhoneEditor q={editorQ} />
          )}
          {anyTicked ? (
            <ActionBar testId="select-bar" label={`${tickedItems().length} selected`} value={formatRupees(tickedValue())}>
              <button onClick={endSelect} className="min-h-[44px] px-2.5 rounded-xl text-gray-600 font-semibold cursor-pointer">Clear</button>
              <IconButton icon={Trash2} label="Remove ticked items" tone="red" onClick={askRemoveTicked} disabled={!tickedItems().length} data-testid="remove-ticked" />
              <IconButton icon={Ungroup} label="Ungroup ticked" tone="violet" onClick={handleUngroupSelected} disabled={!canUngroup} data-testid="ungroup-ticked" />
              <IconButton icon={Layers} label={canMergeIntoExisting ? 'Add to group' : 'Make a group'} tone="violet" onClick={handleGroupClick} disabled={!canGroup} data-testid="make-group" />
            </ActionBar>
          ) : (
            <ActionBar label={saveState === 'saved' ? '' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : 'Not saved yet'}
              status={saveState === 'saved' ? '✓ Saved' : null} value={formatRupees(gstData.total)} testId="total-bar">
              <PdfButton docRef={pdfRef} fileName={`${docTitle()}.pdf`} variant={tab === 'details' ? 'secondary' : 'primary'} />
              {tab === 'details' && (
                <button onClick={() => setAddOpen(true)} data-testid="add-items-open"
                  className="min-h-[48px] px-[18px] rounded-xl bg-bb-accent text-white font-bold text-[15px] inline-flex items-center gap-1.5 cursor-pointer">
                  <Plus size={18} />Add item
                </button>
              )}
            </ActionBar>
          )}
        </div>
      )}

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
            {selectedSum(groupModalSection) > 0 && (
              <p className="text-xs text-bb-muted -mt-2" data-testid="group-sum-hint">
                Added up from the selected items ({formatRupees(selectedSum(groupModalSection))}). Change it for a package price.
              </p>
            )}
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
      {/* phones: fitted to the screen (Preview tab); laptops: as before */}
      <DocFit hidden={isPhone && tab === 'details'}>
      <div ref={pdfRef} className="print-doc" style={{backgroundColor: 'white', color: '#1f2937', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', maxWidth: '800px', margin: '0 auto', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}>
        <table style={{width: '100%', borderCollapse: 'collapse', padding: '0', margin: '0'}}>
          <tbody>
            {/* Row 1: Title */}
            <tr>
              <td colSpan={COLS} style={{textAlign: 'center', padding: '24px 24px 12px'}}>
                <span style={{fontSize: '20px', fontWeight: '800', letterSpacing: '0.2em', textTransform: 'uppercase', color: brand}}>{revisedLabel ? 'REVISED QUOTATION' : 'QUOTATION'}</span>
                <div style={{height: '3px', width: '80px', margin: '8px auto 0', backgroundColor: brand, borderRadius: '2px'}} />
              </td>
            </tr>

            {/* Row 2: Company address left, Logo right */}
            <tr>
              <td colSpan={COLS - 2} style={{verticalAlign: 'top', padding: '12px 24px', fontSize: '11px', color: '#4b5563', lineHeight: '1.7'}}>
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
              <td colSpan={COLS} style={{padding: '0 24px'}}>
                <div style={{height: '1px', backgroundColor: '#e5e7eb'}} />
              </td>
            </tr>

            {/* Row 4: Two boxes with purple top border */}
            <tr>
              <td colSpan={COLS - 2} style={{verticalAlign: 'top', padding: '16px 24px 12px', width: '60%'}}>
                <div style={{borderTop: `3px solid ${brand}`, padding: '12px 0 0'}}>
                  <span style={{fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: brand}}>BILL TO/ CLIENT</span><br/>
                  <span style={{fontSize: '14px', fontWeight: '700', color: '#1f2937', lineHeight: '2'}}>{event.clientName}</span><br/>
                  {event.clientPhone && <span style={{fontSize: '11px', color: '#6b7280'}}>Phone: {event.clientPhone}</span>}
                  {event.clientAddress && <><br/><span style={{fontSize: '11px', color: '#6b7280'}}>{event.clientAddress}</span></>}
                </div>
              </td>
              <td colSpan="2" style={{verticalAlign: 'top', padding: '16px 24px 12px', width: '40%'}}>
                <div style={{borderTop: `3px solid ${brand}`, padding: '12px 0 0', fontSize: '11px', color: '#4b5563', lineHeight: '1.9'}}>
                  <span style={{fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: brand}}>EVENT DETAILS</span><br/>
                  {event.eventType && <>Event: {event.eventType}<br/></>}
                  {displayDate && <>Date: {event.mainEvent ? functionDateText(event.mainEvent) : formatDateReadable(displayDate)}<br/></>}
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
                    <td colSpan={COLS} style={{padding: '16px 24px 6px'}}>
                      <span style={{fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: brand}}>
                        {group.name}{group.date ? ` — ${functionDateText(group)}` : ''}{group.location ? `, ${group.location}` : ''}
                      </span>
                      <div style={{height: '2px', marginTop: '6px', backgroundColor: brand, opacity: 0.3, borderRadius: '1px'}} />
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
                      <th colSpan="1" style={{padding: '8px 12px 8px 12px', textAlign: 'right', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '90px', paddingRight: showDays ? '12px' : '24px'}}>Qty</th>
                      {showDays && <th style={{padding: '8px 12px', textAlign: 'center', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px', paddingRight: '24px'}}>Days</th>}
                    </tr>
                  ) : (
                    <tr style={{backgroundColor: '#f5f0fa'}}>
                      <th style={{padding: '8px 12px 8px 24px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px'}}>Sl.</th>
                      <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Particulars</th>
                      <th style={{padding: '8px 12px', textAlign: 'center', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '50px'}}>Qty</th>
                      <th style={{padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '90px'}}>Rate (₹)</th>
                      {showDays && <th style={{padding: '8px 12px', textAlign: 'center', fontWeight: '600', color: '#4b5563', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '54px'}}>Days</th>}
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
                            <td colSpan="1" style={{padding: '10px 12px 10px 12px', textAlign: 'right', color: '#4b5563', fontSize: '12px', paddingRight: showDays ? '12px' : '24px'}}>
                              <div style={{visibility: 'hidden', fontWeight: '600'}}>&nbsp;</div>
                              {b.itemKeys.map((k, i) => (
                                <div key={i} style={{marginTop: i === 0 ? 0 : '2px'}}>{(itemPrices[k] || { qty: 1 }).qty}</div>
                              ))}
                            </td>
                            {showDays && <DaysCell keys={b.itemKeys} prices={itemPrices} last />}
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
                          <td colSpan="1" style={{padding: '10px 12px 10px 12px', textAlign: 'right', color: '#4b5563', fontSize: '12px', paddingRight: showDays ? '12px' : '24px'}}>{p.qty}</td>
                          {showDays && <DaysCell keys={[key]} prices={itemPrices} single last />}
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
                            {showDays && <DaysCell keys={b.itemKeys} prices={itemPrices} />}
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
                          {showDays && <DaysCell keys={[key]} prices={itemPrices} single />}
                          <td style={{padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#1f2937', fontSize: '12px', paddingRight: '24px'}}>{formatCurrency(lineAmount(p))}</td>
                        </tr>
                      );
                    })
                  )}

                  {/* Section subtotal row — for hide-prices mode this IS the manually-entered final amount */}
                  <tr>
                    <td colSpan={COLS} style={{textAlign: 'right', padding: '10px 24px 16px'}}>
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
                <td colSpan={COLS} style={{textAlign: 'center', padding: '24px', color: '#6b7280', fontSize: '12px', fontStyle: 'italic'}}>
                  No items added to this quotation yet.
                </td>
              </tr>
            )}

            {/* Summary section */}
            {printGroups.some(g => g.items.length > 0) && (
              <>
                <tr><td colSpan={COLS} style={{padding: '4px 0'}} /></tr>

                <tr>
                  <td colSpan={COLS} style={{padding: '0 24px'}}>
                    <table style={{width: '100%', borderCollapse: 'collapse', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden'}}>
                      <tbody>
                        <tr style={{backgroundColor: '#f5f0fa'}}>
                          <td colSpan="2" style={{padding: '8px 16px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: brand}}>SUMMARY</td>
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
                        {discount.amount > 0 && (
                          <tr style={{borderTop: '1px solid #f3f4f6'}}>
                            <td style={{fontSize: '12px', color: '#059669', padding: '6px 16px'}}>Discount{discount.pct ? ` (${discount.pct}%)` : ''}</td>
                            <td style={{fontSize: '12px', color: '#059669', textAlign: 'right', padding: '6px 16px'}}>− {formatCurrency(discount.amount)}</td>
                          </tr>
                        )}
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
                        <tr style={{borderTop: `2px solid ${brand}`}}>
                          <td style={{fontSize: '16px', fontWeight: '700', color: '#1f2937', padding: '12px 16px'}}>GRAND TOTAL</td>
                          <td style={{fontSize: '16px', fontWeight: '700', color: brand, textAlign: 'right', padding: '12px 16px'}}>{formatCurrency(gstData.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </>
            )}

            {/* Terms & Conditions */}
            <tr>
              <td colSpan={COLS} style={{padding: '20px 24px 8px'}}>
                <span style={{fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: brand}}>TERMS & CONDITIONS</span>
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
              <td colSpan={COLS} style={{padding: '12px 24px'}}>
                <div style={{backgroundColor: '#f3f4f6', borderRadius: '4px', padding: '10px 16px', textAlign: 'center'}}>
                  <span style={{fontSize: '11px', color: '#6b7280', fontStyle: 'italic'}}>
                    This quotation is valid for <span style={{fontWeight: '700', color: '#1f2937'}}>{validityDays} days</span> from the date of issue.
                  </span>
                </div>
              </td>
            </tr>

            {/* Footer */}
            <tr>
              <td colSpan={COLS} style={{textAlign: 'center', padding: '16px 24px 24px', borderTop: '1px solid #e5e7eb'}}>
                <span style={{fontSize: '14px', fontWeight: '700', color: '#1f2937'}}>{settings.companyName}</span><br/>
                <span style={{fontSize: '11px', color: '#6b7280', marginTop: '4px', display: 'inline-block'}}>{settings.phone}</span>
                {showMark && <><br/><span style={{fontSize: '9.5px', color: '#9ca3af', marginTop: '8px', display: 'inline-block'}}>Made with EventScope</span></>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </DocFit>

      {/* === SHEETS: quote options · Fit to budget · versions · item / group menus === */}
      {sheet === 'options' && (
        <BottomSheet open onClose={() => setSheet(null)} title="More" testId="options-sheet">
          <MenuRow icon={Wand2} title="Fit to budget" sub="Bring the total to the client’s number" onClick={() => setSheet('fit')} testId="opt-fit" />
          {(event.clientWhatsapp || event.clientPhone) && <MenuRow icon={MessageSquare} title="Share on WhatsApp" sub="Message with the prices" onClick={() => { setSheet(null); handleWhatsApp(); }} testId="opt-whatsapp" />}
          <MenuRow icon={History} title="Versions" sub={revisions.length ? `${revisions.length} earlier version${revisions.length > 1 ? 's' : ''}` : 'Fit to budget keeps the old prices here'} onClick={() => setSheet('revisions')} testId="opt-versions" />
          {tab === 'details' && printGroups.length > 0 && (() => {
            const allFolded = printGroups.every(g => folded.has(g.id));
            return <MenuRow icon={allFolded ? ChevronsUpDown : ChevronsDownUp} title={allFolded ? 'Open all events' : 'Fold all events'}
              onClick={() => { setSheet(null); setFolded(allFolded ? new Set() : new Set(printGroups.map(g => g.id))); }} testId="opt-fold" />;
          })()}
          <MenuRow icon={FileSignature} title="Make contract" sub="Uses this quote" onClick={() => navigate(`/contract/${event.id}`)} testId="opt-contract" />
        </BottomSheet>
      )}
      {sheet === 'fit' && (
        <FitBudgetSheet units={fitUnits({ groups: printGroups, itemPrices, bundles, hidePrices, finalAmounts })}
          subtotal={subtotal} discountNow={discount.amount} gstOn={gstEnabled} onApply={handleFitApply} onClose={() => setSheet(null)} />
      )}
      {sheet === 'revisions' && (
        <QuoteRevisionsSheet revisions={revisions} currentTotal={afterDiscount} revisedLabel={revisedLabel} onToggleRevised={setRevisedLabel}
          onRestore={restoreRevision} onClose={() => setSheet(null)} locked={isSuspended}
          sections={printGroups.map(g => ({ id: g.id, name: g.name }))} current={{ itemPrices, bundles }} />
      )}
      {itemMenu && (() => {
        const inGroup = bundles.find(b => b.id === itemMenu.bundleId);
        const others = bundles.filter(b => b.id !== itemMenu.bundleId && b.itemKeys.some(k => k.startsWith(`${itemMenu.sectionId}::`)));
        const close = (fn) => () => { setItemMenu(null); fn(); };
        return (
          <BottomSheet open onClose={() => setItemMenu(null)} title={itemMenu.name} sub={inGroup ? `In the group “${inGroup.name}”` : 'Item'} testId="item-menu">
            {others.length > 0 && <MenuRow icon={FolderInput} title={inGroup ? 'Move to another group' : 'Add to a group'} onClick={close(() => setMoveMenu(itemMenu))} testId="item-move" />}
            {inGroup && <MenuRow icon={FolderOutput} title="Remove from group" sub="It stays on the quote with its own price" onClick={close(() => removeFromGroup(itemMenu.key))} testId="item-ungroup" />}
            <MenuRow icon={Copy} title="Duplicate" onClick={close(() => duplicateItem(itemMenu.sectionId, itemMenu.name))} testId="item-duplicate" />
            <MenuRow icon={Type} title="Edit item name" onClick={close(() => setRenaming({ kind: 'item', sectionId: itemMenu.sectionId, name: itemMenu.name, value: itemMenu.name }))} testId="item-rename" />
            <div className="mt-3 border-t-4 border-gray-100">
              <MenuRow icon={Trash2} title="Delete item" sub="Asks you first" tone="red" onClick={close(() => askRemoveItem(itemMenu.sectionId, itemMenu.name))} testId="item-delete" />
            </div>
          </BottomSheet>
        );
      })()}
      {moveMenu && (
        <BottomSheet open onClose={() => setMoveMenu(null)} title="Move to group" sub={moveMenu.name} testId="move-menu">
          {bundles.filter(b => b.id !== moveMenu.bundleId && b.itemKeys.some(k => k.startsWith(`${moveMenu.sectionId}::`))).map(b => (
            <MenuRow key={b.id} icon={Layers} title={b.name} sub={`${b.itemKeys.length} items`} onClick={() => { moveToGroup(moveMenu.key, b.id); setMoveMenu(null); }} />
          ))}
        </BottomSheet>
      )}
      {groupMenu && (
        <BottomSheet open onClose={() => setGroupMenu(null)} title={groupMenu.name} sub={`Group · ${groupMenu.itemKeys.length} items`} testId="group-menu">
          <MenuRow icon={Pencil} title="Rename group" onClick={() => { setRenaming({ kind: 'group', bundleId: groupMenu.id, name: groupMenu.name, value: groupMenu.name }); setGroupMenu(null); }} />
          <MenuRow icon={Ungroup} title="Ungroup" sub="Items stay, each with its own price" onClick={() => { dissolveGroup(groupMenu.id); setGroupMenu(null); }} testId="group-ungroup" />
          <div className="mt-3 border-t-4 border-gray-100">
            <MenuRow icon={Trash2} title="Delete group and its items" sub="Asks you first" tone="red" onClick={() => { const b = groupMenu; setGroupMenu(null); askDeleteGroup(b); }} />
          </div>
        </BottomSheet>
      )}
      {renaming && (
        <BottomSheet open onClose={() => setRenaming(null)} title={renaming.kind === 'group' ? 'Rename group' : 'Edit item name'} testId="rename-sheet"
          footer={<div className="flex gap-2.5">
            <button onClick={() => setRenaming(null)} className="flex-1 min-h-[46px] rounded-xl border border-gray-300 font-semibold cursor-pointer">Cancel</button>
            <button data-testid="rename-save" onClick={() => { const err = renameThing(renaming, renaming.value); if (err) showToast(err, 'error'); else setRenaming(null); }}
              className="flex-[1.6] min-h-[46px] rounded-xl bg-bb-accent text-white font-semibold cursor-pointer">Save name</button>
          </div>}>
          <input autoFocus value={renaming.value} onChange={e => setRenaming(r => ({ ...r, value: e.target.value }))} aria-label="Name" data-testid="rename-input"
            className="w-full min-h-[48px] rounded-xl border border-bb-border bg-bb-input px-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
        </BottomSheet>
      )}
      {addOpen && (
        <AddItemsSheet events={printGroups.map(g => ({ id: g.id, name: g.name, items: g.items }))} categories={categories}
          onSave={addItemsToEvent} onClose={() => setAddOpen(false)} />
      )}

      {/* "Undo" right after Fit to budget */}
      {undoInfo && (
        <div className="fixed z-[70] left-4 right-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] lg:left-auto lg:right-8 lg:bottom-6 lg:w-[420px] rounded-2xl bg-[#1f1530] text-white shadow-2xl px-4 py-3 flex items-center gap-3" data-testid="undo-bar" role="status">
          <span className="flex-1 text-[14.5px]">{undoInfo.message}</span>
          <button onClick={undoFit} className="min-h-[40px] px-2 inline-flex items-center gap-1.5 font-bold text-violet-300 cursor-pointer" data-testid="undo-fit"><Undo2 size={18} />Undo</button>
        </div>
      )}
    </div>
  );
}
