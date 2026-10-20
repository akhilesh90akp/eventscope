/**
 * PageHeader — the title row of every laptop page
 *
 * One pattern everywhere (phones use the purple PhoneHeader instead):
 *   [← back]  Title  (count)            [secondary actions] [main action]
 *             sub-line
 * Rules: one filled (purple) main action at most, the rest outlined; edit /
 * delete as icons. `sticky` pins the row to the top of the page while the
 * content scrolls (documents, quote) — it bleeds to the page edges with the
 * page background so content scrolling underneath never shows through.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';

// ============================================================
// PageHeader — MAIN COMPONENT
// ============================================================

export default function PageHeader({ title, count, sub, onBack, actions = null, sticky = false, children = null, testId = 'page-header' }) {
  // A pinned header publishes its height as --lap-head, so side panels can stick just below it
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!sticky || !el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--lap-head', `${el.offsetHeight + 16}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [sticky]);
  return (
    <div ref={ref} data-testid={testId}
      className={sticky
        ? 'sticky top-0 z-30 -mx-8 px-8 -mt-8 pt-6 pb-4 bg-bb-bg/95 backdrop-blur-sm border-b border-bb-border/70'
        : 'pb-1'}>
      <div className="flex items-center gap-3 min-h-[44px]">
        {onBack && (
          <button onClick={onBack} aria-label="Back"
            className="w-10 h-10 -ml-2 rounded-xl flex items-center justify-center text-bb-muted hover:text-bb-text hover:bg-white cursor-pointer">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] leading-tight font-bold text-bb-text flex items-center gap-2.5">
            <span className="truncate">{title}</span>
            {count !== undefined && count !== null && (
              <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-violet-100 text-violet-700 text-sm font-bold tabular-nums" data-testid="title-count">{count}</span>
            )}
          </h1>
          {sub && <p className="text-[13.5px] text-bb-muted mt-1 truncate">{sub}</p>}
        </div>
        {actions && <div className="ml-auto shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
