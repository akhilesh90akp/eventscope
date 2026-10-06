/**
 * CostsPanel — costs & income for one completed event
 *
 * Edits the same tenants/{id}/financials/{eventId} values as the Job Log
 * grid, so changes here show in the Job Log (and vice versa) live.
 * Staff can see and edit costs; profit is only shown to the owner.
 * Each field saves when you leave it.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getEventRevenue, computeEventFinancials, parseMoney, openJobLog } from '../utils/helpers';
import { ExternalLink } from 'lucide-react';

// ============================================================
// HELPERS
// ============================================================
const rupees = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

// ============================================================
// CostsPanel — MAIN COMPONENT
// ============================================================

export default function CostsPanel({ event }) {
  const { jobLogColumns, financials, saveFinancials, isOwner, canEditEvents, showToast } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [drafts, setDrafts] = useState({});   // { columnId: text being typed }
  const [saving, setSaving] = useState(false);

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------
  const values = financials[event.id]?.values || {};
  const revenue = getEventRevenue(event);
  const calc = computeEventFinancials(revenue, values, jobLogColumns);
  const ordered = [
    ...jobLogColumns.filter(c => c.type === 'cost' || !c.type),
    ...jobLogColumns.filter(c => c.type === 'income'),
    ...jobLogColumns.filter(c => c.type === 'text'),
  ];

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------

  /** Saves one field when the user leaves it */
  const commit = async (col) => {
    if (!(col.id in drafts)) return;
    const text = drafts[col.id];
    setDrafts(d => { const n = { ...d }; delete n[col.id]; return n; });
    if (col.type === 'text') {
      const value = text.trim() || null;
      if (value === (values[col.id] || null)) return;
      setSaving(true);
      await saveFinancials([{ eventId: event.id, columnId: col.id, value }]);
      setSaving(false);
      return;
    }
    const value = parseMoney(text);
    if (text.trim() !== '' && value === null) {
      showToast(`“${text}” isn’t a number — not saved`, 'error');
      return;
    }
    const current = values[col.id];
    if (value === (current === null || current === undefined ? null : Number(current))) return;
    setSaving(true);
    await saveFinancials([{ eventId: event.id, columnId: col.id, value }]);
    setSaving(false);
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="rounded-lg border border-bb-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-bold text-bb-muted uppercase tracking-wide">Costs &amp; income</p>
        <span className="flex-1" />
        <span className="text-[11px] text-emerald-600">{saving ? 'Saving…' : 'Saves automatically · also in Job Log'}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ordered.map(col => {
          const stored = values[col.id];
          const isText = col.type === 'text';
          const shown = col.id in drafts ? drafts[col.id]
            : (stored === null || stored === undefined ? '' : isText ? stored : Number(stored).toLocaleString('en-IN'));
          return (
            <label key={col.id} className={`block ${isText ? 'col-span-2 sm:col-span-4' : ''}`}>
              <span className="block text-[11px] font-semibold text-gray-600 mb-1">{col.label}</span>
              <div className={`flex items-center rounded-lg border h-9 px-2 ${col.type === 'income' ? 'bg-emerald-50 border-emerald-200' : 'bg-bb-input border-bb-border'} focus-within:ring-2 focus-within:ring-bb-accent`}>
                {!isText && <span className="text-bb-muted text-sm mr-1">₹</span>}
                <input
                  inputMode={isText ? 'text' : 'decimal'}
                  disabled={!canEditEvents}
                  value={shown}
                  placeholder="—"
                  onFocus={() => setDrafts(d => ({ ...d, [col.id]: stored === null || stored === undefined ? '' : String(stored) }))}
                  onChange={e => setDrafts(d => ({ ...d, [col.id]: e.target.value }))}
                  onBlur={() => commit(col)}
                  onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                  className="w-full bg-transparent outline-none text-sm tabular-nums"
                />
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-2 border-t border-bb-border text-sm">
        <span>Bill total <b>{rupees(revenue)}</b></span>
        <span>Total cost <b>{rupees(calc.totalCost)}</b></span>
        {isOwner && calc.hasAny && (
          <span>Profit <b className={calc.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>{rupees(calc.profit)}</b>
            {calc.margin !== null && <span className="text-bb-muted"> · {calc.margin}%</span>}
          </span>
        )}
        {isOwner && (
          <button onClick={openJobLog} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-bb-accent hover:underline cursor-pointer">
            Open Job Log <ExternalLink size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
