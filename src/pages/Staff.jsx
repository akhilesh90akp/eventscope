/**
 * Staff — "Staff & wages": the people, what each earned this month from the
 * Day sheets, what's been paid and what's left. Owners only (pay is private;
 * the Firestore rules refuse everyone else).
 *
 * Phones: intro, ‹ month ›, To pay / Advances cards, Default overtime,
 * "+ Add staff", Events team list, Office list (only when someone is office).
 * Laptops: title row (Excel · Print · Add staff), ‹ month › strip, StatRow,
 * one table with a Total row; "Default overtime" sits in Settings → Day sheets.
 *
 * Money rules: utils/staffCosts.js (staffMonth, carriedIn, advanceStatus).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, Printer, ChevronRight, Lock, Users } from 'lucide-react';
import Button from '../components/Button';
import { useIsPhone } from '../components/useIsPhone';
import { usePhoneHeader } from '../components/phoneScreens';
import { HeaderIconButton } from '../components/PhoneHeader';
import { SectionLabel } from '../components/PhoneUI';
import { PageHeader, HeaderText, StatRow } from '../components/LaptopUI';
import { StepSwitcher, PhoneStat, Avatar, Tag, DefaultOt, EmptyState } from '../components/StaffUI';
import { rupees, monthLabel, addMonths, staffLine } from '../utils/staffFormat';
import { StaffFormSheet, RecordPaymentSheet } from '../components/StaffSheets';
import { useDaySheets, useStaffMonth } from '../components/useDaySheets';
import { monthOf } from '../utils/staffCosts';
import { salaryDoc } from '../utils/daySheetDocs';
import { downloadExcel, printDoc } from '../utils/staffExcel';

// ============================================================
// Staff — MAIN COMPONENT
// ============================================================
export default function Staff() {
  const { cfg, today, isOwner, daySheetsOn, settings, updateSettings, showToast } = useDaySheets();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const [ym, setYm] = useState(() => monthOf(today));
  const [form, setForm] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const list = useStaffMonth(ym);

  // ------------------------------------------------------------
  // DERIVED
  // ------------------------------------------------------------
  const team = list.filter(x => x.p.worksIn !== 'office');
  const office = list.filter(x => x.p.worksIn === 'office');
  const sum = (k) => list.reduce((t, x) => t + (k === 'due' ? x.due : x.s[k]), 0);
  const toPay = list.reduce((t, x) => t + Math.max(0, x.due), 0);
  const owing = list.filter(x => x.s.advanceOwed > 0);
  const firstMonth = cfg.startDate ? monthOf(cfg.startDate) : monthOf(today);

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const exportDoc = () => salaryDoc({ company: settings.companyName, ym, list: list.map(x => ({ p: x.p, s: { ...x.s, toPay: x.due } })) });
  const handleExcel = async () => {
    try { await downloadExcel(exportDoc(), `${settings.companyName || 'Company'} Salary sheet ${monthLabel(ym)}.xlsx`); }
    catch (err) { console.error('Salary Excel failed:', err); showToast('Couldn’t make the Excel file — please try again.', 'error'); }
  };
  const saveOt = (ot) => updateSettings({ daySheets: { ...(settings.daySheets || {}), defaultOt: ot } });

  usePhoneHeader({
    title: 'Staff & wages',
    right: isOwner && daySheetsOn ? <HeaderIconButton icon={Download} label="Download salary sheet" onClick={handleExcel} disabled={!list.length} data-testid="staff-excel" /> : null,
  }, [list, isOwner, daySheetsOn, ym]);

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  if (!isOwner) {
    return <EmptyState icon={Lock} title="Staff & wages are only visible to the account owner" line="Pay and payments stay private to owners." />;
  }
  if (!daySheetsOn) {
    return <EmptyState icon={Users} title="Day sheets are switched off" line="Switch them on in Settings to use Staff & wages." action={<Button onClick={() => navigate('/settings/daysheets')}>Open Settings</Button>} />;
  }

  const monthSwitch = (compact) => (
    <StepSwitcher compact={compact} label={monthLabel(ym)} testId="staff-month" prevLabel="Previous month" nextLabel="Next month"
      onPrev={() => setYm(addMonths(ym, -1))} onNext={() => setYm(addMonths(ym, 1))} prevDisabled={ym <= firstMonth} nextDisabled={ym >= monthOf(today)} />
  );
  const dueTag = (x) => (x.due > 0 ? <Tag tone="violet">To pay {rupees(x.due)}</Tag> : x.due < 0 ? <Tag tone="blue">Paid {rupees(-x.due)} extra</Tag> : x.s.earned ? <Tag tone="green">Paid</Tag> : null);
  const row = (x) => (
    <button key={x.p.id} onClick={() => navigate(`/staff/${x.p.id}?m=${ym}`)} data-testid={`staff-${x.p.id}`}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer hover:bg-bb-card-hover">
      <Avatar name={x.p.name} />
      <span className="flex-1 min-w-0">
        <b className="block text-[15.5px] text-bb-text truncate">{x.p.name}{x.p.endDate ? <span className="text-[12px] font-semibold text-gray-500"> · left {x.p.endDate}</span> : ''}</b>
        <span className="block text-[13px] text-gray-600">{staffLine(x.p)}</span>
      </span>
      <span className="flex flex-col items-end gap-1">{dueTag(x)}{x.s.advanceOwed > 0 && <Tag tone="amber">Owes {rupees(x.s.advanceOwed)}</Tag>}</span>
      <ChevronRight size={18} className="text-bb-muted shrink-0" />
    </button>
  );

  return (
    <div className="space-y-4">
      {isPhone ? <>
        <p className="text-[13.5px] text-gray-600">The people who work at your events. Their day cost fills the Day sheet; payments and advances are tracked here. They don’t need to sign in.</p>
        {monthSwitch(false)}
        <div className="grid grid-cols-2 gap-3">
          <PhoneStat label="To pay at month end" value={rupees(toPay)} sub={`${list.filter(x => x.due > 0).length} of ${list.length} people`} testId="st-topay" />
          <PhoneStat label="Advances owed" value={rupees(sum('advanceOwed'))} tone={owing.length ? 'text-amber-800' : 'text-bb-text'} sub={`${owing.length} ${owing.length === 1 ? 'person' : 'people'}`} testId="st-owed" />
        </div>
        <DefaultOt value={cfg.defaultOt} onSave={saveOt} />
        <Button icon={Plus} fullWidth size="lg" onClick={() => setForm(true)} data-testid="add-staff">Add staff</Button>
      </> : <>
        <PageHeader title="Staff & wages" sub="What each person earned from the Day sheets, what you’ve paid, and what’s left"
          actions={<>
            <HeaderText icon={Download} onClick={handleExcel} disabled={!list.length} data-testid="staff-excel">Excel</HeaderText>
            <HeaderText icon={Printer} onClick={() => printDoc(exportDoc())} disabled={!list.length} data-testid="staff-print">Print</HeaderText>
            <HeaderText icon={Plus} primary onClick={() => setForm(true)} data-testid="add-staff">Add staff</HeaderText>
          </>} />
        <div className="flex items-center gap-3 bg-white border border-bb-border rounded-2xl px-3 py-2">{monthSwitch(true)}</div>
        <StatRow items={[
          { label: 'Earned', value: rupees(sum('earned')), hint: office.length ? 'Events team + office' : 'Events team', testId: 'st-earned' },
          { label: 'Overtime', value: rupees(sum('ot')), tone: 'green', hint: 'From Day sheets', testId: 'st-ot' },
          { label: 'Paid so far', value: rupees(sum('paidEarly') + sum('paid')), hint: 'Paid early + paid', testId: 'st-paid' },
          { label: 'To pay', value: rupees(toPay), tone: 'accent', hint: 'Including anything left from earlier months', testId: 'st-topay' },
          { label: 'Advances owed', value: rupees(sum('advanceOwed')), tone: owing.length ? 'red' : '', hint: owing.map(x => x.p.name).join(', ') || 'None', testId: 'st-owed' },
        ]} />
      </>}

      {!list.length ? (
        <EmptyState icon={Users} title={`No staff in ${monthLabel(ym)}`} line="Add the people who work at your events. They don’t need to sign in." testId="staff-empty"
          action={<Button icon={Plus} onClick={() => setForm(true)}>Add staff</Button>} />
      ) : isPhone ? <>
        {team.length > 0 && <>
          <SectionLabel right={<span className="text-[12.5px] text-gray-600">Day cost goes to events or running cost</span>}>Events team · {team.length}</SectionLabel>
          <div className="bg-white border border-bb-border rounded-2xl divide-y divide-bb-border overflow-hidden" data-testid="team-list">{team.map(row)}</div>
        </>}
        {office.length > 0 && <>
          <SectionLabel right={<span className="text-[12.5px] text-gray-600">Pay goes to office salaries</span>}>Office · {office.length}</SectionLabel>
          <div className="bg-white border border-bb-border rounded-2xl divide-y divide-bb-border overflow-hidden" data-testid="office-list">{office.map(row)}</div>
          <p className="text-[12.5px] text-gray-600">Their pay is never shared into events.</p>
        </>}
      </> : (
        <div className="bg-white border border-bb-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5">
            <h2 className="text-[15px] font-bold">Staff in {monthLabel(ym)}</h2>
            <span className="inline-flex items-center justify-center min-w-[1.6rem] h-[22px] px-2 rounded-full bg-violet-100 text-violet-700 text-xs font-bold">{list.length}</span>
            <span className="flex-1" /><span className="text-[12.5px] text-bb-muted">Click a name to see their payments</span>
          </div>
          <table className="w-full text-[13.5px]" data-testid="staff-table">
            <thead><tr className="bg-[#f6f6f9] border-y border-bb-border text-left">
              {['Name', 'Pay', 'Days', 'Earned', 'Overtime', 'Paid early', 'Paid', 'Advance back', 'To pay', ''].map((h, i) => (
                <th key={i} className={`py-2.5 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-bb-muted ${i >= 3 && i <= 8 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {list.map(x => (
                <tr key={x.p.id} className="border-b border-gray-100 hover:bg-bb-card-hover" data-testid={`staff-${x.p.id}`}>
                  <td className="py-2.5 px-3"><button onClick={() => navigate(`/staff/${x.p.id}?m=${ym}`)} className="font-bold hover:text-bb-accent-hover cursor-pointer text-left">{x.p.name}</button>{x.p.worksIn === 'office' && <> <Tag tone="blue">Office</Tag></>}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{x.p.pay === 'monthly' ? 'Monthly' : 'Daily'} {rupees(x.p.amount)}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{x.s.leave ? `${x.s.days} + ${x.s.leave} leave` : x.p.pay === 'daily' ? `${x.s.days} ${x.s.days === 1 ? 'day' : 'days'}` : x.s.days}</td>
                  {['earned', 'ot', 'paidEarly', 'paid', 'advanceBack'].map(k => <td key={k} className="py-2.5 px-3 text-right tabular-nums">{x.s[k] ? rupees(x.s[k]) : '—'}</td>)}
                  <td className={`py-2.5 px-3 text-right tabular-nums font-bold ${x.due <= 0 && x.s.earned ? 'text-emerald-600' : ''}`} title={x.carried ? `Includes ${rupees(x.carried)} from earlier months` : undefined}>{x.due > 0 ? rupees(x.due) : x.due < 0 ? `${rupees(-x.due)} extra` : x.s.earned ? 'Paid' : '—'}</td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap"><button onClick={() => setPayFor(x.p)} className="text-[13px] font-semibold text-bb-accent-hover hover:underline cursor-pointer">Record payment</button></td>
                </tr>
              ))}
              <tr className="bg-bb-bg/70 font-bold text-bb-accent-hover">
                <td colSpan={3} className="py-3 px-3 text-bb-text">Total · {list.length} people</td>
                {['earned', 'ot', 'paidEarly', 'paid', 'advanceBack'].map(k => <td key={k} className="py-3 px-3 text-right tabular-nums">{rupees(sum(k))}</td>)}
                <td className="py-3 px-3 text-right tabular-nums">{rupees(toPay)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <StaffFormSheet open={form} onClose={() => setForm(false)} editing={null} onSaved={(id) => navigate(`/staff/${id}?m=${ym}`)} />
      <RecordPaymentSheet open={!!payFor} onClose={() => setPayFor(null)} person={payFor} />
    </div>
  );
}
