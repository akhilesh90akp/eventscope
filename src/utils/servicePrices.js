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
// SUGGESTIONS (quote "Add an item" box)
// ============================================================

/** Is this name one of the company's services? (case ignored) */
export const isService = (categories, name) => {
  const n = norm(name);
  return !!n && (categories || []).some(c => (c.items || []).some(i => norm(i) === n));
};

/**
 * Services matching what is typed: names starting with it first, then names
 * containing it; names already in the event left out. Nothing until 1 letter.
 * → [{ name, cat, price }]
 */
export function serviceMatches(categories, typed, taken = [], limit = 8) {
  const q = norm(typed);
  if (!q) return [];
  const takenSet = new Set((taken || []).map(norm));
  const starts = [];
  const contains = [];
  const seen = new Set();
  (categories || []).forEach(cat => (cat.items || []).forEach(name => {
    const n = norm(name);
    if (seen.has(n) || takenSet.has(n)) return;
    seen.add(n);
    const hit = { name, cat, price: priceOf(cat, name) };
    if (n.startsWith(q) || n.split(/[\s/(&-]+/).some(w => w.startsWith(q))) starts.push(hit);
    else if (n.includes(q)) contains.push(hit);
  }));
  return [...starts, ...contains].slice(0, limit);
}

/** A category to suggest for a new service: "Miscellaneous" / "Other" if there is one, else the first */
export const suggestCategoryId = (categories) =>
  ((categories || []).find(c => /misc|other/i.test(c.name)) || (categories || [])[0])?.id || '';

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

/** Add a new service item (with an optional price) to a category → { categories } or { error } */
export function addServiceItem(categories, { catId, name, rate, unit }) {
  const n = String(name || '').trim();
  if (!n) return { error: 'Type the item name' };
  const cat = (categories || []).find(c => c.id === catId);
  if (!cat) return { error: 'Choose a category' };
  if ((cat.items || []).some(i => norm(i) === norm(n))) return { error: `“${n}” is already in ${cat.name}` };
  const price = cleanPrice(rate, unit);
  return { categories: categories.map(c => (c.id !== catId ? c : { ...c, items: [...(c.items || []), n], prices: { ...(c.prices || {}), ...(price ? { [n]: price } : {}) } })) };
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

// ============================================================
// FILE IMPORT / EXPORT (Settings → Services → "Replace from file" / "Download list")
// ============================================================

/** Unit words a file may use → unit id ("sq ft", "per day", "Day" …) */
const UNIT_WORDS = { item: 'item', day: 'day', hour: 'hour', event: 'event', package: 'package', person: 'person', plate: 'person', sqft: 'sqft', 'sq ft': 'sqft', sqrft: 'sqft', rft: 'rft', 'running ft': 'rft', night: 'night', km: 'km' };
const unitFrom = (s) => {
  const w = norm(s).replace(/^per\s+/, '').replace(/\s*\/\s*plate$/, '');
  return UNIT_WORDS[w] || UNIT_WORDS[w.replace(/\s+/g, '')] || DEFAULT_UNIT;
};

/** Splits CSV text into rows of cells (quotes and commas inside quotes handled) */
function csvRows(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

/**
 * Reads a services file → { categories: [{ name, icon, items, prices }] } or { error }.
 * CSV with a header row: Category, Icon (optional), Item, Price (optional), Unit (optional).
 * Names already used in another category are skipped (a service lives in one category).
 */
export function parseServicesFile(text) {
  const rows = csvRows(String(text || '').replace(/^﻿/, ''));
  if (rows.length < 2) return { error: 'The file has no services in it' };
  const head = rows[0].map(h => norm(h));
  const col = (name) => head.indexOf(name);
  const cCat = col('category'), cItem = col('item'), cIcon = col('icon'), cPrice = col('price'), cUnit = col('unit');
  if (cCat < 0 || cItem < 0) return { error: 'The first row needs the columns Category and Item' };
  const cats = [];
  const seen = new Set();
  rows.slice(1).forEach(r => {
    const catName = (r[cCat] || '').trim();
    const item = (r[cItem] || '').trim();
    if (!catName || !item || seen.has(norm(item))) return;
    seen.add(norm(item));
    let cat = cats.find(c => norm(c.name) === norm(catName));
    if (!cat) { cat = { name: catName, icon: (cIcon >= 0 && r[cIcon]?.trim()) || '📦', items: [], prices: {} }; cats.push(cat); }
    cat.items.push(item);
    const p = cleanPrice(cPrice >= 0 ? r[cPrice] : '', cUnit >= 0 ? unitFrom(r[cUnit]) : DEFAULT_UNIT);
    if (p) cat.prices[item] = p;
  });
  if (!cats.length) return { error: 'The file has no services in it' };
  return { categories: cats };
}

/** The company's services as CSV text (same columns parseServicesFile reads) */
export function servicesToCsv(categories) {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const lines = ['Category,Icon,Item,Price,Unit'];
  (categories || []).forEach(c => (c.items || []).forEach(i => {
    const p = priceOf(c, i);
    lines.push([c.name, c.icon || '', i, p ? p.rate : '', p ? unitShort(p.unit) : ''].map(q).join(','));
  }));
  return lines.join('\n') + '\n';
}
