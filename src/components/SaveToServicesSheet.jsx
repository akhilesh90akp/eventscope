/**
 * SaveToServicesSheet — "Save to your services" for an item typed on a quote
 *
 * When an item typed on a quote isn't one of the company's services, the
 * owner can save it (category + optional default price) so it is suggested
 * next time. Used by the laptop "Add an item" box (ItemSuggestInput) and the
 * phone Add items sheet. A BottomSheet (dialog on laptops); saving goes
 * through AppContext.replaceCategories with utils/servicePrices.addServiceItem.
 *
 * @param name     the typed item name (editable here)
 * @param isPhone  phone sizes
 * @param onSaved  (name) — after the save worked (the caller adds it to the quote)
 * @param onClose  closes without saving
 */

// ============================================================
// IMPORTS
// ============================================================
import React, { useState } from 'react';
import { Select } from './PhoneUI';
import { useApp } from '../context/AppContext';
import BottomSheet from './BottomSheet';
import { PriceInputs } from './ServicesSettings';
import { addServiceItem, suggestCategoryId, DEFAULT_UNIT } from '../utils/servicePrices';

// ============================================================
// SaveToServicesSheet — MAIN COMPONENT
// ============================================================

export default function SaveToServicesSheet({ name: startName, isPhone, onSaved, onClose }) {
  const { categories, replaceCategories, showToast } = useApp();
  const [name, setName] = useState(startName || '');
  const [catId, setCatId] = useState(() => suggestCategoryId(categories));
  const [rate, setRate] = useState('');
  const [unit, setUnit] = useState(DEFAULT_UNIT);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const r = addServiceItem(categories, { catId, name, rate, unit });
    if (r.error) { showToast(r.error, 'error'); return; }
    setSaving(true);
    const res = await replaceCategories(r.categories);
    setSaving(false);
    if (!res?.success) return;
    const cat = categories.find(c => c.id === catId);
    showToast(`Saved to ${cat?.name || 'your services'}`);
    onSaved(name.trim());
  };

  const h = isPhone ? 'h-12 text-[16px]' : 'h-10 text-[14px]';
  const field = `w-full rounded-xl border border-bb-border bg-white px-3 text-bb-text focus:outline-none focus:ring-2 focus:ring-bb-accent/40 ${h}`;
  const lbl = 'block text-[12.5px] font-semibold text-gray-700 mb-1.5';
  return (
    <BottomSheet open onClose={onClose} title="Save to your services" sub="It will be suggested next time you add items." testId="save-service-sheet"
      footer={
        <div className="flex gap-2.5 lg:justify-end">
          <button type="button" onClick={onClose} className={`flex-1 lg:flex-none lg:px-5 rounded-xl border border-bb-border bg-white font-semibold cursor-pointer ${isPhone ? 'h-12' : 'h-10'}`}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} data-testid="save-service"
            className={`flex-1 lg:flex-none lg:px-5 rounded-xl bg-bb-accent text-white font-semibold cursor-pointer disabled:opacity-50 ${isPhone ? 'h-12' : 'h-10'}`}>{saving ? 'Saving…' : 'Save and add'}</button>
        </div>
      }>
      <div className="space-y-4">
        <label className="block"><span className={lbl}>Item name</span>
          <input value={name} onChange={e => setName(e.target.value)} data-testid="save-service-name" className={field} />
        </label>
        <label className="block"><span className={lbl}>Category</span>
          <Select value={catId} onChange={e => setCatId(e.target.value)} data-testid="save-service-cat" className={`${field} cursor-pointer`}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </Select>
        </label>
        <div>
          <span className={lbl}>Default price <span className="font-medium text-gray-500">· optional</span></span>
          <PriceInputs rate={rate} unit={unit} onRate={setRate} onUnit={setUnit} big={isPhone} testId="save-service-price" />
          <p className="text-[12.5px] text-gray-600 mt-1.5">Fills the rate when you add this to a quote. You can still change it there.</p>
        </div>
      </div>
    </BottomSheet>
  );
}
