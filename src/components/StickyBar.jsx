/**
 * StickyBar — keeps its contents pinned at the top while the page scrolls
 *
 * Used for search boxes (Drafts, Confirmed, Completed) and the Settings tabs.
 * Sits just under the mobile title bar (56px + iPhone notch area) and at the
 * very top on desktop. Bleeds to the page edges with the page background so
 * cards scrolling underneath don't show through; padding matches Layout's.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';

// ============================================================
// StickyBar — MAIN COMPONENT
// ============================================================

export default function StickyBar({ children, className = '' }) {
  return (
    <div className={`sticky z-30 top-[calc(3.5rem+env(safe-area-inset-top))] lg:top-0
      -mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 py-2 bg-bb-bg ${className}`}>
      {children}
    </div>
  );
}
