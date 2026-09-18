// D5 kill switch + constants. Kill switch is read from the config table so it
// can be flipped at runtime without a deploy (honors the no-feature-flag decision
// while giving an instant off-switch).
import { db } from './db.js';

export const PUSH_DELAY_MIN = 30;        // push fires 30 min after delivery-confirmed
export const EXPIRY_HOURS = 48;          // deep-link expiry (D11A)
export const DEFAULT_REMIND = '18:30';   // design review: default reminder 6:30pm
export const SHELF_FALLBACK_DAYS = 3;    // "Use within 3 days" when not in the shelf-life DB

export function getConfig(key, dflt) {
  const row = db.prepare('SELECT value FROM config WHERE key=?').get(key);
  return row ? row.value : dflt;
}
export function setConfig(key, value) {
  db.prepare('INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, String(value));
}
export function featureEnabled() {
  return getConfig('golemon_food_prep_enabled', 'true') === 'true';
}
