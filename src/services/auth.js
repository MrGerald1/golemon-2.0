// Minimal auth scoping. The current user comes from x-user-id (a stand-in for
// GoLemon's session auth). ownsSession enforces the IDOR rule (D3 security):
// a basket_session may only be read by its owner; mismatch -> 404 (not 403) to
// avoid enumeration.
import { db } from '../db.js';

export function currentUser(req) {
  const id = req.get('x-user-id') || req.query.user || 'u_demo';
  // Persist the principal on first touch. Without a real row the delivery webhook
  // (which looks the user up for persona + increments completed_order_count) would
  // crash for every first-time user, not just tests. INSERT OR IGNORE is a no-op
  // for the seeded demo user and anyone already present.
  db.prepare('INSERT OR IGNORE INTO users(id, completed_order_count, created_at) VALUES(?, 0, ?)')
    .run(id, new Date().toISOString());
  return db.prepare('SELECT * FROM users WHERE id=?').get(id);
}

export function getOwnedSession(sessionId, userId) {
  const s = db.prepare('SELECT * FROM basket_sessions WHERE id=?').get(sessionId);
  if (!s || s.user_id !== userId) return null; // 404 on both missing and not-owned
  return s;
}
