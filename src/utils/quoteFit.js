/**
 * quoteFit — "Fit to budget" and quote revisions (pure math, no Firestore)
 *
 * Fit to budget brings a quote's total (before GST) to the client's number:
 *   - "Lower prices evenly": every unlocked price line (a single item, a
 *     group's price, or — with item prices hidden — an event's final amount)
 *     is multiplied by the same factor and rounded (₹100 by default). One
 *     line that can take any value (a group price, a final amount, or an
 *     item charged 1 × 1 day) absorbs the rounding so the total is exact.
 *   - "Show as discount": the quote keeps its prices; the difference goes
 *     into the Discount box (see QuotationGenerator).
 * Locked lines keep their price; the others come down more to make up.
 *
 * Revisions: a snapshot of the quote's prices taken before Fit to budget or a
 * restore, kept on the event (event.quoteRevisions, newest first, max 10).
 * Covered by tests/quoteFit.test.mjs.
 */

// ============================================================
// IMPORTS
// ============================================================
import { buildLineEntries, lineAmount, itemDays } from './helpers.js';

// ============================================================
// CONSTANTS
// ============================================================

export const ROUND_OPTIONS = [1, 100, 500, 1000];
export const DEFAULT_ROUND = 100;
export const MAX_REVISIONS = 10;

// ============================================================
// FIT TO BUDGET
// ============================================================

/**
 * The quote's price lines, in quote order.
 * @param groups   [{ id, name, items }] — the quote's sections (main + sub events)
 * @returns [{ id, kind: 'item'|'bundle'|'section', sectionId, sectionName, label, amount, units }]
 *          `units` = qty × days for an item (1 for groups / sections)
 */
export function fitUnits({ groups = [], itemPrices = {}, bundles = [], hidePrices = false, finalAmounts = {} }) {
  const out = [];
  groups.forEach(g => {
    if (hidePrices) {
      const amount = Number(finalAmounts[g.id]) || 0;
      if (amount > 0) out.push({ id: `section:${g.id}`, kind: 'section', sectionId: g.id, sectionName: g.name, label: g.name, amount, units: 1 });
      return;
    }
    buildLineEntries(g.id, g.items, bundles).forEach(en => {
      if (en.type === 'bundle') {
        const amount = Number(en.bundle.amount) || 0;
        if (amount > 0) out.push({ id: `bundle:${en.bundle.id}`, kind: 'bundle', sectionId: g.id, sectionName: g.name, label: en.bundle.name || 'Group', amount, units: 1, bundleId: en.bundle.id,
          inside: en.bundle.itemKeys.filter(k => k.startsWith(`${g.id}::`)).map(k => k.slice(String(g.id).length + 2)) });
      } else {
        const p = itemPrices[en.key] || { qty: 1, rate: 0 };
        const amount = lineAmount(p);
        const units = (Number(p.qty) || 0) * itemDays(p);
        if (amount > 0) out.push({ id: en.key, kind: 'item', sectionId: g.id, sectionName: g.name, label: en.name, amount, units, key: en.key });
      }
    });
  });
  return out;
}

const roundTo = (n, step) => (step > 1 ? Math.round(n / step) * step : Math.round(n));

/**
 * New amount for every price line so the total comes to `target`.
 * @returns { ok, reason?, amounts: { [id]: number }, total, pct } — pct = how much
 *          unlocked lines change (36 = 36 % lower; −10 = 10 % higher)
 */
export function fitToBudget(units, target, { locked = new Set(), round = DEFAULT_ROUND } = {}) {
  const goal = Math.round(Number(target) || 0);
  const amounts = {};
  units.forEach(u => { amounts[u.id] = u.amount; });
  const lockedSum = units.filter(u => locked.has(u.id)).reduce((t, u) => t + u.amount, 0);
  const free = units.filter(u => !locked.has(u.id));
  const freeSum = free.reduce((t, u) => t + u.amount, 0);
  const now = lockedSum + freeSum;

  if (!units.length || now <= 0) return { ok: false, reason: 'This quote has no prices yet.', amounts, total: now, pct: 0 };
  if (goal <= 0) return { ok: false, reason: 'Type the client’s budget.', amounts, total: now, pct: 0 };
  if (!free.length) return { ok: false, reason: 'Everything is locked — unlock something to change.', amounts, total: now, pct: 0 };
  if (goal <= lockedSum) return { ok: false, reason: `The locked prices already add up to ₹${lockedSum.toLocaleString('en-IN')}.`, amounts, total: now, pct: 0 };

  const factor = (goal - lockedSum) / freeSum;
  // An item charged qty × days can only take a whole-paise rate: its real amount is rate × units
  const realizable = (u, amt) => (u.kind === 'item' && u.units > 1 ? Math.round((amt / u.units) * 100) / 100 * u.units : amt);

  // One line takes up the rounding: prefer one that can hold any amount exactly
  const exact = free.filter(u => u.units === 1);
  const absorber = (exact.length ? exact : free).reduce((a, b) => (b.amount > a.amount ? b : a));
  free.filter(u => u !== absorber).forEach(u => { amounts[u.id] = realizable(u, Math.max(0, roundTo(u.amount * factor, round))); });
  const others = free.filter(u => u !== absorber).reduce((t, u) => t + amounts[u.id], 0);
  amounts[absorber.id] = Math.round(Math.max(0, goal - lockedSum - others) * 100) / 100;

  const total = Math.round(units.reduce((t, u) => t + (locked.has(u.id) ? u.amount : realizable(u, amounts[u.id])), 0) * 100) / 100;
  return { ok: true, amounts, total, pct: Math.round((1 - factor) * 100) };
}

/**
 * Writes the new amounts into the quote's prices.
 * Items get a new rate (amount ÷ qty ÷ days, to the paisa); groups a new group
 * price; hidden-price events a new final amount. Returns new copies.
 */
export function applyFit({ itemPrices = {}, bundles = [], finalAmounts = {} }, units, amounts) {
  const nextPrices = { ...itemPrices };
  const nextFinal = { ...finalAmounts };
  let nextBundles = bundles;
  units.forEach(u => {
    const amt = amounts[u.id];
    if (amt === undefined || amt === u.amount) return;
    if (u.kind === 'item') {
      const p = nextPrices[u.key] || { qty: 1, rate: 0 };
      nextPrices[u.key] = { ...p, rate: u.units > 0 ? Math.round((amt / u.units) * 100) / 100 : 0 };
    } else if (u.kind === 'bundle') {
      nextBundles = nextBundles.map(b => (b.id === u.bundleId ? { ...b, amount: amt } : b));
    } else {
      nextFinal[u.sectionId] = amt;
    }
  });
  return { itemPrices: nextPrices, bundles: nextBundles, finalAmounts: nextFinal };
}

// ============================================================
// REVISIONS
// ============================================================

/** A snapshot of what the quote charges, to restore later */
export function makeRevision({ itemPrices, bundles, hidePrices, finalAmounts, quoteDetails, sectionItems }, total, label, now = new Date()) {
  return {
    id: `rev_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: now.toISOString(),
    label,
    total: Math.round(Number(total) || 0),
    data: JSON.parse(JSON.stringify({ itemPrices, bundles, hidePrices, finalAmounts, quoteDetails, sectionItems })),
  };
}

/** Newest first, at most MAX_REVISIONS */
export const addRevision = (list = [], rev) => [rev, ...(list || [])].slice(0, MAX_REVISIONS);
