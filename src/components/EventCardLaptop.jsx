/**
 * EventCardLaptop — the long event card on laptops (one per row)
 *
 * Used by Home, Drafts, Confirmed and Completed at 1024px and up (phones use
 * EventCardPhone). Three lines:
 *   1. client name (wraps, never cut), event type, amount, days chip, ⌄
 *   2. the events (main + sub events) two per row — names and venues wrap —
 *      with the "N items · View list" tile at the end of the first row,
 *      always as tall as that row (it never grows with more events)
 *   3. documents on the left (Quote · Bill · Contract, or Confirm / Bill as
 *      the main one), Call · WhatsApp · ✎ · ⋯ on the right. Once the event
 *      day is over: "Event day is over · Mark as done" in the same row.
 * ⋯ opens a small menu under the button (Add items, Set prices, Move to…,
 * Delete last in red). ⌄ folds out `details` (client contact, address, notes).
 * EventDetails is that fold-out: three tiles — client contact, client address, notes;
 * Pure UI: the page passes the handlers and does the saving.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import {
  FileText, Receipt, FileSignature, Phone, MessageSquare, Edit3, ClipboardList, ChevronRight, ChevronDown, ChevronUp,
  CheckCircle2, Plus, Tag, ArrowLeftRight, Trash2, Lock, Table2, Home, Navigation, StickyNote,
} from 'lucide-react';
import Badge from './Badge';
import { IconButton } from './PhoneUI';
import { MorePopover, PopItem } from './LaptopUI';
import {
  formatRupees, formatDateRange, functionEnd, eventFunctions, eventCountdown, eventItemCount, getEventBill,
  telLink, waLink, countdownText, countdownTone,
} from '../utils/helpers';

// ============================================================
// HELPERS
// ============================================================

/** "18:30" → "6:30 pm" ('' when not set) */
const time12 = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Text button of the action row */
function DocButton({ icon: Icon, children, onClick, kind = 'secondary', testId }) {
  const look = {
    primary: 'bg-bb-accent border-bb-accent text-white hover:bg-bb-accent-hover',
    success: 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700',
    secondary: 'bg-white border-gray-300 text-bb-text hover:bg-gray-50',
  }[kind];
  return (
    <button onClick={onClick} data-testid={testId}
      className={`shrink-0 min-h-[38px] px-3.5 rounded-xl border inline-flex items-center gap-2 text-[13.5px] font-semibold cursor-pointer transition-colors ${look}`}>
      {Icon && <Icon size={16} />}{children}
    </button>
  );
}

/** One event (main or sub) as a tile: date block, name, date · time · venue (all wrap) */
function EventTile({ fn, main, past }) {
  const d = fn?.date ? new Date(`${fn.date}T00:00:00`) : null;
  const when = fn?.date ? formatDateRange(fn.date, functionEnd(fn)) : 'No date yet';
  const detail = [when, time12(fn?.time), fn?.location].filter(Boolean).join(' · ');
  return (
    <div className={`flex items-start gap-3 rounded-xl bg-violet-50/40 border border-violet-200/70 px-3 py-2 min-w-0 ${past ? 'opacity-60' : ''}`} data-testid="event-tile">
      <div className="w-10 shrink-0 text-center bg-violet-100/80 rounded-lg py-0.5 leading-tight" aria-hidden="true">
        <div className="text-[10px] font-extrabold text-bb-accent-hover">{d ? d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase() : '—'}</div>
        <div className="text-[16px] font-extrabold text-bb-text">{d ? d.getDate() : '?'}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] font-bold text-bb-text break-words ${past ? 'line-through' : ''}`}>
          {fn?.name || 'Event'}
          {main && <span className="ml-1.5 align-middle text-[10.5px] font-bold px-1.5 py-px rounded-full bg-violet-100 text-bb-accent-hover">Main</span>}
        </p>
        <p className="text-[12.5px] text-gray-600 break-words leading-snug">{detail}</p>
      </div>
    </div>
  );
}

// ============================================================
// EventCardLaptop — MAIN COMPONENT
// ============================================================

/**
 * @param ev        the event
 * @param variant   'draft' | 'confirmed' | 'completed' | 'home'
 * @param on        { quote, bill, contract, confirm, markDone, jobLog, items, edit, addItems, setPrices, move, delete }
 *                  (missing = hidden)
 * @param locked    read-only company: write actions show a lock
 * @param open      fold-out shown; onToggle switches it; details = its content
 */
export default function EventCardLaptop({ ev, variant = ev?.status, on = {}, locked = false, open = false, onToggle, details = null, highlight = false }) {
  const fns = eventFunctions(ev);
  const countdown = eventCountdown(ev);
  const items = eventItemCount(ev);
  const phone = ev.clientPhone || ev.clientWhatsapp;
  const allOver = fns.every(f => f.past) && !!fns[0]?.fn?.date;
  const bill = variant === 'completed' ? getEventBill(ev) : null;
  const amount = variant === 'draft' ? Number(ev.totalAmount) || Number(ev.budget) || 0 : Number(ev.totalAmount) || 0;
  const L = (icon) => (locked ? Lock : icon);
  const dayOver = (variant === 'confirmed' || variant === 'home') && allOver && !!on.markDone;
  const rows = [];
  for (let k = 0; k < fns.length; k += 2) rows.push(fns.slice(k, k + 2));
  const single = fns.length === 1;

  const itemsTile = on.items && (
    <button onClick={on.items} data-testid="items-link"
      className="flex items-center gap-2.5 rounded-xl bg-violet-50/40 border border-violet-200/70 px-3 py-2 text-left text-bb-accent-hover cursor-pointer hover:bg-violet-50 min-w-0">
      <ClipboardList size={17} className="shrink-0" />
      <span className="min-w-0">
        <b className="block text-[13.5px]">{items ? `${items} item${items === 1 ? '' : 's'}` : 'No items yet'}</b>
        <span className="inline-flex items-center gap-0.5 text-[12px] text-bb-muted font-medium">{items ? 'View list' : 'Add items'}<ChevronRight size={13} /></span>
      </span>
    </button>
  );

  return (
    <article data-testid="event-card-laptop" data-event={ev.id}
      className={`bg-white border rounded-2xl px-5 py-4 ${highlight ? 'border-bb-accent ring-2 ring-bb-accent/20' : 'border-bb-border'}`}>
      {/* 1 · name, type, amount, days */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-2.5 flex-wrap">
          <h3 className="text-[17px] font-bold text-bb-text break-words">{ev.clientName || 'Untitled'}</h3>
          <Badge variant={ev.status}>{ev.eventType || 'Event'}</Badge>
        </div>
        <div className="shrink-0 flex items-center gap-2.5">
          {amount > 0 && <span className={`text-[16.5px] font-extrabold tabular-nums ${variant === 'draft' && !ev.totalAmount ? 'text-bb-muted' : 'text-emerald-600'}`} data-testid="card-amount">{formatRupees(amount)}</span>}
          {variant === 'completed'
            ? (bill.hasBill && bill.billTotal > 0 && (bill.balance > 0
              ? <span className="text-[11.5px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800" data-testid="balance-chip">Balance {formatRupees(bill.balance)}</span>
              : <span className="text-[11.5px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800" data-testid="balance-chip">Paid</span>))
            : countdown !== null && <span className={`text-[11.5px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${countdownTone(countdown)}`} data-testid="countdown-chip">{countdownText(countdown)}</span>}
          {onToggle && (
            <IconButton icon={open ? ChevronUp : ChevronDown} label={open ? 'Hide details' : 'Show details'} tone="quiet" size={30} iconSize={18}
              aria-expanded={open} onClick={onToggle} data-testid="card-details-toggle" />
          )}
        </div>
      </div>

      {/* 2 · events two per row; the items tile ends the first row at the same height */}
      <div className="mt-3 space-y-2.5" data-testid="card-functions">
        {rows.map((r, n) => (
          <div key={n} className={`grid gap-2.5 items-stretch ${single ? 'grid-cols-[minmax(0,1fr)_160px]' : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]'}`}>
            {r.map((f, k) => <EventTile key={k} fn={f.fn} main={f.main && !single} past={f.past && variant !== 'completed'} />)}
            {!single && r.length === 1 && <span />}
            {n === 0 ? (itemsTile || <span />) : <span />}
          </div>
        ))}
      </div>

      {/* 3 · documents left; contact, edit and ⋯ right */}
      <div className="mt-3 flex items-center gap-2" data-testid="card-actions">
        {variant === 'draft' && <>
          <DocButton kind="success" icon={L(CheckCircle2)} onClick={on.confirm} testId="btn-confirm">Confirm</DocButton>
          <DocButton icon={FileText} onClick={on.quote} testId="btn-quote">Quote</DocButton>
        </>}
        {(variant === 'confirmed' || variant === 'home') && <>
          <DocButton icon={FileText} onClick={on.quote} testId="btn-quote">Quote</DocButton>
          {on.bill && <DocButton icon={Receipt} onClick={on.bill} testId="btn-bill">Bill</DocButton>}
          {on.contract && <DocButton icon={FileSignature} onClick={on.contract} testId="btn-contract">Contract</DocButton>}
        </>}
        {variant === 'completed' && <>
          <DocButton kind="primary" icon={Receipt} onClick={on.bill} testId="btn-bill">Bill</DocButton>
          {on.jobLog && <DocButton icon={Table2} onClick={on.jobLog} testId="btn-joblog">Job Log</DocButton>}
          <DocButton icon={FileText} onClick={on.quote} testId="btn-quote">Quote</DocButton>
          {on.contract && <DocButton icon={FileSignature} onClick={on.contract} testId="btn-contract">Contract</DocButton>}
        </>}
        <span className="flex-1" />
        {dayOver && <>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-800" data-testid="day-over"><CheckCircle2 size={15} />Event day is over</span>
          <DocButton kind="success" icon={L(CheckCircle2)} onClick={on.markDone} testId="btn-done">Mark as done</DocButton>
          <span className="w-px h-6 bg-bb-border mx-1" />
        </>}
        {phone && <IconButton as="a" href={telLink(phone)} icon={Phone} label="Call" tone="green" size={38} iconSize={17} />}
        {phone && <IconButton as="a" href={waLink(phone)} target="_blank" rel="noopener noreferrer" icon={MessageSquare} label="WhatsApp" tone="green" size={38} iconSize={17} />}
        {on.edit && <IconButton icon={L(Edit3)} label="Edit event" size={38} iconSize={17} onClick={on.edit} data-testid="btn-edit" />}
        {(on.addItems || on.setPrices || on.move || on.delete || (on.markDone && !dayOver)) && (
          <MorePopover>
            {on.addItems && <PopItem icon={L(Plus)} onClick={on.addItems} testId="more-add">Add items</PopItem>}
            {on.setPrices && <PopItem icon={L(Tag)} onClick={on.setPrices} testId="more-prices">Set prices</PopItem>}
            {on.move && <PopItem icon={L(ArrowLeftRight)} onClick={on.move} testId="more-move">Move to…</PopItem>}
            {on.markDone && !dayOver && <PopItem icon={L(CheckCircle2)} onClick={on.markDone} testId="more-done">Mark as done</PopItem>}
            {on.delete && <PopItem icon={L(Trash2)} tone="red" onClick={on.delete} testId="more-delete">Delete event</PopItem>}
          </MorePopover>
        )}
      </div>

      {/* Fold-out: notes, addresses, costs */}
      {open && details && <div className="mt-4 pt-4 border-t border-bb-border" data-testid="card-details">{details}</div>}
    </article>
  );
}

// ============================================================
// EventDetails — the ⌄ fold-out under a laptop card
// ============================================================

export function EventDetails({ ev, onEdit }) {
  const phone = ev.clientPhone || ev.clientWhatsapp;
  const Tile = ({ icon: Icon, label, children, testId }) => (
    <div className="flex items-start gap-3 bg-white border border-bb-border rounded-xl px-3.5 py-3 min-w-0" data-testid={testId}>
      <span className="w-[34px] h-[34px] rounded-[10px] bg-violet-50 text-bb-accent-hover grid place-items-center shrink-0"><Icon size={16} /></span>
      <div className="min-w-0">
        <p className="text-[11.5px] text-bb-muted">{label}</p>
        {children}
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-3" data-testid="event-details">
      <Tile icon={Phone} label="Client contact" testId="detail-contact">
        <b className="block text-[14px] font-semibold text-bb-text mt-px break-words">{ev.clientName}</b>
        {phone && <span className="block text-[12.5px] text-gray-600 mt-0.5">{phone}</span>}
      </Tile>
      <Tile icon={Home} label="Client address" testId="detail-address">
        {ev.clientAddress
          ? <b className="block text-[13.5px] font-medium leading-snug text-bb-text mt-px break-words">{ev.clientAddress}</b>
          : onEdit ? <button onClick={onEdit} className="text-[12.5px] font-semibold text-bb-accent-hover cursor-pointer hover:underline">Add an address</button> : <span className="text-[13px] text-bb-muted">—</span>}
        {ev.houseLocation && <span className="flex items-center gap-1 text-[12.5px] text-gray-600 mt-1"><Navigation size={12} className="shrink-0" />{ev.houseLocation}</span>}
      </Tile>
      <Tile icon={StickyNote} label="Notes" testId="detail-notes">
        {ev.notes
          ? <b className="block text-[13.5px] font-medium leading-snug text-bb-text mt-px whitespace-pre-line break-words">{ev.notes}</b>
          : onEdit ? <button onClick={onEdit} className="text-[12.5px] font-semibold text-bb-accent-hover cursor-pointer hover:underline">Add a note</button> : <span className="text-[13px] text-bb-muted">—</span>}
      </Tile>
    </div>
  );
}
