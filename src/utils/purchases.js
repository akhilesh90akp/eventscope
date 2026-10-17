/**
 * purchases — money spent on the business itself (equipment, furniture,
 * lights, décor, vehicles…), kept apart from any one event's costs.
 *
 * Pure functions, no Firebase and no React: the Purchases page and Reports
 * use these to group by financial year (April–March) and add things up, and
 * exportPurchasesToExcel builds the download. Covered by tests/purchases.test.mjs.
 *
 * Stored at tenants/{id}/purchases/{id}:
 *   { mode: 'total'|'item', date: 'YYYY-MM-DD', name, qty, category, amount, note, createdAt, createdBy }
 *   mode 'total' = "Just the total" (one amount for a shopping trip, no item list)
 */

// ============================================================
// IMPORTS
// ============================================================
import { getEventRevenue, computeEventFinancials } from './helpers.js';

// ============================================================
// CONSTANTS
// ============================================================
export const PURCHASE_CATEGORIES = ['Equipment', 'Furniture', 'Lighting', 'Décor', 'Vehicle', 'Other'];

// ============================================================
// FINANCIAL YEAR (April–March)
// ============================================================

/** Year the financial year starts in: 2026-05-10 → 2026, 2027-02-01 → 2026 */
export const fyStart = (date) => {
  const [y, m] = String(date || '').split('-').map(Number);
  if (!y || !m) return null;
  return m >= 4 ? y : y - 1;
};

/** "FY 2026–27" for the year starting April 2026 */
export const fyLabel = (start) => `FY ${start}–${String((start + 1) % 100).padStart(2, '0')}`;

/** First and last day of a financial year: 2026 → ['2026-04-01', '2027-03-31'] */
export const fyRange = (start) => [`${start}-04-01`, `${start + 1}-03-31`];

/** Financial years that have purchases, newest first, always including the current one */
export const purchaseYears = (purchases, today = new Date().toISOString().slice(0, 10)) => {
  const set = new Set([fyStart(today)]);
  purchases.forEach(p => { const s = fyStart(p.date); if (s) set.add(s); });
  return [...set].filter(Boolean).sort((a, b) => b - a);
};

// ============================================================
// TOTALS
// ============================================================

/** Purchases dated from..to (inclusive, 'YYYY-MM-DD'; blank = open-ended) */
export const purchasesBetween = (purchases, from, to) =>
  purchases.filter(p => p.date && (!from || p.date >= from) && (!to || p.date <= to));

/** Sum of amounts */
export const purchaseTotal = (purchases) => purchases.reduce((s, p) => s + (Number(p.amount) || 0), 0);

/** { total, count, biggestCategory: { name, amount } | null, byCategory: { [name]: amount } } */
export const summarizePurchases = (purchases) => {
  const byCategory = {};
  purchases.forEach(p => {
    const c = p.mode === 'total' ? 'Total only' : (p.category || 'Other');
    byCategory[c] = (byCategory[c] || 0) + (Number(p.amount) || 0);
  });
  const top = Object.entries(byCategory).filter(([c]) => c !== 'Total only').sort((a, b) => b[1] - a[1])[0];
  return {
    total: purchaseTotal(purchases),
    count: purchases.length,
    biggestCategory: top ? { name: top[0], amount: top[1] } : null,
    byCategory,
  };
};

/**
 * Job Log profit of completed events dated from..to (same rule as Reports:
 * only events with at least one cost/income entered count).
 * → { profit, profitEvents, completed }
 */
export const eventProfitBetween = (events, financials, columns, from, to) => {
  let profit = 0;
  let profitEvents = 0;
  const done = events.filter(e => {
    const d = e.mainEvent?.date || e.date;
    return e.status === 'completed' && d && (!from || d >= from) && (!to || d <= to);
  });
  done.forEach(e => {
    const calc = computeEventFinancials(getEventRevenue(e), financials[e.id]?.values, columns);
    if (calc.hasAny) { profit += calc.profit; profitEvents++; }
  });
  return { profit, profitEvents, completed: done.length };
};

/** Newest first; same date → most recently added first */
export const sortPurchases = (purchases) => [...purchases].sort((a, b) =>
  String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

/**
 * Cleans a purchase typed in the Add/Edit pop-up → the fields to save, or
 * { error } if something needed is missing.
 */
export const cleanPurchase = (raw, mode) => {
  const amount = Math.round((Number(String(raw.amount ?? '').replace(/[₹,\s]/g, '')) || 0) * 100) / 100;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ''))) return { error: 'Pick a date.' };
  if (!(amount > 0)) return { error: 'Enter an amount more than ₹0.' };
  if (mode === 'total') {
    return { mode: 'total', date: raw.date, name: '', qty: 1, category: '', amount, note: String(raw.note || '').trim() };
  }
  const name = String(raw.name || '').trim();
  if (!name) return { error: 'Say what you bought.' };
  return {
    mode: 'item', date: raw.date, name,
    qty: Math.max(1, Math.round(Number(raw.qty) || 1)),
    category: String(raw.category || '').trim() || 'Other',
    amount, note: String(raw.note || '').trim(),
  };
};

// ============================================================
// EXCEL
// ============================================================

/** Downloads the given purchases as an .xlsx (exceljs is loaded only when needed) */
export async function exportPurchasesToExcel(purchases, { title = 'Purchases', fileName = 'Purchases.xlsx' } = {}) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Purchases', { views: [{ state: 'frozen', ySplit: 2 }] });
  const MONEY = '"₹"#,##,##0';
  ws.columns = [
    { key: 'date', width: 13 }, { key: 'name', width: 34 }, { key: 'qty', width: 7 },
    { key: 'category', width: 15 }, { key: 'amount', width: 14 }, { key: 'note', width: 40 },
  ];
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF652D90' } };
  const head = ws.getRow(2);
  head.values = ['Date', 'What', 'Qty', 'Category', 'Amount', 'Note'];
  head.font = { bold: true };
  head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EFFE' } }; });
  sortPurchases(purchases).forEach(p => {
    const [y, m, d] = p.date.split('-').map(Number);
    const row = ws.addRow({
      date: new Date(Date.UTC(y, m - 1, d)),
      name: p.mode === 'total' ? 'Total only' : p.name,
      qty: p.mode === 'total' ? '' : p.qty,
      category: p.mode === 'total' ? '' : p.category,
      amount: Number(p.amount) || 0,
      note: p.note || '',
    });
    row.getCell('date').numFmt = 'dd-mmm-yyyy';
    row.getCell('amount').numFmt = MONEY;
  });
  const last = ws.rowCount;
  const total = ws.addRow({ name: 'Total', amount: last >= 3 ? { formula: `SUM(E3:E${last})`, result: purchaseTotal(purchases) } : 0 });
  total.font = { bold: true };
  total.getCell('amount').numFmt = MONEY;

  const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
