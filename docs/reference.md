# Reference — GoLemon Food Prep

Complete, factual description of the HTTP API, data model, recipe schema, configuration,
and runtime. Every claim here is traceable to source. For *why* it's shaped this way, see
[explanation-architecture.md](explanation-architecture.md). For *how to do things*, see
[howto.md](howto.md).

---

## 1. Runtime & configuration

| Thing | Value | Source |
|-------|-------|--------|
| Node version | 24+ (uses built-in `node:sqlite`, `crypto.randomUUID`) | — |
| HTTP port | `process.env.PORT` or `4317` | [server.js](../src/server.js) |
| Database file | `process.env.GL_DB` or `<repo>/golemon.db` (SQLite, WAL mode) | [db.js:10](../src/db.js) |
| Dependencies | `express` only | [package.json](../package.json) |

### Constants ([config.js](../src/config.js))

| Constant | Value | Meaning |
|----------|-------|---------|
| `PUSH_DELAY_MIN` | `30` | Reminder push fires 30 min after delivery-confirmed (design intent; the demo timer overrides via `demo_seconds`). |
| `EXPIRY_HOURS` | `48` | A meal plan (basket session) expires 48h after creation. |
| `DEFAULT_REMIND` | `'18:30'` | Default cook-reminder time (6:30 PM). |
| `SHELF_FALLBACK_DAYS` | `3` | Shelf life assumed when a product's `shelf_category` is not in `shelf-life.json`. |

### npm scripts ([package.json](../package.json))

| Command | Effect |
|---------|--------|
| `npm start` | `node src/server.js` — migrate, seed (if empty), generate the demo starting plan, start the server. |
| `npm run seed` | Run the seed standalone. |
| `npm run validate` | `node scripts/validate-recipes.mjs` — fail if any recipe violates the invariants. |
| `npm test` | `pretest` runs the validator, then `node test/run.mjs`. |

### Kill switch (D5)

Stored in the `config` table under key `golemon_food_prep_enabled` (`'true'` / `'false'`).
Read at runtime by `featureEnabled()`. When `false`, the delivery webhook still marks the
order delivered but generates **no** meal plan (returns `{status:'feature_disabled'}`).
Flip it via `POST /api/admin/kill` (see §2) — no redeploy needed.

---

## 2. HTTP API

**Authentication.** Every request carries the current user in the `x-user-id` header
(a stand-in for GoLemon's real session auth). Default is `u_demo`. On first touch the
user row is created automatically (`INSERT OR IGNORE`). A user can only read their own
basket sessions; another user's id returns **404** (not 403 — avoids enumeration).

All request and response bodies are JSON (`Content-Type: application/json`).

### Health & admin

#### `GET /api/health`
Returns `{ "ok": true, "feature_enabled": true }`.

#### `POST /api/admin/kill`
Body: `{ "enabled": false }` (any value other than `false` re-enables).
Returns `{ "feature_enabled": <bool> }`. Sets the D5 kill switch.

### Shop & ordering

#### `GET /api/products`
Returns the catalog as an array (image/recipe internals omitted):
```json
[{ "id":"beef", "name":"Beef", "unit":"1kg", "price":4500, "was":0,
   "taxonomy":"Proteins", "emoji":"🥩", "tint":"var(--t-peach)" }]
```

#### `POST /api/orders`
Body:
```json
{ "items": [ { "product_id":"beef", "qty":1, "prep":true } ] }
```
- `product_id` must exist in the catalog; unknown ids are dropped.
- `qty` defaults to 1. `prep:true` adds a ₦100/item prep fee and records a "dice" instruction.
- Empty/all-invalid items → **400** `{error:"empty_order"}`.
- Pricing: `total = sum(price*qty) + (prep_items * 100) + 500 delivery`.

Returns `{ "order": { "id":"GL-12345", "total":20500, "item_count":2 } }`.
The order is created with `status:"placed"`. **No meal plan exists yet** — that happens at delivery.

#### `POST /webhooks/delivery-confirmed`
The integration point GoLemon calls when a delivery completes. Body:
```json
{ "order_id":"GL-12345", "event_id":"evt-abc" }
```
- `event_id` is optional but recommended (provider-level idempotency).
- Marks the order `delivered`, sets `delivered_at`, increments the user's `completed_order_count`.
- If the kill switch is off → `{status:"feature_disabled"}` (delivered, no plan).
- Generates the meal plan **from the user's whole current inventory** and persists a basket session.

Response `status` is one of:

| status | HTTP | meaning |
|--------|------|---------|
| `created` | 200 | new session generated; `session_id` returned |
| `session_exists` | 200 | this order already has a session (D4); `session_id` returned |
| `duplicate_ignored` | 200 | this `event_id` was already processed |
| `feature_disabled` | 200 | kill switch off; delivered but no plan |
| `order_not_found` | 404 | no order with that id |

### Meal plan (basket sessions)

#### `GET /api/basket-sessions/latest`
The current user's most recent plan. `404 {error:"no_session"}` if none.

#### `GET /api/basket-sessions/:id`
A specific plan. `404 {error:"not_found"}` if missing **or not owned** (IDOR guard).

Both return the **session render** (see §3):
```json
{ "id":"...", "persona":"couple", "created_at":"...", "expires_at":"...",
  "brief": { ...the plan... },
  "did_you_cook": { "reminder_id":"...", "meal_name":"Egusi soup" } | null }
```
If the plan has expired (>48h): `{ "expired": true, "copy": "This meal plan expired…" }`.

### Reminders & the "Did you cook?" loop

#### `POST /api/reminders`
Body: `{ basket_session_id, archetype_id, meal_name, demo_seconds? }`.
- `404` if the session isn't owned by the user.
- `remind_at = now + (demo_seconds ?? 10) seconds`. **`demo_seconds` is a demo shortcut** so the loop is observable in seconds; production should set a real clock time (see [explanation](explanation-architecture.md#known-gaps)).
Returns `{ "reminder": { "id":"...", "remind_at":"ISO" } }`.

#### `GET /api/reminders`
All of the user's reminders (raw `cook_reminders` rows), newest first.

#### `POST /api/reminders/:id/cooked`
Body: `{ "value": "yes" | "no" }`. `404` if not owned.
- `yes` → marks `cooking_confirmed=1`, `state='completed'`, fires `reminder_completed` metric.
- `no` → `cooking_confirmed=0`.
- Either way sets `asked_did_you_cook=1` on the session.
Returns `{ "ok":true, "meals_cooked": <total confirmed for user> }`.

### Feedback (learning signal)

#### `POST /api/feedback`
Body: `{ session_id, archetype_id, value:"up"|"down" }`. `404` if not owned.
Stores into the session's `thumbs_feedback` JSON map. `down` votes down-rank that dish in
future plans (see §4 learning loop).

### Recipe detail

#### `GET /api/archetypes/:id`
Returns the full recipe archetype object (schema v2 — see §5). `404` if unknown.

### Digital fridge

#### `GET /api/fridge`
Returns the current user's fridge, built from delivery history and depleted by confirmed cooks:
```json
{ "counts": { "total":28, "expiring":2, "expired":1, "used":3 },
  "consumed_units": 9,
  "groups": [ { "state":"expired", "label":"Past its best", "items":[ … ] }, … ],
  "entries": [ { "product_id":"beef","name":"Beef","emoji":"🥩","qty":1,"remaining":1,
                 "categories":["any_protein","proteins_beef_or_kpomo"],
                 "shelf_category":"fresh_protein_meat","shelf_days":2,"source":"…",
                 "delivered_at":"ISO","days_left":2,"state":"soon" } ] }
```
`state` ∈ `expired | expiring | soon | fresh | used`. Group order is fixed (expired → expiring → soon → fresh → used), empty groups omitted.

### Metrics / dev

#### `GET /api/metrics`
Funnel counters from the `events` table (e.g. `reminder_set`, `cooking_confirmed_yes`, `reminder_completed`). Shape depends on recorded events.

#### `POST /api/dev/tick`
Forces one scheduler tick (fires due reminders). Returns `{ "fired": <n> }`. **Test/dev only.**

---

## 3. The brief (plan payload)

`brief` is produced by `generatePlan()` ([planGenerator.js](../src/services/planGenerator.js)) and stored in `basket_sessions.brief_json`.

```jsonc
{
  "coverage": {
    "days": 7,                  // how many days the food supports (2–7), from quantity
    "item_count": 23,           // total units in the kitchen
    "main_items": 11,           // count of "main-meal" items (drives days)
    "basis": "Based on the 11 main-meal items in your kitchen",
    "slots": ["breakfast","lunch","dinner","dessert"]
  },
  "first_hint": "Start with your Chicken & Catfish — freshest for the next 2 days…" | null,
  "shelf_groups": [             // "what to use first" urgency buckets
    { "level":"red",   "label":"Cook in the next 2 days", "items":[{"name":"Chicken","days":1}] },
    { "level":"amber", "label":"Use by day 5",            "items":[…] },
    { "level":"green", "label":"Pantry — no rush",        "items":[{"name":"Rice"}] }
  ],
  "basket_items": [             // inventory snapshot (used for the recipe have/need split)
    { "id":"beef","name":"Beef","emoji":"🥩","qty":1,"days":2,"categories":["any_protein", …] }
  ],
  "plan": [                     // one entry per day
    {
      "day":1, "label":"Today", "dow_short":"Mon",
      "day_note":"Back to work — keeping it easy", "today":true,
      "meals":[ <meal>, … ]
    }
  ],
  "matched_counts": { "breakfast":7, "lunch":9, "dinner":9, "dessert":7 }
}
```

### `<meal>` object
```jsonc
{
  "slot":"lunch", "slot_label":"Lunch",
  "archetype_id":"ARC-14", "name":"Nigerian jambalaya (rice with everything)",
  "minutes":60,             // total time (mirror of recipe.time.total_min)
  "difficulty":3,           // 1–5 (mirror of recipe.difficulty.score)
  "is_surprise":true, "surprise_note":"…" | null,
  "urgency_tag":"Chicken · 1 day" | null,   // most-perishable required item, if ≤5 days
  "alts":[ { "id":"ARC-02","name":"Jollof rice","minutes":65,"difficulty":2 } ],  // swap options
  "video_query":"Nigerian jambalaya (rice with everything)"  // → YouTube search
}
```

---

## 4. Plan generation logic ([planGenerator.js](../src/services/planGenerator.js))

`generatePlan(items, { persona, prefs, startDow })`:

- **items**: `[{ product, qty, days? }]`. `days` is real days-left from the fridge; falls back to full shelf life.
- **Coverage days**: `mainUnits` = count of items whose `recipe_categories` intersect `MAIN_CATS` (proteins, rice, beans, yam, sweet potato, plantain, pasta, noodles, egusi, ogbono, cocoyam, akamu, custard, flour, cereal). `days = clamp(2,7, round(mainUnits*4 / (2*personaScale)))`, and `0` if no lunch/dinner recipe can be made.
- **Pantry staples**: `palm_oil`, `cooking_oil` are always added to the matchable set so oil-based dishes match.
- **Matching**: an archetype is eligible if **every** `required_categories` entry is present in the kitchen (or pantry).
- **Per-day variety**: lunch and dinner must be different **families** (`mealFamily()` → rice / pasta / beans / soup / plantain / yam / other). No rice twice in a day.
- **Week spread**: never-used dishes first, then day-of-week fit, then least-used family, then most-perishable (front-loading).
- **Day-of-week character** (`DOW`): Sun=rice, Mon=easy, Tue–Thu=quick, Fri=treat, Sat=project. Each day gets a `day_note`.
- **Surprise meal**: an `is_surprise` archetype is placed on an early-week lunch (never if the user thumbs-downed it).
- **Learning loop** (`prefScore`): thumbs-down and never-cooked dishes rank last; confirmed-cooked dishes rank first.
- **Dessert**: rotates through matched desserts (no repeat until the pool is exhausted).
- **Breakfast**: rotates through matched breakfasts; never a main/rice dish.

`personaScale`: `solo 1 · couple 1.4 · family 2 · bulk 2.4` ([persona.js](../src/services/persona.js)).

---

## 5. Recipe schema (v2)

Each archetype in `archetypes-{mains,breakfast,dessert}.json`:

```jsonc
{
  "id": "ARC-01",
  "name": "Egusi soup",
  "meal_slot": "lunch",                // breakfast | lunch | dinner | dessert
  "serves": 4,
  "required_categories": ["egusi_seeds","fresh_leafy_green","palm_oil","dried_crayfish"],
  "optional_categories": ["proteins_beef_or_kpomo","fresh_pepper","onions"],
  "is_surprise": false,
  "surprise_note": "…",                // only when is_surprise
  "difficulty": {
    "score": 3,                        // 1–5 (1 Easy … 5 Advanced)
    "label": "Intermediate",
    "drivers": ["Egusi scorches fast if the heat is too high — it needs watching", …]
  },
  "time": {
    "prep_min": 12, "active_cook_min": 18, "passive_min": 40, "total_min": 70,
    "overlap_note": "Do the grinding while the meat boils…",
    "make_ahead": ["Grind the egusi","Boil the beef the night before…"]
  },
  "equipment": ["Blender","Two pots","Wooden spoon"],
  "ingredients": [
    { "item":"Egusi (melon seeds)", "qty":"2 cups",
      "prep":"Ground to a coarse powder. Buy pre-ground, or blend… You do NOT pour whole seeds in.",
      "substitutes": [] }
  ],
  "steps": [
    { "action":"Season the meat… and boil until tender. Keep the stock.",
      "duration_min":40,
      "cue":"A fork slides into the beef with no resistance.",     // doneness signal
      "why":"Tough beef won't soften in the soup later…",          // beginner layer
      "watch_out":"Start this first and do all the prep while it boils." }
  ],
  "doneness_signature": "Thick, nutty soup with soft egusi lumps, a film of red palm oil…",
  "rescue": [ { "problem":"The egusi tastes burnt", "fix":"There's no recovery… start the egusi step again." } ],
  "level_up": [ { "touch":"Smoky depth", "how":"Add stockfish or smoked fish while the meat boils." } ],
  "active_minutes": 70,    // MIRROR of time.total_min (planGenerator reads this)
  "difficulty_dots": 3     // MIRROR of difficulty.score
}
```

The loader ([archetypes.js](../src/services/archetypes.js)) adds a `slots` array (mains → `['lunch','dinner']`; breakfast/dessert → their own slot).

### Invariants enforced by `npm run validate` ([validate-recipes.mjs](../scripts/validate-recipes.mjs))
1. `time.total_min === prep_min + active_cook_min + passive_min`.
2. `time.total_min >= sum(steps[].duration_min)` — stated time can never be less than the steps. (This is the bug the validator exists to prevent.)
3. `active_minutes === time.total_min` and `difficulty_dots === difficulty.score` (mirrors stay in sync).
4. Any ingredient matching `egusi | ogbono | cocoyam | bitter leaf` MUST have a non-empty `prep` (no "pour in egusi" with no grind instruction).
5. Every step has non-empty `action`.

---

## 6. Data model (SQLite — [db.js](../src/db.js))

| Table | Key columns | Notes |
|-------|-------------|-------|
| `users` | `id` PK, `name`, `household_size_declared`, `completed_order_count`, `created_at` | Created on first `x-user-id` touch. |
| `products` | `id` PK, `name`,`unit`,`price`,`was`,`taxonomy`,`shelf_category`,`recipe_categories` (JSON array),`emoji`,`tint` | Seeded from `catalog.js`. |
| `orders` | `id` PK, `user_id`, `status` (`placed`/`delivered`), `total`,`item_count`,`created_at`,`delivered_at` | |
| `order_items` | `id` PK auto, `order_id`,`product_id`,`qty`,`prep` | `prep`=`'dice'` or null. |
| `basket_sessions` | `id` PK, `user_id`, `order_id` **UNIQUE** (D4), `persona`, `brief_json`, `thumbs_feedback` (JSON), `session_type`, `asked_did_you_cook`, `created_at`, `expires_at` | One plan per order. Indexed on `(user_id, created_at DESC)`. |
| `cook_reminders` | `id` PK, `user_id`,`basket_session_id`,`meal_name`,`archetype_id`,`remind_at`,`state` (`pending`/`fired`/`snoozed`/`completed`),`cooking_confirmed` (NULL/1/0),`deep_link`,`created_at`,`updated_at` | Indexed on `(state, remind_at)`. |
| `events` | `id` PK auto, `name`,`props` (JSON),`user_id`,`ts` | Analytics. |
| `processed_webhooks` | `event_id` PK, `ts` | Webhook idempotency. |
| `config` | `key` PK, `value` | Holds the kill switch. |

---

## 7. Catalog product shape ([catalog.js](../src/data/catalog.js))

```js
{ id:'beef', name:'Beef', unit:'1kg', price:4500, was:0,
  taxonomy:'Proteins',                          // coarse GoLemon node (shop chips)
  shelf_category:'fresh_protein_meat',          // → shelf-life.json (fridge urgency)
  recipe_categories:['any_protein','proteins_beef_or_kpomo'],  // → recipe matching
  emoji:'🥩', tint:'var(--t-peach)' }
```
This two-layer mapping (`shelf_category` for urgency, `recipe_categories` for matching) is decision **D1**. `was > 0` marks a discounted "Misfit" item.

Real product photos are wired in the frontend via the `PIMG` map in [app.js](../public/app.js)
(clean product-on-white images for universal SKUs; Nigerian-specific items fall back to the
tinted emoji tile until owned photography lands).

---

## 8. Shelf life ([shelf-life.json](../src/data/shelf-life.json), [shelfLife.js](../src/services/shelfLife.js))

Each entry is keyed by `shelf_category` with `shelf_days_fridge` / `shelf_days_ambient`, a
`source` (`stilltasty` / `stilltasty+override` / `nigeria`), and a `storage_note`. `shelfFor(product)`
returns `{ days, source, note }`, preferring fridge days, falling back to `SHELF_FALLBACK_DAYS` (3).
`levelFor(days)`: `≤2 → red`, `≤5 → amber`, else `green`. Provenance lives in
[stilltasty-extracted.jsonl](../src/data/stilltasty-extracted.jsonl).
