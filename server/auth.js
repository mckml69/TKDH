import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { db } from "./db.js";

/**
 * Real authentication for the reference server, layered on top of the existing
 * kv_store rather than requiring the full relational migration first. There is
 * no real `users` table — users live as a JSON array under the shared kv_store
 * key "ledger-users" (see src/hooks/useUsers.js) — so every lookup here parses
 * that blob directly instead of joining against a table that doesn't exist.
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days, fixed, no sliding refresh

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sha256(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

/** Every user lives in the "ledger-users" kv_store blob, not a real table — parse it fresh each call. */
export function readUsers() {
  const row = db.prepare("SELECT value FROM kv_store WHERE key = 'ledger-users' AND shared = 1").get();
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Used only by bootstrap, to create the very first user before any client has ever
    written to "ledger-users". Every other user create/edit still goes through the
    normal PUT /api/storage/ledger-users route from the frontend's useUsers hook. */
export function writeUsers(users) {
  const value = JSON.stringify(users);
  db.prepare(
    `INSERT INTO kv_store (key, value, shared, updated_at) VALUES ('ledger-users', ?, 1, datetime('now'))
     ON CONFLICT(key, shared) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(value);
}

export function findUserById(id) {
  return readUsers().find((u) => u.id === id && !u.archived) || null;
}

export function findUserByEmail(email) {
  const needle = (email || "").trim().toLowerCase();
  if (!needle) return null;
  return readUsers().find((u) => !u.archived && (u.email || "").trim().toLowerCase() === needle) || null;
}

/** Public shape only — never leak password hashes or internal fields. */
export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function authIsActive() {
  return db.prepare("SELECT COUNT(*) AS c FROM credentials").get().c > 0;
}

export function getCredential(userId) {
  return db.prepare("SELECT password_hash FROM credentials WHERE user_id = ?").get(userId) || null;
}

export function setCredential(userId, password) {
  const hash = hashPassword(password);
  db.prepare(
    `INSERT INTO credentials (user_id, password_hash, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`
  ).run(userId, hash);
}

export function createSession(userId) {
  const rawToken = randomBytes(32).toString("hex");
  const id = sha256(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run(); // opportunistic cleanup, no cron needed at this scale
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expiresAt);
  return { rawToken, expiresAt };
}

export function deleteSession(rawToken) {
  if (!rawToken) return;
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sha256(rawToken));
}

/** Used when a password is reset out-of-band (see reset-password.js) — kills every
    existing session for that account, since whoever needed the reset can no longer
    be sure the old sessions are trustworthy. */
export function invalidateSessionsForUser(userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

/** Resolves a raw cookie token to a live, non-archived user — or null if the token is missing/expired/stale. */
export function getSessionUser(rawToken) {
  if (!rawToken) return null;
  const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?").get(sha256(rawToken));
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return findUserById(row.user_id);
}

export const COOKIE_NAME = "cl_session";
