/**
 * StaffUI — small pieces shared by Day sheets and Staff & wages
 * (phone + laptop): pill choices, ₹ inputs, ‹ month › / ‹ day › switchers,
 * initials avatar, number cards. Same look as PhoneUI / LaptopUI.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { IconButton } from './PhoneUI';
import { initials, parseRupees } from '../utils/staffFormat';

// ============================================================
// CHOICES
// ============================================================

/** Pill buttons; the chosen one gets a ✓ (Events · Warehouse · Leave, Cash · UPI · Bank…) */
export function Pills({ options, value, onChange, size = 'md', disabled = false, testId }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" data-testid={testId}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(o.value)}
            data-testid={testId ? `${testId}-${o.value}` : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-default
              ${size === 'sm' ? 'min-h-[36px] px-3 text-[13.5px]' : 'min-h-[40px] px-3.5 text-[14px]'}
              ${on ? 'border-bb-accent bg-violet-50 text-bb-accent-hover font-bold' : 'border-gray-300 bg-white text-bb-text hover:bg-bb-card-hover'}`}>
            {on && <Check size={size === 'sm' ? 14 : 16} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// INPUTS
// ============================================================

/** ₹ amount box (whole rupees, shown with Indian commas) */
export function MoneyInput({ label, required, hint, value, onChange, suffix, placeholder = '', className = '', size = 'md', testId, ...rest }) {
  const shown = value === '' || value === null || value === undefined ? '' : Number(value).toLocaleString('en-IN');
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">{label}{required && <span className="text-red-500"> *</span>}</span>}
      <span className={`flex items-center gap-2 rounded-xl border border-bb-border bg-bb-input px-3.5 focus-within:ring-2 focus-within:ring-bb-accent/40 ${size === 'sm' ? 'min-h-[40px]' : 'min-h-[48px]'}`}>
        <span className="text-gray-500">₹</span>
        <input inputMode="numeric" value={shown} placeholder={placeholder} onChange={e => onChange(parseRupees(e.target.value))} data-testid={testId} {...rest}
          className={`flex-1 min-w-0 bg-transparent tabular-nums text-bb-text placeholder:text-gray-400 focus:outline-none ${size === 'sm' ? 'text-[15px] text-right' : 'text-[16px]'}`} />
        {suffix && <span className="text-[13.5px] text-gray-500 whitespace-nowrap">{suffix}</span>}
      </span>
      {hint && <span className="block text-[12.5px] text-gray-600 mt-1.5">{hint}</span>}
    </label>
  );
}

/** Small "2 h" overtime box */
export function HoursInput({ value, onChange, disabled, testId, label = 'Overtime hours' }) {
  return (
    <span className={`inline-flex items-center gap-1 w-[88px] min-h-[40px] rounded-xl border border-bb-border bg-white px-2.5 ${disabled ? 'opacity-50' : 'focus-within:ring-2 focus-within:ring-bb-accent/40'}`}>
      <input inputMode="decimal" aria-label={label} value={value ?? ''} disabled={disabled} placeholder="0" data-testid={testId}
        onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); onChange(v === '' ? '' : v); }}
        className="w-full min-w-0 bg-transparent text-right tabular-nums text-[15px] focus:outline-none" />
      <span className="text-[13px] text-gray-500">h</span>
    </span>
  );
}

// ============================================================
// SWITCHERS
// ============================================================

/** ‹ label › — phone: big boxed; laptop: compact inside a white strip */
export function StepSwitcher({ label, onPrev, onNext, prevDisabled, nextDisabled, compact = false, testId, prevLabel = 'Previous', nextLabel = 'Next' }) {
  if (compact) {
    return (
      <span className="flex items-center gap-1" data-testid={testId}>
        <IconButton icon={ChevronLeft} label={prevLabel} tone="quiet" size={32} iconSize={17} onClick={onPrev} disabled={prevDisabled} />
        <b className="min-w-[130px] text-center text-[14px]" data-testid={testId ? `${testId}-label` : undefined}>{label}</b>
        <IconButton icon={ChevronRight} label={nextLabel} tone="quiet" size={32} iconSize={17} onClick={onNext} disabled={nextDisabled} />
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <IconButton icon={ChevronLeft} label={prevLabel} onClick={onPrev} disabled={prevDisabled} />
      <span className="flex-1 min-h-[44px] flex items-center justify-center rounded-xl border border-bb-border bg-white font-bold text-[15.5px]" data-testid={testId ? `${testId}-label` : undefined}>{label}</span>
      <IconButton icon={ChevronRight} label={nextLabel} onClick={onNext} disabled={nextDisabled} />
    </div>
  );
}

// ============================================================
// DISPLAY
// ============================================================

/** Initials avatar: 34 in rows, 44 on a profile card (design system) */
export function Avatar({ name, size = 34 }) {
  return (
    <span style={{ width: size, height: size }} className="shrink-0 rounded-full bg-violet-100 text-bb-accent-hover font-bold text-[13px] inline-flex items-center justify-center">
      {initials(name)}
    </span>
  );
}

const TAG_TONES = {
  violet: 'bg-violet-100 text-violet-700', amber: 'bg-amber-100 text-amber-800', green: 'bg-emerald-100 text-emerald-700',
  gray: 'bg-gray-100 text-gray-700', blue: 'bg-sky-100 text-sky-700', red: 'bg-red-100 text-red-700',
};
export function Tag({ tone = 'violet', children, testId }) {
  return <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${TAG_TONES[tone]}`} data-testid={testId}>{children}</span>;
}

/** Phone number card (same as Purchases' cards) */
export function PhoneStat({ label, value, tone = 'text-bb-text', sub = '', testId }) {
  return (
    <div className="bg-white border border-bb-border rounded-2xl px-4 py-3.5 min-w-0" data-testid={testId}>
      <p className="text-[13.5px] text-gray-600">{label}</p>
      <p className={`text-[21px] font-extrabold truncate tabular-nums ${tone}`} data-testid={testId ? `${testId}-value` : undefined}>{value}</p>
      {sub && <p className="text-[12.5px] text-gray-600 leading-snug">{sub}</p>}
    </div>
  );
}

/** White card with a lavender title row (Payments this month · + Record payment) */
export function PanelCard({ title, count, action, children, className = '', testId }) {
  return (
    <section className={`bg-white border border-bb-border rounded-2xl overflow-hidden ${className}`} data-testid={testId}>
      {(title || action) && (
        <div className="flex items-center gap-2.5 px-4 lg:px-5 py-3 bg-violet-50/60 border-b border-bb-border">
          <h2 className="text-[14px] lg:text-[15px] font-bold text-bb-text">{title}</h2>
          {count !== undefined && <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold tabular-nums">{count}</span>}
          <span className="flex-1" />
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Purple text link-button used in card headers */
export function LinkButton({ children, onClick, testId, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId}
      className="text-[13px] font-semibold text-bb-accent-hover hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline min-h-[44px] lg:min-h-0">
      {children}
    </button>
  );
}

/** Label · value row inside a breakdown card */
export function SumRow({ label, sub, value, strong = false, tone = '', testId }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-bb-border last:border-b-0" data-testid={testId}>
      <div className="flex-1 min-w-0">
        <p className={`text-[15px] ${strong ? 'font-bold' : ''} text-bb-text`}>{label}</p>
        {sub && <p className="text-[12.5px] text-gray-600 mt-0.5">{sub}</p>}
      </div>
      <b className={`text-[15px] tabular-nums whitespace-nowrap ${tone}`} data-testid={testId ? `${testId}-value` : undefined}>{value}</b>
    </div>
  );
}

// ============================================================
// DefaultOt — Per hour / Fixed per late night + rate (saves on blur / choice)
// ============================================================
export function DefaultOt({ value, onSave }) {
  const [rate, setRate] = useState(value.rate ?? '');
  return (
    <div className="bg-white border border-bb-border rounded-2xl p-4 space-y-3" data-testid="default-ot">
      <div>
        <b className="block text-[15.5px]">Default overtime</b>
        <span className="block text-[13px] text-gray-600">Pre-fills every new person. You can still change it for one person.</span>
      </div>
      <Pills options={[{ value: 'hour', label: 'Per hour' }, { value: 'night', label: 'Fixed per late night' }]} value={value.mode} onChange={m => onSave({ ...value, mode: m, rate: Number(rate) || 0 })} testId="default-ot-mode" />
      <MoneyInput value={rate} onChange={setRate} onBlur={() => Number(rate || 0) !== Number(value.rate || 0) && onSave({ ...value, rate: Number(rate) || 0 })}
        suffix={value.mode === 'night' ? 'a late night' : 'an hour'} testId="default-ot-rate" />
    </div>
  );
}

// ============================================================
// NOTICE & EMPTY STATE (design system)
// ============================================================

/** Amber notice: warnings and "not filled yet" */
export function Notice({ children, testId }) {
  return (
    <div className="flex gap-2.5 items-start rounded-xl bg-amber-100 px-3.5 py-2.5 text-[13px] text-amber-800" data-testid={testId}>
      <AlertCircle size={17} className="shrink-0 mt-px" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Dashed empty box: icon, title, one line, one main button */
export function EmptyState({ icon: Icon, title, line, action, testId }) {
  return (
    <div className="border border-dashed border-gray-300 rounded-2xl px-4 py-6 text-center bg-white/60" data-testid={testId}>
      {Icon && <span className="mx-auto mb-2.5 w-14 h-14 rounded-full bg-violet-50 text-bb-accent flex items-center justify-center"><Icon size={26} /></span>}
      <p className="text-[16px] font-bold text-bb-text">{title}</p>
      {line && <p className="text-[13.5px] text-gray-600 mt-1">{line}</p>}
      {action && <div className="mt-3.5 flex justify-center">{action}</div>}
    </div>
  );
}
