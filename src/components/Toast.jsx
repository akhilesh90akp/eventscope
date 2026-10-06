/**
 * Toast - Auto-dismissing notification component
 *
 * Displays a brief message at the bottom-center of the screen
 * (positioned above the mobile nav bar). Auto-dismisses after 3 seconds.
 * Supports success (green) and error (red) types with enter/exit animation.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';

/** Toast notification rendered from context state */
/**
 * withSidebar: on desktop the sidebar takes the left 240px, so centre the
 * toast over the content area (50% + 120px) instead of the whole window.
 */
export default function Toast({ message, type = 'success', isVisible, withSidebar = true }) {
  if (!message) return null;

  return (
    <div
      className={`fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 ${withSidebar ? 'lg:left-[calc(50%+120px)]' : ''} z-[100] px-4 py-2.5 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      } ${type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}
    >
      {message}
    </div>
  );
}
