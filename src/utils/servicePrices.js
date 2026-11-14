/**
 * servicePrices — default prices for the company's service items
 *
 * Each item in Settings → Services can have an optional default price and a
 * unit (per day, per event, per person / plate…). They are kept on the
 * category as `prices: { [itemName]: { rate, unit } }`, so items stay plain
 * names and older data needs no change.
 *
 * When an item is added to a quote (or picked on New / Edit event), its rate
 * starts at the default price; it can still be changed on that quote. "Per
 * day" items count the function's days (as before); every other unit counts
 * 1 day, so the qty carries the hours / plates / sq ft…
 *
 * Pure functions, unit-tested in tests/servicePrices.test.mjs. Saving is in
 * AppContext (saveCategories).
 */

// ============================================================
// UNITS
// ============================================================

/** The units a default price can be per (short = shown after the price, "₹18,000 / day") */
export const PRICE_UNITS = [
  { id: 'item', label: 'Per item', short: 'item' },
  { id: 'day', label: 'Per day', short: 'day' },
  { id: 'hour', label: 'Per hour', short: 'hour' },
  { id: 'event', label: 'Per event', short: 'event' },
  { id: 'package', label: 'Per package', short: 'package' },
  { id: 'person', label: 'Per person / plate', short: 'person' },
  { id: 'sqft', label: 'Per sq ft', short: 'sq ft' },
  { id: 'rft', label: 'Per running ft', short: 'running ft' },
  { id: 'night', label: 'Per night', short: 'night' },
  { id: 'km', label: 'Per km', short: 'km' },
];

export const DEFAULT_UNIT = 'item';

/** Short unit text for "₹18,000 / day" */
export const unitShort = (unit) => (PRICE_UNITS.find(u => u.id === unit) || PRICE_UNITS[0]).short;

// ============================================================
// READING PRICES
// ============================================================

/** An item's default price in a category, or null: { rate, unit } */
export function priceOf(cat, item) {
  const p = cat?.prices?.[item];
  const rate = Number(p?.rate);
  return p && rate > 0 ? { rate, unit: p.unit || DEFAULT_UNIT } : null;
}

const norm = (s) => String(s || '').trim().toLowerCase();

/** The default price for an item name in any category (first match, case ignored), or null */
export function findDefaultPrice(categories, name) {
  const n = norm(name);
  if (!n) return null;
  for (const cat of categories || []) {
    const item = (cat.items || []).find(i => norm(i) === n);
    if (item !== undefined) { const p = priceOf(cat, item); if (p) return p; }
  }
  return null;
}

/**
 * The quote line an item starts with: 1 × default rate × days.
 * Per day (or no default price) → the function's days; any other unit → 1 day.
 */
export function startingPrice(categories, name, functionDays) {
  const p = findDefaultPrice(categories, name);
  const days = functionDays || 1;
  if (!p) return { qty: 1, rate: 0, days };
  return { qty: 1, rate: p.rate, days: p.unit === 'day' ? days : 1 };
}

/** Starting prices for items that have none yet: { "<section>::<name>": price } */
export function startingPricesFor(categories, sections, existing = {}) {
  const out = {};
  sections.forEach(({ id, items, days }) => {
    (items || []).forEach(name => {
      const key = `${id}::${name}`;
      if (existing[key]) return;
      const p = startingPrice(categories, name, days);
      if (p.rate > 0) out[key] = p;
    });
  });
  return out;
}

// ============================================================
// EDITING (return new category lists — saving is AppContext's job)
// ============================================================

/** A price input → a stored price, or null for blank / 0 / not a number */
export function cleanPrice(rate, unit) {
  const r = Math.round(Number(String(rate ?? '').replace(/[,\s₹]/g, '')));
  return Number.isFinite(r) && r > 0 ? { rate: r, unit: PRICE_UNITS.some(u => u.id === unit) ? unit : DEFAULT_UNIT } : null;
}

/** Keeps only prices of items that are still in the category */
function tidy(cat) {
  const prices = {};
  (cat.items || []).forEach(i => { if (cat.prices?.[i]) prices[i] = cat.prices[i]; });
  return { ...cat, prices };
}

/**
 * Edit one item: rename, move to another category, set or clear its price.
 * { fromCat, oldName, toCat, name, rate, unit } → { categories } or { error }
 */
export function editServiceItem(categories, { fromCat, oldName, toCat, name, rate, unit }) {
  const newName = String(name || '').trim();
  if (!newName) return { error: 'Type the item name' };
  const target = categories.find(c => c.id === (toCat || fromCat));
  if (!target) return { error: 'Choose a category' };
  const clash = (target.items || []).some(i => norm(i) === norm(newName) && !(target.id === fromCat && i === oldName));
  if (clash) return { error: `“${newName}” is already in ${target.name}` };
  const price = cleanPrice(rate, unit);
  const next = categories.map(c => {
    let items = [...(c.items || [])];
    let prices = { ...(c.prices || {}) };
    if (c.id === fromCat) {
      const at = items.indexOf(oldName);
      if (c.id === target.id) { if (at >= 0) items[at] = newName; else items.push(newName); }
      else if (at >= 0) items.splice(at, 1);
      delete prices[oldName];
    } else if (c.id === target.id) {
      items.push(newName);
    }
    if (c.id === target.id) { if (price) prices[newName] = price; else delete prices[newName]; }
    return tidy({ ...c, items, prices });
  });
  return { categories: next };
}

/**
 * Save the "Edit category" pop-up: icon, name and every item's name and price.
 * rows = [{ oldName, name, rate, unit }] (oldName null for a new row) → { category } or { error }
 */
export function saveCategoryRows(cat, { icon, name, rows }) {
  const catName = String(name || '').trim();
  if (!catName) return { error: 'Type the category name' };
  const items = [];
  const prices = {};
  for (const r of rows) {
    const n = String(r.name || '').trim();
    if (!n) continue;                       // empty rows are dropped
    if (items.some(i => norm(i) === norm(n))) return { error: `“${n}” is in the list twice` };
    items.push(n);
    const p = cleanPrice(r.rate, r.unit);
    if (p) prices[n] = p;
  }
  return { category: { ...cat, icon: icon || cat.icon || '📦', name: catName, items, prices } };
}
