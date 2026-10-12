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
      showToast('Couldn’t make the PDF — please try again.', 'error');
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
      <Button icon={FileDown} variant={variant} onClick={make} disabled={busy}>{busy ? 'Making PDF…' : label}</Button>

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
