/**
 * DocFit — shows an A4 document (quote, bill, contract) at phone width
 *
 * Below 1024px the 800px-wide document is scaled down so the whole page
 * width is visible (no more "INVO…" cut off on the right). "Actual size"
 * switches to full size with sideways scrolling, for reading small print.
 * Laptops see the document as before. Only the on-screen look changes: the
 * PDF is made from the same document at A4 width (utils/pdfExport).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useLayoutEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

// ============================================================
// CONSTANTS
// ============================================================
const DOC_W = 800;
const PHONE = '(max-width: 1023px)';

// ============================================================
// DocFit — MAIN COMPONENT
// ============================================================

export default function DocFit({ children, hidden = false }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(null);
  const [actual, setActual] = useState(false);

  // Measure: scale = available width ÷ 800 (phones only), and the scaled height
  useLayoutEffect(() => {
    if (hidden || typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(PHONE);
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const fit = mq.matches && !actual ? Math.min(1, outer.current.clientWidth / DOC_W) : 1;
      setScale(fit);
      setHeight(fit < 1 ? inner.current.scrollHeight * fit : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer.current);
    ro.observe(inner.current);
    mq.addEventListener('change', measure);
    return () => { ro.disconnect(); mq.removeEventListener('change', measure); };
  }, [hidden, actual]);

  const fitting = scale < 1;
  return (
    <div className={hidden ? 'max-lg:hidden' : ''} data-testid="doc-fit">
      <div className="lg:hidden flex items-center justify-between gap-3 mb-2">
        <p className="text-[13px] text-gray-600">{actual ? 'Actual size · scroll sideways' : 'This is exactly what the PDF looks like'}</p>
        <button onClick={() => setActual(a => !a)} className="shrink-0 min-h-[40px] px-3 rounded-xl border border-gray-300 bg-white text-[13.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer" data-testid="doc-zoom">
          {actual ? <><ZoomOut size={16} />Fit to screen</> : <><ZoomIn size={16} />Actual size</>}
        </button>
      </div>
      <div className="max-lg:rounded-2xl max-lg:bg-[#e5e1ec] max-lg:p-2.5">
        <div ref={outer} className={fitting ? 'overflow-hidden' : 'doc-scroll'} style={fitting && height ? { height } : undefined}>
          <div ref={inner} style={fitting ? { width: DOC_W, transform: `scale(${scale})`, transformOrigin: 'top left' } : undefined}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
