# Tutorial — Run GoLemon Food Prep and cook your first meal

By the end of this you'll have the app running, shopped a basket, watched it turn into a full
week of meals, opened a recipe in hands-free Cook Mode, and closed the "Did you cook?" loop —
seeing the fridge deplete as a result. About 10 minutes. You only need a terminal and a browser.

If you want the *why* behind any of this, read [explanation-architecture.md](explanation-architecture.md)
after. For exact field definitions, [reference.md](reference.md).

## What you'll need

- **Node 24 or newer** (`node --version` must be ≥ 24 — the app uses Node's built-in SQLite).
- A terminal open in the `golemon-foodprep/` directory.
- A web browser.

## Step 1: Start the app

```bash
npm install
npm start
```

You'll see:
```
Seeded catalog, demo user, and fridge history.
GoLemon Food Prep running -> http://localhost:4317  (feature: true)
```

That's the whole backend: it created a local SQLite file, seeded a product catalog, a demo
user, and a **stocked kitchen** (a few past deliveries), and started the server on port 4317.

## Step 2: Open it and see an existing week

Open **http://localhost:4317**. You're on the Shop page. Click **Meal plan** in the top nav.

You already have a plan — because the demo user "already has food in the house." You'll see:
- "Your kitchen covers about 7 days" with what it's based on.
- "What to use first" — the most perishable items.
- A 7-day grid. Each day has a weekday note ("Today · Mon — Back to work, keeping it easy";
  "Sun — Sunday rice 🍚"). Lunch and dinner are always different kinds of dish; desserts vary.

**You've already seen the core magic: a basket became a varied, contextual week with zero effort.**
(That's your first result, before step 3.)

## Step 3: Open a recipe and read it

Click any meal — say a lunch. The recipe opens **calm by default**:
- A warm line, the difficulty (tap it to see *why* it's rated that), and a time breakdown
  (prep / cooking / hands-off / total).
- **"What you need"** — split into what's already in your kitchen vs what to add. Pantry
  staples (oil, salt) are marked as staples, not "to add".
- **The steps** — each shows the action, a time, and a green "Done when…" cue. Tap
  **"Show the why"** to reveal the reasoning and the watch-outs for each step.
- Collapsible **"If it goes wrong"** (rescue) and **"Take it up a notch"**.

Everything is there; it's just revealed on demand so it doesn't overwhelm.

## Step 4: Cook with the hands-free stepper

Tap **"▶ Cook with me, step by step"**. The screen goes full-width, one step at a time, big
text, with a live countdown timer for steps that have a duration (tap "Start N min timer").
Use **Next →** to advance. This is what a cook actually uses with greasy hands and the phone
propped on the counter. (Tap **"▶ Watch a quick video"** on the recipe to open a YouTube
search for the dish.)

Close Cook Mode with the ✕.

## Step 5: Shop more and watch the plan *grow*

Go to **Shop**, add a couple of items to your basket (e.g. a protein and some vegetables),
open **Basket**, **Checkout**, **Place order**, then **Simulate delivery**.

Watch the meal plan: the new items **add** to your week — they don't wipe it. Coverage goes
up, and dishes that need your new ingredients can now appear. The plan is built from your
*whole kitchen*, so buying more extends the week.

## Step 6: Close the loop and watch the fridge deplete

1. Open a meal and tap **"🔔 Remind me to cook this"** (in the demo it fires in a few seconds).
2. When the "**Did you cook?**" prompt appears, tap **"Yes, I made it ✓"**. You'll get a
   celebratory confirmation.
3. Open **Fridge**. Notice two things:
   - The freshness bars read as *urgency* — items with 1 day left are almost full, expired
     items are a full red bar.
   - The ingredients your cooked meal used have been **depleted** (drawn down, and moved to
     "Cooked / used up" when a unit hits zero). The fridge is honest about what you actually have.

## What you built (and what just happened)

You ran the complete loop the product is built around:

```
  shop → deliver → plan (from your whole kitchen) → recipe + Cook Mode + reminder
       → "Did you cook?" → fridge depletes → next plan learns what you like
```

A few things you saw that make it feel thought-through: the week is varied and weekday-aware,
the recipe never hides a prep step (the egusi recipe tells you to grind it first) and never
lies about timing, and the fridge reflects reality instead of a static list.

### Next steps
- **Change something:** add a recipe or a product, then re-run `npm run validate` / `npm test`
  — see [howto.md](howto.md).
- **Understand the design:** [explanation-architecture.md](explanation-architecture.md).
- **Look up any detail:** [reference.md](reference.md).
- **Before a real ship:** read "Known gaps" in the explanation doc — the reminder is still a
  demo timer with no real delivery channel, which is the main thing standing between this and production.
