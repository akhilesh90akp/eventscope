/**
 * ServicesSettings — Settings → Services (laptop and phone)
 *
 * The company's service categories and items, with an optional default price
 * per item (utils/servicePrices.js):
 *   - search box (items or categories);
 *   - each category folds open to show its items with "₹18,000 / day" or
 *     "+ Add price", ✎ Edit item and × remove; an "Add new item…" box;
 *   - ✎ on a category opens Edit category: icon, name and every item's name,
 *     price and unit in one list (Save changes);
 *   - Edit item: name, category, default price + unit (Save item);
 *   - owners: "Download list" (CSV) and "Replace from file…" (a CSV with
 *     Category, Icon, Item, Price, Unit — asks first, then replaces every
 *     category; quotes already made keep their own items and prices).
 * Laptops show items two to a row; phones one per row (tap the row to edit).
 * Pop-ups are BottomSheets (a dialog on laptops). Saving goes through
 * AppContext (categories are saved at once, as before — no Save button).
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useMemo, useRef, useState } from 'react';
import { Select } from './PhoneUI';
import { ChevronRight, Edit2, Trash2, X, Plus, Search, Upload, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useConfirm } from './useConfirm';
import BottomSheet from './BottomSheet';
import { suggestServiceEmoji } from '../utils/serviceEmoji';
import { formatRupees, genId } from '../utils/helpers';
import { PRICE_UNITS, DEFAULT_UNIT, priceOf, unitShort, editServiceItem, saveCategoryRows, parseServicesFile, servicesToCsv } from '../utils/servicePrices';

// ============================================================
// SMALL PARTS
// ============================================================

const boxCls = 'rounded-xl border border-bb-border bg-white px-3 text-bb-text placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-bb-accent/40';
const inputCls = `w-full ${boxCls}`;
const iconCls = `w-14 shrink-0 text-center ${boxCls}`;   // emoji box beside a name

/** Digits only, shown with Indian commas ("140000" → "1,40,000") */
const groupDigits = (v) => { const d = String(v ?? '').replace(/\D/g, '').replace(/^0+/, ''); return d ? Number(d).toLocaleString('en-IN') : ''; };

/** ₹ price box + unit select, side by side (also used by SaveToServicesSheet) */
export function PriceInputs({ rate, unit, onRate, onUnit, big, testId = 'price' }) {
  const h = big ? 'h-12 text-[16px]' : 'h-10 text-[14px]';
  return (
    <div className="flex gap-2 min-w-0">
      <label className={`flex-1 min-w-0 flex items-center gap-1.5 rounded-xl border border-bb-border bg-white px-3 focus-within:ring-2 focus-within:ring-bb-accent/40 ${h}`}>
        <span className="text-gray-500">₹</span>
        <input value={groupDigits(rate)} onChange={e => onRate(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="—"
          aria-label="Default price" data-testid={`${testId}-rate`} className="flex-1 min-w-0 bg-transparent outline-none text-right tabular-nums" />
      </label>
      <Select value={unit || DEFAULT_UNIT} onChange={e => onUnit(e.target.value)} aria-label="Price per" data-testid={`${testId}-unit`}
        className={`flex-[1.3] min-w-0 rounded-xl border border-bb-border bg-white px-2.5 text-bb-text cursor-pointer focus:outline-none focus:ring-2 focus:ring-bb-accent/40 ${h}`}>
        {PRICE_UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
      </Select>
    </div>
  );
}

/** "₹18,000 / day", or "+ Add price" */
function PriceText({ price, onAdd }) {
  if (price) return <span className="text-[13px] tabular-nums whitespace-nowrap"><b className="font-semibold text-bb-text">{formatRupees(price.rate)}</b><span className="text-gray-500"> / {unitShort(price.unit)}</span></span>;
  return <button type="button" onClick={onAdd} className="text-[13px] font-semibold text-bb-accent hover:underline whitespace-nowrap cursor-pointer">+ Add price</button>;
}

// ============================================================
// ServicesSettings — MAIN COMPONENT
// ============================================================

export default function ServicesSettings({ isPhone, canEdit }) {
  const { categories, addCategory, deleteCategory, addItemToCat, removeItemFromCat, replaceCategories, updateCategory, showToast } = useApp();
  const confirm = useConfirm();

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const [newItem, setNewItem] = useState({});            // catId → text in "Add new item…"
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📦');
  const [itemEdit, setItemEdit] = useState(null);        // { catId, name }
  const [catEdit, setCatEdit] = useState(null);          // catId
  const fileRef = useRef(null);

  // Search: categories whose name matches show all items; others show matching items only
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => categories.map(cat => {
    if (!q || cat.name.toLowerCase().includes(q)) return { cat, items: cat.items || [] };
    const items = (cat.items || []).filter(i => i.toLowerCase().includes(q));
    return items.length ? { cat, items } : null;
  }).filter(Boolean), [categories, q]);

  // ------------------------------------------------------------
  // EVENT HANDLERS
  // ------------------------------------------------------------
  const toggle = (id) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const addItem = (cat) => {
    const name = (newItem[cat.id] || '').trim();
    if (!name) return;
    if ((cat.items || []).some(i => i.toLowerCase() === name.toLowerCase())) { showToast(`“${name}” is already in ${cat.name}`, 'error'); return; }
    addItemToCat(cat.id, name);
    setNewItem(n => ({ ...n, [cat.id]: '' }));
  };

  const addCat = () => {
    const name = newCatName.trim();
    if (!name) return;
    addCategory({ name, icon: newCatIcon || '📦', items: [], prices: {} });
    setNewCatName('');
    setNewCatIcon('📦');
  };

  const askDeleteCat = async (cat) => {
    const ok = await confirm({ title: `Delete “${cat.name}”?`, message: `The category and its ${cat.items.length} items will be removed. Existing quotations aren’t affected.`, confirmLabel: 'Delete', tone: 'danger' });
    if (ok) deleteCategory(cat.id);
  };

  const saveItem = async (form) => {
    const r = editServiceItem(categories, form);
    if (r.error) { showToast(r.error, 'error'); return; }
    const res = await replaceCategories(r.categories);
    if (res?.success) { showToast('Item saved'); setItemEdit(null); }
  };

  const saveCat = async (cat, form) => {
    const r = saveCategoryRows(cat, form);
    if (r.error) { showToast(r.error, 'error'); return; }
    const { icon, name, items, prices } = r.category;
    const res = await updateCategory(cat.id, { icon, name, items, prices });
    if (res?.success) { showToast('Category saved'); setCatEdit(null); }
  };

  /** Owners: replace every category with the services in a CSV file (asks first) */
  const replaceFromFile = async (file) => {
    if (!file) return;
    const r = parseServicesFile(await file.text());
    if (r.error) { showToast(r.error, 'error'); return; }
    const items = r.categories.reduce((n, c) => n + c.items.length, 0);
    const priced = r.categories.reduce((n, c) => n + Object.keys(c.prices).length, 0);
    const nowItems = categories.reduce((n, c) => n + (c.items || []).length, 0);
    const ok = await confirm({
      title: 'Replace your services?',
      message: `Your ${categories.length} categories (${nowItems} items) will be replaced by ${r.categories.length} categories with ${items} items (${priced} with a price) from “${file.name}”. Quotes you already made don’t change.`,
      confirmLabel: 'Replace', tone: 'danger',
    });
    if (!ok) return;
    const res = await replaceCategories(r.categories.map(c => ({ id: genId(), ...c })));
    if (res?.success) { setOpen(new Set()); showToast(`Services replaced: ${r.categories.length} categories, ${items} items`); }
  };

  /** Owners: the services as a CSV file (also the format "Replace from file" reads) */
  const downloadList = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + servicesToCsv(categories)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'services.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  const editingCat = categories.find(c => c.id === catEdit);
  const editingItemCat = itemEdit && categories.find(c => c.id === itemEdit.catId);

  return (
    <div className="space-y-3" data-testid="services-settings">
      {/* Search */}
      <label className={`flex items-center gap-2 rounded-xl border border-bb-border bg-white px-3 ${isPhone ? 'h-12' : 'h-10 max-w-sm'}`}>
        <Search size={16} className="text-gray-500 shrink-0" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search items or categories" data-testid="services-search"
          className={`flex-1 min-w-0 bg-transparent outline-none ${isPhone ? 'text-[16px]' : 'text-[14px]'}`} />
        {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-gray-500 cursor-pointer"><X size={16} /></button>}
      </label>

      {/* Categories */}
      {shown.length === 0 && <p className="text-[14px] text-gray-600 py-6 text-center">Nothing matches “{query}”.</p>}
      {shown.map(({ cat, items }) => {
        const isOpen = !!q || open.has(cat.id);
        return (
          <div key={cat.id} data-testid="service-cat" className={`bg-white rounded-2xl border overflow-hidden ${isOpen ? 'border-bb-accent' : 'border-bb-border'}`}>
            <div className={`flex items-center gap-2 px-3 py-2.5 ${isOpen ? 'bg-violet-50' : ''}`}>
              <button type="button" onClick={() => toggle(cat.id)} aria-expanded={isOpen} data-testid="service-cat-toggle"
                className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer min-h-[40px]">
                <ChevronRight size={18} className={`shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-90 text-bb-accent' : ''}`} />
                <span className="text-xl leading-none">{cat.icon}</span>
                <span className="min-w-0">
                  <b className={`font-semibold text-bb-text ${isPhone ? 'block text-[15px]' : 'text-[14.5px]'}`}>{cat.name}</b>
                  <span className={`text-gray-500 ${isPhone ? 'block text-[12.5px]' : 'text-[12.5px] ml-1.5'}`}>({cat.items.length} items)</span>
                </span>
              </button>
              <button type="button" onClick={() => setCatEdit(cat.id)} aria-label={`Edit ${cat.name}`} title="Edit category and prices" data-testid="service-cat-edit"
                className="w-10 h-10 rounded-xl border border-bb-border bg-white flex items-center justify-center text-bb-text hover:text-bb-accent cursor-pointer shrink-0"><Edit2 size={16} /></button>
              <button type="button" onClick={() => askDeleteCat(cat)} aria-label={`Delete ${cat.name}`} title="Delete category"
                className="w-10 h-10 rounded-xl border border-red-200 bg-white flex items-center justify-center text-red-500 hover:bg-red-50 cursor-pointer shrink-0"><Trash2 size={16} /></button>
            </div>

            {isOpen && (
              <div className="p-3 space-y-3 border-t border-bb-border">
                {items.length > 0 && (
                  <div className={isPhone ? 'space-y-1.5' : 'grid grid-cols-2 gap-2'}>
                    {items.map(item => {
                      const price = priceOf(cat, item);
                      const edit = () => setItemEdit({ catId: cat.id, name: item });
                      return isPhone ? (
                        <div key={item} data-testid="service-item" className="flex items-center gap-2 rounded-xl bg-gray-100 pl-3 pr-1">
                          <button type="button" onClick={edit} className="flex-1 min-w-0 text-left py-2.5 cursor-pointer" data-testid="service-item-edit">
                            <span className="block text-[14px] text-bb-text">{item}</span>
                            {price
                              ? <span className="block text-[12.5px] text-gray-600 tabular-nums">{formatRupees(price.rate)} / {unitShort(price.unit)}</span>
                              : <span className="block text-[12.5px] font-semibold text-bb-accent">+ Add price</span>}
                          </button>
                          <button type="button" onClick={() => removeItemFromCat(cat.id, item)} aria-label={`Remove ${item}`} className="w-10 h-10 flex items-center justify-center text-red-500 cursor-pointer"><X size={16} /></button>
                        </div>
                      ) : (
                        <div key={item} data-testid="service-item" className="flex items-center gap-2 rounded-xl bg-gray-100 pl-3 pr-1 min-h-[42px]">
                          <span className="flex-1 min-w-0 text-[13.5px] text-bb-text truncate" title={item}>{item}</span>
                          <PriceText price={price} onAdd={edit} />
                          <button type="button" onClick={edit} aria-label={`Edit ${item}`} title="Edit item" data-testid="service-item-edit" className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-bb-accent cursor-pointer"><Edit2 size={14} /></button>
                          <button type="button" onClick={() => removeItemFromCat(cat.id, item)} aria-label={`Remove ${item}`} title="Remove item" className="w-8 h-8 flex items-center justify-center text-red-500 cursor-pointer"><X size={15} /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!q && (
                  <div className="flex gap-2">
                    <input value={newItem[cat.id] || ''} onChange={e => setNewItem(n => ({ ...n, [cat.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addItem(cat)}
                      placeholder="Add new item…" data-testid="service-new-item" className={`${inputCls} flex-1 ${isPhone ? 'h-12 text-[16px]' : 'h-10 text-[14px]'}`} />
                    <button type="button" onClick={() => addItem(cat)} data-testid="service-add-item"
                      className={`rounded-xl bg-bb-accent text-white font-semibold px-4 flex items-center gap-1.5 cursor-pointer ${isPhone ? 'h-12' : 'h-10 text-[14px]'}`}><Plus size={16} />Add</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add category */}
      <div className="bg-white rounded-2xl border border-bb-border p-4">
        <h3 className="text-[12px] font-bold tracking-[0.06em] uppercase text-bb-muted mb-3">Add category</h3>
        <div className="flex gap-2">
          <input value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)} aria-label="Icon (emoji)" className={`${iconCls} ${isPhone ? 'h-12 text-[18px]' : 'h-10'}`} />
          <input value={newCatName} placeholder="Category name" data-testid="service-new-cat"
            onChange={e => {
              setNewCatName(e.target.value);
              // suggest an emoji until the user picks their own
              if (!newCatIcon || newCatIcon === '📦' || newCatIcon === suggestServiceEmoji(newCatName)) setNewCatIcon(suggestServiceEmoji(e.target.value));
            }}
            onKeyDown={e => e.key === 'Enter' && addCat()}
            className={`${inputCls} flex-1 min-w-0 ${isPhone ? 'h-12 text-[16px]' : 'h-10 text-[14px]'}`} />
          <button type="button" onClick={addCat} className={`rounded-xl bg-bb-accent text-white font-semibold px-4 flex items-center gap-1.5 cursor-pointer ${isPhone ? 'h-12' : 'h-10 text-[14px]'}`}><Plus size={16} />Add</button>
        </div>
      </div>

      {/* Owners: download / replace the whole list */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-[13.5px]">
          <button type="button" onClick={downloadList} data-testid="services-download" className="min-h-[40px] inline-flex items-center gap-1.5 font-semibold text-bb-accent cursor-pointer"><Download size={15} />Download list</button>
          <button type="button" onClick={() => fileRef.current?.click()} data-testid="services-replace" className="min-h-[40px] inline-flex items-center gap-1.5 font-semibold text-bb-accent cursor-pointer"><Upload size={15} />Replace from file…</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" data-testid="services-file"
            onChange={e => { replaceFromFile(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="text-[12.5px] text-gray-500">CSV columns: Category, Icon, Item, Price, Unit</span>
        </div>
      )}

      {itemEdit && editingItemCat && (
        <ItemSheet key={`${itemEdit.catId}::${itemEdit.name}`} isPhone={isPhone} canEdit={canEdit} categories={categories} cat={editingItemCat} item={itemEdit.name}
          onSave={saveItem} onClose={() => setItemEdit(null)} />
      )}
      {editingCat && (
        <CategorySheet key={editingCat.id} isPhone={isPhone} canEdit={canEdit} cat={editingCat} onSave={(form) => saveCat(editingCat, form)} onClose={() => setCatEdit(null)} />
      )}
    </div>
  );
}

// ============================================================
// EDIT ITEM — name, category, default price + unit
// ============================================================

function ItemSheet({ isPhone, canEdit, categories, cat, item, onSave, onClose }) {
  const start = priceOf(cat, item);
  const [name, setName] = useState(item);
  const [catId, setCatId] = useState(cat.id);
  const [rate, setRate] = useState(start ? String(start.rate) : '');
  const [unit, setUnit] = useState(start?.unit || DEFAULT_UNIT);
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); await onSave({ fromCat: cat.id, oldName: item, toCat: catId, name, rate, unit }); setSaving(false); };
  const lbl = 'block text-[12.5px] font-semibold text-gray-700 mb-1.5';
  const h = isPhone ? 'h-12 text-[16px]' : 'h-10 text-[14px]';
  return (
    <BottomSheet open onClose={onClose} title="Edit item" testId="item-sheet"
      footer={
        <div className="flex gap-2.5 lg:justify-end">
          <button type="button" onClick={onClose} className={`flex-1 lg:flex-none lg:px-5 rounded-xl border border-bb-border bg-white font-semibold cursor-pointer ${isPhone ? 'h-12' : 'h-10'}`}>Cancel</button>
          <button type="button" onClick={save} disabled={!canEdit || saving} data-testid="item-save"
            className={`flex-1 lg:flex-none lg:px-5 rounded-xl bg-bb-accent text-white font-semibold cursor-pointer disabled:opacity-50 ${isPhone ? 'h-12' : 'h-10'}`}>{saving ? 'Saving…' : 'Save item'}</button>
        </div>
      }>
      <fieldset disabled={!canEdit} className="space-y-4 min-w-0">
        <label className="block"><span className={lbl}>Item name</span>
          <input value={name} onChange={e => setName(e.target.value)} data-testid="item-name" className={`${inputCls} ${h}`} />
        </label>
        <label className="block"><span className={lbl}>Category</span>
          <Select value={catId} onChange={e => setCatId(e.target.value)} data-testid="item-cat" className={`${inputCls} ${h} cursor-pointer`}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </Select>
        </label>
        <div>
          <span className={lbl}>Default price <span className="font-medium text-gray-500">· optional</span></span>
          <PriceInputs rate={rate} unit={unit} onRate={setRate} onUnit={setUnit} big={isPhone} testId="item-price" />
          <p className="text-[12.5px] text-gray-600 mt-1.5">Fills the rate when you add this to a quote. You can still change it there.</p>
        </div>
      </fieldset>
    </BottomSheet>
  );
}

// ============================================================
// EDIT CATEGORY — icon, name, every item's name + price + unit
// ============================================================

let rowKey = 0;

function CategorySheet({ isPhone, canEdit, cat, onSave, onClose }) {
  const [icon, setIcon] = useState(cat.icon || '📦');
  const [name, setName] = useState(cat.name);
  const [rows, setRows] = useState(() => (cat.items || []).map(i => {
    const p = priceOf(cat, i);
    return { key: ++rowKey, oldName: i, name: i, rate: p ? String(p.rate) : '', unit: p?.unit || DEFAULT_UNIT };
  }));
  const [saving, setSaving] = useState(false);
  const setRow = (key, field, value) => setRows(rs => rs.map(r => (r.key === key ? { ...r, [field]: value } : r)));
  const addRow = () => setRows(rs => [...rs, { key: ++rowKey, oldName: null, name: '', rate: '', unit: DEFAULT_UNIT }]);
  const save = async () => { setSaving(true); await onSave({ icon, name, rows }); setSaving(false); };
  const h = isPhone ? 'h-12 text-[16px]' : 'h-10 text-[14px]';
  return (
    <BottomSheet open onClose={onClose} title="Edit category" wide testId="cat-sheet"
      footer={
        <div className="flex gap-2.5 lg:justify-end">
          <button type="button" onClick={onClose} className={`flex-1 lg:flex-none lg:px-5 rounded-xl border border-bb-border bg-white font-semibold cursor-pointer ${isPhone ? 'h-12' : 'h-10'}`}>Cancel</button>
          <button type="button" onClick={save} disabled={!canEdit || saving} data-testid="cat-save"
            className={`flex-1 lg:flex-none lg:px-5 rounded-xl bg-bb-accent text-white font-semibold cursor-pointer disabled:opacity-50 ${isPhone ? 'h-12' : 'h-10'}`}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      }>
      <fieldset disabled={!canEdit} className="space-y-4 min-w-0">
        <div>
          <span className="block text-[12.5px] font-semibold text-gray-700 mb-1.5">Icon and category name</span>
          <div className="flex gap-2">
            <input value={icon} onChange={e => setIcon(e.target.value)} aria-label="Icon (emoji)" className={`${iconCls} ${isPhone ? 'h-12 text-[18px]' : 'h-10 text-[17px]'}`} />
            <input value={name} onChange={e => setName(e.target.value)} aria-label="Category name" data-testid="cat-name" className={`${inputCls} flex-1 min-w-0 ${h}`} />
          </div>
        </div>
        <div>
          {!isPhone && (
            <div className="grid grid-cols-[1fr_260px_32px] gap-2 text-[12.5px] font-semibold text-gray-700 mb-1.5">
              <span>Items · {rows.length}</span><span>Default price · unit</span><span />
            </div>
          )}
          {isPhone && <span className="block text-[12.5px] font-semibold text-gray-700 mb-1.5">Items · {rows.length} <span className="font-medium text-gray-500">· price optional</span></span>}
          <div className={isPhone ? 'space-y-2.5' : 'space-y-2'}>
            {rows.map(r => isPhone ? (
              <div key={r.key} data-testid="cat-row" className="rounded-xl border border-bb-border p-2.5 space-y-2">
                <div className="flex gap-2">
                  <input value={r.name} onChange={e => setRow(r.key, 'name', e.target.value)} placeholder="Item name" aria-label="Item name" data-testid="cat-row-name" className={`${inputCls} flex-1 min-w-0 ${h}`} />
                  <button type="button" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} aria-label={`Remove ${r.name || 'row'}`} className="w-10 flex items-center justify-center text-red-500 cursor-pointer"><X size={18} /></button>
                </div>
                <PriceInputs rate={r.rate} unit={r.unit} onRate={v => setRow(r.key, 'rate', v)} onUnit={v => setRow(r.key, 'unit', v)} big testId="cat-row-price" />
              </div>
            ) : (
              <div key={r.key} data-testid="cat-row" className="grid grid-cols-[1fr_260px_32px] gap-2 items-center">
                <input value={r.name} onChange={e => setRow(r.key, 'name', e.target.value)} placeholder="Item name" aria-label="Item name" data-testid="cat-row-name" className={`${inputCls} ${h}`} />
                <PriceInputs rate={r.rate} unit={r.unit} onRate={v => setRow(r.key, 'rate', v)} onUnit={v => setRow(r.key, 'unit', v)} testId="cat-row-price" />
                <button type="button" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} aria-label={`Remove ${r.name || 'row'}`} className="h-10 flex items-center justify-center text-red-500 cursor-pointer"><X size={16} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow} data-testid="cat-add-row" className="mt-2.5 text-[14px] font-semibold text-bb-accent flex items-center gap-1 cursor-pointer min-h-[40px]"><Plus size={16} />Add item</button>
        </div>
      </fieldset>
    </BottomSheet>
  );
}
