/**
 * JobEventLaptop — the Job Log of ONE completed event, as a laptop pop-up
 *
 * Opens from "Job Log" on a completed event card (and from "Add costs" in
 * Reports). Same data as the full Job Log and the phone page (JobEvent):
 * tenants/{id}/financials/{eventId}. Left: summary + the read-only bill
 * figures. Right: your cost / income boxes (sums like 4000+2500 work, wrong
 * values are explained and not saved) and note fields. Every box saves when
 * you leave it.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useState } from 'react';
import { X, ExternalLink, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getEventBill, computeEventFinancials, validateMoneyInput, formatRupees, formatDateReadable, openJobLog } from '../utils/helpers';

// ============================================================
// JobEventLaptop — MAIN COMPONENT
// ============================================================

export default function JobEventLaptop({ event, onClose }) {
  const { jobLogColumns, financials, saveFinancials, isOwner, canEditEvents } = useApp();
  const [drafts, setDrafts] = useState({});   // { columnId: text being typed }
  const [errors, setErrors] = useState({});   // { columnId: why it was not saved }
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const fin = financials[event.id] || {};
  const values = fin.values || {};
  const formulas = fin.formulas || {};
  const bill = getEventBill(event);
  const calc = computeEventFinancials(bill.revenue, values, jobLogColumns);
  const money = jobLogColumns.filter(c => c.type !== 'text');
  const texts = jobLogColumns.filter(c => c.type === 'text');
  const costShare = bill.revenue > 0 ? Math.min(100, Math.round((calc.totalCost / bill.revenue) * 100)) : 0;
  const isLoss = calc.hasAny && calc.profit < 0;

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const clearDraft = (id) => setDrafts(d => { const n = { ...d }; delete n[id]; return n; });

  /** Saves one box when you leave it; a wrong value stays in the box with the reason */
  const commit = async (col) => {
    if (!(col.id in drafts)) return;
    const text = drafts[col.id];
    let change;
    if (col.type === 'text') {
      const value = text.trim() || null;
      clearDraft(col.id);
      if (value === (values[col.id] || null)) return;
      change = { eventId: event.id, columnId: col.id, value };
    } else {
      const check = validateMoneyInput(text);
      if (!check.ok) { setErrors(e => ({ ...e, [col.id]: check.message })); return; }
      clearDraft(col.id);
      const cur = values[col.id];
      if (check.value === (cur === null || cur === undefined ? null : Number(cur)) && check.formula === (formulas[col.id] || null)) return;
      change = { eventId: event.id, columnId: col.id, value: check.value, formula: check.formula };
    }
    setSaving(true); setFailed(false);
    const res = await saveFinancials([change]);
    setSaving(false);
    if (!res?.success) setFailed(true);
  };

  const shown = (col) => {
    if (col.id in drafts) return drafts[col.id];
    const v = values[col.id];
    if (v === null || v === undefined) return '';
    return col.type === 'text' ? v : (formulas[col.id] || Number(v).toLocaleString('en-IN'));
  };
  const startEdit = (col) => setDrafts(d => (col.id in d ? d : { ...d, [col.id]: col.type === 'text' ? (values[col.id] || '') : String(formulas[col.id] || (values[col.id] ?? '')) }));
  const type = (col, v) => { setDrafts(d => ({ ...d, [col.id]: v })); setErrors(e => { if (!(col.id in e)) return e; const n = { ...e }; delete n[col.id]; return n; }); };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const Stat = ({ label, value, cls = '', testId }) => (
    <div className="rounded-xl border border-bb-border px-3.5 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-bb-muted">{label}</p>
      <p className={`text-[20px] font-bold leading-tight tabular-nums ${cls}`} data-testid={testId}>{value}</p>
    </div>
  );
  const Row = ({ label, value, cls = '' }) => (
    <div className={`flex justify-between py-2 text-[14px] border-b border-bb-border/60 last:border-b-0 ${cls}`}><span className="text-bb-muted">{label}</span><b className="tabular-nums text-bb-text">{value}</b></div>
  );
  const sub = [event.clientName, event.eventType, formatDateReadable(event.mainEvent?.date || event.date)].filter(Boolean).join(' · ');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="job-event-dialog">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-label="Job Log" className="relative w-full max-w-[580px] max-h-[92dvh] flex flex-col bg-white rounded-2xl shadow-2xl border border-bb-border">
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-bb-border">
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-bb-text leading-tight flex items-center gap-2">
              Job Log
              {isLoss && <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase text-red-700 bg-red-100 rounded-full px-2 py-0.5" data-testid="job-loss"><AlertTriangle size={11} />Loss</span>}
            </h2>
            <p className="text-[12.5px] text-bb-muted mt-0.5 truncate">{sub}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 rounded-lg flex items-center justify-center text-bb-muted hover:bg-gray-100 cursor-pointer"><X size={20} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          <div className={`grid ${isOwner ? 'grid-cols-4' : 'grid-cols-2'} gap-3`}>
            <Stat label="Revenue" value={formatRupees(bill.revenue)} />
            <Stat label="Costs" value={formatRupees(calc.totalCost)} cls="text-red-600" testId="job-costs" />
            {isOwner && <Stat label="Profit" value={calc.hasAny ? formatRupees(calc.profit) : '—'} cls={calc.profit >= 0 ? 'text-emerald-600' : 'text-red-600'} testId="job-profit" />}
            {isOwner && <Stat label="Margin" value={calc.hasAny && calc.margin !== null ? `${calc.margin}%` : '—'} />}
          </div>
          {isOwner && calc.hasAny && bill.revenue > 0 && (
            <div>
              <div className="h-2 rounded-full bg-red-100 overflow-hidden"><div className="h-full bg-red-300" style={{ width: `${costShare}%` }} /></div>
              <p className="text-[12.5px] text-bb-muted mt-1.5">Costs are {costShare}% of revenue.</p>
            </div>
          )}
          {!calc.hasAny && <p className="text-[13px] rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2" data-testid="job-nocosts">Not filled yet — add the costs on the right to see this event’s profit.</p>}

          <div className="space-y-4">
            <section>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-bb-muted mb-1.5">Costs &amp; income · you fill in</p>
              <div className="rounded-xl border border-bb-border px-3.5 py-1">
                {money.length === 0 && <p className="py-4 text-[14px] text-bb-muted">No cost columns yet — add them in Settings → Job Log columns.</p>}
                {money.map(col => {
                  const err = errors[col.id];
                  const formula = !(col.id in drafts) && formulas[col.id];
                  return (
                    <div key={col.id} className="py-2 border-b border-bb-border/60 last:border-b-0">
                      <label className="flex items-center gap-3">
                        <span className="flex-1 min-w-0 text-[14px] font-semibold">{col.label}{col.type === 'income' && <span className="ml-1.5 text-[10.5px] font-bold px-1.5 py-px rounded-full bg-emerald-100 text-emerald-800">income</span>}</span>
                        <input inputMode="decimal" disabled={!canEditEvents} value={shown(col)} placeholder="—" aria-label={col.label} aria-invalid={!!err} data-testid={`job-${col.id}`}
                          onFocus={e => { const el = e.currentTarget; startEdit(col); requestAnimationFrame(() => el.select()); }}
                          onChange={e => type(col, e.target.value)} onBlur={() => commit(col)} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                          className={`w-[180px] h-9 px-2.5 rounded-lg border text-right tabular-nums outline-none focus:ring-2 focus:ring-bb-accent focus:border-transparent ${err ? 'border-red-400 bg-red-50 text-red-700' : col.type === 'income' ? 'border-emerald-300 bg-white' : 'border-bb-border bg-white'}`} />
                      </label>
                      {err && <p className="text-[11.5px] text-red-600 text-right mt-1" data-testid="job-error">{err}</p>}
                      {!err && formula && <p className="text-[12px] text-bb-muted text-right mt-1">= {formatRupees(values[col.id])}</p>}
                    </div>
                  );
                })}
                {money.length > 0 && <div className="flex justify-between py-2.5 text-[14px] border-t-2 border-bb-border"><b>Total costs</b><b className="tabular-nums">{formatRupees(calc.totalCost)}</b></div>}
              </div>
            </section>
            <section>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-bb-muted mb-1.5">From the bill · read only</p>
              <div className="rounded-xl border border-bb-border bg-gray-50/60 px-3.5 py-1">
                <Row label="Revenue (before GST)" value={formatRupees(bill.revenue)} />
                <Row label="GST" value={formatRupees(bill.gst)} />
                <Row label="Bill total" value={formatRupees(bill.billTotal)} />
                <Row label="Received" value={formatRupees(bill.advance)} />
                <Row label="Balance due" value={formatRupees(bill.balance)} cls={bill.balance > 0 ? '[&_b]:text-amber-700' : ''} />
              </div>
            </section>

          </div>

          {texts.map(col => (
            <section key={col.id}>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-bb-muted mb-1.5">{col.label}</p>
              <textarea disabled={!canEditEvents} value={shown(col)} placeholder="—" aria-label={col.label} rows={2}
                onFocus={() => startEdit(col)} onChange={e => type(col, e.target.value)} onBlur={() => commit(col)}
                className="w-full rounded-xl border border-bb-border bg-white px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-bb-accent focus:border-transparent" />
            </section>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-bb-border flex items-center gap-3">
          <span className={`text-[12.5px] font-medium ${failed ? 'text-red-600' : 'text-emerald-700'}`} data-testid="job-saved">{failed ? 'Not saved — check connection' : saving ? 'Saving…' : '✓ Saves by itself'}</span>
          <span className="flex-1" />
          {isOwner && <button onClick={openJobLog} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-bb-accent-hover cursor-pointer hover:underline"><ExternalLink size={14} />Open full Job Log</button>}
          <button onClick={onClose} className="min-h-[40px] px-5 rounded-xl text-[14px] font-semibold bg-bb-accent text-white hover:bg-bb-accent-hover cursor-pointer" data-testid="job-done">Done</button>
        </div>
      </div>
    </div>
  );
}
