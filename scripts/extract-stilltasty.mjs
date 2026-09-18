// Build-time pipeline (ENG-15): extract shelf-life baselines from stilltasty.com.
//
// StillTasty is JS-rendered, so a plain fetch returns nav HTML (confirmed). This
// script drives a real headless browser (the gstack `browse` CLI; swap for
// Playwright in CI) to render each item page and parse the Refrigerator / Counter /
// Pantry / Freezer durations. Output: src/data/stilltasty-extracted.jsonl.
//
// This is a LOW-FREQUENCY build step, never called at runtime. Re-run when the
// GoLemon catalog grows. Data is transformed + merged with Nigerian food-ops
// knowledge in build-shelf-life.mjs — not redistributed verbatim.
//
//   node scripts/extract-stilltasty.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BROWSE = join(homedir(), '.claude/skills/gstack/browse/dist/browse');

// shelf_category -> StillTasty fooditem id (one representative item per category)
const MAP = {
  fresh_leafy_green: [18375, 'Spinach, fresh raw'],
  fresh_protein_fish: [17618, 'Mackerel, fresh raw'],
  fresh_protein_meat: [16502, 'Beef steak, fresh raw'],
  fresh_protein_poultry: [16788, 'Chicken pieces, fresh raw'],
  eggs: [17144, 'Eggs, fresh raw in shell'],
  fresh_pepper: [16814, 'Chili peppers, fresh raw'],
  alliums: [17827, 'Onions, fresh raw'],
  fresh_vegetable: [17817, 'Okra, fresh raw'],
  starchy_tuber: [18774, 'Sweet potatoes, fresh raw'],
  starchy_fruit: [18018, 'Plantains, fresh raw whole'],
  dry_grain_pantry: [18186, 'Rice, white, uncooked'],
  dry_legume_pantry: [17480, 'Kidney beans, dried, uncooked'],
  dry_starch_pantry: [16358, 'Pasta, dry, uncooked'],
  fermented_condiment_pantry: [16596, 'Bouillon cubes'],
  fruit: [17992, 'Pineapple, fresh raw'],
};

function field(text, label) {
  const lines = text.split('\n').map(s => s.trim());
  const i = lines.indexOf(label);
  return i >= 0 && lines[i + 1] ? lines[i + 1].replace(/"/g, '') : '';
}

const out = [];
for (const [category, [id, name]] of Object.entries(MAP)) {
  execFileSync(BROWSE, ['goto', `https://www.stilltasty.com/Fooditems/index/${id}`], { stdio: 'ignore' });
  const text = execFileSync(BROWSE, ['text'], { encoding: 'utf8' });
  out.push({
    category, st_id: id, st_name: name,
    refrigerator: field(text, 'Refrigerator'),
    counter: field(text, 'Counter'),
    pantry: field(text, 'Pantry'),
    freezer: field(text, 'Freezer'),
  });
  console.log(`${category}: fridge=[${field(text, 'Refrigerator')}] pantry=[${field(text, 'Pantry')}]`);
}
writeFileSync(new URL('../src/data/stilltasty-extracted.jsonl', import.meta.url),
  out.map(o => JSON.stringify(o)).join('\n') + '\n');
console.log(`\nExtracted ${out.length} categories -> src/data/stilltasty-extracted.jsonl`);
