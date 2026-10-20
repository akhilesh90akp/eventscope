/**
 * LaptopUI — shared building blocks of the laptop screens (1024px and up)
 *
 * Same design system as the phone (PhoneUI): icons from lucide, the purple
 * accent, Oxanium, the same chips, toggles and tabs. Used by the laptop
 * layouts of Home, Drafts, Confirmed, Completed, Quotation, Invoice,
 * Contract, Reports and Purchases.
 *   PageHeader   title (+ count / sub-line / ← back) on the left, actions on the right
 *   HeaderIcon   38×38 icon button for page actions (one tone="primary" per page)
 *   HeaderText   38px text button with an icon (e.g. "⤓ PDF", "+ Add purchase")
 *   MorePopover  ⋯ button that opens a small menu right under it (closes on
 *                outside click / Esc) + PopItem rows
 *   StatRow      one row of equal, quiet number cards (label · value · short line)
 *   Seg          small segmented choice (GST rate 5/12/18/28, Completed · All events…)
 *   Switch       on/off switch with its label (GST, IGST, Without GST)
 *   Field        labelled 38px input for laptop forms (invoice, contract)
 *   FormCol      one labelled column of a form card
 * Pure UI: no data access here.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MoreHorizontal, Info } from 'lucide-react';
import { IconButton } from './PhoneUI';

// ============================================================
// PAGE HEADER
// ============================================================

/** Title row of a laptop page */
export function PageHeader({ title, count, sub, onBack, actions = null, testId = 'page-header' }) {
  return (
    <div className="flex items-center gap-3 min-h-[44px]" data-testid={testId}>
      {onBack && <IconButton icon={ArrowLeft} label="Back" tone="quiet" size={38} iconSize={19} className="-ml-2" onClick={onBack} />}
      <div className="flex-1 min-w-0">
        <h1 className="text-[21px] leading-tight font-bold text-bb-text flex items-center gap-2.5">
          <span className="truncate">{title}</span>
          {count !== undefined && count !== null && (
            <span className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-2 rounded-full bg-violet-100 text-violet-700 text-xs font-bold tabular-nums" data-testid="title-count">{count}</span>
          )}
        </h1>
        {sub && <p className="text-[14px] text-gray-600 mt-0.5 truncate" data-testid="page-sub">{sub}</p>}
      </div>
      {actions && <div className="ml-auto shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 38×38 icon button for the page header (tone="primary" for the one main action) */
export function HeaderIcon({ icon, label, tone = 'neutral', ...rest }) {
  return <IconButton icon={icon} label={label} tone={tone} size={38} iconSize={17} {...rest} />;
}

/** 38px text button with an icon, for the header (e.g. ⤓ PDF) */
export function HeaderText({ icon: Icon, children, primary = false, className = '', ...rest }) {
  return (
    <button {...rest}
      className={`shrink-0 min-h-[38px] px-3.5 rounded-xl border inline-flex items-center gap-2 text-[13.5px] font-semibold cursor-pointer transition-colors disabled:opacity-40
        ${primary ? 'bg-bb-accent border-bb-accent text-white hover:bg-bb-accent-hover' : 'bg-white border-gray-300 text-bb-text hover:bg-gray-50'} ${className}`}>
      {Icon && <Icon size={16} />}{children}
    </button>
  );
}

// ============================================================
// ⋯ MENU (popover)
// ============================================================

/** One row of a popover menu */
export function PopItem({ icon: Icon, children, onClick, tone, testId }) {
  return (
    <button onClick={onClick} data-testid={testId} role="menuitem"
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13.5px] font-semibold cursor-pointer hover:bg-bb-bg
        ${tone === 'red' ? 'text-red-600 mt-1 pt-2.5 rounded-none border-t border-bb-border hover:bg-red-50' : 'text-bb-text'}`}>
      {Icon && <Icon size={16} className="shrink-0" />}<span className="flex-1">{children}</span>
    </button>
  );
}

/** ⋯ button that opens a small menu under it. `children` = PopItem rows; each closes the menu. */
export function MorePopover({ children, label = 'More actions', size = 38, testId = 'btn-more' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={wrap} className="relative shrink-0">
      <IconButton icon={MoreHorizontal} label={label} size={size} iconSize={18} aria-expanded={open} aria-haspopup="menu" data-testid={testId}
        className={open ? '!border-bb-accent !bg-violet-50 !text-bb-accent-hover' : ''} onClick={() => setOpen(o => !o)} />
      {open && (
        <div role="menu" data-testid="more-popover" onClick={() => setOpen(false)}
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-56 bg-white border border-bb-border rounded-xl p-1.5 shadow-[0_18px_40px_-12px_rgba(40,10,70,0.35)]">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================
// NUMBERS
// ============================================================

const VALUE_TONES = { accent: 'text-bb-accent-hover', green: 'text-emerald-600', red: 'text-rose-600', muted: 'text-gray-400', '': 'text-bb-text' };

/** One row of equal number cards: [{ label, value, hint, tone, info, testId }] */
export function StatRow({ items, testId = 'stat-row' }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} data-testid={testId}>
      {items.map(s => (
        <div key={s.key || s.label} className="bg-white border border-bb-border rounded-xl px-4 py-3 min-w-0" data-testid={s.testId}>
          <p className="text-[12px] font-semibold text-bb-muted flex items-center gap-1.5">
            <span data-testid={s.testId ? `${s.testId}-label` : undefined}>{s.label}</span>
            {s.info && <span title={s.info} aria-label={s.info} className="text-gray-300 hover:text-gray-500 cursor-help"><Info size={13} /></span>}
          </p>
          <p className={`text-[18px] font-bold tabular-nums mt-0.5 truncate ${VALUE_TONES[s.tone || '']}`} data-testid={s.testId ? `${s.testId}-value` : undefined}>{s.value}</p>
          {s.hint && <p className={`text-[11.5px] leading-snug mt-0.5 ${s.hintTone === 'amber' ? 'text-amber-800' : 'text-bb-muted'}`} data-testid={s.testId ? `${s.testId}-hint` : undefined}>{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// CHOICES
// ============================================================

/** Small segmented choice: options = [{ value, label }] or plain strings */
export function Seg({ options, value, onChange, label, size = 'md', testId }) {
  const opts = options.map(o => (typeof o === 'object' ? o : { value: o, label: o }));
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex bg-[#ece9f3] rounded-[10px] p-[3px] gap-0.5" data-testid={testId}>
      {opts.map(o => {
        const on = String(o.value) === String(value);
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-lg font-semibold cursor-pointer transition-colors ${size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]'}
              ${on ? 'bg-white text-bb-accent-hover shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-bb-muted hover:text-bb-text'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch with its label on the right */
export function Switch({ checked, onChange, label, disabled = false, testId }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled} data-testid={testId}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-bb-text cursor-pointer disabled:opacity-40 disabled:cursor-default">
      <span className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-bb-accent' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
      {label}
    </button>
  );
}

// ============================================================
// FORMS
// ============================================================

/** Labelled 38px input (any <input> props pass through) */
export function Field({ label, id, className = '', ...rest }) {
  return (
    <label className={`block min-w-0 ${className}`} htmlFor={id}>
      <span className="block text-[12.5px] font-semibold text-gray-700 mb-1">{label}</span>
      <input id={id} {...rest}
        className="w-full h-[38px] rounded-xl border border-bb-border bg-bb-input px-3 text-[13.5px] text-bb-text placeholder:text-bb-muted/70 focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
    </label>
  );
}

/** One labelled column inside a form card */
export function FormCol({ title, children, className = '' }) {
  return (
    <div className={`min-w-0 space-y-3 ${className}`}>
      <h2 className="text-[12px] font-bold tracking-[0.06em] uppercase text-bb-muted">{title}</h2>
      {children}
    </div>
  );
}
