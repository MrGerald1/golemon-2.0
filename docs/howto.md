# How-to guides — GoLemon Food Prep

Task-oriented recipes. Each assumes you've run the app once (see [tutorial.md](tutorial.md))
and know the basics. For exact field definitions, see [reference.md](reference.md).

All shell commands are run from the `golemon-foodprep/` directory. On Windows use PowerShell;
the commands shown are cross-platform unless noted.

---

## How to run the app locally

**Prerequisites:** Node 24+ (`node --version` must be ≥ 24 — the app uses built-in `node:sqlite`).

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
   Expected output:
   ```
   Seeded catalog, demo user, and fridge history.
   GoLemon Food Prep running -> http://localhost:4317  (feature: true)
   ```
3. Open `http://localhost:4317` in a browser.

**Verification:** the Shop page loads with products, and clicking **Meal plan** shows an
existing week (the demo user is seeded with a stocked kitchen).

**Troubleshooting:**
- `ReferenceError: DatabaseSync is not defined` or SQLite errors → your Node is < 24. Upgrade.
- Port in use → `PORT=4400 npm start` (PowerShell: `$env:PORT=4400; npm start`).

---

## How to reset to a clean state

The database is a single file. Deleting it triggers a fresh seed on next start.

1. Stop the server.
2. Delete the DB:
   ```bash
   rm -f golemon.db golemon.db-wal golemon.db-shm
   ```
   PowerShell: `Remove-Item golemon.db* -Force`
3. Start again: `npm start`.

**Verification:** the log prints `Seeded catalog, demo user, and fridge history.` again.

**Troubleshooting:** "Device or resource busy" / "file in use" → the server (or a preview
process) still holds the file. Stop it first, then delete.

---

## How to run the tests and the recipe validator

1. Validate recipes only (fast, no server):
   ```bash
   npm run validate
   ```
   Expected: `✓ Recipe Trust Engine: all 37 recipes pass (honest time + explicit prep).`
2. Full suite (validator runs first via `pretest`):
   ```bash
   npm test
   ```
   Expected: a list of `✓` lines ending in `N passed, 0 failed`.

**Verification:** exit code 0. Any recipe invariant violation prints the exact rule broken and
exits 1.

**Troubleshooting:** the suite starts the app on port `4319` against a throwaway DB in your temp
dir — it won't touch `golemon.db`. If port 4319 is busy, stop the conflicting process.

---

## How to add a new product to the catalog

1. Open [`src/data/catalog.js`](../src/data/catalog.js).
2. Add an entry to the `CATALOG` array. Every field matters:
   ```js
   { id: 'titus',                      // unique, lowercase, no spaces
     name: 'Titus fish', unit: '1kg', price: 3500, was: 0,   // was>0 = discounted "Misfit"
     taxonomy: 'Proteins',            // shop chip group (Fresh produce/Proteins/Grains/Pantry/Bakery)
     shelf_category: 'fresh_protein_fish',   // MUST exist in shelf-life.json (else 3-day fallback)
     recipe_categories: ['any_protein'],     // which recipe slots this fills
     emoji: '🐟', tint: 'var(--t-blue)' }    // fallback tile + background tint
   ```
3. (Optional) Add a real photo: in [`public/app.js`](../public/app.js) add to the `PIMG` map:
   `titus: TMDB('Fish'),` (or any image URL). Without it, the emoji tile is used.
4. Reset the DB (products are seeded once) — see "How to reset" above.

**Verification:** restart, open Shop, find the product; add it to a basket and check out.

**Troubleshooting:**
- Product shows but never appears in any recipe → its `recipe_categories` don't match any
  archetype's `required_categories`. Cross-check against the recipe JSON.
- Fridge shows it as "Use within 3 days" regardless → its `shelf_category` isn't in
  `shelf-life.json`; add an entry or reuse an existing category.

---

## How to add a new recipe

1. Pick the right file by slot: `archetypes-mains.json` (lunch/dinner), `-breakfast.json`, or `-dessert.json` in [`src/data/`](../src/data/).
2. Add an object following the v2 schema exactly (see [reference §5](reference.md#5-recipe-schema-v2)). Copy an existing recipe as a template. Non-negotiables:
   - `required_categories` must all be satisfiable by real catalog products (or the pantry staples `palm_oil` / `cooking_oil`), or the recipe will never match.
   - **Time must add up:** `prep_min + active_cook_min + passive_min === total_min`, and `total_min` ≥ the sum of every `steps[].duration_min`.
   - Set the mirrors: `active_minutes = total_min`, `difficulty_dots = difficulty.score`.
   - Every ingredient that needs prep gets a `prep` string (mandatory for egusi/ogbono/cocoyam/bitter leaf).
   - Every step needs `action` (and should have `cue`; `why`/`watch_out` strongly encouraged).
3. Validate:
   ```bash
   npm run validate
   ```
   Fix anything it reports — it names the exact rule and recipe.

**Verification:** `npm run validate` passes, then reset the DB, deliver a basket that contains
the recipe's ingredients, and confirm the dish appears in the plan or via `GET /api/archetypes/<id>`.

**Troubleshooting:**
- `total_min X != prep+active+passive Y` → fix the three time fields so they sum to `total_min`.
- `total_min X < sum(step durations) Y` → your stated time is less than the steps; raise `total_min` (usually by raising `passive_min`).
- Recipe never appears → a `required_categories` entry has no matching product; relax it to `optional_categories` or add the product.

---

## How to wire real product photos

The frontend renders a real `<img>` when a product id is in the `PIMG` map, else the emoji tile.

1. Open [`public/app.js`](../public/app.js), find `const PIMG = { … }`.
2. Add `id: 'https://…/photo.png',` for each product. Prefer clean product-on-white images.
   For owned photography, drop files into `public/img/products/<id>.jpg` and use
   `id: 'img/products/<id>.jpg'`.
3. Hard-refresh the browser (frontend is static; no rebuild).

**Verification:** the Shop tile shows the photo. A broken/missing URL silently falls back to
the emoji (the `<img>` `onerror` handles it) — nothing breaks.

**Note:** Nigerian-specific SKUs (ugu, egusi, kpomo, agege bread…) have no reliable
free-licensed photo; they need GoLemon's own/supplier shots. See [TODOS.md](../TODOS.md).

---

## How to flip the kill switch (stop plan generation)

1. Turn the feature off:
   ```bash
   curl -X POST http://localhost:4317/api/admin/kill \
     -H 'Content-Type: application/json' -d '{"enabled":false}'
   ```
2. Turn it back on: send `{"enabled":true}`.

**Verification:** `GET /api/health` reports `feature_enabled`. While off, a delivery webhook
returns `{"status":"feature_disabled"}` and no plan is created (the order still delivers).

---

## How to test the full flow from the API (no browser)

All calls need the `x-user-id` header. Using `u_demo`:

```bash
H='-H Content-Type:application/json -H x-user-id:u_demo'
# 1. place an order
curl -s $H -X POST localhost:4317/api/orders \
  -d '{"items":[{"product_id":"rice","qty":1},{"product_id":"beef","qty":1},{"product_id":"tomato","qty":1},{"product_id":"onion","qty":1},{"product_id":"pepper","qty":1}]}'
# → {"order":{"id":"GL-#####", ...}}  copy the id

# 2. confirm delivery (triggers plan generation)
curl -s $H -X POST localhost:4317/webhooks/delivery-confirmed \
  -d '{"order_id":"GL-#####","event_id":"evt-1"}'
# → {"status":"created","session_id":"..."}

# 3. read the plan
curl -s $H localhost:4317/api/basket-sessions/latest
```

**Verification:** step 3 returns a `brief` with a 7-entry `plan` and `coverage.days ≥ 2`.

---

## How to make a reminder fire on demand (testing the loop)

The scheduler fires reminders whose `remind_at` is due. To trigger immediately:

1. Create a reminder with a past time:
   ```bash
   curl -s $H -X POST localhost:4317/api/reminders \
     -d '{"basket_session_id":"<id>","archetype_id":"ARC-01","meal_name":"Egusi soup","demo_seconds":-1}'
   ```
2. Force a scheduler tick:
   ```bash
   curl -s $H -X POST localhost:4317/api/dev/tick   # → {"fired":1}
   ```
3. Answer "Did you cook?":
   ```bash
   curl -s $H -X POST localhost:4317/api/reminders/<reminder_id>/cooked -d '{"value":"yes"}'
   ```

**Verification:** the reminder's `state` becomes `fired` then `completed`; `GET /api/fridge`
shows `consumed_units` increase as cooked items deplete.

---

## How to change the day-of-week character (e.g. make Friday a project day)

1. Open [`src/services/planGenerator.js`](../src/services/planGenerator.js), find the `DOW` array (one entry per weekday, index 0 = Sunday).
2. Edit the `note` (the human label shown on the day card) and `wants` (the bias key:
   `rice | easy | quick | treat | project`).
3. To change what a `wants` value *does*, edit `dowScore(a, wants)` just below `DOW`.

**Verification:** reset the DB, open Meal plan, check the target weekday's note and that its
dishes match the new character.

**Troubleshooting:** the order of days is anchored to the real current weekday (`new Date().getDay()`
in `generateSessionForOrder`), so "Today" is whatever day you run it.

---

## How to seed a different starting kitchen

1. Open [`src/seed.js`](../src/seed.js).
2. Edit the `histOrder(...)` calls. Each is `histOrder(id, daysAgo, [[productId, qty], …], total)`.
   Items delivered fewer days ago are fresher (and drive what's plannable today).
3. Reset the DB and restart.

**Verification:** open Meal plan / Fridge and confirm the new items and their freshness states.

**Troubleshooting:** if the plan is empty, your seeded kitchen has no main-meal items (a
protein + a carb). Add at least one of each.
