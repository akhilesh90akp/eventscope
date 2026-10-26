/**
 * AddItemPhoneSheet — phone "Add item" for a confirmed / completed event
 *
 * Follows the Services step of New event: the items already on the event show
 * as chips first, then a type-and-Add box, then the service categories as
 * folded rows with tick boxes. Each tick or Add saves straight away (the page
 * owns the saving: this sheet only calls onAdd), Done closes it.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import BottomSheet from './BottomSheet';

// ============================================================
// AddItemPhoneSheet — MAIN COMPONENT
// ============================================================

/**
 * @param targets    [{ value, label }] where the item can go (main event, sub events)
 * @param target     the chosen target value
 * @param onTarget   (value) — changes the target
 * @param added      names already on the chosen target
 * @param categories the company's service categories
 * @param onAdd      (name, target) — adds one item
 */
export default function AddItemPhoneSheet({ title, targets, target, onTarget, added, categories, onAdd, onClose }) {
  const [text, setText] = useState('');
  const [openCat, setOpenCat] = useState(() => categories.find(c => (c.items || []).some(i => added.includes(i)))?.id ?? categories[0]?.id);

  const addTyped = () => { const n = text.trim(); if (n && !added.includes(n)) onAdd(n, target); setText(''); };

  return (
    <BottomSheet open onClose={onClose} title="Add item" sub={title} testId="add-item-sheet"
      footer={<button onClick={onClose} className="w-full min-h-[50px] rounded-xl bg-bb-accent text-white font-bold text-[15.5px] cursor-pointer" data-testid="add-item-done">Done</button>}>
      <div className="space-y-4 pt-1">
        {/* Which event */}
        {targets.length > 1 && (
          <div>
            <label htmlFor="ai-target" className="block text-[13.5px] font-bold mb-1.5">Add to</label>
            <div className="relative">
              <select id="ai-target" value={target} onChange={e => onTarget(e.target.value)} data-testid="add-item-target"
                className="w-full min-h-[48px] appearance-none rounded-xl border border-bb-border bg-bb-input px-3 pr-10 text-[16px] font-semibold">
                {targets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-bb-muted pointer-events-none" />
            </div>
          </div>
        )}

        {/* Already on the event */}
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-gray-600 mb-2">Added ({added.length})</p>
          {added.length === 0
            ? <p className="text-[13.5px] text-bb-muted">Nothing yet.</p>
            : <div className="flex flex-wrap gap-2" data-testid="add-item-added">
                {added.map(n => <span key={n} className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-full bg-violet-50 border border-violet-200 text-bb-accent-hover text-[13.5px] font-semibold"><Check size={14} />{n}</span>)}
              </div>}
        </div>

        {/* Type and add */}
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTyped()} placeholder="Type a service…" enterKeyHint="done" aria-label="Service name" data-testid="add-item-text"
            className="flex-1 min-w-0 min-h-[48px] rounded-xl border border-bb-border bg-bb-input px-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
          <button onClick={addTyped} disabled={!text.trim()} data-testid="add-item-btn"
            className="min-h-[48px] px-4 rounded-xl border border-violet-300 bg-violet-50 text-bb-accent-hover font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"><Plus size={17} />Add</button>
        </div>

        {/* Categories, folded */}
        <div className="space-y-2">
          {categories.map(cat => {
            const items = cat.items || [];
            const n = items.filter(i => added.includes(i)).length;
            const on = openCat === cat.id;
            return (
              <div key={cat.id} className="rounded-xl border border-bb-border overflow-hidden">
                <button onClick={() => setOpenCat(on ? null : cat.id)} aria-expanded={on} className="w-full flex items-center gap-2 min-h-[50px] px-3.5 text-left cursor-pointer">
                  <span className="flex-1 font-bold text-[15px]">{cat.icon} {cat.name}</span>
                  <span className="text-[12.5px] text-gray-600">{n} of {items.length}{n ? ' added' : ''}</span>
                  <ChevronDown size={18} className={`text-bb-muted transition-transform ${on ? 'rotate-180' : ''}`} />
                </button>
                {on && (
                  <div className="grid grid-cols-2 gap-x-2 px-2 pb-2 border-t border-bb-border">
                    {items.map(item => {
                      const has = added.includes(item);
                      return (
                        <button key={item} onClick={() => !has && onAdd(item, target)} disabled={has} aria-pressed={has}
                          className="flex items-center gap-2 min-h-[46px] px-1.5 text-left text-[14.5px] cursor-pointer disabled:cursor-default">
                          <span className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${has ? 'bg-bb-accent border-bb-accent text-white' : 'border-gray-300 bg-white'}`}>{has && <Check size={14} />}</span>
                          <span className={`min-w-0 break-words ${has ? 'font-semibold' : ''}`}>{item}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}
