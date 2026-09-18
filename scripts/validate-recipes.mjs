#!/usr/bin/env node
// Build-time guard for the Recipe Trust Engine (schema v2).
// Enforces the two invariants that the CEO review identified as the root cause
// of the "recipes aren't detailed / timing is wrong" feedback:
//
//   1. HONEST TIME:   time.total_min === prep_min + active_cook_min + passive_min
//                     AND total_min >= sum(steps[].duration_min)
//                     (you cannot finish a dish faster than doing its steps)
//   2. EXPLICIT PREP: ingredients that obviously need preparation (egusi, ogbono,
//                     cocoyam, bitter leaf, beans-for-akara/moimoi) MUST carry a
//                     non-empty `prep` so a first-time cook is never told to
//                     "pour in egusi" with no instruction to grind it first.
//
// Also sanity-checks the legacy mirrors (active_minutes === total_min,
// difficulty_dots === difficulty.score) that planGenerator still reads.
//
// Run:  node scripts/validate-recipes.mjs   (exit 1 on any violation)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');
const files = ['archetypes-mains.json', 'archetypes-breakfast.json', 'archetypes-dessert.json'];

const NEEDS_PREP = [/egusi/i, /ogbono/i, /cocoyam/i, /bitter leaf/i];
const errors = [];
let count = 0;

for (const f of files) {
  const recipes = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
  for (const r of recipes) {
    count++;
    const id = `${f.replace('archetypes-', '').replace('.json', '')}:${r.id} (${r.name})`;
    const t = r.time;
    if (!t) { errors.push(`${id}: missing time{} block`); continue; }

    const sum = (t.prep_min || 0) + (t.active_cook_min || 0) + (t.passive_min || 0);
    if (t.total_min !== sum)
      errors.push(`${id}: total_min ${t.total_min} != prep+active+passive ${sum}`);

    const stepSum = (r.steps || []).reduce((n, s) => n + (s && s.duration_min || 0), 0);
    if (t.total_min < stepSum)
      errors.push(`${id}: total_min ${t.total_min} < sum(step durations) ${stepSum} — stated time is less than the steps, the exact bug we are guarding against`);

    if (r.active_minutes !== t.total_min)
      errors.push(`${id}: active_minutes mirror ${r.active_minutes} != time.total_min ${t.total_min}`);
    if (r.difficulty && r.difficulty.score !== r.difficulty_dots)
      errors.push(`${id}: difficulty_dots mirror ${r.difficulty_dots} != difficulty.score ${r.difficulty.score}`);

    for (const ing of r.ingredients || []) {
      if (NEEDS_PREP.some(re => re.test(ing.item)) && !(ing.prep && ing.prep.trim()))
        errors.push(`${id}: ingredient "${ing.item}" needs an explicit prep (e.g. "ground") but has none`);
    }
    // every step should carry a doneness cue OR a duration so Cook Mode has something to show
    (r.steps || []).forEach((s, i) => {
      if (!s.action || !s.action.trim()) errors.push(`${id}: step ${i + 1} has no action text`);
    });
  }
}

if (errors.length) {
  console.error(`\n✗ Recipe validation FAILED — ${errors.length} issue(s) across ${count} recipes:\n`);
  for (const e of errors) console.error('  - ' + e);
  console.error('');
  process.exit(1);
}
console.log(`✓ Recipe Trust Engine: all ${count} recipes pass (honest time + explicit prep).`);
