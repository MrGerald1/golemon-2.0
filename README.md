# GoLemon Food Prep

Working implementation of the Post-Order Accountability meal-plan system, built to the
CEO / engineering / design reviews. Real backend (Node + SQLite), real meal-plan engine,
real shelf-life data extracted from StillTasty, a digital fridge, reminders, and a
GoLemon-branded frontend driven entirely by the API.

## Documentation

Full docs are in [`docs/`](docs/) (Diátaxis: tutorial / how-to / reference / explanation).
Start at [docs/README.md](docs/README.md). Quick links:

- **New here?** [docs/tutorial.md](docs/tutorial.md) — clone to a working meal plan + cook loop.
- **Need to do X?** [docs/howto.md](docs/howto.md) — add a product/recipe, wire photos, kill switch, etc.
- **Need exact facts?** [docs/reference.md](docs/reference.md) — API, data model, recipe schema, config.
- **Why is it like this?** [docs/explanation-architecture.md](docs/explanation-architecture.md) — design + decisions + gaps.

## Run

```bash
npm install
npm start          # -> http://localhost:4317
```

Open the URL. Journey: **browse → add to basket → checkout → place order → "simulate
delivery" → meal plan → tap a meal → set a reminder → "Did you cook?" → lovemark**.
The **Fridge** tab shows the digital fridge (seeded with two past deliveries so it has
live expiry states on first load).

## What's real (not a prototype)

| Plan item | Where it lives |
|-----------|----------------|
| **D1 SKU→category mapping** (two-layer) | `src/data/catalog.js` — each product carries `shelf_category` (urgency) + `recipe_categories` (matching) |
| **D2 brief persisted at webhook** | `src/server.js` `generateSessionForOrder` → `basket_sessions.brief_json` |
| **D3 durable reminder scheduler** | `src/services/scheduler.js` — polls `(state, remind_at)`, idempotent fire |
| **D4 webhook idempotency** | `UNIQUE(order_id)` + `processed_webhooks` event-id guard in `src/server.js` |
| **D5 kill switch** | `config` table, `POST /api/admin/kill`, checked in the webhook |
| **IDOR auth (404 not 403)** | `src/services/auth.js` `getOwnedSession` |
| **48h deep-link expiry** | `renderSession` in `src/server.js` |
| **ENG-11 slot-filling matcher** | `src/services/planGenerator.js` — fills a day×slot grid, no same-day repeats, front-loads perishables |
| **ENG-12 coverage estimator** | `generatePlan` — days from real food **quantity** in the whole kitchen, scaled by persona, honest (no padding) |
| **Inventory-based planning** | plan built from `inventoryForPlan` (all delivered, un-cooked, un-expired) — buying more augments, cooking depletes |
| **Day-of-week context + variety** | `generatePlan` — Sunday rice / easy Mondays / weekend projects; no same-family main twice a day; learning loop re-ranks by thumbs + did-you-cook |
| **Recipe Trust Engine (schema v2)** | `archetypes-*.json` — first-class prep, decomposed honest time, scored difficulty, per-step cue/why/watch-out, rescue, level-up; `scripts/validate-recipes.mjs` enforces the invariants |
| **Cook Mode + per-meal video** | `public/app.js` — hands-free full-screen stepper with live per-step timers; YouTube search per dish |
| **ENG-15 StillTasty pipeline** | `scripts/extract-stilltasty.mjs` (headless extract) → `scripts/build-shelf-life.mjs` (normalize + Nigerian overrides) → `src/data/shelf-life.json` |
| **Persona inference** | `src/services/persona.js` |
| **Digital fridge (Approach B)** | `src/services/fridge.js` — built from order history, live expiry states |
| **Full B/L/D + dessert library** | `src/data/archetypes-{mains,breakfast,dessert}.json` (37 archetypes: 15 mains + 14 breakfast + 8 dessert, schema v2) |
| **8-event analytics + funnel metrics** | `src/services/analytics.js`, `GET /api/metrics` |
| **GoLemon brand + fonts** | `public/` — forest-green `#15431F`, lime `#CDEE63`, Plus Jakarta Sans + IBM Plex Sans |

## Shelf-life data pipeline (StillTasty)

StillTasty is JS-rendered, so a plain fetch fails. The pipeline drives a real headless
browser to render each item page and parse the Refrigerator / Pantry / Freezer durations,
then normalizes to day-counts and applies a **Nigerian food-ops override layer** (Lagos
reality differs: ugu wilts in ~2 days vs US spinach's 5-7; fresh fish ~1 day). Categories
StillTasty doesn't cover (crayfish, kpomo, palm oil, agege bread) come from Nigerian food
knowledge. Every entry records its `source` (`stilltasty`, `stilltasty+nigerian_override`,
or `nigerian_food_knowledge`) and the raw `st_raw` values for audit.

```bash
node scripts/extract-stilltasty.mjs   # re-extract from stilltasty.com (build-time only)
node scripts/build-shelf-life.mjs     # normalize + overrides -> src/data/shelf-life.json
```

Raw extraction evidence: `src/data/stilltasty-extracted.jsonl`. This runs at build time
only — the app never calls StillTasty at runtime.

## API

```
GET  /api/health                         feature flag state
GET  /api/products
POST /api/orders                         {items:[{product_id,qty,prep}]}
POST /webhooks/delivery-confirmed        {order_id,event_id}  (idempotent; generates the plan)
GET  /api/basket-sessions/latest         the generated plan (the meal plan)
GET  /api/basket-sessions/:id            IDOR-scoped; 48h expiry
POST /api/reminders                      {basket_session_id,archetype_id,meal_name,demo_seconds}
POST /api/reminders/:id/cooked           {value:"yes"|"no"}   (Did you cook? loop)
POST /api/feedback                       {session_id,archetype_id,value}  thumbs
GET  /api/fridge                         digital fridge (from order history)
GET  /api/archetypes/:id                 recipe detail
GET  /api/metrics                        funnel + leading/secondary/lagging rates
POST /api/admin/kill                     {enabled:bool}  kill switch
```

## Tests

```bash
node test/run.mjs
```

Exercises: webhook idempotency, IDOR 404, matcher slot-filling, coverage, the reminder
scheduler firing, the digital fridge states, and the kill switch.
