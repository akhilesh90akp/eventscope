/**
 * JobLog — spreadsheet-style cost & profit grid (owner only)
 *
 * Opens in its own browser tab (window.open from Reports / Completed
 * Events) as a full-screen page, outside the normal sidebar layout.
 * One row per completed event:
 *   - from the event & bill (read-only): client, date/time, event, contact,
 *     location, type, invoice #, revenue (excl. GST), GST, bill total,
 *     received, balance due
 *   - typed: the tenant's cost, income and note columns (Settings → Job Log columns)
 *   - calculated: total cost, profit, margin
 *
 * Values live in tenants/{id}/financials/{eventId} — the same data the
 * Costs section on each completed event edits, so both stay in sync live.
 * Cells save on blur / Enter; paste a block copied from Excel to fill many
 * cells at once; or download/upload an .xlsx.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getEventBill, computeEventFinancials, parseMoney, formatDateReadable } from '../utils/helpers';
import { exportJobLogToExcel, readJobLogFromExcel } from '../utils/jobLogExcel';
import { Download, Upload, Loader2 } from 'lucide-react';

// ============================================================
// CONSTANTS
// ============================================================

/** Read-only money columns from the event's bill (mobile: revenue + balance only) */
const BILL_INFO = [
  { key: 'revenue', label: 'Revenue', mobile: true },
  { key: 'gst', label: 'GST' },
  { key: 'billTotal', label: 'Bill total' },
  { key: 'advance', label: 'Received' },
  { key: 'balance', label: 'Balance due', mobile: true },
];

// ============================================================
// HELPERS
// ============================================================

/** ₹ with Indian digit grouping; blank stays blank */
const rupees = (n) => (n === null || n === undefined || n === '' ? '' : '₹' + Math.round(Number(n)).toLocaleString('en-IN'));
/** Main event date (YYYY-MM-DD), supporting the older flat `date` field */
const eventDate = (ev) => ev.mainEvent?.date || ev.date || '';
/** 'YYYY-MM' month key for the period filter */
const monthKey = (d) => (d ? d.slice(0, 7) : '');
/** 'Oct 2026' label for a month key */
const monthLabel = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Full-screen loader shown while the new tab fetches data */
export function JobLogLoader({ detail }) {
  return (
    <div className="min-h-[100dvh] bg-bb-sidebar flex flex-col items-center justify-center gap-6 text-bb-sidebar-muted">
      <img src={import.meta.env.BASE_URL + 'eventscope-logo.svg'} alt="EventScope" className="h-24 w-auto" />
      <Loader2 size={34} className="animate-spin text-[#e3ca7c]" />
      <p className="text-sm">Loading your Job Log…</p>
      {detail && <p className="text-xs">{detail}</p>}
    </div>
  );
}

// ============================================================
// JobLog — MAIN COMPONENT
// ============================================================

export default function JobLog() {
  const {
    events, loaded, financials, financialsLoaded, jobLogColumns, saveFinancials,
    settings, tenant, isOwner, canEditEvents, showToast,
  } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [period, setPeriod] = useState('all');      // 'all' | 'YYYY-MM'
  const [typeFilter, setTypeFilter] = useState('all');
  const [drafts, setDrafts] = useState({});         // { 'eventId|colId': text being typed }
  const [pending, setPending] = useState(0);        // saves in flight
  const [lastError, setLastError] = useState(null);
  const [busy, setBusy] = useState(null);           // 'download' | 'upload' | null
  const fileRef = useRef(null);
  const skipCommit = useRef(null);                  // cell key whose edit was cancelled with Esc

  const companyName = settings.companyName || tenant?.name || '';

  // ------------------------------------------------------------
  // EFFECTS
  // ------------------------------------------------------------

  // Tab title, so the Job Log tab is easy to find among browser tabs
  useEffect(() => {
    document.title = `Job Log${companyName ? ' · ' + companyName : ''} — EventScope`;
  }, [companyName]);

  // ------------------------------------------------------------
  // DERIVED DATA
  // ------------------------------------------------------------
  const costCols = useMemo(() => jobLogColumns.filter(c => c.type === 'cost' || !c.type), [jobLogColumns]);
  const textCols = useMemo(() => jobLogColumns.filter(c => c.type === 'text'), [jobLogColumns]);
  const incomeCols = useMemo(() => jobLogColumns.filter(c => c.type === 'income'), [jobLogColumns]);
  // Order of typed columns in the grid: costs, income, then notes (after the calculated block)
  const moneyCols = useMemo(() => [...costCols, ...incomeCols], [costCols, incomeCols]);
  const editCols = useMemo(() => [...moneyCols, ...textCols], [moneyCols, textCols]);

  const completed = useMemo(
    () => events.filter(e => e.status === 'completed').sort((a, b) => eventDate(a).localeCompare(eventDate(b))),
    [events],
  );
  const months = useMemo(() => [...new Set(completed.map(e => monthKey(eventDate(e))).filter(Boolean))].sort().reverse(), [completed]);
  const types = useMemo(() => [...new Set(completed.map(e => e.eventType).filter(Boolean))].sort(), [completed]);

  const rows = useMemo(() => completed
    .filter(e => period === 'all' || monthKey(eventDate(e)) === period)
    .filter(e => typeFilter === 'all' || e.eventType === typeFilter)
    .map(e => {
      const bill = getEventBill(e);
      const values = financials[e.id]?.values || {};
      return {
        id: e.id,
        date: eventDate(e),
        time: e.mainEvent?.time || '',
        client: e.clientName || '',
        phone: e.clientPhone || e.clientWhatsapp || '',
        event: e.mainEvent?.name || e.eventType || '',
        subEvents: (e.subEvents || []).length,
        location: e.mainEvent?.location || e.eventLocation || '',
        type: e.eventType || '',
        ...bill,
        values,
        calc: computeEventFinancials(bill.revenue, values, jobLogColumns),
      };
    }), [completed, period, typeFilter, financials, jobLogColumns]);

  const totals = useMemo(() => {
    const t = { revenue: 0, gst: 0, billTotal: 0, advance: 0, balance: 0, cost: 0, income: 0, profit: 0, byCol: {} };
    rows.forEach(r => {
      t.revenue += r.revenue;
      t.gst += r.gst;
      t.billTotal += r.billTotal;
      t.advance += r.advance;
      t.balance += r.balance;
      t.cost += r.calc.totalCost;
      t.income += r.calc.income;
      t.profit += r.calc.profit;
      moneyCols.forEach(c => { t.byCol[c.id] = (t.byCol[c.id] || 0) + (Number(r.values[c.id]) || 0); });
    });
    t.margin = t.revenue > 0 ? Math.round((t.profit / t.revenue) * 100) : null;
    return t;
  }, [rows, moneyCols]);

  // ------------------------------------------------------------
  // EVENT HANDLERS — SAVING
  // ------------------------------------------------------------

  /** Saves a list of { eventId, columnId, value } and tracks the saved indicator */
  const save = async (changes) => {
    if (!changes.length) return true;
    setPending(p => p + 1);
    setLastError(null);
    const result = await saveFinancials(changes);
    setPending(p => p - 1);
    if (!result.success) setLastError(result.error);
    return result.success;
  };

  const draftKey = (eventId, colId) => `${eventId}|${colId}`;

  /** Commits the typed text in one cell (on blur / Enter) */
  const commitCell = (row, col) => {
    const key = draftKey(row.id, col.id);
    if (skipCommit.current === key) { skipCommit.current = null; return; }
    if (!(key in drafts)) return;
    const text = drafts[key];
    setDrafts(d => { const n = { ...d }; delete n[key]; return n; });
    if (col.type === 'text') {
      const value = text.trim() || null;
      if (value === (row.values[col.id] || null)) return;
      save([{ eventId: row.id, columnId: col.id, value }]);
      return;
    }
    const value = parseMoney(text);
    if (text.trim() !== '' && value === null) {
      showToast(`“${text}” isn’t a number — not saved`, 'error');
      return;
    }
    const current = row.values[col.id];
    const currentNum = current === null || current === undefined || current === '' ? null : Number(current);
    if (value === currentNum) return;
    save([{ eventId: row.id, columnId: col.id, value }]);
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — KEYBOARD & PASTE
  // ------------------------------------------------------------

  /** Moves focus to another cell; leaving a cell (blur) is what saves it */
  const focusCell = (r, c, fromEl) => {
    const el = document.querySelector(`input[data-r="${r}"][data-c="${c}"]`);
    if (el) { el.focus(); el.select(); } else fromEl?.blur();
  };

  const handleKeyDown = (e, r, c, row, col) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusCell(e.shiftKey && e.key === 'Enter' ? r - 1 : r + 1, c, e.currentTarget);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(r - 1, c, e.currentTarget);
    } else if (e.key === 'Escape') {
      // Discard what was typed: drop the draft, then leave the cell
      const key = draftKey(row.id, col.id);
      setDrafts(d => { const n = { ...d }; delete n[key]; return n; });
      skipCommit.current = key;
      e.currentTarget.blur();
    }
  };

  /** Pasting a block copied from Excel/Sheets fills cells right and down from here */
  const handlePaste = async (e, r, c) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // single value: normal paste
    e.preventDefault();
    const grid = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
    const changes = [];
    let skipped = 0;
    let rowsPastEnd = 0;
    grid.forEach((cells, i) => {
      const row = rows[r + i];
      if (!row) { rowsPastEnd++; return; }
      cells.forEach((cellText, j) => {
        const col = editCols[c + j];
        if (!col) return;
        if (col.type === 'text') {
          changes.push({ eventId: row.id, columnId: col.id, value: cellText.trim() || null });
          return;
        }
        const value = parseMoney(cellText);
        if (cellText.trim() !== '' && value === null) { skipped++; return; }
        changes.push({ eventId: row.id, columnId: col.id, value });
      });
    });
    // Drop any half-typed text in the pasted cells (incl. the focused one),
    // otherwise leaving the focused cell would save its old draft over the paste
    setDrafts(d => {
      const n = { ...d };
      changes.forEach(ch => { delete n[draftKey(ch.eventId, ch.columnId)]; });
      return n;
    });
    if (await save(changes)) {
      const notes = [
        skipped ? `${skipped} non-numbers skipped` : '',
        rowsPastEnd ? `${rowsPastEnd} row${rowsPastEnd === 1 ? '' : 's'} past the last event not pasted` : '',
      ].filter(Boolean).join(' · ');
      showToast(`Pasted ${changes.length} cell${changes.length === 1 ? '' : 's'}${notes ? ` · ${notes}` : ''}`);
    }
  };

  // ------------------------------------------------------------
  // EVENT HANDLERS — EXCEL
  // ------------------------------------------------------------

  const handleDownload = async () => {
    setBusy('download');
    try {
      await exportJobLogToExcel({
        rows, columns: editCols, companyName,
        periodLabel: period === 'all' ? 'All time' : monthLabel(period),
      });
    } catch (err) {
      showToast('Couldn’t create the Excel file: ' + err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setBusy('upload');
    try {
      const res = await readJobLogFromExcel(file, { columns: editCols, knownEventIds: completed.map(e => e.id) });
      if (res.missingIdColumn) {
        showToast('This file has no “Event ID” column. Download the Job Log first, fill it in, and upload that file.', 'error');
        return;
      }
      // Only values that actually differ from what's saved
      const changes = res.changes.filter(ch => {
        const cur = financials[ch.eventId]?.values?.[ch.columnId];
        return (cur === null || cur === undefined ? null : Number(cur)) !== ch.value;
      });
      if (!changes.length) {
        showToast(res.changes.length ? 'Nothing changed — the file matches what’s saved.' : 'No values found to update in that file.', res.changes.length ? 'success' : 'error');
        return;
      }
      const eventsTouched = new Set(changes.map(c => c.eventId)).size;
      const notes = [
        res.unknownEventRows ? `${res.unknownEventRows} rows didn’t match an event` : '',
        res.badCells ? `${res.badCells} cells weren’t numbers` : '',
      ].filter(Boolean).join(', ');
      if (!window.confirm(`Update ${changes.length} value${changes.length === 1 ? '' : 's'} across ${eventsTouched} event${eventsTouched === 1 ? '' : 's'}?${notes ? `\n(${notes} — these will be skipped.)` : ''}`)) return;
      if (await save(changes)) showToast(`Updated ${eventsTouched} events from Excel`);
    } catch (err) {
      showToast('Couldn’t read that file: ' + err.message, 'error');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ------------------------------------------------------------
  // RENDER — GUARDS
  // ------------------------------------------------------------

  if (!loaded || !financialsLoaded) {
    return <JobLogLoader detail={companyName} />;
  }

  if (!isOwner) {
    return (
      <div className="min-h-[100dvh] bg-bb-sidebar flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm text-center">
          <h1 className="text-lg font-bold mb-2">Job Log is for the account owner</h1>
          <p className="text-sm text-bb-muted">You can still add costs on each completed event.</p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // RENDER — SHARED STYLES & STATUS
  // ------------------------------------------------------------
  const readOnly = !canEditEvents;
  const savedLabel = lastError ? 'Not saved — check connection' : pending ? 'Saving…' : 'All changes saved';
  const ro = 'bg-[#f9fafb] text-gray-600 border-b border-r border-gray-100';  // read-only cell
  const foot = 'sticky bottom-0 z-10 bg-bb-sidebar';                         // totals row cell
  const stickyBg = 'bg-[#f9fafb]';

  // ------------------------------------------------------------
  // RENDER — EDITABLE CELL
  // ------------------------------------------------------------
  /** One editable cell (money or text) */
  const renderInput = (row, col, r, c) => {
    const key = draftKey(row.id, col.id);
    const stored = row.values[col.id];
    const isText = col.type === 'text';
    const shown = key in drafts ? drafts[key] : (isText ? (stored || '') : rupees(stored));
    const bg = col.type === 'income' ? 'bg-emerald-50/60' : isText ? 'bg-slate-50/60' : 'bg-white';
    return (
      <td key={col.id} className={`border-b border-r border-gray-100 p-0 ${bg}`}>
        <input
          data-r={r}
          data-c={c}
          inputMode={isText ? 'text' : 'decimal'}
          disabled={readOnly}
          value={shown}
          placeholder="—"
          title={isText ? (stored || '') : undefined}
          onFocus={e => {
            setDrafts(d => ({ ...d, [key]: stored === null || stored === undefined ? '' : String(stored) }));
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
          onBlur={() => commitCell(row, col)}
          onKeyDown={e => handleKeyDown(e, r, c, row, col)}
          onPaste={e => handlePaste(e, r, c)}
          className={`w-full h-9 px-2.5 bg-transparent outline-none placeholder:text-gray-300 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-bb-accent focus:text-bb-accent focus:font-bold hover:bg-amber-50/60 ${isText ? 'min-w-[220px] text-left' : 'min-w-[96px] text-right tabular-nums'}`}
        />
      </td>
    );
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  return (
    <div className="min-h-[100dvh] bg-bb-bg flex flex-col">
      {/* === TOP BAR === */}
      <header className="bg-bb-sidebar text-white flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 sticky top-0 z-30">
        <img src={import.meta.env.BASE_URL + 'eventscope-logo-horizontal.svg'} alt="EventScope" className="hidden sm:block h-[18px]" />
        <div className="font-bold sm:pl-4 sm:border-l border-bb-sidebar-border">
          Job Log <span className="text-xs font-medium text-bb-sidebar-muted">· {companyName}</span>
        </div>
        <div className="flex-1" />
        <div className={`flex items-center gap-1.5 text-xs ${lastError ? 'text-red-300' : 'text-emerald-200'}`}>
          <span className={`w-2 h-2 rounded-full ${lastError ? 'bg-red-400' : pending ? 'bg-amber-300 animate-pulse' : 'bg-emerald-400'}`} />
          {savedLabel}
        </div>
        <button onClick={handleDownload} disabled={busy} className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold border border-bb-sidebar-border rounded-lg px-3 py-1.5 hover:bg-white/10 cursor-pointer disabled:opacity-50">
          <Download size={15} /> {busy === 'download' ? 'Preparing…' : 'Download Excel'}
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy || readOnly} className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold border border-bb-sidebar-border rounded-lg px-3 py-1.5 hover:bg-white/10 cursor-pointer disabled:opacity-50">
          <Upload size={15} /> {busy === 'upload' ? 'Reading…' : 'Upload Excel'}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => handleUpload(e.target.files?.[0])} />
      </header>

      {readOnly && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-2 text-center">
          This account is suspended — the Job Log is read-only.
        </div>
      )}

      {/* === FILTERS === */}
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-5 py-3">
        <select value={period} onChange={e => setPeriod(e.target.value)} className="text-sm border border-bb-border rounded-lg px-2.5 py-2 bg-white">
          <option value="all">All time</option>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="text-sm border border-bb-border rounded-lg px-2.5 py-2 bg-white">
          <option value="all">All event types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={handleDownload} disabled={busy} className="sm:hidden inline-flex items-center gap-1 text-sm font-semibold border border-bb-border bg-white rounded-lg px-3 py-2"><Download size={14} /> Excel</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy || readOnly} className="sm:hidden inline-flex items-center gap-1 text-sm font-semibold border border-bb-border bg-white rounded-lg px-3 py-2"><Upload size={14} /></button>
        <span className="hidden md:inline text-xs text-bb-muted ml-1">
          Click a cell and type · Tab → next column · Enter ↓ next row · Paste a block copied from Excel
        </span>
      </div>

      {/* === SUMMARY CARDS === */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 sm:gap-3 px-3 sm:px-5 pb-3">
        {[
          ['Revenue', rupees(totals.revenue), ''],
          ['Total cost', rupees(totals.cost), ''],
          ['Commission received', rupees(totals.income), 'text-emerald-700 hidden md:block'],
          ['Profit', rupees(totals.profit), totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'],
          ['Margin', totals.margin === null ? '—' : `${totals.margin}%`, ''],
          ['Balance due', rupees(totals.balance), 'text-amber-700'],
        ].map(([label, value, cls]) => (
          <div key={label} className={`bg-white border border-bb-border rounded-xl px-3 py-2 sm:px-4 sm:py-3 ${cls.includes('hidden') ? 'hidden md:block' : ''}`}>
            <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-bb-muted">{label}</p>
            <p className={`text-base sm:text-xl font-bold ${cls.replace('hidden md:block', '')}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* === GRID === */}
      {completed.length === 0 ? (
        <div className="mx-3 sm:mx-5 bg-white border border-bb-border rounded-xl p-10 text-center text-bb-muted">
          No completed events yet. Mark an event as completed and it appears here.
        </div>
      ) : (
        <div className="mx-3 sm:mx-5 mb-5 bg-white border border-bb-border rounded-xl overflow-auto self-stretch sm:self-start max-w-[calc(100%-1.5rem)] sm:max-w-[calc(100%-2.5rem)] max-h-[calc(100dvh-230px)]">
          <table className="border-separate border-spacing-0 text-[12px] sm:text-[13px] min-w-full">
            <thead>
              <tr className="text-[10px] text-white text-center font-bold uppercase tracking-wide">
                <th className="sticky top-0 left-0 z-20 bg-gray-500 h-6" />
                <th className="sticky top-0 z-10 bg-gray-500 hidden md:table-cell" colSpan={BILL_INFO.length + 4}>From event &amp; bill</th>
                <th className="sticky top-0 z-10 bg-gray-500 md:hidden" colSpan={1 + BILL_INFO.filter(b => b.mobile).length}>From event &amp; bill</th>
                {costCols.length > 0 && <th className="sticky top-0 z-10 bg-amber-700" colSpan={costCols.length}>Costs</th>}
                {incomeCols.length > 0 && <th className="sticky top-0 z-10 bg-emerald-700" colSpan={incomeCols.length}>Income</th>}
                <th className="sticky top-0 z-10 bg-violet-800" colSpan={3}>Calculated</th>
                {textCols.length > 0 && <th className="sticky top-0 z-10 bg-slate-600" colSpan={textCols.length}>Notes</th>}
              </tr>
              <tr className="text-[10px] sm:text-[11px] uppercase tracking-wide text-gray-600">
                {[
                  ['Client / event', 'sticky left-0 z-20 text-left min-w-[150px] md:min-w-[220px]'],
                  ['Contact', 'text-left'],
                  ['Location', 'text-left hidden md:table-cell'],
                  ['Type', 'text-left hidden md:table-cell'],
                  ['Invoice #', 'text-left hidden md:table-cell'],
                  ...BILL_INFO.map(b => [b.label, `text-right ${b.mobile ? '' : 'hidden md:table-cell'}`]),
                  ...moneyCols.map(c => [c.label, 'text-right']),
                  ['Total cost', 'text-right'], ['Profit', 'text-right'], ['Margin', 'text-right'],
                  ...textCols.map(c => [c.label, 'text-left']),
                ].map(([label, cls], i) => (
                  <th key={i} className={`sticky top-6 z-10 bg-[#faf8fd] font-bold px-2.5 h-9 border-b border-bb-border whitespace-nowrap ${cls}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={row.id}>
                  <td className={`sticky left-0 z-[5] ${stickyBg} border-b border-r border-bb-border px-2.5 py-1`}>
                    <div className="leading-tight min-w-[140px] md:min-w-[200px] whitespace-normal">
                      <b className="text-bb-text">{row.client}</b>
                      <div className="text-[10px] sm:text-[11px] text-bb-muted">
                        {row.date ? formatDateReadable(row.date) : ''}{row.time ? ` ${row.time}` : ''} · {row.event}{row.subEvents ? ` +${row.subEvents} more` : ''}
                      </div>
                    </div>
                  </td>
                  <td className={`${ro} px-2.5 whitespace-nowrap`}>
                    {row.phone
                      ? <a href={`tel:${row.phone}`} className="text-bb-accent hover:underline tabular-nums">{row.phone}</a>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`hidden md:table-cell ${ro} px-2.5 whitespace-nowrap`}>{row.location}</td>
                  <td className={`hidden md:table-cell ${ro} px-2.5 whitespace-nowrap`}>{row.type}</td>
                  <td className={`hidden md:table-cell ${ro} px-2.5 whitespace-nowrap`}>{row.invoiceNo || <span className="text-gray-300">no bill</span>}</td>
                  {BILL_INFO.map(b => (
                    <td key={b.key} className={`${ro} ${b.mobile ? '' : 'hidden md:table-cell'} text-right px-2.5 whitespace-nowrap tabular-nums ${b.key === 'revenue' ? 'font-bold text-bb-text' : ''} ${b.key === 'balance' && row.balance > 0 ? 'text-amber-700 font-semibold' : ''}`}>
                      {b.key === 'gst' && !row.gst ? '' : rupees(row[b.key])}
                    </td>
                  ))}
                  {moneyCols.map((col) => renderInput(row, col, r, editCols.indexOf(col)))}
                  <td className="bg-violet-50/70 font-semibold text-right border-b border-r border-gray-100 px-2.5 whitespace-nowrap tabular-nums">{row.calc.hasAny ? rupees(row.calc.totalCost) : ''}</td>
                  <td className={`bg-violet-50/70 font-semibold text-right border-b border-r border-gray-100 px-2.5 whitespace-nowrap tabular-nums ${row.calc.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {row.calc.hasAny ? rupees(row.calc.profit) : <span className="text-gray-400 font-normal">pending</span>}
                  </td>
                  <td className="bg-violet-50/70 font-semibold text-right border-b border-r border-gray-100 px-2.5 whitespace-nowrap tabular-nums">{row.calc.hasAny && row.calc.margin !== null ? `${row.calc.margin}%` : ''}</td>
                  {textCols.map((col) => renderInput(row, col, r, editCols.indexOf(col)))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-white font-bold">
                <td className={`${foot} left-0 z-20 px-2.5 h-10 whitespace-nowrap`}>Total · {rows.length} event{rows.length === 1 ? '' : 's'}</td>
                <td className={foot} />
                <td className={`${foot} hidden md:table-cell`} colSpan={3} />
                {BILL_INFO.map(b => (
                  <td key={b.key} className={`${foot} ${b.mobile ? '' : 'hidden md:table-cell'} text-right px-2.5 whitespace-nowrap tabular-nums ${b.key === 'balance' ? 'text-amber-300' : ''}`}>{rupees(totals[b.key])}</td>
                ))}
                {moneyCols.map(c => (
                  <td key={c.id} className={`${foot} text-right px-2.5 whitespace-nowrap tabular-nums`}>{rupees(totals.byCol[c.id] || 0)}</td>
                ))}
                <td className={`${foot} text-right px-2.5 whitespace-nowrap tabular-nums`}>{rupees(totals.cost)}</td>
                <td className={`${foot} text-right px-2.5 whitespace-nowrap tabular-nums text-emerald-300`}>{rupees(totals.profit)}</td>
                <td className={`${foot} text-right px-2.5 whitespace-nowrap tabular-nums`}>{totals.margin === null ? '' : `${totals.margin}%`}</td>
                {textCols.map(c => <td key={c.id} className={foot} />)}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
