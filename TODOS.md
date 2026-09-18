# GoLemon Food Prep — deferred work

Tracked from the `/plan-ceo-review` sessions on 2026-06-15. Nothing here is lost —
it's deferred with context, not cut.

## From the recipe-trust-engine review (round 1)
- **Real doneness photography** — schema + UI slot shipped ("Reference photo coming
  soon" placeholder in the recipe view and Cook Mode). Needs the GoLemon food team to
  shoot the key doneness cue per recipe ("oil floats to the top", "soup draws").
- **Weekly prep session** — roll up every recipe's `time.make_ahead` into one batched
  "Sunday prep" timeline (grind all egusi, par-cook proteins, blend the tomato base once).
- **Serves-N scaling** — let the user set household size; rescale `ingredients` quantities
  and `time` accordingly. Schema already carries `serves`.
- **Food-ops verification** — have someone who actually cooks these dishes verify the 35
  recipes' timings/prep before launch (the founder food-ops gates).

## From the overall-implementation review (round 2)
- **Real reminder + notification channel** — replace the 5-second demo timer
  (`setReminder(... demo_seconds: 5)`) with a real local-time schedule (default 6:30pm,
  user-pickable) AND a real delivery channel. In Nigeria that's WhatsApp (a WhatsApp
  banner design already exists in the repo); web-push / email as fallback. Without this
  the "did you cook?" accountability loop does not function in production.
- **Dietary constraints** — vegetarian / no-beef / allergy filters in the matcher
  (`planGenerator.matches`). Currently preference-blind.
- **Shop completeness** — wire the category chips to actually filter, add search, and
  swap emoji for real product photography.
- **Real auth** — replace the `x-user-id` header principal (`auth.currentUser`) with
  GoLemon's real session auth before launch.
- **Admin / metrics screen** — a UI over `/api/metrics` to watch the funnel
  (reminder set → fired → cooked-yes) move as test users go through it.

## Done in these sessions (for reference)
- Recipe Trust Engine: schema v2 (first-class prep, decomposed honest time, scored
  difficulty + drivers, per-step cue/why/watch-out), beginner/expert toggle, rescue
  cards, level-up layer, all 35 recipes rewritten, build-time validator.
- Cook Mode: hands-free full-screen stepper with live per-step timers + wake lock.
- Quantity honesty: coverage from real basket quantity; recipe have/need split;
  digital fridge depletes on confirmed cooks (skips already-expired items).
- Learning loop: thumbs-down + never-cooked dishes down-ranked, cooked dishes up-ranked,
  disliked dishes never force-placed as the surprise.
- Swap a meal + add-missing-ingredients-to-basket.
- Fixed: surprise-override same-day duplicate; first-time-user webhook crash (no users row).

## Done in round 3
- **Inventory-based planning** — the plan is built from the user's WHOLE current kitchen
  (everything delivered, un-cooked, not expired) via `inventoryForPlan`, not one order.
  Buying more AUGMENTS the plan; cooking depletes it. Fixed the "it wipes everything" bug.
- **Assumed pantry staples** — palm oil / cooking oil assumed present, so oil-based dishes
  (egusi, red stew) match; shown as "🧂 kitchen staple" in have/need (not "to add").
- **Opens to an existing week** — seed gives the demo user a fuller recent delivery, and
  the server generates a starting plan at boot from existing inventory.
- **Day-of-week context** — Sunday rice, easy Mondays, weekend projects; each day carries
  a contextual note. Meals biased to the weekday's character.
- **YouTube per meal** — "Watch a quick video" opens a YouTube search for the dish
  (honest, always-valid; no fabricated video IDs).
- **Empty-plan state** — graceful "add a protein + a carb" instead of a blank week.
- **Whole-app calm pass** — recipe view progressive disclosure (round 2 design review)
  extended: plan "what to use first" collapsible, weekday day-notes, consistent hierarchy.

## Done in round 4 (design + variety pass)
- **Meal variety** — `mealFamily()` enforces no two same-family mains in a day (no rice
  for lunch AND dinner) and spreads families across the week. Rice now ~4×/week, not daily.
- **Dessert variety** — added sugar/yeast/zobo products (unlocks puff puff, chin chin,
  zobo) + dessert rotation; the seeded kitchen now yields 7 distinct desserts across the week.
- **Bread recipes** — added Egg & veggie sandwich and French toast (the "bread but no
  sandwich" gap). Breakfast now varies every day.
- **Richer seeded kitchen** — a full weekly shop so the existing week is varied, not rice-on-repeat.
- **Fridge pill direction fixed** — fill now = urgency: 1 day left ≈ 86% full, expired/past
  = 100% full red. (Was inverted: more days = more full.)
- **Day-note alignment** — weekday subtext now aligns under the day name (was at card edge).
- **"0 to add" slop removed** — shows "N to add" only when > 0, else "all in your kitchen 💚".
- **Real product photos** — clean product-on-white images wired for ~18 universal SKUs
  (tomato, onion, beef, chicken, fish, eggs, rice, banana, pineapple, carrots, bread,
  flour, sugar, spaghetti, sweet potato, green beans, tatashe) via a CC source, with a
  tinted-icon fallback. Pipeline reads `PIMG`/`/img/products` so owned photos drop straight in.

## Images — remaining (needs a source decision)
Nigerian-specific SKUs (ugu, bitter leaf, scent leaf, egusi, ogbono, kpomo, stockfish,
crayfish, agege bread, akamu, garden egg, okra, yam, plantain, beans, cocoyam) have no
reliable free-licensed photo and still show the tinted icon. Generic stock would be wrong/
misleading for these. Correct path: GoLemon's own/supplier photography dropped into
`public/img/products/<id>.jpg` (pipeline is ready). Open question for the user: owned
photos, a licensed stock API key, or keep best-effort per-item sourcing.

Remaining design polish: a light calm pass on the Fridge screen.
