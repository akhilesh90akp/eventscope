/**
 * Reports — Event analytics and reporting page
 *
 * Provides filtered views of event data with monthly, yearly, or custom
 * date range filters. Displays summary statistics and a tabular list
 * of events with their status and amounts. Supports print/PDF export.
 *
 * Read-only vs. Firestore: this page only reads `events`/`settings` from
 * AppContext — it does not write anything back.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import { formatCurrency, formatDateReadable, getActiveDate } from '../utils/helpers';
import { pushCompletedEventsToSheet, pullProfitsFromSheet } from '../utils/sheetSync';
import { Download, Printer, Calendar, BarChart3, Sheet, RefreshCw } from 'lucide-react';

// ============================================================
// Reports — MAIN COMPONENT
// ============================================================

/** Displays event reports with date-based filtering and summary stats */
export default function Reports() {
  const { events, settings, updateEvent, showToast } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [filter, setFilter] = useState('monthly'); // monthly | yearly | custom
  const [statusFilter, setStatusFilter] = useState('completed'); // all | completed | confirmed
  const [excludeGST, setExcludeGST] = useState(false);
  const [syncing, setSyncing] = useState(false); // true while push/pull is in flight

  // Initialize month/year to current period
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------

  // Helper: calculate event total from itemPrices
  const getEventTotal = (event) => {
    // First check if totalAmount was explicitly set
    if (event.totalAmount && Number(event.totalAmount) > 0) return Number(event.totalAmount);
    
    // Calculate from itemPrices (handles both keyed and plain formats)
    const prices = event.itemPrices;
    if (!prices || typeof prices !== 'object') return 0;
    
    let total = 0;
    
    // Try iterating all price entries
    Object.entries(prices).forEach(([key, p]) => {
      if (p && typeof p === 'object' && (p.rate || p.qty)) {
        const qty = Number(p.qty) || 1;
        const rate = Number(p.rate) || 0;
        total += qty * rate;
      }
    });
    
    // If still 0, try getting items from mainEvent + subEvents and look up prices
    if (total === 0 && event.mainEvent?.items) {
      const allItems = [...(event.mainEvent.items || [])];
      (event.subEvents || []).forEach(s => { allItems.push(...(s.items || [])); });
      allItems.forEach(item => {
        // Try keyed format
        const p = prices[`main::${item}`] || prices[item] || {};
        const qty = Number(p.qty) || 1;
        const rate = Number(p.rate) || 0;
        total += qty * rate;
      });
    }
    
    return total;
  };

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
    const confirmed = filteredEvents.filter(e => e.status === 'confirmed').length;
    const completed = filteredEvents.filter(e => e.status === 'completed').length;
    const revenue = filteredEvents.reduce((s, e) => s + getEventTotal(e), 0);
    // Profit is pulled back from the Google Sheet's Job Log (event.profit),
    // and only exists once a completed event has been pushed and synced back.
    const profit = filteredEvents
      .filter(e => e.status === 'completed')
      .reduce((s, e) => s + (Number(e.profit) || 0), 0);
    return { total, drafts, confirmed, completed, revenue, profit };
  }, [filteredEvents]);


  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------

  /**
   * Pushes only completed events that are new or have changed since their
   * last successful sync — re-sending every completed event on every click
   * gets slower as the event history grows, and is unnecessary since most
   * of it hasn't changed. "Changed" means updatedAt is newer than the
   * event's own sheetSyncedAt from the last time it was pushed.
   *
   * Then opens the sheet in a new tab so the user can fill in cost columns.
   * Awaits the result and surfaces the real error if the sheet isn't
   * reachable or isn't configured.
   *
   * Opens the tab BEFORE awaiting the push (not after) and redirects it
   * once the push completes, rather than calling window.open() after the
   * await — most browsers only allow window.open() to succeed when it's
   * called synchronously in direct response to the click; calling it
   * after an await is commonly blocked as a pop-up with no visible error,
   * which looked like "nothing happens" and prompted repeated clicking.
   * A bare blank tab looks broken while it waits, so a small branded
   * "Syncing..." loading screen is written into it immediately instead.
   */
  const handleSyncToSheet = async () => {
    if (syncing) return;
    setSyncing(true);

    // Open the tab now, synchronously, while still inside the click
    // handler's call stack — this is what keeps it from being blocked.
    // Shows a loading screen immediately; redirected to the real sheet
    // below once the sync completes.
    //
    // Deliberately NOT passing 'noopener'/'noreferrer' here — either one
    // makes window.open() always return null by design (that's the whole
    // point of "no opener": the caller doesn't get a handle back), which
    // would make it indistinguishable from an actually-blocked popup. We
    // genuinely need the real reference this time, to write the loading
    // screen into it and redirect it once the sync finishes.
    const sheetTab = settings.sheetViewUrl
      ? window.open('', '_blank')
      : null;
    if (sheetTab) {
      sheetTab.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Bluebell — Syncing...</title>
            <style>
              body { margin:0; height:100vh; display:flex; align-items:center;
                justify-content:center; font-family:system-ui,-apple-system,sans-serif;
                background:#f7f5fa; }
              .spinner { width:32px; height:32px; border:3px solid #e5ddf0;
                border-top-color:#331948; border-radius:50%;
                animation:spin 0.8s linear infinite; margin:0 auto 14px; }
              @keyframes spin { to { transform:rotate(360deg); } }
              p { color:#331948; font-size:15px; text-align:center; margin:0; }
            </style>
          </head>
          <body>
            <div>
              <div class="spinner"></div>
              <p>Syncing to Google Sheet&hellip;</p>
            </div>
          </body>
        </html>
      `);
      sheetTab.document.close();
    }

    try {
      const allCompleted = events.filter(e => e.status === 'completed');
      const eventsToSync = allCompleted.filter(e =>
        !e.sheetSyncedAt || (e.updatedAt && e.updatedAt > e.sheetSyncedAt)
      );

      if (eventsToSync.length === 0) {
        showToast('Already up to date — nothing new to sync');
        if (settings.sheetViewUrl) {
          if (sheetTab) sheetTab.location.href = settings.sheetViewUrl;
          else showToast('The sheet tab was blocked — allow pop-ups for this site to open it automatically', 'error');
        }
        return;
      }

      const result = await pushCompletedEventsToSheet(eventsToSync, settings.sheetSyncUrl, settings.sheetSyncSecret);
      if (result.success) {
        showToast(`Synced to sheet (${result.added} added, ${result.updated} updated)`);
        // Record that these specific events are now caught up, so the next
        // click only re-sends what's changed since. { touch: false } is
        // essential here — otherwise this bookkeeping write would itself
        // bump updatedAt and immediately re-flag every event as changed.
        const syncedAt = new Date().toISOString();
        await Promise.all(
          eventsToSync.map(e => updateEvent(e.id, { sheetSyncedAt: syncedAt }, { touch: false }))
        );
        if (settings.sheetViewUrl) {
          if (sheetTab) {
            sheetTab.location.href = settings.sheetViewUrl;
          } else {
            // Popup was blocked even at the synchronous open — fall back
            // to navigating the current tab there isn't safe (would lose
            // the Reports page), so just tell the user directly.
            showToast('Synced, but the sheet tab was blocked — allow pop-ups for this site to open it automatically', 'error');
          }
        }
      } else {
        if (sheetTab) sheetTab.close(); // don't leave a stray loading tab open on failure
        showToast(result.error || 'Failed to sync to sheet', 'error');
      }
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Pulls the Profit figure back from the sheet for every completed event
   * and writes it onto the matching event in Firestore. Awaits each write
   * and reports how many events were updated, or the real error.
   *
   * Skips events whose pulled profit is unchanged from what's already
   * stored, and uses { touch: false } for the writes it does make — this
   * is a pulled/derived field, not an app-owned edit, so it must not bump
   * updatedAt or it would falsely re-flag those events as needing a fresh
   * push next time "Sync to Sheet" runs.
   */
  const handlePullFromSheet = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await pullProfitsFromSheet(settings.sheetSyncUrl, settings.sheetSyncSecret);
      if (!result.success) {
        showToast(result.error || 'Failed to pull from sheet', 'error');
        return;
      }
      const changed = events.filter(e =>
        e.status === 'completed' &&
        result.profits[e.id] !== undefined &&
        Number(e.profit) !== Number(result.profits[e.id])
      );
      if (changed.length === 0) {
        showToast('Profit already up to date');
        return;
      }
      const writes = await Promise.all(
        changed.map(e => updateEvent(e.id, { profit: result.profits[e.id] }, { touch: false }))
      );
      const failedCount = writes.filter(w => !w.success).length;
      if (failedCount > 0) {
        showToast(`Pulled profit for ${changed.length - failedCount} events, ${failedCount} failed to save`, 'error');
      } else {
        showToast(`Profit updated for ${changed.length} events`);
      }
    } finally {
      setSyncing(false);
    }
  };

  /** Generate PDF report */
  const handleDownload = () => {
    const period = filter === 'monthly' ? month : filter === 'yearly' ? year : `${dateFrom} to ${dateTo}`;
    document.title = `Bluebell Report - ${statusFilter} - ${period}`;
    // Show print section, hide screen content
    const printEl = document.getElementById('report-print');
    if (printEl) printEl.style.display = 'block';
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        if (printEl) printEl.style.display = 'none';
        document.title = 'Bluebell';
      }, 500);
    }, 100);
  };

  // Filter tab configuration
  const filterTabs = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
    { key: 'custom', label: 'Custom' },
  ];

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------

  return (
    <div>
      {/* Screen UI - hidden during print */}
      <div data-no-print className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-bb-text">Reports</h1>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={Sheet} onClick={handleSyncToSheet} disabled={syncing}>
              {syncing ? 'Working...' : 'Sync to Sheet'}
            </Button>
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={handlePullFromSheet} disabled={syncing}>
              {syncing ? 'Working...' : 'Pull Profit'}
            </Button>
          </div>
        </div>

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

      {/* Date Inputs - changes based on active filter tab */}
      <Card>
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
      </Card>

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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card>
          <p className="text-xs text-bb-muted">Total</p>
          <p className="text-xl font-bold text-bb-text">{stats.total}</p>
        </Card>
        <Card>
          <p className="text-xs text-bb-muted">Confirmed</p>
          <p className="text-xl font-bold text-emerald-400">{stats.confirmed}</p>
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
          <p className="text-xs text-bb-muted">Profit</p>
          <p className="text-lg font-bold text-emerald-500">{formatCurrency(stats.profit)}</p>
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
                {filteredEvents.map((e, i) => (
                  <tr key={e.id} className="border-b border-bb-border/50">
                    <td className="py-2 px-2 text-bb-muted">{i + 1}</td>
                    <td className="py-2 px-2 text-bb-text font-medium truncate max-w-[120px]">{e.clientName}</td>
                    <td className="py-2 px-2 text-bb-muted hidden sm:table-cell">{e.eventType}</td>
                    <td className="py-2 px-2 text-bb-muted">{formatDateReadable(e.mainEvent?.date || e.date)}</td>
                    <td className="py-2 px-2"><Badge variant={e.status}>{e.status}</Badge></td>
                    <td className="py-2 px-2 text-right text-bb-text">{formatCurrency(getEventTotal(e))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Actions */}
        <div className="flex gap-2">
          <Button icon={Download} onClick={handleDownload} variant="secondary">Download PDF</Button>
        </div>
      </div>

      {/* Printable Report - hidden on screen, shown during print */}
      <div className="print-doc" id="report-print" style={{display: 'none', backgroundColor: 'white', color: '#111827', fontFamily: 'Inter, -apple-system, sans-serif', padding: '20px'}}>
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
                <strong>BLUE BELL</strong> — Event Planners LLP<br/>
                Ph: {settings.phone}
              </td>
              <td colSpan="2" style={{padding: '8px 0', fontSize: '12px', color: '#374151', textAlign: 'right'}}>
                <strong>Period:</strong> {filter === 'monthly' ? month : filter === 'yearly' ? year : `${dateFrom} to ${dateTo}`}<br/>
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
                <span style={{fontSize: '11px'}}>Confirmed: {stats.confirmed}</span> &nbsp;|&nbsp;
                <span style={{fontSize: '11px', fontWeight: 'bold', color: '#652D90'}}>Revenue: {formatCurrency(stats.revenue)}</span>
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
            {/* Data Rows */}
            {filteredEvents.map((e, i) => (
              <tr key={e.id} style={{borderBottom: '1px solid #f3f4f6'}}>
                <td style={{padding: '8px', fontSize: '11px', color: '#6b7280'}}>{i + 1}</td>
                <td style={{padding: '8px', fontSize: '11px', color: '#1f2937', fontWeight: '500'}}>{e.clientName}</td>
                <td style={{padding: '8px', fontSize: '11px', color: '#4b5563'}}>{e.eventType}</td>
                <td style={{padding: '8px', fontSize: '11px', color: '#4b5563'}}>{formatDateReadable(e.mainEvent?.date || e.date)}</td>
                <td style={{padding: '8px', fontSize: '11px', color: '#1f2937', fontWeight: '600', textAlign: 'right'}}>{formatCurrency(getEventTotal(e))}</td>
              </tr>
            ))}
            {/* Total Row */}
            <tr style={{borderTop: '2px solid #652D90'}}>
              <td colSpan="4" style={{padding: '10px 8px', fontSize: '13px', fontWeight: '700'}}>TOTAL REVENUE</td>
              <td style={{padding: '10px 8px', fontSize: '13px', fontWeight: '700', color: '#652D90', textAlign: 'right'}}>{formatCurrency(stats.revenue)}</td>
            </tr>
            {/* Footer */}
            <tr>
              <td colSpan="5" style={{padding: '16px 0 0', textAlign: 'center', fontSize: '10px', color: '#9ca3af'}}>
                Generated by Bluebell Event Planners | {settings.phone}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
