// Generates the full B/L/D + dessert meal plan from the user's CURRENT INVENTORY
// (everything delivered and not yet cooked, plus assumed pantry staples) — NOT just
// the latest order. Buying more augments the plan; cooking depletes it.
//
// Implements: D1 SKU->category resolution, slot-filling matcher (ENG-11), quantity
// coverage (ENG-12), perishable front-loading using REAL days-left per item, the
// learning loop (thumbs + did-you-cook), per-meal swap alternates, the basket-item
// have/need snapshot, day-of-week context (Sunday rice, easy Mondays, weekend
// projects), and a per-meal video search query. Output is the brief_json (D2).
import { shelfFor, levelFor } from './shelfLife.js';
import { archetypesForSlot } from './archetypes.js';
import { personaScale } from './persona.js';

const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', dessert: 'Dessert' };
const clamp = (lo, hi, n) => Math.max(lo, Math.min(hi, n));

// Categories that form a "main meal" — used for quantity coverage. Accompaniments
// (greens, tomato, pepper, onion, crayfish, spices) are excluded so a bunch of ugu
// doesn't read as another day of food.
const MAIN_CATS = new Set([
  'any_protein', 'proteins_beef_or_kpomo', 'stockfish', 'eggs',
  'parboiled_rice', 'dried_beans_honey_beans', 'yam_cut_pieces', 'sweet_potato',
  'ripe_plantain', 'dry_pasta', 'instant_noodles', 'egusi_seeds', 'ogbono_seeds',
  'cocoyam', 'akamu_ogi_pap', 'custard_powder', 'flour', 'cereal_golden_morn',
]);

// Staples we assume every kitchen already has — without these, dishes like egusi
// (needs palm oil) or red stew (needs cooking oil) would never match even though
// nobody buys oil per-recipe. Matched, but never counted as "main meal" food.
const PANTRY_CATS = ['palm_oil', 'cooking_oil'];

// Day-of-week character. Makes the plan feel like it knows the user's week.
const DOW = [
  { short: 'Sun', long: 'Sunday', note: 'Sunday rice 🍚 — the big cook', wants: 'rice' },
  { short: 'Mon', long: 'Monday', note: 'Back to work — keeping it easy', wants: 'easy' },
  { short: 'Tue', long: 'Tuesday', note: 'Quick weeknight dinner', wants: 'quick' },
  { short: 'Wed', long: 'Wednesday', note: 'Midweek — switch it up', wants: 'quick' },
  { short: 'Thu', long: 'Thursday', note: 'Almost the weekend', wants: 'quick' },
  { short: 'Fri', long: 'Friday', note: 'Friday treat 🎉', wants: 'treat' },
  { short: 'Sat', long: 'Saturday', note: 'Weekend cooking — go a bit fuller', wants: 'project' },
];

// lower = better fit for the day's character
function dowScore(a, wants) {
  const diff = (a.difficulty && a.difficulty.score) || a.difficulty_dots || 2;
  const mins = a.active_minutes || 30;
  const isRice = (a.required_categories || []).includes('parboiled_rice');
  switch (wants) {
    case 'rice': return isRice ? 0 : 2;
    case 'easy': return (diff >= 3 ? 1 : 0) + (mins > 45 ? 1 : 0);
    case 'quick': return mins > 45 ? 2 : (mins > 35 ? 1 : 0);
    case 'treat': return diff >= 3 ? 0 : 1;
    case 'project': return diff >= 4 ? 0 : (diff >= 3 ? 1 : 2);
    default: return 0;
  }
}

export function generatePlan(items, { persona = 'solo', prefs = {}, startDow = 0 } = {}) {
  // items: [{ product, qty, days? }] — days is real days-left from the fridge when the
  // plan is built from inventory; falls back to full shelf life for a fresh delivery.
  const disliked = prefs.disliked instanceof Set ? prefs.disliked : new Set(prefs.disliked || []);
  const cooked = prefs.cooked instanceof Set ? prefs.cooked : new Set(prefs.cooked || []);

  const enriched = items.map(it => {
    const days = (typeof it.days === 'number') ? it.days : shelfFor(it.product).days;
    return { ...it, days, level: levelFor(days) };
  });

  const basketCats = new Set();
  const catDays = new Map();
  const catItemName = new Map();
  for (const it of enriched) {
    for (const c of it.product.recipe_categories || []) {
      basketCats.add(c);
      if (!catDays.has(c) || it.days < catDays.get(c)) { catDays.set(c, it.days); catItemName.set(c, it.product.name); }
    }
  }
  // assumed pantry staples — make recipes that need oil etc. matchable
  for (const c of PANTRY_CATS) basketCats.add(c);

  const basket_items = enriched.map(it => ({
    id: it.product.id, name: it.product.name, emoji: it.product.emoji,
    qty: it.qty || 1, days: it.days, categories: it.product.recipe_categories || [],
  }));

  const groups = { red: [], amber: [], green: [] };
  for (const it of enriched) groups[it.level].push(it);
  const shelf_groups = [
    { level: 'red',   label: 'Cook in the next 2 days', items: groups.red.map(i => ({ name: i.product.name, days: i.days })) },
    { level: 'amber', label: 'Use by day 5',            items: groups.amber.map(i => ({ name: i.product.name, days: i.days })) },
    { level: 'green', label: 'Pantry — no rush',        items: groups.green.map(i => ({ name: i.product.name })) },
  ].filter(g => g.items.length);

  const matches = slot => archetypesForSlot(slot)
    .filter(a => a.required_categories.every(c => basketCats.has(c)))
    .map(a => ({ a, urgency: archetypeUrgency(a, catDays), pref: prefScore(a.id, disliked, cooked) }))
    .sort((x, y) => (x.urgency - y.urgency) || (x.pref - y.pref));

  const pools = {
    breakfast: matches('breakfast'),
    lunch: matches('lunch'),
    dinner: matches('dinner'),
    dessert: matches('dessert'),
  };

  // QUANTITY coverage: days the real food supports
  let mainUnits = 0;
  for (const it of enriched) {
    if ((it.product.recipe_categories || []).some(c => MAIN_CATS.has(c))) mainUnits += (it.qty || 1);
  }
  const portions = mainUnits * 4;
  const perDay = 2 * personaScale(persona);
  const canPlate = (pools.lunch.length || pools.dinner.length);
  const days = canPlate ? clamp(2, 7, Math.round(portions / Math.max(1, perDay)) || 2) : 0;

  const surprise = [...pools.lunch, ...pools.dinner, ...pools.breakfast, ...pools.dessert]
    .find(m => m.a.is_surprise && !disliked.has(m.a.id));
  let surprisePlaced = false;

  const usedMains = new Set();      // dishes used across the week (spread, don't repeat early)
  const usedBreakfast = new Set();
  const usedDesserts = new Set();
  const familyCount = {};           // how often each family (rice/soup/beans...) has been used
  const plan = [];
  for (let d = 0; d < days; d++) {
    const dow = (((startDow + d) % 7) + 7) % 7;
    const wants = DOW[dow].wants;
    const meals = [];
    const usedToday = new Set();
    const usedFamilyToday = new Set();   // no two same-family mains in a day (no rice twice!)
    for (const slot of ['breakfast', 'lunch', 'dinner']) {
      const pool = pools[slot];
      if (!pool.length) continue;
      let pick;
      if (slot === 'breakfast') {
        const fresh = pool.filter(m => !usedBreakfast.has(m.a.id));
        if (!fresh.length) usedBreakfast.clear();
        const bp = fresh.length ? fresh : pool;
        pick = bp[d % bp.length];
        usedBreakfast.add(pick.a.id);
      } else if (surprise && !surprisePlaced && slot === 'lunch' && d <= 1
          && pools.lunch.includes(surprise) && !usedToday.has(surprise.a.id)
          && !usedFamilyToday.has(mealFamily(surprise.a))) {
        pick = surprise; surprisePlaced = true;
      } else {
        // a different food family from earlier today; then never-used this week; then
        // weekday character; then the least-used family; then most-perishable.
        const distinct = pool.filter(m => !usedToday.has(m.a.id) && !usedFamilyToday.has(mealFamily(m.a)));
        const notToday = pool.filter(m => !usedToday.has(m.a.id));
        const from = distinct.length ? distinct : (notToday.length ? notToday : pool);
        pick = from.slice().sort((x, y) => {
          const px = (x.pref === 1 ? 1 : 0) - (y.pref === 1 ? 1 : 0);
          if (px) return px;
          const ux = (usedMains.has(x.a.id) ? 1 : 0) - (usedMains.has(y.a.id) ? 1 : 0);
          if (ux) return ux;
          const dx = dowScore(x.a, wants) - dowScore(y.a, wants);
          if (dx) return dx;
          const fx = (familyCount[mealFamily(x.a)] || 0) - (familyCount[mealFamily(y.a)] || 0);
          if (fx) return fx;
          return (x.pref - y.pref) || (x.urgency - y.urgency);
        })[0];
      }
      if (slot !== 'breakfast') {
        usedMains.add(pick.a.id);
        const fam = mealFamily(pick.a);
        usedFamilyToday.add(fam);
        familyCount[fam] = (familyCount[fam] || 0) + 1;
      }
      usedToday.add(pick.a.id);
      meals.push(mealEntry(slot, pick, catDays, catItemName, pool));
    }
    if (pools.dessert.length) {
      const dfresh = pools.dessert.filter(m => !usedDesserts.has(m.a.id));
      if (!dfresh.length) usedDesserts.clear();
      const dp = dfresh.length ? dfresh : pools.dessert;
      const dpick = dp[d % dp.length];
      usedDesserts.add(dpick.a.id);
      meals.push(mealEntry('dessert', dpick, catDays, catItemName, pools.dessert));
    }
    plan.push({
      day: d + 1, label: d === 0 ? 'Today' : DOW[dow].short, dow_short: DOW[dow].short,
      day_note: DOW[dow].note, today: d === 0, meals,
    });
  }

  const perish = enriched.filter(i => i.days <= 2).sort((a, b) => a.days - b.days).slice(0, 2).map(i => i.product.name);
  const first_hint = perish.length
    ? `Start with your ${perish.join(' & ')} — freshest for the next 2 days, so they lead the early meals.`
    : null;

  return {
    coverage: {
      days, item_count: items.reduce((n, i) => n + (i.qty || 1), 0),
      main_items: mainUnits,
      basis: `Based on the ${mainUnits} main-meal item${mainUnits === 1 ? '' : 's'} in your kitchen`,
      slots: ['breakfast', 'lunch', 'dinner', ...(pools.dessert.length ? ['dessert'] : [])],
    },
    first_hint,
    shelf_groups,
    basket_items,
    plan,
    matched_counts: { breakfast: pools.breakfast.length, lunch: pools.lunch.length, dinner: pools.dinner.length, dessert: pools.dessert.length },
  };
}

// coarse food family, so the plan never serves two of the same kind in one day
// (rice for lunch AND dinner) and spreads families across the week.
function mealFamily(a) {
  const c = a.required_categories || [];
  const n = (a.name || '').toLowerCase();
  if (c.includes('parboiled_rice')) return 'rice';
  if (c.includes('dry_pasta')) return 'pasta';
  if (c.includes('dried_beans_honey_beans')) return 'beans';
  if (/soup|egusi|efo|okra|ogbono|onugbu|pepper ?soup|stew/.test(n)) return 'soup';
  if (c.includes('ripe_plantain')) return 'plantain';
  if (c.includes('yam_cut_pieces') || c.includes('sweet_potato')) return 'yam';
  return 'other';
}

function prefScore(id, disliked, cooked) {
  if (disliked.has(id)) return 1;
  if (cooked.has(id)) return -1;
  return 0;
}

function archetypeUrgency(a, catDays) {
  let min = 99;
  for (const c of a.required_categories) if (catDays.has(c)) min = Math.min(min, catDays.get(c));
  return min;
}

function mealEntry(slot, m, catDays, catItemName, pool) {
  const a = m.a;
  let tag = null, tagDays = 99, tagCat = null;
  for (const c of a.required_categories) {
    if (catDays.has(c) && catDays.get(c) < tagDays) { tagDays = catDays.get(c); tagCat = c; }
  }
  if (tagCat && tagDays <= 5) tag = `${shortName(catItemName.get(tagCat))} · ${tagDays} day${tagDays === 1 ? '' : 's'}`;
  const alts = (pool || []).filter(x => x.a.id !== a.id).slice(0, 4)
    .map(x => ({ id: x.a.id, name: x.a.name, minutes: x.a.active_minutes, difficulty: (x.a.difficulty && x.a.difficulty.score) || x.a.difficulty_dots }));
  return {
    slot, slot_label: SLOT_LABEL[slot],
    archetype_id: a.id, name: a.name,
    minutes: a.active_minutes, difficulty: (a.difficulty && a.difficulty.score) || a.difficulty_dots,
    is_surprise: !!a.is_surprise, surprise_note: a.surprise_note || null,
    urgency_tag: tag, alts, video_query: a.name,
  };
}
const shortName = s => (s || '').replace(/\s*\(.*\)\s*/, '').trim();
