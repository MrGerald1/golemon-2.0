// SQLite data layer. Implements the eng-review schema:
// basket_sessions (D2 persistence, D4 UNIQUE(order_id) idempotency, Sprint-2 forward-compat
// fields), cook_reminders (with cooking_confirmed for the "Did you cook?" loop), events
// (analytics), processed_webhooks (belt-and-braces idempotency), config (D5 kill switch).
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.GL_DB || join(__dirname, '..', 'golemon.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      household_size_declared TEXT,
      completed_order_count INTEGER DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT, unit TEXT, price INTEGER, was INTEGER,
      taxonomy TEXT,            -- GoLemon catalog node (coarse)
      shelf_category TEXT,      -- maps to shelf-life taxonomy (urgency)
      recipe_categories TEXT,   -- JSON array -> archetype required_categories (matching)
      emoji TEXT, tint TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT DEFAULT 'placed',   -- placed | delivered
      total INTEGER, item_count INTEGER,
      created_at TEXT, delivered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty INTEGER, prep TEXT
    );

    -- D2: the brief is generated once at webhook and persisted as a snapshot.
    CREATE TABLE IF NOT EXISTS basket_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      order_id TEXT NOT NULL UNIQUE,        -- D4: one session per order
      persona TEXT,
      brief_json TEXT,                      -- the full plan grid + shelf groups
      thumbs_feedback TEXT DEFAULT '{}',    -- ML signal
      session_type TEXT DEFAULT 'meal_plan',-- Sprint-2 forward-compat
      asked_did_you_cook INTEGER DEFAULT 0,
      created_at TEXT,
      expires_at TEXT                        -- created_at + 48h
    );
    CREATE INDEX IF NOT EXISTS ix_bs_user ON basket_sessions(user_id);
    CREATE INDEX IF NOT EXISTS ix_bs_user_created ON basket_sessions(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS cook_reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      basket_session_id TEXT NOT NULL,
      meal_name TEXT, archetype_id TEXT,
      remind_at TEXT,
      state TEXT DEFAULT 'pending',          -- pending | fired | snoozed | completed
      cooking_confirmed INTEGER,             -- NULL=not asked, 1/0 = answered
      deep_link TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_cr_sched ON cook_reminders(state, remind_at);
    CREATE INDEX IF NOT EXISTS ix_cr_user ON cook_reminders(user_id);

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, props TEXT, user_id TEXT, ts TEXT
    );

    CREATE TABLE IF NOT EXISTS processed_webhooks (
      event_id TEXT PRIMARY KEY, ts TEXT
    );

    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
  `);
}

export function now() { return new Date().toISOString(); }
export function uuid() { return crypto.randomUUID(); }
