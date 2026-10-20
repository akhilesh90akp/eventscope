/**
 * QuotePhoneEditor — the Details tab of the quotation on phones (below 1024px)
 *
 * Same quote, same data and same handlers as the laptop editor in
 * QuotationGenerator; only the layout differs:
 *   - tools bar always visible: Select (→ checkboxes) · Group · Ungroup
 *   - one block per event (main + sub events) with its date, items and total
 *   - every item: ⋮⋮ drag handle · name · amount · ⋮ menu, then labelled
 *     Qty · Rate ₹ · Days boxes (big amounts like ₹2,00,000 fit on line 1)
 *   - groups stay open: name, group price box, ⋮; members inside
 *   - hidden prices: a Final amount box at the end of each event
 *   - Price & terms card: discount, validity, Fit to budget, GST, hide prices
 * The page passes everything in one `q` object (state + handlers).
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreVertical, Plus, ListPlus, Layers, Ungroup, SquareCheck, Check, Wand2 } from 'lucide-react';
import { DateBlock, IconButton, NumberBox, SwitchRow, SectionLabel } from './PhoneUI';
import { formatRupees, buildLineEntries, lineAmount, itemDays } from '../utils/helpers';

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

/** ⋮⋮ handle (drag) or a checkbox (Select mode) at the start of a line */
function Lead({ selectMode, checked, onCheck, handle, label }) {
  if (selectMode) {
    return (
      <button onClick={onCheck} role="checkbox" aria-checked={checked} aria-label={`Select ${label}`}
        className={`w-6 h-6 mt-0.5 shrink-0 rounded-md border-2 flex items-center justify-center cursor-pointer ${checked ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300'}`}>
        {checked && <Check size={15} strokeWidth={3} />}
      </button>
    );
  }
  return (
    <button {...handle} aria-label={`Drag ${label}`} title="Hold and drag to move"
      className="w-6 h-7 -ml-0.5 shrink-0 flex items-center justify-center text-gray-400 touch-none cursor-grab active:cursor-grabbing">
      <GripVertical size={18} />
    </button>
  );
}

/** One item: name · amount · ⋮, then Qty · Rate ₹ · Days */
function ItemRow({ q, sectionId, name, keyId, bundle, handle, last }) {
  const p = q.itemPrices[keyId] || { qty: 1, rate: 0, days: 1 };
  const days = itemDays(p);
  const inBundle = !!bundle;
  const checked = inBundle ? q.selectedBundleMembers.has(keyId) : (q.selectedForGroup[sectionId] || new Set()).has(name);
  const set = (field, value) => (inBundle ? q.updateBundleMemberPrice(bundle, keyId, field, value) : q.setItemPrice(keyId, field, value));
  return (
    <div className={`py-3.5 ${last ? '' : 'border-b border-bb-border'} ${q.selectMode && checked ? 'bg-violet-50 -mx-2.5 px-2.5 rounded-xl' : ''}`} data-testid="quote-item" data-item={name}>
      <div className="flex items-start gap-2.5">
        <Lead selectMode={q.selectMode} checked={checked} handle={handle} label={name}
          onCheck={() => (inBundle ? q.toggleSelectBundleMember(keyId) : q.toggleSelectForGroup(sectionId, name))} />
        <p className="flex-1 min-w-0 text-[15.5px] font-bold leading-snug break-words">{name}</p>
        {!q.hidePrices && <b className={`text-[15.5px] whitespace-nowrap tabular-nums ${inBundle ? 'text-bb-muted font-semibold' : ''}`} data-testid="line-amount">{formatRupees(lineAmount(p))}</b>}
        {!q.selectMode && (
          <IconButton icon={MoreVertical} label={`Options for ${name}`} tone="quiet" size={36} iconSize={18} className="-my-1.5 -mr-2"
            onClick={() => q.openItemMenu({ sectionId, name, key: keyId, bundleId: bundle?.id || null })} />
        )}
      </div>
      <div className={`grid gap-2 mt-2.5 ml-[34px] ${q.hidePrices ? 'grid-cols-[72px_64px]' : 'grid-cols-[72px_1fr_64px]'}`}>
        <NumberBox label="Qty" value={p.qty === '' ? '' : (p.qty || 1)} min="1" aria-label={`${name} quantity`}
          onChange={e => set('qty', e.target.value === '' ? '' : Number(e.target.value))} />
        {!q.hidePrices && (
          <NumberBox label="Rate ₹" value={p.rate || ''} placeholder="Rate" min="0" aria-label={`${name} rate`}
            onChange={e => set('rate', Number(e.target.value) || 0)} />
        )}
        <NumberBox label="Days" value={p.days === '' ? '' : days} min="1" highlight={days > 1} aria-label={`${name} days`}
          onChange={e => set('days', e.target.value === '' ? '' : Math.max(1, Math.round(Number(e.target.value)) || 1))} />
      </div>
    </div>
  );
}

/** A group: open, purple border, group price box, members inside */
function GroupBlock({ q, sectionId, bundle, handle }) {
  const checked = q.selectedBundles.has(bundle.id);
  const members = bundle.itemKeys.filter(k => k.startsWith(`${sectionId}::`));
  return (
    <div className={`my-2 rounded-2xl border-[1.5px] ${checked ? 'border-bb-accent bg-violet-100/60' : 'border-violet-300 bg-violet-50/60'} px-3.5 pt-3`} data-testid="quote-group" data-group={bundle.name}>
      <div className="flex items-center gap-2.5 pb-3 border-b border-violet-200">
        <Lead selectMode={q.selectMode} checked={checked} handle={handle} label={bundle.name} onCheck={() => q.toggleSelectBundle(bundle.id)} />
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-extrabold text-bb-accent-hover break-words">{bundle.name}</p>
          <p className="text-[13px] text-gray-600">Group · {members.length} items</p>
        </div>
        {!q.hidePrices && (
          <label className="block w-[112px] shrink-0">
            <span className="block text-[11.5px] text-gray-600 mb-1 ml-0.5">Group price ₹</span>
            <input type="number" inputMode="decimal" min="0" value={bundle.amount || ''} aria-label={`${bundle.name} group price`}
              onChange={e => q.setBundleAmount(bundle.id, Number(e.target.value) || 0)}
              className="w-full min-h-[44px] rounded-xl border border-bb-border bg-white px-2.5 text-[15px] font-extrabold tabular-nums focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
          </label>
        )}
        {!q.selectMode && (
          <IconButton icon={MoreVertical} label={`Options for group ${bundle.name}`} tone="quiet" size={36} iconSize={18} className="-mr-2"
            onClick={() => q.openGroupMenu(bundle)} />
        )}
      </div>
      {members.map((k, i) => (
        <ItemRow key={k} q={q} sectionId={sectionId} name={k.slice(sectionId.length + 2)} keyId={k} bundle={bundle}
          handle={{}} last={i === members.length - 1} />
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
  return (
    <div className="space-y-5" data-testid="quote-phone">
      {/* Tools — always visible; Group / Ungroup light up once something is selected */}
      <div className="flex gap-2" data-testid="quote-tools">
        <button onClick={() => q.setSelectMode(!q.selectMode)} data-testid="tool-select"
          className={`min-h-[44px] px-3.5 rounded-xl border font-semibold text-[14.5px] inline-flex items-center gap-2 cursor-pointer
            ${q.selectMode ? 'bg-bb-accent border-bb-accent text-white' : 'bg-violet-50 border-violet-200 text-bb-accent-hover'}`}>
          {q.selectMode ? <><Check size={18} />Done</> : <><SquareCheck size={18} />Select</>}
        </button>
        <button onClick={q.onGroup} disabled={!q.canGroup} data-testid="tool-group"
          className="min-h-[44px] px-3.5 rounded-xl border border-gray-300 bg-white font-semibold text-[14.5px] inline-flex items-center gap-2 cursor-pointer disabled:text-gray-400 disabled:border-gray-200 disabled:bg-gray-50 disabled:cursor-default">
          <Layers size={18} />Group
        </button>
        <button onClick={q.onUngroup} disabled={!q.canUngroup} data-testid="tool-ungroup"
          className="min-h-[44px] px-3.5 rounded-xl border border-gray-300 bg-white font-semibold text-[14.5px] inline-flex items-center gap-2 cursor-pointer disabled:text-gray-400 disabled:border-gray-200 disabled:bg-gray-50 disabled:cursor-default">
          <Ungroup size={18} />Ungroup
        </button>
      </div>
      {q.selectMode && <p className="-mt-2 text-[13px] text-gray-600">Tick items to group or remove them. Groups stay inside one event.</p>}

      {/* One block per event */}
      {sections.map(group => {
        const entries = buildLineEntries(group.id, group.items, q.bundles);
        const ids = entries.map(en => (en.type === 'bundle' ? `bundle:${en.bundle.id}` : en.key));
        const total = q.sectionTotals[group.id] || 0;
        const split = q.hidePrices ? q.sectionSplit(group) : null;
        const mismatchDays = group.items.some(n => itemDays(q.itemPrices[`${group.id}::${n}`]) !== group.days);
        return (
          <section key={group.id} className="space-y-3" data-testid="quote-section" data-section={group.id}>
            {/* Event header: date · name (Main) · items · total */}
            <div className="flex items-center gap-3 px-0.5">
              <DateBlock date={group.date} />
              <div className="flex-1 min-w-0">
                <p className="text-[15.5px] font-extrabold truncate">
                  {group.name}{many && group.id === 'main' && <span className="ml-1.5 align-middle text-[11px] font-bold px-1.5 py-px rounded-full bg-violet-100 text-bb-accent-hover">Main</span>}
                </p>
                <p className="text-[13px] text-gray-600 truncate">{group.items.length} item{group.items.length === 1 ? '' : 's'}{group.days > 1 ? ` · ${group.days} days` : ''}{group.location ? ` · ${group.location}` : ''}</p>
              </div>
              <b className="text-[16px] tabular-nums" data-testid="section-total">{formatRupees(total)}</b>
            </div>

            <div className="bg-white border border-bb-border rounded-2xl px-4 pt-1 pb-3">
              {entries.length === 0 && <p className="text-[14px] text-gray-600 text-center py-5">No items yet</p>}
              <DndContext sensors={q.dndSensors} collisionDetection={closestCenter} onDragEnd={q.onDragEnd(group.id, entries)}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  {entries.map((en, i) => (
                    <Sortable key={ids[i]} id={ids[i]}>
                      {(handle) => (en.type === 'bundle'
                        ? <GroupBlock q={q} sectionId={group.id} bundle={en.bundle} handle={handle} />
                        : <ItemRow q={q} sectionId={group.id} name={en.name} keyId={en.key} handle={handle} last={i === entries.length - 1} />)}
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

              <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-bb-border">
                <button onClick={() => q.openAddItem(group.id)} className="min-h-[44px] inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-bb-accent-hover cursor-pointer" data-testid="add-item">
                  <Plus size={18} />Add item
                </button>
                <button onClick={() => q.openCategories(group.id)} className="min-h-[44px] inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-bb-accent-hover cursor-pointer">
                  <ListPlus size={18} />From services
                </button>
              </div>
            </div>
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
    </div>
  );
}
