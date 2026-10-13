/**
 * DaysCell — the "Days" cell of the printed quotation / bill tables.
 *
 * The Days column only appears when some item runs more than one day
 * (helpers.usesDays). Inline styles, like the rest of those documents, so the
 * PDF and print look the same.
 */

// ============================================================
// IMPORTS
// ============================================================
import React from 'react';
import { itemDays } from '../utils/helpers';

// ============================================================
// DaysCell — MAIN COMPONENT
// ============================================================

/**
 * @param {string[]} keys    one item key, or a bundle's member keys (one line each, under the bundle name)
 * @param {object}   prices  the event's itemPrices
 * @param {boolean}  single  a plain item row (no bundle spacer line)
 * @param {boolean}  last    rightmost column (extra right padding)
 */
export default function DaysCell({ keys, prices, single = false, last = false }) {
  const style = { padding: '10px 12px', textAlign: 'center', color: '#4b5563', fontSize: '12px', ...(last ? { paddingRight: '24px' } : {}) };
  if (single) return <td style={style}>{itemDays(prices[keys[0]])}</td>;
  return (
    <td style={style}>
      <div style={{ visibility: 'hidden' }}>&nbsp;</div>
      {keys.map((k, i) => <div key={k} style={{ marginTop: i === 0 ? 0 : '2px' }}>{itemDays(prices[k])}</div>)}
    </td>
  );
}
