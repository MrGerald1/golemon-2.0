# GoLemon Food Prep — Documentation

Post-order meal-planning for the GoLemon grocery app. When a basket is delivered,
GoLemon turns it into a full week of breakfast / lunch / dinner (+ dessert), tells the
cook exactly how to make each dish, reminds them to cook, and learns what they like.

This folder is the complete documentation set. It follows the **Diátaxis** framework —
four kinds of docs for four reader needs. Pick by what you're trying to do:

| I want to… | Read |
|------------|------|
| **Learn the whole thing hands-on**, from clone to a working meal plan | [tutorial.md](tutorial.md) — Tutorial |
| **Do a specific task** (add a product, add a recipe, wire images, flip the kill switch) | [howto.md](howto.md) — How-to guides |
| **Look up exact facts** (API endpoints, data model, recipe schema, config) | [reference.md](reference.md) — Reference |
| **Understand why it's built this way** (architecture, decisions, trade-offs) | [explanation-architecture.md](explanation-architecture.md) — Explanation |

## 30-second orientation

- **Stack:** Node 24 (built-in `node:sqlite`), Express, a vanilla-JS single-page frontend. No build step, no framework, no external DB.
- **Entry point:** [`src/server.js`](../src/server.js) starts the HTTP server on port `4317`.
- **The core loop:** shop → place order → delivery webhook → meal plan generated from your **whole kitchen inventory** → open a recipe → Cook Mode + reminder → "Did you cook?" → the plan learns.
- **Run it:** `npm install && npm start`, then open `http://localhost:4317`.
- **Test it:** `npm test` (runs the recipe validator, then the suite — 21 tests at time of writing).

## Where things live

```
golemon-foodprep/
├── src/
│   ├── server.js            HTTP server + all API routes + webhook
│   ├── db.js                SQLite connection + schema (migrate())
│   ├── config.js            constants + the D5 kill switch
│   ├── seed.js              first-run seed (catalog, demo user, existing kitchen)
│   ├── data/
│   │   ├── catalog.js                 the product catalog (the SKU→category map, D1)
│   │   ├── shelf-life.json            shelf-life per category (StillTasty + NG overrides)
│   │   ├── archetypes-mains.json      15 lunch/dinner recipes (schema v2)
│   │   ├── archetypes-breakfast.json  14 breakfast recipes (schema v2)
│   │   ├── archetypes-dessert.json    8 dessert recipes (schema v2)
│   │   └── stilltasty-extracted.jsonl raw shelf-life extraction (provenance)
│   └── services/
│       ├── planGenerator.js  builds the weekly plan from inventory (the brain)
│       ├── fridge.js         the digital fridge + inventory-for-plan
│       ├── shelfLife.js      shelf-life lookup + urgency level
│       ├── archetypes.js     loads + indexes the recipe library
│       ├── persona.js        household-size inference (portion scaling)
│       ├── scheduler.js      durable reminder firing
│       ├── analytics.js      event tracking + funnel metrics
│       └── auth.js           x-user-id principal + IDOR guard
├── scripts/
│   ├── validate-recipes.mjs       build-time recipe invariant checker
│   ├── extract-stilltasty.mjs     shelf-life extraction pipeline
│   └── build-shelf-life.mjs       normalizes extraction → shelf-life.json
├── public/
│   ├── index.html           the SPA shell + base CSS
│   └── app.js               the entire frontend (router, screens, Cook Mode)
├── test/run.mjs             end-to-end + unit tests
└── docs/                    you are here
```

## Glossary (terms used throughout)

- **Archetype** — a recipe template in the library (e.g. `ARC-01` Egusi soup). The plan is assembled from archetypes that the kitchen's ingredients can make.
- **recipe_category** — an abstract ingredient slot a recipe needs (e.g. `egusi_seeds`, `any_protein`). Products carry the recipe_categories they satisfy. Matching is category-based, not product-based.
- **shelf_category** — a product's shelf-life class (e.g. `fresh_protein_fish`), used for the fridge countdown and "cook this first" urgency.
- **Basket session** — one generated meal plan, persisted as a JSON snapshot, tied to one order.
- **Brief** — the JSON payload of a plan (coverage, shelf groups, the day-by-day grid).
- **Inventory** — everything the user has had delivered, minus what they've cooked, minus what's expired. The plan is generated from this, not from a single order.
- **Pantry staples** — oils/salt/stock assumed always present so oil-based recipes can match.
- **Family** — the coarse type of a main dish (rice / soup / beans / yam / plantain / pasta), used to keep the week varied.
