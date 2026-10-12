/**
 * Unit tests — page breaks for the in-app PDF (src/utils/pdfExport.js)
 *
 * Only the pure page-break picker is tested here; drawing the PDF needs a
 * browser and is covered by the end-to-end checks.
 */

// ============================================================
// IMPORTS
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPageStarts } from '../src/utils/pdfExport.js';

// ============================================================
// pickPageStarts
// ============================================================
test('a short document is one page', () => {
  assert.deepEqual(pickPageStarts([100, 200, 300], 500, 1000), [0]);
});

test('breaks at the last row edge that fits, never through a row', () => {
  // rows end every 90px; page holds 1000px → break at 990, then 1980
  const rows = Array.from({ length: 30 }, (_, i) => (i + 1) * 90);
  assert.deepEqual(pickPageStarts(rows, 2700, 1000), [0, 990, 1980]);
});

test('falls back to a hard cut when one block is taller than a page', () => {
  assert.deepEqual(pickPageStarts([50, 2500], 2500, 1000), [0, 1000, 2000]);
});

test('ignores break points too near the top of a page (no near-empty pages)', () => {
  // only candidate inside page 1 is at 100 (under 30%) → hard cut at 1000
  assert.deepEqual(pickPageStarts([100, 1500], 1600, 1000), [0, 1000]);
});

test('a forced page start (e.g. an annexure) begins a new page even when it would fit', () => {
  assert.deepEqual(pickPageStarts([100, 200, 300], 500, 1000, [250]), [0, 250]);
  // forced start on a later page, after normal breaks
  assert.deepEqual(pickPageStarts([900, 1800], 2300, 1000, [2000]), [0, 900, 1800, 2000]);
});
