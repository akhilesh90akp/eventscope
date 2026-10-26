/**
 * BottomSheet — a panel that slides up from the bottom of the screen
 *
 * Used on phones for lists of actions (an event's ⋯ menu), pickers (services
 * for one event), small forms (rename, add item) and short read-only lists
 * (the items on an event). On laptops it shows as a centred dialog of the
 * same content, so callers don't need two versions. Rendered into <body> so
 * no card or table can clip it.
 *
 * Phones:
 *   - the page behind is frozen while the sheet is open (iPhone ignores
 *     overflow:hidden on <body>, so the page is pinned with position:fixed and
 *     put back where it was on close);
 *   - when the keyboard opens, the sheet sits on top of it (visualViewport)
 *     and the field being typed in is scrolled into view inside the sheet.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// ============================================================
// HOOKS
// ============================================================

/** Freezes the page behind (and restores its scroll position afterwards) */
function useScrollLock(on) {
  useEffect(() => {
    if (!on) return undefined;
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, left: b.left, right: b.right, overflow: b.overflow, width: b.width };
    Object.assign(b, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
    return () => {
      Object.assign(b, prev);
      window.scrollTo(0, y);
    };
  }, [on]);
}

/** Height of the on-screen keyboard (0 when closed), from the visual viewport */
function useKeyboardInset(on) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!on || !vv) return undefined;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [on]);
  return inset;
}

// ============================================================
// BottomSheet — MAIN COMPONENT
// ============================================================

export default function BottomSheet({ open, onClose, title, sub, children, footer, testId = 'bottom-sheet', wide = false }) {
  const body = useRef(null);
  useScrollLock(open);
  const kb = useKeyboardInset(open);

  // Close on Escape
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // The field being typed in stays visible above the keyboard
  useEffect(() => {
    const el = body.current;
    if (!open || !el) return undefined;
    const onFocus = (e) => {
      const t = e.target;
      if (!t.matches?.('input, textarea, select')) return;
      t.style.scrollMarginTop = '20px'; t.style.scrollMarginBottom = '20px';   // breathing room above and below the field
      setTimeout(() => t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);   // after the keyboard has opened
    };
    el.addEventListener('focusin', onFocus);
    return () => el.removeEventListener('focusin', onFocus);
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end lg:items-center justify-center" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} data-testid={testId}>
      <div className="absolute inset-0 bg-[#140a23]/50 touch-none" onClick={onClose} data-testid={`${testId}-backdrop`} />
      <div className={`relative w-full ${wide ? 'lg:max-w-2xl' : 'lg:max-w-lg'} bg-white rounded-t-[22px] lg:rounded-2xl shadow-2xl flex flex-col animate-[sheet-up_.18s_ease-out] transition-[margin] duration-150`}
        style={{ marginBottom: kb, maxHeight: kb ? `calc(100dvh - ${kb}px - 12px)` : '90dvh' }}>
        <div className="lg:hidden w-10 h-1 rounded-full bg-gray-300 mx-auto mt-2.5 shrink-0" />
        {(title || sub) && (
          <div className="flex items-start gap-3 px-5 pt-3 lg:pt-5 pb-2 shrink-0">
            <div className="flex-1 min-w-0">
              {title && <h2 className="text-[17px] font-bold text-bb-text">{title}</h2>}
              {sub && <p className="text-[13px] text-gray-600 mt-0.5">{sub}</p>}
            </div>
            <button onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 -mt-1 rounded-xl flex items-center justify-center text-bb-muted hover:bg-gray-100 cursor-pointer">
              <X size={20} />
            </button>
          </div>
        )}
        <div ref={body} className="px-5 pt-2 pb-4 [&_input]:scroll-mt-5 [&_input]:scroll-mb-5 overflow-y-auto overscroll-contain min-h-0">{children}</div>
        {footer && <div className={`px-5 pt-2 border-t border-bb-border shrink-0 ${kb ? 'pb-3' : 'pb-[calc(1rem+env(safe-area-inset-bottom))]'}`}>{footer}</div>}
        {!footer && !kb && <div className="h-[env(safe-area-inset-bottom)] shrink-0" />}
      </div>
    </div>,
    document.body,
  );
}
