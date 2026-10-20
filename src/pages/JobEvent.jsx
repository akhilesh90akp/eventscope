/**
 * JobEvent — the Job Log of ONE completed event, built for phones
 *
 * Opened from "Job Log" on a completed event card (/job/:eventId). The full
 * Job Log (every event in one wide spreadsheet) stays a laptop page; this is
 * the same data — tenants/{id}/financials/{eventId} — so the two stay in sync.
 *   - summary: revenue, costs, profit and margin (owners; staff see costs only)
 *   - from the bill (read only): revenue before GST, GST, bill total, received, balance
 *   - your cost / income columns (Settings → Job Log columns); sums like
 *     "4000+2500" work, like in the Job Log, and the result shows underneath
 *   - text columns (e.g. a note)
 * Each field saves when you leave it (AppContext.saveFinancials).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import ActionBar from '../components/ActionBar';
import Button from '../components/Button';
import UpgradeCard from '../components/UpgradeCard';
import { SectionLabel } from '../components/PhoneUI';
import { usePhoneHeader } from '../components/phoneScreens';
import { getEventBill, computeEventFinancials, parseMoneyExpr, formatRupees, formatDateReadable } from '../utils/helpers';

// ============================================================
// JobEvent — MAIN COMPONENT
// ============================================================

export default function JobEvent() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { events, jobLogColumns, financials, saveFinancials, isOwner, canEditEvents, showToast, canUse } = useApp();
  const event = events.find(e => e.id === eventId);

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [drafts, setDrafts] = useState({});   // { columnId: text being typed }
  const [saving, setSaving] = useState(false);

  usePhoneHeader({ sub: event ? [event.clientName, event.eventType, formatDateReadable(event.mainEvent?.date || event.date)].filter(Boolean).join(' · ') : '' }, [event?.id]);

  if (!canUse('jobLog')) return <UpgradeCard feature="jobLog" text="Add each event’s costs and see your real profit, event by event." />;
  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-bb-muted">Event not found</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/completed')}>Completed events</Button>
      </div>
    );
  }

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------
  const fin = financials[event.id] || {};
  const values = fin.values || {};
  const formulas = fin.formulas || {};
  const bill = getEventBill(event);
  const calc = computeEventFinancials(bill.revenue, values, jobLogColumns);
  const money = jobLogColumns.filter(c => c.type !== 'text');
  const texts = jobLogColumns.filter(c => c.type === 'text');
  const costShare = bill.revenue > 0 ? Math.min(100, Math.round((calc.totalCost / bill.revenue) * 100)) : 0;

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------

  /** Saves one field when you leave it (sums keep their formula, like the Job Log) */
  const commit = async (col) => {
    if (!(col.id in drafts)) return;
    const text = drafts[col.id];
    setDrafts(d => { const n = { ...d }; delete n[col.id]; return n; });
    let change;
    if (col.type === 'text') {
      const value = text.trim() || null;
      if (value === (values[col.id] || null)) return;
      change = { eventId: event.id, columnId: col.id, value };
    } else {
      const parsed = parseMoneyExpr(text);
      if (!parsed) { showToast(`“${text}” isn’t a number or a sum — not saved`, 'error'); return; }
      const cur = values[col.id];
      if (parsed.value === (cur === null || cur === undefined ? null : Number(cur)) && parsed.formula === (formulas[col.id] || null)) return;
      change = { eventId: event.id, columnId: col.id, value: parsed.value, formula: parsed.formula };
    }
    setSaving(true);
    await saveFinancials([change]);
    setSaving(false);
  };

  const shownText = (col) => {
    if (col.id in drafts) return drafts[col.id];
    const v = values[col.id];
    if (v === null || v === undefined) return '';
    return col.type === 'text' ? v : (formulas[col.id] || Number(v).toLocaleString('en-IN'));
  };
  const startEdit = (col) => setDrafts(d => ({ ...d, [col.id]: col.type === 'text' ? (values[col.id] || '') : (formulas[col.id] || (values[col.id] ?? '')) + '' }));

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const Row = ({ label, value, className = '' }) => (
    <div className={`flex justify-between py-2.5 text-[15px] ${className}`}><span>{label}</span><b className="tabular-nums">{value}</b></div>
  );
  return (
    <div className="space-y-5" data-testid="job-event">
      {/* Summary */}
      <div className="bg-white border border-bb-border rounded-2xl p-[18px]">
        <div className={`grid ${isOwner ? 'grid-cols-3' : 'grid-cols-2'} gap-2 text-center`}>
          <div><p className="text-[13px] text-gray-600">Revenue</p><b className="text-[17px] text-bb-gold tabular-nums">{formatRupees(bill.revenue)}</b></div>
          <div><p className="text-[13px] text-gray-600">Costs</p><b className="text-[17px] text-red-600 tabular-nums" data-testid="job-costs">{formatRupees(calc.totalCost)}</b></div>
          {isOwner && <div><p className="text-[13px] text-gray-600">Profit</p><b className={`text-[17px] tabular-nums ${calc.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} data-testid="job-profit">{calc.hasAny ? formatRupees(calc.profit) : '—'}</b></div>}
        </div>
        {isOwner && calc.hasAny && bill.revenue > 0 && (
          <>
            <div className="h-2.5 rounded-full bg-red-100 mt-4 mb-1.5 overflow-hidden"><div className="h-full bg-red-300" style={{ width: `${costShare}%` }} /></div>
            <p className="text-[13px] text-gray-600 text-center">Costs are {costShare}% of revenue{calc.margin !== null && <> · margin <b className="text-emerald-700">{calc.margin}%</b></>}</p>
          </>
        )}
        {!calc.hasAny && <p className="text-[13px] text-amber-800 text-center mt-3">No expenses yet — add them below to see this event’s profit.</p>}
      </div>

      <SectionLabel right={<span className="text-[12.5px] text-gray-600 normal-case tracking-normal font-medium">read only</span>}>From the bill</SectionLabel>
      <div className="bg-white border border-bb-border rounded-2xl px-[18px] py-1.5">
        <Row label="Revenue (before GST)" value={formatRupees(bill.revenue)} />
        <Row label="GST" value={formatRupees(bill.gst)} />
        <Row label="Bill total" value={formatRupees(bill.billTotal)} />
        <Row label="Received" value={formatRupees(bill.advance)} />
        <Row label="Balance due" value={formatRupees(bill.balance)} className={bill.balance > 0 ? 'text-red-600' : ''} />
      </div>

      <SectionLabel right={<span className="text-[12.5px] text-emerald-700 normal-case tracking-normal font-medium">{saving ? 'Saving…' : 'Saves by itself'}</span>}>Costs &amp; income</SectionLabel>
      <div className="bg-white border border-bb-border rounded-2xl px-[18px] py-1.5">
        {money.length === 0 && <p className="py-4 text-[14px] text-gray-600">No cost columns yet — add them in Settings → Job Log columns.</p>}
        {money.map(col => {
          const formula = !(col.id in drafts) && formulas[col.id];
          return (
            <label key={col.id} className="block py-3 border-b border-bb-border last:border-b-0">
              <span className="flex items-center gap-3">
                <span className="flex-1 min-w-0 text-[15px] font-semibold">{col.label}{col.type === 'income' && <span className="ml-1.5 text-[11.5px] font-bold px-1.5 py-px rounded-full bg-emerald-100 text-emerald-800">income</span>}</span>
                <input inputMode="decimal" disabled={!canEditEvents} value={shownText(col)} placeholder="0" aria-label={col.label} data-testid={`job-${col.id}`}
                  onFocus={() => startEdit(col)} onChange={e => setDrafts(d => ({ ...d, [col.id]: e.target.value }))}
                  onBlur={() => commit(col)} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                  className={`w-[150px] min-h-[46px] rounded-xl border px-3 text-right text-[16px] tabular-nums focus:outline-none focus:ring-2 focus:ring-bb-accent/40 ${col.type === 'income' ? 'bg-emerald-50 border-emerald-200' : 'bg-bb-input border-bb-border'}`} />
              </span>
              {formula && <span className="block text-right text-[12.5px] text-gray-600 mt-1">= {formatRupees(values[col.id])}</span>}
            </label>
          );
        })}
        {money.length > 0 && <Row label={<b>Total costs</b>} value={formatRupees(calc.totalCost)} className="border-t-2 border-bb-border mt-1" />}
      </div>

      {texts.map(col => (
        <div key={col.id} className="space-y-2.5">
          <SectionLabel>{col.label}</SectionLabel>
          <div className="bg-white border border-bb-border rounded-2xl p-[18px]">
            <textarea disabled={!canEditEvents} value={shownText(col)} placeholder="—" aria-label={col.label} rows={3}
              onFocus={() => startEdit(col)} onChange={e => setDrafts(d => ({ ...d, [col.id]: e.target.value }))} onBlur={() => commit(col)}
              className="w-full rounded-xl border border-bb-border bg-bb-input px-3.5 py-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
          </div>
        </div>
      ))}
      <p className="text-center text-[13px] text-gray-600">Columns come from Settings → Job Log columns. The full spreadsheet of every event is on a laptop.</p>

      <ActionBar label={isOwner ? 'Profit' : 'Costs'} status={saving ? null : '✓ Saved'}
        value={isOwner ? (calc.hasAny ? formatRupees(calc.profit) : '—') : formatRupees(calc.totalCost)} valueClass={isOwner && calc.profit >= 0 ? 'text-emerald-600' : ''}>
        <Button size="lg" onClick={() => navigate(((window.history.state?.idx ?? 0) > 0) ? -1 : '/completed')}>Done</Button>
      </ActionBar>
    </div>
  );
}
