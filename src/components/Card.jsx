/**
 * Card - Container component
 *
 * A simple white card with border and optional hover effect.
 * Used throughout the app as the primary content container.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';

/** Renders a bordered card container with optional hover and click behavior */
export default function Card({ children, hover = false, onClick, className = '' }) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-bb-card border border-bb-border rounded-xl p-3 sm:p-4
        ${hover ? 'hover:border-bb-accent/50 transition-colors' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
