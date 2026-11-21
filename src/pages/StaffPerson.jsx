/**
 * StaffPerson — one person in Staff & wages: the month's breakdown (earned,
 * overtime, paid early, advance taken back, to pay), payments, advance, and
 * their Day sheet days. Owners only.
 *
 * Phones: name card with Call / WhatsApp, ‹ month ›, breakdown, cards, and a
 * pinned bar (To pay · Mark as paid). Laptops: same cards in two columns,
 * Record payment and Mark as paid in the title row.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Edit3, Phone, MessageCircle, Plus, Check, Trash2, Users } from 'lucide-react';
import Button from '../components/Button';
import ActionBar, { ActionBarSpacer } from '../components/ActionBar';
import { useConfirm } from '../components/useConfirm';
import { useIsPhone } from '../components/useIsPhone';
import { usePhoneHeader } from '../components/phoneScreens';
import { HeaderIconButton } from '../components/PhoneHeader';
import { IconButton } from '../components/PhoneUI';
import { PageHeader, HeaderText } from '../components/LaptopUI';
import { StepSwitcher, Avatar, Tag, PanelCard, LinkButton, SumRow, EmptyState } from '../components/StaffUI';
import { StaffFormSheet, RecordPaymentSheet, MarkPaidSheet } from '../components/StaffSheets';
import { useDaySheets } from '../components/useDaySheets';
import { staffMonth, carriedIn, advanceStatus, monthOf, datesOfMonth } from '../utils/staffCosts';
import { rupees, monthLabel, addMonths, dayMonth } from '../utils/staffFormat';
import { WHERE_LABEL } from '../utils/daySheetDocs';
import { telLink, waLink } from '../utils/helpers';

const TYPE_LABEL = { early: 'Paid early', advance: 'Advance', bonus: 'Bonus', pay: 'Paid' };

// ============================================================
// StaffPerson — MAIN COMPONENT
// ============================================================
export default function StaffPerson() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isPhone = useIsPhone();
  const { cfg, today, staff, staffPayments, daySheets, isOwner, deleteStaffPayment, deleteStaffPerson, showToast } = useDaySheets();
  const person = staff.find(p => p.id === id);
  const [ym, setYm] = useState(() => params.get('m') || monthOf(today));
  const [edit, setEdit] = useState(false);
  const [record, setRecord] = useState(null);     // null | { editing }
  const [markPaid, setMarkPaid] = useState(false);

  // ------------------------------------------------------------
  // DERIVED
  // ------------------------------------------------------------
  const s = useMemo(() => (person ? staffMonth(person, ym, daySheets, staffPayments, cfg.startDate) : null), [person, ym, daySheets, staffPayments, cfg.startDate]);
  const carried = useMemo(() => (person ? carriedIn(person, ym, daySheets, staffPayments, cfg.startDate) : 0), [person, ym, daySheets, staffPayments, cfg.startDate]);
  const adv = useMemo(() => advanceStatus(id, staffPayments), [id, staffPayments]);
  const mine = useMemo(() => staffPayments.filter(x => x.staffId === id), [staffPayments, id]);
  const monthPays = mine.filter(x => (x.forMonth || monthOf(x.date)) === ym).sort((a, b) => b.date.localeCompare(a.date));
  const advances = mine.filter(x => x.type === 'advance').sort((a, b) => b.date.localeCompare(a.date));
  const myDays = useMemo(() => datesOfMonth(ym).filter(d => daySheets[d]?.staff?.[id]).reverse().map(d => ({ date: d, ...daySheets[d].staff[id] })), [daySheets, ym, id]);
  const otHours = myDays.filter(d => d.where !== 'leave').reduce((t, d) => t + (Number(d.otHours) || 0), 0);
  const due = s ? s.toPay + carried : 0;
  const hasHistory = mine.length > 0 || Object.values(daySheets).some(sh => sh.staff?.[id]);
  const firstMonth = cfg.startDate ? monthOf(cfg.startDate) : monthOf(today);
  const cycle = person?.payCycle || cfg.payCycle;
  const perWord = person?.pay === 'monthly' || cycle === 'monthly' ? 'month' : cycle === 'weekly' ? 'week' : 'pay';
  const clearBy = adv.owed && adv.recoverPerPay ? Math.ceil(adv.owed / adv.recoverPerPay) : 0;

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const removePay = async (x) => {
    const ok = await confirm({ title: `Delete this ${TYPE_LABEL[x.type].toLowerCase()} entry?`, message: `${rupees(x.amount)} on ${dayMonth(x.date)}${x.advanceBack ? ` (and ${rupees(x.advanceBack)} advance taken back)` : ''}.`, note: 'The month’s numbers are worked out again.', confirmLabel: 'Delete', tone: 'danger' });
    if (ok && (await deleteStaffPayment(x.id)).success) showToast('Payment deleted');
  };
  const removePerson = async () => {
    const ok = await confirm({ title: `Remove ${person.name}?`, message: 'They have no days or payments yet, so nothing else changes.', confirmLabel: 'Remove', tone: 'danger' });
    if (ok && (await deleteStaffPerson(person.id)).success) { showToast(`${person.name} removed`); navigate('/staff'); }
  };

  usePhoneHeader({
    title: person?.name || 'Staff',
    sub: person ? `${person.worksIn === 'office' ? 'Office · ' : ''}${person.pay === 'monthly' ? 'Monthly' : 'Daily'} · ${rupees(person.amount)} · paid every ${cycle === 'daily' && person.pay === 'daily' ? 'day' : cycle === 'weekly' && person.pay === 'daily' ? 'week' : 'month end'}` : '',
    right: person ? <HeaderIconButton icon={Edit3} label="Edit" onClick={() => setEdit(true)} data-testid="person-edit" /> : null,
  }, [person, cycle]);

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  if (!isOwner || !person) return <EmptyState icon={Users} title={!isOwner ? 'Only the account owner can see this' : 'This person isn’t in your staff list'} action={isOwner ? <Button onClick={() => navigate('/staff')}>Back to Staff & wages</Button> : null} />;

  const nameCard = (
    <div className="bg-white border border-bb-border rounded-2xl p-4 flex items-center gap-3">
      <Avatar name={person.name} size={44} />
      <span className="flex-1 min-w-0">
        <b className="block text-[16px] truncate">{person.name}</b>
        <span className="flex gap-1.5 mt-1 flex-wrap">
          <Tag tone="violet">{person.pay === 'monthly' ? 'Monthly' : 'Daily wage'}</Tag>
          {person.worksIn === 'office' && <Tag tone="blue">Office{person.role ? ` · ${person.role}` : ''}</Tag>}
          {person.endDate && <Tag tone="gray">Left {dayMonth(person.endDate)}</Tag>}
        </span>
      </span>
      {person.phone && <>
        <IconButton as="a" href={telLink(person.phone)} icon={Phone} label={`Call ${person.name}`} />
        <IconButton as="a" href={waLink(person.phone)} target="_blank" rel="noreferrer" icon={MessageCircle} tone="green" label={`WhatsApp ${person.name}`} />
      </>}
    </div>
  );

  const monthSwitch = (
    <StepSwitcher compact={!isPhone} label={monthLabel(ym)} testId="person-month" prevLabel="Previous month" nextLabel="Next month"
      onPrev={() => setYm(addMonths(ym, -1))} onNext={() => setYm(addMonths(ym, 1))} prevDisabled={ym <= firstMonth} nextDisabled={ym >= monthOf(today)} />
  );

  const breakdown = (
    <div className="bg-white border border-bb-border rounded-2xl px-4 lg:px-5" data-testid="person-breakdown">
      <SumRow label="Earned" value={rupees(s.earned)} testId="pb-earned"
        sub={person.pay === 'monthly' ? `${s.days} days${s.leave ? ` worked + ${s.leave} paid leave` : ''}${person.worksIn === 'office' ? '' : ' (salary ÷ days in the month)'}` : `${s.days} days worked`} />
      {person.worksIn !== 'office' && <SumRow label="Overtime" value={`+ ${rupees(s.ot)}`} tone="text-emerald-600" sub={`${otHours} hours from Day sheets`} testId="pb-ot" />}
      {s.paidEarly > 0 && <SumRow label="Paid early" value={`− ${rupees(s.paidEarly)}`} sub={`${monthPays.filter(x => x.type === 'early').length} times this month`} testId="pb-early" />}
      {s.paid > 0 && <SumRow label="Paid" value={`− ${rupees(s.paid)}`} testId="pb-paid" />}
      {s.advanceBack > 0 && <SumRow label="Advance taken back" value={`− ${rupees(s.advanceBack)}`} sub={`${rupees(adv.owed)} still owed`} testId="pb-back" />}
      {carried !== 0 && <SumRow label={carried > 0 ? 'Left from earlier months' : 'Paid extra earlier'} value={`${carried > 0 ? '+' : '−'} ${rupees(Math.abs(carried))}`} testId="pb-carried" />}
      <SumRow label={due < 0 ? 'Paid extra' : 'To pay'} strong value={rupees(Math.abs(due))} testId="pb-topay" />
      {s.bonus > 0 && <p className="text-[12.5px] text-gray-600 pb-3">Bonus this month: {rupees(s.bonus)} (paid on the spot, an extra cost)</p>}
    </div>
  );

  const payments = (
    <PanelCard title="Payments this month" action={<LinkButton onClick={() => setRecord({ editing: null })} testId="record-payment-btn">+ Record payment</LinkButton>} testId="person-payments">
      {!monthPays.length ? <p className="px-4 py-3 text-[14px] text-gray-600">Nothing paid in {monthLabel(ym)} yet.</p> : (
        <div className="divide-y divide-bb-border">
          {monthPays.map(x => (
            <div key={x.id} className="flex items-center gap-3 px-4 lg:px-5 py-3" data-testid={`pay-${x.id}`}>
              <button className="flex-1 min-w-0 text-left cursor-pointer" onClick={() => x.type !== 'pay' && setRecord({ editing: x })} disabled={x.type === 'pay'}>
                <b className="block text-[15px]">{dayMonth(x.date)} · {TYPE_LABEL[x.type]}{x.method ? ` · ${x.method}` : ''}</b>
                <span className="block text-[13px] text-gray-600">{[x.note, x.type === 'advance' ? (x.recoverPerPay ? `${rupees(x.recoverPerPay)} a ${perWord} back` : 'all back from the next pay') : '', x.advanceBack ? `${rupees(x.advanceBack)} advance taken back` : '', x.forMonth && monthOf(x.date) !== x.forMonth ? `for ${monthLabel(x.forMonth)}` : ''].filter(Boolean).join(' · ')}</span>
              </button>
              {x.type === 'advance' && <Tag tone="amber">Advance</Tag>}
              {x.type === 'bonus' && <Tag tone="green">Bonus</Tag>}
              <b className="tabular-nums">{rupees(x.amount)}</b>
              <IconButton icon={Trash2} label="Delete payment" tone="quiet" size={32} iconSize={15} onClick={() => removePay(x)} />
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );

  const advanceCard = adv.total > 0 && (
    <PanelCard title="Advance" testId="person-advance">
      <div className="px-4 lg:px-5 py-3 space-y-2">
        <b className="block text-[15.5px]">{adv.owed ? `${rupees(adv.owed)} still owed of ${rupees(adv.total)}` : `All ${rupees(adv.total)} taken back`}</b>
        <div className="h-2 rounded-full bg-violet-100 overflow-hidden"><div className="h-full bg-bb-accent" style={{ width: `${Math.round(((adv.total - adv.owed) / adv.total) * 100)}%` }} /></div>
        <p className="text-[13px] text-gray-600">
          {advances[0] ? `Last taken on ${dayMonth(advances[0].date)} · ` : ''}
          {adv.owed ? (adv.recoverPerPay ? `${rupees(adv.recoverPerPay)} taken back each ${perWord}${clearBy ? ` · cleared in ${clearBy} more` : ''}` : 'All taken back from the next pay') : 'Closed'}
        </p>
      </div>
    </PanelCard>
  );

  const daysCard = person.worksIn !== 'office' && (
    <PanelCard title="Day sheets" count={myDays.length} testId="person-days">
      {!myDays.length ? <p className="px-4 py-3 text-[14px] text-gray-600">No Day sheet entries in {monthLabel(ym)}.</p> : (
        <div className="divide-y divide-bb-border">
          {myDays.map(d => (
            <button key={d.date} onClick={() => navigate(`/day-sheets/${d.date}`)} className="w-full flex justify-between px-4 lg:px-5 py-2.5 text-[14.5px] hover:bg-bb-card-hover cursor-pointer">
              <span>{dayMonth(d.date)} · {WHERE_LABEL[d.where] || d.where}</span><span className="text-gray-600">{d.otHours ? `OT ${d.otHours} h` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </PanelCard>
  );

  return (
    <div className="space-y-4">
      {!isPhone && (
        <PageHeader title={person.name} onBack={() => navigate('/staff')}
          sub={`${person.worksIn === 'office' ? `Office${person.role ? ` · ${person.role}` : ''} · ` : ''}${person.pay === 'monthly' ? 'Monthly' : 'Daily'} ${rupees(person.amount)}${person.ot?.rate && person.worksIn !== 'office' ? ` · OT ${rupees(person.ot.rate)}${person.ot.mode === 'night' ? ' a late night' : '/h'}` : ''}`}
          actions={<>
            <HeaderText icon={Edit3} onClick={() => setEdit(true)} data-testid="person-edit">Edit</HeaderText>
            <HeaderText icon={Plus} onClick={() => setRecord({ editing: null })} data-testid="record-payment-top">Record payment</HeaderText>
            <HeaderText icon={Check} primary onClick={() => setMarkPaid(true)} disabled={due <= 0 && !adv.owed} data-testid="mark-paid-btn">Mark as paid</HeaderText>
          </>} />
      )}
      {isPhone ? <>{nameCard}{monthSwitch}{breakdown}{payments}{advanceCard}{daysCard}</> : (
        <>
          <div className="flex items-center gap-3 bg-white border border-bb-border rounded-2xl px-3 py-2">{monthSwitch}<span className="flex-1" /><b className="text-[15px] pr-2">{due < 0 ? 'Paid extra' : 'To pay'} {rupees(Math.abs(due))}</b></div>
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="space-y-4">{nameCard}{breakdown}{advanceCard}</div>
            <div className="space-y-4">{payments}{daysCard}</div>
          </div>
        </>
      )}

      {isPhone && <>
        <ActionBarSpacer />
        <ActionBar label={<>{due < 0 ? 'Paid extra' : 'To pay'} · <span className="text-emerald-600 font-semibold">{monthLabel(ym).split(' ')[0]}</span></>} value={rupees(Math.abs(due))}>
          <Button size="lg" onClick={() => setMarkPaid(true)} disabled={due <= 0 && !adv.owed} data-testid="mark-paid-btn">Mark as paid</Button>
        </ActionBar>
      </>}

      <StaffFormSheet open={edit} onClose={() => setEdit(false)} editing={person} canDelete={!hasHistory} onDelete={removePerson} />
      <RecordPaymentSheet open={!!record} onClose={() => setRecord(null)} person={person} editing={record?.editing || null} />
      <MarkPaidSheet open={markPaid} onClose={() => setMarkPaid(false)} person={person} s={s} carried={carried} ym={ym} />
    </div>
  );
}
