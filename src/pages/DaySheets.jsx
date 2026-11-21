/**
 * DaySheets — the month's Day sheets: one row per day from the start date to
 * today, with each day's cost (owners) and whether it was filled.
 *
 * Phones: ‹ month ›, "+ Today's Day sheet", four number cards, a yellow note
 * for days not filled, then the days (newest first). Excel in the title bar.
 * Laptops: title row (Excel · Print · Today's Day sheet), ‹ month › strip,
 * StatRow, a table of days with a Total row.
 *
 * Teammates who fill Day sheets (not owners) see the days and "Filled /
 * Not filled" — never money.
 *
 * Money rules: utils/staffCosts.js · data: AppContext (daySheets).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, Printer, ChevronRight, AlertCircle, ClipboardCheck, Settings as SettingsIcon } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import StickyBar from '../components/StickyBar';
import { useIsPhone } from '../components/useIsPhone';
import { usePhoneHeader } from '../components/phoneScreens';
import { HeaderIconButton } from '../components/PhoneHeader';
import { SectionLabel } from '../components/PhoneUI';
import { PageHeader, HeaderText, StatRow } from '../components/LaptopUI';
import { StepSwitcher, PhoneStat, Tag } from '../components/StaffUI';
import { rupees, monthLabel, addMonths, shortDay, dayMonth } from '../utils/staffFormat';
import { useDaySheets } from '../components/useDaySheets';
import { monthOf } from '../utils/staffCosts';
import { monthDoc } from '../utils/daySheetDocs';
import { downloadExcel, printDoc } from '../utils/staffExcel';

// ============================================================
// HELPERS
// ============================================================

/** Status of one day for the list: tag + sub-line */
function dayStatus(d, eventCount, staffCount) {
  if (!d.filled) return { tag: { tone: 'amber', text: 'Not filled' }, sub: eventCount ? `${eventCount} ${eventCount === 1 ? 'event' : 'events'} · monthly pay counted, rest missing` : 'Monthly pay counted, rest missing' };
  if (!eventCount) return { tag: { tone: 'gray', text: 'Warehouse' }, sub: `Warehouse · ${staffCount} staff` };
  return { tag: null, sub: `${eventCount} ${eventCount === 1 ? 'event' : 'events'} · ${staffCount} staff` };
}

// ============================================================
// DaySheets — MAIN COMPONENT
// ============================================================
export default function DaySheets() {
  const { cfg, today, month, byDate, isOwner, daySheetsOn, canFillDaySheets, daySheetsLoaded, settings, showToast } = useDaySheets();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const [ym, setYm] = useState(() => monthOf(today));
  const [busy, setBusy] = useState(false);

  // ------------------------------------------------------------
  // DERIVED
  // ------------------------------------------------------------
  const m = useMemo(() => (cfg.startDate ? month(ym) : null), [month, ym, cfg.startDate]);
  const days = useMemo(() => (m ? [...m.days].reverse() : []), [m]);
  const notFilled = days.filter(d => !d.filled);
  const eventDays = days.filter(d => d.eventDay > 0).length;
  const firstMonth = cfg.startDate ? monthOf(cfg.startDate) : monthOf(today);
  const staffCount = (d) => d.rows.filter(r => r.where === 'events' || r.where === 'warehouse').length;
  const range = days.length ? `${dayMonth(days[days.length - 1].date).split(' ')[0]}–${dayMonth(days[0].date)}` : '';

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const exportDoc = () => monthDoc({ company: settings.companyName, ym, month: m, byDate });
  const handleExcel = async () => {
    setBusy(true);
    try { await downloadExcel(exportDoc(), `${settings.companyName || 'Company'} Day sheets ${monthLabel(ym)}.xlsx`); }
    catch (err) { console.error('Day sheets Excel failed:', err); showToast('Couldn’t make the Excel file — please try again.', 'error'); }
    setBusy(false);
  };

  usePhoneHeader({
    right: isOwner && daySheetsOn && m ? <HeaderIconButton icon={Download} label="Download Excel" onClick={handleExcel} disabled={busy || !days.length} data-testid="daysheets-excel" /> : null,
  }, [busy, days.length, ym, isOwner, daySheetsOn, m]);

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  if (!daySheetsOn || !canFillDaySheets) {
    return (
      <Card>
        <div className="text-center py-10 space-y-3" data-testid="daysheets-off">
          <ClipboardCheck size={36} className="mx-auto text-bb-muted" />
          <p className="font-semibold text-bb-text">{!daySheetsOn ? 'Day sheets are switched off' : 'Ask the owner to let you fill Day sheets'}</p>
          {!daySheetsOn && isOwner && <Button icon={SettingsIcon} onClick={() => navigate('/settings/daysheets')}>Switch on in Settings</Button>}
        </div>
      </Card>
    );
  }

  const todayBtn = (
    <Button icon={Plus} fullWidth size="lg" onClick={() => navigate(`/day-sheets/${today}`)} disabled={today < cfg.startDate} data-testid="today-sheet">
      Today’s Day sheet
    </Button>
  );
  const monthSwitch = (compact) => (
    <StepSwitcher compact={compact} label={monthLabel(ym)} testId="month-switch" prevLabel="Previous month" nextLabel="Next month"
      onPrev={() => setYm(addMonths(ym, -1))} onNext={() => setYm(addMonths(ym, 1))}
      prevDisabled={ym <= firstMonth} nextDisabled={ym >= monthOf(today)} />
  );

  return (
    <div className="space-y-4">
      {/* === PHONE: ‹ month › + Today's Day sheet, pinned === */}
      {isPhone && <StickyBar className="!py-3 space-y-3" testId="daysheets-sticky">{monthSwitch(false)}{todayBtn}</StickyBar>}

      {/* === LAPTOP: title + strip === */}
      {!isPhone && <>
        <PageHeader title="Day sheets" sub="Who worked where each day, and what the day cost — shared across that day’s events"
          actions={<>
            {isOwner && <HeaderText icon={Download} onClick={handleExcel} disabled={busy || !days.length} data-testid="daysheets-excel">{busy ? 'Preparing…' : 'Excel'}</HeaderText>}
            {isOwner && <HeaderText icon={Printer} onClick={() => printDoc(exportDoc())} disabled={!days.length} data-testid="daysheets-print">Print</HeaderText>}
            <HeaderText icon={Plus} primary onClick={() => navigate(`/day-sheets/${today}`)} disabled={today < cfg.startDate} data-testid="today-sheet">Today’s Day sheet</HeaderText>
          </>} />
        <div className="flex items-center gap-3 bg-white border border-bb-border rounded-2xl px-3 py-2" data-testid="month-strip">
          {monthSwitch(true)}
          <span className="text-[13px] text-bb-muted">{range ? `${range} · ${days.length} days` : ''}</span>
        </div>
      </>}

      {today < cfg.startDate && (
        <p className="text-[13.5px] text-gray-600">Day sheets start on {shortDay(cfg.startDate)}. Change the date in Settings → Day sheets.</p>
      )}

      {/* === NUMBERS (owners) === */}
      {isOwner && m && (isPhone ? (
        <div className="grid grid-cols-2 gap-3">
          <PhoneStat label="This month so far" value={rupees(m.total)} tone="text-rose-600" sub={range ? `${range} · all costs` : ''} testId="ds-total" />
          <PhoneStat label="Running cost" value={rupees(m.running)} sub="Warehouse, off days, leave" testId="ds-running" />
          <PhoneStat label="Shared into events" value={rupees(m.eventDay)} sub={`${eventDays} event ${eventDays === 1 ? 'day' : 'days'}`} testId="ds-events" />
          <PhoneStat label="Not filled" value={notFilled.length} tone={notFilled.length ? 'text-amber-800' : 'text-bb-text'} sub={notFilled.slice(0, 4).map(d => dayMonth(d.date)).join(', ')} testId="ds-notfilled" />
        </div>
      ) : (
        <StatRow items={[
          { label: 'This month so far', value: rupees(m.total), tone: 'red', hint: range ? `${range} · all costs`  : '', testId: 'ds-total' },
          { label: 'Shared into events', value: rupees(m.eventDay), hint: `${eventDays} event ${eventDays === 1 ? 'day' : 'days'} · in each event’s Job Log`, testId: 'ds-events' },
          { label: 'Running cost', value: rupees(m.running), hint: 'Warehouse, off days, leave, days not filled', testId: 'ds-running' },
          { label: 'Office salaries', value: rupees(m.office), hint: 'Not part of any day', testId: 'ds-office' },
          { label: 'Not filled', value: notFilled.length, tone: notFilled.length ? 'red' : '', hint: notFilled.slice(0, 5).map(d => dayMonth(d.date)).join(', ') || 'All filled', testId: 'ds-notfilled' },
        ]} />
      ))}

      {notFilled.length > 0 && (
        <div className="flex gap-2.5 items-start rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[14px] text-amber-900" data-testid="notfilled-note">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{notFilled.length} {notFilled.length === 1 ? 'day is' : 'days are'} not filled yet. Monthly staff are counted for {notFilled.length === 1 ? 'it' : 'them'}; food, fuel and daily wages are missing.</span>
        </div>
      )}

      {/* === DAYS === */}
      {!daySheetsLoaded ? <p className="text-sm text-bb-muted">Loading…</p> : !days.length ? (
        <Card><p className="text-center text-bb-muted py-8">No days in {monthLabel(ym)} yet.</p></Card>
      ) : isPhone ? (
        <>
          <SectionLabel>{monthLabel(ym).split(' ')[0]} · {days.length} {days.length === 1 ? 'day' : 'days'}</SectionLabel>
          <div className="bg-white border border-bb-border rounded-2xl divide-y divide-bb-border overflow-hidden" data-testid="days-list">
            {days.map(d => {
              const st = dayStatus(d, (byDate[d.date] || []).length, staffCount(d));
              return (
                <button key={d.date} onClick={() => navigate(`/day-sheets/${d.date}`)} data-testid={`day-${d.date}`}
                  className="w-full flex items-center gap-2 px-4 py-3.5 text-left cursor-pointer hover:bg-bb-card-hover">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15.5px] font-bold text-bb-text">{shortDay(d.date)}</span>
                    <span className="block text-[13px] text-gray-600 mt-0.5">{st.sub}</span>
                  </span>
                  {st.tag && <Tag tone={st.tag.tone}>{st.tag.text}</Tag>}
                  {isOwner && <b className="text-[15px] tabular-nums ml-1">{rupees(d.total)}</b>}
                  <ChevronRight size={18} className="text-bb-muted shrink-0" />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="bg-white border border-bb-border rounded-2xl overflow-hidden">
          <table className="w-full text-[13.5px]" data-testid="days-table">
            <thead>
              <tr className="bg-[#f6f6f9] border-b border-bb-border text-left">
                {['Day', 'What happened', '', ...(isOwner ? ['Shared into events', 'Running cost', 'Day total'] : []), ''].map((h, i) => (
                  <th key={i} className={`py-2.5 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-bb-muted ${i >= 3 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(d => {
                const st = dayStatus(d, (byDate[d.date] || []).length, staffCount(d));
                return (
                  <tr key={d.date} onClick={() => navigate(`/day-sheets/${d.date}`)} className="border-b border-gray-100 cursor-pointer hover:bg-bb-card-hover" data-testid={`day-${d.date}`}>
                    <td className="py-2.5 px-3 font-bold whitespace-nowrap">{shortDay(d.date)}</td>
                    <td className="py-2.5 px-3 text-gray-600">{st.sub}</td>
                    <td className="py-2.5 px-3">{st.tag && <Tag tone={st.tag.tone}>{st.tag.text}</Tag>}</td>
                    {isOwner && <>
                      <td className="py-2.5 px-3 text-right tabular-nums">{d.eventDay ? rupees(d.eventDay) : '—'}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{rupees(d.running)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold tabular-nums">{rupees(d.total)}</td>
                    </>}
                    <td className="py-2.5 px-2 text-right"><ChevronRight size={16} className="inline text-bb-muted" /></td>
                  </tr>
                );
              })}
              {isOwner && m && (
                <tr className="bg-bb-bg/70 font-bold">
                  <td colSpan={3} className="py-3 px-3">Total · {days.length} days</td>
                  <td className="py-3 px-3 text-right tabular-nums text-bb-accent-hover">{rupees(m.eventDay)}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-bb-accent-hover">{rupees(m.running)}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-bb-accent-hover">{rupees(m.total)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
