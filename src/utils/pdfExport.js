/**
 * pdfExport — turns an on-screen document (quotation, bill, contract) into a
 * real A4 PDF file inside the app, in a few seconds, on any phone or laptop.
 *
 * Why: "Print" on a phone asks the OS to print the whole app screen, which is
 * slow and sometimes finishes after the app is closed. This renders just the
 * document, so the user can look at it and then share or save it themselves.
 *
 * How: the document is copied off-screen at A4 width, drawn to a canvas
 * (html2canvas-pro, which understands the oklch() colours Tailwind v4 uses),
 * cut into A4 pages at row/paragraph boundaries (never through a line of
 * text), and placed into a PDF (jsPDF). Both libraries are loaded only when a
 * PDF is first made, so they don't slow down opening the app.
 */

// ============================================================
// CONSTANTS
// ============================================================

/** A4 at 96 dpi: 210 mm ≈ 794 px wide */
const A4_W_PX = 794;
/** Margin inside each PDF page (mm) */
const MARGIN_MM = 8;
/** Canvas resolution multiplier — 2 keeps small print sharp without huge files */
const SCALE = 2;
/** Elements whose bottom edge is a safe place to start a new page */
const BREAK_SELECTOR = 'tr, p, li, h1, h2, h3, h4, div[data-pdf-break], .keep, table';
/** Elements that must begin on a new page (e.g. a contract's Annexure) */
const PAGE_START_SELECTOR = '[data-pdf-page-start]';

// ============================================================
// HELPERS
// ============================================================

/**
 * Picks page break positions (in CSS px from the top of the document) so each
 * page holds as much as fits, and every break falls between rows/paragraphs.
 * Pure function — covered by tests/pdfExport.test.mjs.
 *
 * @param {number[]} candidates  y positions where a break is allowed
 * @param {number}   total       full document height
 * @param {number}   pageH       usable page height
 * @param {number[]} forced      y positions that must start a new page (e.g. an annexure)
 * @returns {number[]}           start y of each page (first is 0)
 */
export function pickPageStarts(candidates, total, pageH, forced = []) {
  const cuts = [...new Set(candidates.map(Math.round))].filter(y => y > 0 && y < total).sort((a, b) => a - b);
  const must = [...new Set(forced.map(Math.round))].filter(y => y > 0 && y < total).sort((a, b) => a - b);
  const starts = [0];
  let start = 0;
  while (total - start > pageH || must.some(y => y > start)) {
    const limit = start + pageH;
    const forcedHere = must.find(y => y > start && y <= limit);
    if (forcedHere !== undefined) { start = forcedHere; starts.push(start); continue; }
    // last allowed break that fits; it must leave a real amount on the page
    let best = -1;
    for (const y of cuts) {
      if (y > limit) break;
      if (y > start + pageH * 0.3) best = y;
    }
    start = best > 0 ? best : limit; // nothing suitable → hard cut at the page edge
    starts.push(start);
  }
  return starts;
}

/** Copies the document off-screen at A4 width, with screen-only decoration removed */
function cloneForPdf(node) {
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  Object.assign(holder.style, { position: 'fixed', left: '-10000px', top: '0', width: A4_W_PX + 'px', background: '#fff', zIndex: '-1' });
  const copy = node.cloneNode(true);
  // display: documents kept hidden on screen (e.g. the Reports print layout) still render
  Object.assign(copy.style, { display: 'block', width: A4_W_PX + 'px', maxWidth: 'none', minWidth: '0', margin: '0', borderRadius: '0', boxShadow: 'none', overflow: 'visible' });
  copy.querySelectorAll('[data-no-pdf]').forEach(el => el.remove());
  holder.appendChild(copy);
  document.body.appendChild(holder);
  return { holder, copy };
}

// ============================================================
// MAIN
// ============================================================

/**
 * Makes a PDF from a document element.
 * @param {HTMLElement} node      the document (e.g. the .print-doc element)
 * @param {string}      fileName  e.g. "Invoice KC-B2C2627-004 Sneha.pdf"
 * @returns {Promise<{ file: File, url: string, pages: string[] }>}
 *          pages = JPEG data URLs of each page, for the in-app preview
 */
export async function makePdf(node, fileName) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const { holder, copy } = cloneForPdf(node);
  try {
    // wait for images (logo) and fonts in the copy
    await Promise.all([...copy.querySelectorAll('img')].map(img => (img.complete ? null : new Promise(r => { img.onload = img.onerror = r; }))));
    if (document.fonts?.ready) await document.fonts.ready;

    const top = copy.getBoundingClientRect().top;
    const total = Math.ceil(copy.scrollHeight);
    const pageW_mm = 210 - MARGIN_MM * 2;
    const pageH_px = Math.floor(A4_W_PX * ((297 - MARGIN_MM * 2) / pageW_mm));
    const breaks = [...copy.querySelectorAll(BREAK_SELECTOR)].map(el => el.getBoundingClientRect().bottom - top);
    const forced = [...copy.querySelectorAll(PAGE_START_SELECTOR)].map(el => el.getBoundingClientRect().top - top);
    const starts = pickPageStarts(breaks, total, pageH_px, forced);

    const canvas = await html2canvas(copy, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: A4_W_PX });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pages = [];
    starts.forEach((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : total;
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.max(1, Math.round((end - start) * SCALE));
      const ctx = slice.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, Math.round(start * SCALE), canvas.width, slice.height, 0, 0, slice.width, slice.height);
      const img = slice.toDataURL('image/jpeg', 0.92);
      pages.push(img);
      if (i > 0) pdf.addPage();
      pdf.addImage(img, 'JPEG', MARGIN_MM, MARGIN_MM, pageW_mm, (end - start) * (pageW_mm / A4_W_PX), undefined, 'FAST');
    });
    const blob = pdf.output('blob');
    const file = new File([blob], fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim(), { type: 'application/pdf' });
    return { file, url: URL.createObjectURL(blob), pages };
  } finally {
    holder.remove();
  }
}

/** True when this device can hand a PDF file to the share sheet (WhatsApp, Mail, Files…) */
export function canShareFile(file) {
  try {
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

/** Saves the PDF with the browser's normal download */
export function downloadFile(url, fileName) {
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
}
