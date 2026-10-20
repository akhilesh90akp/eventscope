/**
 * QuoteLaptopEditor — the quotation editor on laptops (1024px and up)
 *
 * Same quote, data and handlers as QuotePhoneEditor (the page passes one `q`
 * object); only the layout differs:
 *   - QuoteLaptopTools: Group (n) · Ungroup · Hide prices · Fit to budget ·
 *     Versions — the page pins it under the title row
 *   - one card per event: a compact tinted band (date block, name, date ·
 *     venue · items, Event total), column headings, then the items as a list
 *     (⋮⋮ · tick · name · Qty · Rate · Days · Amount · bin)
 *   - groups read like the list: "<name> group" header (tick, ⋮⋮, ⋯ menu),
 *     the same white number boxes, and at the end "Items add up to ₹x" with
 *     the Total group price box
 *   - a right-aligned Subtotal line (or, with hidden prices, the Final amount
 *     box), then "Add an item" in place
 *   - Price & terms card: Discount, Valid for, GST switch + rate, totals
 * The PDF preview stays on the page, unchanged.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Plus, ListPlus, Layers, Ungroup, EyeOff, Eye, Wand2, History, Pencil } from 'lucide-react';
import { IconButton, SectionLabel } from './PhoneUI';
import { MorePopover, PopItem, Seg, Switch } from './LaptopUI';
import { formatRupees, buildLineEntries, lineAmount, itemDays, functionDateText } from '../utils/helpers';

// ============================================================
// HELPERS
// ============================================================

/** Columns: ⋮⋮ · tick · Item · Qty · Rate · Days · Amount · bin (Rate and Amount go while prices are hidden) */
const cols = (hide) => (hide
  ? 'grid-cols-[18px_16px_minmax(0,1fr)_64px_60px_34px]'
  : 'grid-cols-[18px_16px_minmax(0,1fr)_64px_104px_60px_110px_34px]');

const BOX = 'w-full h-[34px] rounded-lg border border-gray-300 bg-white px-2 text-[13px] tabular-nums text-bb-text focus:outline-none focus:ring-2 focus:ring-bb-accent/40';

/** "Stage Decor" → "Stage Decor group" (unless the name already says group) */
const groupTitle = (name) => (/group/i.test(name) ? name : `${name} group`);

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** A draggable line; `children(handleProps)` draws it */
function Sortable({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 20 : undefined }}
      className={isDragging ? 'bg-white rounded-xl shadow-[0_14px_28px_-10px_rgba(40,10,70,0.45)] ring-1 ring-violet-200' : ''}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

function Handle({ handle, label }) {
  return (
    <button {...handle} aria-label={`Drag ${label}`} title="Drag to reorder"
      className="w-[18px] h-7 flex items-center justify-center text-gray-400 hover:text-bb-text cursor-grab active:cursor-grabbing touch-none">
      <GripVertical size={15} />
    </button>
  );
}

function Tick({ checked, onChange, label }) {
  return <input type="checkbox" checked={checked} onChange={onChange} aria-label={`Select ${label}`} className="w-4 h-4 accent-bb-accent cursor-pointer" />;
}

/** One item line: ⋮⋮ · tick · name · Qty · Rate · Days · Amount · bin */
function ItemLine({ q, sectionId, name, keyId, bundle, handle }) {
  const p = q.itemPrices[keyId] || { qty: 1, rate: 0, days: 1 };
  const days = itemDays(p);
  const inBundle = !!bundle;
  const checked = inBundle ? q.selectedBundleMembers.has(keyId) : (q.selectedForGroup[sectionId] || new Set()).has(name);
  const set = (field, value) => (inBundle ? q.updateBundleMemberPrice(bundle, keyId, field, value) : q.setItemPrice(keyId, field, value));
  return (
    <div className={`grid ${cols(q.hidePrices)} gap-2.5 items-center px-2.5 py-2 border-b border-gray-100 ${checked ? 'bg-violet-50' : ''}`}
      data-testid="quote-item" data-item={name}>
      <Handle handle={handle} label={name} />
      <Tick checked={checked} label={name} onChange={() => (inBundle ? q.toggleSelectBundleMember(keyId) : q.toggleSelectForGroup(sectionId, name))} />
      <p className={`min-w-0 text-[14px] break-words ${inBundle ? 'font-medium' : 'font-semibold'} text-bb-text`}>{name}</p>
      <input type="number" min="1" aria-label={`${name} quantity`} value={p.qty === '' ? '' : (p.qty || 1)}
        onChange={e => set('qty', e.target.value === '' ? '' : Number(e.target.value))} className={`${BOX} text-center`} />
      {!q.hidePrices && (
        <input type="number" min="0" placeholder="Rate" aria-label={`${name} rate`} value={p.rate || ''}
          onChange={e => set('rate', Number(e.target.value) || 0)} className={`${BOX} text-right`} />
      )}
      <input type="number" min="1" aria-label={`${name} days`} value={p.days === '' ? '' : days}
        onChange={e => set('days', e.target.value === '' ? '' : Math.max(1, Math.round(Number(e.target.value)) || 1))}
        className={`${BOX} text-center ${days > 1 ? '!border-bb-accent !bg-violet-50 font-semibold' : ''}`} />
      {!q.hidePrices && <b className="text-right text-[14px] tabular-nums whitespace-nowrap" data-testid="line-amount">{formatRupees(lineAmount(p))}</b>}
      <IconButton icon={Trash2} label={`Remove ${name}`} tone="quiet" size={32} iconSize={15} className="hover:!text-red-600 hover:!bg-red-50"
        onClick={() => q.removeItem(sectionId, name)} />
    </div>
  );
}

/** A group: header (⋮⋮ · tick · "<name> group" · ⋯), its items, then the group price */
function GroupBlock({ q, sectionId, bundle, handle }) {
  const checked = q.selectedBundles.has(bundle.id);
  const members = bundle.itemKeys.filter(k => k.startsWith(`${sectionId}::`));
  const addsUp = members.reduce((s, k) => s + lineAmount(q.itemPrices[k] || {}), 0);
  return (
    <div className={`my-2 rounded-xl border-[1.5px] overflow-hidden ${checked ? 'border-bb-accent' : 'border-violet-200'}`} data-testid="quote-group" data-group={bundle.name}>
      <div className={`flex items-center gap-2.5 px-2.5 py-1.5 border-b border-violet-100 ${checked ? 'bg-violet-100' : 'bg-[#faf8ff]'}`} data-testid="group-header">
        <Handle handle={handle} label={bundle.name} />
        <Tick checked={checked} label={`group ${bundle.name}`} onChange={() => q.toggleSelectBundle(bundle.id)} />
        <p className="flex-1 min-w-0 text-[14.5px] font-bold text-bb-accent-hover break-words">{groupTitle(bundle.name)}</p>
        <MorePopover label={`Options for group ${bundle.name}`} size={32} testId="group-more">
          <PopItem icon={Pencil} onClick={() => q.renameGroup(bundle)} testId="group-rename">Rename group</PopItem>
          <PopItem icon={Ungroup} onClick={() => q.ungroupGroup(bundle.id)} testId="group-ungroup">Ungroup</PopItem>
          <PopItem icon={Trash2} tone="red" onClick={() => q.deleteGroup(bundle)} testId="group-delete">Delete group and items</PopItem>
        </MorePopover>
      </div>
      <DndContext sensors={q.dndSensors} collisionDetection={closestCenter} onDragEnd={q.onMemberDragEnd(sectionId, bundle.id)}>
        <SortableContext items={members} strategy={verticalListSortingStrategy}>
          {members.map(k => (
            <Sortable key={k} id={k}>
              {(h) => <ItemLine q={q} sectionId={sectionId} name={k.slice(sectionId.length + 2)} keyId={k} bundle={bundle} handle={h} />}
            </Sortable>
          ))}
        </SortableContext>
      </DndContext>
      {!q.hidePrices && (
        <div className="flex items-center gap-3 pl-[56px] pr-[46px] py-2 bg-[#faf8ff]" data-testid="group-footer">
          <span className="text-[12.5px] text-bb-muted">Items add up to {formatRupees(addsUp)}</span>
          <span className="flex-1" />
          <label className="flex items-center gap-2 text-[13px] font-semibold text-bb-text">
            Total group price ₹
            <input type="number" min="0" value={bundle.amount || ''} placeholder="0" aria-label={`${bundle.name} group price`} data-testid="group-price"
              onChange={e => q.setBundleAmount(bundle.id, Number(e.target.value) || 0)}
              className="w-[110px] h-[32px] rounded-lg border border-violet-300 bg-white px-2.5 text-right text-[13.5px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
          </label>
        </div>
      )}
    </div>
  );
}

// ============================================================
// QuoteLaptopTools — pinned under the title row by the page
// ============================================================

export function QuoteLaptopTools({ q }) {
  const btn = 'shrink-0 min-h-[36px] px-3 rounded-xl border inline-flex items-center gap-2 text-[13.5px] font-semibold cursor-pointer transition-colors disabled:text-gray-400 disabled:border-gray-200 disabled:bg-gray-50 disabled:cursor-default';
  const plain = 'bg-white border-gray-300 text-bb-text hover:bg-gray-50';
  const lit = 'bg-violet-50 border-violet-300 text-bb-accent-hover';
  return (
    <div className="flex items-center gap-2" data-testid="quote-tools">
      <button onClick={q.onGroup} disabled={!q.canGroup} className={`${btn} ${q.canGroup ? lit : plain}`} data-testid="tool-group">
        <Layers size={16} />{q.tickedCount > 0 ? `Group (${q.tickedCount})` : 'Group'}
      </button>
      <button onClick={q.onUngroup} disabled={!q.canUngroup} className={`${btn} ${q.canUngroup ? lit : plain}`} data-testid="tool-ungroup"><Ungroup size={16} />Ungroup</button>
      <button onClick={() => q.setHidePrices(!q.hidePrices)} aria-pressed={q.hidePrices} className={`${btn} ${q.hidePrices ? lit : plain}`} data-testid="tool-hide">
        {q.hidePrices ? <Eye size={16} /> : <EyeOff size={16} />}{q.hidePrices ? 'Show prices' : 'Hide prices'}
      </button>
      <button onClick={q.onFitBudget} className={`${btn} ${plain}`} data-testid="tool-fit"><Wand2 size={16} />Fit to budget</button>
      <button onClick={q.onVersions} className={`${btn} ${plain}`} data-testid="tool-versions"><History size={16} />{q.revisionsCount ? `Versions (${q.revisionsCount})` : 'Versions'}</button>
    </div>
  );
}

// ============================================================
// QuoteLaptopEditor — MAIN COMPONENT
// ============================================================

export default function QuoteLaptopEditor({ q }) {
  const many = q.printGroups.length > 1;
  const head = 'text-[10.5px] font-bold uppercase tracking-[0.07em] text-bb-muted';
  return (
    <div className="space-y-4" data-testid="quote-laptop">
      {q.printGroups.map(group => {
        const entries = buildLineEntries(group.id, group.items, q.bundles);
        const ids = entries.map(en => (en.type === 'bundle' ? `bundle:${en.bundle.id}` : en.key));
        const total = q.sectionTotals[group.id] || 0;
        const d = group.date ? new Date(`${group.date}T00:00:00`) : null;
        const mismatchDays = group.items.some(n => itemDays(q.itemPrices[`${group.id}::${n}`]) !== group.days);
        const info = [group.date ? functionDateText(group) : 'No date yet', group.location, `${group.items.length} item${group.items.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
        return (
          <section key={group.id} className="bg-white border border-bb-border rounded-2xl p-4" data-testid="quote-section" data-section={group.id}>
            {/* Event band: date · name · date, venue, items · Event total */}
            <div className="flex items-center gap-3 rounded-xl bg-[#f6f3ff] border border-violet-100 px-3 py-2" data-testid="quote-event-head">
              <div className="w-[42px] shrink-0 text-center bg-white border border-violet-200 rounded-[9px] pt-[3px] pb-1 leading-tight shadow-[0_1px_2px_rgba(60,20,110,0.08)]" aria-hidden="true">
                <div className="text-[10.5px] font-extrabold tracking-[0.04em] text-bb-accent-hover">{d ? d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase() : '—'}</div>
                <div className="text-[16px] font-extrabold text-bb-text">{d ? d.getDate() : '?'}</div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15.5px] font-bold text-bb-text break-words">
                  {group.name}{many && group.id === 'main' && <span className="ml-1.5 align-middle text-[10.5px] font-bold px-1.5 py-px rounded-full bg-violet-100 text-bb-accent-hover">Main</span>}
                </p>
                <p className="text-[12.5px] text-gray-600 break-words">{info}</p>
              </div>
              {!q.hidePrices && (
                <div className="text-right shrink-0">
                  <p className="text-[11.5px] text-bb-muted font-semibold">Event total</p>
                  <b className="text-[16px] tabular-nums" data-testid="section-total">{formatRupees(total)}</b>
                </div>
              )}
            </div>

            {/* Column headings */}
            {entries.length > 0 && (
              <div className={`grid ${cols(q.hidePrices)} gap-2.5 px-2.5 pt-3 pb-2 border-b border-bb-border`} data-testid="price-header">
                <span /><span /><span className={head}>Item</span><span className={`${head} text-center`}>Qty</span>
                {!q.hidePrices && <span className={`${head} text-right`}>Rate ₹</span>}
                <span className={`${head} text-center`}>Days</span>
                {!q.hidePrices && <span className={`${head} text-right`}>Amount</span>}
                <span />
              </div>
            )}

            {entries.length === 0 && <p className="text-[13.5px] text-bb-muted text-center py-5">No items in this event yet</p>}
            <DndContext sensors={q.dndSensors} collisionDetection={closestCenter} onDragEnd={q.onDragEnd(group.id, entries)}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {entries.map((en, i) => (
                  <Sortable key={ids[i]} id={ids[i]}>
                    {(h) => (en.type === 'bundle'
                      ? <GroupBlock q={q} sectionId={group.id} bundle={en.bundle} handle={h} />
                      : <ItemLine q={q} sectionId={group.id} name={en.name} keyId={en.key} handle={h} />)}
                  </Sortable>
                ))}
              </SortableContext>
            </DndContext>

            {mismatchDays && group.items.length > 0 && (
              <button onClick={() => q.setSectionDays(group.id, group.days)} className="mt-2 ml-2.5 text-[12.5px] font-semibold text-bb-accent-hover hover:underline cursor-pointer">
                Set all items to {group.days} {group.days === 1 ? 'day' : 'days'}
              </button>
            )}

            {/* Subtotal — or, with hidden prices, the amount the client is charged */}
            {q.hidePrices ? (
              <div className="mt-3 flex items-center justify-end gap-3 rounded-xl bg-orange-50 border border-orange-200 px-3.5 py-2.5" data-testid="final-amount-box">
                <label htmlFor={`final-${group.id}`} className="text-right">
                  <span className="block text-[13.5px] font-bold">Final amount · {group.name}</span>
                  <span className="block text-[12px] text-gray-600" data-testid="hidden-summary">Items add up to {formatRupees(q.sectionSplit(group).total)}</span>
                </label>
                <input id={`final-${group.id}`} type="number" min="0" value={q.finalAmounts[group.id] ?? ''} placeholder="Amount"
                  onChange={e => q.setFinalAmount(group.id, Number(e.target.value) || 0)}
                  className="w-[140px] h-[40px] rounded-lg border-2 border-orange-400 bg-white px-3 text-right text-[15px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
            ) : entries.length > 0 && (
              <div className="mt-1 flex items-baseline justify-end gap-6 pt-3 pb-1 pr-[46px] border-t-2 border-bb-border" data-testid="section-subtotal">
                <span className="text-[12.5px] font-semibold text-bb-muted">Subtotal · {group.name}</span>
                <b className="text-[17px] font-extrabold tabular-nums">{formatRupees(total)}</b>
              </div>
            )}

            {/* Add an item, in place */}
            <div className="mt-3 flex items-center gap-2">
              <input value={q.newItemNames[group.id] || ''} placeholder={`Add an item to ${group.name}…`} aria-label={`Add an item to ${group.name}`}
                onChange={e => q.setNewItemName(group.id, e.target.value)} onKeyDown={e => e.key === 'Enter' && q.addItem(group.id)}
                className="flex-1 min-w-0 h-[38px] rounded-xl border border-bb-border bg-bb-input px-3 text-[13.5px] text-bb-text placeholder:text-bb-muted/70 focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
              <button onClick={() => q.addItem(group.id)} className="shrink-0 h-[38px] px-3.5 rounded-xl bg-bb-accent text-white text-[13.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-bb-accent-hover" data-testid="add-item">
                <Plus size={16} />Add
              </button>
              <button onClick={() => q.openCategories(group.id)} className="shrink-0 h-[38px] px-3.5 rounded-xl border border-gray-300 bg-white text-[13.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-gray-50" data-testid="add-from-services">
                <ListPlus size={16} />From services
              </button>
            </div>
          </section>
        );
      })}

      {/* Price & terms */}
      <section className="bg-white border border-bb-border rounded-2xl px-5 py-4" data-testid="price-terms">
        <SectionLabel>Price &amp; terms</SectionLabel>
        <div className="flex items-end gap-6 mt-3 flex-wrap">
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-gray-700 mb-1">Discount</span>
            <span className="flex items-center gap-2">
              <input id="quote-discount" value={q.discountText} onChange={e => q.setDiscountText(e.target.value)} placeholder="5000 or 10%"
                className="w-[130px] h-[38px] rounded-xl border border-bb-border bg-bb-input px-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
              {q.discount.amount > 0 && <span className="text-[13px] font-semibold text-emerald-600" data-testid="discount-amount">− {formatRupees(q.discount.amount)}</span>}
            </span>
          </label>
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-gray-700 mb-1">Valid for (days)</span>
            <input type="number" value={q.validityDays} onChange={e => q.setValidityDays(Number(e.target.value))} aria-label="Valid for (days)"
              className="w-[96px] h-[38px] rounded-xl border border-bb-border bg-bb-input px-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
          </label>
          <div>
            <span className="block text-[12.5px] font-semibold text-gray-700 mb-1">GST</span>
            <span className="flex items-center gap-3 h-[38px]">
              <Switch checked={q.gstEnabled} onChange={q.setGstEnabled} label="Add GST" testId="gst-switch" />
              {q.gstEnabled && <Seg label="GST rate" value={q.gstRate} onChange={q.setGstRate} options={['5', '12', '18', '28'].map(r => ({ value: r, label: `${r}%` }))} testId="gst-rate" />}
            </span>
          </div>
          <span className="flex-1" />
          <div className="text-right">
            <p className="text-[12.5px] text-bb-muted">
              Subtotal {formatRupees(q.subtotal)}
              {q.discount.amount > 0 && <> · Discount − {formatRupees(q.discount.amount)}</>}
              {q.gstEnabled && <> · GST {q.gstRate}% {formatRupees(q.gstData.tax)}</>}
            </p>
            <p className="text-[19px] font-extrabold tabular-nums" data-testid="quote-total">Total {formatRupees(q.gstData.total)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
