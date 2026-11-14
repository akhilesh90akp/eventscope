/**
 * ItemSuggestInput — the laptop quote's "Add an item" box with suggestions
 *
 * As you type, a list opens under the box with matching services (name,
 * category, default price). ↑ ↓ move, Enter or a click adds the highlighted
 * service; with nothing highlighted Enter adds what is typed. When the typed
 * name isn't a service, the last row offers "Add and save to services…"
 * (owners only), which opens SaveToServicesSheet.
 *
 * @param value / onChange   the typed text
 * @param onAdd              (name) — adds an item to this event
 * @param categories         the company's services
 * @param taken              names already in this event (not suggested)
 * @param canSave            show "save to services" (owners)
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, BookmarkPlus } from 'lucide-react';
import SaveToServicesSheet from './SaveToServicesSheet';
import { formatRupees } from '../utils/helpers';
import { serviceMatches, isService, unitShort } from '../utils/servicePrices';

// ============================================================
// ItemSuggestInput — MAIN COMPONENT
// ============================================================

export default function ItemSuggestInput({ value, onChange, onAdd, categories, taken, canSave, placeholder, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);                  // highlighted row (-1 = none)
  const [saving, setSaving] = useState(null);        // name being saved to services
  const [pending, setPending] = useState(null);      // saved to services, added once the new list has arrived
  const box = useRef(null);
  const typed = (value || '').trim();
  const matches = useMemo(() => serviceMatches(categories, typed, taken, 6), [categories, typed, taken]);
  const offerSave = canSave && typed.length > 1 && !isService(categories, typed) && !(taken || []).some(t => t.toLowerCase() === typed.toLowerCase());
  const rows = [...matches.map(m => ({ kind: 'service', ...m })), ...(offerSave ? [{ kind: 'save', name: typed }] : [])];
  const show = open && typed && rows.length > 0;

  // Add a just-saved service only after the page has the updated services,
  // so the quote picks up the default price that was typed with it.
  useEffect(() => {
    if (pending && isService(categories, pending)) { setPending(null); onAdd(pending); }
  }, [pending, categories, onAdd]);

  const pick = (row) => {
    setOpen(false); setHi(-1);
    if (row.kind === 'save') { setSaving(row.name); return; }
    onAdd(row.name);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown' && rows.length) { e.preventDefault(); setOpen(true); setHi(h => (h + 1) % rows.length); }
    else if (e.key === 'ArrowUp' && rows.length) { e.preventDefault(); setHi(h => (h <= 0 ? rows.length - 1 : h - 1)); }
    else if (e.key === 'Escape') { setOpen(false); setHi(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (show && hi >= 0 && rows[hi]) pick(rows[hi]);
      else if (typed) { setOpen(false); onAdd(typed); }
    }
  };

  return (
    <div ref={box} className="relative flex-1 min-w-0"
      onBlur={e => { if (!box.current?.contains(e.relatedTarget)) { setOpen(false); setHi(-1); } }}>
      <input value={value || ''} placeholder={placeholder} aria-label={ariaLabel} autoComplete="off"
        role="combobox" aria-expanded={!!show} aria-autocomplete="list"
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(-1); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        className="w-full h-[38px] rounded-xl border border-bb-border bg-bb-input px-3 text-[13.5px] text-bb-text placeholder:text-bb-muted/70 focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
      {show && (
        <ul role="listbox" data-testid="item-suggest" className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-bb-border rounded-xl shadow-lg py-1 max-h-72 overflow-y-auto">
          {matches.length > 0
            ? <li className="px-3 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-bb-muted">From your services</li>
            : <li className="px-3 pt-1.5 pb-1 text-[12px] text-bb-muted">Not in your services yet. Press Enter to add it to this quote only.</li>}
          {rows.map((r, i) => (
            <li key={`${r.kind}-${r.name}`} role="option" aria-selected={hi === i}>
              <button type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => pick(r)} onMouseEnter={() => setHi(i)}
                data-testid={r.kind === 'save' ? 'suggest-save' : 'suggest-item'}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer ${hi === i ? 'bg-violet-50' : ''} ${r.kind === 'save' ? 'border-t border-bb-border mt-1' : ''}`}>
                {r.kind === 'service' ? (
                  <>
                    <span className="text-[15px] leading-none">{r.cat.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13.5px] text-bb-text truncate">{r.name}</span>
                      <span className="block text-[11.5px] text-bb-muted truncate">{r.cat.name}</span>
                    </span>
                    {r.price && <span className="text-[12.5px] tabular-nums text-gray-600 whitespace-nowrap">{formatRupees(r.price.rate)} / {unitShort(r.price.unit)}</span>}
                    <Plus size={15} className="text-bb-accent shrink-0" />
                  </>
                ) : (
                  <>
                    <BookmarkPlus size={16} className="text-bb-accent shrink-0" />
                    <span className="flex-1 min-w-0 text-[13.5px]">Add “<b className="font-semibold">{r.name}</b>” and save it to your services…</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {saving && (
        <SaveToServicesSheet name={saving} isPhone={false} onClose={() => setSaving(null)}
          onSaved={(name) => { setSaving(null); setPending(name); }} />
      )}
    </div>
  );
}
