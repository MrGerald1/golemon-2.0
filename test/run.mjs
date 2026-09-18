// End-to-end + unit tests for the eng-review behaviors. Starts the real app on a
// throwaway DB and asserts against it, plus direct unit tests for the matcher.
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GL_DB = join(tmpdir(), `gl-test-${Date.now()}.db`);
process.env.PORT = '4319';
const BASE = 'http://localhost:4319';

await import('../src/server.js');
await new Promise(r => setTimeout(r, 400));

const H = (u = 'u_demo') => ({ 'Content-Type': 'application/json', 'x-user-id': u });
const post = (p, b, u) => fetch(BASE + p, { method: 'POST', headers: H(u), body: JSON.stringify(b) }).then(r => r.json().then(j => ({ status: r.status, j })));
const get = (p, u) => fetch(BASE + p, { headers: H(u) }).then(r => r.json().then(j => ({ status: r.status, j })));

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n      ', e.message); } };

const BASKET = ['ugu', 'titus', 'tomato', 'pepper', 'onion', 'beef', 'rice', 'egusi', 'crayfish', 'palmoil', 'vegoil', 'okra', 'plantain', 'bread', 'eggs', 'pineapple', 'carrot', 'greenbeans']
  .map(id => ({ product_id: id, qty: 1 }));

console.log('\nGoLemon Food Prep — tests\n');

await t('health: feature enabled', async () => {
  const { j } = await get('/api/health'); assert.equal(j.ok, true); assert.equal(j.feature_enabled, true);
});

let orderId, sessionId;
await t('order + webhook creates a session', async () => {
  const o = await post('/api/orders', { items: BASKET }); orderId = o.j.order.id;
  const w = await post('/webhooks/delivery-confirmed', { order_id: orderId, event_id: 'e1' });
  assert.equal(w.j.status, 'created'); sessionId = w.j.session_id; assert.ok(sessionId);
});

await t('D4: duplicate webhook (same event_id) is ignored', async () => {
  const w = await post('/webhooks/delivery-confirmed', { order_id: orderId, event_id: 'e1' });
  assert.equal(w.j.status, 'duplicate_ignored');
});

await t('D4: re-delivery without event_id does not create a 2nd session', async () => {
  const w = await post('/webhooks/delivery-confirmed', { order_id: orderId });
  assert.equal(w.j.status, 'session_exists'); assert.equal(w.j.session_id, sessionId);
});

await t('plan: full B/L/D, coverage >= 2 days, dinner present', async () => {
  const { j } = await get('/api/basket-sessions/latest');
  assert.ok(j.brief.coverage.days >= 2);
  assert.ok(j.brief.coverage.slots.includes('dinner'));
  assert.ok(j.brief.plan.every(d => d.meals.some(m => m.slot === 'dinner')));
});

await t('matcher: no meal repeats within a single day', async () => {
  const { j } = await get('/api/basket-sessions/latest');
  for (const d of j.brief.plan) {
    const names = d.meals.map(m => m.name);
    assert.equal(new Set(names).size, names.length, 'repeat on ' + d.label);
  }
});

await t('shelf groups: perishable Titus fish is in the 2-day group', async () => {
  const { j } = await get('/api/basket-sessions/latest');
  const red = j.brief.shelf_groups.find(g => g.level === 'red');
  assert.ok(red && red.items.some(i => /titus/i.test(i.name)));
});

await t('security: another user gets 404 on the session (IDOR)', async () => {
  const { status } = await get('/api/basket-sessions/' + sessionId, 'u_intruder');
  assert.equal(status, 404);
});

await t('reminder + scheduler fires it (durable, idempotent)', async () => {
  const r = await post('/api/reminders', { basket_session_id: sessionId, archetype_id: 'ARC-01', meal_name: 'Egusi soup', demo_seconds: -1 });
  const tick = await post('/api/dev/tick', {});
  assert.ok(tick.j.fired >= 1);
  const list = await get('/api/reminders'); const fired = list.j.find(x => x.id === r.j.reminder.id);
  assert.equal(fired.state, 'fired');
  // second tick must NOT re-fire it
  const again = await post('/api/dev/tick', {});
  const list2 = await get('/api/reminders'); assert.equal(list2.j.find(x => x.id === r.j.reminder.id).state, 'fired');
});

await t('"Did you cook? yes" records cooking + completion metric', async () => {
  const list = await get('/api/reminders'); const rid = list.j[0].id;
  await post('/api/reminders/' + rid + '/cooked', { value: 'yes' });
  const m = await get('/api/metrics'); assert.ok(m.j.cooking_confirmed_yes >= 1); assert.ok(m.j.reminder_completed >= 1);
});

await t('digital fridge: built from history, Spinach is expired', async () => {
  const { j } = await get('/api/fridge');
  assert.ok(j.entries.length > 0);
  assert.ok(j.entries.some(e => /spinach/i.test(e.name) && e.state === 'expired'));
});

await t('D5 kill switch: disabled -> delivery makes no plan', async () => {
  await post('/api/admin/kill', { enabled: false });
  const o = await post('/api/orders', { items: BASKET });
  const w = await post('/webhooks/delivery-confirmed', { order_id: o.j.order.id, event_id: 'e2' });
  assert.equal(w.j.status, 'feature_disabled');
  await post('/api/admin/kill', { enabled: true });
});

// ---------- round 2: quantity honesty, learning loop, swap, recipe v2 ----------
await t('R2 coverage: days computed from real basket quantity (not recipe count)', async () => {
  const { j } = await get('/api/basket-sessions/latest');
  assert.ok(/main-meal item/.test(j.brief.coverage.basis), 'basis names the food quantity');
  assert.ok(j.brief.coverage.main_items >= 1);
  assert.ok(Array.isArray(j.brief.basket_items) && j.brief.basket_items.length > 0);
});

await t('R2 swap: each main meal carries alternates to swap to', async () => {
  const { j } = await get('/api/basket-sessions/latest');
  const mains = j.brief.plan.flatMap(d => d.meals).filter(m => m.slot === 'lunch' || m.slot === 'dinner');
  assert.ok(mains.length && mains.every(m => Array.isArray(m.alts)));
});

await t('R2 regression: a day-1 surprise never duplicates lunch == dinner', async () => {
  // minimal basket whose pool is exactly [jollof, jambalaya(surprise)] — the case
  // that exposed the surprise-override double-add bug.
  const items = ['rice', 'tomato', 'pepper', 'onion', 'beef'].map(id => ({ product_id: id, qty: 1 }));
  const o = await post('/api/orders', { items }, 'u_surprise');
  const w = await post('/webhooks/delivery-confirmed', { order_id: o.j.order.id, event_id: 'e_surprise' }, 'u_surprise');
  const { j } = await get('/api/basket-sessions/' + w.j.session_id, 'u_surprise');
  for (const d of j.brief.plan) {
    const mains = d.meals.filter(m => m.slot === 'lunch' || m.slot === 'dinner').map(m => m.name);
    assert.equal(new Set(mains).size, mains.length, 'same-day repeat on ' + d.label);
  }
  assert.ok(j.brief.plan.length >= 2);
});

await t('R2 recipe v2: difficulty.score, honest time invariant, explicit egusi prep', async () => {
  const { j } = await get('/api/archetypes/ARC-01');
  assert.ok(j.difficulty && j.difficulty.score >= 1 && j.difficulty.drivers.length);
  assert.equal(j.time.total_min, j.time.prep_min + j.time.active_cook_min + j.time.passive_min);
  const egusi = j.ingredients.find(i => /egusi/i.test(i.item));
  assert.ok(egusi && /ground/i.test(egusi.prep), 'egusi ingredient says to grind it');
});

await t('R2 fridge depletes when a meal is confirmed cooked', async () => {
  const { j } = await get('/api/fridge');
  assert.ok(j.consumed_units >= 1, 'cooking earlier consumed at least one unit');
});

await t('R2 learning loop: a thumbs-down dish is down-ranked in the next plan', async () => {
  const items = ['rice', 'tomato', 'pepper', 'onion', 'beef'].map(id => ({ product_id: id, qty: 1 }));
  const o1 = await post('/api/orders', { items }, 'u_learn');
  const w1 = await post('/webhooks/delivery-confirmed', { order_id: o1.j.order.id, event_id: 'l1' }, 'u_learn');
  const s1 = await get('/api/basket-sessions/' + w1.j.session_id, 'u_learn');
  const firstLunch = s1.j.brief.plan[0].meals.find(m => m.slot === 'lunch').archetype_id;
  
  await post('/api/feedback', { session_id: w1.j.session_id, archetype_id: firstLunch, value: 'down' }, 'u_learn');

  const o2 = await post('/api/orders', { items }, 'u_learn');
  const w2 = await post('/webhooks/delivery-confirmed', { order_id: o2.j.order.id, event_id: 'l2' }, 'u_learn');
  const s2 = await get('/api/basket-sessions/' + w2.j.session_id, 'u_learn');
  
  const newFirstLunch = s2.j.brief.plan[0].meals.find(m => m.slot === 'lunch').archetype_id;

  assert.notEqual(newFirstLunch, firstLunch, 'disliked dish should not lead the next plan');
});

// ---------- round 3: inventory augments, pantry staples, day-of-week + video ----------
await t('R3 buying more AUGMENTS the plan (does not wipe prior inventory)', async () => {
  const A = ['rice', 'beef', 'tomato', 'onion', 'pepper'].map(id => ({ product_id: id, qty: 1 }));
  const oa = await post('/api/orders', { items: A }, 'u_aug');
  const wa = await post('/webhooks/delivery-confirmed', { order_id: oa.j.order.id, event_id: 'a1' }, 'u_aug');
  const p1 = await get('/api/basket-sessions/' + wa.j.session_id, 'u_aug');
  const B = ['egusi', 'ugu', 'crayfish'].map(id => ({ product_id: id, qty: 1 }));
  const ob = await post('/api/orders', { items: B }, 'u_aug');
  const wb = await post('/webhooks/delivery-confirmed', { order_id: ob.j.order.id, event_id: 'a2' }, 'u_aug');
  const p2 = await get('/api/basket-sessions/' + wb.j.session_id, 'u_aug');
  const ids2 = p2.j.brief.basket_items.map(i => i.id);
  assert.ok(ids2.includes('rice') && ids2.includes('beef'), 'order A items still present after order B');
  assert.ok(ids2.includes('egusi') && ids2.includes('ugu'), 'order B items added');
  assert.ok(p2.j.brief.basket_items.length >= p1.j.brief.basket_items.length + 2, 'inventory grew, not replaced');
});

await t('R3 pantry staples unlock oil-based dishes (egusi soup matchable)', async () => {
  const items = ['egusi', 'ugu', 'crayfish'].map(id => ({ product_id: id, qty: 1 }));
  const o = await post('/api/orders', { items }, 'u_pantry');
  const w = await post('/webhooks/delivery-confirmed', { order_id: o.j.order.id, event_id: 'p1' }, 'u_pantry');
  const { j } = await get('/api/basket-sessions/' + w.j.session_id, 'u_pantry');
  const names = j.brief.plan.flatMap(d => d.meals).map(m => m.name.toLowerCase());
  assert.ok(names.some(n => /egusi/.test(n)), 'egusi soup appears thanks to assumed palm oil');
});

await t('R3 day-of-week context + per-meal video query present', async () => {
  const { j } = await get('/api/basket-sessions/latest');
  const d0 = j.brief.plan[0];
  assert.ok(d0.day_note && d0.dow_short, 'each day carries weekday context');
  assert.ok(j.brief.plan.flatMap(d => d.meals).every(m => m.video_query), 'every meal has a video query');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
