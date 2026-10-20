/**
 * EventCardPhone — an event card on phones (below 1024px), plus its two sheets
 *
 * Used by Home, Drafts, Confirmed and Completed. Laptops keep the older,
 * fold-open cards on those pages.
 *   - EventCardPhone   name, chips, amount, every function (main + sub events)
 *                      or date + venue, "N items added · View", one action row
 *   - EventItemsSheet  the items on this event, by function, with groups
 *   - EventMoreSheet   everything else (Edit, Add items, Set prices, Contract,
 *                      Move to…, Mark done) with Delete last, in red
 * Pure UI: the page passes the handlers (and does the saving).
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import {
  FileText, Receipt, Phone, MessageSquare, MoreHorizontal, ClipboardList, ChevronRight,
  CheckCircle2, Edit3, Plus, Tag, FileSignature, ArrowLeftRight, Trash2, Lock, CalendarDays, MapPin, Table2,
} from 'lucide-react';
import Badge from './Badge';
import BottomSheet from './BottomSheet';
import { IconButton, FunctionRow, MenuRow } from './PhoneUI';
import {
  formatRupees, formatDateRange, eventCountdown, telLink, waLink, getEventSections, getAllEventDates,
  buildLineEntries, computeSectionTotal, lineAmount, itemDays, getEventBill, functionEnd, eventFunctions, eventItemCount,
} from '../utils/helpers';

// ============================================================
// HELPERS
// ============================================================

/** "5 days" / "Today" / "Tomorrow" / "2 days ago" */
const countdownText = (d) => (d < 0 ? `${Math.abs(d)} day${d === -1 ? '' : 's'} ago` : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d} days`);
const countdownTone = (d) => (d < 0 ? 'bg-gray-100 text-gray-700' : d <= 3 ? 'bg-red-100 text-red-700' : d <= 7 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800');

// ============================================================
// SUB-COMPONENTS
// ============================================================

const Chip = ({ className, children, testId }) => (
  <span className={`inline-flex items-center text-[12px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${className}`} data-testid={testId}>{children}</span>
);

/** Square text button of the action row (Quote / Bill / Job Log / Confirm…) */
function RowButton({ icon: Icon, children, onClick, kind = 'secondary', testId, compact = false }) {
  const look = {
    primary: 'bg-bb-accent text-white border-transparent hover:bg-bb-accent-hover',
    success: 'bg-emerald-600 text-white border-transparent hover:bg-emerald-700',
    secondary: 'bg-white text-bb-text border-gray-300 hover:bg-gray-50',
  }[kind];
  return (
    <button onClick={onClick} data-testid={testId}
      className={`flex-1 min-w-0 min-h-[44px] px-2.5 rounded-xl border inline-flex items-center justify-center gap-1.5 font-semibold text-[15px] cursor-pointer whitespace-nowrap ${look}`}>
      {Icon && <Icon size={18} className={`shrink-0 ${compact ? 'max-[400px]:hidden' : ''}`} />}<span className="truncate">{children}</span>
    </button>
  );
}

// ============================================================
// EventCardPhone — MAIN COMPONENT
// ============================================================

/**
 * @param ev        the event
 * @param variant   'draft' | 'confirmed' | 'completed' | 'home'
 * @param on        { quote, bill, confirm, markDone, jobLog, items, more } handlers (missing = hidden)
 * @param locked    read-only company: write buttons show a lock
 */
export default function EventCardPhone({ ev, variant = ev?.status, on = {}, locked = false }) {
  const fns = eventFunctions(ev);
  const many = fns.length > 1;
  const countdown = eventCountdown(ev);
  const items = eventItemCount(ev);
  const phone = ev.clientPhone || ev.clientWhatsapp;
  const allOver = fns.every(f => f.past) && !!fns[0]?.fn?.date;
  const bill = variant === 'completed' ? getEventBill(ev) : null;
  const amount = variant === 'draft' ? Number(ev.totalAmount) || Number(ev.budget) || 0 : Number(ev.totalAmount) || 0;
  const LockOr = (icon) => (locked ? Lock : icon);

  return (
    <article className="bg-white border border-bb-border rounded-2xl p-[18px]" data-testid="event-card-phone" data-event={ev.id}>
      {/* Name · chips · amount */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[18px] font-bold text-bb-text truncate">{ev.clientName || 'Untitled'}</h3>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant={ev.status}>{ev.eventType || 'Event'}</Badge>
          </div>
        </div>
        <div className="text-right shrink-0">
          {amount > 0 && <p className={`text-[17px] font-bold tabular-nums ${variant === 'draft' && !ev.totalAmount ? 'text-bb-muted' : 'text-emerald-600'}`}>{formatRupees(amount)}</p>}
          <div className="mt-2 flex justify-end">
            {variant === 'completed'
              ? (bill.hasBill && bill.billTotal > 0 && (bill.balance > 0
                ? <Chip className="bg-amber-100 text-amber-800" testId="balance-chip">Balance {formatRupees(bill.balance)}</Chip>
                : <Chip className="bg-emerald-100 text-emerald-800" testId="balance-chip">Paid</Chip>))
              : countdown !== null && !allOver && <Chip className={countdownTone(countdown)} testId="countdown-chip">{countdownText(countdown)}</Chip>}
          </div>
        </div>
      </div>

      {/* Functions: a list when there are sub events, else date + venue */}
      {many ? (
        <div className="mt-3.5 mb-3 border border-bb-border rounded-xl divide-y divide-bb-border overflow-hidden" data-testid="card-functions">
          {fns.map((f, i) => (
            <FunctionRow key={i} fn={f.fn} main={f.main} past={f.past} className={`px-3 py-2.5 ${f.main ? 'bg-violet-50/40' : ''}`} />
          ))}
        </div>
      ) : (
        <div className="mt-3.5 mb-3.5 space-y-1.5 text-[14.5px]">
          {fns[0]?.fn?.date && (
            <p className="flex items-center gap-2 font-semibold text-bb-accent-hover">
              <CalendarDays size={17} className="shrink-0" />{formatDateRange(fns[0].fn.date, functionEnd(fns[0].fn))}
            </p>
          )}
          {fns[0]?.fn?.location && (
            <p className="flex items-center gap-2 text-gray-600 min-w-0"><MapPin size={17} className="shrink-0" /><span className="truncate">{fns[0].fn.location}</span></p>
          )}
        </div>
      )}

      {/* Items on this event */}
      {on.items && (
        <button onClick={on.items} data-testid="items-link"
          className="w-full mb-3.5 min-h-[46px] px-3 rounded-xl bg-violet-50/70 border border-violet-100 flex items-center gap-2.5 text-bb-accent-hover font-semibold text-[14.5px] cursor-pointer">
          <ClipboardList size={18} className="shrink-0" />
          <span className="flex-1 text-left">{items ? `${items} item${items === 1 ? '' : 's'} added` : 'No items yet'}</span>
          <span className="text-[13px] font-medium text-bb-muted">{items ? 'View' : 'Add'}</span><ChevronRight size={17} />
        </button>
      )}

      {/* Confirmed and the day is over: suggest Mark done */}
      {variant === 'confirmed' && allOver && on.markDone && (
        <div className="mb-3.5 flex items-center gap-2.5 rounded-xl bg-emerald-50 px-3 py-2" data-testid="day-over">
          <span className="flex-1 text-[14px] font-semibold text-emerald-800">The event day is over</span>
          <button onClick={on.markDone} className="min-h-[40px] px-3 rounded-xl bg-emerald-600 text-white font-semibold text-[14px] inline-flex items-center gap-1.5 cursor-pointer">
            {React.createElement(LockOr(CheckCircle2), { size: 17 })}Mark done
          </button>
        </div>
      )}

      {/* One action row */}
      <div className="flex items-center gap-2" data-testid="card-actions">
        {variant === 'draft' && <>
          <RowButton kind="success" icon={LockOr(CheckCircle2)} onClick={on.confirm} testId="btn-confirm">Confirm</RowButton>
          <RowButton icon={FileText} onClick={on.quote} testId="btn-quote">Quote</RowButton>
          {phone && <IconButton as="a" href={telLink(phone)} icon={Phone} label="Call" tone="green" />}
        </>}
        {(variant === 'confirmed' || variant === 'home') && <>
          <RowButton icon={FileText} onClick={on.quote} testId="btn-quote" compact={variant === 'confirmed' && !!phone}>Quote</RowButton>
          {variant === 'confirmed' && <RowButton icon={Receipt} onClick={on.bill} testId="btn-bill" compact={!!phone}>Bill</RowButton>}
          {phone && <IconButton as="a" href={telLink(phone)} icon={Phone} label="Call" tone="green" />}
          {phone && <IconButton as="a" href={waLink(phone)} target="_blank" rel="noopener noreferrer" icon={MessageSquare} label="WhatsApp" tone="green" />}
        </>}
        {variant === 'completed' && <>
          <RowButton kind="primary" icon={Receipt} onClick={on.bill} testId="btn-bill">Bill</RowButton>
          {on.jobLog && <RowButton icon={Table2} onClick={on.jobLog} testId="btn-joblog">Job Log</RowButton>}
          {phone && <IconButton as="a" href={waLink(phone)} target="_blank" rel="noopener noreferrer" icon={MessageSquare} label="WhatsApp" tone="green" />}
        </>}
        {on.more && <IconButton icon={MoreHorizontal} label="More actions" onClick={on.more} data-testid="btn-more" />}
      </div>
    </article>
  );
}

// ============================================================
// EventItemsSheet — the items on one event
// ============================================================

export function EventItemsSheet({ ev, onClose, onEdit }) {
  if (!ev) return null;
  const { eventGroups } = getEventSections(ev);
  const prices = ev.itemPrices || {};
  const fnFor = (g) => (g.id === 'main' ? ev.mainEvent || { name: g.name, date: g.date, location: g.location } : (ev.subEvents || []).find(s => (s.id || s.name) === g.id) || g);
  const total = eventGroups.reduce((t, g) => t + computeSectionTotal(g.id, g.items, prices, ev.bundles, ev.hidePrices, ev.finalAmounts), 0);
  const count = eventGroups.reduce((n, g) => n + g.items.length, 0);
  const showAmounts = !ev.hidePrices;

  /** One line: name · qty · amount, in fixed columns so they line up */
  const Line = ({ name, qty, amt, inGroup }) => (
    <div className={`grid ${showAmounts ? 'grid-cols-[1fr_56px_84px]' : 'grid-cols-[1fr_56px]'} items-center gap-2 min-h-[46px] py-1.5 border-b border-gray-100 last:border-b-0 text-[15px] ${inGroup ? 'pl-3' : ''}`} data-testid="items-line">
      <span className="min-w-0 text-bb-text leading-snug">{name}</span>
      <span className="text-center text-[13px] text-gray-600 tabular-nums">{qty}</span>
      {showAmounts && <span className="text-right font-semibold tabular-nums">{amt ?? ''}</span>}
    </div>
  );

  return (
    <BottomSheet open onClose={onClose} title="Items" sub={`${ev.clientName} · ${count} item${count === 1 ? '' : 's'}${total ? ` · ${formatRupees(total)}` : ''}`} testId="items-sheet"
      footer={<div className="flex gap-2.5">
        <button onClick={onClose} className="flex-1 min-h-[46px] rounded-xl border border-gray-300 font-semibold cursor-pointer">Close</button>
        <button onClick={onEdit} className="flex-[1.6] min-h-[46px] rounded-xl bg-bb-accent text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"><FileText size={18} />Edit in quote</button>
      </div>}>
      {count === 0 && <p className="text-gray-600 py-6 text-center">No items yet. Open the quote to add some.</p>}
      <div className="space-y-5 pt-1">
        {eventGroups.map(g => {
          const entries = buildLineEntries(g.id, g.items, ev.bundles);
          const secTotal = computeSectionTotal(g.id, g.items, prices, ev.bundles, ev.hidePrices, ev.finalAmounts);
          const fn = fnFor(g);
          return (
            <section key={g.id} data-testid="items-section">
              {/* Event header: tinted strip with date, name and its total */}
              <div className="flex items-center gap-3 rounded-xl bg-violet-50 px-3 py-2.5">
                <DateBlockMini date={fn.date} />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-extrabold truncate">{g.name}{g.id === 'main' && eventGroups.length > 1 && <span className="ml-1.5 align-middle text-[11px] font-bold px-1.5 py-px rounded-full bg-white text-bb-accent-hover">Main</span>}</p>
                  <p className="text-[12.5px] text-gray-600 truncate">{g.items.length} item{g.items.length === 1 ? '' : 's'}{g.location ? ` · ${g.location}` : ''}</p>
                </div>
                {secTotal > 0 && <b className="text-[15px] tabular-nums">{formatRupees(secTotal)}</b>}
              </div>
              {/* Column names, so qty and amount are easy to map */}
              <div className={`grid ${showAmounts ? 'grid-cols-[1fr_56px_84px]' : 'grid-cols-[1fr_56px]'} gap-2 px-0 pt-3 pb-1 text-[11.5px] font-bold uppercase tracking-wider text-gray-500`}>
                <span>Item</span><span className="text-center">Qty</span>{showAmounts && <span className="text-right">Amount</span>}
              </div>
              <div>
                {entries.map(en => en.type === 'bundle' ? (
                  <div key={en.bundle.id} className="my-1.5 rounded-xl border border-violet-200 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 bg-violet-50/70 px-3 py-2">
                      <span className="text-[13.5px] font-extrabold text-bb-accent-hover">{en.bundle.name || 'Group'} <span className="font-semibold text-gray-600">· group</span></span>
                      {showAmounts && <b className="text-[14px] tabular-nums">{formatRupees(Number(en.bundle.amount) || 0)}</b>}
                    </div>
                    <div className="px-2">
                      {en.bundle.itemKeys.filter(k => k.startsWith(`${g.id}::`)).map(k => {
                        const p = prices[k] || {};
                        return <Line key={k} name={k.slice(g.id.length + 2)} qty={`× ${p.qty || 1}`} amt="" inGroup />;
                      })}
                    </div>
                  </div>
                ) : (() => {
                  const p = prices[en.key] || prices[en.name] || { qty: 1, rate: 0 };
                  const d = itemDays(p);
                  return <Line key={en.key} name={en.name} qty={`× ${p.qty || 1}${d > 1 ? ` · ${d}d` : ''}`} amt={formatRupees(lineAmount(p))} />;
                })())}
              </div>
            </section>
          );
        })}
      </div>
    </BottomSheet>
  );
}

/** Small date square for the items sheet headers */
function DateBlockMini({ date }) {
  const d = date ? new Date(`${date}T00:00:00`) : null;
  return (
    <div className="w-11 shrink-0 text-center rounded-lg bg-white py-0.5" aria-hidden="true">
      <div className="text-[10.5px] font-extrabold text-bb-accent-hover">{d ? d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase() : '—'}</div>
      <div className="text-[16px] leading-tight font-extrabold">{d ? d.getDate() : '?'}</div>
    </div>
  );
}

// ============================================================
// EventMoreSheet — the ⋯ menu of one event
// ============================================================

/**
 * @param on  { edit, addItems, setPrices, contract, move, markDone, delete } (missing = hidden)
 * @param contractTag  e.g. a PlanTag when contracts aren't on the plan
 */
export function EventMoreSheet({ ev, onClose, on = {}, locked = false, contractTag = null }) {
  if (!ev) return null;
  const L = (icon) => (locked ? Lock : icon);
  const dates = getAllEventDates(ev);
  return (
    <BottomSheet open onClose={onClose} title={ev.clientName || 'Event'} sub={[ev.eventType, dates[0] && formatDateRange(dates[0].date, dates[0].endDate)].filter(Boolean).join(' · ')} testId="more-sheet">
      <div>
        {on.edit && <MenuRow icon={L(Edit3)} title="Edit event" sub="Client, dates, venue, notes" onClick={on.edit} testId="more-edit" />}
        {on.addItems && <MenuRow icon={L(Plus)} title="Add items" sub="Pick from your services" onClick={on.addItems} testId="more-add" />}
        {on.setPrices && <MenuRow icon={L(Tag)} title="Set prices" sub="Rates for every item" onClick={on.setPrices} testId="more-prices" />}
        {on.quote && <MenuRow icon={FileText} title="Quotation" sub="Open the quote" onClick={on.quote} testId="more-quote" />}
        {on.contract && <MenuRow icon={FileSignature} title={<>Contract {contractTag}</>} sub="Service agreement PDF" onClick={on.contract} testId="more-contract" />}
        {on.move && <MenuRow icon={L(ArrowLeftRight)} title="Move to…" sub={ev.status === 'completed' ? 'Back to Confirmed or Drafts' : 'Back to Drafts'} onClick={on.move} testId="more-move" />}
        {on.markDone && <MenuRow icon={L(CheckCircle2)} title="Mark done" sub="Move to Completed" tone="green" onClick={on.markDone} testId="more-done" />}
      </div>
      {on.delete && (
        <div className="mt-4 pt-1 border-t-4 border-gray-100">
          <MenuRow icon={L(Trash2)} title="Delete event" sub="Asks you first — can’t be undone" tone="red" onClick={on.delete} testId="more-delete" />
        </div>
      )}
    </BottomSheet>
  );
}
