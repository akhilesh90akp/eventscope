/**
 * copyPaste — "Duplicate event" and "Copy / Paste quote items"
 *
 * Duplicate: makes the data for a new draft from an existing event — same
 * client, events, items, prices and groups, with "(Copy)" after the client
 * name so it is easy to spot. Left out: the bill, the contract, quote
 * versions, status and dates of creation (the copy starts fresh as a draft).
 *
 * Copy / Paste: "Copy all items" on one quotation keeps every item (with
 * qty · rate · days) and its groups on this device; "Paste items" on another
 * quotation adds them into one of its events (or each event into the
 * matching event, in order). Items already there are skipped.
 *
 * The pure functions are unit-tested (tests/copyPaste.test.mjs); the
 * clipboard is localStorage (per device, per company), wrapped in try/catch.
 */

// ============================================================
// DUPLICATE EVENT
// ============================================================

/** Fields that belong to the original only — never copied */
const NOT_COPIED = ['id', 'status', 'createdAt', 'updatedAt', 'billDetails', 'contract', 'quoteRevisions', 'completedAt', 'confirmedAt'];

/** The new draft's data (pass it to AppContext.addEvent) */
export function duplicateEventData(ev) {
  const copy = JSON.parse(JSON.stringify(ev || {}));
  NOT_COPIED.forEach(k => { delete copy[k]; });
  copy.clientName = `${(ev?.clientName || 'Untitled').trim()} (Copy)`;
  if (copy.quoteDetails) copy.quoteDetails = { ...copy.quoteDetails, revisedLabel: false };
  copy.copiedFrom = ev?.id || null;
  return copy;
}

// ============================================================
// COPY QUOTE ITEMS
// ============================================================

/**
 * What "Copy all items" keeps: one entry per event of the quote, with its
 * items (name, qty, rate, days) and its groups (name, price, member names).
 * groups = the quote's printGroups ({ id, name, items }).
 */
export function copyQuoteItems({ groups, itemPrices, bundles, eventId, from }) {
  const sections = (groups || []).map(g => ({
    name: g.name,
    items: (g.items || []).map(name => {
      const p = itemPrices?.[`${g.id}::${name}`] || {};
      return { name, qty: p.qty === '' ? 1 : (p.qty ?? 1), rate: Number(p.rate) || 0, days: Number(p.days) || 1 };
    }),
    groups: (bundles || [])
      .filter(b => (b.itemKeys || []).some(k => k.startsWith(`${g.id}::`)))
      .map(b => ({ name: b.name, amount: Number(b.amount) || 0, items: b.itemKeys.filter(k => k.startsWith(`${g.id}::`)).map(k => k.slice(g.id.length + 2)) })),
  })).filter(s => s.items.length);
  return { v: 1, eventId: eventId || null, from: from || '', copiedAt: new Date().toISOString(), sections };
}

/** Number of items in a copy */
export const clipItemCount = (clip) => (clip?.sections || []).reduce((n, s) => n + s.items.length, 0);

// ============================================================
// PASTE QUOTE ITEMS
// ============================================================

/**
 * Adds a copy into a quote. `plan` = [{ from: <section index in the copy>, to: <section id here> }].
 * Returns the new { sectionItems, itemPrices, bundles } plus { added, skipped }.
 * Items whose name is already in that event are skipped (a group keeps only
 * the items that were added, and is dropped if fewer than 2 are left).
 */
export function pasteQuoteItems({ sectionItems, itemPrices, bundles }, clip, plan, makeId = defaultId) {
  const items = { ...sectionItems };
  const prices = { ...itemPrices };
  const groups = [...(bundles || [])];
  let added = 0;
  let skipped = 0;
  plan.forEach(({ from, to }) => {
    const src = clip?.sections?.[from];
    if (!src) return;
    const list = [...(items[to] || [])];
    const addedHere = new Set();
    src.items.forEach(it => {
      if (list.includes(it.name)) { skipped++; return; }
      list.push(it.name);
      addedHere.add(it.name);
      prices[`${to}::${it.name}`] = { qty: it.qty, rate: it.rate, days: it.days };
      added++;
    });
    items[to] = list;
    (src.groups || []).forEach(g => {
      const members = g.items.filter(n => addedHere.has(n));
      if (members.length >= 2) groups.push({ id: makeId(), name: g.name, itemKeys: members.map(n => `${to}::${n}`), amount: g.amount });
    });
  });
  return { sectionItems: items, itemPrices: prices, bundles: groups, added, skipped };
}

const defaultId = () => `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ============================================================
// CLIPBOARD (this device, per company)
// ============================================================

const KEY = (tenantId) => `eventscope.quoteClip.${tenantId || 'none'}`;
export const CLIP_EVENT = 'eventscope-quote-clip';

export function readClip(tenantId) {
  try {
    const raw = localStorage.getItem(KEY(tenantId));
    const clip = raw ? JSON.parse(raw) : null;
    return clip && clip.v === 1 && Array.isArray(clip.sections) ? clip : null;
  } catch { return null; }
}

export function writeClip(tenantId, clip) {
  try {
    localStorage.setItem(KEY(tenantId), JSON.stringify(clip));
    window.dispatchEvent(new Event(CLIP_EVENT));
    return true;
  } catch { return false; }
}
