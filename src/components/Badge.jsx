/**
 * Badge - Status pill component
 *
 * Displays a small colored badge/pill indicating status.
 * Uses readable color combinations optimized for light theme backgrounds.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';

/** Color mappings for each status variant */
const variantStyles = {
  draft: 'bg-amber-100 text-amber-800 border border-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  completed: 'bg-blue-100 text-blue-800 border border-blue-200',
  billed: 'bg-purple-100 text-purple-800 border border-purple-200',
  cancelled: 'bg-red-100 text-red-800 border border-red-200',
  default: 'bg-violet-100 text-violet-800 border border-violet-200',
};

/** Renders a small pill-shaped badge with variant-based styling */
export default function Badge({ children, variant = 'default' }) {
  return (
    <span
      className={`
        inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full
        ${variantStyles[variant] || variantStyles.default}
      `}
    >
      {children}
    </span>
  );
}
