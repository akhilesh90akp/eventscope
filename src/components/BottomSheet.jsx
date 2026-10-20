/**
 * BottomSheet — a panel that slides up from the bottom of the screen
 *
 * Used on phones for lists of actions (an event's ⋯ menu), pickers (services
 * for one event) and short read-only lists (the items on an event). On
 * laptops it shows as a centred dialog of the same content, so callers don't
 * need two versions. Rendered into <body> so no card or table can clip it.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// ============================================================
// BottomSheet — MAIN COMPONENT
// ============================================================

export default function BottomSheet({ open, onClose, title, sub, children, footer, testId = 'bottom-sheet' }) {
  // Lock page scroll and close on Escape while open
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end lg:items-center justify-center" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
      <div className="absolute inset-0 bg-[#140a23]/50" onClick={onClose} data-testid={`${testId}-backdrop`} />
      <div className="relative w-full lg:max-w-lg bg-white rounded-t-[22px] lg:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col animate-[sheet-up_.18s_ease-out]">
        <div className="lg:hidden w-10 h-1 rounded-full bg-gray-300 mx-auto mt-2.5" />
        {(title || sub) && (
          <div className="flex items-start gap-3 px-5 pt-3 lg:pt-5 pb-2">
            <div className="flex-1 min-w-0">
              {title && <h2 className="text-[17px] font-bold text-bb-text">{title}</h2>}
              {sub && <p className="text-[13px] text-gray-600 mt-0.5">{sub}</p>}
            </div>
            <button onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 -mt-1 rounded-xl flex items-center justify-center text-bb-muted hover:bg-gray-100 cursor-pointer">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="px-5 pb-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-bb-border">{footer}</div>}
        {!footer && <div className="h-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body,
  );
}
