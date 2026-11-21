/**
 * Toast - Auto-dismissing notification component
 *
 * Displays a brief message at the bottom-center of the screen
 * (positioned above the mobile nav bar). Auto-dismisses after 3 seconds.
 * success (green) and error (red) for 3 s; remove (orange, 5 s) for deletes, with
 * Undo when the caller gives one and a × (design system).
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { X } from 'lucide-react';

/** Toast notification rendered from context state */
/**
 * withSidebar: on desktop the sidebar takes the left 240px, so centre the
 * toast over the content area (50% + 120px) instead of the whole window.
 */
export default function Toast({ message, type = 'success', isVisible, withSidebar = true, undo = null, onClose }) {
  if (!message) return null;
  const tone = type === 'error' ? 'bg-red-600' : type === 'remove' ? 'bg-orange-600' : 'bg-emerald-600';
  return (
    <div role="status" data-testid="toast"
      className={`fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 ${withSidebar ? 'lg:left-[calc(50%+120px)]' : ''} z-[100] flex items-center gap-3 pl-4 ${type === 'remove' ? 'pr-2' : 'pr-4'} py-2.5 rounded-lg shadow-[0_4px_8px_rgba(0,0,0,.15)] text-white text-sm font-medium transition-all duration-300 max-w-[calc(100vw-24px)] ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      } ${tone}`}
    >
      <span className="min-w-0">{message}</span>
      {type === 'remove' && undo && (
        <button onClick={() => { onClose?.(); undo(); }} data-testid="toast-undo"
          className="shrink-0 px-3 py-1 rounded-md bg-white text-orange-700 font-bold cursor-pointer">Undo</button>
      )}
      {type === 'remove' && (
        <button onClick={onClose} aria-label="Close" className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/15 cursor-pointer">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
