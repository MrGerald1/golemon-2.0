// Persona inference (design doc rule). For <4 orders, use the declared household
// size (cold-start); fallback to Solo if skipped. For >=4 orders, infer from the
// last orders' item count + value.
import { db } from '../db.js';

export function inferPersona(user) {
  if ((user.completed_order_count || 0) < 4) {
    return { persona: declaredToPersona(user.household_size_declared), basis: 'declared' };
  }
  const orders = db.prepare(
    `SELECT total, item_count FROM orders WHERE user_id=? AND status='delivered'
     ORDER BY created_at DESC LIMIT 10`).all(user.id);
  if (!orders.length) return { persona: 'solo', basis: 'fallback' };
  const med = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const items = med(orders.map(o => o.item_count || 0));
  const value = med(orders.map(o => o.total || 0));
  let persona = 'solo';
  if (items > 12 || value > 18000) persona = 'family';
  else if (items >= 6 || value > 8000) persona = 'couple';
  return { persona, basis: 'inferred' };
}

function declaredToPersona(declared) {
  if (declared === '4+') return 'family';
  if (declared === '2-3') return 'couple';
  if (declared === '1') return 'solo';
  return 'solo'; // skipped / null -> smallest-portion default
}

// portions/day a persona realistically cooks (used by the coverage estimator)
export function personaScale(persona) {
  return ({ solo: 1, couple: 1.4, family: 2, bulk: 2.4 })[persona] || 1;
}
