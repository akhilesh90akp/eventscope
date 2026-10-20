/**
 * StickyBar — keeps its contents pinned at the top while the page scrolls
 *
 * Used for search boxes (Drafts, Confirmed, Completed), the Settings tabs and,
 * on phones, the Details | Preview tabs and tool rows of Quote / Bill /
 * Contract, the Calendar controls and the Reports period. Sits just under the
 * phone title bar (its height comes from Layout as --phone-head, as task
 * screens have a taller bar) and at the very top on desktop. Bleeds to the page edges with the page background so
 * cards scrolling underneath don't show through; padding matches Layout's.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';

// ============================================================
// StickyBar — MAIN COMPONENT
// ============================================================

export default function StickyBar({ children, className = '', testId }) {
  return (
    <div className={`sticky z-30 top-[var(--phone-head,calc(4rem+env(safe-area-inset-top)))] lg:top-0
      -mx-4 px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 py-2 bg-bb-bg ${className}`} data-testid={testId}>
      {children}
    </div>
  );
}
