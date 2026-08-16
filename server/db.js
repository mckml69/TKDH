import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "data.sqlite");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

/**
 * This is deliberately the SIMPLEST possible backing store: one row per storage
 * key, matching the get/set/delete/list contract the frontend's apiAdapter.js
 * already calls. It gets a real, working, testable backend running quickly.
 *
 * It is NOT the recommended long-term schema. server/db/schema.sql documents a
 * proper relational schema (separate tables for records/assets/rooms/etc, a real
 * append-only history table, foreign keys) for when this app is ready to be
 * modelled properly rather than as one JSON blob per entity type. Migrating from
 * this kv_store to that schema is real work — see README.md "Next steps".
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    shared INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (key, shared)
  );
`);

/**
 * Auth tables — deliberately separate from kv_store so a password hash can never be
 * returned by the generic GET /api/storage/:key route, which has no access control
 * of its own and will happily return whatever's stored under any key. There is no
 * real `users` table (see server/auth.js — users live in the "ledger-users" kv_store
 * blob), so `credentials.user_id` is just that JSON blob's `id` field, not a foreign key.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    user_id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);
