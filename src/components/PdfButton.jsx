/**
 * PdfButton — "PDF" button for a document page (quotation, bill, contract).
 *
 * Makes a real PDF of the document inside the app (utils/pdfExport), then
 * opens a preview so the user can check it before doing anything with it.
 * From the preview: Share (phone share sheet — WhatsApp, Mail, Files…),
 * Download, or Open (new tab, mainly laptops). Nothing is ever sent
 * automatically.
 *
 * Usage: <PdfButton docRef={pdfRef} fileName="Invoice KC-001 Sneha.pdf" />
 * variant="header": a white download icon for the phone title bar (Reports).
 * variant="laptop": the 38px "⤓ PDF" button of a laptop page header.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useState } from 'react';
import { FileDown, Share2, Download, ExternalLink } from 'lucide-react';
import Button from './Button';
import Modal from './Modal';
import { useApp } from '../context/AppContext';
import { makePdf, canShareFile, downloadFile } from '../utils/pdfExport';

// ============================================================
// PdfButton — MAIN COMPONENT
// ============================================================

export default function PdfButton({ docRef, fileName, label = 'PDF', variant = 'primary' }) {
  const { showToast } = useApp();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState(null);   // { file, url, pages }

  // Free the PDF from memory when the preview closes or the page unmounts
  useEffect(() => () => { if (pdf?.url) URL.revokeObjectURL(pdf.url); }, [pdf]);

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const make = async () => {
    if (busy || !docRef?.current) return;
    setBusy(true);
    try {
      setPdf(await makePdf(docRef.current, fileName));
    } catch (err) {
      console.error('PDF failed:', err);
      // a part of the app from before the latest update — the stale-version
      // guard in main.jsx reloads; say so instead of a vague error
      const stale = /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch/i.test(String(err?.message || err));
      showToast(stale ? 'A new version of the app is ready — refreshing…' : 'Couldn’t make the PDF — please try again.', stale ? 'success' : 'error');
      if (stale) setTimeout(() => window.location.reload(), 1200);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ files: [pdf.file], title: pdf.file.name });
    } catch (err) {
      if (err?.name !== 'AbortError') showToast('Sharing isn’t available here — use Download instead.', 'error');
    }
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const shareable = pdf && canShareFile(pdf.file);
  return (
    <>
      {variant === 'header'
        ? <button onClick={make} disabled={busy} aria-label={label} title={label} data-testid="pdf-header"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white hover:bg-white/10 cursor-pointer disabled:opacity-40">
          {busy ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Download size={22} />}
        </button>
        : variant === 'laptop'
        ? <button onClick={make} disabled={busy} data-testid="pdf-laptop" title="Download PDF"
          className="shrink-0 min-h-[38px] px-3.5 rounded-xl border border-gray-300 bg-white text-bb-text hover:bg-gray-50 inline-flex items-center gap-2 text-[13.5px] font-semibold cursor-pointer disabled:opacity-40">
          {busy ? <span className="w-4 h-4 border-2 border-gray-300 border-t-bb-accent rounded-full animate-spin" /> : <Download size={16} />}{busy ? 'Making PDF…' : label}
        </button>
        : <Button icon={FileDown} variant={variant} onClick={make} disabled={busy}>{busy ? 'Making PDF…' : label}</Button>}

      <Modal isOpen={!!pdf} onClose={() => setPdf(null)} title="Check the PDF" size="lg">
        {pdf && (
          <div className="space-y-4">
            {/* Pages, as they are in the PDF */}
            <div className="max-h-[60vh] overflow-y-auto bg-gray-100 rounded-xl p-3 space-y-3" data-testid="pdf-preview">
              {pdf.pages.map((src, i) => (
                <img key={i} src={src} alt={`Page ${i + 1} of ${pdf.pages.length}`} className="w-full bg-white shadow rounded" />
              ))}
            </div>
            <p className="text-xs text-bb-muted">
              {pdf.pages.length} {pdf.pages.length === 1 ? 'page' : 'pages'} · {pdf.file.name}
            </p>
            <div className="flex flex-wrap gap-2">
              {shareable && <Button icon={Share2} onClick={share}>Share</Button>}
              <Button icon={Download} variant={shareable ? 'secondary' : 'primary'} onClick={() => downloadFile(pdf.url, pdf.file.name)}>Download</Button>
              <span className="hidden md:contents">
                <Button icon={ExternalLink} variant="secondary" onClick={() => window.open(pdf.url, '_blank', 'noopener')}>Open</Button>
              </span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
