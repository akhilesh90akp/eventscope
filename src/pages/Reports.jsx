/**
 * Reports — Event analytics and reporting page
 *
 * Provides filtered views of event data with monthly, yearly, or custom
 * date range filters. Displays summary statistics and a tabular list
 * of events with their status and amounts. PDF (preview → Share / Download)
 * at the top so it's reachable without scrolling; Print on laptops.
 *
 * Owner only (staff don't see Reports in the nav, and the route shows a
 * notice). Profit comes from the Job Log (tenants/{id}/financials) —
 * revenue + income columns − cost columns — not from a Google Sheet.
 * Purchases (tenants/{id}/purchases) in the same period give "Spent on
 * purchases" and "Profit after purchases"; they never change an event's profit.
 * The All time tab groups the list by financial year (Apr–Mar).
 * Laptops: title row (Print · PDF · Job Log), one filter strip, a row of five
 * quiet number cards (StatRow) and a table with a title and a Total row.
 * Read-only: this page doesn't write anything back.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Badge from '../components/Badge';
import PdfButton from '../components/PdfButton';
import { formatCurrency, formatRupees, formatDateReadable, formatDateRange, functionEnd, getActiveDate, getEventRevenue, computeEventFinancials, openJobLog } from '../utils/helpers';
import { fyStart, fyLabel, purchasesBetween, purchaseTotal } from '../utils/purchases';
import { Printer, BarChart3, Lock, Table2 } from 'lucide-react';
import UpgradeCard from '../components/UpgradeCard';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, BookOpen } from 'lucide-react';
import { useIsPhone } from '../components/useIsPhone';
import { usePhoneHeader } from '../components/phoneScreens';
import StickyBar from '../components/StickyBar';
import { SectionLabel, IconButton, DateField, UnderlineTabs } from '../components/PhoneUI';
import { HeaderIconButton } from '../components/PhoneHeader';
import { PageHeader, HeaderIcon, StatRow, Seg, Switch } from '../components/LaptopUI';

// ============================================================
// HELPERS
// ============================================================
const eventDateOf = (e) => e.mainEvent?.date || e.date || '';

/** First and last day ('YYYY-MM-DD') the selected tab covers; blank = open-ended */
const periodRange = (filter, month, year, dateFrom, dateTo) => {
  if (filter === 'monthly') {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
  }
  if (filter === 'yearly') return [`${year}-01-01`, `${year}-12-31`];
  if (filter === 'custom') return [dateFrom, dateTo];
  return ['', ''];
};

// ============================================================
// Reports — MAIN COMPONENT
// ============================================================

/**
 * FoldGroup — one financial year on the phone's All time list: a heading with
 * the year's amount and profit on the right, folding its event cards.
 * Without a year (Month / Year / Custom) it just shows the cards.
 */
function FoldGroup({ g, showHeader, profitText, groupProfit, open, onToggle, children }) {
  if (!showHeader) return <div className="space-y-2.5">{children}</div>;
  const pr = groupProfit(g.events);
  return (
    <div className="space-y-2.5" data-testid="year-heading">
      <button onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center gap-2.5 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 text-left cursor-pointer">
        <ChevronDown size={18} className={`text-bb-muted shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="flex-1 min-w-0">
          <b className="block text-[15px]">{g.label}</b>
          <small className="block text-[12.5px] text-gray-600">{g.events.length} event{g.events.length === 1 ? '' : 's'}</small>
        </span>
        <span className="text-right shrink-0">
          <b className="block text-[16px] tabular-nums">{formatRupees(g.revenue)}</b>
          {pr !== 0 && <small className={`block text-[12.5px] font-semibold tabular-nums ${pr > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{profitText(pr)}</small>}
        </span>
      </button>
      {open && children}
    </div>
  );
}

/** Displays event reports with date-based filtering and summary stats */
export default function Reports() {
  const { events, settings, financials, jobLogColumns, isOwner, purchases, canUse } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [filter, setFilter] = useState('monthly'); // all | monthly | yearly | custom
  const reportRef = useRef(null);   // the printable report — what the PDF is made from
  const [statusFilter, setStatusFilter] = useState('completed'); // all | completed | confirmed
  const [excludeGST, setExcludeGST] = useState(false);
  const [closedFy, setClosedFy] = useState(() => new Set());   // financial years folded shut in All time (phone and laptop)
  const toggleFy = (fy) => setClosedFy(c => { const n = new Set(c); if (n.has(fy)) n.delete(fy); else n.add(fy); return n; });
  const isPhone = useIsPhone();
  const navigate = useNavigate();

  // Initialize month/year to current period
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ------------------------------------------------------------
  // DERIVED / CALCULATED VALUES
  // ------------------------------------------------------------

  // Filter events based on selected date range and status
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      // Status filter
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;

      // Support both new format (mainEvent.date) and old format (e.date)
      const eventDate = e.mainEvent?.date || e.date;
      if (!eventDate) return false;
      if (filter === 'all') return true;
      const d = new Date(eventDate);
      if (filter === 'monthly') {
        const [y, m] = month.split('-');
        return d.getFullYear() === Number(y) && d.getMonth() + 1 === Number(m);
      }
      if (filter === 'yearly') {
        return d.getFullYear() === Number(year);
      }
      if (filter === 'custom') {
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false;
        return true;
      }
      return true;
    }).sort((a, b) => {
      // All time: newest first (grouped by financial year below)
      if (filter === 'all') return String(eventDateOf(b)).localeCompare(String(eventDateOf(a)));
      const dateA = new Date(getActiveDate(a));
      const dateB = new Date(getActiveDate(b));
      const now = Date.now();
      const diffA = dateA - now;
      const diffB = dateB - now;
      // Upcoming first (soonest on top), then past (most recent on top)
      if (diffA >= 0 && diffB >= 0) return diffA - diffB;
      if (diffA < 0 && diffB < 0) return diffB - diffA;
      if (diffA >= 0) return -1;
      return 1;
    });
  }, [events, filter, month, year, dateFrom, dateTo, statusFilter]);

  // Compute aggregate statistics from filtered events
  const stats = useMemo(() => {
    const total = filteredEvents.length;
    const drafts = filteredEvents.filter(e => e.status === 'draft').length;
    const completed = filteredEvents.filter(e => e.status === 'completed').length;
    const revenue = filteredEvents.reduce((s, e) => s + getEventRevenue(e), 0);
    // Profit from the Job Log: completed events with at least one cost/income entered
    let profit = 0;
    let profitEvents = 0;
    filteredEvents.filter(e => e.status === 'completed').forEach(e => {
      const calc = computeEventFinancials(getEventRevenue(e), financials[e.id]?.values, jobLogColumns);
      if (calc.hasAny) { profit += calc.profit; profitEvents++; }
    });
    // Purchases dated in the same period (all of them for All time)
    const spent = purchaseTotal(purchasesBetween(purchases || [], ...periodRange(filter, month, year, dateFrom, dateTo)));
    // "Profit after purchases" only means something once most completed
    // events have their costs in — until then it compares 2 events' profit
    // with a whole period's purchases, so we hide it.
    const missingCosts = Math.max(0, completed - profitEvents);
    const enoughCosts = completed > 0 && profitEvents / completed >= 0.8;
    return { total, drafts, completed, revenue, profit, profitEvents, missingCosts, enoughCosts, spent, afterPurchases: profit - spent };
  }, [filteredEvents, financials, jobLogColumns, purchases, filter, month, year, dateFrom, dateTo]);

  // All time: events by financial year, newest year first
  const yearGroups = useMemo(() => {
    if (filter !== 'all') return null;
    const groups = [];
    filteredEvents.forEach(e => {
      const fy = fyStart(eventDateOf(e));
      let g = groups[groups.length - 1];
      if (!g || g.fy !== fy) { g = { fy, label: fy ? fyLabel(fy) : 'No date', events: [], revenue: 0 }; groups.push(g); }
      g.events.push(e);
      g.revenue += getEventRevenue(e);
    });
    return groups;
  }, [filter, filteredEvents]);


  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------

  /** File name for the PDF / print: "<Company> Report - completed - 2026-10" */
  const period = filter === 'all' ? 'All time' : filter === 'monthly' ? month : filter === 'yearly' ? year : `${dateFrom} to ${dateTo}`;
  const reportTitle = `${settings.companyName ? settings.companyName + ' ' : ''}Report - ${statusFilter} - ${period}`;

  /** Prints the report layout (laptop) */
  const handlePrint = () => {
    document.title = reportTitle;
    // Show print section, hide screen content
    const printEl = document.getElementById('report-print');
    if (printEl) printEl.style.display = 'block';
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        if (printEl) printEl.style.display = 'none';
        document.title = 'EventScope';
      }, 500);
    }, 100);
  };

  // Filter tab configuration
  const filterTabs = [
    { key: 'all', label: 'All time' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
    { key: 'custom', label: 'Custom' },
  ];

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  // Phones: PDF and Job Log icons in the title bar, the period tabs attached underneath
  usePhoneHeader({
    right: isOwner && canUse('reports')
      ? <>
          <PdfButton variant="header" docRef={reportRef} fileName={`${reportTitle}.pdf`} label={`Download PDF · ${filterTabs.find(t => t.key === filter)?.label}`} />
          <HeaderIconButton icon={BookOpen} label="Open Job Log" onClick={openJobLog} data-testid="hdr-joblog-phone" />
        </>
      : null,
    below: <UnderlineTabs value={filter} onChange={setFilter} testId="report-period"
      options={[{ value: 'all', label: 'All time' }, { value: 'monthly', label: 'Month' }, { value: 'yearly', label: 'Year' }, { value: 'custom', label: 'Custom' }]} />,
  }, [reportTitle, filter, isOwner]);

  // Owner only — staff reach this page only by typing the address
  if (isOwner && !canUse('reports')) {
    return <UpgradeCard feature="reports" text="Revenue, profit and purchases for any month or year — and a PDF for your accountant." />;
  }
  if (!isOwner) {
    return (
      <Card>
        <div className="text-center py-10">
          <Lock size={36} className="mx-auto text-bb-muted mb-3" />
          <p className="font-semibold text-bb-text">Reports are only visible to the account owner</p>
          <p className="text-sm text-bb-muted mt-1">Ask your company’s owner if you need these figures.</p>
        </div>
      </Card>
    );
  }

  // The PDF / print layout (kept off screen; PdfButton renders it)
  const printable = (
    <>
      {/* Printable Report - hidden on screen, shown during print */}
      <div ref={reportRef} className="print-doc" id="report-print" style={{display: 'none', backgroundColor: 'white', color: '#111827', fontFamily: 'Inter, -apple-system, sans-serif', padding: '20px'}}>
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <tbody>
            {/* Title */}
            <tr>
              <td colSpan="5" style={{textAlign: 'center', padding: '12px 0'}}>
                <span style={{fontSize: '18px', fontWeight: '800', letterSpacing: '0.15em', color: '#652D90', textTransform: 'uppercase'}}>EVENT REPORT</span>
                <div style={{height: '2px', width: '60px', margin: '6px auto 0', backgroundColor: '#652D90'}} />
              </td>
            </tr>
            {/* Company + Period */}
            <tr>
              <td colSpan="3" style={{padding: '8px 0', fontSize: '12px', color: '#374151'}}>
                <strong>{settings.companyName}</strong>{settings.tagline && <> — {settings.tagline}</>}<br/>
                Ph: {settings.phone}
              </td>
              <td colSpan="2" style={{padding: '8px 0', fontSize: '12px', color: '#374151', textAlign: 'right'}}>
                <strong>Period:</strong> {period}<br/>
                <strong>Status:</strong> {statusFilter}<br/>
                <strong>Generated:</strong> {formatDateReadable(new Date().toISOString())}
              </td>
            </tr>
            {/* Separator */}
            <tr><td colSpan="5" style={{borderBottom: '1px solid #e5e7eb', padding: '4px 0'}} /></tr>
            {/* Summary Stats */}
            <tr>
              <td colSpan="5" style={{padding: '12px 0 8px'}}>
                <strong style={{fontSize: '11px'}}>Total Events: {stats.total}</strong> &nbsp;|&nbsp;
                <span style={{fontSize: '11px'}}>Completed: {stats.completed}</span> &nbsp;|&nbsp;
                <span style={{fontSize: '11px', fontWeight: 'bold', color: '#652D90'}}>Revenue: {formatCurrency(stats.revenue)}</span><br/>
                <span style={{fontSize: '11px'}}>Profit without purchases: {formatCurrency(stats.profit)}{stats.missingCosts ? ` (expenses added for ${stats.profitEvents} of ${stats.completed} events)` : ''}</span> &nbsp;|&nbsp;
                <span style={{fontSize: '11px'}}>Spent on purchases: {formatCurrency(stats.spent)}</span>
                {stats.enoughCosts && <> &nbsp;|&nbsp; <span style={{fontSize: '11px', fontWeight: 'bold'}}>Profit after purchases: {formatCurrency(stats.afterPurchases)}</span></>}
              </td>
            </tr>
            {/* Table Header */}
            <tr style={{backgroundColor: '#f5f0fa', borderBottom: '2px solid #652D90'}}>
              <th style={{padding: '8px', textAlign: 'left', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase'}}>#</th>
              <th style={{padding: '8px', textAlign: 'left', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase'}}>Client</th>
              <th style={{padding: '8px', textAlign: 'left', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase'}}>Event Type</th>
              <th style={{padding: '8px', textAlign: 'left', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase'}}>Date</th>
              <th style={{padding: '8px', textAlign: 'right', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase'}}>Amount</th>
            </tr>
            {/* Data Rows (All time: under a heading per financial year) */}
            {(yearGroups || [{ fy: null, events: filteredEvents }]).map(g => (
            <React.Fragment key={g.fy ?? 'list'}>
            {yearGroups && (
              <tr style={{backgroundColor: '#faf7fd', borderBottom: '1px solid #e9dcf5'}}>
                <td colSpan="4" style={{padding: '8px', fontSize: '11px', fontWeight: '700', color: '#652D90'}}>{g.label} · {g.events.length} event{g.events.length === 1 ? '' : 's'}</td>
                <td style={{padding: '8px', fontSize: '11px', fontWeight: '700', textAlign: 'right'}}>{formatCurrency(g.revenue)}</td>
              </tr>
            )}
            {g.events.map((e, i) => (
              <tr key={e.id} style={{borderBottom: '1px solid #f3f4f6'}}>
                <td style={{padding: '8px', fontSize: '11px', color: '#6b7280'}}>{i + 1}</td>
                <td style={{padding: '8px', fontSize: '11px', color: '#1f2937', fontWeight: '500'}}>{e.clientName}</td>
                <td style={{padding: '8px', fontSize: '11px', color: '#4b5563'}}>{e.eventType}</td>
                <td style={{padding: '8px', fontSize: '11px', color: '#4b5563'}}>{formatDateRange(e.mainEvent?.date || e.date, e.mainEvent ? functionEnd(e.mainEvent) : '')}</td>
                <td style={{padding: '8px', fontSize: '11px', color: '#1f2937', fontWeight: '600', textAlign: 'right'}}>{formatCurrency(getEventRevenue(e))}</td>
              </tr>
            ))}
            </React.Fragment>
            ))}
            {/* Total Row */}
            <tr style={{borderTop: '2px solid #652D90'}}>
              <td colSpan="4" style={{padding: '10px 8px', fontSize: '13px', fontWeight: '700'}}>TOTAL REVENUE</td>
              <td style={{padding: '10px 8px', fontSize: '13px', fontWeight: '700', color: '#652D90', textAlign: 'right'}}>{formatCurrency(stats.revenue)}</td>
            </tr>
            {/* Footer */}
            <tr>
              <td colSpan="5" style={{padding: '16px 0 0', textAlign: 'center', fontSize: '10px', color: '#9ca3af'}}>
                Generated by {settings.companyName || 'EventScope'}{settings.phone && <> | {settings.phone}</>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );

  // ------------------------------------------------------------
  // RENDER — PHONE
  // ------------------------------------------------------------
  // ‹ month / year › stepper (phone and laptop)
  const shift = (n) => {
    if (filter === 'monthly') { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    if (filter === 'yearly') setYear(String(Number(year) + n));
  };
  const periodLabel = filter === 'monthly' ? new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : year;
  const groups = yearGroups || [{ fy: null, label: '', events: filteredEvents, revenue: stats.revenue }];

  if (isPhone) {
    // Profit of one completed event from its Job Log (null = no costs entered yet)
    const profitOf = (e) => {
      if (e.status !== 'completed') return null;
      const calc = computeEventFinancials(getEventRevenue(e), financials[e.id]?.values, jobLogColumns);
      return calc.hasAny ? calc.profit : null;
    };
    const profitText = (n) => `Profit ${n < 0 ? '– ' : ''}${formatRupees(Math.abs(n))}`;
    const groupProfit = (list) => list.reduce((s, e) => s + (profitOf(e) || 0), 0);
    const numCard = 'bg-white border border-bb-border rounded-2xl px-4 py-3.5';
    const stepBtn = 'w-11 h-11 shrink-0 rounded-xl border border-gray-300 bg-white flex items-center justify-center text-bb-text cursor-pointer disabled:opacity-35 disabled:cursor-default';
    const stepper = filter === 'monthly' || filter === 'yearly' || filter === 'all';
    return (
      <div data-testid="reports-phone">
        <div data-no-print className="space-y-4">
          {/* Month stepper and the Completed / All events pills stay pinned under the purple bar */}
          <StickyBar className="!py-3 space-y-3">
            {stepper && (
              <div className="flex items-center gap-2">
                <button className={stepBtn} disabled={filter === 'all'} aria-label={filter === 'yearly' ? 'Previous year' : 'Previous month'} onClick={() => shift(-1)}><ChevronLeft size={20} /></button>
                <span className={`flex-1 h-11 rounded-xl border border-gray-300 bg-white flex items-center justify-center text-[17px] font-bold ${filter === 'all' ? 'text-bb-muted' : ''}`} data-testid="report-period-label">{filter === 'all' ? 'All time' : periodLabel}</span>
                <button className={stepBtn} disabled={filter === 'all'} aria-label={filter === 'yearly' ? 'Next year' : 'Next month'} onClick={() => shift(1)}><ChevronRight size={20} /></button>
              </div>
            )}
            {filter === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <DateField label="From" id="rep-from" value={dateFrom} onChange={setDateFrom} />
                <DateField label="To" id="rep-to" value={dateTo} onChange={setDateTo} />
              </div>
            )}
            <div className="flex items-center gap-2">
              {[['completed', 'Completed'], ['all', 'All events']].map(([k, l]) => (
                <button key={k} onClick={() => setStatusFilter(k)} className={`shrink-0 whitespace-nowrap min-h-[40px] px-3.5 rounded-full border text-[14px] font-semibold cursor-pointer ${statusFilter === k ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300'}`}>{l}</button>
              ))}
              <span className="flex-1" />
              <label className="shrink-0 flex items-center gap-2 text-[14px] whitespace-nowrap cursor-pointer">
                No GST
                <input type="checkbox" className="sr-only peer" checked={excludeGST} onChange={e => setExcludeGST(e.target.checked)} data-testid="exclude-gst" />
                <span aria-hidden="true" className={`relative w-11 h-[26px] rounded-full ${excludeGST ? 'bg-bb-accent' : 'bg-gray-300'}`}><span className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow transition-transform ${excludeGST ? 'translate-x-[18px]' : ''}`} /></span>
              </label>
            </div>
          </StickyBar>

          {/* Five numbers */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`${numCard} col-span-2`} data-testid="rep-revenue">
              <p className="text-[13.5px] text-gray-600">Revenue</p>
              <p className="text-[30px] font-extrabold text-bb-gold tabular-nums leading-tight">{formatRupees(stats.revenue)}</p>
              <p className="text-[12.5px] text-gray-600">After discount, before GST</p>
            </div>
            <div className={numCard} data-testid="profit-label">
              <p className="text-[13.5px] text-gray-600">Profit</p>
              <p className={`text-[21px] font-extrabold tabular-nums ${stats.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRupees(stats.profit)}</p>
              <p className="text-[12.5px] text-gray-600" data-testid={stats.missingCosts > 0 ? 'missing-costs' : undefined}>
                {stats.missingCosts > 0 ? `Based on ${stats.profitEvents} of ${stats.completed} events` : `Costs added for all ${stats.completed}`}
              </p>
            </div>
            <div className={numCard}>
              <p className="text-[13.5px] text-gray-600">After purchases</p>
              {stats.enoughCosts
                ? <><p className={`text-[21px] font-extrabold tabular-nums ${stats.afterPurchases >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRupees(stats.afterPurchases)}</p><p className="text-[12.5px] text-gray-600">Profit – purchases</p></>
                : <><p className="text-[21px] font-extrabold text-bb-muted" data-testid="after-hidden">—</p><p className="text-[12.5px] text-gray-600">Shows once most events have costs</p></>}
            </div>
            <div className={numCard}>
              <p className="text-[13.5px] text-gray-600">Events</p>
              <p className="text-[21px] font-extrabold tabular-nums">{stats.total}</p>
              <p className="text-[12.5px] text-gray-600">{stats.completed} completed</p>
            </div>
            <div className={numCard}>
              <p className="text-[13.5px] text-gray-600">Spent on purchases</p>
              <p className="text-[21px] font-extrabold tabular-nums text-red-600">{stats.spent ? `– ${formatRupees(stats.spent)}` : formatRupees(0)}</p>
              <p className="text-[12.5px] text-gray-600">{filter === 'all' ? 'All time' : 'This period'}</p>
            </div>
          </div>

          {/* The events */}
          {filteredEvents.length === 0 ? (
            <div className="bg-white border border-bb-border rounded-2xl text-center py-10 text-gray-600"><BarChart3 size={36} className="mx-auto mb-2 text-bb-muted" />No events in this period</div>
          ) : (
            <>
              <SectionLabel right={yearGroups && yearGroups.length > 1 && (
                <button onClick={() => setClosedFy(closedFy.size >= yearGroups.length ? new Set() : new Set(yearGroups.map(y => y.fy)))} className="text-[13.5px] font-semibold normal-case tracking-normal text-bb-accent-hover cursor-pointer" data-testid="fold-all">
                  {closedFy.size >= yearGroups.length ? 'Open all' : 'Fold all'}
                </button>)}>{filter === 'all' ? 'All events' : filter === 'monthly' ? `Events in ${periodLabel}` : filter === 'yearly' ? `Events in ${periodLabel}` : 'Events'} · {filteredEvents.length}</SectionLabel>
              {groups.map(g => (
                <FoldGroup key={g.fy ?? 'list'} g={g} showHeader={!!g.fy} profitText={profitText} groupProfit={groupProfit}
                  open={!closedFy.has(g.fy)} onToggle={() => toggleFy(g.fy)}>
                  {g.events.map(e => {
                    const pr = profitOf(e);
                    return (
                      <button key={e.id} onClick={() => navigate(`/${e.status === 'draft' ? 'drafts' : e.status}`, { state: { expandId: e.id } })}
                        className="w-full flex items-start gap-3 px-4 py-3.5 bg-white border border-bb-border rounded-2xl text-left cursor-pointer" data-testid="report-row">
                        <span className="flex-1 min-w-0">
                          <span className="block text-[16px] font-bold truncate">{e.clientName}</span>
                          <span className="block text-[13px] text-gray-600 mt-0.5">{e.eventType} · {formatDateRange(e.mainEvent?.date || e.date, e.mainEvent ? functionEnd(e.mainEvent) : '')}</span>
                        </span>
                        <span className="text-right shrink-0">
                          <b className="block text-[16px] tabular-nums">{formatRupees(getEventRevenue(e))}</b>
                          {e.status !== 'completed'
                            ? <span className="inline-block mt-1"><Badge variant={e.status}>{e.status}</Badge></span>
                            : pr !== null
                              ? <small className={`block text-[12.5px] font-semibold tabular-nums mt-0.5 ${pr >= 0 ? 'text-emerald-600' : 'text-red-600'}`} data-testid="row-profit">{profitText(pr)}</small>
                              : <span role="link" onClick={(ev) => { ev.stopPropagation(); navigate(`/job/${e.id}`); }} className="inline-flex items-center text-[12.5px] font-semibold text-bb-accent-hover mt-0.5" data-testid="row-add-costs">Add costs<ChevronRight size={14} /></span>}
                        </span>
                      </button>
                    );
                  })}
                </FoldGroup>
              ))}
              <div className="flex items-center justify-between gap-3 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3.5" data-testid="rep-total">
                <b className="text-[15px]">Total · {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}</b>
                <span className="text-right">
                  <b className="block text-[17px] text-bb-accent-hover tabular-nums">{formatRupees(stats.revenue)}</b>
                  {stats.profitEvents > 0 && <small className={`block text-[12.5px] font-semibold tabular-nums ${stats.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{profitText(stats.profit)}</small>}
                </span>
              </div>
            </>
          )}
        </div>
        {printable}
      </div>
    );
  }

  // ------------------------------------------------------------
  // RENDER — LAPTOP
  // ------------------------------------------------------------
  const tableTitle = filter === 'all' ? 'All events' : filter === 'custom'
    ? (dateFrom || dateTo ? `Events ${dateFrom ? `from ${formatDateReadable(dateFrom)}` : ''} ${dateTo ? `to ${formatDateReadable(dateTo)}` : ''}`.replace(/\s+/g, ' ').trim() : 'Events')
    : `Events in ${periodLabel}`;
  const showStatus = statusFilter === 'all';
  const th = 'py-2.5 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-bb-muted';
  return (
    <div>
      {/* Screen UI - hidden during print */}
      <div data-no-print className="space-y-4" data-testid="reports-laptop">
        <PageHeader title="Reports" sub="How the business is doing, for any period"
          actions={<>
            <HeaderIcon icon={Printer} label="Print" onClick={handlePrint} data-testid="hdr-print" />
            <PdfButton docRef={reportRef} fileName={`${reportTitle}.pdf`} variant="laptop" />
            <HeaderIcon icon={Table2} label="Open Job Log" tone="primary" onClick={openJobLog} data-testid="hdr-joblog" />
          </>} />

        {/* Filter strip: period tabs · ‹ month › · Completed | All events · Without GST */}
        <div className="flex items-center gap-3 flex-wrap bg-white border border-bb-border rounded-2xl px-3 py-2" data-testid="report-filters">
          <Seg label="Period" value={filter} onChange={setFilter} testId="report-period"
            options={[{ value: 'all', label: 'All time' }, { value: 'monthly', label: 'Month' }, { value: 'yearly', label: 'Year' }, { value: 'custom', label: 'Custom' }]} />
          {(filter === 'monthly' || filter === 'yearly') && (
            <span className="flex items-center gap-1">
              <IconButton icon={ChevronLeft} label={filter === 'monthly' ? 'Previous month' : 'Previous year'} tone="quiet" size={32} iconSize={17} onClick={() => shift(-1)} />
              <b className="min-w-[132px] text-center text-[14px]" data-testid="report-period-label">{periodLabel}</b>
              <IconButton icon={ChevronRight} label={filter === 'monthly' ? 'Next month' : 'Next year'} tone="quiet" size={32} iconSize={17} onClick={() => shift(1)} />
            </span>
          )}
          {filter === 'custom' && (
            <span className="flex items-center gap-2 text-[13px] text-bb-muted">
              <input type="date" aria-label="From" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-[34px] rounded-lg border border-bb-border bg-bb-input px-2 text-[13px] text-bb-text" />
              to
              <input type="date" aria-label="To" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-[34px] rounded-lg border border-bb-border bg-bb-input px-2 text-[13px] text-bb-text" />
            </span>
          )}
          <span className="flex-1" />
          <Seg label="Which events" value={statusFilter} onChange={setStatusFilter} testId="report-status"
            options={[{ value: 'completed', label: 'Completed' }, { value: 'all', label: 'All events' }]} />
          <span className="w-px h-6 bg-bb-border" />
          <Switch checked={excludeGST} onChange={setExcludeGST} label="Without GST" testId="exclude-gst" />
        </div>

        {/* One row of quiet number cards */}
        <StatRow items={[
          { label: 'Revenue', value: formatRupees(stats.revenue), tone: 'accent', hint: 'After discount, before GST', info: 'What your clients pay you for these events (after discount, before GST)', testId: 'rep-revenue' },
          { label: <span data-testid="profit-label">Profit</span>, key: 'profit', value: formatRupees(stats.profit), tone: stats.profit >= 0 ? 'green' : 'red',
            hint: stats.missingCosts > 0
              ? <span data-testid="missing-costs">Based on {stats.profitEvents} of {stats.completed} events · <button onClick={() => navigate('/completed')} className="font-semibold text-bb-accent-hover hover:underline cursor-pointer">add expenses</button></span>
              : `Expenses added for all ${stats.completed} events`,
            hintTone: stats.missingCosts > 0 ? 'amber' : '', info: 'Revenue minus the expenses you entered in the Job Log, without purchases' },
          { label: 'Profit after purchases', value: stats.enoughCosts ? formatRupees(stats.afterPurchases) : <span data-testid="after-hidden">—</span>,
            tone: !stats.enoughCosts ? 'muted' : stats.afterPurchases >= 0 ? 'green' : 'red',
            hint: stats.enoughCosts ? 'Profit − purchases' : 'Shows once most events have expenses', info: 'Profit, minus what you spent on purchases in this period' },
          { label: 'Events', value: stats.total, hint: statusFilter === 'all' ? `${stats.completed} completed` : 'Completed', testId: 'rep-events' },
          { label: 'Spent on purchases', value: `${stats.spent ? '− ' : ''}${formatRupees(stats.spent)}`, tone: 'red', hint: 'This period', info: 'Things you bought for the business — chairs, lights, equipment' },
        ]} />

        {/* The events */}
        <div className="bg-white border border-bb-border rounded-2xl overflow-hidden" data-testid="report-table">
          <div className="flex items-center gap-2.5 px-5 py-3.5">
            <h2 className="text-[15px] font-bold text-bb-text">{tableTitle}</h2>
            <span className="inline-flex items-center justify-center min-w-[1.6rem] h-[22px] px-2 rounded-full bg-violet-100 text-violet-700 text-xs font-bold tabular-nums">{filteredEvents.length}</span>
          </div>
          {filteredEvents.length === 0 ? (
            <div className="text-center py-10 border-t border-bb-border">
              <BarChart3 size={36} className="mx-auto text-bb-muted mb-2" />
              <p className="text-bb-muted text-[14px]">No events in this period</p>
            </div>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="bg-bb-bg/70 border-y border-bb-border text-left">
                  <th className={`${th} w-12`}>#</th><th className={th}>Client</th><th className={th}>Type</th><th className={th}>Date</th>
                  {showStatus && <th className={th}>Status</th>}
                  <th className={`${th} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                <React.Fragment key={g.fy ?? 'list'}>
                {yearGroups && (
                  <tr className="bg-violet-50/60 border-b border-bb-border cursor-pointer select-none" data-testid="year-heading" aria-expanded={!closedFy.has(g.fy)}
                    onClick={() => toggleFy(g.fy)}>
                    <td colSpan={showStatus ? 5 : 4} className="py-2 px-3 font-bold text-bb-accent-hover">
                      <span className="inline-flex items-center gap-1.5"><ChevronDown size={16} className={`transition-transform ${closedFy.has(g.fy) ? '-rotate-90' : ''}`} />{g.label} · {g.events.length} event{g.events.length === 1 ? '' : 's'}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums">{formatRupees(g.revenue)}</td>
                  </tr>
                )}
                {!(yearGroups && closedFy.has(g.fy)) && g.events.map((e, i) => (
                  <tr key={e.id} className="border-b border-gray-100 hover:bg-bb-bg/60 cursor-pointer" data-testid="report-row"
                    onClick={() => navigate(`/${e.status === 'draft' ? 'drafts' : e.status}`, { state: { expandId: e.id } })}>
                    <td className="py-2.5 px-3 text-bb-muted tabular-nums">{i + 1}</td>
                    <td className="py-2.5 px-3 font-semibold text-bb-text">{e.clientName}</td>
                    <td className="py-2.5 px-3 text-gray-600">{e.eventType}</td>
                    <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{formatDateRange(e.mainEvent?.date || e.date, e.mainEvent ? functionEnd(e.mainEvent) : '')}</td>
                    {showStatus && <td className="py-2.5 px-3"><Badge variant={e.status}>{e.status}</Badge></td>}
                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums">{formatRupees(getEventRevenue(e))}</td>
                  </tr>
                ))}
                </React.Fragment>
                ))}
                <tr className="bg-bb-bg/70 font-bold" data-testid="report-total">
                  <td colSpan={showStatus ? 5 : 4} className="py-3 px-3">Total · {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}</td>
                  <td className="py-3 px-3 text-right text-bb-accent-hover tabular-nums">{formatRupees(stats.revenue)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {printable}
    </div>
  );
}

