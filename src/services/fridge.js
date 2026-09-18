// Digital fridge (Approach B). Built from order history — no manual entry — and
// DEPLETED by what you cook (round 2): every confirmed "did you cook? yes" consumes
// one unit of each of that recipe's required categories, drawn from the most
// perishable matching item first (mirrors the front-loading story). Items drawn to
// zero move to a "Cooked / used up" group, so the fridge stays honest after cooking.
import { db } from '../db.js';
import { shelfFor } from './shelfLife.js';
import { archetypeById } from './archetypes.js';
import { CATALOG } from '../data/catalog.js';

const BY_ID = new Map(CATALOG.map(p => [p.id, p]));
const DAY = 86400000;

export function buildFridge(userId, atISO = new Date().toISOString()) {
  const at = new Date(atISO).getTime();
  const rows = db.prepare(`
    SELECT oi.product_id, MAX(o.delivered_at) AS delivered_at, SUM(oi.qty) AS qty
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.user_id = ? AND o.status = 'delivered' AND o.delivered_at IS NOT NULL
    GROUP BY oi.product_id`).all(userId);

  const entries = [];
  for (const r of rows) {
    const p = BY_ID.get(r.product_id);
    if (!p) continue;
    const shelf = shelfFor(p);
    const ageDays = Math.floor((at - new Date(r.delivered_at).getTime()) / DAY);
    const daysLeft = shelf.days - ageDays;
    entries.push({
      product_id: p.id, name: p.name, emoji: p.emoji, qty: r.qty, remaining: r.qty,
      categories: p.recipe_categories || [],
      shelf_category: p.shelf_category, shelf_days: shelf.days, source: shelf.source,
      delivered_at: r.delivered_at, days_left: daysLeft, state: stateFor(daysLeft, shelf.days),
    });
  }
  entries.sort((a, b) => a.days_left - b.days_left);

  // --- deplete by confirmed cooks ---
  const cooks = db.prepare(
    "SELECT archetype_id FROM cook_reminders WHERE user_id=? AND cooking_confirmed=1").all(userId);
  let consumed_units = 0;
  for (const c of cooks) {
    const a = archetypeById(c.archetype_id);
    if (!a) continue;
    for (const cat of a.required_categories || []) {
      // soonest-to-expire item that's still usable (not already spoiled) — you don't
      // cook with food that already went off, so expired items are never consumed.
      const hit = entries.find(e => e.remaining > 0 && e.days_left >= 0 && e.categories.includes(cat));
      if (hit) { hit.remaining -= 1; consumed_units++; }
    }
  }
  for (const e of entries) if (e.remaining <= 0) e.state = 'used';

  const by = s => entries.filter(e => e.state === s);
  return {
    counts: {
      total: entries.length,
      expiring: by('expiring').length,
      expired: by('expired').length,
      used: by('used').length,
    },
    consumed_units,
    groups: [
      { state: 'expired',  label: 'Past its best',         items: by('expired') },
      { state: 'expiring', label: 'Use today / tomorrow',  items: by('expiring') },
      { state: 'soon',     label: 'Use this week',         items: by('soon') },
      { state: 'fresh',    label: 'Fresh & pantry',        items: by('fresh') },
      { state: 'used',     label: 'Cooked / used up',      items: by('used') },
    ].filter(g => g.items.length),
    entries,
  };
}

// Current usable inventory for meal-plan generation: everything delivered and not yet
// cooked or expired, with real days-left. This is what makes a new purchase ADD to the
// plan instead of replacing it — the plan is built from the whole kitchen, not one order.
export function inventoryForPlan(userId, atISO = new Date().toISOString()) {
  const f = buildFridge(userId, atISO);
  return f.entries
    .filter(e => e.remaining > 0 && e.state !== 'expired')
    .map(e => ({ product: BY_ID.get(e.product_id), qty: e.remaining, days: e.days_left }))
    .filter(x => x.product);
}

function stateFor(daysLeft, shelfDays) {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 1) return 'expiring';
  if (daysLeft <= 5 && shelfDays <= 30) return 'soon';
  return 'fresh';
}
