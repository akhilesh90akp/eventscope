/**
 * serviceEmoji — suggests an emoji for a service category from its name
 * (used by Settings → Services when adding a category). Falls back to 📦.
 */

const RULES = [
  [/stage|backdrop|platform/, '🎭'],
  [/decor|flower|floral|garland|mandap/, '💐'],
  [/light|led|laser/, '💡'],
  [/sound|audio|dj|speaker|music|band/, '🔊'],
  [/photo|camera|video|drone|album/, '📸'],
  [/food|cater|menu|buffet|meal/, '🍽️'],
  [/drink|bar|juice|coffee|tea/, '🥤'],
  [/tent|pandal|shamiana|canopy/, '⛺'],
  [/chair|table|furniture|seating|sofa/, '🪑'],
  [/car|bus|transport|vehicle|travel/, '🚗'],
  [/makeup|mehendi|mehndi|beauty|salon/, '💄'],
  [/cake|dessert|sweet/, '🎂'],
  [/invite|card|print|banner|flex/, '🖨️'],
  [/gift|return|hamper/, '🎁'],
  [/stall|counter|booth/, '🏪'],
  [/staff|crew|labour|security|manpower/, '👥'],
  [/fire|cracker|pyro/, '🎆'],
];

/** Returns an emoji for the category name, or 📦 when nothing fits */
export function suggestServiceEmoji(name) {
  const n = String(name || '').toLowerCase();
  const hit = RULES.find(([re]) => re.test(n));
  return hit ? hit[1] : '📦';
}
