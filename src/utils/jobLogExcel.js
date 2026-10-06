/**
 * Job Log ⇄ Excel (.xlsx)
 *
 * - exportJobLogToExcel: builds a real Excel file of the Job Log rows the
 *   user is looking at, with live formulas for Total cost / Profit / Margin
 *   so the file keeps calculating if they edit it offline.
 * - readJobLogFromExcel: reads an uploaded .xlsx back and returns the cost/
 *   income cells to save. Rows are matched by the hidden "Event ID" column
 *   (so renaming a client in the sheet can't attach costs to the wrong
 *   event); columns are matched by their header text.
 *
 * exceljs is ~1 MB, so it's loaded on demand (dynamic import) — it never
 * slows down the normal app start.
 */

// ============================================================
// CONSTANTS
// ============================================================
const ID_HEADER = 'Event ID';
const MONEY_FMT = '"₹"#,##,##0;[Red]-"₹"#,##,##0';

// ============================================================
// HELPERS
// ============================================================

const loadExcelJS = async () => (await import('exceljs')).default;

/** Excel column letter for a 1-based index (1 → A, 27 → AA) */
const colLetter = (n) => {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** Triggers a browser download for a Blob */
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Reads a cell's value as trimmed text ('' if empty) */
const cellText = (cell) => {
  let v = cell?.value;
  if (v && typeof v === 'object') {
    if ('result' in v) v = v.result;
    else if ('richText' in v) v = v.richText.map(t => t.text).join('');
    else if ('text' in v) v = v.text;
  }
  return v === null || v === undefined ? '' : String(v).trim();
};

/** Reads a cell's value as a plain number or null (handles formulas/rich text) */
const cellNumber = (cell) => {
  let v = cell?.value;
  if (v && typeof v === 'object') {
    if ('result' in v) v = v.result;          // formula cell
    else if ('richText' in v) v = v.richText.map(t => t.text).join('');
    else if ('text' in v) v = v.text;
  }
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[₹,\s]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '—') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;   // undefined = not a number (skip, report)
};

// ============================================================
// EXPORT
// ============================================================

/**
 * rows: Job Log rows (see JobLog.jsx) — id, date, time, client, phone, event,
 *   location, type, invoiceNo, revenue, gst, billTotal, advance, balance, values
 * columns: active Job Log columns [{ id, label, type: 'cost'|'income'|'text' }]
 */
export async function exportJobLogToExcel({ rows, columns, companyName, periodLabel }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EventScope';
  const ws = wb.addWorksheet('Job Log', { views: [{ state: 'frozen', xSplit: 4, ySplit: 1 }] });

  const costCols = columns.filter(c => c.type === 'cost' || !c.type);
  const incomeCols = columns.filter(c => c.type === 'income');
  const textCols = columns.filter(c => c.type === 'text');
  const money = [...costCols, ...incomeCols];

  const INFO = ['Date', 'Time', 'Client', 'Phone', 'Event', 'Location', 'Type', 'Invoice #'];
  const BILL = ['Revenue (excl. GST)', 'GST', 'Bill total', 'Received', 'Balance due'];
  const headers = [ID_HEADER, ...INFO, ...BILL, ...money.map(c => c.label), 'Total cost', 'Profit', 'Margin', ...textCols.map(c => c.label)];
  ws.addRow(headers);

  // Column positions (1-based)
  const revenueCol = 2 + INFO.length;
  const firstBill = revenueCol, lastBill = revenueCol + BILL.length - 1;
  const firstValCol = lastBill + 1;
  const firstIncomeCol = firstValCol + costCols.length;
  const lastValCol = firstValCol + money.length - 1;
  const totalCostCol = lastValCol + 1;
  const profitCol = totalCostCol + 1;
  const marginCol = profitCol + 1;
  const firstTextCol = marginCol + 1;

  rows.forEach((r, i) => {
    const n = i + 2;
    const R = colLetter(revenueCol);
    const costSum = costCols.length ? `SUM(${colLetter(firstValCol)}${n}:${colLetter(firstIncomeCol - 1)}${n})` : '0';
    const incomeSum = incomeCols.length ? `SUM(${colLetter(firstIncomeCol)}${n}:${colLetter(lastValCol)}${n})` : '0';
    const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
    ws.addRow([
      r.id, r.date, r.time || '', r.client, r.phone || '', r.event, r.location, r.type, r.invoiceNo || '',
      r.revenue, r.gst || 0, r.billTotal, r.advance || 0, r.balance || 0,
      ...money.map(c => num(r.values?.[c.id])),
      { formula: costSum },
      { formula: `${R}${n}+${incomeSum}-${colLetter(totalCostCol)}${n}` },
      { formula: `IF(${R}${n}>0,${colLetter(profitCol)}${n}/${R}${n},"")` },
      ...textCols.map(c => r.values?.[c.id] || ''),
    ]);
  });

  // Totals row
  const last = rows.length + 1;
  if (rows.length) {
    const totalRow = ws.addRow(['', 'Total', '', `${rows.length} events`]);
    for (let c = firstBill; c <= profitCol; c++) {
      totalRow.getCell(c).value = { formula: `SUM(${colLetter(c)}2:${colLetter(c)}${last})` };
    }
    totalRow.getCell(marginCol).value = {
      formula: `IF(${colLetter(revenueCol)}${last + 1}>0,${colLetter(profitCol)}${last + 1}/${colLetter(revenueCol)}${last + 1},"")`,
    };
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
  }

  // Styling
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF331948' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  ws.columns.forEach((col, idx) => {
    const n = idx + 1;
    col.width = n === 1 ? 14 : n < revenueCol ? 18 : n >= firstTextCol ? 36 : 15;
    if (n >= firstBill && n <= profitCol) col.numFmt = MONEY_FMT;
    if (n === marginCol) col.numFmt = '0%';
  });
  ws.getColumn(1).hidden = true; // Event ID: needed to upload changes back; keep it, don't edit it
  for (let c = firstValCol; c <= lastValCol; c++) {
    header.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c >= firstIncomeCol ? 'FF047857' : 'FFB45309' } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const safe = (companyName || 'EventScope').replace(/[^\w\- ]+/g, '').trim() || 'EventScope';
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${safe} Job Log${periodLabel ? ' - ' + periodLabel : ''}.xlsx`,
  );
}

// ============================================================
// IMPORT
// ============================================================

/**
 * Reads an uploaded Job Log .xlsx.
 * Returns { changes: [{eventId, columnId, value}], matchedColumns: [labels],
 *           unknownEventRows, badCells, missingIdColumn }.
 * Blank cells are skipped (not cleared) so a partial sheet never wipes data.
 */
export async function readJobLogFromExcel(file, { columns, knownEventIds }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return { changes: [], matchedColumns: [], unknownEventRows: 0, badCells: 0, missingIdColumn: true };

  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const headerRow = ws.getRow(1);
  let idCol = null;
  const colMap = {}; // excel col index -> Job Log column
  const matchedColumns = [];
  headerRow.eachCell((cell, colNumber) => {
    const h = norm(cell.value);
    if (h === norm(ID_HEADER)) idCol = colNumber;
    const match = columns.find(c => norm(c.label) === h);
    if (match) { colMap[colNumber] = match; matchedColumns.push(match.label); }
  });
  if (!idCol) return { changes: [], matchedColumns, unknownEventRows: 0, badCells: 0, missingIdColumn: true };

  const known = new Set(knownEventIds);
  const changes = [];
  let unknownEventRows = 0;
  let badCells = 0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const eventId = String(row.getCell(idCol).value ?? '').trim();
    if (!eventId) return; // totals row / blank row
    if (!known.has(eventId)) { unknownEventRows++; return; }
    Object.entries(colMap).forEach(([colNumber, col]) => {
      const columnId = col.id;
      if (col.type === 'text') {
        const t = cellText(row.getCell(Number(colNumber)));
        if (t) changes.push({ eventId, columnId, value: t });
        return;
      }
      const v = cellNumber(row.getCell(Number(colNumber)));
      if (v === undefined) { badCells++; return; }
      if (v === null) return;
      changes.push({ eventId, columnId, value: v });
    });
  });
  return { changes, matchedColumns, unknownEventRows, badCells, missingIdColumn: false };
}
