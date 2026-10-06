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
const FIXED_HEADERS = ['Date', 'Client', 'Event', 'Location', 'Type', 'Revenue'];

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
 * rows: [{ id, date, client, event, location, type, revenue, values }]
 * columns: active Job Log columns [{ id, label, type }]
 */
export async function exportJobLogToExcel({ rows, columns, companyName, periodLabel }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EventScope';
  const ws = wb.addWorksheet('Job Log', { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });

  const costCols = columns.filter(c => c.type !== 'income');
  const incomeCols = columns.filter(c => c.type === 'income');
  const ordered = [...costCols, ...incomeCols];
  const headers = [ID_HEADER, ...FIXED_HEADERS, ...ordered.map(c => c.label), 'Total cost', 'Profit', 'Margin'];
  ws.addRow(headers);

  // Column positions (1-based)
  const revenueCol = 1 + FIXED_HEADERS.length;            // after Event ID
  const firstValCol = revenueCol + 1;
  const firstIncomeCol = firstValCol + costCols.length;
  const lastValCol = firstValCol + ordered.length - 1;
  const totalCostCol = lastValCol + 1;
  const profitCol = totalCostCol + 1;
  const marginCol = profitCol + 1;

  rows.forEach((r, i) => {
    const excelRow = i + 2;
    const values = ordered.map(c => {
      const v = r.values?.[c.id];
      return v === null || v === undefined ? null : Number(v);
    });
    const R = colLetter(revenueCol);
    const costRange = costCols.length
      ? `SUM(${colLetter(firstValCol)}${excelRow}:${colLetter(firstIncomeCol - 1)}${excelRow})` : '0';
    const incomeRange = incomeCols.length
      ? `SUM(${colLetter(firstIncomeCol)}${excelRow}:${colLetter(lastValCol)}${excelRow})` : '0';
    ws.addRow([
      r.id, r.date, r.client, r.event, r.location, r.type, r.revenue,
      ...values,
      { formula: costRange },
      { formula: `${R}${excelRow}+${incomeRange}-${colLetter(totalCostCol)}${excelRow}` },
      { formula: `IF(${R}${excelRow}>0,${colLetter(profitCol)}${excelRow}/${R}${excelRow},"")` },
    ]);
  });

  // Totals row
  const last = rows.length + 1;
  if (rows.length) {
    const totalRow = ws.addRow(['', 'Total', `${rows.length} events`]);
    for (let c = revenueCol; c <= profitCol; c++) {
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
    col.width = n === 1 ? 14 : n <= 6 ? 20 : 15;
    if (n >= revenueCol && n <= profitCol) col.numFmt = MONEY_FMT;
    if (n === marginCol) col.numFmt = '0%';
  });
  ws.getColumn(1).hidden = true; // Event ID: needed to upload changes back; keep it, don't edit it
  for (let c = firstValCol; c <= lastValCol; c++) {
    const isIncome = c >= firstIncomeCol;
    ws.getRow(1).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isIncome ? 'FF047857' : 'FFB45309' } };
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
  const colMap = {}; // excel col index -> Job Log column id
  const matchedColumns = [];
  headerRow.eachCell((cell, colNumber) => {
    const h = norm(cell.value);
    if (h === norm(ID_HEADER)) idCol = colNumber;
    const match = columns.find(c => norm(c.label) === h);
    if (match) { colMap[colNumber] = match.id; matchedColumns.push(match.label); }
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
    Object.entries(colMap).forEach(([colNumber, columnId]) => {
      const v = cellNumber(row.getCell(Number(colNumber)));
      if (v === undefined) { badCells++; return; }
      if (v === null) return;
      changes.push({ eventId, columnId, value: v });
    });
  });
  return { changes, matchedColumns, unknownEventRows, badCells, missingIdColumn: false };
}
