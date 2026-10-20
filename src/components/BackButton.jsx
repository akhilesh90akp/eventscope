/**
 * BackButton — "←" next to a page title on pages outside the bottom bar
 *
 * Goes back one step; if there's nothing to go back to (page opened from a
 * link or straight after launching the installed app) it goes Home instead.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// ============================================================
// BackButton — MAIN COMPONENT
// ============================================================

export default function BackButton({ fallback = '/' }) {
  const navigate = useNavigate();
  // React Router stores the history position in history.state.idx (0 = first page)
  const canGoBack = (window.history.state?.idx ?? 0) > 0;

  return (
    <button
      onClick={() => (canGoBack ? navigate(-1) : navigate(fallback))}
      aria-label="Back"
      title="Back"
      className="p-2 -ml-2 rounded-lg hover:bg-bb-card text-bb-muted hover:text-bb-text transition-colors cursor-pointer"
    >
      <ArrowLeft size={20} />
    </button>
  );
}
