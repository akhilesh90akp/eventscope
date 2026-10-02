/**
 * Button - Reusable button component
 *
 * A flexible button with multiple visual variants (primary, secondary, danger, etc.),
 * size options, optional leading icon, and full-width support.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';

/** Tailwind classes for each visual variant */
const variants = {
  primary: 'bg-bb-accent hover:bg-bb-accent-hover text-white',
  secondary: 'bg-bb-card border border-bb-border text-bb-text hover:bg-bb-card-hover',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  ghost: 'bg-transparent hover:bg-bb-card text-bb-text',
  outline: 'bg-transparent border border-bb-accent text-bb-accent hover:bg-bb-accent/10',
};

/** Tailwind classes for each size option */
const sizes = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
};

/** Renders a styled button with configurable appearance and behavior */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  fullWidth = false,
  disabled = false,
  onClick,
  type = 'button',
  className = '',
  ...props
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center font-medium rounded-lg
        cursor-pointer active:scale-95 transition-all duration-150
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed active:scale-100' : ''}
        ${className}
      `}
      {...props}
    >
      {/* Render icon with size based on button size */}
      {Icon && <Icon size={size === 'sm' ? 16 : size === 'lg' ? 22 : 18} />}
      {children}
    </button>
  );
}
