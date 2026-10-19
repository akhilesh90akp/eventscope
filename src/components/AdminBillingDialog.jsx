/**
 * AdminBillingDialog — the small pop-ups behind Admin → Actions ▾ for one
 * company: set / extend the pilot, confirm or record a payment, change plan,
 * suspend, reactivate, and the History list. Each one has its own Save;
 * every change also writes a History line (AppContext.adminTenantAction).
 *
 * Props: mode ('pilot'|'payment'|'plan'|'suspend'|'reactivate'|'history'),
 *        tenant (with .pending = the owner's "I've paid" claim, if any), onClose
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Toggle from './Toggle';
import { useApp } from '../context/AppContext';
import { useConfirm } from './useConfirm';
import {
  PAID_PLANS, planPrice, planName, periodEnd, renewalRange, todayIST, addDays, daysBetween,
  accessInfo, isDate, GRACE_DAYS, DEFAULT_PILOT,
} from '../utils/billing';

// ============================================================
// HELPERS
// ============================================================
const fmt = (iso, long = false) => (isDate(iso)
  ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', long ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' })
  : '—');
const rupees = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const selectCls = 'w-full bg-bb-input border border-bb-border rounded-lg px-3 py-2.5 text-bb-text focus:outline-none focus:ring-2 focus:ring-bb-accent';

/** Days / Months switch */
function UnitSwitch({ value, onChange }) {
  const tab = (v, label) => (
    <button type="button" onClick={() => onChange(v)}
      className={`flex-1 py-2 rounded-lg text-[13.5px] font-semibold cursor-pointer ${value === v ? 'bg-white text-violet-700 shadow-sm' : 'text-bb-muted'}`}>{label}</button>
  );
  return <div className="flex gap-1 bg-gray-100 rounded-xl p-1">{tab('days', 'Days')}{tab('months', 'Months')}</div>;
}

/** Purple summary box: rows of [label, value] + an optional warning row */
function Summary({ rows, last }) {
  return (
    <div className="rounded-xl px-4 py-3 bg-violet-50 text-violet-900 text-sm space-y-1" data-testid="billing-summary">
      {rows.map(([l, v]) => <div key={l} className="flex justify-between gap-3"><span>{l}</span><b className="text-right">{v}</b></div>)}
      {last && <div className="border-t border-violet-200 mt-2 pt-2 flex justify-between gap-3"><span>{last[0]}</span><b className="text-amber-700 text-right">{last[1]}</b></div>}
    </div>
  );
}

// ============================================================
// AdminBillingDialog — MAIN COMPONENT
// ============================================================
export default function AdminBillingDialog({ mode, tenant, onClose }) {
  const { adminSetPilot, adminRecordPayment, adminRejectClaim, adminTenantAction, getTenantHistory, showToast } = useApp();
  const confirm = useConfirm();
  const today = todayIST();
  const t = tenant || {};
  const claim = t.pending || null;

  // ------------------------------------------------------------
  // STATE (one form, fields used by whichever mode is open)
  // ------------------------------------------------------------
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!tenant) return;
    const start = t.pilotStart || String(t.createdAt || '').slice(0, 10) || today;
    const plan = claim?.plan || (t.plan && t.plan !== 'trial' ? t.plan : 'standard');
    const cycle = claim?.cycle || t.cycle || 'yearly';
    const range = renewalRange(t, cycle, today);
    setF({
      start: isDate(start) ? start : today,
      length: t.pilotLength || DEFAULT_PILOT.length,
      unit: t.pilotUnit || DEFAULT_PILOT.unit,
      autoSuspend: t.autoSuspend !== false,
      plan, cycle,
      amount: claim?.amount ?? planPrice(plan, cycle),
      paidOn: claim ? String(claim.createdAt).slice(0, 10) : today,
      payStart: claim?.start || range.start,
      payEnd: claim?.end || range.end,
      ref: claim?.ref || '',
      note: '',
      until: isDate(t.accessUntil) && t.accessUntil >= today ? t.accessUntil : addDays(today, 14),
    });
    if (mode === 'history') getTenantHistory(t.id).then(setHistory).catch(() => setHistory([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, mode]);

  // pilot preview
  const pilotEnd = useMemo(() => (isDate(f.start) && Number(f.length) > 0 ? periodEnd(f.start, f.length, f.unit) : null), [f.start, f.length, f.unit]);

  // payment: when plan/cycle change on a manual record, re-price and re-date
  const onPlanCycle = (k, v) => {
    const next = { ...f, [k]: v };
    if (!claim) {
      const r = renewalRange(t, next.cycle, today);
      next.amount = planPrice(next.plan, next.cycle); next.payStart = r.start; next.payEnd = r.end;
    }
    setF(next);
  };

  const done = (res, msg) => {
    setBusy(false);
    if (res.success) { showToast(msg); onClose(); } else showToast(res.error, 'error');
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — SAVE
  // ------------------------------------------------------------
  const savePilot = async () => {
    if (!pilotEnd) return showToast('Pick a start date and a length.', 'error');
    setBusy(true);
    const extended = !!t.accessUntil && pilotEnd > t.accessUntil;
    done(await adminSetPilot(t, { start: f.start, length: Number(f.length), unit: f.unit, autoSuspend: f.autoSuspend, extended }), `Pilot saved for ${t.name || t.id}`);
  };
  const savePayment = async () => {
    if (!(Number(f.amount) > 0) || !isDate(f.payEnd) || !isDate(f.payStart)) return showToast('Check the amount and dates.', 'error');
    setBusy(true);
    done(await adminRecordPayment(t, { plan: f.plan, cycle: f.cycle, amount: f.amount, ref: f.ref.trim(), paidOn: f.paidOn, start: f.payStart, end: f.payEnd, note: f.note.trim() }, !!claim),
      `Payment saved — ${t.name || t.id} is paid until ${fmt(f.payEnd)}`);
  };
  const reject = async () => {
    const ok = await confirm({ title: 'Reject this payment?', message: `${rupees(claim.amount)} · ref ${claim.ref}. If their date has passed, the app turns read-only again.`, confirmLabel: 'Reject', tone: 'danger' });
    if (!ok) return;
    setBusy(true);
    done(await adminRejectClaim(t, f.note.trim()), 'Payment claim rejected');
  };
  const savePlan = async () => {
    setBusy(true);
    const patch = f.plan === 'trial' ? { plan: 'trial' } : { plan: f.plan, cycle: f.cycle };
    done(await adminTenantAction(t.id, patch, 'Plan changed', `${planName(t.plan)} → ${planName(f.plan)}${f.plan === 'trial' ? '' : ` (${f.cycle})`}`), 'Plan changed');
  };
  const saveSuspend = async () => {
    setBusy(true);
    done(await adminTenantAction(t.id, { status: 'suspended', suspendedAt: new Date().toISOString(), suspendNote: f.note.trim() }, 'Suspended', f.note.trim()), `${t.name || t.id} suspended`);
  };
  const saveReactivate = async () => {
    const info = accessInfo({ ...t, status: 'active' }, today);
    const needDate = info.phase === 'ended' || info.phase === 'grace';
    if (needDate && !(isDate(f.until) && f.until >= today)) return showToast('Pick a date from today on.', 'error');
    setBusy(true);
    const patch = { status: 'active', reactivatedAt: new Date().toISOString(), suspendNote: '' };
    if (needDate) Object.assign(patch, { accessUntil: f.until, blockAfterMs: t.autoSuspend === false ? null : Date.parse(`${addDays(f.until, GRACE_DAYS + 1)}T00:00:00+05:30`) });
    done(await adminTenantAction(t.id, patch, 'Reactivated', needDate ? `access until ${f.until}` : ''), `${t.name || t.id} reactivated`);
  };

  if (!tenant) return null;

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const footer = (label, onSave, extra) => (
    <div className="flex gap-2 justify-end pt-2 flex-wrap">
      {extra}
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button onClick={onSave} disabled={busy}>{busy ? 'Saving…' : label}</Button>
    </div>
  );
  const name = t.name || t.id;
  const titles = {
    pilot: `Free pilot — ${name}`, payment: `${claim ? 'Confirm payment' : 'Record payment'} — ${name}`, plan: `Change plan — ${name}`,
    suspend: `Suspend ${name}?`, reactivate: `Reactivate ${name}`, history: `History — ${name}`,
  };
  const reInfo = accessInfo({ ...t, status: 'active' }, today);

  return (
    <Modal isOpen={!!tenant && !!mode} onClose={onClose} title={titles[mode] || ''} size="md">
      <div className="space-y-4" data-testid={`admin-dialog-${mode}`}>
        {mode === 'pilot' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Starts on" type="date" value={f.start || ''} onChange={e => set('start', e.target.value)} />
              <Input label="Length" type="number" min="1" value={f.length ?? ''} onChange={e => set('length', e.target.value)} />
            </div>
            <UnitSwitch value={f.unit} onChange={v => set('unit', v)} />
            {pilotEnd && (
              <Summary
                rows={[['From', fmt(f.start, true)], ['To (last day)', fmt(pilotEnd, true)], ['Length', `${daysBetween(f.start, pilotEnd) + 1} days`]]}
                last={f.autoSuspend
                  ? ['Read-only from', `${Math.max(0, daysBetween(today, addDays(pilotEnd, GRACE_DAYS + 1)))} days · ${fmt(addDays(pilotEnd, GRACE_DAYS + 1), true)}`]
                  : ['Auto-suspend', 'off']}
              />
            )}
            <Toggle label="Suspend automatically when the pilot ends" checked={!!f.autoSuspend} onChange={e => set('autoSuspend', e.target.checked)} />
            <p className="text-xs text-bb-muted -mt-2">After the last day they get {GRACE_DAYS} grace days, then the app turns read-only. They can still see everything.</p>
            {footer('Save pilot', savePilot)}
          </>
        )}

        {mode === 'payment' && (
          <>
            {claim && (
              <div className="rounded-xl px-3 py-2 text-sm bg-emerald-50 text-emerald-900">
                They said they paid <b>{rupees(claim.amount)}</b> on {fmt(String(claim.createdAt).slice(0, 10))} · UPI ref <b>{claim.ref}</b>. Check your UPI app, then confirm.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Amount (₹)" type="number" value={f.amount ?? ''} onChange={e => set('amount', e.target.value)} />
              <Input label="Paid on" type="date" value={f.paidOn || ''} onChange={e => set('paidOn', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="block text-sm font-medium text-bb-text">Plan</label>
                <select className={selectCls} value={f.plan} onChange={e => onPlanCycle('plan', e.target.value)}>{PAID_PLANS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="space-y-1.5"><label className="block text-sm font-medium text-bb-text">Covers</label>
                <select className={selectCls} value={f.cycle} onChange={e => onPlanCycle('cycle', e.target.value)}><option value="monthly">1 month</option><option value="yearly">1 year</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" type="date" value={f.payStart || ''} onChange={e => set('payStart', e.target.value)} />
              <Input label="Until" type="date" value={f.payEnd || ''} onChange={e => set('payEnd', e.target.value)} />
            </div>
            <Input label="UPI reference" value={f.ref || ''} onChange={e => set('ref', e.target.value)} placeholder="e.g. 627188901123" />
            <Input label="Note (optional)" value={f.note || ''} onChange={e => set('note', e.target.value)} placeholder="e.g. paid by bank transfer" />
            <div className="rounded-lg bg-emerald-50 text-emerald-900 px-3 py-2 text-sm">Access until <b>{fmt(f.payEnd)}</b> · editing switches back on now</div>
            {footer(claim ? 'Confirm payment' : 'Save payment', savePayment,
              claim && <Button variant="outline" className="border-red-500 text-red-500 hover:bg-red-50 mr-auto" onClick={reject}>Reject</Button>)}
          </>
        )}

        {mode === 'plan' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="block text-sm font-medium text-bb-text">Plan</label>
                <select className={selectCls} value={f.plan} onChange={e => set('plan', e.target.value)}>
                  <option value="trial">Free pilot</option>{PAID_PLANS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
              {f.plan !== 'trial' && (
                <div className="space-y-1.5"><label className="block text-sm font-medium text-bb-text">Billing</label>
                  <select className={selectCls} value={f.cycle} onChange={e => set('cycle', e.target.value)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>
              )}
            </div>
            <p className="text-xs text-bb-muted">Changes what they can use right away. Dates stay the same — use Record payment or Extend pilot to change those.</p>
            {footer('Save plan', savePlan)}
          </>
        )}

        {mode === 'suspend' && (
          <>
            <p className="text-sm text-bb-muted">Their team can still view everything but can’t make changes, whatever their dates say. You can reactivate any time.</p>
            <Input label="Note (optional, only you see it)" value={f.note || ''} onChange={e => set('note', e.target.value)} placeholder="e.g. asked to pause" />
            {footer('Suspend', saveSuspend)}
          </>
        )}

        {mode === 'reactivate' && (
          <>
            {(reInfo.phase === 'ended' || reInfo.phase === 'grace') ? (
              <>
                <p className="text-sm text-bb-muted">Their {reInfo.kind === 'pilot' ? 'pilot' : 'paid period'} ended on {fmt(t.accessUntil)}. Give them access until:</p>
                <Input label="Access until" type="date" value={f.until || ''} onChange={e => set('until', e.target.value)} />
                <p className="text-xs text-bb-muted">If they paid, use Record payment instead — it sets the dates and keeps the receipt.</p>
              </>
            ) : <p className="text-sm text-bb-muted">Switches editing back on. Their dates stay as they are{t.accessUntil ? ` (until ${fmt(t.accessUntil)})` : ''}.</p>}
            {footer('Reactivate', saveReactivate)}
          </>
        )}

        {mode === 'history' && (
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {history === null ? <p className="text-sm text-bb-muted">Loading…</p>
              : !history.length ? <p className="text-sm text-bb-muted">Nothing changed yet.</p>
                : history.map(h => (
                  <div key={h.id} className="py-2 border-b border-bb-border/60 last:border-0">
                    <div className="flex justify-between gap-2 text-sm"><b className="text-bb-text">{h.action}</b><span className="text-xs text-bb-muted whitespace-nowrap">{new Date(h.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
                    {h.detail && <div className="text-xs text-bb-muted mt-0.5">{h.detail}</div>}
                    {h.by && <div className="text-[11px] text-bb-muted">by {h.by}</div>}
                  </div>
                ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
