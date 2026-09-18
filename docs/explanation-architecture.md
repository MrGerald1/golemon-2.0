# Explanation — Architecture & design decisions

Why GoLemon Food Prep is built the way it is. If you're about to change it, read this first —
it explains the non-obvious choices so you don't undo them by accident. For exact facts, see
[reference.md](reference.md).

---

## The problem

A grocery app gets someone to *buy* food. It does nothing to make sure that food becomes
*meals*. The result: produce rots, the customer feels guilty, and the app gets blamed for
"wasting my money." The actual moment of truth is one person, one pot, 7pm — and most apps
abandon the user there.

GoLemon Food Prep owns that moment. The bet: if buying a basket automatically becomes a
trustworthy week of meals — with no extra effort — the customer cooks more, wastes less,
and reorders. The product is not the meal plan screen; **the product is the recipe the
person actually cooks.**

---

## The shape of the system

No framework, no build step, no external services. Node's built-in SQLite, Express, and a
single vanilla-JS file for the whole frontend. This is deliberate: the feature is a
self-contained vertical slice meant to be read end-to-end and dropped into GoLemon's real
backend later. You can understand the entire thing in an afternoon.

### End-to-end data flow

```
  SHOP                  ORDER                 DELIVERY (webhook)            PLAN
  ┌──────────┐  POST    ┌──────────┐  POST    ┌────────────────────┐  read ┌──────────────┐
  │ /products│ ───────▶ │ /orders  │ ───────▶ │ /webhooks/         │ ────▶ │ basket_      │
  │  catalog │  items   │ status=  │ order_id │  delivery-confirmed │ brief │ sessions     │
  └──────────┘          │ placed   │          │                    │ json  │ (snapshot)   │
                        └──────────┘          │ 1 mark delivered   │       └──────┬───────┘
                                              │ 2 build INVENTORY  │              │
                                              │ 3 generatePlan()   │              │ GET /basket-
                                              │ 4 persist session  │              │ sessions/latest
                                              └─────────┬──────────┘              ▼
                                                        │                  ┌──────────────┐
                       ┌────────────────────────────────┘                  │  Meal plan   │
                       ▼                                                    │  (week grid) │
                 ┌───────────┐   built from delivered orders               └──────┬───────┘
                 │  FRIDGE   │◀── minus what you cooked, minus expired             │ open a meal
                 └───────────┘                                                     ▼
                       ▲                                                    ┌──────────────┐
                       │ depletes on "yes"                                  │ Recipe + Cook│
                 ┌─────┴───────────┐   POST /reminders   ┌──────────────┐  │ Mode + video │
                 │ "Did you cook?" │◀────fires (scheduler)│ cook_reminder│◀─┤ set reminder │
                 └─────────────────┘                      └──────────────┘  └──────────────┘
                       │ thumbs + cooked
                       ▼
                 feeds the NEXT generatePlan() (learning loop)
```

The single most important structural idea: **the plan is generated from the user's whole
current inventory, not from the order that just arrived.** That one choice is what makes
buying more *add* to the week instead of wiping it, makes cooking *deplete* the kitchen, and
lets the system assume the user already has food in the house.

---

## The five eng decisions (D1–D5)

These were settled in the eng review and are load-bearing. Don't reverse them casually.

- **D1 — two-layer SKU→category mapping.** Every product carries *both* a `shelf_category`
  (for fridge urgency) and `recipe_categories` (for recipe matching). Matching is on abstract
  categories (`any_protein`), never on product ids, so the recipe library doesn't care which
  specific protein you bought. See [catalog.js](../src/data/catalog.js).
- **D2 — the brief is persisted at the webhook.** The plan is computed once, at delivery, and
  stored as a JSON snapshot (`basket_sessions.brief_json`). Reads are cheap and stable; the
  plan doesn't silently change under the user between visits.
- **D3 — reuse durable job infra for reminders.** Reminders are rows with a `state` and a
  `remind_at`; a poller fires the due ones. In this slice that's [scheduler.js](../src/services/scheduler.js)
  + the `POST /api/dev/tick` test hook. In production this maps onto GoLemon's existing job runner.
- **D4 — `UNIQUE(order_id)` idempotency.** One order → at most one basket session, enforced at
  the schema level, plus a belt-and-braces `processed_webhooks(event_id)` check. Delivery
  webhooks retry; this guarantees no duplicate plans.
- **D5 — server-side kill switch, not a feature flag.** A `config` row (`golemon_food_prep_enabled`)
  read at runtime. Flipping it to `false` instantly stops plan generation (deliveries still
  succeed) with no deploy. Chosen over a build-time flag so it can be killed mid-incident.

---

## The Recipe Trust Engine (why the recipe schema looks like that)

The original recipes failed a simple test a real cook applied: *"You say 'pour in egusi' —
do I blend it first or pour whole seeds? And if I count your steps they add up to less time
than your stated 'meal prep' number, so you're missing steps."* He was right, and it exposed
a structural defect, not a typo.

**Root cause:** the schema tracked ingredient *presence* but smuggled *preparation* and
*time* into prose. "2 cups egusi" hid "grind it first." A single `active_minutes` number was
a guess that ignored the 40-minute beef boil.

The fix is the v2 schema (see [reference §5](reference.md#5-recipe-schema-v2)):

- **First-class prep** — every ingredient has a `prep` field, so "grind the egusi" is impossible to omit. The validator *enforces* this for scorch-prone items.
- **Decomposed, honest time** — `prep_min + active_cook_min + passive_min = total_min`, and `total_min` can never be less than the sum of the steps. The validator fails the build otherwise. The cook's own test now passes by construction.
- **Scored difficulty with drivers** — difficulty is a 1–5 score *with named reasons* ("egusi scorches if the heat is too high"), so "what does difficulty mean?" has a real answer.
- **Per-step cue / why / watch-out** — every step says how to know it's done (`cue`), the reason (`why`, for first-timers), and the failure mode (`watch_out`).
- **Rescue + level-up** — how to save it if it goes wrong, and an optional "take it up a notch."

### Trade-off

The v2 schema is verbose and the 37 recipes are hand-written and hand-timed. That's
intentional: the recipe is the product, so its content can't be auto-generated slop. The cost
is that adding/editing recipes is real work and the timings need a human who actually cooks
these dishes to verify before launch. The validator catches structural lies, not culinary ones.

### Progressive disclosure (why the UI hides most of it by default)

All that depth is overwhelming if shown at once. So the recipe screen is **calm by default**:
each step shows only the action + the "done when" cue. The *why* and *watch-out* are one tap
behind "Show the why"; rescue, level-up, and the difficulty drivers are collapsed. Nothing is
removed — it's revealed on demand. This serves a nervous first-timer and an impatient expert
from the *same* recipe.

---

## Inventory, not orders (the augment-don't-wipe model)

```
  buildFridge(user)            inventoryForPlan(user)            generatePlan(items)
  ───────────────────          ──────────────────────           ───────────────────
  all delivered order_items     fridge entries where             coverage from quantity,
  grouped by product,           remaining > 0 AND not expired     day-of-week character,
  newest delivery = clock,      → [{product, qty, days_left}]     variety rules, learning
  MINUS confirmed cooks                                           → the brief snapshot
```

- **The fridge is derived, never entered.** It's a projection of delivery history. The most
  recent delivery of a product resets its freshness clock (a re-order refreshes it).
- **Cooking depletes it.** Each confirmed "Did you cook? yes" consumes one unit of each of
  that recipe's required categories, drawn from the *soonest-to-expire still-usable* item
  (you don't cook with food that's already spoiled — expired items are never consumed).
- **The plan is built from this inventory**, so a new order augments the week and cooking
  shrinks it. Coverage days come from how much *main-meal* food there actually is, not from
  how many recipes happen to match (the old, dishonest proxy).
- **Pantry staples** (`palm_oil`, `cooking_oil`) are assumed present so oil-based dishes can
  match — nobody buys oil per recipe.

### Trade-off

Depletion is approximate: one "unit" per required category per cook, not gram-accurate. It's
honest enough to keep the fridge believable without a full inventory-accounting system. If you
later need precise quantities (e.g. "you have 300g beef, this needs 500g"), that's a real
extension, not a tweak.

---

## Context that feels personal (day-of-week planning)

A plan that serves jollof every day feels robotic. Real Nigerian weeks have rhythm: Sunday is
the big rice cook; Monday people are tired from work and want something easy; the weekend has
time for a project dish. So each generated day carries a **weekday character** (`DOW` in
[planGenerator.js](../src/services/planGenerator.js)) that biases dish selection and shows a
human note ("Sunday rice 🍚 — the big cook"). Combined with the **no-same-family-twice-a-day**
rule and week-wide spread, the plan stops repeating and starts feeling like it knows the
customer's life. That "oh, they thought of my schedule" reaction is the retention lever.

---

## The accountability loop (and why it learns)

Buying food doesn't change behavior; *cooking* it does. So the loop closes deliberately:
set a reminder → it fires → "Did you cook?" → a celebratory "lovemark" on yes. Every answer is
a signal: thumbs-down and never-cooked dishes sink in the next plan; cooked dishes rise. The
plan gets more like the customer every week. The data already flows; the ranking is in
`prefScore`.

---

## Known gaps

(Read before you ship.)

These are deliberate edges of the slice, tracked in [TODOS.md](../TODOS.md):

- **The reminder is a demo timer with no delivery channel.** `demo_seconds` fires it in
  seconds so the loop is visible; there is no real 6:30 PM schedule and no push/WhatsApp/SMS
  yet. The accountability loop does not function in production until a channel is wired. This
  is the single biggest thing between this slice and a real ship.
- **Auth is `x-user-id`.** A stand-in for real session auth.
- **Product photography is partial.** Universal SKUs have real photos; Nigerian-specific items
  (ugu, egusi, kpomo, agege bread…) need GoLemon's own/supplier shots. The pipeline is ready
  for drop-in files.
- **Depletion and coverage are approximate** (see above).
- **No dietary constraints / allergies** in the matcher yet.

---

## If you change one thing, know this

- Touching `planGenerator.js`? Re-run `npm test` — the variety, augment, pantry, day-of-week,
  and learning behaviors are all covered by regression tests, including a same-day-repeat bug
  that has bitten before.
- Touching the recipe JSON? Run `npm run validate` — it will reject dishonest time or a
  missing prep step.
- Touching the schema? Keep the `active_minutes` / `difficulty_dots` mirrors in sync; the
  generator reads them and the validator checks them.
