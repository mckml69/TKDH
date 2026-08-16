import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, realpathSync } from "node:fs";
import { db } from "./db.js";
import {
  COOKIE_NAME, authIsActive, createSession, deleteSession, findUserByEmail, findUserById,
  getCredential, getSessionUser, publicUser, readUsers, setCredential, verifyPassword, writeUsers,
} from "./auth.js";
import { r2Enabled, putAttachment, getAttachment, deleteAttachment } from "./r2.js";

/**
 * Reference backend for Compliance Ledger.
 *
 * Implements exactly the contract src/lib/storage/apiAdapter.js expects:
 *   GET    /api/storage/:key           -> { key, value, shared: true }
 *   PUT    /api/storage/:key  {value}  -> { key, value, shared: true }
 *   DELETE /api/storage/:key           -> { key, deleted: true, shared: true }
 *   GET    /api/storage?prefix=x       -> { keys: [...], prefix, shared: true }
 *
 * Only "shared" data ever reaches this server — personal, per-browser data
 * (which user is signed in on this device) never leaves localStorage. See
 * src/lib/storage/apiAdapter.js for that split.
 *
 * AUTH: /api/storage/* is open (matching this server's original trust-everything
 * behavior) until the very first account is bootstrapped via /api/auth/bootstrap —
 * at that point every request to /api/storage/* requires a valid session cookie.
 * See server/auth.js for the hashing/session implementation and README.md for why
 * this two-phase design exists (a fresh `npm install && npm start` still "just
 * works" for a first look, but the moment real auth is set up, it's enforced for
 * everyone, including other already-open tabs).
 */
const app = express();
const isProd = process.env.NODE_ENV === "production";
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

const PORT = process.env.PORT || 4000;
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

function setSessionCookie(res, rawToken, expiresAt) {
  res.cookie(COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    expires: new Date(expiresAt),
    path: "/",
  });
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

function requireAuth(req, res, next) {
  if (!authIsActive()) return next(); // no account bootstrapped yet — behave exactly like the original open server
  const user = getSessionUser(req.cookies?.[COOKIE_NAME]);
  if (!user) return res.status(401).json({ error: "authentication required" });
  req.user = user;
  next();
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

app.get("/api/auth/bootstrap-status", (req, res) => {
  res.json({ needsBootstrap: !authIsActive() });
});

app.post("/api/auth/bootstrap", (req, res) => {
  if (authIsActive()) return res.status(409).json({ error: "already bootstrapped" });
  const { name, email, password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });

  const users = readUsers();
  let user;
  if (users.length === 0) {
    // Fresh install: nobody has ever been created — this becomes the first General Manager.
    if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: "name and email are required" });
    const now = new Date().toISOString();
    user = {
      id: randomUUID(), name: name.trim(), email: email.trim(), role: "General Manager", tags: [],
      archived: false, archivedAt: null, createdAt: now.slice(0, 10), updatedAt: now.slice(0, 10),
      history: [{ at: now, action: "created", by: name.trim() }],
    };
    writeUsers([...users, user]);
  } else {
    // Upgrading a deployment that already has real users but no passwords yet: claim an
    // existing non-archived General Manager account by email rather than creating a duplicate.
    if (!email?.trim()) return res.status(400).json({ error: "email is required" });
    const existing = findUserByEmail(email);
    if (!existing || existing.role !== "General Manager") {
      return res.status(400).json({ error: "no matching General Manager account found for that email" });
    }
    user = existing;
  }

  setCredential(user.id, password);
  const { rawToken, expiresAt } = createSession(user.id);
  setSessionCookie(res, rawToken, expiresAt);
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = email && findUserByEmail(email);
  const cred = user && getCredential(user.id);
  if (!user || !cred || !verifyPassword(password || "", cred.password_hash)) {
    return res.status(401).json({ error: "invalid email or password" });
  }
  const { rawToken, expiresAt } = createSession(user.id);
  setSessionCookie(res, rawToken, expiresAt);
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  deleteSession(req.cookies?.[COOKIE_NAME]);
  clearSessionCookie(res);
  res.status(204).end();
});

app.get("/api/auth/session", (req, res) => {
  const user = getSessionUser(req.cookies?.[COOKIE_NAME]);
  if (!user) return res.status(401).json({ error: "not signed in" });
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/set-password", requireAuth, (req, res) => {
  if (!req.user) return res.status(401).json({ error: "authentication required" });
  const { userId, newPassword, currentPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "password must be at least 8 characters" });

  const isSelf = userId === req.user.id;
  if (req.user.role !== "General Manager") {
    if (!isSelf) return res.status(403).json({ error: "only a General Manager can reset another user's password" });
    const cred = getCredential(req.user.id);
    if (!cred || !verifyPassword(currentPassword || "", cred.password_hash)) {
      return res.status(401).json({ error: "current password is incorrect" });
    }
  }
  const target = findUserById(userId);
  if (!target) return res.status(404).json({ error: "user not found" });
  setCredential(target.id, newPassword);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// GENERIC STORAGE (gated by requireAuth once auth is active — see above)
//
// Attachments (`attach-*` keys) get special-cased to R2 when it's configured
// (r2Enabled — see r2.js): the actual bytes go to the bucket instead of the
// database, and kv_store keeps only a small { __r2__: true, mime } marker so
// GET/DELETE know to fetch/remove from R2 instead of reading the row directly.
// Everything else (and attachments written before R2 was ever configured, which
// still hold a full base64 data URL in kv_store — no marker) behaves exactly as
// before. This means older attachments keep working with no migration needed,
// and local dev with no R2 credentials falls back to the original behavior.
// ---------------------------------------------------------------------------

function isAttachmentKey(key) {
  return key.startsWith("attach-");
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  return match ? { mime: match[1], buffer: Buffer.from(match[2], "base64") } : null;
}

function parseR2Marker(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && parsed.__r2__ ? parsed : null;
  } catch {
    return null;
  }
}

app.get("/api/storage", requireAuth, (req, res) => {
  const prefix = req.query.prefix || "";
  const rows = db.prepare("SELECT key FROM kv_store WHERE shared = 1 AND key LIKE ?").all(`${prefix}%`);
  res.json({ keys: rows.map((r) => r.key), prefix, shared: true });
});

app.get("/api/storage/:key", requireAuth, async (req, res) => {
  const row = db.prepare("SELECT value FROM kv_store WHERE key = ? AND shared = 1").get(req.params.key);
  if (!row) return res.status(404).json({ error: "not found" });

  const marker = parseR2Marker(row.value);
  if (marker) {
    try {
      const { buffer, mime } = await getAttachment(req.params.key);
      const value = `data:${marker.mime || mime};base64,${buffer.toString("base64")}`;
      return res.json({ key: req.params.key, value, shared: true });
    } catch (err) {
      console.error(`R2 getAttachment failed for ${req.params.key}:`, err);
      return res.status(500).json({ error: "failed to load attachment from storage" });
    }
  }
  res.json({ key: req.params.key, value: row.value, shared: true });
});

app.put("/api/storage/:key", requireAuth, async (req, res) => {
  const { value } = req.body;
  if (typeof value !== "string") return res.status(400).json({ error: "value must be a string" });

  if (r2Enabled && isAttachmentKey(req.params.key)) {
    const parsed = parseDataUrl(value);
    if (parsed) {
      try {
        await putAttachment(req.params.key, parsed.buffer, parsed.mime);
        const marker = JSON.stringify({ __r2__: true, mime: parsed.mime });
        db.prepare(
          `INSERT INTO kv_store (key, value, shared, updated_at) VALUES (?, ?, 1, datetime('now'))
           ON CONFLICT(key, shared) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).run(req.params.key, marker);
        return res.json({ key: req.params.key, value, shared: true });
      } catch (err) {
        console.error(`R2 putAttachment failed for ${req.params.key}:`, err);
        return res.status(500).json({ error: "failed to save attachment to storage" });
      }
    }
  }

  db.prepare(
    `INSERT INTO kv_store (key, value, shared, updated_at) VALUES (?, ?, 1, datetime('now'))
     ON CONFLICT(key, shared) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(req.params.key, value);
  res.json({ key: req.params.key, value, shared: true });
});

app.delete("/api/storage/:key", requireAuth, async (req, res) => {
  const row = db.prepare("SELECT value FROM kv_store WHERE key = ? AND shared = 1").get(req.params.key);
  const marker = row && parseR2Marker(row.value);
  db.prepare("DELETE FROM kv_store WHERE key = ? AND shared = 1").run(req.params.key);
  if (marker) {
    try { await deleteAttachment(req.params.key); } catch (err) { console.error(`R2 deleteAttachment failed for ${req.params.key}:`, err); }
  }
  res.json({ key: req.params.key, deleted: true, shared: true });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// FRONTEND — serves the built Vite app (../dist) so the whole thing is one
// deployable service instead of two separately-hosted pieces. Only kicks in
// when a build actually exists (e.g. `npm run build` was run in the project
// root first) — local development still runs the frontend through Vite's own
// dev server on :5173 and never hits this. `apiAdapter.js` defaults
// VITE_API_BASE_URL to the relative "/api", which is exactly right here since
// frontend and backend are now the same origin — no CORS involved at all for
// real requests, only for local dev's split setup.
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(distDir, "index.html")));
}

// Only actually bind a port when this file is run directly (node index.js / npm start),
// not when it's imported — e.g. by index.test.js, which drives `app` itself via supertest
// without a real listening socket. See https://nodejs.org/api/esm.html#esm_main for why
// this is the robust cross-platform way to detect "am I the entry point" under ESM.
const isMainModule = process.argv[1] && (() => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`Compliance Ledger reference server listening on http://localhost:${PORT}`);
    if (existsSync(distDir)) console.log(`Serving the built frontend from ${distDir}`);
    else console.log(`No frontend build found at ${distDir} — run "npm run build" in the project root, or point a separate frontend dev server at VITE_API_BASE_URL=http://localhost:${PORT}/api`);
    if (!isProd && !process.env.COOKIE_SECURE) console.log(`(dev mode: COOKIE_SECURE=false, CORS_ORIGIN=${process.env.CORS_ORIGIN || "http://localhost:5173"})`);
  });
}

export { app };
