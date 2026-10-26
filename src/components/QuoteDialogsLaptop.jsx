/**
 * QuoteDialogsLaptop — the four quotation pop-ups for laptops
 *
 * Fit to budget, Quote versions, Add item and Set prices share one look: a
 * 760px dialog with the title on top, a body that scrolls, and the buttons
 * fixed at the bottom. Phones keep their own bottom sheets (FitBudgetSheet,
 * QuoteRevisionsSheet, AddItemPhoneSheet, SetPricesSheet); the pages choose
 * which to show with useIsPhone(). The maths lives in utils/quoteFit.js.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { X, Lock, Unlock, Check, ChevronDown, ChevronUp, Plus, RotateCcw } from 'lucide-react';
import { formatRupees, buildLineEntries, lineAmount, itemDays } from '../utils/helpers';
import { fitToBudget, ROUND_OPTIONS, DEFAULT_ROUND } from '../utils/quoteFit';

// ============================================================
// HELPERS
// ============================================================
const digits = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};
const BTN = 'min-h-[40px] px-4 rounded-xl text-[14px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default';
const GHOST = `${BTN} border border-gray-300 bg-white hover:bg-gray-50`;
const PRIMARY = `${BTN} bg-bb-accent text-white hover:bg-bb-accent-hover`;
const LABEL = 'text-[10.5px] font-bold uppercase tracking-[0.1em] text-bb-muted';

// ============================================================
// DialogShell — the shared frame
// ============================================================
function DialogShell({ title, sub, onClose, footer, children, testId }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid={testId}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-label={title} className="relative w-full max-w-[760px] max-h-[92dvh] flex flex-col bg-white rounded-2xl shadow-2xl border border-bb-border">
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-bb-border">
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-bb-text leading-tight">{title}</h2>
            {sub && <p className="text-[12.5px] text-bb-muted mt-0.5">{sub}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 rounded-lg flex items-center justify-center text-bb-muted hover:bg-gray-100 cursor-pointer"><X size={20} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-bb-border bg-white rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

// ============================================================
// FitBudgetLaptop
// ============================================================

/** Same props as FitBudgetSheet */
export function FitBudgetLaptop({ units, subtotal, discountNow = 0, gstOn, onApply, onClose }) {
  const [targetText, setTargetText] = useState('');
  const [mode, setMode] = useState('even');
  const [round, setRound] = useState(DEFAULT_ROUND);
  const [locked, setLocked] = useState(() => new Set());
  const [keepRevision, setKeepRevision] = useState(true);

  const target = digits(targetText);
  const result = useMemo(() => fitToBudget(units, target, { locked, round }), [units, target, locked, round]);
  const now = subtotal - discountNow;
  const sections = [...new Set(units.map(u => u.sectionName))];
  const canApply = target > 0 && (mode === 'discount' ? target < subtotal : result.ok);
  const saving = target > 0 ? now - (mode === 'discount' ? Math.min(target, subtotal) : (result.ok ? result.total : now)) : 0;
  const toggleLock = (id) => setLocked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const apply = () => canApply && onApply({ mode, amounts: result.amounts, target, keepRevision });

  return (
    <DialogShell title="Fit to budget" sub="Bring the quote to the client’s number" onClose={onClose} testId="fit-sheet"
      footer={
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2.5 text-[13.5px] cursor-pointer flex-1 min-w-0">
            <span className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center ${keepRevision ? 'bg-bb-accent text-white' : 'border-2 border-gray-300'}`}>{keepRevision && <Check size={14} />}</span>
            <input type="checkbox" className="sr-only" checked={keepRevision} onChange={e => setKeepRevision(e.target.checked)} data-testid="fit-keep" />
            <span className="truncate">Keep the {formatRupees(now)} version as a revision</span>
          </label>
          <button onClick={onClose} className={GHOST}>Cancel</button>
          <button onClick={apply} disabled={!canApply} data-testid="fit-apply" className={PRIMARY}>{mode === 'discount' ? 'Add the discount' : 'Apply new prices'}</button>
        </div>
      }>
      <div className="flex flex-col" style={{ maxHeight: 'calc(92dvh - 130px)' }}>
        {/* Mode, rounding, hint */}
        <div className="px-5 pt-3 pb-2 border-b border-bb-border">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex p-1 rounded-xl bg-gray-100" data-testid="fit-mode">
              {[['even', 'Lower prices evenly'], ['discount', 'Show as discount']].map(([v, l]) => (
                <button key={v} onClick={() => setMode(v)} className={`px-3.5 min-h-[32px] rounded-lg text-[13.5px] font-semibold cursor-pointer ${mode === v ? 'bg-white text-bb-accent-hover shadow-sm' : 'text-gray-600'}`}>{l}</button>
              ))}
            </div>
            <span className="flex-1" />
            {mode === 'even' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] text-gray-600 mr-1">Round to</span>
                {ROUND_OPTIONS.map(r => (
                  <button key={r} onClick={() => setRound(r)} className={`min-h-[30px] px-3 rounded-full border text-[13px] font-semibold cursor-pointer ${round === r ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300'}`}>₹{r.toLocaleString('en-IN')}</button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[12.5px] text-gray-600 mt-2" data-testid="fit-note">
            {mode === 'discount'
              ? 'Prices stay the same. The client sees the discount on the quote.'
              : target > 0 && result.ok
                ? <>Unlocked prices go {result.pct >= 0 ? 'down' : 'up'} by <b className="text-bb-text">{Math.abs(result.pct)}%</b>. Tap 🔒 to keep a price.</>
                : target > 0 ? <span className="text-red-600">{result.reason}</span> : 'Type the budget to see the new prices. Tap 🔒 to keep a price.'}
            {gstOn && ' Before GST — GST is added on top.'}
            {mode === 'even' && discountNow > 0 && <span className="text-amber-800"> The discount now on the quote ({formatRupees(discountNow)}) is taken off — the new prices already include it.</span>}
          </p>
        </div>

        {/* Items */}
        <div className="flex-1 min-h-[120px] overflow-y-auto px-5 pb-2">
          {mode === 'discount' ? (
            <div className="mt-3 rounded-xl bg-gray-50 border border-bb-border px-4 py-3 text-[14.5px] space-y-2 max-w-[420px]" data-testid="fit-discount">
              <div className="flex justify-between"><span>Subtotal</span><b className="tabular-nums">{formatRupees(subtotal)}</b></div>
              <div className="flex justify-between text-emerald-700"><span>Discount</span><b className="tabular-nums">{target > 0 && target < subtotal ? `− ${formatRupees(subtotal - target)}` : '—'}</b></div>
              <div className="flex justify-between pt-2 border-t border-bb-border font-bold"><span>New total</span><b className="tabular-nums">{target > 0 ? formatRupees(Math.min(target, subtotal)) : '—'}</b></div>
            </div>
          ) : sections.map(sec => (
            <div key={sec}>
              {sections.length > 1 && <p className={`${LABEL} pt-3 pb-1`}>{sec}</p>}
              {units.filter(u => u.sectionName === sec).map(u => {
                const isLocked = locked.has(u.id);
                const live = target > 0 && result.ok;
                return (
                  <div key={u.id} className="flex items-center gap-3 min-h-[44px] border-b border-gray-100" data-testid="fit-row">
                    <button onClick={() => toggleLock(u.id)} aria-label={isLocked ? `Unlock ${u.label}` : `Lock ${u.label}`} aria-pressed={isLocked}
                      className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center cursor-pointer ${isLocked ? 'bg-amber-100 text-amber-800' : 'border border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                      {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                    <span className="flex-1 min-w-0 text-[14px] font-semibold truncate">{u.label}{u.kind === 'bundle' && <span className="text-bb-muted font-normal text-[12px]"> · group</span>}</span>
                    {live && !isLocked && <span className="text-[13px] text-bb-muted line-through tabular-nums">{formatRupees(u.amount)}</span>}
                    <b className={`min-w-[84px] text-right tabular-nums ${live && !isLocked ? 'text-bb-accent-hover' : ''}`}>{formatRupees(live ? result.amounts[u.id] : u.amount)}</b>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Now → client's budget (also the new total) */}
        <div className="flex items-center gap-4 px-5 py-3 border-t border-bb-border bg-gray-50/70">
          <div>
            <p className="text-[12.5px] text-gray-600">Now</p>
            <p className="flex items-baseline gap-2"><b className="text-[19px] tabular-nums" data-testid="fit-now">{formatRupees(now)}</b>
              {saving > 0 && <b className="text-[13px] text-emerald-600 tabular-nums">− {formatRupees(saving)}</b>}</p>
          </div>
          <span className="flex-1" />
          <label className="flex items-center gap-3">
            <span className="text-[12.5px] text-gray-600 text-right leading-tight">Client’s budget<br />· new total</span>
            <input value={targetText} onChange={e => setTargetText(e.target.value)} inputMode="numeric" placeholder="e.g. 150000" autoFocus data-testid="fit-target"
              className="w-[170px] min-h-[44px] rounded-xl border-2 border-bb-accent px-3 text-right text-[19px] font-extrabold focus:outline-none focus:ring-2 focus:ring-bb-accent/30" />
          </label>
        </div>
      </div>
    </DialogShell>
  );
}

// ============================================================
// QuoteRevisionsLaptop
// ============================================================

/** What one version held: a table of group · what is inside · price then · price now */
function RevisionTable({ rev, sections, current }) {
  const d = rev.data || {};
  const prices = d.itemPrices || {};
  const curPrices = current.itemPrices || {};
  const curBundles = current.bundles || [];
  const changed = (then, now) => now !== undefined && Math.round(now) !== Math.round(then);
  const rows = [];
  sections.forEach(sec => {
    const names = d.sectionItems?.[sec.id] || [];
    if (!names.length) return;
    if (d.hidePrices) { rows.push({ key: sec.id, head: sec.name, inside: `${names.length} items · one final amount`, then: Number(d.finalAmounts?.[sec.id]) || 0 }); return; }
    buildLineEntries(sec.id, names, d.bundles).forEach(en => {
      if (en.type === 'item') {
        const p = prices[en.key];
        rows.push({ key: en.key, head: en.name, inside: `${Number(p?.qty) || 0} × ${formatRupees(Number(p?.rate) || 0)}${itemDays(p) > 1 ? ` × ${itemDays(p)} days` : ''}`, then: lineAmount(p), now: curPrices[en.key] ? lineAmount(curPrices[en.key]) : undefined });
      } else {
        const b = curBundles.find(x => x.id === en.bundle.id);
        rows.push({ key: en.bundle.id, head: en.bundle.name, group: true, inside: en.bundle.itemKeys.filter(k => k.startsWith(`${sec.id}::`)).map(k => k.slice(sec.id.length + 2)).join(', '), then: Number(en.bundle.amount) || 0, now: b ? Number(b.amount) || 0 : undefined });
      }
    });
  });
  const discount = String(d.quoteDetails?.discount || '').trim();
  return (
    <div className="mt-3 rounded-xl border border-bb-border overflow-hidden" data-testid="revision-view">
      <table className="w-full text-[13px]">
        <thead><tr className="bg-gray-50 text-left"><th className={`${LABEL} px-3 py-2 w-[26%]`}>Group</th><th className={`${LABEL} px-3 py-2`}>What’s inside</th><th className={`${LABEL} px-3 py-2 text-right w-[14%]`}>Then</th><th className={`${LABEL} px-3 py-2 text-right w-[14%]`}>Now</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className="border-t border-gray-100 align-top" data-testid="rev-line">
              <td className={`px-3 py-2 font-bold ${r.group ? 'text-bb-accent-hover' : ''}`}>{r.head}{r.group && <span className="font-medium text-bb-muted text-[11.5px]"> · group</span>}</td>
              <td className="px-3 py-2 text-gray-600">{r.inside}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatRupees(r.then)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${changed(r.then, r.now) ? 'font-bold' : 'text-gray-400'}`} data-testid={changed(r.then, r.now) ? 'rev-now' : undefined}>{r.now === undefined ? '' : formatRupees(r.now)}</td>
            </tr>
          ))}
          <tr className="border-t border-bb-border bg-gray-50 font-bold"><td className="px-3 py-2 font-normal text-gray-600" colSpan={2}>{discount ? `Discount ${discount} · ` : ''}{d.quoteDetails?.gstEnabled ? `GST ${d.quoteDetails.gstRate}% added on the PDF` : 'No GST'}</td><td className="px-3 py-2 text-right tabular-nums" colSpan={2}>{formatRupees(rev.total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/** Same props as QuoteRevisionsSheet */
export function QuoteRevisionsLaptop({ revisions = [], currentTotal, revisedLabel, onToggleRevised, onRestore, onClose, locked = false, sections = [], current = {} }) {
  const [openId, setOpenId] = useState(null);
  return (
    <DialogShell title="Quote versions" sub="Fit to budget and Restore keep the old prices here." onClose={onClose} testId="revisions-sheet"
      footer={
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2.5 text-[13.5px] cursor-pointer flex-1">
            <input type="checkbox" checked={!!revisedLabel} onChange={e => onToggleRevised(e.target.checked)} className="w-[18px] h-[18px] accent-bb-accent" data-testid="revised-toggle" />
            Show “Revised quotation” on the PDF
          </label>
          <button onClick={onClose} className={PRIMARY}>Close</button>
        </div>
      }>
      <div className="px-5 divide-y divide-bb-border">
        <div className="flex items-center gap-3 py-3.5">
          <p className="flex-1 font-bold text-[16px]">Now <span className="ml-1.5 text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Current</span></p>
          <b className="text-[18px] tabular-nums">{formatRupees(currentTotal)}</b>
        </div>
        {revisions.length === 0 && <p className="py-6 text-center text-gray-600">No earlier versions yet. Fit to budget saves one.</p>}
        {revisions.map((r, i) => {
          const open = openId === r.id;
          return (
            <div key={r.id} className="py-3" data-testid="revision-row">
              <div className="flex items-center gap-2.5">
                <button onClick={() => setOpenId(open ? null : r.id)} className="flex-1 min-w-0 text-left cursor-pointer" aria-expanded={open} data-testid="revision-view-btn">
                  <p className="font-bold text-[15.5px]">Revision {revisions.length - i}</p>
                  <p className="text-[12.5px] text-gray-600">{r.label} · <b className="text-bb-text">{formatRupees(r.total)}</b> · {when(r.at)}</p>
                </button>
                <button onClick={() => onRestore(r)} disabled={locked} data-testid="revision-restore" className={`${GHOST} inline-flex items-center gap-1.5`}><RotateCcw size={15} />Restore</button>
                <button onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open} aria-label={open ? 'Hide this version' : 'Show this version'} className="w-10 h-10 rounded-xl border border-gray-300 flex items-center justify-center text-bb-muted hover:bg-gray-50 cursor-pointer">
                  {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
              {open && <RevisionTable rev={r} sections={sections} current={current} />}
            </div>
          );
        })}
      </div>
    </DialogShell>
  );
}

// ============================================================
// AddItemLaptop
// ============================================================

/** Same props as AddItemPhoneSheet */
export function AddItemLaptop({ title, targets, target, onTarget, added, categories, onAdd, onClose }) {
  const [text, setText] = useState('');
  const [openCat, setOpenCat] = useState(() => categories.find(c => (c.items || []).some(i => added.includes(i)))?.id ?? categories[0]?.id);
  const addTyped = () => { const n = text.trim(); if (n && !added.includes(n)) onAdd(n, target); setText(''); };
  const targetName = targets.find(t => t.value === target)?.label;
  return (
    <DialogShell title="Add item" sub={title} onClose={onClose} testId="add-item-sheet"
      footer={<div className="flex items-center gap-3"><p className="flex-1 text-[12.5px] text-bb-muted">Tick a service to add it. Each one saves straight away.</p><button onClick={onClose} className={PRIMARY} data-testid="add-item-done">Done</button></div>}>
      <div className="px-5 py-4 space-y-4">
        {targets.length > 1 && (
          <div className="flex items-center gap-3">
            <label htmlFor="ai-target" className={LABEL}>Add to</label>
            <select id="ai-target" value={target} onChange={e => onTarget(e.target.value)} data-testid="add-item-target" className="min-h-[38px] rounded-xl border border-bb-border bg-bb-input px-3 text-[14px] font-semibold">
              {targets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <p className={`${LABEL} mb-2`}>Added <span className="normal-case tracking-normal font-semibold ml-1">{added.length} {targetName && targets.length > 1 ? `in ${targetName}` : ''}</span></p>
          {added.length === 0 ? <p className="text-[13.5px] text-bb-muted">Nothing yet.</p> : (
            <div className="flex flex-wrap gap-2" data-testid="add-item-added">
              {added.map(n => <span key={n} className="inline-flex items-center gap-1.5 min-h-[30px] px-3 rounded-full bg-violet-50 border border-violet-200 text-bb-accent-hover text-[13px] font-semibold"><Check size={13} />{n}</span>)}
            </div>
          )}
        </div>
        <div>
          <p className={`${LABEL} mb-2`}>Add a service</p>
          <div className="flex gap-2.5">
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTyped()} placeholder="Type a service and press Enter" aria-label="Service name" data-testid="add-item-text"
              className="flex-1 min-w-0 min-h-[42px] rounded-xl border border-bb-border bg-bb-input px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
            <button onClick={addTyped} disabled={!text.trim()} data-testid="add-item-btn" className={`${PRIMARY} inline-flex items-center gap-1.5`}><Plus size={16} />Add</button>
          </div>
        </div>
        <div>
          <p className={`${LABEL} mb-2`}>Pick from the list</p>
          <div className="rounded-xl border border-bb-border overflow-hidden divide-y divide-bb-border">
            {categories.map(cat => {
              const items = cat.items || [];
              const n = items.filter(i => added.includes(i)).length;
              const on = openCat === cat.id;
              return (
                <div key={cat.id}>
                  <button onClick={() => setOpenCat(on ? null : cat.id)} aria-expanded={on} className={`w-full flex items-center gap-2 min-h-[42px] px-3.5 text-left cursor-pointer ${on ? 'bg-gray-50' : ''}`}>
                    <span className="flex-1 font-bold text-[14px]">{cat.icon} {cat.name}</span>
                    {n > 0 && <span className="text-[12px] font-bold text-bb-accent-hover">{n} added</span>}
                    <ChevronDown size={16} className={`text-bb-muted transition-transform ${on ? 'rotate-180' : ''}`} />
                  </button>
                  {on && (
                    <div className="grid grid-cols-3 gap-x-2 px-3 py-2">
                      {items.map(item => {
                        const has = added.includes(item);
                        return (
                          <button key={item} onClick={() => !has && onAdd(item, target)} disabled={has} aria-pressed={has} className="flex items-center gap-2 min-h-[36px] px-1 text-left text-[13.5px] cursor-pointer disabled:cursor-default">
                            <span className={`w-[18px] h-[18px] shrink-0 rounded-[5px] border flex items-center justify-center ${has ? 'bg-bb-accent border-bb-accent text-white' : 'border-gray-300 bg-white'}`}>{has && <Check size={12} />}</span>
                            <span className={`min-w-0 break-words ${has ? 'font-semibold' : ''}`}>{item}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DialogShell>
  );
}

// ============================================================
// SetPricesLaptop
// ============================================================

const CELL = 'w-[80px] min-h-[36px] rounded-lg border border-bb-border bg-white px-2 text-right text-[14px] tabular-nums focus:outline-none focus:ring-2 focus:ring-bb-accent/30';

/** Same props as SetPricesSheet: rows [{ key, name, group }], prices {key:{qty,rate,days}} */
export function SetPricesLaptop({ title, rows, prices, onChange, onSave, onClose }) {
  const total = rows.reduce((s, r) => s + lineAmount(prices[r.key]), 0);
  const missing = rows.filter(r => !(Number(prices[r.key]?.rate) > 0)).length;
  const multi = rows.some(r => r.group);
  return (
    <DialogShell title="Set prices" sub={`${title} · ${rows.length} item${rows.length === 1 ? '' : 's'}. Fill the rate and the amount works itself out.`} onClose={onClose} testId="set-prices-sheet"
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1">{missing > 0 && <span className="inline-block text-[12.5px] font-bold text-amber-800 bg-amber-100 rounded-full px-3 py-1" data-testid="prices-missing">{missing} item{missing === 1 ? '' : 's'} still need{missing === 1 ? 's' : ''} a rate</span>}</div>
          <button onClick={onClose} className={GHOST}>Cancel</button>
          <button onClick={onSave} className={PRIMARY} data-testid="set-prices-save">Save prices</button>
        </div>
      }>
      <div className="px-5 pb-2">
        <div className="grid grid-cols-[1fr_80px_80px_80px_96px] gap-3 items-center py-2 border-b border-bb-border sticky top-0 bg-white z-10">
          {['Item', 'Qty', 'Rate ₹', 'Days', 'Amount'].map((h, i) => <span key={h} className={`${LABEL} ${i ? 'text-right' : ''}`}>{h}</span>)}
        </div>
        {rows.map(r => {
          const p = prices[r.key] || {};
          const none = !(Number(p.rate) > 0);
          return (
            <div key={r.key} className={`grid grid-cols-[1fr_80px_80px_80px_96px] gap-3 items-center py-1.5 border-b border-gray-100 -mx-5 px-5 ${none ? 'bg-amber-50' : ''}`} data-testid="price-row">
              <span className="min-w-0 text-[14px]">{r.name}{multi && r.group && <span className="block text-[11.5px] text-bb-muted">{r.group}</span>}</span>
              <input type="number" min="1" aria-label={`${r.name} quantity`} value={p.qty ?? 1} onChange={e => onChange(r.key, { qty: Number(e.target.value) || 1 })} className={CELL} />
              <input type="number" min="0" placeholder="Rate" aria-label={`${r.name} rate`} value={p.rate || ''} onChange={e => onChange(r.key, { rate: Number(e.target.value) || 0 })} className={`${CELL} ${none ? '!border-amber-500' : ''}`} />
              <input type="number" min="1" aria-label={`${r.name} days`} value={itemDays(p)} onChange={e => onChange(r.key, { days: Math.max(1, Math.round(Number(e.target.value)) || 1) })} className={CELL} />
              <b className={`text-right tabular-nums text-[14px] ${none ? 'text-amber-700' : ''}`}>{formatRupees(lineAmount(p))}</b>
            </div>
          );
        })}
        <div className="grid grid-cols-[1fr_96px] gap-3 items-center pt-3 pb-1 border-t-2 border-bb-border mt-1">
          <span className="text-right text-[12.5px] text-bb-muted">Final amount</span>
          <b className="text-right text-[18px] tabular-nums" data-testid="set-prices-total">{formatRupees(total)}</b>
        </div>
      </div>
    </DialogShell>
  );
}
