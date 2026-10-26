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
import { getEventBill, computeEventFinancials, parseMoneyExpr, validateMoneyInput, formatDateRange, functionEnd } from '../utils/helpers';
import { exportJobLogToExcel, readJobLogFromExcel } from '../utils/jobLogExcel';
import { Download, Upload, Loader2, AlertTriangle, MapPin } from 'lucide-react';
import { useIsPhone } from '../components/useIsPhone';
import { Switch } from '../components/LaptopUI';
import { useConfirm } from '../components/useConfirm';
import UpgradeCard from '../components/UpgradeCard';

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

/** Shown instead of the grid on phones — the Job Log needs a wide screen */
function PhoneNotice() {
  return (
    <div className="min-h-[100dvh] bg-bb-sidebar flex flex-col items-center justify-center gap-5 p-6 text-center">
      <img src={import.meta.env.BASE_URL + 'eventscope-logo.svg'} alt="EventScope" className="h-20 w-auto" />
      <div className="bg-white rounded-2xl p-6 max-w-xs">
        <p className="font-bold text-gray-900 mb-1">Job Log works on a laptop or tablet</p>
        <p className="text-sm text-gray-500 mb-4">It’s a wide spreadsheet. On your phone you can still add costs from each event’s card.</p>
        <a href="#/" className="inline-block px-5 py-2.5 bg-bb-accent text-white rounded-lg text-sm font-semibold">Back to Home</a>
      </div>
    </div>
  );
}

/** True on tablet/laptop widths (768px+); updates when the window is resized */
function useWideScreen() {
  const query = '(min-width: 768px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

// ============================================================
// JobLog — PAGE (phone gate) + MAIN COMPONENT (the grid)
// ============================================================

/** Route component: the grid on tablet/laptop, a short notice on phones */
export default function JobLog() {
  return useWideScreen() ? <JobLogGrid /> : <PhoneNotice />;
}

function JobLogGrid() {
  const {
    events, loaded, financials, financialsLoaded, jobLogColumns, saveFinancials,
    settings, tenant, isOwner, canEditEvents, showToast, canUse,
  } = useApp();
  const confirm = useConfirm();

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
  const lap = !useIsPhone();                        // laptop layout from 1024px; tablets keep the classic grid
  const [moreCols, setMoreCols] = useState(() => { try { return localStorage.getItem('jobLogMore') === '1'; } catch { return false; } });
  const [focusRows, setFocusRows] = useState(null); // laptop: 'loss' | 'empty' | null
  const [errors, setErrors] = useState({});         // laptop: { 'eventId|colId': why the typed value is wrong }
  const lastChanges = useRef([]);                   // for Retry after a failed save

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

  const allRows = useMemo(() => completed
    .filter(e => period === 'all' || monthKey(eventDate(e)) === period)
    .filter(e => typeFilter === 'all' || e.eventType === typeFilter)
    .map(e => {
      const bill = getEventBill(e);
      const values = financials[e.id]?.values || {};
      return {
        id: e.id,
        date: eventDate(e),
        endDate: e.mainEvent ? functionEnd(e.mainEvent) : '',
        time: e.mainEvent?.time || '',
        client: e.clientName || '',
        phone: e.clientPhone || e.clientWhatsapp || '',
        event: e.mainEvent?.name || e.eventType || '',
        subEvents: (e.subEvents || []).length,
        location: e.mainEvent?.location || e.eventLocation || '',
        type: e.eventType || '',
        ...bill,
        values,
        formulas: financials[e.id]?.formulas || {},
        calc: computeEventFinancials(bill.revenue, values, jobLogColumns),
      };
    }), [completed, period, typeFilter, financials, jobLogColumns]);

  // Laptop warnings: events making a loss, and events with no costs yet
  const lossCount = useMemo(() => allRows.filter(r => r.calc.hasAny && r.calc.profit < 0).length, [allRows]);
  const emptyCount = useMemo(() => allRows.filter(r => !r.calc.hasAny).length, [allRows]);
  const rows = useMemo(() => !lap || !focusRows ? allRows
    : allRows.filter(r => focusRows === 'loss' ? (r.calc.hasAny && r.calc.profit < 0) : !r.calc.hasAny), [allRows, lap, focusRows]);

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
    lastChanges.current = changes;
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
    // laptop: a wrong value stays in the box, red, with the reason — nothing is saved until it is right
    if (lap && col.type !== 'text') {
      const check = validateMoneyInput(text);
      if (!check.ok) { setErrors(er => ({ ...er, [key]: check.message })); return; }
    }
    setDrafts(d => { const n = { ...d }; delete n[key]; return n; });
    if (col.type === 'text') {
      const value = text.trim() || null;
      if (value === (row.values[col.id] || null)) return;
      save([{ eventId: row.id, columnId: col.id, value }]);
      return;
    }
    const parsed = parseMoneyExpr(text);
    if (!parsed) {
      showToast(`“${text}” isn’t a number or a sum like 12000+3500 — not saved`, 'error');
      return;
    }
    const { value, formula } = parsed;
    const current = row.values[col.id];
    const currentNum = current === null || current === undefined || current === '' ? null : Number(current);
    if (value === currentNum && formula === (row.formulas[col.id] || null)) return;
    save([{ eventId: row.id, columnId: col.id, value, formula }]);
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
      setErrors(er => { const n = { ...er }; delete n[key]; return n; });
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
        const parsed = parseMoneyExpr(cellText);
        if (!parsed) { skipped++; return; }
        changes.push({ eventId: row.id, columnId: col.id, value: parsed.value, formula: parsed.formula });
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
      if (!(await confirm({
        title: `Update ${changes.length} value${changes.length === 1 ? '' : 's'}?`,
        message: `From your Excel file, across ${eventsTouched} event${eventsTouched === 1 ? '' : 's'}.`,
        note: notes ? `${notes} — these will be skipped.` : undefined,
        confirmLabel: 'Update', tone: 'warning',
      }))) return;
      if (await save(changes.map(ch => ({ ...ch, formula: null })))) showToast(`Updated ${eventsTouched} events from Excel`);
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

  if (!canUse('jobLog')) {
    return (
      <div className="min-h-[100dvh] bg-bb-bg flex items-center justify-center p-4">
        <UpgradeCard feature="jobLog" text="Costs and income for every event, with profit worked out for you." />
      </div>
    );
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
  const subLine = (row) => `${row.date ? formatDateRange(row.date, row.endDate) : ''}${row.time ? ` ${row.time}` : ''} · ${row.event}${row.subEvents ? ` +${row.subEvents} more` : ''}`;
  // Laptop: columns that come from the event & bill (the rest wait behind "More columns")
  const lapInfo = [
    ...(moreCols ? [{ key: 'phone', label: 'Contact', text: true }, { key: 'location', label: 'Location', text: true }, { key: 'type', label: 'Type', text: true }, { key: 'invoiceNo', label: 'Invoice #', text: true }] : []),
    { key: 'revenue', label: 'Revenue', num: true },
    ...(moreCols ? [{ key: 'gst', label: 'GST', num: true }, { key: 'billTotal', label: 'Bill total', num: true }, { key: 'advance', label: 'Received', num: true }, { key: 'balance', label: 'Balance due', num: true }] : []),
  ];

  // ------------------------------------------------------------
  // RENDER — EDITABLE CELL
  // ------------------------------------------------------------
  /** One editable cell (money or text) */
  const renderInput = (row, col, r, c) => {
    const key = draftKey(row.id, col.id);
    const stored = row.values[col.id];
    const isText = col.type === 'text';
    const formula = isText ? null : row.formulas[col.id] || null;
    const shown = key in drafts ? drafts[key] : (isText ? (stored || '') : rupees(stored));
    const bg = col.type === 'income' ? 'bg-emerald-50/60' : isText ? 'bg-slate-50/60' : 'bg-white';
    if (lap) {
      const err = errors[key];
      const box = err ? 'border-red-400 bg-red-50 text-red-700'
        : col.type === 'income' ? 'border-emerald-300 bg-white' : 'border-bb-border bg-white';
      return (
        <td key={col.id} className="border-b border-bb-border/60 px-2 py-2.5 align-top bg-white">
          <input
            data-r={r}
            data-c={c}
            inputMode={isText ? 'text' : 'decimal'}
            disabled={readOnly}
            value={shown}
            placeholder="—"
            aria-invalid={!!err}
            title={isText ? (stored || '') : formula ? `${formula.replace(/([-+])/g, ' $1 ')} = ${rupees(stored)}` : undefined}
            onFocus={e => {
              setDrafts(d => key in d ? d : { ...d, [key]: formula || (stored === null || stored === undefined ? '' : String(stored)) });
              requestAnimationFrame(() => e.target.select());
            }}
            onChange={e => { setDrafts(d => ({ ...d, [key]: e.target.value })); setErrors(er => { if (!(key in er)) return er; const n = { ...er }; delete n[key]; return n; }); }}
            onBlur={() => commitCell(row, col)}
            onKeyDown={e => handleKeyDown(e, r, c, row, col)}
            onPaste={e => handlePaste(e, r, c)}
            className={`w-full h-9 px-2.5 rounded-lg border outline-none placeholder:text-gray-300 focus:ring-2 focus:ring-bb-accent focus:border-transparent ${box} ${isText ? 'min-w-[240px] text-left' : 'min-w-[104px] text-right tabular-nums'}`}
          />
          {err && <p className="text-[11px] text-red-600 mt-1 leading-tight max-w-[180px]" data-testid="cell-error">{err}</p>}
        </td>
      );
    }
    return (
      <td key={col.id} className={`border-b border-r border-gray-100 p-0 ${bg}`}>
        <input
          data-r={r}
          data-c={c}
          inputMode={isText ? 'text' : 'decimal'}
          disabled={readOnly}
          value={shown}
          placeholder="—"
          title={isText ? (stored || '') : formula ? `${formula.replace(/([-+])/g, ' $1 ')} = ${rupees(stored)}` : undefined}
          onFocus={e => {
            // a cell saved as a sum opens showing the sum, so it can be edited
            setDrafts(d => ({ ...d, [key]: formula || (stored === null || stored === undefined ? '' : String(stored)) }));
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
          {lastError && <button onClick={() => save(lastChanges.current)} className="ml-1 underline font-semibold cursor-pointer" data-testid="retry-save">Retry</button>}
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
      {!lap && <div className="flex flex-wrap items-center gap-2 px-3 sm:px-5 py-3">
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
          Click a cell and type · sums work too: 12000+3500 · Tab → next column · Enter ↓ next row · Paste a block copied from Excel
        </span>
      </div>}
      {lap && (
        <div className="flex flex-wrap items-center gap-3 px-5 py-4" data-testid="joblog-filters">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="h-9 text-sm font-medium border border-bb-border rounded-lg px-3 bg-white">
            <option value="all">All time</option>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-9 text-sm font-medium border border-bb-border rounded-lg px-3 bg-white">
            <option value="all">All event types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <Switch label="More columns" testId="more-columns" checked={moreCols}
            onChange={v => { setMoreCols(v); try { localStorage.setItem('jobLogMore', v ? '1' : '0'); } catch { /* private mode */ } }} />
          {lossCount > 0 && (
            <button onClick={() => setFocusRows(f => f === 'loss' ? null : 'loss')} data-testid="chip-loss"
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold cursor-pointer bg-red-100 text-red-700 ${focusRows === 'loss' ? 'ring-2 ring-red-400' : ''}`}>
              <AlertTriangle size={13} /> {lossCount} making a loss
            </button>
          )}
          {emptyCount > 0 && (
            <button onClick={() => setFocusRows(f => f === 'empty' ? null : 'empty')} data-testid="chip-empty"
              className={`inline-flex items-center h-8 px-3 rounded-full text-xs font-bold cursor-pointer bg-amber-100 text-amber-800 ${focusRows === 'empty' ? 'ring-2 ring-amber-400' : ''}`}>
              {emptyCount} not filled yet
            </button>
          )}
          {focusRows && <span className="text-xs text-bb-muted">Showing only these — click the chip again to see all.</span>}
        </div>
      )}

      {/* === SUMMARY CARDS === */}
      <div className={`grid grid-cols-2 md:grid-cols-6 gap-2 sm:gap-3 px-3 sm:px-5 ${lap ? 'pb-4' : 'pb-3'}`}>
        {[
          ['Revenue', rupees(totals.revenue), ''],
          ['Total cost', rupees(totals.cost), ''],
          ['Commission received', rupees(totals.income), 'text-emerald-700 hidden md:block'],
          ['Profit', rupees(totals.profit), totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'],
          ['Margin', totals.margin === null ? '—' : `${totals.margin}%`, ''],
          ['Balance due', rupees(totals.balance), 'text-amber-700'],
        ].map(([label, value, cls]) => (
          <div key={label} className={`bg-white border border-bb-border rounded-xl px-3 py-2 sm:px-4 sm:py-3 ${cls.includes('hidden') ? 'hidden md:block' : ''}`}>
            <p className={`uppercase tracking-wide text-bb-muted ${lap ? 'text-[10.5px] font-semibold' : 'text-[10px] sm:text-[11px]'}`}>{label}</p>
            <p className={`font-bold ${lap ? 'text-[22px] leading-tight' : 'text-base sm:text-xl'} ${cls.replace('hidden md:block', '')}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* === GRID === */}
      {completed.length === 0 ? (
        <div className="mx-3 sm:mx-5 bg-white border border-bb-border rounded-xl p-10 text-center text-bb-muted">
          No completed events yet. Mark an event as completed and it appears here.
        </div>
      ) : lap ? (
        <div className="mx-5 mb-5 bg-white border border-bb-border rounded-xl overflow-auto max-h-[calc(100dvh-250px)]" data-testid="joblog-table">
          <table className="border-separate border-spacing-0 text-[13px] min-w-full">
            <thead>
              <tr className="text-[10.5px] text-white font-bold uppercase tracking-wide text-left">
                <th className="sticky top-0 left-0 z-30 bg-gray-500 h-8" colSpan={2} />
                <th className="sticky top-0 z-10 bg-gray-500 px-3 whitespace-nowrap" colSpan={lapInfo.length}>From event &amp; bill</th>
                {costCols.length > 0 && <th className="sticky top-0 z-10 bg-amber-700 px-3 whitespace-nowrap" colSpan={costCols.length}>Costs · you fill in</th>}
                {incomeCols.length > 0 && <th className="sticky top-0 z-10 bg-emerald-700 px-3 whitespace-nowrap" colSpan={incomeCols.length}>Income · you fill in</th>}
                <th className="sticky top-0 z-10 bg-violet-800 px-3" colSpan={3}>Calculated</th>
                {textCols.length > 0 && <th className="sticky top-0 z-10 bg-slate-600 px-3 whitespace-nowrap" colSpan={textCols.length}>Notes · you fill in</th>}
              </tr>
              <tr className="text-[11px] uppercase tracking-wide text-gray-600">
                <th className="sticky top-8 left-0 z-30 bg-[#faf8fd] font-bold px-3 h-10 border-b border-bb-border w-12 min-w-[48px] text-center">#</th>
                <th className="sticky top-8 left-12 z-30 bg-[#faf8fd] font-bold px-3 h-10 border-b border-r border-bb-border text-left min-w-[364px]">Client / event</th>
                {lapInfo.map(b => <th key={b.key} className={`sticky top-8 z-10 bg-[#faf8fd] font-bold px-3 h-10 border-b border-bb-border whitespace-nowrap ${b.text ? 'text-left' : 'text-right'}`}>{b.label}</th>)}
                {moneyCols.map(c => <th key={c.id} className="sticky top-8 z-10 bg-[#faf8fd] font-bold px-3 h-10 border-b border-bb-border whitespace-nowrap text-right">{c.label}</th>)}
                {['Total cost', 'Profit', 'Margin'].map(l => <th key={l} className="sticky top-8 z-10 bg-[#faf8fd] font-bold px-3 h-10 border-b border-bb-border whitespace-nowrap text-right">{l}</th>)}
                {textCols.map(c => <th key={c.id} className="sticky top-8 z-10 bg-[#faf8fd] font-bold px-3 h-10 border-b border-bb-border whitespace-nowrap text-left">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={99} className="p-8 text-center text-bb-muted">No events match.</td></tr>
              )}
              {rows.map((row, r) => {
                const loss = row.calc.hasAny && row.calc.profit < 0;
                return (
                  <tr key={row.id}>
                    <td className="sticky left-0 z-[5] bg-white border-b border-bb-border/60 px-3 text-center text-bb-muted align-middle">{r + 1}</td>
                    <td className="sticky left-12 z-[5] bg-white border-b border-r border-bb-border/60 px-3 py-2.5 align-middle">
                      <div className="leading-tight w-[340px]">
                        <div className="flex items-center gap-2">
                          <b className="text-bb-accent-hover text-[14.5px] truncate flex-1 min-w-0" title={row.client}>{row.client}</b>
                          {loss && <span className="shrink-0 whitespace-nowrap text-[10px] font-bold uppercase text-red-700 bg-red-100 rounded-full px-2 py-0.5" data-testid="loss-tag">Loss</span>}
                          {!row.calc.hasAny && <span className="shrink-0 whitespace-nowrap text-[10px] font-bold uppercase text-amber-800 bg-amber-100 rounded-full px-2 py-0.5" data-testid="nocost-tag">No costs</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-[13px]" title={subLine(row)}>
                          <b className="shrink-0 whitespace-nowrap text-bb-text bg-gray-100 rounded-md px-2 py-0.5">{row.date ? formatDateRange(row.date, row.endDate) : ''}{row.time ? ` · ${row.time}` : ''}</b>
                          <span className="text-gray-700 font-medium truncate min-w-0">{row.event}</span>
                          {row.subEvents > 0 && <span className="shrink-0 whitespace-nowrap text-[11.5px] font-bold text-bb-accent-hover bg-violet-100 rounded-full px-2 py-0.5">+{row.subEvents} more</span>}
                        </div>
                        {row.location && <div className="flex items-center gap-1.5 mt-1.5 text-[13px] font-medium text-gray-700 min-w-0" title={row.location}><MapPin size={14} className="shrink-0 text-bb-accent" /><span className="truncate">{row.location}</span></div>}
                      </div>
                    </td>
                    {lapInfo.map(b => (
                      <td key={b.key} className={`border-b border-bb-border/60 px-3 whitespace-nowrap align-middle ${b.text ? 'text-left text-bb-muted' : 'text-right tabular-nums'} ${b.key === 'revenue' ? 'font-bold text-bb-text' : ''} ${b.key === 'balance' && row.balance > 0 ? 'text-amber-700 font-semibold' : ''}`}>
                        {b.key === 'phone' ? (row.phone ? <a href={`tel:${row.phone}`} className="text-bb-accent hover:underline tabular-nums">{row.phone}</a> : <span className="text-gray-300">—</span>)
                          : b.key === 'invoiceNo' ? (row.invoiceNo || <span className="text-gray-300">no bill</span>)
                          : b.text ? row[b.key]
                          : b.key === 'gst' && !row.gst ? '' : rupees(row[b.key])}
                      </td>
                    ))}
                    {moneyCols.map((col) => renderInput(row, col, r, editCols.indexOf(col)))}
                    <td className="border-b border-bb-border/60 bg-violet-50/60 font-semibold text-right px-3 whitespace-nowrap tabular-nums align-middle">{row.calc.hasAny ? rupees(row.calc.totalCost) : ''}</td>
                    <td className={`border-b border-bb-border/60 bg-violet-50/60 font-semibold text-right px-3 whitespace-nowrap tabular-nums align-middle ${row.calc.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {row.calc.hasAny ? rupees(row.calc.profit) : <span className="text-gray-400 font-normal">pending</span>}
                    </td>
                    <td className="border-b border-bb-border/60 bg-violet-50/60 font-semibold text-right px-3 whitespace-nowrap tabular-nums align-middle">{row.calc.hasAny && row.calc.margin !== null ? `${row.calc.margin}%` : ''}</td>
                    {textCols.map((col) => renderInput(row, col, r, editCols.indexOf(col)))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-white font-bold">
                <td className={`${foot} left-0 z-20 h-11`} />
                <td className={`${foot} left-12 z-20 px-3 whitespace-nowrap`}>Total · {rows.length} event{rows.length === 1 ? '' : 's'}</td>
                {lapInfo.map(b => (
                  <td key={b.key} className={`${foot} text-right px-3 whitespace-nowrap tabular-nums ${b.key === 'balance' ? 'text-amber-300' : ''}`}>
                    {b.num ? rupees(totals[b.key]) : ''}
                  </td>
                ))}
                {moneyCols.map(c => (
                  <td key={c.id} className={`${foot} text-right px-3 whitespace-nowrap tabular-nums`}>{rupees(totals.byCol[c.id] || 0)}</td>
                ))}
                <td className={`${foot} text-right px-3 whitespace-nowrap tabular-nums`}>{rupees(totals.cost)}</td>
                <td className={`${foot} text-right px-3 whitespace-nowrap tabular-nums text-emerald-300`}>{rupees(totals.profit)}</td>
                <td className={`${foot} text-right px-3 whitespace-nowrap tabular-nums`}>{totals.margin === null ? '' : `${totals.margin}%`}</td>
                {textCols.map(c => <td key={c.id} className={foot} />)}
              </tr>
            </tfoot>
          </table>
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
                        {row.date ? formatDateRange(row.date, row.endDate) : ''}{row.time ? ` ${row.time}` : ''} · {row.event}{row.subEvents ? ` +${row.subEvents} more` : ''}
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
