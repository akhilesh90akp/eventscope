/**
 * QuotePhoneEditor — the Details tab of the quotation on phones (below 1024px)
 *
 * Same quote, same data and same handlers as the laptop editor in
 * QuotationGenerator; only the layout differs:
 *   - QuoteTools: a tools row that scrolls sideways (Save · Group · Ungroup ·
 *     Hide prices · WhatsApp · Fit to budget · Versions); the page pins it
 *     under the title bar together with the Details | Preview tabs
 *   - a small row under it: "N items have no price" (tap → jumps to it) and
 *     Fold all / Open all
 *   - one section per event (main + sub events), each with its own pale tint:
 *     a header (date · name (Main) · items · total · chevron) that folds the
 *     event, then the add-item row — which stays pinned under the tools while
 *     you scroll through that event, and hands over to the next event's row
 *   - every item and group: a tick box with the ⋮⋮ drag handle under it
 *   - every item: name · amount · ⋮ menu, then labelled Qty · Rate ₹ · Days
 *     boxes (big amounts like ₹2,00,000 fit on line 1)
 *   - groups: a bordered, softly tinted block — heading (tick, name, ⋮), its
 *     items, and the Group price at the bottom. Ticking the heading ticks
 *     every item inside; loose items line up with the group's items
 *   - while a Qty / Rate / Days box is being typed in on a touch screen, a slim
 *     bar above the keyboard shows that line's total with Next and Done
 *   - hidden prices: a Final amount box at the end of each event
 *   - Price & terms card: discount, validity, Fit to budget, GST, hide prices
 * The page passes everything in one `q` object (state + handlers).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, MoreVertical, ListPlus, Layers, Ungroup, Check, Wand2, Save, EyeOff, Eye, MessageSquare, History,
  ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, TriangleAlert,
} from 'lucide-react';
import { IconButton, NumberBox, SwitchRow, SectionLabel } from './PhoneUI';
import { formatRupees, buildLineEntries, lineAmount, itemDays } from '../utils/helpers';

// ============================================================
// CONSTANTS
// ============================================================

/** A pale tint per event (header only): main event first, then each sub event; cycles after four */
const TINTS = [
  { bg: 'bg-[#f2f6fd]', line: 'border-[#dbe5f7]', fg: 'text-[#3b63b8]' },   // blue
  { bg: 'bg-[#eff8f6]', line: 'border-[#d3ebe6]', fg: 'text-[#2f7f77]' },   // teal
  { bg: 'bg-[#fcf6ea]', line: 'border-[#f0e0bd]', fg: 'text-[#a0661f]' },   // amber
  { bg: 'bg-[#fcf1f5]', line: 'border-[#f0d3de]', fg: 'text-[#a8416b]' },   // rose
];

const toDate = (s) => (s ? new Date(`${s}T00:00:00`) : null);

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** A draggable line (item or group); `children(handleProps)` draws it */
function Sortable({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform), transition,
    zIndex: isDragging ? 20 : undefined, position: 'relative',
  };
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'rounded-xl bg-white shadow-[0_14px_28px_-10px_rgba(40,10,70,0.45)] ring-1 ring-violet-200' : ''}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

/** Start of a line: tick box on top (group / remove), ⋮⋮ drag handle under it */
function Lead({ checked, onCheck, handle, label }) {
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0 w-7">
      <button onClick={onCheck} role="checkbox" aria-checked={checked} aria-label={`Select ${label}`}
        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center cursor-pointer ${checked ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300'}`}>
        {checked && <Check size={15} strokeWidth={3} />}
      </button>
      {(
        <button {...handle} aria-label={`Drag ${label}`} title="Hold and drag to move"
          className="w-7 h-8 flex items-center justify-center text-gray-400 touch-none cursor-grab active:cursor-grabbing">
          <GripVertical size={18} />
        </button>
      )}
    </div>
  );
}

/** One item: name · amount · ⋮, then Qty · Rate ₹ · Days */
function ItemRow({ q, sectionId, name, keyId, bundle, handle, last }) {
  const p = q.itemPrices[keyId] || { qty: 1, rate: 0, days: 1 };
  const days = itemDays(p);
  const inBundle = !!bundle;
  const checked = inBundle ? q.selectedBundleMembers.has(keyId) : (q.selectedForGroup[sectionId] || new Set()).has(name);
  const set = (field, value) => (inBundle ? q.updateBundleMemberPrice(bundle, keyId, field, value) : q.setItemPrice(keyId, field, value));
  const unpriced = !inBundle && !q.hidePrices && !(Number(p.rate) > 0);
  return (
    <div className={`flex items-start gap-2.5 py-3.5 ${last ? '' : 'border-b border-bb-border'} ${checked ? 'bg-violet-50 -mx-2 px-2 rounded-xl border-transparent' : ''}`} data-testid="quote-item" data-item={name}>
      <Lead checked={checked} handle={handle} label={name}
        onCheck={() => (inBundle ? q.toggleSelectMemberOfGroup(bundle.id, keyId) : q.toggleSelectForGroup(sectionId, name))} />
      <div className="flex-1 min-w-0">
      <div className="flex items-start gap-2.5">
        <p className="flex-1 min-w-0 text-[15.5px] font-bold leading-snug break-words pt-0.5">{name}</p>
        {!q.hidePrices && <b className={`text-[15.5px] whitespace-nowrap tabular-nums pt-0.5 ${inBundle ? 'text-bb-muted font-semibold' : ''}`} data-testid="line-amount">{formatRupees(lineAmount(p))}</b>}
        <IconButton icon={MoreVertical} label={`Options for ${name}`} tone="quiet" size={36} iconSize={18} className="-my-1 -mr-2"
          onClick={() => q.openItemMenu({ sectionId, name, key: keyId, bundleId: bundle?.id || null })} />
      </div>
      <div className={`grid gap-2 mt-2.5 ${q.hidePrices ? 'grid-cols-[72px_64px]' : 'grid-cols-[72px_1fr_64px]'}`}>
        <NumberBox label="Qty" value={p.qty === '' ? '' : (p.qty || 1)} min="1" aria-label={`${name} quantity`} data-qf="1" data-key={keyId}
          onChange={e => set('qty', e.target.value === '' ? '' : Number(e.target.value))} />
        {!q.hidePrices && (
          <NumberBox label="Rate ₹" value={p.rate || ''} placeholder="Rate" min="0" aria-label={`${name} rate`} data-qf="1" data-key={keyId} data-noprice={unpriced ? '1' : undefined}
            onChange={e => set('rate', Number(e.target.value) || 0)} />
        )}
        <NumberBox label="Days" value={p.days === '' ? '' : days} min="1" highlight={days > 1} aria-label={`${name} days`} data-qf="1" data-key={keyId}
          onChange={e => set('days', e.target.value === '' ? '' : Math.max(1, Math.round(Number(e.target.value)) || 1))} />
      </div>
      </div>
    </div>
  );
}

/**
 * A group, top to bottom: a soft violet heading (tick + ⋮⋮ drag handle, the
 * "GROUP · 3 ITEMS" label, its name, ⋮), its items — each with its own tick
 * and ⋮⋮ — and the Group price at the bottom. Ticking the heading ticks all
 * the items inside.
 */
function GroupBlock({ q, sectionId, bundle, handle }) {
  const checked = q.selectedBundles.has(bundle.id);
  const members = bundle.itemKeys.filter(k => k.startsWith(`${sectionId}::`));
  return (
    <div className={`my-3 rounded-2xl border-[1.5px] overflow-hidden bg-white ${checked ? 'border-bb-accent' : 'border-violet-200'}`} data-testid="quote-group" data-group={bundle.name}>
      {/* Heading — tinted, with a GROUP label, so it never reads as an item */}
      <div className={`flex items-start gap-2.5 pl-2.5 pr-2 pt-3 pb-3 ${checked ? 'bg-violet-100' : 'bg-violet-50'}`} data-testid="group-header">
        <Lead checked={checked} handle={handle} label={bundle.name} onCheck={() => q.toggleSelectBundleAll(bundle.id)} />
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-bb-accent-hover">
            <Layers size={14} />Group · {members.length} items
          </p>
          <p className="text-[16.5px] font-bold text-bb-text break-words leading-snug mt-0.5">{bundle.name}</p>
        </div>
        <IconButton icon={MoreVertical} label={`Options for group ${bundle.name}`} tone="quiet" size={36} iconSize={18} className="-mt-1"
          onClick={() => q.openGroupMenu(bundle)} />
      </div>
      {/* Items in the group — each reorders with its own ⋮⋮ */}
      <div className="px-2">
      <DndContext sensors={q.dndSensors} collisionDetection={closestCenter} onDragEnd={q.onMemberDragEnd(sectionId, bundle.id)}>
        <SortableContext items={members} strategy={verticalListSortingStrategy}>
          {members.map((k, i) => (
            <Sortable key={k} id={k}>
              {(h) => <ItemRow q={q} sectionId={sectionId} name={k.slice(sectionId.length + 2)} keyId={k} bundle={bundle} handle={h} last={i === members.length - 1} />}
            </Sortable>
          ))}
        </SortableContext>
      </DndContext>
      </div>
      {/* Group price — at the bottom */}
      {!q.hidePrices && (
        <label className="flex items-center justify-between gap-3 px-3 py-2.5 bg-violet-50/60 border-t border-violet-100">
          <span className="text-[13.5px] font-semibold text-gray-700 shrink-0">Group price ₹</span>
          <input type="number" inputMode="decimal" min="0" value={bundle.amount || ''} placeholder="0" aria-label={`${bundle.name} group price`} data-testid="group-price"
            data-noprice={Number(bundle.amount) > 0 ? undefined : '1'}
            onChange={e => q.setBundleAmount(bundle.id, Number(e.target.value) || 0)}
            className="w-[150px] min-h-[44px] rounded-xl border border-violet-200 bg-white px-3 text-[16px] font-bold tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
        </label>
      )}
    </div>
  );
}

/**
 * The add-item row of one event. Pinned just under the tools row while that
 * event is on screen (sticky inside its section, so the next event's row takes
 * over when you scroll into it). Typing shows matching services as chips.
 */
function AddRow({ q, group }) {
  const text = (q.newItemNames?.[group.id] || '');
  const trimmed = text.trim();
  const dup = !!trimmed && group.items.includes(trimmed);
  const lower = trimmed.toLowerCase();
  const chips = [];
  if (lower.length >= 2) {
    const seen = new Set();
    (q.categories || []).forEach(cat => (cat.items || []).forEach(item => {
      if (chips.length >= 8 || seen.has(item) || group.items.includes(item) || !item.toLowerCase().includes(lower)) return;
      seen.add(item); chips.push(item);
    }));
  }
  // After adding, scroll to the new line and put the cursor in its Rate box
  const justAdded = useRef(null);
  useEffect(() => {
    const name = justAdded.current;
    if (!name || !group.items.includes(name)) return;
    justAdded.current = null;
    const sec = document.querySelector(`[data-section="${group.id}"]`);
    const row = Array.from(sec?.querySelectorAll('[data-item]') || []).find(el => el.dataset.item === name);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.querySelector('input[data-qf][aria-label$="rate"]')?.focus({ preventScroll: true });
  }, [group.items, group.id]);
  const add = () => { if (trimmed && !dup) { justAdded.current = trimmed; q.addItem(group.id); } };
  return (
    <div className="sticky z-20 -mx-3 px-3 py-2.5 bg-white top-[calc(var(--phone-head,4rem)+var(--qs,0px))]" data-testid="add-row">
      <div className="flex gap-2">
        <input value={text} onChange={e => q.setNewItemName(group.id, e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={`Add an item to ${group.name}…`} aria-label={`Add an item to ${group.name}`} enterKeyHint="done" data-testid="add-input"
          className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-bb-border bg-bb-input px-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
        <button onClick={add} disabled={!trimmed || dup} data-testid="add-item"
          className="min-h-[44px] px-4 rounded-xl bg-bb-accent text-white font-semibold cursor-pointer disabled:opacity-40">Add</button>
        <IconButton icon={ListPlus} label="Add from services" tone="violet" onClick={() => q.openCategories(group.id)} />
      </div>
      {dup && <p className="text-[12.5px] text-amber-800 mt-1.5">Already in this event</p>}
      {chips.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pt-2 -mx-3 px-3" data-testid="add-suggestions">
          {chips.map(item => (
            <button key={item} onClick={() => { justAdded.current = item; q.addFromCategory(group.id, item); q.setNewItemName(group.id, ''); }}
              className="shrink-0 min-h-[36px] px-3.5 rounded-full border border-gray-300 bg-white text-[14px] font-semibold cursor-pointer whitespace-nowrap">{item}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Touch screens: while a Qty / Rate / Days box is focused, a slim bar above the keyboard with that line's total, Next and Done */
function KeyboardBar({ q, rootRef }) {
  const [key, setKey] = useState(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return undefined;
    const onIn = (e) => {
      const t = e.target;
      if (!t.matches?.('input[data-qf]')) return;
      setKey(t.dataset.key);
      setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);   // after the keyboard has opened
    };
    const onOut = () => setTimeout(() => { if (!document.activeElement?.matches?.('input[data-qf]')) setKey(null); }, 80);
    root.addEventListener('focusin', onIn);
    root.addEventListener('focusout', onOut);
    return () => { root.removeEventListener('focusin', onIn); root.removeEventListener('focusout', onOut); };
  }, [rootRef]);
  if (!key) return null;
  const p = q.itemPrices[key] || { qty: 1, rate: 0, days: 1 };
  const name = key.split('::').slice(1).join('::');
  const days = itemDays(p);
  const next = () => {
    const all = Array.from(document.querySelectorAll('[data-quote-phone] input[data-qf]'));
    const i = all.indexOf(document.activeElement);
    if (i >= 0 && all[i + 1]) all[i + 1].focus(); else document.activeElement?.blur();
  };
  return createPortal(
    <div className="lg:hidden fixed left-0 right-0 bottom-0 z-[60] bg-white border-t border-bb-border shadow-[0_-8px_20px_-14px_rgba(0,0,0,0.4)] px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-center gap-2.5" data-testid="keyboard-bar">
      <div className="flex-1 min-w-0 leading-snug">
        <p className="text-[13.5px] font-bold truncate">{name}</p>
        <p className="text-[12.5px] text-gray-600 truncate">{Number(p.qty) || 1} × {formatRupees(Number(p.rate) || 0)}{days > 1 ? ` × ${days} days` : ''} = <b className="text-bb-text">{formatRupees(lineAmount(p))}</b></p>
      </div>
      <button onMouseDown={e => e.preventDefault()} onClick={next} data-testid="kb-next"
        className="min-h-[40px] px-3.5 rounded-xl border border-gray-300 bg-white font-semibold text-[14px] cursor-pointer">Next ›</button>
      <button onMouseDown={e => e.preventDefault()} onClick={() => document.activeElement?.blur()} data-testid="kb-done"
        className="min-h-[40px] px-4 rounded-xl bg-bb-accent text-white font-semibold text-[14px] cursor-pointer">Done</button>
    </div>,
    document.body,
  );
}

// ============================================================
// QuoteTools — the sideways tools row (pinned with the tabs by the page)
// ============================================================

/** Save · Group · Ungroup · Hide prices · WhatsApp · Fit to budget · Versions; Group / Ungroup light up once items are ticked */
export function QuoteTools({ q }) {
  return (
    <div className="-mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar pb-0.5" data-testid="quote-tools">
      {[
        { id: 'save', icon: Save, label: q.saveState === 'saved' ? 'Saved' : q.saveState === 'saving' ? 'Saving…' : 'Save', onClick: q.onSave, tone: q.saveState === 'saved' ? 'done' : 'main' },
        { id: 'group', icon: Layers, label: 'Group', onClick: q.onGroup, disabled: !q.canGroup },
        { id: 'ungroup', icon: Ungroup, label: 'Ungroup', onClick: q.onUngroup, disabled: !q.canUngroup },
        { id: 'hide', icon: q.hidePrices ? Eye : EyeOff, label: q.hidePrices ? 'Show prices' : 'Hide prices', onClick: () => q.setHidePrices(!q.hidePrices), on: q.hidePrices },
        q.hasPhone && { id: 'whatsapp', icon: MessageSquare, label: 'WhatsApp', onClick: q.onWhatsApp, tone: 'green' },
        { id: 'fit', icon: Wand2, label: 'Fit to budget', onClick: q.onFitBudget },
        { id: 'versions', icon: History, label: q.revisionsCount ? `Versions (${q.revisionsCount})` : 'Versions', onClick: q.onVersions },
      ].filter(Boolean).map(t => (
        <button key={t.id} onClick={t.onClick} disabled={t.disabled} data-testid={`tool-${t.id}`} aria-pressed={t.on}
          className={`shrink-0 min-h-[42px] px-3.5 rounded-xl border font-semibold text-[14px] inline-flex items-center gap-2 cursor-pointer whitespace-nowrap
            disabled:text-gray-400 disabled:border-gray-200 disabled:bg-gray-50 disabled:cursor-default
            ${t.tone === 'main' ? 'bg-white border-bb-accent text-bb-accent-hover' : t.tone === 'done' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : t.tone === 'green' ? 'bg-white border-emerald-200 text-emerald-700' : t.on ? 'bg-violet-100 border-violet-300 text-bb-accent-hover' : 'bg-white border-gray-300 text-bb-text'}`}>
          <t.icon size={17} />{t.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// QuotePhoneEditor — MAIN COMPONENT
// ============================================================

export default function QuotePhoneEditor({ q }) {
  const sections = q.printGroups;
  const many = sections.length > 1;
  const rootRef = useRef(null);
  const [folded, setFolded] = useState(() => new Set());   // events folded shut (this visit only)

  // The add-item row pins under the page's tabs + tools row: tell CSS how tall that is
  useLayoutEffect(() => {
    const root = rootRef.current;
    const bar = document.querySelector('[data-testid="quote-sticky"]');
    if (!root || !bar) return undefined;
    const set = () => root.style.setProperty('--qs', `${bar.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const toggleFold = (id) => setFolded(f => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allFolded = sections.length > 0 && sections.every(g => folded.has(g.id));

  // Items with no price: loose items with no rate, groups with no group price
  const missingIn = (g) => {
    if (q.hidePrices) return 0;
    return buildLineEntries(g.id, g.items, q.bundles).filter(en => (en.type === 'bundle'
      ? !(Number(en.bundle.amount) > 0)
      : !(Number((q.itemPrices[en.key] || {}).rate) > 0))).length;
  };
  const missingCount = sections.reduce((n, g) => n + missingIn(g), 0);
  const jumpToUnpriced = () => {
    setFolded(f => { const n = new Set(f); sections.forEach(g => { if (missingIn(g) > 0) n.delete(g.id); }); return n; });
    setTimeout(() => {
      const el = rootRef.current?.querySelector('[data-noprice]');
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus({ preventScroll: true });
    }, 80);
  };

  return (
    <div ref={rootRef} className="space-y-5" data-testid="quote-phone" data-quote-phone>
      <p className="text-[12.5px] text-gray-600">Tick items to group or remove them · hold ⋮⋮ to move. Groups stay inside one event.</p>

      {(missingCount > 0 || many) && (
        <div className="flex items-center justify-between gap-3 -mt-2">
          {missingCount > 0
            ? <button onClick={jumpToUnpriced} data-testid="no-price-chip"
              className="inline-flex items-center gap-2 min-h-[34px] px-3 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[13px] font-bold cursor-pointer">
              <TriangleAlert size={15} />{missingCount === 1 ? '1 item has no price' : `${missingCount} items have no price`}
            </button>
            : <span />}
          {many && (
            <button onClick={() => setFolded(allFolded ? new Set() : new Set(sections.map(g => g.id)))} data-testid="fold-all"
              className="inline-flex items-center gap-1.5 min-h-[34px] text-[13.5px] font-bold text-bb-accent-hover cursor-pointer">
              {allFolded ? <ChevronsUpDown size={16} /> : <ChevronsDownUp size={16} />}{allFolded ? 'Open all' : 'Fold all'}
            </button>
          )}
        </div>
      )}

      {/* One section per event */}
      {sections.map((group, gi) => {
        const tint = TINTS[gi % TINTS.length];
        const open = !folded.has(group.id);
        const entries = buildLineEntries(group.id, group.items, q.bundles);
        const ids = entries.map(en => (en.type === 'bundle' ? `bundle:${en.bundle.id}` : en.key));
        const total = q.sectionTotals[group.id] || 0;
        const split = q.hidePrices ? q.sectionSplit(group) : null;
        const mismatchDays = group.items.some(n => itemDays(q.itemPrices[`${group.id}::${n}`]) !== group.days);
        const d = toDate(group.date);
        return (
          <section key={group.id} className={`rounded-2xl border bg-white ${tint.line}`} data-testid="quote-section" data-section={group.id}>
            {/* Event header — pale tint; taps to fold: date · name (Main) · items · total · chevron */}
            <button onClick={() => toggleFold(group.id)} aria-expanded={open} data-testid="section-toggle"
              className={`w-full flex items-center gap-3 px-3 py-3 text-left cursor-pointer ${tint.bg} ${open ? 'rounded-t-2xl' : 'rounded-2xl'}`}>
              <div className="w-[46px] shrink-0 text-center rounded-[10px] py-1 bg-white" aria-hidden="true">
                <div className={`text-[11px] font-extrabold ${tint.fg}`}>{d ? d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase() : '—'}</div>
                <div className="text-[18px] leading-tight font-extrabold text-bb-text">{d ? d.getDate() : '?'}</div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15.5px] font-bold truncate">
                  {group.name}{many && group.id === 'main' && <span className="ml-1.5 align-middle text-[11px] font-bold px-1.5 py-px rounded-full bg-white text-gray-600">Main</span>}
                </p>
                <p className="text-[13px] text-gray-600 truncate">{group.items.length} item{group.items.length === 1 ? '' : 's'}{group.days > 1 ? ` · ${group.days} days` : ''}{group.location ? ` · ${group.location}` : ''}</p>
              </div>
              <b className="text-[16px] tabular-nums" data-testid="section-total">{formatRupees(total)}</b>
              {open ? <ChevronUp size={20} className="text-bb-muted shrink-0" /> : <ChevronDown size={20} className="text-bb-muted shrink-0" />}
            </button>

            {open && (
              <div className="px-3 pb-3">
                <AddRow q={q} group={group} />
                {entries.length === 0 && <p className="text-[14px] text-gray-600 text-center py-5">No items yet</p>}
                <DndContext sensors={q.dndSensors} collisionDetection={closestCenter} onDragEnd={q.onDragEnd(group.id, entries)}>
                  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    {entries.map((en, i) => (
                      <Sortable key={ids[i]} id={ids[i]}>
                        {(handle) => (en.type === 'bundle'
                          ? <GroupBlock q={q} sectionId={group.id} bundle={en.bundle} handle={handle} />
                          : <div className="mx-[9.5px]"><ItemRow q={q} sectionId={group.id} name={en.name} keyId={en.key} handle={handle} last={i === entries.length - 1} /></div>)}
                      </Sortable>
                    ))}
                  </SortableContext>
                </DndContext>

                {mismatchDays && group.items.length > 0 && (
                  <button onClick={() => q.setSectionDays(group.id, group.days)} className="mt-2 text-[13.5px] font-semibold text-bb-accent-hover min-h-[40px] cursor-pointer">
                    Set all items to {group.days} {group.days === 1 ? 'day' : 'days'}
                  </button>
                )}

                {/* Hidden prices: what the client is charged for this event */}
                {q.hidePrices && (
                  <div className="mt-3 rounded-xl bg-orange-50 border border-orange-200 p-3.5" data-testid="final-amount-box">
                    <div className="flex items-center gap-3">
                      <label htmlFor={`final-m-${group.id}`} className="flex-1 min-w-0">
                        <span className="block font-bold text-[14.5px]">Final amount · {group.name}</span>
                        <span className="block text-[13px] text-gray-600">Items add up to {formatRupees(split.total)}</span>
                      </label>
                      <input id={`final-m-${group.id}`} type="number" inputMode="decimal" min="0" value={q.finalAmounts[group.id] ?? ''} placeholder="Amount"
                        onChange={e => q.setFinalAmount(group.id, Number(e.target.value) || 0)}
                        className="w-[132px] min-h-[48px] rounded-xl border-2 border-orange-400 bg-white px-3 text-right text-[17px] font-extrabold tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* Price & terms */}
      <SectionLabel>Price &amp; terms</SectionLabel>
      <div className="bg-white border border-bb-border rounded-2xl px-[18px] py-3" data-testid="price-terms">
        <div className="flex justify-between py-2 text-[15px]"><span>Subtotal</span><b className="tabular-nums">{formatRupees(q.subtotal)}</b></div>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <label className="block">
            <span className="block text-[13.5px] font-semibold mb-1.5">Discount</span>
            <input id="quote-discount-m" value={q.discountText} onChange={e => q.setDiscountText(e.target.value)} placeholder="5000 or 10%"
              className="w-full min-h-[46px] rounded-xl border border-bb-border bg-bb-input px-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
            <span className="block text-[12px] text-gray-600 mt-1">{q.discount.amount > 0 ? <b className="text-emerald-700">− {formatRupees(q.discount.amount)}</b> : 'Amount (5000) or % (10%)'}</span>
          </label>
          <label className="block">
            <span className="block text-[13.5px] font-semibold mb-1.5">Valid for (days)</span>
            <input type="number" inputMode="numeric" value={q.validityDays} onChange={e => q.setValidityDays(Number(e.target.value))}
              className="w-full min-h-[46px] rounded-xl border border-bb-border bg-bb-input px-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
          </label>
        </div>
        <button onClick={q.onFitBudget} data-testid="fit-open"
          className="w-full mt-4 min-h-[48px] rounded-xl bg-violet-50 border border-violet-200 text-bb-accent-hover font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
          <Wand2 size={18} />Client has a budget? Fit to budget
        </button>
        <div className="mt-3 border-t border-bb-border">
          <SwitchRow title="Add GST" checked={q.gstEnabled} onChange={q.setGstEnabled} testId="gst-switch" />
          {q.gstEnabled && (
            <div className="flex gap-2 pb-3" role="radiogroup" aria-label="GST rate">
              {['5', '12', '18', '28'].map(r => (
                <button key={r} role="radio" aria-checked={String(q.gstRate) === r} onClick={() => q.setGstRate(r)}
                  className={`min-h-[38px] px-3.5 rounded-full border text-[14px] font-semibold cursor-pointer ${String(q.gstRate) === r ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300'}`}>{r}%</button>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-bb-border">
          <SwitchRow title="Hide item prices" sub="Client sees one final amount per event" checked={q.hidePrices} onChange={q.setHidePrices} testId="hide-switch" />
        </div>
        <div className="border-t border-bb-border pt-2 space-y-1 text-[15px]">
          {q.discount.amount > 0 && <div className="flex justify-between py-1"><span>Discount{q.discount.pct ? ` (${q.discount.pct}%)` : ''}</span><b className="tabular-nums text-emerald-700">− {formatRupees(q.discount.amount)}</b></div>}
          {q.gstEnabled && <div className="flex justify-between py-1"><span>GST ({q.gstRate}%)</span><b className="tabular-nums">{formatRupees(q.gstData.tax)}</b></div>}
          <div className="flex justify-between py-1.5 font-extrabold text-[16px]"><span>Total</span><span className="tabular-nums" data-testid="phone-total">{formatRupees(q.gstData.total)}</span></div>
        </div>
      </div>

      <KeyboardBar q={q} rootRef={rootRef} />
    </div>
  );
}
