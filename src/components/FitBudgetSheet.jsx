/**
 * FitBudgetSheet — "Fit to budget" for a quotation
 *
 * The client has a number in mind (e.g. ₹1,50,000 for a ₹2,26,250 quote).
 * Type it, then either lower every price evenly (rounded; lock what can't
 * change) or show the difference as a discount. The preview lists every
 * price line old → new before anything changes; Apply hands the result back
 * to the quote, which keeps the old prices as a revision (Undo / Restore).
 * Math: utils/quoteFit.js. Bottom sheet on phones, a dialog on laptops.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo, useState } from 'react';
import { Lock, Unlock, Check } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { SegmentedTabs } from './PhoneUI';
import { formatRupees } from '../utils/helpers';
import { fitToBudget, ROUND_OPTIONS, DEFAULT_ROUND } from '../utils/quoteFit';

// ============================================================
// HELPERS
// ============================================================
const digits = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;

// ============================================================
// FitBudgetSheet — MAIN COMPONENT
// ============================================================

/**
 * @param units      price lines (quoteFit.fitUnits)
 * @param subtotal   the quote's total before discount and GST
 * @param discountNow  the discount already on the quote (removed by "Lower prices evenly")
 * @param gstOn      GST is added on top (shown as a note)
 * @param onApply    ({ mode: 'even'|'discount', amounts, target, keepRevision }) => void
 */
export default function FitBudgetSheet({ units, subtotal, discountNow = 0, gstOn, onApply, onClose }) {
  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [targetText, setTargetText] = useState('');
  const [mode, setMode] = useState('even');
  const [round, setRound] = useState(DEFAULT_ROUND);
  const [locked, setLocked] = useState(() => new Set());
  const [keepRevision, setKeepRevision] = useState(true);

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------
  const target = digits(targetText);
  const result = useMemo(() => fitToBudget(units, target, { locked, round }), [units, target, locked, round]);
  const discount = Math.max(0, subtotal - target);
  const sections = [...new Set(units.map(u => u.sectionName))];
  const canApply = target > 0 && (mode === 'discount' ? target < subtotal : result.ok);

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const toggleLock = (id) => setLocked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const apply = () => canApply && onApply({ mode, amounts: result.amounts, target, keepRevision });

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const ready = target > 0 && result.ok;
  return (
    <BottomSheet open onClose={onClose} title="Fit to budget" testId="fit-sheet"
      footer={<div>
        {/* Now → client's budget (always in view) */}
        <div className="grid grid-cols-[1fr_1.25fr] gap-3 items-end">
          <div>
            <p className="text-[13px] text-gray-600">Now</p>
            <p className={`text-[19px] font-extrabold tabular-nums ${target > 0 ? 'line-through text-bb-muted' : 'text-bb-text'}`} data-testid="fit-now">{formatRupees(subtotal - discountNow)}</p>
            {mode === 'even' && ready && subtotal - discountNow - result.total > 0 && <p className="text-[12.5px] font-semibold text-emerald-700" data-testid="fit-saved">− {formatRupees(Math.max(0, subtotal - discountNow - result.total))} saved</p>}
          </div>
          <label className="block">
            <span className="text-[13px] text-gray-600">Client’s budget</span>
            <input value={targetText} onChange={e => setTargetText(e.target.value)} inputMode="numeric" placeholder="e.g. 150000" autoFocus
              data-testid="fit-target"
              className="mt-1 w-full min-h-[48px] rounded-xl border-2 border-bb-accent px-3 text-[19px] font-extrabold text-bb-text focus:outline-none focus:ring-2 focus:ring-bb-accent/30" />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-3 min-h-[40px] text-[14px] cursor-pointer">
          <span className={`w-6 h-6 rounded-md flex items-center justify-center ${keepRevision ? 'bg-bb-accent text-white' : 'border-2 border-gray-300'}`}>{keepRevision && <Check size={16} />}</span>
          <input type="checkbox" className="sr-only" checked={keepRevision} onChange={e => setKeepRevision(e.target.checked)} data-testid="fit-keep" />
          Keep the {formatRupees(subtotal - discountNow)} version as a revision
        </label>
        <div className="flex gap-2.5 mt-1">
          <button onClick={onClose} className="flex-1 min-h-[46px] rounded-xl border border-gray-300 font-semibold cursor-pointer">Cancel</button>
          <button onClick={apply} disabled={!canApply} data-testid="fit-apply"
            className="flex-[1.8] min-h-[46px] rounded-xl bg-bb-accent text-white font-semibold cursor-pointer disabled:opacity-40">
            {mode === 'discount' ? 'Add the discount' : 'Apply new prices'}
          </button>
        </div>
      </div>}>
      {/* Mode, rounding and the hint stay at the top while the list scrolls */}
      <div className="sticky top-0 z-10 bg-white -mx-5 px-5 pb-2 -mt-2 pt-2">
        <SegmentedTabs value={mode} onChange={setMode} testId="fit-mode"
          options={[{ value: 'even', label: 'Lower prices evenly' }, { value: 'discount', label: 'Show as discount' }]} />
        {mode === 'even' && (
          <>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-[13px] text-gray-600 mr-1">Round to</span>
              {ROUND_OPTIONS.map(r => (
                <button key={r} onClick={() => setRound(r)}
                  className={`min-h-[34px] px-3 rounded-full border text-[13px] font-semibold cursor-pointer ${round === r ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300'}`}>
                  ₹{r.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
            <p className="text-[13px] text-gray-600 mt-2.5" data-testid="fit-note">
              {target > 0 && result.ok
                ? <>Unlocked prices go {result.pct >= 0 ? 'down' : 'up'} by <b className="text-bb-text">{Math.abs(result.pct)}%</b>. Tap 🔒 to keep a price.{gstOn ? ' Before GST.' : ''}</>
                : target > 0 ? <span className="text-red-600">{result.reason}</span> : <>Type the budget to see the new prices. Tap 🔒 to keep a price.{gstOn ? ' Before GST.' : ''}</>}
            </p>
          </>
        )}
        {mode === 'discount' && gstOn && <p className="text-[13px] text-gray-600 mt-2.5">Before GST — GST is added on top of this.</p>}
      </div>

      {mode === 'discount' ? (
        <div className="mt-2 rounded-xl bg-gray-50 border border-bb-border px-4 py-3 text-[15px] space-y-2" data-testid="fit-discount">
          <div className="flex justify-between"><span>Subtotal</span><b className="tabular-nums">{formatRupees(subtotal)}</b></div>
          <div className="flex justify-between text-emerald-700"><span>Discount</span><b className="tabular-nums">{target > 0 && target < subtotal ? `− ${formatRupees(discount)}` : '—'}</b></div>
          <div className="flex justify-between pt-2 border-t border-bb-border font-bold"><span>New total</span><b className="tabular-nums">{target > 0 ? formatRupees(Math.min(target, subtotal)) : '—'}</b></div>
          <p className="text-[12.5px] text-gray-600">Prices stay the same. The client sees the discount on the quote.</p>
        </div>
      ) : (
        <>
          {discountNow > 0 && <p className="text-[12.5px] text-amber-800 mt-1">The discount now on the quote ({formatRupees(discountNow)}) is taken off — the new prices already include it.</p>}
          <div className="border-t border-bb-border">
            {sections.map(sec => (
              <div key={sec}>
                {sections.length > 1 && <p className="text-[12px] font-bold tracking-wider uppercase text-bb-muted pt-3 pb-1">{sec}</p>}
                {units.filter(u => u.sectionName === sec).map(u => {
                  const isLocked = locked.has(u.id);
                  const next = result.amounts[u.id];
                  return (
                    <div key={u.id} className="flex items-center gap-2.5 min-h-[52px] py-1 border-b border-bb-border" data-testid="fit-row">
                      <button onClick={() => toggleLock(u.id)} aria-label={isLocked ? `Unlock ${u.label}` : `Lock ${u.label}`} aria-pressed={isLocked}
                        className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center cursor-pointer ${isLocked ? 'bg-amber-100 text-amber-800' : 'border border-dashed border-gray-300 text-gray-400'}`}>
                        {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                      </button>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14.5px] font-semibold truncate">{u.label}</span>
                        {u.kind === 'bundle' && <span className="block text-[12px] text-bb-muted truncate">Group{u.inside?.length ? ` · ${u.inside.join(', ')}` : ''}</span>}
                      </span>
                      {ready && !isLocked && <span className="text-[13px] text-bb-muted line-through tabular-nums">{formatRupees(u.amount)}</span>}
                      <b className={`min-w-[78px] text-right tabular-nums ${!isLocked && ready ? 'text-bb-accent-hover' : ''}`}>
                        {formatRupees(ready ? next : u.amount)}
                      </b>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </BottomSheet>
  );
}
