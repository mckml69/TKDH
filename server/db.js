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

/**
 * Staff training results (see server/training.js). A real table, not a kv_store blob: the blob
 * is last-write-wins, so a stale client could overwrite everyone's results. This table is
 * append-only — the triggers below make UPDATE and DELETE fail outright, so a bug (or a
 * stale browser) can only ever add a row, never change or lose one. To correct a genuine
 * mistake by hand, drop the trigger in sqlite3, fix the row, and recreate the trigger by
 * restarting the server.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS training_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT,
    module_id TEXT NOT NULL,
    module_version TEXT NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    pass_mark_count INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    completed_at TEXT NOT NULL,
    valid_until TEXT,
    certificate_no TEXT UNIQUE,
    answers TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_training_user_module ON training_attempts(user_id, module_id, completed_at);
  -- Which login belongs to which Staff register entry (set by hand by a General Manager). One login per
  -- staff member and one staff member per login. staff_id is the "ledger-staff" blob's id.
  CREATE TABLE IF NOT EXISTS training_links (
    staff_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    linked_at TEXT NOT NULL DEFAULT (datetime('now')),
    linked_by TEXT
  );
  -- Which modules each Staff register entry has been asked to complete.
  CREATE TABLE IF NOT EXISTS training_assignments (
    staff_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
    assigned_by TEXT,
    PRIMARY KEY (staff_id, module_id)
  );
  CREATE TRIGGER IF NOT EXISTS training_attempts_no_update BEFORE UPDATE ON training_attempts
    BEGIN SELECT RAISE(ABORT, 'training_attempts is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS training_attempts_no_delete BEFORE DELETE ON training_attempts
    BEGIN SELECT RAISE(ABORT, 'training_attempts is append-only'); END;
`);
