/**
 * StaffSheets — the pop-ups of Staff & wages (bottom sheet on phones,
 * centred on laptops):
 *   StaffFormSheet    Add / edit a person (works in, pay, overtime, pay cycle)
 *   RecordPaymentSheet Paid early · Advance / loan · Bonus
 *   MarkPaidSheet     Pay what's due (planned advance take-back pre-filled)
 * All writes go through AppContext and are checked before closing.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useState } from 'react';
import Button from './Button';
import BottomSheet from './BottomSheet';
import { SegmentedTabs, TextField, DateField } from './PhoneUI';
import { Pills, MoneyInput } from './StaffUI';
import { rupees, monthLabel } from '../utils/staffFormat';
import { useApp } from '../context/AppContext';
import { isoDate } from '../utils/calendar';
import { daysInMonth } from '../utils/staffCosts';

const footer = (onCancel, onSave, label, disabled, busy, testId) => (
  <div className="flex gap-2.5">
    <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel}>Cancel</Button>
    <Button size="lg" className="flex-[1.4]" disabled={disabled || busy} onClick={onSave} data-testid={testId}>{busy ? 'Saving…' : label}</Button>
  </div>
);

const CYCLE_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const perPayWord = (p, cycle) => (p.pay === 'monthly' || cycle === 'monthly' ? 'month' : cycle === 'weekly' ? 'week' : 'day');

// ============================================================
// StaffFormSheet
// ============================================================
export function StaffFormSheet({ open, onClose, editing, onSaved, onDelete, canDelete }) {
  const { saveStaffPerson, daySheetCfg: cfg, showToast } = useApp();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(editing ? { ...editing, ot: editing.ot || { mode: 'hour', rate: '' } } : {
      name: '', phone: '', role: '', worksIn: 'events', pay: 'monthly', amount: '',
      ot: { ...cfg.defaultOt }, payCycle: '', startDate: isoDate(new Date()), endDate: '',
    });
  }, [open, editing, cfg.defaultOt]);
  if (!f) return null;
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const office = f.worksIn === 'office';
  const now = new Date();
  const perDay = f.pay === 'monthly' && f.amount ? Math.floor(f.amount / daysInMonth(now.getFullYear(), now.getMonth() + 1)) : 0;
  const ok = f.name.trim() && Number(f.amount) > 0 && (!f.endDate || !f.startDate || f.endDate >= f.startDate);

  const save = async () => {
    setBusy(true);
    const data = {
      ...(editing ? { id: editing.id } : {}),
      name: f.name.trim(), phone: (f.phone || '').trim(), role: office ? (f.role || '').trim() : '',
      worksIn: f.worksIn, pay: office ? 'monthly' : f.pay, amount: Math.round(Number(f.amount)),
      ot: office ? null : { mode: f.ot?.mode || 'hour', rate: Math.round(Number(f.ot?.rate) || 0) },
      payCycle: f.pay === 'daily' ? (f.payCycle || '') : '', startDate: f.startDate || '', endDate: f.endDate || '',
    };
    const res = await saveStaffPerson(data);
    setBusy(false);
    if (res.success) { showToast(editing ? `${data.name} saved` : `${data.name} added`); onSaved?.(res.id); onClose(); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? 'Edit staff' : 'Add staff'} testId="staff-form"
      footer={footer(onClose, save, 'Save staff', !ok, busy, 'staff-save')}>
      <div className="space-y-4">
        <TextField label="Name" required value={f.name} onChange={e => set('name', e.target.value)} data-testid="staff-name" />
        <TextField label="Phone" value={f.phone || ''} inputMode="tel" onChange={e => set('phone', e.target.value)} hint="For Call and WhatsApp" data-testid="staff-phone" />
        <div>
          <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">Works in</span>
          <SegmentedTabs options={[{ value: 'events', label: 'Events team' }, { value: 'office', label: 'Office' }]} value={f.worksIn} onChange={v => setF(x => ({ ...x, worksIn: v, ...(v === 'office' ? { pay: 'monthly' } : {}) }))} testId="staff-works" />
          <span className="block text-[12.5px] text-gray-600 mt-1.5">Events team: on Day sheets. Office (accountant, planner…): pay goes to office salaries, never to events.</span>
        </div>
        {office && <TextField label="Role" value={f.role || ''} onChange={e => set('role', e.target.value)} placeholder="e.g. Accountant" data-testid="staff-role" />}
        {!office && (
          <div>
            <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">Paid</span>
            <SegmentedTabs options={[{ value: 'monthly', label: 'Monthly' }, { value: 'daily', label: 'Daily wage' }]} value={f.pay} onChange={v => set('pay', v)} testId="staff-pay" />
          </div>
        )}
        <MoneyInput label={f.pay === 'monthly' ? 'Monthly salary' : 'Daily wage'} required value={f.amount} onChange={v => set('amount', v)} testId="staff-amount"
          hint={f.pay === 'monthly'
            ? (perDay ? `About ${rupees(perDay)} a day this month (salary ÷ days in the month)${office ? '' : ', added to every Day sheet'}` : 'Spread over the days of each month, so a month adds up to exactly the salary')
            : 'Counted only on days they’re ticked on the Day sheet'} />
        {!office && <>
          <div>
            <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">Overtime</span>
            <Pills options={[{ value: 'hour', label: 'Per hour' }, { value: 'night', label: 'Fixed per late night' }]} value={f.ot?.mode || 'hour'} onChange={v => set('ot', { ...f.ot, mode: v })} testId="staff-ot-mode" />
          </div>
          <MoneyInput value={f.ot?.rate ?? ''} onChange={v => set('ot', { ...f.ot, rate: v })} suffix={f.ot?.mode === 'night' ? 'a late night' : 'an hour'} testId="staff-ot-rate"
            hint="Pre-filled from Default overtime. Change it for this person if needed." />
        </>}
        {f.pay === 'daily' && (
          <div>
            <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">Paid every</span>
            <Pills options={[{ value: '', label: `Company default (${CYCLE_LABEL[cfg.payCycle]})` }, { value: 'daily', label: 'Day' }, { value: 'weekly', label: 'Week' }, { value: 'monthly', label: 'Month' }]}
              value={f.payCycle || ''} onChange={v => set('payCycle', v)} size="sm" testId="staff-cycle" />
          </div>
        )}
        <DateField label="Started on" value={f.startDate} onChange={v => set('startDate', v)} id="staff-start" testId="staff-start" />
        {editing && <DateField label="Stopped working on" value={f.endDate} onChange={v => set('endDate', v)} id="staff-end" placeholder="Still working here" testId="staff-end" />}
        {editing && f.endDate && <button onClick={() => set('endDate', '')} className="text-[13px] font-semibold text-bb-accent-hover hover:underline cursor-pointer">Still working here</button>}
        {editing && onDelete && (
          <div className="pt-2 border-t border-bb-border">
            {canDelete
              ? <button onClick={onDelete} className="text-[14px] font-semibold text-red-600 hover:underline cursor-pointer" data-testid="staff-delete">Remove {editing.name}</button>
              : <p className="text-[12.5px] text-gray-600">Has days or payments, so can’t be removed — set “Stopped working on” instead. Past months stay as they were.</p>}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

// ============================================================
// RecordPaymentSheet
// ============================================================
export function RecordPaymentSheet({ open, onClose, person, editing }) {
  const { addStaffPayment, updateStaffPayment, daySheetCfg: cfg, showToast } = useApp();
  const cycle = person?.payCycle || cfg.payCycle;
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(editing
      ? { amount: editing.amount, type: editing.type, back: editing.recoverPerPay ? 'parts' : 'all', perPay: editing.recoverPerPay || '', date: editing.date, note: editing.note || '' }
      : { amount: '', type: 'early', back: 'parts', perPay: '', date: isoDate(new Date()), note: '' });
  }, [open, editing]);
  if (!f || !person) return null;
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const word = perPayWord(person, cycle);
  const parts = f.type === 'advance' && f.back === 'parts';
  const times = parts && f.perPay > 0 && f.amount > 0 ? Math.ceil(f.amount / f.perPay) : 0;
  const ok = Number(f.amount) > 0 && f.date && (!parts || Number(f.perPay) > 0);

  const save = async () => {
    setBusy(true);
    const data = { staffId: person.id, type: f.type, amount: Math.round(Number(f.amount)), date: f.date, note: f.note.trim(),
      ...(f.type === 'advance' ? { recoverPerPay: parts ? Math.round(Number(f.perPay)) : 0 } : {}) };
    const res = editing ? await updateStaffPayment(editing.id, data) : await addStaffPayment(data);
    setBusy(false);
    if (res.success) { showToast('Payment saved'); onClose(); }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? 'Edit payment' : 'Record payment'} sub={person.name} testId="record-payment"
      footer={footer(onClose, save, 'Save', !ok, busy, 'payment-save')}>
      <div className="space-y-4">
        <MoneyInput label="Amount" required value={f.amount} onChange={v => set('amount', v)} testId="payment-amount" />
        <div>
          <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">What is it</span>
          <Pills options={[{ value: 'early', label: 'Paid early' }, { value: 'advance', label: 'Advance / loan' }, { value: 'bonus', label: 'Bonus' }]} value={f.type} onChange={v => set('type', v)} testId="payment-type" />
          <span className="block text-[12.5px] text-gray-600 mt-1.5">
            {f.type === 'early' ? 'Part of this month’s pay, given early — it comes off what’s left to pay.'
              : f.type === 'advance' ? 'A loan, taken back from later pay. It never changes profit.'
                : 'An extra on top of pay — counted as a cost, paid now.'}
          </span>
        </div>
        {f.type === 'advance' && <>
          <div>
            <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">Take it back</span>
            <Pills options={[{ value: 'all', label: 'All from the next pay' }, { value: 'parts', label: 'In parts' }]} value={f.back} onChange={v => set('back', v)} testId="payment-back" />
          </div>
          {parts && <MoneyInput label={`Take back each ${word}`} required value={f.perPay} onChange={v => set('perPay', v)} testId="payment-perpay"
            hint={times ? `From the next pay until it’s cleared (${times} ${word}${times === 1 ? '' : 's'})` : 'From the next pay until it’s cleared'} />}
        </>}
        <DateField label="Date" value={f.date} onChange={v => set('date', v)} id="payment-date" testId="payment-date" />
        <TextField label="Note" value={f.note} onChange={e => set('note', e.target.value)} hint="Optional" data-testid="payment-note" />
      </div>
    </BottomSheet>
  );
}

// ============================================================
// MarkPaidSheet
// ============================================================
/** s = staffMonth(...) for the month · carried = from earlier months · ym = month */
export function MarkPaidSheet({ open, onClose, person, s, carried = 0, ym }) {
  const { addStaffPayment, showToast } = useApp();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const due = s ? s.earned + s.ot - s.paidEarly - s.paid - s.advanceBack + carried : 0;
  useEffect(() => {
    if (!open || !s) return;
    const back = Math.max(0, Math.min(s.plannedBack, due));
    setF({ back, amount: Math.max(0, due - back), date: isoDate(new Date()), method: 'UPI', note: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!f || !person || !s) return null;
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const toPay = due - (Number(f.back) || 0);
  const ok = f.date && (Number(f.amount) > 0 || Number(f.back) > 0) && Number(f.back) <= s.advanceOwed;

  const save = async () => {
    setBusy(true);
    const res = await addStaffPayment({ staffId: person.id, type: 'pay', amount: Math.round(Number(f.amount) || 0), advanceBack: Math.round(Number(f.back) || 0),
      date: f.date, method: f.method, note: f.note.trim(), forMonth: ym });
    setBusy(false);
    if (res.success) { showToast(`${person.name}: ${rupees(f.amount)} paid`); onClose(); }
  };

  const row = (label, value, strong) => (
    <div className={`flex justify-between py-2.5 border-b border-bb-border last:border-b-0 text-[15px] ${strong ? 'font-bold' : ''}`}><span>{label}</span><span className="tabular-nums font-semibold">{value}</span></div>
  );
  return (
    <BottomSheet open={open} onClose={onClose} title={`Mark ${monthLabel(ym).split(' ')[0]} as paid`} sub={person.name} testId="mark-paid"
      footer={footer(onClose, save, '✓ Mark as paid', !ok, busy, 'markpaid-save')}>
      <div className="space-y-4">
        <div className="border border-bb-border rounded-2xl px-4" data-testid="markpaid-breakdown">
          {row('Earned + overtime', rupees(s.earned + s.ot))}
          {s.paidEarly > 0 && row('Paid early', `− ${rupees(s.paidEarly)}`)}
          {s.paid > 0 && row('Already paid', `− ${rupees(s.paid)}`)}
          {s.advanceBack > 0 && row('Advance already taken back', `− ${rupees(s.advanceBack)}`)}
          {carried !== 0 && row(carried > 0 ? 'Left from earlier months' : 'Paid extra earlier', `${carried > 0 ? '+' : '−'} ${rupees(Math.abs(carried))}`)}
          {s.advanceOwed > 0 && row('Advance taken back now', `− ${rupees(f.back)}`)}
          {row('To pay', rupees(toPay), true)}
        </div>
        {s.advanceOwed > 0 && (
          <MoneyInput label="Advance to take back now" value={f.back} testId="markpaid-back"
            onChange={v => { const b = Math.min(Number(v) || 0, s.advanceOwed); setF(x => ({ ...x, back: v === '' ? '' : b, amount: Math.max(0, due - b) })); }}
            hint={`${rupees(s.advanceOwed)} owed · planned ${rupees(s.plannedBack)} · set 0 to skip this time`} />
        )}
        <MoneyInput label="Paying now" value={f.amount} onChange={v => set('amount', v)} hint="Pay less and the rest stays as owed" testId="markpaid-amount" />
        <DateField label="Paid on" value={f.date} onChange={v => set('date', v)} id="markpaid-date" testId="markpaid-date" />
        <div>
          <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">Paid by</span>
          <Pills options={['Cash', 'UPI', 'Bank'].map(v => ({ value: v, label: v }))} value={f.method} onChange={v => set('method', v)} testId="markpaid-method" />
        </div>
      </div>
    </BottomSheet>
  );
}
