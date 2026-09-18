// Reminder scheduler (D3). Boring, durable: polls cook_reminders for due rows and
// fires them idempotently (state guard in the UPDATE prevents double-fire). In
// production this maps onto GoLemon's existing job infra; here it's an interval.
import { db, now } from '../db.js';
import { track } from './analytics.js';

let timer = null;

export function startScheduler(intervalMs = 5000) {
  if (timer) return;
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
}
export function stopScheduler() { clearInterval(timer); timer = null; }

export function tick() {
  const due = db.prepare(
    `SELECT * FROM cook_reminders WHERE state='pending' AND remind_at <= ? ORDER BY remind_at`).all(now());
  for (const r of due) {
    // idempotent fire: only transition if still pending
    const res = db.prepare(
      `UPDATE cook_reminders SET state='fired', updated_at=? WHERE id=? AND state='pending'`).run(now(), r.id);
    if (res.changes === 1) {
      track('reminder_fired', { session_id: r.basket_session_id, meal_name: r.meal_name, archetype_id: r.archetype_id }, r.user_id);
    }
  }
  return due.length;
}
