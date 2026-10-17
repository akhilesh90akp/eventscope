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
import { formatCurrency, formatDateReadable, formatDateRange, functionEnd, getActiveDate, getEventRevenue, computeEventFinancials, openJobLog } from '../utils/helpers';
import { fyStart, fyLabel, purchasesBetween, purchaseTotal } from '../utils/purchases';
import { Printer, Calendar, BarChart3, ExternalLink, Lock } from 'lucide-react';
import UpgradeCard from '../components/UpgradeCard';

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

  return (
    <div>
      {/* Screen UI - hidden during print */}
      <div data-no-print className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-bb-text">Reports</h1>
          </div>
          <div className="flex items-center gap-2">
            <PdfButton docRef={reportRef} fileName={`${reportTitle}.pdf`} label={`Download PDF · ${filterTabs.find(t => t.key === filter)?.label}`} variant="secondary" />
            <span className="hidden md:contents"><Button icon={Printer} variant="secondary" onClick={handlePrint}>Print</Button></span>
            {/* Job Log is a wide grid — laptop/tablet only (md and up) */}
            <span className="hidden md:contents"><Button icon={ExternalLink} onClick={openJobLog}>Open Job Log</Button></span>
          </div>
        </div>
        <p className="text-sm text-bb-muted -mt-1">
          How the business is doing — all time, or any month, year or dates you pick: number of events, revenue, profit and what you spent on purchases. Download it as a PDF for your accountant or partners.
        </p>

        {/* Filter Tabs */}
      <div className="flex gap-2">
        {filterTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              filter === t.key
                ? 'bg-bb-accent text-white'
                : 'bg-bb-card border border-bb-border text-bb-muted hover:text-bb-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Date Inputs - changes based on active filter tab (none for All time) */}
      {filter !== 'all' && <Card>
        <div className="flex flex-wrap gap-3 items-end">
          {filter === 'monthly' && (
            <Input label="Month" type="month" value={month} onChange={e => setMonth(e.target.value)} icon={Calendar} />
          )}
          {filter === 'yearly' && (
            <Input label="Year" type="number" value={year} onChange={e => setYear(e.target.value)} icon={Calendar} className="w-32" />
          )}
          {filter === 'custom' && (
            <>
              <Input label="From" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} icon={Calendar} />
              <Input label="To" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} icon={Calendar} />
            </>
          )}
        </div>
      </Card>}

      {/* Status Filter + GST Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {[{key: 'completed', label: 'Completed'}, {key: 'confirmed', label: 'Confirmed'}, {key: 'all', label: 'All'}].map(s => (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                statusFilter === s.key ? 'bg-bb-accent text-white' : 'bg-bb-card border border-bb-border text-bb-muted'
              }`}>{s.label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-bb-muted cursor-pointer">
          <input type="checkbox" checked={excludeGST} onChange={e => setExcludeGST(e.target.checked)} className="rounded" />
          Exclude GST from amounts
        </label>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card>
          <p className="text-xs text-bb-muted">Total</p>
          <p className="text-xl font-bold text-bb-text">{stats.total}</p>
        </Card>
        <Card>
          <p className="text-xs text-bb-muted">Completed</p>
          <p className="text-xl font-bold text-blue-400">{stats.completed}</p>
        </Card>
        <Card>
          <p className="text-xs text-bb-muted">Revenue</p>
          <p className="text-lg font-bold text-bb-gold">{formatCurrency(stats.revenue)}</p>
        </Card>
        <Card>
          <p className="text-xs text-bb-muted" data-testid="profit-label">Profit without purchases</p>
          <p className={`text-lg font-bold ${stats.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatCurrency(stats.profit)}</p>
          {stats.missingCosts > 0 ? (
            <p className="text-[11px] leading-snug text-amber-800" data-testid="missing-costs">
              Expenses added for {stats.profitEvents} event{stats.profitEvents === 1 ? '' : 's'} only — {stats.missingCosts} event{stats.missingCosts === 1 ? '’s' : 's’'} expenses still to add.
            </p>
          ) : <p className="text-[10px] text-bb-muted">Expenses added for all {stats.completed} completed events</p>}
        </Card>
        <Card>
          <p className="text-xs text-bb-muted">Profit after purchases</p>
          {stats.enoughCosts ? (
            <>
              <p className={`text-lg font-bold ${stats.afterPurchases >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatCurrency(stats.afterPurchases)}</p>
              <p className="text-[10px] text-bb-muted">Without purchases − spent</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-bb-muted" data-testid="after-hidden">—</p>
              <p className="text-[10px] text-bb-muted">Shows once most events have expenses added ({stats.profitEvents} of {stats.completed} now)</p>
            </>
          )}
        </Card>
        <Card>
          <p className="text-xs text-bb-muted">Spent on purchases</p>
          <p className="text-lg font-bold text-rose-600">{stats.spent ? '− ' : ''}{formatCurrency(stats.spent)}</p>
          <p className="text-[10px] text-bb-muted">Chairs, lights etc. bought</p>
        </Card>
      </div>

      {/* Events Table */}
      <Card>
        {filteredEvents.length === 0 ? (
          <div className="text-center py-8">
            <BarChart3 size={40} className="mx-auto text-bb-muted mb-3" />
            <p className="text-bb-muted">No events in this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bb-border">
                  <th className="py-2 px-2 text-left text-bb-muted font-medium">#</th>
                  <th className="py-2 px-2 text-left text-bb-muted font-medium">Client</th>
                  <th className="py-2 px-2 text-left text-bb-muted font-medium hidden sm:table-cell">Type</th>
                  <th className="py-2 px-2 text-left text-bb-muted font-medium">Date</th>
                  <th className="py-2 px-2 text-left text-bb-muted font-medium">Status</th>
                  <th className="py-2 px-2 text-right text-bb-muted font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(yearGroups || [{ fy: null, events: filteredEvents }]).map(g => (
                <React.Fragment key={g.fy ?? 'list'}>
                {yearGroups && (
                  <tr className="bg-bb-accent/5 border-b border-bb-border" data-testid="year-heading">
                    <td colSpan="3" className="py-2 px-2 font-bold text-bb-accent sm:hidden">{g.label} · {g.events.length}</td>
                    <td colSpan="4" className="py-2 px-2 font-bold text-bb-accent hidden sm:table-cell">{g.label} · {g.events.length} event{g.events.length === 1 ? '' : 's'}</td>
                    <td colSpan="2" className="py-2 px-2 text-right font-bold text-bb-text">{formatCurrency(g.revenue)}</td>
                  </tr>
                )}
                {g.events.map((e, i) => (
                  <tr key={e.id} className="border-b border-bb-border/50">
                    <td className="py-2 px-2 text-bb-muted">{i + 1}</td>
                    <td className="py-2 px-2 text-bb-text font-medium truncate max-w-[120px]">{e.clientName}</td>
                    <td className="py-2 px-2 text-bb-muted hidden sm:table-cell">{e.eventType}</td>
                    <td className="py-2 px-2 text-bb-muted">{formatDateRange(e.mainEvent?.date || e.date, e.mainEvent ? functionEnd(e.mainEvent) : '')}</td>
                    <td className="py-2 px-2"><Badge variant={e.status}>{e.status}</Badge></td>
                    <td className="py-2 px-2 text-right text-bb-text">{formatCurrency(getEventRevenue(e))}</td>
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
    </div>
  );
}
