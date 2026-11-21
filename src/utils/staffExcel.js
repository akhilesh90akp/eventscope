/**
 * staffExcel — Excel and Print for Day sheets and Staff & wages.
 *
 * Pages build plain tables ({ title, sub, sections: [{ heading, columns, rows, total }] })
 * and hand them here; the same table becomes an .xlsx (exceljs, loaded only
 * when needed) or a printable page (a hidden frame + the browser's print).
 *
 *   column: { header, key, money?: true, align?: 'right' }
 *   row:    { [key]: value } — money values are numbers (whole rupees)
 */

// ============================================================
// CONSTANTS
// ============================================================
const MONEY_FMT = '"₹"#,##,##0;[Red]-"₹"#,##,##0';

// ============================================================
// HELPERS
// ============================================================
const rupees = (n) => (n === '' || n === null || n === undefined ? '' : `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** File names: plain hyphens, no odd characters */
export const safeFileName = (s) => String(s).replace(/[–—]/g, '-').replace(/[\\/:*?"<>|]/g, '').trim();

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ============================================================
// EXCEL
// ============================================================

/** One worksheet: title rows, then each section as a small table with its total row */
export async function downloadExcel(doc, fileName) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((doc.sheetName || 'Sheet').slice(0, 31));
  const width = Math.max(...doc.sections.map(s => s.columns.length), 2);
  ws.addRow([doc.title]).font = { bold: true, size: 14 };
  if (doc.sub) ws.addRow([doc.sub]).font = { color: { argb: 'FF666666' } };
  doc.sections.forEach(sec => {
    ws.addRow([]);
    if (sec.heading) ws.addRow([sec.heading]).font = { bold: true, size: 12 };
    const head = ws.addRow(sec.columns.map(c => c.header));
    head.font = { bold: true };
    head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EDF7' } }; });
    const add = (r, bold) => {
      const row = ws.addRow(sec.columns.map(c => r[c.key] ?? ''));
      sec.columns.forEach((c, i) => { if (c.money) row.getCell(i + 1).numFmt = MONEY_FMT; });
      if (bold) row.font = { bold: true };
    };
    sec.rows.forEach(r => add(r, false));
    if (sec.total) add(sec.total, true);
    (sec.notes || []).forEach(n => { ws.addRow([n]).font = { italic: true, color: { argb: 'FF666666' } }; });
  });
  for (let i = 1; i <= width; i++) ws.getColumn(i).width = i === 1 ? 26 : 16;
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), safeFileName(fileName));
}

// ============================================================
// PRINT
// ============================================================

/** Plain printable HTML for a doc (also used by tests) */
export function printHtml(doc) {
  const table = (sec) => `
    ${sec.heading ? `<h2>${esc(sec.heading)}</h2>` : ''}
    <table><thead><tr>${sec.columns.map(c => `<th class="${c.money || c.align === 'right' ? 'r' : ''}">${esc(c.header)}</th>`).join('')}</tr></thead>
    <tbody>${sec.rows.map(r => `<tr>${sec.columns.map(c => `<td class="${c.money || c.align === 'right' ? 'r' : ''}">${esc(c.money ? rupees(r[c.key]) : r[c.key])}</td>`).join('')}</tr>`).join('')}
    ${sec.total ? `<tr class="t">${sec.columns.map(c => `<td class="${c.money || c.align === 'right' ? 'r' : ''}">${esc(c.money ? rupees(sec.total[c.key]) : sec.total[c.key])}</td>`).join('')}</tr>` : ''}
    </tbody></table>${(sec.notes || []).map(n => `<p class="n">${esc(n)}</p>`).join('')}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1530;margin:24px;font-size:12px}
    h1{font-size:18px;margin:0 0 2px} .s{color:#666;margin:0 0 14px} h2{font-size:13px;margin:16px 0 6px}
    table{width:100%;border-collapse:collapse} th,td{padding:5px 6px;border-bottom:1px solid #e5e2ec;text-align:left}
    th{background:#f3f0f8;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#555}
    .r{text-align:right;white-space:nowrap} .t td{font-weight:700;border-top:2px solid #cfc8dc} .n{color:#666;font-size:11px;margin:4px 0}
    @page{margin:14mm}
  </style></head><body><h1>${esc(doc.title)}</h1>${doc.sub ? `<p class="s">${esc(doc.sub)}</p>` : ''}${doc.sections.map(table).join('')}</body></html>`;
}

/** Opens the browser's print dialog for a doc (hidden frame, removed afterwards) */
export function printDoc(doc) {
  const f = Object.assign(document.createElement('iframe'), { title: 'print' });
  Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(f);
  const w = f.contentWindow;
  w.document.open(); w.document.write(printHtml(doc)); w.document.close();
  setTimeout(() => { w.focus(); w.print(); setTimeout(() => f.remove(), 1500); }, 250);
}
