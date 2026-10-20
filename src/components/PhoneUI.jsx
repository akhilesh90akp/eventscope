/**
 * PhoneUI — small shared building blocks of the phone design
 *
 * One look everywhere (see the "Design system" board in the redesign review):
 *   IconButton     44×44 icon-only button (call / WhatsApp green, ⋯, ✎, 🗑)
 *   SectionLabel   small uppercase heading above a group of cards
 *   SegmentedTabs  "Details | Preview", "Month | List", period tabs
 *   MenuRow        one row of a bottom-sheet menu (icon, title, helper text)
 *   DateBlock      tinted day-of-week + date square
 *   FunctionRow    an event or sub event: date block, name (+ Main tag), venue
 *   SwitchRow      a full-width on/off row ("Add GST", "Hide item prices")
 *   NumberBox      a labelled number field (Qty / Rate ₹ / Days)
 *   DateField      a date you can't misread ("Sat, 12 Sep 2026"); tap → phone's picker
 *   TextField      a labelled text field with the phone look (48px)
 * Pure UI: no data access here.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { ChevronRight, CalendarDays } from 'lucide-react';
import { formatDateReadable, formatDateWithDay, functionDays } from '../utils/helpers';

// ============================================================
// BUTTONS
// ============================================================

const ICON_TONES = {
  neutral: 'text-bb-text border-gray-300 bg-white hover:bg-gray-50',
  green: 'text-emerald-600 border-emerald-200 bg-white hover:bg-emerald-50',
  red: 'text-red-600 border-red-200 bg-white hover:bg-red-50',
  quiet: 'text-bb-muted border-transparent bg-transparent hover:bg-gray-100',
};

/** 44×44 icon-only button. Always give a `label` (read aloud, shown on hover). */
export function IconButton({ icon: Icon, label, tone = 'neutral', size = 44, iconSize = 19, className = '', as: As = 'button', ...rest }) {
  return (
    <As aria-label={label} title={label} {...rest}
      style={{ width: size, height: size }}
      className={`shrink-0 inline-flex items-center justify-center rounded-xl border cursor-pointer transition-colors disabled:opacity-40 ${ICON_TONES[tone]} ${className}`}>
      <Icon size={iconSize} />
    </As>
  );
}

// ============================================================
// LABELS & TABS
// ============================================================

/** "COSTS", "SUB EVENTS · 3" — with an optional thing on the right */
export function SectionLabel({ children, right = null, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-0.5 ${className}`}>
      <h2 className="text-[12.5px] font-bold tracking-[0.06em] uppercase text-bb-muted">{children}</h2>
      {right}
    </div>
  );
}

/** Pill-style switch between 2–4 views */
export function SegmentedTabs({ options, value, onChange, className = '', testId }) {
  return (
    <div role="tablist" className={`flex gap-1 bg-[#ebe7f1] rounded-xl p-1 ${className}`} data-testid={testId}>
      {options.map(o => {
        const key = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const on = key === value;
        return (
          <button key={key} role="tab" aria-selected={on} onClick={() => onChange(key)}
            className={`flex-1 min-h-[42px] px-2 rounded-[10px] text-[14.5px] font-semibold cursor-pointer transition-colors
              ${on ? 'bg-white text-bb-accent-hover shadow-sm' : 'text-bb-muted hover:text-bb-text'}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Full-width on/off row: title (+ helper text) on the left, switch on the right */
export function SwitchRow({ icon: Icon, title, sub, checked, onChange, testId, disabled }) {
  // with an icon it lines up with MenuRow (used inside menus)
  return (
    <label className={`flex items-center gap-3 ${Icon ? 'gap-3.5 min-h-[60px] border-b border-bb-border last:border-b-0' : 'min-h-[56px]'} py-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      {Icon && <Icon size={20} className="shrink-0 text-bb-text" />}
      <span className="flex-1 min-w-0">
        <span className={`block text-bb-text ${Icon ? 'text-[16px] font-semibold' : 'text-[15px]'}`}>{title}</span>
        {sub && <span className="block text-[13px] text-gray-600">{sub}</span>}
      </span>
      <input type="checkbox" className="sr-only peer" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} data-testid={testId} />
      <span aria-hidden="true" className={`relative w-11 h-[26px] shrink-0 rounded-full transition-colors ${checked ? 'bg-bb-accent' : 'bg-gray-300'} peer-focus-visible:ring-2 peer-focus-visible:ring-bb-accent/40`}>
        <span className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : ''}`} />
      </span>
    </label>
  );
}

/** Labelled number field for phone rows (Qty / Rate ₹ / Days) */
export function NumberBox({ label, value, onChange, placeholder, highlight = false, align = 'left', ...rest }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11.5px] text-gray-600 mb-1 ml-0.5">{label}</span>
      <input type="number" inputMode="decimal" value={value} placeholder={placeholder} onChange={onChange} {...rest}
        className={`w-full min-h-[44px] rounded-xl border px-2.5 text-[15px] tabular-nums text-bb-text focus:outline-none focus:ring-2 focus:ring-bb-accent/40
          ${highlight ? 'border-bb-accent bg-violet-50 font-semibold' : 'border-bb-border bg-bb-input'} ${align === 'right' ? 'text-right' : ''}`} />
    </label>
  );
}

/**
 * Date shown in words over an invisible native date input, so tapping opens
 * the phone's own date picker and nobody misreads 09/12 as 12 Sept.
 */
export function DateField({ label, value, onChange, required, id, placeholder = 'Pick a date', min, max, testId }) {
  const text = formatDateWithDay(value);
  return (
    <label className="block" htmlFor={id}>
      {label && <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">{label}{required && <span className="text-red-500"> *</span>}</span>}
      <span className="@container relative flex items-center gap-2.5 min-h-[48px] rounded-xl border border-bb-border bg-bb-input px-3.5 focus-within:ring-2 focus-within:ring-bb-accent/40">
        <CalendarDays size={18} className="text-gray-500 shrink-0" />
        <span className={`flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[16px] ${text ? 'font-bold text-bb-text' : 'text-gray-400'}`} data-testid={testId ? `${testId}-text` : undefined}>{text || placeholder}</span>
        {text && <span className="hidden @[250px]:inline text-[13px] text-gray-500">Change</span>}
        <input id={id} type="date" value={value || ''} min={min} max={max} onChange={e => onChange(e.target.value)} data-testid={testId}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label={label || 'Date'} />
      </span>
    </label>
  );
}

/** Labelled text field with the phone look */
export function TextField({ label, required, hint, as = 'input', className = '', ...rest }) {
  const Tag = as;
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-[13.5px] font-semibold text-gray-700 mb-2">{label}{required && <span className="text-red-500"> *</span>}</span>}
      <Tag {...rest}
        className={`w-full ${as === 'textarea' ? 'min-h-[88px] py-3' : 'min-h-[48px]'} rounded-xl border border-bb-border bg-bb-input px-3.5 text-[16px] text-bb-text placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bb-accent/40`} />
      {hint && <span className="block text-[12.5px] text-gray-600 mt-1.5">{hint}</span>}
    </label>
  );
}

// ============================================================
// MENU ROW (bottom sheets)
// ============================================================

const ROW_TONES = { neutral: 'text-bb-text', green: 'text-emerald-600', red: 'text-red-600' };

export function MenuRow({ icon: Icon, title, sub, tone = 'neutral', onClick, right, chevron = true, disabled, testId }) {
  return (
    <button onClick={onClick} disabled={disabled} data-testid={testId}
      className={`w-full flex items-center gap-3.5 min-h-[60px] py-2 text-left border-b border-bb-border last:border-b-0 cursor-pointer disabled:opacity-40 ${ROW_TONES[tone]}`}>
      {Icon && <Icon size={20} className="shrink-0" />}
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-semibold">{title}</span>
        {sub && <span className="block text-[13px] text-gray-600 font-normal">{sub}</span>}
      </span>
      {right ?? (chevron && tone !== 'red' ? <ChevronRight size={18} className="text-gray-400 shrink-0" /> : null)}
    </button>
  );
}

// ============================================================
// DATES & FUNCTIONS
// ============================================================

const toDate = (s) => (s ? new Date(`${s}T00:00:00`) : null);

/** Tinted square: "SUN" over "8". Grey once the day is over. */
export function DateBlock({ date, past = false }) {
  const d = toDate(date);
  return (
    <div className={`w-[46px] shrink-0 text-center rounded-[10px] py-1 ${past ? 'bg-gray-100' : 'bg-violet-50'}`} aria-hidden="true">
      <div className={`text-[11px] font-extrabold ${past ? 'text-bb-muted' : 'text-bb-accent-hover'}`}>
        {d ? d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase() : '—'}
      </div>
      <div className={`text-[18px] leading-tight font-extrabold ${past ? 'text-bb-muted' : 'text-bb-text'}`}>{d ? d.getDate() : '?'}</div>
    </div>
  );
}

/**
 * One function of an event (the main one or a sub event).
 * @param fn     { name, date, endDate?, multiDay?, location }
 * @param main   show the "Main" tag
 * @param past   fade + strike through (the day is over)
 * @param detail text under the name; defaults to "8 Nov 2026 · Venue"
 * @param right  buttons at the end (✎ 🗑 in New event)
 */
export function FunctionRow({ fn, main = false, past = false, detail, right = null, className = '' }) {
  const days = functionDays(fn);
  const when = fn?.date ? `${formatDateReadable(fn.date)}${days > 1 ? ` · ${days} days` : ''}` : 'No date yet';
  const sub = detail ?? [when, fn?.location].filter(Boolean).join(' · ');
  return (
    <div className={`flex items-center gap-3 ${past ? 'opacity-60' : ''} ${className}`} data-testid="function-row">
      <DateBlock date={fn?.date} past={past} />
      <div className="flex-1 min-w-0">
        <p className={`text-[15px] font-bold text-bb-text break-words ${past ? 'line-through' : ''}`}>
          {fn?.name || 'Event'}
          {main && <span className="ml-1.5 align-middle text-[11px] font-bold px-1.5 py-px rounded-full bg-violet-100 text-bb-accent-hover no-underline">Main</span>}
        </p>
        <p className="text-[13px] text-gray-600 break-words">{sub}</p>
      </div>
      {right}
    </div>
  );
}
