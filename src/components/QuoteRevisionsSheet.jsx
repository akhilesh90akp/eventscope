/**
 * QuoteRevisionsSheet — earlier versions of a quotation's prices
 *
 * Fit to budget (and Restore) keep the prices from before as a revision on
 * the event (event.quoteRevisions — see utils/quoteFit.js). This lists them,
 * newest first, with Restore; restoring keeps today's prices as a revision
 * too, so nothing is lost. Also holds the "Revised quotation" PDF switch.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { RotateCcw } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { formatRupees } from '../utils/helpers';

// ============================================================
// HELPERS
// ============================================================
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

// ============================================================
// QuoteRevisionsSheet — MAIN COMPONENT
// ============================================================

export default function QuoteRevisionsSheet({ revisions = [], currentTotal, revisedLabel, onToggleRevised, onRestore, onClose, locked = false }) {
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
        {revisions.map((r, i) => (
          <div key={r.id} className="flex items-center gap-3 py-3.5" data-testid="revision-row">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[16px]">Revision {revisions.length - i}</p>
              <p className="text-[13px] text-gray-600 truncate">{r.label} · {formatRupees(r.total)} · {when(r.at)}</p>
            </div>
            <button onClick={() => onRestore(r)} disabled={locked} data-testid="revision-restore"
              className="min-h-[42px] px-3 rounded-xl border border-gray-300 bg-white font-semibold text-[14px] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40">
              <RotateCcw size={16} />Restore
            </button>
          </div>
        ))}
      </div>
      <label className="mt-3 flex items-center justify-between gap-3 min-h-[52px] border-t border-bb-border pt-2 cursor-pointer">
        <span className="text-[15px]">Show “Revised quotation” on the PDF</span>
        <input type="checkbox" checked={!!revisedLabel} onChange={e => onToggleRevised(e.target.checked)} className="w-5 h-5 accent-bb-accent" data-testid="revised-toggle" />
      </label>
    </BottomSheet>
  );
}
