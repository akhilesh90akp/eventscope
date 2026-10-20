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
 * Read-only: this page doesn't write anything back.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import PdfButton from '../components/PdfButton';
import PageHeader from '../components/PageHeader';
import { formatCurrency, formatRupees, formatDateReadable, formatDateRange, functionEnd, getActiveDate, getEventRevenue, computeEventFinancials, openJobLog } from '../utils/helpers';
import { fyStart, fyLabel, purchasesBetween, purchaseTotal } from '../utils/purchases';
import { Printer, Calendar, BarChart3, ExternalLink, Lock, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import UpgradeCard from '../components/UpgradeCard';
import { useNavigate } from 'react-router-dom';
import { useIsPhone } from '../components/useIsPhone';
import { usePhoneHeader } from '../components/phoneScreens';
import StickyBar from '../components/StickyBar';
import { SegmentedTabs, SectionLabel, IconButton, DateField } from '../components/PhoneUI';

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

  // Phones: the PDF button sits in the title bar (follows the chosen tab)
  usePhoneHeader({
    right: isOwner && canUse('reports')
      ? <PdfButton variant="header" docRef={reportRef} fileName={`${reportTitle}.pdf`} label={`Download PDF · ${filterTabs.find(t => t.key === filter)?.label}`} />
      : null,
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
  /** ‹ › steps the month or the year */
  const shift = (n) => {
    if (filter === 'monthly') { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    if (filter === 'yearly') setYear(String(Number(year) + n));
  };
  const periodLabel = filter === 'monthly' ? new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : year;

  if (isPhone) {
    const groups = yearGroups || [{ fy: null, label: '', events: filteredEvents, revenue: stats.revenue }];
    return (
      <div data-testid="reports-phone">
        <div data-no-print className="space-y-4">
          {/* Period tabs and the ‹ month › stepper stay pinned while the list scrolls */}
          <StickyBar className="!py-3 space-y-3">
            <SegmentedTabs value={filter} onChange={setFilter} testId="report-period"
              options={[{ value: 'all', label: 'All time' }, { value: 'monthly', label: 'Month' }, { value: 'yearly', label: 'Year' }, { value: 'custom', label: 'Custom' }]} />
            {(filter === 'monthly' || filter === 'yearly') && (
              <div className="flex items-center gap-2 bg-white border border-bb-border rounded-2xl px-1.5 py-1">
                <IconButton icon={ChevronLeft} label={filter === 'monthly' ? 'Previous month' : 'Previous year'} tone="quiet" onClick={() => shift(-1)} />
                <span className="flex-1 text-center text-[17px] font-bold" data-testid="report-period-label">{periodLabel}</span>
                <IconButton icon={ChevronRight} label={filter === 'monthly' ? 'Next month' : 'Next year'} tone="quiet" onClick={() => shift(1)} />
              </div>
            )}
            {filter === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <DateField label="From" id="rep-from" value={dateFrom} onChange={setDateFrom} />
                <DateField label="To" id="rep-to" value={dateTo} onChange={setDateTo} />
              </div>
            )}
          </StickyBar>
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

          {/* Revenue — the main number */}
          <div className="bg-white border border-bb-border rounded-2xl p-5" data-testid="rep-revenue">
            <p className="text-[14px] text-gray-600">Revenue · {stats.completed} completed event{stats.completed === 1 ? '' : 's'}</p>
            <p className="text-[32px] font-extrabold text-bb-gold tabular-nums leading-tight my-1">{formatRupees(stats.revenue)}</p>
            <p className="text-[13px] text-gray-600">What your clients pay you for these events, after discount, before GST</p>
          </div>

          {/* Profit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-bb-border rounded-2xl p-4" data-testid="profit-label">
              <p className="text-[13.5px] text-gray-600">Profit without purchases</p>
              <p className={`text-[21px] font-extrabold tabular-nums my-1 ${stats.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRupees(stats.profit)}</p>
              {stats.missingCosts > 0
                ? <p className="text-[13px] text-amber-800" data-testid="missing-costs">Based on {stats.profitEvents} event{stats.profitEvents === 1 ? '' : 's'} only. Add expenses for the other {stats.missingCosts}.</p>
                : <p className="text-[13px] text-gray-600">Expenses added for all {stats.completed} events</p>}
              {stats.missingCosts > 0 && <button onClick={() => navigate('/completed')} className="mt-1 min-h-[40px] text-[14px] font-semibold text-bb-accent-hover inline-flex items-center gap-1 cursor-pointer">Add expenses<ChevronRight size={16} /></button>}
            </div>
            <div className="bg-white border border-bb-border rounded-2xl p-4">
              <p className="text-[13.5px] text-gray-600">Profit after purchases</p>
              {stats.enoughCosts
                ? <><p className={`text-[21px] font-extrabold tabular-nums my-1 ${stats.afterPurchases >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRupees(stats.afterPurchases)}</p><p className="text-[13px] text-gray-600">Profit minus what you spent on purchases</p></>
                : <><p className="text-[21px] font-extrabold text-bb-muted my-1" data-testid="after-hidden">—</p><p className="text-[13px] text-gray-600">Shows once most events have expenses added</p></>}
            </div>
          </div>

          {/* Small tiles */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white border border-bb-border rounded-2xl px-3.5 py-3"><p className="text-[13px] text-gray-600">Events</p><b className="text-[21px] tabular-nums">{stats.total}</b></div>
            <div className="bg-white border border-bb-border rounded-2xl px-3.5 py-3"><p className="text-[13px] text-gray-600">Completed</p><b className="text-[21px] tabular-nums text-blue-600">{stats.completed}</b></div>
            <div className="bg-white border border-bb-border rounded-2xl px-3.5 py-3"><p className="text-[13px] text-gray-600">Purchases</p><b className="text-[17px] tabular-nums text-red-600">{formatRupees(stats.spent)}</b></div>
          </div>

          {/* The events */}
          {filteredEvents.length === 0 ? (
            <div className="bg-white border border-bb-border rounded-2xl text-center py-10 text-gray-600"><BarChart3 size={36} className="mx-auto mb-2 text-bb-muted" />No events in this period</div>
          ) : groups.map(g => (
            <div key={g.fy ?? 'list'} className="space-y-2.5" data-testid={g.fy ? 'year-heading' : undefined}>
              <SectionLabel right={<b className="text-[14px] text-bb-text tabular-nums">{formatRupees(g.revenue)}</b>}>
                {g.label ? `${g.label} · ${g.events.length} events` : `${g.events.length} event${g.events.length === 1 ? '' : 's'}`}
              </SectionLabel>
              <div className="bg-white border border-bb-border rounded-2xl px-[18px]">
                {g.events.map(e => (
                  <button key={e.id} onClick={() => navigate(`/${e.status === 'draft' ? 'drafts' : e.status}`, { state: { expandId: e.id } })}
                    className="w-full flex items-center gap-3 py-4 border-b border-bb-border last:border-b-0 text-left cursor-pointer" data-testid="report-row">
                    <span className="flex-1 min-w-0">
                      <span className="block text-[16px] font-bold truncate">{e.clientName}</span>
                      <span className="block text-[13px] text-gray-600 mt-0.5">{e.eventType} · {formatDateRange(e.mainEvent?.date || e.date, e.mainEvent ? functionEnd(e.mainEvent) : '')}</span>
                    </span>
                    <span className="text-right">
                      <b className="block text-[16px] tabular-nums">{formatRupees(getEventRevenue(e))}</b>
                      {e.status !== 'completed' && <span className="inline-block mt-1"><Badge variant={e.status}>{e.status}</Badge></span>}
                    </span>
                    <ChevronRight size={18} className="text-gray-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filteredEvents.length > 0 && (
            <div className="flex justify-between items-center bg-white border border-bb-border rounded-2xl px-[18px] min-h-[60px] font-extrabold">
              <span className="text-[16px]">Total revenue</span><span className="text-[18px] text-bb-accent-hover tabular-nums">{formatRupees(stats.revenue)}</span>
            </div>
          )}
        </div>
        {printable}
      </div>
    );
  }

  // ------------------------------------------------------------
  // RENDER — LAPTOP
  // ------------------------------------------------------------
  const showStatus = statusFilter !== 'completed';   // a "completed" chip on every row says nothing
  const Tip = ({ text }) => <span title={text} aria-label={text} className="inline-flex text-bb-muted/70 hover:text-bb-muted cursor-help"><Info size={14} /></span>;
  return (
    <div>
      {/* Screen UI - hidden during print */}
      <div data-no-print className="space-y-5">
        <PageHeader title="Reports" sub="Events, revenue, profit and purchases for any period — download it for your accountant or partners"
          actions={<>
            <Button icon={Printer} variant="secondary" onClick={handlePrint}>Print</Button>
            <PdfButton docRef={reportRef} fileName={`${reportTitle}.pdf`} label={`Download PDF · ${filterTabs.find(t => t.key === filter)?.label}`} variant="secondary" />
            <Button icon={ExternalLink} onClick={openJobLog}>Open Job Log</Button>
          </>} />

        {/* Period · ‹ month › · which events · GST */}
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedTabs value={filter} onChange={setFilter} testId="report-period" className="w-[380px]"
            options={filterTabs.map(t => ({ value: t.key, label: t.label }))} />
          {(filter === 'monthly' || filter === 'yearly') && (
            <div className="flex items-center gap-1 bg-white border border-bb-border rounded-xl px-1 py-0.5">
              <IconButton icon={ChevronLeft} label={filter === 'monthly' ? 'Previous month' : 'Previous year'} tone="quiet" size={38} onClick={() => shift(-1)} />
              <span className="min-w-[150px] text-center text-[15px] font-bold" data-testid="report-period-label">{periodLabel}</span>
              <IconButton icon={ChevronRight} label={filter === 'monthly' ? 'Next month' : 'Next year'} tone="quiet" size={38} onClick={() => shift(1)} />
            </div>
          )}
          {filter === 'custom' && (
            <div className="flex items-end gap-3">
              <Input label="From" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} icon={Calendar} />
              <Input label="To" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} icon={Calendar} />
            </div>
          )}
          <span className="flex-1" />
          <div className="flex gap-1.5">
            {[{ key: 'completed', label: 'Completed' }, { key: 'all', label: 'All events' }].map(x => (
              <button key={x.key} onClick={() => setStatusFilter(x.key)}
                className={`min-h-[36px] px-3.5 text-[13.5px] font-semibold rounded-full border cursor-pointer ${statusFilter === x.key ? 'bg-bb-accent border-bb-accent text-white' : 'bg-white border-gray-300 text-bb-text'}`}>{x.label}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13.5px] text-bb-text cursor-pointer">
            <input type="checkbox" checked={excludeGST} onChange={e => setExcludeGST(e.target.checked)} className="w-4 h-4 accent-bb-accent" />
            Exclude GST from amounts
          </label>
        </div>

        {/* Revenue first, then profit, then the smaller numbers */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="col-span-2 !p-6 bg-gradient-to-br from-white to-violet-50/70">
            <p className="text-[13px] font-semibold text-bb-muted flex items-center gap-1.5">Revenue <Tip text="What your clients pay you for these events (after discount, before GST)" /></p>
            <p className="text-[32px] leading-tight font-extrabold text-bb-text tabular-nums mt-1">{formatRupees(stats.revenue)}</p>
            <p className="text-[13px] text-bb-muted mt-1">{stats.total} event{stats.total === 1 ? '' : 's'} · {stats.completed} completed</p>
          </Card>
          <Card className="!p-5">
            <p className="text-[13px] font-semibold text-bb-muted flex items-center gap-1.5" data-testid="profit-label">Profit without purchases <Tip text="Revenue minus each event's costs from the Job Log" /></p>
            <p className={`text-[22px] font-bold tabular-nums mt-1 ${stats.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRupees(stats.profit)}</p>
            {stats.missingCosts > 0 ? (
              <p className="text-[12px] leading-snug text-amber-800 mt-1" data-testid="missing-costs">
                Based on {stats.profitEvents} event{stats.profitEvents === 1 ? '' : 's'} only. Add expenses for the other {stats.missingCosts} to see your real profit.
              </p>
            ) : <p className="text-[12px] text-bb-muted mt-1">Expenses added for all {stats.completed} completed events</p>}
          </Card>
          <Card className="!p-5">
            <p className="text-[13px] font-semibold text-bb-muted flex items-center gap-1.5">Profit after purchases <Tip text="Profit, minus what you spent on purchases. Shows up once most events have expenses added." /></p>
            {stats.enoughCosts
              ? <p className={`text-[22px] font-bold tabular-nums mt-1 ${stats.afterPurchases >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatRupees(stats.afterPurchases)}</p>
              : <p className="text-[22px] font-bold text-bb-muted mt-1" data-testid="after-hidden">—</p>}
            <p className="text-[12px] text-bb-muted mt-1">Spent on purchases: <b className="text-rose-600">{stats.spent ? '− ' : ''}{formatRupees(stats.spent)}</b></p>
          </Card>
        </div>

        {/* Events */}
        <Card className="!p-0 overflow-hidden">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-10">
              <BarChart3 size={40} className="mx-auto text-bb-muted mb-3" />
              <p className="text-bb-muted">No events in this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-bb-border bg-bb-bg/60">
                    {['#', 'Client', 'Type', 'Date', ...(showStatus ? ['Status'] : []), 'Amount'].map((h, i, arr) => (
                      <th key={h} className={`py-3 px-4 text-[11.5px] uppercase tracking-wider text-bb-muted font-semibold ${i === arr.length - 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(yearGroups || [{ fy: null, events: filteredEvents }]).map(g => (
                  <React.Fragment key={g.fy ?? 'list'}>
                  {yearGroups && (
                    <tr className="bg-violet-50 border-b border-bb-border" data-testid="year-heading">
                      <td colSpan={showStatus ? 5 : 4} className="py-2.5 px-4 font-bold text-bb-accent-hover">{g.label} · {g.events.length} event{g.events.length === 1 ? '' : 's'}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-bb-text tabular-nums">{formatRupees(g.revenue)}</td>
                    </tr>
                  )}
                  {g.events.map((e, i) => (
                    <tr key={e.id} className="border-b border-bb-border/60 last:border-b-0 hover:bg-bb-bg/50" data-testid="report-row">
                      <td className="py-3 px-4 text-bb-muted tabular-nums">{i + 1}</td>
                      <td className="py-3 px-4 text-bb-text font-semibold">{e.clientName}</td>
                      <td className="py-3 px-4 text-bb-muted">{e.eventType}</td>
                      <td className="py-3 px-4 text-bb-muted whitespace-nowrap">{formatDateRange(e.mainEvent?.date || e.date, e.mainEvent ? functionEnd(e.mainEvent) : '')}</td>
                      {showStatus && <td className="py-3 px-4"><Badge variant={e.status}>{e.status}</Badge></td>}
                      <td className="py-3 px-4 text-right text-bb-text font-semibold tabular-nums">{formatRupees(getEventRevenue(e))}</td>
                    </tr>
                  ))}
                  </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {printable}
    </div>
  );
}
