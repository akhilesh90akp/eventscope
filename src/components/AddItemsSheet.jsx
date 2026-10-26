/**
 * AddItemsSheet — the phone "Add items" sheet of the quotation
 *
 * One sheet to add many items to one event:
 *   1. choose the event (starts empty when the quote has several events, and
 *      asks if it is missed; picked for you when there is only one);
 *   2. type a name and tap Add, or tap a service from the list; each name
 *      drops into the "Added" list (newest at the top, ✕ removes it);
 *   3. Save adds them all to the event. Qty, rate and days are filled on the
 *      page afterwards.
 * The page owns the data: this sheet only collects names and calls onSave.
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, TriangleAlert, X } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { serviceNames, suggestServices } from '../utils/helpers';

// ============================================================
// AddItemsSheet — MAIN COMPONENT
// ============================================================

/**
 * @param events     [{ id, name, items }] — the quote's events (main first)
 * @param categories the company's service categories
 * @param onSave     (eventId, names[]) — adds the names to that event
 */
export default function AddItemsSheet({ events, categories, onSave, onClose }) {
  const [eventId, setEventId] = useState(events.length === 1 ? events[0].id : '');
  const [text, setText] = useState('');
  const [names, setNames] = useState([]);
  const [error, setError] = useState('');          // 'event' | 'items' | ''
  const [note, setNote] = useState('');
  const selectRef = useRef(null);
  const inputRef = useRef(null);

  const event = events.find(e => e.id === eventId);
  const inEvent = event ? event.items : [];
  const services = useMemo(() => serviceNames(categories), [categories]);
  const chips = suggestServices(services, text, [...names, ...inEvent]);

  /** Adds one name to the list; says why when it can't */
  const addName = (raw) => {
    const name = (raw || '').trim();
    if (!name) return false;
    if (names.includes(name)) { setNote('Already in your list'); return false; }
    if (inEvent.includes(name)) { setNote(`Already in ${event.name}`); return false; }
    setNames(n => [name, ...n]);
    setNote('');
    setError(e => (e === 'items' ? '' : e));
    return true;
  };
  const addTyped = () => { if (addName(text)) setText(''); inputRef.current?.focus(); };

  const save = () => {
    if (!eventId) { setError('event'); selectRef.current?.focus(); return; }
    let list = names;
    const typed = text.trim();
    if (typed && !list.includes(typed) && !inEvent.includes(typed)) list = [typed, ...list];   // a name still in the box counts
    if (!list.length) { setError('items'); inputRef.current?.focus(); return; }
    onSave(eventId, list.filter(n => !inEvent.includes(n)));
  };

  const count = names.length + (text.trim() && !names.includes(text.trim()) ? 1 : 0);

  return (
    <BottomSheet open onClose={onClose} title="Add items" testId="add-items-sheet"
      footer={<div className="flex gap-2.5">
        <button onClick={onClose} className="min-h-[50px] px-5 rounded-xl border border-gray-300 font-semibold cursor-pointer" data-testid="add-cancel">Cancel</button>
        <button onClick={save} className="flex-1 min-h-[50px] rounded-xl bg-bb-accent text-white font-bold text-[15.5px] cursor-pointer" data-testid="add-save">
          {count > 0 ? `Save ${count} item${count > 1 ? 's' : ''}` : 'Save items'}
        </button>
      </div>}>
      <div className="space-y-4">
        {/* 1 · Which event */}
        <div>
          <label htmlFor="add-event" className="block text-[13.5px] font-bold mb-1.5">Add to event</label>
          <div className="relative">
            <select id="add-event" ref={selectRef} value={eventId} data-testid="add-event"
              onChange={e => { setEventId(e.target.value); setError(er => (er === 'event' ? '' : er)); setNote(''); }}
              aria-invalid={error === 'event'}
              className={`w-full min-h-[48px] appearance-none rounded-xl px-3 pr-10 text-[16px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40
                ${error === 'event' ? 'border-2 border-red-600 bg-red-50' : 'border border-bb-border bg-bb-input'} ${eventId ? 'font-semibold text-bb-text' : 'text-bb-muted'}`}>
              <option value="">Choose an event</option>
              {events.map((e, i) => <option key={e.id} value={e.id}>{e.name}{events.length > 1 && i === 0 ? ' · Main' : ''}</option>)}
            </select>
            <ChevronDown size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-bb-muted pointer-events-none" />
          </div>
          {error === 'event' && <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-red-700 mt-1.5" role="alert"><TriangleAlert size={15} />Choose which event these items go to</p>}
        </div>

        {/* 2 · Type or pick */}
        <div>
          <label htmlFor="add-name" className="block text-[13.5px] font-bold mb-1.5">Item name</label>
          <div className="flex gap-2">
            <input id="add-name" ref={inputRef} value={text} onChange={e => { setText(e.target.value); setNote(''); }} onKeyDown={e => e.key === 'Enter' && addTyped()}
              placeholder="Type an item, e.g. Stage" enterKeyHint="done" data-testid="add-name"
              className="flex-1 min-w-0 min-h-[48px] rounded-xl border border-bb-border bg-bb-input px-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-bb-accent/40" />
            <button onClick={addTyped} disabled={!text.trim()} data-testid="add-name-btn"
              className="min-h-[48px] px-4 rounded-xl border border-violet-300 bg-violet-50 text-bb-accent-hover font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40">
              <Plus size={17} />Add
            </button>
          </div>
          {note && <p className="text-[12.5px] text-amber-800 mt-1.5">{note}</p>}
        </div>

        {chips.length > 0 && (
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-gray-600 mb-2">{text.trim().length >= 2 ? 'Matching your services' : 'From your services'}</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1" data-testid="add-chips">
              {chips.map(n => (
                <button key={n} onClick={() => { if (addName(n)) setText(''); }}
                  className="shrink-0 min-h-[40px] px-3.5 rounded-full border border-gray-300 bg-white text-[14px] font-semibold whitespace-nowrap cursor-pointer">{n}</button>
              ))}
            </div>
          </div>
        )}

        {/* 3 · What will be added */}
        <div>
          <p className="flex justify-between text-[12px] font-bold uppercase tracking-wider text-gray-600 mb-1.5"><span>Added ({names.length})</span>{names.length > 0 && <span className="normal-case tracking-normal font-medium">Price them after saving</span>}</p>
          {names.length === 0 ? (
            <div className={`rounded-xl border-[1.5px] border-dashed p-4 text-center text-[13.5px] leading-snug ${error === 'items' ? 'border-red-400 text-red-700' : 'border-gray-300 text-bb-muted'}`}>
              {error === 'items' ? 'Add at least one item first' : <>Items you add show up here.<br />Add as many as you need, then save.</>}
            </div>
          ) : (
            <ul className="divide-y divide-bb-border" data-testid="add-list">
              {names.map(n => (
                <li key={n} className="flex items-center gap-2 min-h-[46px]">
                  <span className="flex-1 min-w-0 font-bold text-[14.5px] break-words">{n}</span>
                  <button onClick={() => setNames(l => l.filter(x => x !== n))} aria-label={`Remove ${n}`} className="w-10 h-10 -mr-2 flex items-center justify-center text-bb-muted cursor-pointer"><X size={18} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
