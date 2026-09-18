// Seeds the catalog, a demo user, and two past delivered orders so the digital
// fridge shows live expiry states (expired / use-soon / fresh) on first load.
import { db, migrate, now } from './db.js';
import { CATALOG } from './data/catalog.js';

const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();

export function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) n FROM products').get().n;
  if (count > 0) return;

  const ip = db.prepare(`INSERT INTO products(id,name,unit,price,was,taxonomy,shelf_category,recipe_categories,emoji,tint)
                         VALUES(?,?,?,?,?,?,?,?,?,?)`);
  for (const p of CATALOG)
    ip.run(p.id, p.name, p.unit, p.price, p.was, p.taxonomy, p.shelf_category, JSON.stringify(p.recipe_categories), p.emoji, p.tint);

  db.prepare(`INSERT INTO users(id,name,household_size_declared,completed_order_count,created_at)
              VALUES(?,?,?,?,?)`).run('u_demo', 'Amara O.', '2-3', 8, now());

  // history order 1 — delivered 5 days ago -> these are now expired in the fridge
  histOrder('GL-H1', 5, [['spinach', 1], ['okra', 1], ['tomato', 1]], 6000);
  // history order 2 — delivered 2 days ago -> mix of use-soon and fresh
  histOrder('GL-H2', 2, [['beef', 1], ['bread', 1], ['eggs', 1], ['rice', 1], ['plantain', 2]], 15000);
  // history order 3 — delivered ~1 day ago -> a full weekly shop so the user opens the
  // app to a varied existing week (multiple soups, a fry-day, fruit + baking for dessert),
  // not rice-on-repeat. A real stocked kitchen.
  histOrder('GL-H3', 1, [
    ['onion', 1], ['tomato', 2], ['pepper', 1], ['egusi', 1], ['ugu', 1], ['crayfish', 1],
    ['chicken', 1], ['catfish', 1], ['beans', 1], ['yam', 1], ['okra', 1], ['scentleaf', 1],
    ['carrot', 1], ['greenbeans', 1], ['gardenegg', 1], ['flour', 1], ['sugar', 1], ['yeast', 1],
    ['pineapple', 1], ['banana', 1], ['groundnut', 1], ['watermelon', 1],
  ], 32000);

  console.log('Seeded catalog, demo user, and fridge history.');
}

function histOrder(id, ago, items, total) {
  db.prepare(`INSERT INTO orders(id,user_id,status,total,item_count,created_at,delivered_at)
              VALUES(?,?,?,?,?,?,?)`).run(id, 'u_demo', 'delivered', total, items.length, daysAgo(ago + 0.1), daysAgo(ago));
  const ii = db.prepare('INSERT INTO order_items(order_id,product_id,qty,prep) VALUES(?,?,?,?)');
  for (const [pid, qty] of items) ii.run(id, pid, qty, null);
}

// allow `npm run seed` standalone
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed.js')) {
  migrate(); seedIfEmpty(); console.log('done.');
}
