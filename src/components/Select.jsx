/**
 * Select - Dropdown select component
 *
 * A styled native select element with label, error state, and required indicator.
 * Renders a list of string options with a default "Select..." placeholder.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';

/** Renders a styled dropdown select with label and validation */
export default function Select({
  label,
  value,
  onChange,
  options = [],
  required = false,
  error,
  className = '',
  ...props
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Label with optional required asterisk */}
      {label && (
        <label className="block text-sm font-medium text-bb-text">
          {label}
          {required && <span className="text-bb-accent ml-1">*</span>}
        </label>
      )}

      <select
        value={value}
        onChange={onChange}
        required={required}
        className={`
          w-full bg-bb-input border border-bb-border rounded-lg px-3 py-2.5
          text-bb-text appearance-none
          focus:outline-none focus:ring-2 focus:ring-bb-accent focus:border-transparent
          transition-all
          ${error ? 'border-red-500 focus:ring-red-500' : ''}
        `}
        {...props}
      >
        <option value="" className="bg-bb-input text-bb-muted">
          Select...
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-bb-input text-bb-text">
            {opt}
          </option>
        ))}
      </select>

      {/* Error message display */}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
