/**
 * PurchaseDialog — the Add / Edit purchase pop-up on the Purchases page.
 *
 * Two ways to add (tabs at the top):
 *   - "Just the total" (default): date, total amount, note — for a shopping
 *     trip you don't want to list item by item.
 *   - "Item by item": the date once, then the items on that bill. Finished
 *     items fold up; "+ Add another item" starts the next one.
 * Laptops get a wide table you edit in place; phones get fold-open rows (the
 * same style as New Event → services).
 *
 * Editing an existing purchase opens the same pop-up with just that entry.
 * Saving goes through AppContext (addPurchases / updatePurchase).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Edit2, Trash2, Plus } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { useApp } from '../context/AppContext';
import { PURCHASE_CATEGORIES, cleanPurchase } from '../utils/purchases';

// ============================================================
// HELPERS
// ============================================================
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const rupees = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const amountOf = (raw) => Number(String(raw ?? '').replace(/[₹,\s]/g, '')) || 0;
let keySeq = 0;
const blankItem = () => ({ key: `n${++keySeq}`, name: '', qty: '1', category: 'Equipment', amount: '', note: '' });
const isBlank = (it) => !it.name.trim() && !amountOf(it.amount) && !it.note.trim();
const NEW_CAT = '__new__';

/** true on laptops/tablets (768px+) — they get the wide table */
function useWide() {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

const fieldCls = 'w-full bg-bb-input border border-bb-border rounded-lg px-3 py-2 text-sm text-bb-text placeholder:text-bb-muted/60 focus:outline-none focus:ring-2 focus:ring-bb-accent';

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Category picker: the usual list + ones you've used + type your own */
function CategoryField({ value, onChange, categories, className = '' }) {
  const [typing, setTyping] = useState(false);
  if (typing || (value && !categories.includes(value))) {
    return (
      <input autoFocus value={value} placeholder="Your category" onChange={e => onChange(e.target.value)}
        onBlur={() => { if (!value.trim()) { onChange('Other'); setTyping(false); } }}
        className={`${fieldCls} ${className}`} aria-label="Category" />
    );
  }
  return (
    <select value={value} onChange={e => (e.target.value === NEW_CAT ? (setTyping(true), onChange('')) : onChange(e.target.value))}
      className={`${fieldCls} ${className}`} aria-label="Category">
      {categories.map(c => <option key={c} value={c}>{c}</option>)}
      <option value={NEW_CAT}>＋ Type your own…</option>
    </select>
  );
}

/** Tabs: Just the total | Item by item */
function ModeTabs({ mode, setMode }) {
  const tab = (key, label) => (
    <button type="button" onClick={() => setMode(key)}
      className={`flex-1 py-2 rounded-lg text-[13.5px] font-semibold cursor-pointer transition-colors ${mode === key ? 'bg-white text-violet-700 shadow-sm' : 'text-bb-muted hover:text-bb-text'}`}>
      {label}
    </button>
  );
  return <div className="flex gap-1 bg-gray-100 rounded-xl p-1" role="tablist">{tab('total', 'Just the total')}{tab('item', 'Item by item')}</div>;
}

// ============================================================
// PurchaseDialog — MAIN COMPONENT
// ============================================================

/**
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {object|null} editing  a saved purchase to edit, or null to add
 */
export default function PurchaseDialog({ isOpen, onClose, editing = null }) {
  const { purchases, addPurchases, updatePurchase } = useApp();
  const wide = useWide();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [mode, setMode] = useState('total');
  const [date, setDate] = useState(today());
  const [total, setTotal] = useState({ amount: '', note: '' });
  const [items, setItems] = useState([blankItem()]);
  const [openIdx, setOpenIdx] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Fresh form each time it opens (or the saved entry when editing)
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSaving(false);
    if (editing) {
      setMode(editing.mode === 'item' ? 'item' : 'total');
      setDate(editing.date || today());
      setTotal({ amount: String(editing.amount ?? ''), note: editing.note || '' });
      setItems([{ key: 'edit', name: editing.name || '', qty: String(editing.qty || 1), category: editing.category || 'Other', amount: String(editing.amount ?? ''), note: editing.note || '' }]);
    } else {
      setMode('total');
      setDate(today());
      setTotal({ amount: '', note: '' });
      setItems([blankItem()]);
    }
    setOpenIdx(0);
  }, [isOpen, editing]);

  // Usual categories + any of your own already used
  const categories = useMemo(() => {
    const own = purchases.map(p => p.category).filter(c => c && !PURCHASE_CATEGORIES.includes(c));
    const list = [...PURCHASE_CATEGORIES.filter(c => c !== 'Other'), ...new Set(own)];
    return [...list, 'Other'];
  }, [purchases]);

  const filled = items.filter(it => !isBlank(it));
  const itemsTotal = filled.reduce((s, it) => s + amountOf(it.amount), 0);

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const setItem = (i, field, value) => {
    setItems(list => list.map((it, j) => (j === i ? { ...it, [field]: value } : it)));
    setError('');
  };

  /** Checks one item; returns an error message or '' */
  const itemProblem = (it, n) => {
    const r = cleanPurchase({ ...it, date }, 'item');
    return r.error ? `Item ${n}: ${r.error}` : '';
  };

  /** Folds the open item (if it's complete) and opens another */
  const openItem = (i) => {
    const cur = items[openIdx];
    if (cur && openIdx !== i && !isBlank(cur)) {
      const p = itemProblem(cur, openIdx + 1);
      if (p) { setError(p); return; }
    }
    setError('');
    setOpenIdx(openIdx === i && !wide ? -1 : i);
  };

  const addAnother = () => {
    const cur = items[openIdx];
    if (cur) {
      if (isBlank(cur)) { setError('Fill in this item first.'); return; }
      const p = itemProblem(cur, openIdx + 1);
      if (p) { setError(p); return; }
    }
    setError('');
    setItems(list => [...list, blankItem()]);
    setOpenIdx(items.length);
  };

  const removeItem = (i) => {
    setItems(list => (list.length === 1 ? [blankItem()] : list.filter((_, j) => j !== i)));
    setOpenIdx(o => (o === i ? -1 : o > i ? o - 1 : o));
    setError('');
  };

  const handleSave = async () => {
    let list;
    if (mode === 'total') {
      const r = cleanPurchase({ date, ...total }, 'total');
      if (r.error) { setError(r.error); return; }
      list = [r];
    } else {
      if (!filled.length) { setError('Add at least one item.'); return; }
      list = [];
      for (let i = 0; i < items.length; i++) {
        if (isBlank(items[i])) continue;
        const r = cleanPurchase({ ...items[i], date }, 'item');
        if (r.error) { setError(`Item ${i + 1}: ${r.error}`); setOpenIdx(i); return; }
        list.push(r);
      }
    }
    setSaving(true);
    const res = editing ? await updatePurchase(editing.id, list[0]) : await addPurchases(list);
    setSaving(false);
    if (res.success) onClose();
    else setError(res.error);
  };

  // ------------------------------------------------------------
  // RENDER — ITEMS (laptop table)
  // ------------------------------------------------------------
  const renderTable = () => (
    <table className="w-full">
      <thead>
        <tr className="border-b border-bb-border text-[11px] uppercase tracking-wider text-bb-muted">
          <th className="py-2 px-2 text-left w-8">#</th>
          <th className="py-2 px-2 text-left">What did you buy?</th>
          <th className="py-2 px-2 text-left w-20">Qty</th>
          <th className="py-2 px-2 text-left w-40">Category</th>
          <th className="py-2 px-2 text-right w-32">Amount (₹)</th>
          <th className="py-2 px-2 text-left">Note</th>
          <th className="w-20" />
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => {
          const on = i === openIdx;
          return (
            <tr key={it.key} className={`border-b border-bb-border/50 ${on ? 'bg-violet-50/50' : ''}`} data-testid="purchase-item-row">
              <td className="py-2 px-2 text-bb-muted text-sm">{i + 1}</td>
              {on ? (
                <>
                  <td className="py-2 px-2"><input autoFocus value={it.name} onChange={e => setItem(i, 'name', e.target.value)} placeholder="e.g. LED par lights" className={fieldCls} aria-label="What did you buy?" /></td>
                  <td className="py-2 px-2"><input value={it.qty} inputMode="numeric" onChange={e => setItem(i, 'qty', e.target.value)} className={`${fieldCls} text-center`} aria-label="Qty" /></td>
                  <td className="py-2 px-2"><CategoryField value={it.category} onChange={v => setItem(i, 'category', v)} categories={categories} /></td>
                  <td className="py-2 px-2"><input value={it.amount} inputMode="decimal" onChange={e => setItem(i, 'amount', e.target.value)} placeholder="0" className={`${fieldCls} text-right`} aria-label="Amount" /></td>
                  <td className="py-2 px-2"><input value={it.note} onChange={e => setItem(i, 'note', e.target.value)} placeholder="Note (optional)" className={fieldCls} aria-label="Note" /></td>
                </>
              ) : (
                <>
                  <td className="py-2 px-2 text-sm font-medium text-bb-text cursor-pointer" onClick={() => openItem(i)}>{it.name || <span className="text-bb-muted">—</span>}</td>
                  <td className="py-2 px-2 text-sm">{it.qty}</td>
                  <td className="py-2 px-2"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{it.category || 'Other'}</span></td>
                  <td className="py-2 px-2 text-right text-sm font-bold">{rupees(amountOf(it.amount))}</td>
                  <td className="py-2 px-2 text-sm text-bb-muted">{it.note}</td>
                </>
              )}
              <td className="py-2 px-2 text-right whitespace-nowrap">
                {!on && (
                  <button type="button" onClick={() => openItem(i)} className="p-1.5 rounded text-bb-muted hover:text-bb-accent cursor-pointer" title="Edit item" aria-label={`Edit item ${i + 1}`}>
                    <Edit2 size={16} />
                  </button>
                )}
                {!editing && (
                  <button type="button" onClick={() => removeItem(i)} className="p-1.5 rounded text-bb-muted hover:text-red-500 cursor-pointer" title="Remove item" aria-label={`Remove item ${i + 1}`}>
                    <Trash2 size={16} />
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ------------------------------------------------------------
  // RENDER — ITEMS (phone fold-open rows)
  // ------------------------------------------------------------
  const renderAccordion = () => (
    <div className="space-y-2">
      {items.map((it, i) => {
        const on = i === openIdx;
        return (
          <div key={it.key} data-testid="purchase-item-row" className={`rounded-lg overflow-hidden transition-all ${on ? 'border-l-4 border-l-bb-accent border border-bb-accent/30 bg-bb-accent/5 shadow-sm' : 'border border-bb-border'}`}>
            <button type="button" onClick={() => openItem(i)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer ${on ? 'bg-bb-accent/10' : 'bg-bb-input hover:bg-bb-card-hover'}`}>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-bb-text truncate">{it.name || `Item ${i + 1}`}</span>
                {!on && <span className="block text-xs text-bb-muted">Qty {it.qty || 1} · {it.category || 'Other'}</span>}
              </span>
              <b className="text-sm">{rupees(amountOf(it.amount))}</b>
              {on ? <ChevronUp size={18} className="text-bb-accent" /> : <ChevronDown size={18} className="text-bb-muted" />}
            </button>
            {on && (
              <div className="p-3 space-y-3">
                <Input label="What did you buy?" value={it.name} onChange={e => setItem(i, 'name', e.target.value)} placeholder="e.g. LED par lights" />
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <Input label="Amount (₹)" value={it.amount} inputMode="decimal" onChange={e => setItem(i, 'amount', e.target.value)} placeholder="0" />
                  <Input label="Qty" value={it.qty} inputMode="numeric" onChange={e => setItem(i, 'qty', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <span className="block text-sm font-medium text-bb-text">Category</span>
                  <CategoryField value={it.category} onChange={v => setItem(i, 'category', v)} categories={categories} className="!py-2.5" />
                </div>
                <Input label="Note (optional)" value={it.note} onChange={e => setItem(i, 'note', e.target.value)} placeholder="e.g. bill no., warranty" />
                {!editing && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" icon={Trash2} className="border-red-500 text-red-500 hover:bg-red-50" onClick={() => removeItem(i)}>Remove</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const saveLabel = saving ? 'Saving…' : editing ? 'Save changes' : mode === 'item' ? (filled.length ? `Save ${filled.length} item${filled.length === 1 ? '' : 's'}` : 'Save items') : 'Save purchase';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit purchase' : 'Add purchase'} size={mode === 'item' || !editing ? 'xl' : 'md'}>
      <div className="space-y-4" data-testid="purchase-dialog">
        {!editing && <ModeTabs mode={mode} setMode={(m) => { setMode(m); setError(''); }} />}

        {mode === 'total' ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-[220px_220px_1fr] gap-3 md:gap-4">
              <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
              <Input label="Total amount (₹)" value={total.amount} inputMode="decimal" placeholder="e.g. 70000" onChange={e => setTotal(t => ({ ...t, amount: e.target.value }))} />
              <Input label="Note (optional)" value={total.note} placeholder="e.g. what it covered" className="col-span-2 md:col-span-1" onChange={e => setTotal(t => ({ ...t, note: e.target.value }))} />
            </div>
            <p className="text-xs text-bb-muted">For when you don’t want to list every item — just the total you spent.</p>
          </>
        ) : (
          <>
            <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} className="md:w-56" />
            {!editing && <p className="text-sm font-medium text-bb-text -mb-2">Items on this bill</p>}
            {wide ? renderTable() : renderAccordion()}
            {!editing && (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <button type="button" onClick={addAnother}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 border-2 border-dashed border-bb-accent/50 text-bb-accent rounded-lg text-sm font-semibold cursor-pointer hover:bg-bb-accent/5">
                  <Plus size={16} /> Add another item
                </button>
                <div className="flex justify-between md:block text-sm font-bold px-1">
                  <span className="text-bb-muted font-normal md:mr-3">{filled.length} item{filled.length === 1 ? '' : 's'}</span>
                  <span className="text-base">{rupees(itemsTotal)}</span>
                </div>
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <div className="flex flex-col md:flex-row md:items-center gap-2 pt-3 border-t border-bb-border">
          <p className="text-xs text-bb-muted flex-1">Counted in the year it was bought (Apr–Mar). Doesn’t change any event’s profit in the Job Log.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saveLabel}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
