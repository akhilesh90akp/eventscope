/**
 * DaySheet — one day: who worked where (Events / Warehouse / Leave), overtime,
 * the day's shared costs and notes. Saves by itself a moment after each change.
 *
 * Money (owners only): each person's day cost, "How it's shared" (event-day
 * costs ÷ that day's events, running cost), and each event's share. Fillers
 * see the same sheet without any rupee amounts for staff.
 *
 * Daily-wage staff with the "Daily" pay cycle get a "Paid today" tick (owners):
 * it records a pay entry in Staff & wages for that day.
 *
 * Phones: ‹ day ›, number cards, Events today, Staff, Office, Shared costs,
 * How it's shared, Notes, and a pinned bar (Day costs · ✓ Saved · Done).
 * Laptops: title row (Excel · Print), ‹ day › strip, StatRow, tables.
 *
 * Data: daySheets/{date} (AppContext.saveDaySheet). Money: utils/staffCosts.js.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, Printer, Trash2, ClipboardCheck } from 'lucide-react';
import Button from '../components/Button';
import ActionBar, { ActionBarSpacer } from '../components/ActionBar';
import BottomSheet from '../components/BottomSheet';
import { useConfirm } from '../components/useConfirm';
import { useIsPhone } from '../components/useIsPhone';
import { usePhoneHeader } from '../components/phoneScreens';
import { HeaderIconButton } from '../components/PhoneHeader';
import { SectionLabel, TextField, SwitchRow, IconButton, Select } from '../components/PhoneUI';
import { PageHeader, HeaderText, StatRow } from '../components/LaptopUI';
import { StepSwitcher, Pills, MoneyInput, HoursInput, PanelCard, LinkButton, SumRow, Tag, Notice, EmptyState } from '../components/StaffUI';
import { rupees } from '../utils/staffFormat';
import { useDaySheets } from '../components/useDaySheets';
import { addDays } from '../utils/calendar';
import { genId, getEventRevenue, computeEventFinancials, formatDateWithDay } from '../utils/helpers';
import { overtimePay, advanceStatus } from '../utils/staffCosts';
import { dayDoc } from '../utils/daySheetDocs';
import { blankSheet } from '../utils/daySheetView';
import { downloadExcel, printDoc } from '../utils/staffExcel';

// ============================================================
// HELPERS
// ============================================================

const payLine = (p, isOwner) => `${p.pay === 'monthly' ? 'Monthly' : 'Daily'}${isOwner && p.amount ? ` · ${rupees(p.amount)} a ${p.pay === 'monthly' ? 'month' : 'day'}` : ''}`;

// ============================================================
// DaySheet — MAIN COMPONENT
// ============================================================
export default function DaySheet() {
  const { date } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isPhone = useIsPhone();
  const ds = useDaySheets();
  const {
    cfg, today, day, fnsByDate, teamOn, officeOn, isOwner, daySheets, daySheetsLoaded, saveDaySheet, deleteDaySheet,
    events, financials, jobLogColumns, allJobLogColumns, daySheetView, columnLabel, settings, updateSettings,
    staffPayments, addStaffPayment, deleteStaffPayment, showToast, restoreDoc, daySheetsOn, canFillDaySheets,
  } = ds;

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const fns = useMemo(() => fnsByDate[date] || [], [fnsByDate, date]);
  const team = useMemo(() => teamOn(date), [teamOn, date]);
  const office = useMemo(() => officeOn(date), [officeOn, date]);
  const stored = daySheets[date];
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState('');       // '' | 'saving' | 'saved' | 'error'
  const [addOpen, setAddOpen] = useState(false);
  const dirty = useRef(false);
  const draftRef = useRef(null);     // latest sheet, so quick edits build on each other
  const timer = useRef(null);
  const pending = useRef(null);

  // Load the stored sheet (or a blank one). A new day always loads fresh (any unsaved edits of the
  // previous day are still saved — they carry their own date); the same day reloads when a
  // teammate saves, but never over typing that hasn't been saved yet.
  const loadedDate = useRef(null);
  useEffect(() => {
    if (!daySheetsLoaded) return;
    if (loadedDate.current !== date) { loadedDate.current = date; dirty.current = false; setStatus(''); }
    else if (dirty.current) return;
    const next = stored ? { staff: {}, costs: [], notes: '', ...stored } : null;
    draftRef.current = next;
    setDraft(next);
  }, [stored, daySheetsLoaded, date]);

  // ------------------------------------------------------------
  // SAVING (by itself, about 2 s after the last change — design system)
  // ------------------------------------------------------------
  const saveRef = useRef(saveDaySheet);
  saveRef.current = saveDaySheet;   // AppContext makes a new function each render; flush stays the same
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setStatus('saving');
    const res = await saveRef.current(p.date, p.sheet);
    if (!res.success && !pending.current) pending.current = p;   // keep it for "Retry"
    dirty.current = !!pending.current;                         // typed again while saving → still waiting
    setStatus(!res.success ? 'error' : pending.current ? 'waiting' : 'saved');
    if (res.success && pending.current) timer.current = setTimeout(flush, 2000);
  }, []);

  const change = (fn) => {
    const base = draftRef.current || blankSheet(team, fns.length > 0, cfg.costRows);
    const next = fn(structuredClone(base));
    draftRef.current = next;
    setDraft(next);
    dirty.current = true;
    setStatus('waiting');
    pending.current = { date, sheet: next };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 2000);
  };
  useEffect(() => () => { flush(); }, [date, flush]);   // leaving the day (or the page) saves what's left

  // ------------------------------------------------------------
  // DERIVED
  // ------------------------------------------------------------
  const blank = useMemo(() => blankSheet(team, fns.length > 0, cfg.costRows), [team, fns.length, cfg.costRows]);
  const sheet = draft || blank;
  const filled = !!draft;
  // money uses the sheet being typed, so numbers move as you type
  const { computeWith } = ds;
  const d = useMemo(() => (filled ? computeWith(date, sheet) : day(date)), [day, computeWith, date, filled, sheet]);
  const evRows = useMemo(() => fns.map((f, i) => {
    const ev = events.find(e => e.id === f.eventId);
    const revenue = ev ? getEventRevenue(ev) : 0;
    const vals = financials[f.eventId]?.values || {};
    const calc = computeEventFinancials(revenue, vals, jobLogColumns);
    const fromSheets = (daySheetView.colIds || []).reduce((t, c) => t + (Number(vals[c]) || 0), 0);
    return { f, revenue, own: calc.totalCost - fromSheets, share: d.each[i] || 0, profit: calc.profit, hasAny: calc.hasAny };
  }), [fns, events, financials, jobLogColumns, daySheetView, d.each]);
  const revenue = evRows.reduce((t, r) => t + r.revenue, 0);
  const own = evRows.reduce((t, r) => t + r.own, 0);
  const dayProfit = revenue - own - d.eventDay;
  const dailyCycle = (p) => (p.payCycle || cfg.payCycle) === 'daily';
  const paidToday = (p) => staffPayments.find(x => x.staffId === p.id && x.type === 'pay' && x.daySheet === date);
  const costColumns = (allJobLogColumns || jobLogColumns).filter(c => !c.hidden && c.type !== 'income' && c.type !== 'text');

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const setWhere = (p, where) => change(s => { s.staff[p.id] = { ...(s.staff[p.id] || {}), where }; if (where === 'leave') s.staff[p.id].otHours = ''; return s; });
  const toggle = (p, on) => change(s => {
    if (p.pay === 'daily' && !on) delete s.staff[p.id];
    else s.staff[p.id] = { ...(s.staff[p.id] || {}), where: on ? (fns.length ? 'events' : 'warehouse') : 'leave', ...(on ? {} : { otHours: '' }) };
    return s;
  });
  const setOt = (p, v) => change(s => { s.staff[p.id] = { ...(s.staff[p.id] || { where: fns.length ? 'events' : 'warehouse' }), otHours: v === '' ? '' : Number(v) }; return s; });
  const setCost = (id, amount) => change(s => { s.costs = s.costs.map(c => (c.id === id ? { ...c, amount } : c)); return s; });
  const removeCost = (id) => change(s => { s.costs = s.costs.filter(c => c.id !== id); return s; });
  const setNotes = (v) => change(s => { s.notes = v; return s; });
  const goDay = async (n) => { await flush(); navigate(`/day-sheets/${addDays(date, n)}`, { replace: true }); };

  const addCost = async ({ label, amount, column, keep }) => {
    change(s => { s.costs = [...s.costs, { id: genId(), label, column, amount }]; return s; });
    setAddOpen(false);
    if (keep && isOwner && !cfg.costRows.some(r => r.label.toLowerCase() === label.toLowerCase())) {
      await updateSettings({ daySheets: { ...(settings.daySheets || {}), costRows: [...cfg.costRows, { label, column }] } });
    }
  };

  const togglePaid = async (p, row) => {
    const done = paidToday(p);
    if (done) { if ((await deleteStaffPayment(done.id)).success) showToast(`${p.name}: payment removed`, 'remove', { undo: () => restoreDoc('staffPayments', done.id, done) }); return; }
    await flush();
    const adv = advanceStatus(p.id, staffPayments);
    const back = Math.min(adv.owed, adv.recoverPerPay || 0, row.total);
    const res = await addStaffPayment({ staffId: p.id, date, type: 'pay', amount: row.total - back, advanceBack: back, method: 'Cash', daySheet: date, note: 'Paid today (Day sheet)' });
    if (res.success) showToast(`${p.name}: ${rupees(row.total - back)} paid${back ? ` (${rupees(back)} advance taken back)` : ''}`);
  };

  const clearDay = async () => {
    const ok = await confirm({ title: 'Clear this Day sheet?', message: `${formatDateWithDay(date)} goes back to “not filled”. Monthly staff stay counted as running cost.`, confirmLabel: 'Clear', tone: 'danger' });
    if (!ok) return;
    clearTimeout(timer.current); pending.current = null; dirty.current = false;
    const before = stored;
    if ((await deleteDaySheet(date)).success) { draftRef.current = null; setDraft(null); setStatus(''); showToast('Day sheet cleared', 'remove', before ? { undo: () => restoreDoc('daySheets', date, before) } : {}); }
  };

  const exportDoc = () => dayDoc({ company: settings.companyName, d, sheet, fns, columnLabel });
  const handleExcel = async () => {
    try { await downloadExcel(exportDoc(), `${settings.companyName || 'Company'} Day sheet ${date}.xlsx`); }
    catch (err) { console.error('Day sheet Excel failed:', err); showToast('Couldn’t make the Excel file — please try again.', 'error'); }
  };

  const excelRef = useRef(handleExcel);
  excelRef.current = handleExcel;   // the title-bar button always exports the latest numbers
  usePhoneHeader({
    title: 'Day sheet',
    sub: `${formatDateWithDay(date)} · ${fns.length ? `${fns.length} ${fns.length === 1 ? 'event' : 'events'}` : 'no events'}`,
    right: isOwner ? <HeaderIconButton icon={Download} label="Download Excel" onClick={() => excelRef.current()} data-testid="day-excel" /> : null,
  }, [date, fns.length, isOwner]);   // Excel reads the latest sheet when tapped (handleExcel is recreated each render)

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  if (!daySheetsOn || !canFillDaySheets || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return <EmptyState icon={ClipboardCheck} title="This Day sheet isn’t available" line="Day sheets may be switched off, or the owner hasn’t given you access." action={<Button onClick={() => navigate('/day-sheets')}>Back to Day sheets</Button>} />;
  }
  if (!daySheetsLoaded) return <p className="text-sm text-bb-muted">Loading…</p>;

  const statusText = status === 'saving' ? 'Saving…' : status === 'error' ? 'Couldn’t save. Retry' : status === 'waiting' ? 'Unsaved changes' : filled ? 'All changes saved' : 'Not filled yet';
  const statusTone = status === 'error' ? 'text-rose-600' : status === 'waiting' ? 'text-amber-800' : status === 'saving' || !filled ? 'text-gray-500' : 'text-emerald-600';
  const statusEl = status === 'error'
    ? <button onClick={flush} className={`font-bold underline cursor-pointer ${statusTone}`} data-testid="save-status">{statusText}</button>
    : <span className={`font-bold ${statusTone}`} data-testid="save-status">{status === 'saved' || (filled && !status) ? '✓ ' : ''}{statusText}</span>;
  const daySwitch = (compact) => (
    <StepSwitcher compact={compact} label={formatDateWithDay(date)} testId="day-switch" prevLabel="Previous day" nextLabel="Next day"
      onPrev={() => goDay(-1)} onNext={() => goDay(1)} prevDisabled={date <= cfg.startDate} nextDisabled={date >= today} />
  );
  const whereOpts = [
    { value: 'events', label: 'Events' },
    { value: 'warehouse', label: 'Warehouse' },
    { value: 'leave', label: 'Leave' },
  ].filter(o => o.value !== 'events' || fns.length);

  // --- one person (phone card row / laptop table row share the same logic) ---
  const personState = (p) => {
    const entry = sheet.staff[p.id];
    const on = !!entry && entry.where !== 'leave';
    const row = d.rows.find(r => r.id === p.id);
    return { entry, on, row, where: entry?.where || (p.pay === 'monthly' ? (fns.length ? 'events' : 'warehouse') : '') };
  };
  const otPlus = (p, entry) => (isOwner && entry?.otHours ? overtimePay(p, entry.otHours) : 0);
  const paidTick = (p, row) => (isOwner && p.pay === 'daily' && dailyCycle(p) && row && row.total > 0 ? (
    <label className="inline-flex items-center gap-2 text-[13.5px] font-semibold cursor-pointer" data-testid={`paid-${p.id}`}>
      <input type="checkbox" className="w-[18px] h-[18px] accent-[var(--color-bb-accent,#7c3aed)]" checked={!!paidToday(p)} onChange={() => togglePaid(p, row)} />
      Paid today{paidToday(p) ? ` · ${rupees(paidToday(p).amount)}` : ''}
    </label>
  ) : null);

  const staffPhone = (
    <div className="bg-white border border-bb-border rounded-2xl divide-y divide-bb-border" data-testid="staff-list">
      {team.length === 0 && <p className="p-4 text-[14px] text-gray-600">No staff yet. {isOwner ? 'Add people in Staff & wages.' : ''}</p>}
      {team.map(p => {
        const { entry, on, row, where } = personState(p);
        return (
          <div key={p.id} className="px-4 py-3.5 space-y-2.5" data-testid={`person-${p.id}`}>
            <div className="flex items-start gap-3">
              <input type="checkbox" aria-label={`${p.name} worked today`} checked={on} onChange={e => toggle(p, e.target.checked)}
                className="mt-1 w-[22px] h-[22px] shrink-0 accent-[var(--color-bb-accent,#7c3aed)] cursor-pointer" data-testid={`tick-${p.id}`} />
              <span className="flex-1 min-w-0">
                <b className="block text-[15.5px] text-bb-text">{p.name}</b>
                <span className="block text-[13px] text-gray-600">{payLine(p, isOwner)}</span>
              </span>
              {isOwner && row && <b className={`text-[15px] tabular-nums ${on ? '' : 'text-gray-500'}`}>{rupees(row.total)}</b>}
            </div>
            {(entry || p.pay === 'monthly') && (
              <div className="pl-[34px] space-y-2.5">
                <Pills size="sm" options={whereOpts} value={where} onChange={v => setWhere(p, v)} testId={`where-${p.id}`} />
                {where !== 'leave' ? (
                  <div className="flex items-center gap-3">
                    <span className="text-[13.5px] text-gray-600 w-[70px]">Overtime</span>
                    <HoursInput value={entry?.otHours} onChange={v => setOt(p, v)} testId={`ot-${p.id}`} />
                    {otPlus(p, entry) > 0 && <span className="text-[13px] font-semibold text-emerald-600">+ {rupees(otPlus(p, entry))}</span>}
                  </div>
                ) : <p className="text-[12.5px] text-gray-600">{p.pay === 'monthly' ? 'Paid leave — goes to running cost' : 'Not working today — not paid'}</p>}
                {paidTick(p, row)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const staffLaptop = (
    <PanelCard title="Staff" count={team.length} testId="staff-table">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="border-b border-bb-border text-left">
            {['', 'Name', 'Where', 'Overtime', ...(isOwner ? ['Day cost', 'OT', 'Total'] : [])].map((h, i) => (
              <th key={i} className={`py-2.5 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-bb-muted ${i >= 4 ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {team.map(p => {
            const { entry, on, row, where } = personState(p);
            return (
              <tr key={p.id} className="border-b border-gray-100" data-testid={`person-${p.id}`}>
                <td className="py-2 px-3 w-10"><input type="checkbox" aria-label={`${p.name} worked today`} checked={on} onChange={e => toggle(p, e.target.checked)} className="w-[18px] h-[18px] accent-[var(--color-bb-accent,#7c3aed)] cursor-pointer" data-testid={`tick-${p.id}`} /></td>
                <td className="py-2 px-3"><b className="block">{p.name}</b><span className="text-[12px] text-bb-muted">{payLine(p, isOwner)}</span>{paidTick(p, row) && <div className="mt-1">{paidTick(p, row)}</div>}</td>
                <td className="py-2 px-3">{(entry || p.pay === 'monthly') ? <Pills size="sm" options={whereOpts} value={where} onChange={v => setWhere(p, v)} testId={`where-${p.id}`} /> : <span className="text-bb-muted">Not today</span>}</td>
                <td className="py-2 px-3">{(entry || p.pay === 'monthly') && where !== 'leave' ? <HoursInput value={entry?.otHours} onChange={v => setOt(p, v)} testId={`ot-${p.id}`} /> : '—'}</td>
                {isOwner && <>
                  <td className="py-2 px-3 text-right tabular-nums">{row ? rupees(row.pay) : '—'}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{row?.ot ? rupees(row.ot) : '—'}</td>
                  <td className={`py-2 px-3 text-right tabular-nums font-semibold ${row && row.where !== 'events' ? 'text-gray-500' : ''}`}>{row ? rupees(row.total) : '—'}</td>
                </>}
              </tr>
            );
          })}
          {isOwner && (
            <tr className="bg-bb-bg/70 font-bold">
              <td /><td colSpan={3} className="py-2.5 px-3 text-bb-accent-hover">{d.rows.length} people</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-bb-accent-hover">{rupees(d.rows.reduce((t, r) => t + r.pay, 0))}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-bb-accent-hover">{rupees(d.rows.reduce((t, r) => t + r.ot, 0))}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-bb-accent-hover">{rupees(d.rows.reduce((t, r) => t + r.total, 0))}</td>
            </tr>
          )}
        </tbody>
      </table>
    </PanelCard>
  );

  const costsBlock = (
    <PanelCard title="Shared costs" count={sheet.costs.length} action={<LinkButton onClick={() => setAddOpen(true)} testId="add-cost">+ Add a cost</LinkButton>} testId="costs">
      <div className="divide-y divide-bb-border">
        {sheet.costs.length === 0 && <p className="px-4 py-3 text-[14px] text-gray-600">No costs yet — food, fuel, small shopping…</p>}
        {sheet.costs.map(c => (
          <div key={c.id} className="flex items-center gap-3 px-4 lg:px-5 py-2.5" data-testid={`cost-${c.label}`}>
            <span className="flex-1 min-w-0">
              <b className="block text-[15px] text-bb-text truncate">{c.label}</b>
              <span className="block text-[12.5px] text-gray-600">{columnLabel(c.column)}</span>
            </span>
            <MoneyInput size="sm" value={c.amount} onChange={v => setCost(c.id, v)} className="w-[140px]" placeholder="—" aria-label={`${c.label} amount`} />
            <IconButton icon={Trash2} label={`Remove ${c.label}`} tone="red" size={isPhone ? 44 : 36} iconSize={isPhone ? 19 : 16} onClick={() => removeCost(c.id)} />
          </div>
        ))}
        {sheet.costs.length > 0 && <div className="flex justify-between px-4 lg:px-5 py-3 font-bold"><span>Total</span><span className="tabular-nums text-bb-accent-hover" data-testid="costs-total">{rupees(d.shared)}</span></div>}
      </div>
    </PanelCard>
  );

  const sharedBlock = isOwner && (
    <section data-testid="how-shared">
      <SectionLabel className="mb-2">How it’s shared</SectionLabel>
      <div className="bg-white border border-bb-border rounded-2xl px-4 lg:px-5">
        <SumRow label="Staff at events (incl. overtime)" value={rupees(d.staffAtEvents)} testId="sum-staff" />
        <SumRow label="Shared costs" value={rupees(d.shared)} testId="sum-costs" />
        <SumRow label="Event-day costs" strong value={rupees(d.eventDay)} testId="sum-eventday"
          sub={fns.length ? `÷ ${fns.length} ${fns.length === 1 ? 'event' : 'events'} = ${d.each.map(rupees).join(' / ')}, added to each event’s Job Log` : 'No events today — everything is running cost'} />
        <SumRow label="Running cost" value={rupees(d.running)} sub="Warehouse, leave, no-event days · not added to any event" testId="sum-running" />
        <p className="text-[12.5px] text-gray-600 py-3">Shares are in whole rupees. If a day doesn’t split evenly, the extra ₹1 or ₹2 goes to the first event, so the totals always match.</p>
      </div>
    </section>
  );

  const eventsBlock = fns.length > 0 && (isPhone ? (
    <section>
      <SectionLabel className="mb-2" right={isOwner ? <span className="text-[13px] text-gray-600 font-semibold">{d.eventDay ? `${rupees(d.each[0])} each` : ''}</span> : null}>Events today · {fns.length}</SectionLabel>
      <div className="bg-white border border-bb-border rounded-2xl divide-y divide-bb-border" data-testid="events-today">
        {evRows.map(r => (
          <div key={r.f.key} className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1 min-w-0">
              <b className="block text-[15px] truncate">{r.f.client} · {r.f.name}</b>
              <span className="block text-[13px] text-gray-600 truncate">{r.f.location}{isOwner && r.revenue ? ` · ${rupees(r.revenue)}` : ''}</span>
            </span>
            {isOwner && <span className="text-right"><span className="block text-[12px] text-gray-600">Share</span><b className="tabular-nums">{rupees(r.share)}</b></span>}
          </div>
        ))}
      </div>
    </section>
  ) : (
    <PanelCard title="Events today" count={fns.length} testId="events-today">
      <table className="w-full text-[13.5px]">
        <thead><tr className="border-b border-bb-border text-left">
          {['Event', 'Venue', ...(isOwner ? ['Revenue', 'Own costs', 'Day share', 'Job Log profit'] : [])].map((h, i) => (
            <th key={i} className={`py-2.5 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-bb-muted ${i >= 2 ? 'text-right' : ''}`}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {evRows.map(r => (
            <tr key={r.f.key} className="border-b border-gray-100 cursor-pointer hover:bg-bb-card-hover" onClick={() => navigate(`/job/${r.f.eventId}`)}>
              <td className="py-2.5 px-3 font-bold">{r.f.client} · {r.f.name}</td>
              <td className="py-2.5 px-3 text-gray-600">{r.f.location}</td>
              {isOwner && <>
                <td className="py-2.5 px-3 text-right tabular-nums">{rupees(r.revenue)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{rupees(r.own)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{rupees(r.share)}</td>
                <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${r.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{r.hasAny ? rupees(r.profit) : '—'}</td>
              </>}
            </tr>
          ))}
          {isOwner && (
            <tr className="bg-bb-bg/70 font-bold text-bb-accent-hover">
              <td colSpan={2} className="py-2.5 px-3 text-bb-text">Total</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{rupees(revenue)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{rupees(own)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{rupees(d.eventDay)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{rupees(evRows.reduce((t, r) => t + (r.hasAny ? r.profit : 0), 0))}</td>
            </tr>
          )}
        </tbody>
      </table>
      {isOwner && <p className="px-5 py-2.5 text-[12px] text-bb-muted">Job Log profit counts every day of an event, so an event running several days shows its whole profit here.</p>}
    </PanelCard>
  ));

  const officeBlock = office.length > 0 && (
    <div className="bg-white border border-bb-border rounded-2xl px-4 py-3" data-testid="office-card">
      <b className="block text-[15px]">Office staff · {office.length}</b>
      <span className="block text-[13px] text-gray-600">{office.map(p => p.name).join(', ')} · counted by themselves as office salaries · not in today’s costs</span>
    </div>
  );

  const notesBlock = (
    <section>
      <SectionLabel className="mb-2">Notes</SectionLabel>
      <div className="bg-white border border-bb-border rounded-2xl p-4">
        <TextField as="textarea" value={sheet.notes || ''} onChange={e => setNotes(e.target.value)} placeholder="Which truck went where, anything to remember…" aria-label="Notes" data-testid="day-notes" />
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      {isPhone ? daySwitch(false) : <>
        <PageHeader title={`Day sheet · ${formatDateWithDay(date)}`} onBack={() => navigate('/day-sheets')}
          sub={<>{fns.length ? `${fns.length} ${fns.length === 1 ? 'event' : 'events'}` : 'No events'}{stored?.updatedByName ? ` · filled by ${stored.updatedByName}` : ''} · saves by itself · {statusEl}</>}
          actions={isOwner && <>
            <HeaderText icon={Download} onClick={handleExcel} data-testid="day-excel">Excel</HeaderText>
            <HeaderText icon={Printer} onClick={() => printDoc(exportDoc())} data-testid="day-print">Print</HeaderText>
          </>} />
        <div className="bg-white border border-bb-border rounded-2xl px-3 py-2 flex items-center gap-3">{daySwitch(true)}{!filled && <Tag tone="amber">Not filled</Tag>}</div>
      </>}

      {!filled && (
        <Notice testId="not-filled">
          Not filled yet. {isOwner ? 'Monthly staff are counted as running cost until it is.' : ''} Tick who worked and add the day’s costs — it saves by itself.
          <button onClick={() => change(x => x)} className="block mt-1.5 font-bold text-bb-accent-hover hover:underline cursor-pointer min-h-[32px]" data-testid="fill-as-shown">Save the day as shown</button>
        </Notice>
      )}

      {/* === NUMBERS (owners) === */}
      {isOwner && (isPhone ? (
        <>
          <div className="grid grid-cols-3 gap-2 bg-white border border-bb-border rounded-2xl p-3 text-center" data-testid="day-cards">
            <div><p className="text-[13px] text-gray-600">Revenue</p><b className="text-[16px] tabular-nums text-amber-600">{rupees(revenue)}</b></div>
            <div><p className="text-[13px] text-gray-600">Day costs</p><b className="text-[16px] tabular-nums text-rose-600" data-testid="day-total">{rupees(d.total)}</b></div>
            <div><p className="text-[13px] text-gray-600">Profit</p><b className={`text-[16px] tabular-nums ${dayProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fns.length ? rupees(dayProfit) : '—'}</b></div>
          </div>
          {fns.length > 0 && <p className="text-[12.5px] text-gray-600 text-center -mt-2">Profit after each event’s own costs ({rupees(own)}) and today’s share</p>}
        </>
      ) : (
        <StatRow items={[
          { label: 'Revenue', value: rupees(revenue), hint: `${fns.length} ${fns.length === 1 ? 'event' : 'events'}, before GST` },
          { label: 'Event-day costs', value: rupees(d.eventDay), tone: 'red', hint: 'Staff at events + shared', testId: 'day-eventday' },
          { label: 'Each event', value: fns.length ? rupees(d.each[0] || 0) : '—', hint: fns.length ? `Split equally ÷ ${fns.length}` : 'No events' },
          { label: 'Running cost', value: rupees(d.running), hint: 'Warehouse + leave', testId: 'day-running' },
          { label: 'Day profit', value: fns.length ? rupees(dayProfit) : '—', tone: dayProfit >= 0 ? 'green' : 'red', hint: `After own costs ${rupees(own)}` },
        ]} />
      ))}

      {eventsBlock}
      {isPhone ? <section><SectionLabel className="mb-2" right={isOwner ? <span className="text-[13px] text-gray-600 font-semibold">{rupees(d.staffAtEvents)} at events</span> : null}>Staff · {team.length}</SectionLabel>{staffPhone}</section> : staffLaptop}
      {officeBlock}
      {costsBlock}
      {sharedBlock}
      {notesBlock}

      {isOwner && filled && (
        <div className="flex justify-center">
          <button onClick={clearDay} className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-rose-200 bg-white text-[14.5px] font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer active:scale-95 transition" data-testid="clear-day"><Trash2 size={16} />Clear this Day sheet</button>
        </div>
      )}

      {isPhone && <>
        <ActionBarSpacer />
        <ActionBar label={<>{isOwner ? 'Day costs' : formatDateWithDay(date)} · {statusEl}</>} value={isOwner ? rupees(d.total) : ''}>
          <Button size="lg" onClick={async () => { await flush(); navigate('/day-sheets'); }} data-testid="day-done">Done</Button>
        </ActionBar>
      </>}

      <AddCostSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={addCost} columns={costColumns} canKeep={isOwner}
        defaultColumn={costColumns.find(c => c.id === 'other')?.id || costColumns[costColumns.length - 1]?.id || 'other'}
        suggestions={[...new Set(Object.values(daySheets).flatMap(s => (s.costs || []).map(c => c.label)))]} />
    </div>
  );
}

// ============================================================
// AddCostSheet — what for · amount · Job Log column · keep every day
// ============================================================
function AddCostSheet({ open, onClose, onAdd, columns, defaultColumn, canKeep, suggestions }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [column, setColumn] = useState(defaultColumn);
  const [keep, setKeep] = useState(false);
  useEffect(() => { if (open) { setLabel(''); setAmount(''); setColumn(defaultColumn); setKeep(false); } }, [open, defaultColumn]);
  const ok = label.trim() && amount !== '' && amount >= 0;
  return (
    <BottomSheet open={open} onClose={onClose} title="Add a cost" testId="add-cost-sheet"
      footer={<div className="flex gap-2.5">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button size="lg" className="flex-[1.4]" disabled={!ok} onClick={() => onAdd({ label: label.trim(), amount, column, keep })} data-testid="add-cost-save">Add cost</Button>
      </div>}>
      <div className="space-y-4">
        <TextField label="What for" required value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Generator diesel" list="day-cost-names" hint="Picks from costs you used before" data-testid="cost-label" />
        <datalist id="day-cost-names">{suggestions.map(s => <option key={s} value={s} />)}</datalist>
        <MoneyInput label="Amount" required value={amount} onChange={setAmount} testId="cost-amount" />
        <label className="block">
          <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">Goes to Job Log column</span>
          <Select value={column} onChange={e => setColumn(e.target.value)} data-testid="cost-column"
            className="w-full min-h-[48px] rounded-xl border border-bb-border bg-bb-input px-3.5 text-[16px] cursor-pointer">
            {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
          <span className="block text-[12.5px] text-gray-600 mt-1.5">Shared across today’s events in that column</span>
        </label>
        {canKeep && <SwitchRow title="Keep this row every day" sub="Shows on new Day sheets, empty" checked={keep} onChange={setKeep} testId="cost-keep" />}
      </div>
    </BottomSheet>
  );
}
