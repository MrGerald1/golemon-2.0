import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db, migrate, now, uuid } from './db.js';
import { CATALOG } from './data/catalog.js';
import { seedIfEmpty } from './seed.js';
import { generatePlan } from './services/planGenerator.js';
import { inferPersona } from './services/persona.js';
import { archetypeById } from './services/archetypes.js';
import { buildFridge, inventoryForPlan } from './services/fridge.js';
import { track, funnel } from './services/analytics.js';
import { startScheduler, tick } from './services/scheduler.js';
import { currentUser, getOwnedSession } from './services/auth.js';
import { featureEnabled, setConfig, getConfig, EXPIRY_HOURS } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
migrate();
seedIfEmpty();
startScheduler();

// If a user has delivered inventory but no plan yet, generate one from their kitchen so
// the app never opens to an empty meal plan when they already "have food in the house".
function ensureStartingPlan(userId) {
  const has = db.prepare('SELECT 1 FROM basket_sessions WHERE user_id=?').get(userId);
  if (has) return;
  const order = db.prepare("SELECT * FROM orders WHERE user_id=? AND status='delivered' ORDER BY delivered_at DESC LIMIT 1").get(userId);
  if (order) generateSessionForOrder(order);
}

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

const PRODUCTS = new Map(CATALOG.map(p => [p.id, p]));
const hours = h => h * 3600000;

ensureStartingPlan('u_demo'); // open the app to an existing week, built from existing inventory

// ---------- health / kill switch ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, feature_enabled: featureEnabled() }));
app.post('/api/admin/kill', (req, res) => {
  setConfig('golemon_food_prep_enabled', req.body.enabled === false ? 'false' : 'true');
  res.json({ feature_enabled: featureEnabled() });
});

// ---------- shop ----------
app.get('/api/products', (_req, res) =>
  res.json(CATALOG.map(p => ({ id: p.id, name: p.name, unit: p.unit, price: p.price, was: p.was, taxonomy: p.taxonomy, emoji: p.emoji, tint: p.tint }))));

app.post('/api/orders', (req, res) => {
  const user = currentUser(req);
  const items = (req.body.items || []).filter(i => PRODUCTS.has(i.product_id));
  if (!items.length) return res.status(400).json({ error: 'empty_order' });
  const subtotal = items.reduce((n, i) => n + PRODUCTS.get(i.product_id).price * (i.qty || 1), 0);
  const prep = items.filter(i => i.prep).length * 100;
  const total = subtotal + prep + 500;
  const id = 'GL-' + Math.floor(10000 + Math.random() * 89999);
  db.prepare('INSERT INTO orders(id,user_id,status,total,item_count,created_at) VALUES(?,?,?,?,?,?)')
    .run(id, user.id, 'placed', total, items.reduce((n, i) => n + (i.qty || 1), 0), now());
  const ins = db.prepare('INSERT INTO order_items(order_id,product_id,qty,prep) VALUES(?,?,?,?)');
  for (const i of items) ins.run(id, i.product_id, i.qty || 1, i.prep ? 'dice' : null);
  res.json({ order: { id, total, item_count: items.length } });
});

// ---------- webhook: delivery-confirmed (D4 idempotent, D2 persist, D5 kill switch) ----------
app.post('/webhooks/delivery-confirmed', (req, res) => {
  const { order_id, event_id } = req.body;
  // belt-and-braces idempotency on the provider event id
  if (event_id) {
    const seen = db.prepare('SELECT 1 FROM processed_webhooks WHERE event_id=?').get(event_id);
    if (seen) return res.json({ status: 'duplicate_ignored' });
    db.prepare('INSERT INTO processed_webhooks(event_id,ts) VALUES(?,?)').run(event_id, now());
  }
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(order_id);
  if (!order) return res.status(404).json({ error: 'order_not_found' });

  // mark delivered (idempotent)
  if (order.status !== 'delivered') {
    db.prepare('UPDATE orders SET status=?, delivered_at=? WHERE id=?').run('delivered', now(), order_id);
    db.prepare('UPDATE users SET completed_order_count = completed_order_count + 1 WHERE id=?').run(order.user_id);
  }
  if (!featureEnabled()) return res.json({ status: 'feature_disabled' }); // kill switch: deliver, but no plan

  // D4: one session per order
  const existing = db.prepare('SELECT id FROM basket_sessions WHERE order_id=?').get(order_id);
  if (existing) return res.json({ status: 'session_exists', session_id: existing.id });

  const session = generateSessionForOrder(order);
  res.json({ status: 'created', session_id: session.id });
});

function learnedPrefs(userId) {
  // disliked: thumbs-down across this user's prior sessions
  const disliked = new Set();
  for (const row of db.prepare('SELECT thumbs_feedback FROM basket_sessions WHERE user_id=?').all(userId)) {
    const fb = JSON.parse(row.thumbs_feedback || '{}');
    for (const [aid, v] of Object.entries(fb)) if (v === 'down') disliked.add(aid);
  }
  // cooked: dishes the user confirmed making (up-rank). reminders set but never confirmed
  // (cooking_confirmed = 0) count as a soft dislike — we won't push those first.
  const cooked = new Set();
  for (const r of db.prepare('SELECT archetype_id, cooking_confirmed FROM cook_reminders WHERE user_id=?').all(userId)) {
    if (r.cooking_confirmed === 1) cooked.add(r.archetype_id);
    else if (r.cooking_confirmed === 0) disliked.add(r.archetype_id);
  }
  return { disliked, cooked };
}

function generateSessionForOrder(order) {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(order.user_id);
  // Build the plan from the user's WHOLE current kitchen (this order is already marked
  // delivered, so it's in the inventory), not just this order. New purchases augment the
  // plan; previously-delivered, un-cooked items still count. Falls back to the order's
  // items if the inventory view is somehow empty.
  let items = inventoryForPlan(order.user_id);
  if (!items.length) {
    const rows = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id=?').all(order.id);
    items = rows.map(r => ({ product: PRODUCTS.get(r.product_id), qty: r.qty })).filter(i => i.product);
  }
  const { persona } = inferPersona(user);
  const brief = generatePlan(items, { persona, prefs: learnedPrefs(order.user_id), startDow: new Date().getDay() });
  const id = uuid();
  const created = now();
  const expires = new Date(Date.now() + hours(EXPIRY_HOURS)).toISOString();
  db.prepare(`INSERT INTO basket_sessions(id,user_id,order_id,persona,brief_json,created_at,expires_at)
              VALUES(?,?,?,?,?,?,?)`).run(id, user.id, order.id, persona, JSON.stringify(brief), created, expires);
  track('basket_session_created', { session_id: id, order_id: order.id, persona, days: brief.coverage.days }, user.id);
  return { id, brief };
}

// ---------- basket sessions ----------
app.get('/api/basket-sessions/latest', (req, res) => {
  const user = currentUser(req);
  const s = db.prepare('SELECT * FROM basket_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 1').get(user.id);
  if (!s) return res.status(404).json({ error: 'no_session' });
  res.json(renderSession(s, user, true));
});

app.get('/api/basket-sessions/:id', (req, res) => {
  const user = currentUser(req);
  const s = getOwnedSession(req.params.id, user.id); // IDOR -> 404
  if (!s) return res.status(404).json({ error: 'not_found' });
  res.json(renderSession(s, user, true));
});

function renderSession(s, user, countOpen) {
  // 48h expiry (D11A)
  if (new Date(s.expires_at).getTime() < Date.now()) {
    return { expired: true, copy: 'This meal plan expired. Your next delivery will come with a fresh one 🍋' };
  }
  if (countOpen) track('basket_brief_opened', { session_id: s.id }, user.id);
  // "Did you cook?" prompt: a PRIOR session's reminder that was never confirmed
  const prompt = db.prepare(`
    SELECT cr.id, cr.meal_name FROM cook_reminders cr
    JOIN basket_sessions bs ON bs.id = cr.basket_session_id
    WHERE cr.user_id=? AND cr.cooking_confirmed IS NULL AND bs.id != ? AND bs.asked_did_you_cook=0
    ORDER BY cr.created_at DESC LIMIT 1`).get(user.id, s.id);
  return {
    id: s.id, persona: s.persona, created_at: s.created_at, expires_at: s.expires_at,
    brief: JSON.parse(s.brief_json),
    did_you_cook: prompt ? { reminder_id: prompt.id, meal_name: prompt.meal_name } : null,
  };
}

// ---------- reminders ----------
app.post('/api/reminders', (req, res) => {
  const user = currentUser(req);
  const { basket_session_id, archetype_id, meal_name, demo_seconds } = req.body;
  const s = getOwnedSession(basket_session_id, user.id);
  if (!s) return res.status(404).json({ error: 'not_found' });
  // demo: fire shortly so the loop is observable; production uses the 6:30pm pick
  const remindAt = new Date(Date.now() + (demo_seconds ?? 10) * 1000).toISOString();
  const id = uuid();
  db.prepare(`INSERT INTO cook_reminders(id,user_id,basket_session_id,meal_name,archetype_id,remind_at,state,deep_link,created_at,updated_at)
              VALUES(?,?,?,?,?,?, 'pending', ?,?,?)`)
    .run(id, user.id, basket_session_id, meal_name, archetype_id, remindAt, `/basket-sessions/${basket_session_id}/cook`, now(), now());
  track('reminder_set', { session_id: basket_session_id, meal_name, archetype_id }, user.id);
  res.json({ reminder: { id, remind_at: remindAt } });
});

app.get('/api/reminders', (req, res) => {
  const user = currentUser(req);
  res.json(db.prepare('SELECT * FROM cook_reminders WHERE user_id=? ORDER BY created_at DESC').all(user.id));
});

app.post('/api/reminders/:id/cooked', (req, res) => {
  const user = currentUser(req);
  const r = db.prepare('SELECT * FROM cook_reminders WHERE id=? AND user_id=?').get(req.params.id, user.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  const yes = req.body.value === 'yes';
  db.prepare('UPDATE cook_reminders SET cooking_confirmed=?, state=?, updated_at=? WHERE id=?')
    .run(yes ? 1 : 0, yes ? 'completed' : r.state, now(), r.id);
  db.prepare('UPDATE basket_sessions SET asked_did_you_cook=1 WHERE id=?').run(r.basket_session_id);
  track('cooking_confirmed', { session_id: r.basket_session_id, meal_name: r.meal_name, archetype_id: r.archetype_id, value: yes ? 'yes' : 'no' }, user.id);
  if (yes) track('reminder_completed', { session_id: r.basket_session_id, meal_name: r.meal_name }, user.id);
  const cooked = db.prepare("SELECT COUNT(*) n FROM cook_reminders WHERE user_id=? AND cooking_confirmed=1").get(user.id).n;
  res.json({ ok: true, meals_cooked: cooked });
});

// ---------- thumbs feedback ----------
app.post('/api/feedback', (req, res) => {
  const user = currentUser(req);
  const { session_id, archetype_id, value } = req.body;
  const s = getOwnedSession(session_id, user.id);
  if (!s) return res.status(404).json({ error: 'not_found' });
  const fb = JSON.parse(s.thumbs_feedback || '{}'); fb[archetype_id] = value;
  db.prepare('UPDATE basket_sessions SET thumbs_feedback=? WHERE id=?').run(JSON.stringify(fb), session_id);
  track('thumbs_feedback', { session_id, archetype_id, value }, user.id);
  res.json({ ok: true });
});

// ---------- recipe detail ----------
app.get('/api/archetypes/:id', (req, res) => {
  const a = archetypeById(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  res.json(a);
});

// ---------- digital fridge ----------
app.get('/api/fridge', (req, res) => {
  const user = currentUser(req);
  res.json(buildFridge(user.id));
});

// ---------- metrics / debug ----------
app.get('/api/metrics', (_req, res) => res.json(funnel()));
app.post('/api/dev/tick', (_req, res) => res.json({ fired: tick() })); // force scheduler tick (tests)

const PORT = process.env.PORT || 4317;
app.listen(PORT, () => console.log(`GoLemon Food Prep running -> http://localhost:${PORT}  (feature: ${getConfig('golemon_food_prep_enabled', 'true')})`));
