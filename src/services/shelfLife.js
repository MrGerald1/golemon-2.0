// Shelf-life lookup. Loads the normalized shelf-life dataset (StillTasty-extracted
// + Nigerian food-ops overrides) and resolves days-remaining for a product.
// Fallback for any item not in the dataset: "Use within 3 days" (SHELF_FALLBACK_DAYS).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SHELF_FALLBACK_DAYS } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'shelf-life.json'), 'utf8'));

// index by category -> entry
const BY_CAT = new Map();
for (const e of RAW) if (!BY_CAT.has(e.category)) BY_CAT.set(e.category, e);

export function shelfFor(product) {
  const e = BY_CAT.get(product.shelf_category);
  if (!e) {
    return { days: SHELF_FALLBACK_DAYS, source: 'fallback', note: 'Use within 3 days' };
  }
  // We assume GoLemon delivers chilled/ambient as appropriate; use fridge days when
  // present (most fresh items), else ambient.
  const days = e.shelf_days_fridge ?? e.shelf_days_ambient ?? SHELF_FALLBACK_DAYS;
  return { days, source: e.source || 'unknown', note: e.storage_note || '' };
}

// urgency level from days remaining
export function levelFor(days) {
  if (days <= 2) return 'red';
  if (days <= 5) return 'amber';
  return 'green';
}
