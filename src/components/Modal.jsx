/**
 * Modal - Overlay dialog component
 *
 * A centered modal dialog with backdrop blur, close button, and configurable size.
 * Locks body scroll when open and supports click-outside-to-close.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/** Width constraints for each size option */
const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

/** Renders a centered overlay modal with title and close controls */
export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop - click to close */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        className={`
          relative w-full ${sizeClasses[size]}
          bg-white border border-bb-border rounded-xl shadow-2xl
        `}
      >
        {/* Header with title and close button */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bb-border">
          <h2 className="text-lg font-semibold text-bb-text">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-bb-muted hover:text-bb-text hover:bg-bb-card-hover transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body content */}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
