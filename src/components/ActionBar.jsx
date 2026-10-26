/**
 * ActionBar — the white bar pinned to the bottom of a task screen on phones
 *
 * Holds the screen's total and its main buttons (e.g. "Total ₹2,26,250 ✓ Saved
 * · WhatsApp · PDF", or "Cancel · Back · Next"). Only below 1024px: laptops
 * keep each page's own buttons. On task screens Layout hides the bottom menu,
 * so this bar sits alone at the bottom edge. It also steps aside while the
 * keyboard is open, like the bottom menu.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { useTyping } from './useTyping';

// ============================================================
// ActionBar — MAIN COMPONENT
// ============================================================

/**
 * @param label    small grey line above the value ("Total", "Balance due")
 * @param value    the big number
 * @param status   e.g. "✓ Saved" (green) shown after the label
 * @param children buttons on the right (or the whole bar when no label/value)
 */
export default function ActionBar({ label, value, status, valueClass = '', children, dark = false, testId = 'action-bar' }) {
  const typing = useTyping();
  if (typing) return null;
  return (
    <div data-testid={testId}
      className={`lg:hidden fixed left-0 right-0 bottom-0 z-50 px-4 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))]
        flex items-center gap-2.5 ${dark ? 'bg-[#1f1530] text-white' : 'bg-white border-t border-bb-border shadow-[0_-10px_24px_-16px_rgba(0,0,0,0.35)]'}`}>
      {(label || value) && (
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] ${dark ? 'text-[#cdb8ea]' : 'text-bb-muted'} truncate`}>
            {label}{status && <>{label ? ' · ' : ''}<span className="text-emerald-600 font-bold">{status}</span></>}
          </p>
          <p className={`text-[1.3rem] font-extrabold tabular-nums truncate ${valueClass}`} data-testid={`${testId}-value`}>{value}</p>
        </div>
      )}
      {children}
    </div>
  );
}

/** Space at the end of a page so its last content isn't hidden under the bar */
export function ActionBarSpacer() {
  return <div className="lg:hidden h-24" aria-hidden="true" />;
}
