/**
 * SetPricesSheet — phone "Set prices" for a confirmed / completed event
 *
 * One card per item: the full name (and its event) on its own line, then
 * Qty × Rate ₹ × Days with small headings and the amount at the end. Items
 * without a rate are amber. The final amount sits under the cards and Save
 * prices stays in the footer. The page owns the data (`prices` and saving).
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import BottomSheet from './BottomSheet';
import { NumberBox } from './PhoneUI';
import { itemDays, lineAmount } from '../utils/helpers';

// ============================================================
// SetPricesSheet — MAIN COMPONENT
// ============================================================

/**
 * @param rows     [{ key, name, group }] — the items, in order
 * @param prices   { [key]: { qty, rate, days } }
 * @param onChange (key, patch) — changes one item's qty / rate / days
 */
export default function SetPricesSheet({ title, rows, prices, onChange, onSave, onClose, saving }) {
  const total = rows.reduce((s, r) => s + lineAmount(prices[r.key] || {}), 0);
  const missing = rows.filter(r => !(Number(prices[r.key]?.rate) > 0)).length;
  const rupee = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

  return (
    <BottomSheet open onClose={onClose} title="Set prices" sub={title} testId="set-prices-sheet"
      footer={<div className="flex gap-2.5">
        <button onClick={onClose} className="min-h-[50px] px-5 rounded-xl border border-gray-300 font-semibold cursor-pointer" data-testid="prices-cancel">Cancel</button>
        <button onClick={onSave} disabled={saving} className="flex-1 min-h-[50px] rounded-xl bg-bb-accent text-white font-bold text-[15.5px] cursor-pointer disabled:opacity-60" data-testid="prices-save">{saving ? 'Saving…' : 'Save prices'}</button>
      </div>}>
      <div className="space-y-3 pt-1">
        {missing > 0 && <p className="text-[13px] font-semibold text-amber-800" data-testid="prices-missing">{missing} item{missing === 1 ? '' : 's'} still need{missing === 1 ? 's' : ''} a rate</p>}
        {rows.map(r => {
          const v = prices[r.key] || {};
          const noRate = !(Number(v.rate) > 0);
          return (
            <div key={r.key} className={`rounded-2xl border p-3.5 ${noRate ? 'border-amber-300 bg-amber-50/50' : 'border-bb-border bg-white'}`} data-testid="price-card">
              <p className="font-bold text-[15px] break-words">{r.name}</p>
              {r.group && <p className="text-[12.5px] text-gray-600 mb-2">{r.group}</p>}
              <div className="flex items-end gap-1.5 mt-1.5">
                <div className="w-[56px] shrink-0"><NumberBox label="Qty" value={v.qty ?? 1} align="right" min="1" aria-label={`${r.name} qty`}
                  onChange={e => onChange(r.key, { qty: Number(e.target.value) || 1 })} /></div>
                <span className="pb-3 text-bb-muted">×</span>
                <div className="flex-1 min-w-0"><NumberBox label="Rate ₹" value={v.rate || ''} placeholder="Rate" align="right" min="0" highlight={noRate} aria-label={`${r.name} rate`}
                  onChange={e => onChange(r.key, { rate: Number(e.target.value) || 0 })} /></div>
                <span className="pb-3 text-bb-muted">×</span>
                <div className="w-[56px] shrink-0"><NumberBox label="Days" value={itemDays(v)} align="right" min="1" aria-label={`${r.name} days`}
                  onChange={e => onChange(r.key, { days: Math.max(1, Math.round(Number(e.target.value)) || 1) })} /></div>
              </div>
              <div className="flex items-center justify-between mt-2.5 text-[13px] text-gray-600">
                <span>Amount</span>
                <b className={`text-[16px] tabular-nums ${noRate ? 'text-bb-muted' : 'text-bb-text'}`}>{rupee(lineAmount(v))}</b>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between rounded-2xl bg-violet-50 border border-violet-200 px-4 min-h-[56px]">
          <b className="text-[15px]">Final amount</b>
          <b className="text-[18px] text-bb-accent-hover tabular-nums" data-testid="prices-total">{rupee(total)}</b>
        </div>
      </div>
    </BottomSheet>
  );
}
