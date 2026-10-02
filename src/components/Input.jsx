/**
 * Input - Form input component
 *
 * A versatile input component that supports text, date, number, and textarea types.
 * Includes optional label, icon, error state, and required indicator.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';

/** Renders a styled form input or textarea with label and validation */
export default function Input({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  icon: Icon,
  required = false,
  className = '',
  ...props
}) {
  // Base styling shared between input and textarea
  const baseClasses = `
    w-full bg-bb-input border border-bb-border rounded-lg px-3 py-2.5
    text-bb-text placeholder:text-bb-muted/60
    focus:outline-none focus:ring-2 focus:ring-bb-accent focus:border-transparent
    transition-all
    ${Icon ? 'pl-10' : ''}
    ${error ? 'border-red-500 focus:ring-red-500' : ''}
  `;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Label with optional required asterisk */}
      {label && (
        <label className="block text-sm font-medium text-bb-text">
          {label}
          {required && <span className="text-bb-accent ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {/* Optional leading icon */}
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-muted">
            <Icon size={18} />
          </div>
        )}

        {/* Render textarea or input based on type prop */}
        {type === 'textarea' ? (
          <textarea
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            required={required}
            rows={4}
            className={`${baseClasses} resize-y min-h-[100px]`}
            {...props}
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            required={required}
            className={baseClasses}
            {...props}
          />
        )}
      </div>

      {/* Error message display */}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
