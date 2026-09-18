// Loads the recipe archetype library and normalizes meal_slot.
// Mains (archetypes-15) are eligible for lunch AND dinner. Breakfast and dessert
// files carry their own meal_slot. This is the content backing the full B/L/D plan.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = f => JSON.parse(readFileSync(join(__dirname, '..', 'data', f), 'utf8'));

const mains = load('archetypes-mains.json').map(a => ({ ...a, slots: ['lunch', 'dinner'] }));
const breakfast = load('archetypes-breakfast.json').map(a => ({ ...a, slots: ['breakfast'] }));
const dessert = load('archetypes-dessert.json').map(a => ({ ...a, slots: ['dessert'] }));

export const ARCHETYPES = [...mains, ...breakfast, ...dessert];

export function archetypesForSlot(slot) {
  return ARCHETYPES.filter(a => a.slots.includes(slot));
}
export function archetypeById(id) {
  return ARCHETYPES.find(a => a.id === id);
}
