// Build-time pipeline step 2 (ENG-15): normalize the raw StillTasty extraction into
// day-counts and apply the Nigerian food-ops OVERRIDE layer. StillTasty reflects a
// US cold chain; Lagos reality differs (ugu wilts in 2 days, market tomatoes ~2 days,
// fresh fish ~1 day). Categories StillTasty doesn't cover (crayfish, kpomo, palm oil,
// agege bread) come entirely from Nigerian food knowledge.
//
//   node scripts/build-shelf-life.mjs   ->  writes src/data/shelf-life.json
import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync(new URL('../src/data/stilltasty-extracted.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

// Parse a StillTasty duration string to a conservative LOWER-bound day count
// (we want "cook by", so err shorter). Returns null if unparseable/empty.
function toDays(s) {
  if (!s) return null;
  s = s.toLowerCase();
  if (s.includes('indefinit')) return 365;
  const n = parseFloat((s.match(/\d+(\.\d+)?/) || [])[0]);
  if (isNaN(n)) return null;
  if (s.includes('year')) return 365;
  if (s.includes('month')) return Math.round(n * 30);
  if (s.includes('week')) return Math.round(n * 7);
  return Math.round(n); // days
}

// Nigerian food-ops override layer. days_fridge/days_ambient reflect Lagos reality.
// Where override is set, it WINS over StillTasty (with provenance recorded).
const OVERRIDE = {
  fresh_leafy_green:   { ambient: 2, fridge: 4,  why: 'Ugu/efo wilt fast in tropical heat; shorter than US spinach' },
  fresh_protein_fish:  { ambient: 1, fridge: 1,  why: 'Fresh titus/mackerel — cook within a day in Lagos' },
  fresh_protein_meat:  { ambient: 1, fridge: 4,  why: 'Fresh beef from open market; chilled ~4 days' },
  fresh_protein_poultry:{ambient: 1, fridge: 2,  why: 'Fresh chicken — 1-2 days' },
  fresh_pepper:        { ambient: 4, fridge: 6,  why: 'Scotch bonnet/tatashe ~ a week chilled' },
  fresh_vegetable:     { ambient: 2, fridge: 4,  why: 'Okra/garden egg — use within a few days' },
  starchy_fruit:       { ambient: 3, fridge: 4,  why: 'Ripe plantain — 3-4 days before it over-ripens' },
};

// Categories StillTasty does not cover — pure Nigerian food knowledge.
const NIGERIAN_ONLY = [
  { category: 'fresh_tomato_family',      name: 'Fresh tomatoes',        ambient: 2,  fridge: 4,   note: 'Market tomatoes bruise fast; cook within 2 days.' },
  { category: 'fresh_protein_offal',      name: 'Kpomo (cow skin)',      ambient: 1,  fridge: 3,   note: 'Cook within 3 days chilled.' },
  { category: 'dried_preserved_protein',  name: 'Crayfish / stockfish',  ambient: 180,fridge: 365, note: 'Dried — keeps for months in a sealed container.' },
  { category: 'cooking_oil_pantry',       name: 'Palm / vegetable oil',  ambient: 365,fridge: 365, note: 'Pantry staple.' },
  { category: 'bakery_bread',             name: 'Agege bread',           ambient: 3,  fridge: 5,   note: 'Best within 3 days; refrigeration stales it faster.' },
];

const out = [];
for (const r of raw) {
  const stFridge = toDays(r.refrigerator) ?? toDays(r.pantry) ?? toDays(r.counter);
  const stAmbient = toDays(r.counter) ?? toDays(r.pantry) ?? stFridge;
  const ov = OVERRIDE[r.category];
  out.push({
    category: r.category,
    name: r.st_name,
    shelf_days_ambient: ov ? ov.ambient : stAmbient,
    shelf_days_fridge: ov ? ov.fridge : stFridge,
    source: ov ? 'stilltasty+nigerian_override' : 'stilltasty',
    st_raw: { refrigerator: r.refrigerator, pantry: r.pantry, counter: r.counter, freezer: r.freezer },
    storage_note: ov ? ov.why : `StillTasty: fridge ${r.refrigerator || r.pantry}.`,
  });
}
for (const n of NIGERIAN_ONLY) {
  out.push({
    category: n.category, name: n.name,
    shelf_days_ambient: n.ambient, shelf_days_fridge: n.fridge,
    source: 'nigerian_food_knowledge', storage_note: n.note,
  });
}

writeFileSync(new URL('../src/data/shelf-life.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
const st = out.filter(o => o.source.startsWith('stilltasty')).length;
const ng = out.filter(o => o.source === 'nigerian_food_knowledge').length;
console.log(`shelf-life.json built: ${out.length} categories (${st} from StillTasty, ${ng} Nigerian-only).`);
console.table(out.map(o => ({ category: o.category, ambient: o.shelf_days_ambient, fridge: o.shelf_days_fridge, source: o.source })));
