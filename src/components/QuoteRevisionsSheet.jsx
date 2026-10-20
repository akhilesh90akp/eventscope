/**
 * QuoteRevisionsSheet — earlier versions of a quotation's prices
 *
 * Fit to budget (and Restore) keep the prices from before as a revision on
 * the event (event.quoteRevisions — see utils/quoteFit.js). This lists them,
 * newest first. View opens a version's items and prices (with today's price
 * beside any line that has changed since); Restore puts it back and keeps
 * today's prices as a version too, so nothing is lost. Also holds the
 * "Revised quotation" PDF switch.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { formatRupees, buildLineEntries, lineAmount, itemDays } from '../utils/helpers';

// ============================================================
// HELPERS
// ============================================================
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

const qtyText = (p) => `${Number(p?.qty) || 0} × ${formatRupees(Number(p?.rate) || 0)}${itemDays(p) > 1 ? ` × ${itemDays(p)} days` : ''}`;

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** One amount; when today's differs, today's shows under it */
function Amount({ then, now }) {
  const changed = now !== undefined && Math.round(now) !== Math.round(then);
  return (
    <span className="shrink-0 text-right tabular-nums">
      <b className="block text-[14.5px]">{formatRupees(then)}</b>
      {changed && <span className="block text-[12px] text-gray-500" data-testid="rev-now">now {formatRupees(now)}</span>}
    </span>
  );
}

/** What one saved version holds: per event, its items (and groups) with prices */
function RevisionView({ rev, sections, current }) {
  const d = rev.data || {};
  const prices = d.itemPrices || {};
  const curPrices = current.itemPrices || {};
  const curBundles = current.bundles || [];
  const discount = String(d.quoteDetails?.discount || '').trim();
  return (
    <div className="mb-3 rounded-2xl border border-bb-border bg-bb-input/60 px-3.5 py-2" data-testid="revision-view">
      {sections.map(sec => {
        const names = d.sectionItems?.[sec.id] || [];
        if (!names.length) return null;
        const entries = buildLineEntries(sec.id, names, d.bundles);
        return (
          <div key={sec.id} className="py-2">
            {sections.length > 1 && <p className="text-[12px] font-bold uppercase tracking-wider text-bb-muted pb-1">{sec.name}</p>}
            {d.hidePrices ? (
              <div className="flex items-start gap-3 py-1.5">
                <span className="flex-1 text-[14px]">{names.length} items · one final amount</span>
                <Amount then={Number(d.finalAmounts?.[sec.id]) || 0} />
              </div>
            ) : entries.map(en => (en.type === 'item' ? (
              <div key={en.key} className="flex items-start gap-3 py-1.5 border-b border-bb-border/70 last:border-b-0" data-testid="rev-line">
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold break-words">{en.name}</span>
                  <span className="block text-[12px] text-gray-500">{qtyText(prices[en.key])}</span>
                </span>
                <Amount then={lineAmount(prices[en.key])} now={curPrices[en.key] ? lineAmount(curPrices[en.key]) : undefined} />
              </div>
            ) : (
              <div key={en.bundle.id} className="flex items-start gap-3 py-1.5 border-b border-bb-border/70 last:border-b-0" data-testid="rev-line">
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-bold text-bb-accent-hover break-words">{en.bundle.name} <span className="font-medium text-gray-500">· group</span></span>
                  <span className="block text-[12px] text-gray-500">{en.bundle.itemKeys.filter(k => k.startsWith(`${sec.id}::`)).map(k => k.slice(sec.id.length + 2)).join(', ')}</span>
                </span>
                <Amount then={Number(en.bundle.amount) || 0} now={(() => { const b = curBundles.find(x => x.id === en.bundle.id); return b ? Number(b.amount) || 0 : undefined; })()} />
              </div>
            )))}
          </div>
        );
      })}
      <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-bb-border text-[14px]">
        <span className="text-gray-600">{discount ? `Discount ${discount} · ` : ''}{d.quoteDetails?.gstEnabled ? `GST ${d.quoteDetails.gstRate}% added on the PDF` : 'No GST'}</span>
        <b className="tabular-nums">{formatRupees(rev.total)}</b>
      </div>
    </div>
  );
}

// ============================================================
// QuoteRevisionsSheet — MAIN COMPONENT
// ============================================================

export default function QuoteRevisionsSheet({ revisions = [], currentTotal, revisedLabel, onToggleRevised, onRestore, onClose, locked = false, sections = [], current = {} }) {
  const [openId, setOpenId] = useState(null);
  return (
    <BottomSheet open onClose={onClose} title="Quote versions" sub="Fit to budget and Restore keep the old prices here." testId="revisions-sheet">
      <div className="divide-y divide-bb-border">
        <div className="flex items-center gap-3 py-3.5">
          <div className="flex-1">
            <p className="font-bold text-[16px]">Now <span className="ml-1 text-[12px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Current</span></p>
            <p className="text-[13px] text-gray-600">{formatRupees(currentTotal)}</p>
          </div>
        </div>
        {revisions.length === 0 && <p className="py-5 text-center text-gray-600">No earlier versions yet. Fit to budget saves one.</p>}
        {revisions.map((r, i) => {
          const open = openId === r.id;
          return (
            <div key={r.id} data-testid="revision-row">
              <div className="flex items-center gap-2.5 py-3.5">
                <button onClick={() => setOpenId(open ? null : r.id)} className="flex-1 min-w-0 text-left cursor-pointer" aria-expanded={open}>
                  <p className="font-bold text-[16px]">Revision {revisions.length - i}</p>
                  <p className="text-[13px] text-gray-600">{r.label} · <b className="text-bb-text">{formatRupees(r.total)}</b></p>
                  <p className="text-[12.5px] text-gray-500">{when(r.at)}</p>
                </button>
                <button onClick={() => setOpenId(open ? null : r.id)} data-testid="revision-view-btn" aria-expanded={open}
                  className="min-h-[42px] px-3 rounded-xl border border-gray-300 bg-white font-semibold text-[14px] inline-flex items-center gap-1 cursor-pointer">
                  {open ? <>Hide<ChevronUp size={16} /></> : <>View<ChevronDown size={16} /></>}
                </button>
                <button onClick={() => onRestore(r)} disabled={locked} data-testid="revision-restore"
                  className="min-h-[42px] px-3 rounded-xl border border-gray-300 bg-white font-semibold text-[14px] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40">
                  <RotateCcw size={16} />Restore
                </button>
              </div>
              {open && <RevisionView rev={r} sections={sections} current={current} />}
            </div>
          );
        })}
      </div>
      <label className="mt-3 flex items-center justify-between gap-3 min-h-[52px] border-t border-bb-border pt-2 cursor-pointer">
        <span className="text-[15px]">Show “Revised quotation” on the PDF</span>
        <input type="checkbox" checked={!!revisedLabel} onChange={e => onToggleRevised(e.target.checked)} className="w-5 h-5 accent-bb-accent" data-testid="revised-toggle" />
      </label>
    </BottomSheet>
  );
}
