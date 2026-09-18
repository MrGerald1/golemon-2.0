// Analytics events (the 8-event schema from the CEO/eng review + cooking_confirmed).
import { db, now } from '../db.js';

export function track(name, props = {}, userId = null) {
  db.prepare('INSERT INTO events(name, props, user_id, ts) VALUES(?,?,?,?)')
    .run(name, JSON.stringify(props), userId, now());
}

export function funnel() {
  const c = name => db.prepare('SELECT COUNT(*) n FROM events WHERE name=?').get(name).n;
  const opened = c('basket_brief_opened');
  const set = c('reminder_set');
  const fired = c('reminder_fired');
  const completed = c('reminder_completed');
  const cooked = db.prepare("SELECT COUNT(*) n FROM events WHERE name='cooking_confirmed' AND json_extract(props,'$.value')='yes'").get().n;
  const cookedAsked = c('cooking_confirmed');
  const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
  return {
    basket_brief_opened: opened, reminder_set: set, reminder_fired: fired,
    reminder_completed: completed, cooking_confirmed_yes: cooked, cooking_confirmed_total: cookedAsked,
    reminder_tap_rate_pct: pct(set, opened),         // primary metric, target >15%
    reminder_completion_rate_pct: pct(completed, fired), // secondary, target >30%
    did_you_cook_yes_rate_pct: pct(cooked, cookedAsked), // lagging, target >40%
  };
}
