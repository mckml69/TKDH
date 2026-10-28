import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, statSync, existsSync, mkdirSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { findUserById, readUsers } from "./auth.js";

/**
 * Staff training: serves a training pack to signed-in users, marks their answers on the
 * server, and stores every attempt in the append-only training_attempts table (db.js).
 *
 * The pack (briefings, questions, answers, contact details, floor plans) is NOT part of this
 * repository. It lives in a directory named by TRAINING_PACK_DIR — pack.json plus a plans/
 * folder — so a public copy of the code never contains the answer key or anyone's phone
 * number. With TRAINING_PACK_DIR unset the whole feature is off (a venue with no pack of its
 * own, like the pub, simply doesn't set it).
 *
 * The pack served to the browser has NO answers in it. The browser posts the option text the
 * person picked for each question and the server decides the score, the pass/fail, the
 * expiry date and the certificate number. Who the person is comes from the session cookie,
 * never from the request body.
 */

// ---------------------------------------------------------------------------
// Pack loading and validation
// ---------------------------------------------------------------------------

let cache = null; // { dir, mtimeMs, pack, byId }

function fail(msg) { throw new Error(`training pack: ${msg}`); }

export function validatePack(pack) {
  if (!pack || typeof pack !== "object") fail("pack.json is not an object");
  if (typeof pack.hotelName !== "string" || !pack.hotelName) fail("hotelName is required");
  const passMark = pack.passMark;
  if (typeof passMark !== "number" || !(passMark > 0 && passMark <= 1)) fail("passMark must be a number between 0 and 1");
  if (!Array.isArray(pack.modules) || pack.modules.length === 0) fail("modules must be a non-empty array");
  const ids = new Set();
  for (const m of pack.modules) {
    if (!m || typeof m.id !== "string" || !m.id) fail("every module needs an id");
    if (ids.has(m.id)) fail(`duplicate module id ${m.id}`);
    ids.add(m.id);
    if (m.kind !== undefined && m.kind !== "info" && m.kind !== "assessment") fail(`module ${m.id}: kind must be "assessment" or "info"`);
    // An "info" module is read-only awareness material with no quiz and no certificate: people mark it as read.
    const info = m.kind === "info";
    for (const f of info ? ["title", "version"] : ["code", "title", "version"]) if (typeof m[f] !== "string" || !m[f]) fail(`module ${m.id}: ${f} is required`);
    if (info) {
      if (m.refreshMonths != null && (!Number.isInteger(m.refreshMonths) || m.refreshMonths < 1)) fail(`module ${m.id}: refreshMonths must be a positive whole number, or left out for no expiry`);
      if (typeof m.briefing !== "string" || !m.briefing.trim()) fail(`module ${m.id}: an information module needs a briefing`);
      if (Array.isArray(m.questions) && m.questions.length > 0) fail(`module ${m.id}: an information module has no questions`);
      continue;
    }
    if (!/^[A-Z]{2,5}$/.test(m.code)) fail(`module ${m.id}: code must be 2-5 capital letters`);
    if (!Number.isInteger(m.refreshMonths) || m.refreshMonths < 1) fail(`module ${m.id}: refreshMonths must be a positive whole number`);
    if (!Array.isArray(m.questions) || m.questions.length === 0) fail(`module ${m.id}: questions must be a non-empty array`);
    const stems = new Set();
    for (const q of m.questions) {
      if (!q || typeof q.stem !== "string" || !q.stem) fail(`module ${m.id}: a question has no stem`);
      if (stems.has(q.stem)) fail(`module ${m.id}: duplicate question "${q.stem}"`);
      stems.add(q.stem);
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.some((o) => typeof o !== "string" || !o)) fail(`module ${m.id}: "${q.stem}" needs at least two text options`);
      if (new Set(q.options).size !== q.options.length) fail(`module ${m.id}: "${q.stem}" has duplicate options`);
      if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= q.options.length) fail(`module ${m.id}: "${q.stem}" has a bad answerIndex`);
    }
  }
}

/** Returns { enabled:false } when no pack is configured (or it is broken), else { enabled:true, pack, byId, dir }. */
export function loadPack() {
  const dir = process.env.TRAINING_PACK_DIR;
  if (!dir) return { enabled: false, reason: "not configured" };
  const file = path.join(dir, "pack.json");
  let st;
  try { st = statSync(file); } catch { return { enabled: false, reason: "pack.json not found" }; }
  if (cache && cache.dir === dir && cache.mtimeMs === st.mtimeMs) return cache;
  try {
    const pack = JSON.parse(readFileSync(file, "utf8"));
    validatePack(pack);
    for (const m of pack.modules) { m.kind = m.kind === "info" ? "info" : "assessment"; if (!Array.isArray(m.questions)) m.questions = []; }
    cache = {
      enabled: true, dir, mtimeMs: st.mtimeMs, pack,
      byId: new Map(pack.modules.map((m) => [m.id, m])),
    };
    return cache;
  } catch (err) {
    console.error(`Training pack could not be loaded from ${file}:`, err.message);
    cache = null;
    return { enabled: false, reason: "pack is invalid" };
  }
}

// ---------------------------------------------------------------------------
// Installing a pack from the browser (General Manager only), so the pack can be put on the server's disk and
// replaced later without shell access. Everything is validated BEFORE anything is written, and pack.json is
// written last, so a half-finished upload can never leave a broken pack live.
// ---------------------------------------------------------------------------

const PLAN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}\.png$/;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
// Photos used inside a briefing (<img data-training-image="name.jpg">) live in an images/ folder next to pack.json.
const IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}\.(jpe?g|webp)$/i;
const isJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isWebp = (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
/** The image file names a briefing refers to. */
export function referencedImages(pack) {
  const names = new Set();
  for (const m of pack?.modules || []) for (const mt of String(m.briefing || "").matchAll(/data-training-image="([^"]+)"/g)) names.add(mt[1]);
  return names;
}

export function summarisePack(pack) {
  return {
    hotelName: pack.hotelName,
    modules: pack.modules.map((m) => ({ id: m.id, title: m.title, version: m.version, kind: m.kind || "assessment", questions: (m.questions || []).length })),
    plans: (pack.plans || []).map((p) => p.file),
  };
}

/** files: [{ name, contentBase64 }] where name is "pack.json", a floor-plan PNG's bare file name, or "images/<name>.jpg" for a briefing photo. Throws { status, message }. */
export function installPack(dir, files) {
  const bad = (message) => ({ status: 400, message });
  if (!Array.isArray(files) || files.length === 0 || files.length > 40) throw bad("send between 1 and 40 files");
  let packBytes = null;
  const plans = new Map();
  const images = new Map();
  for (const f of files) {
    if (!f || typeof f.name !== "string" || typeof f.contentBase64 !== "string") throw bad("each file needs a name and its content");
    const bytes = Buffer.from(f.contentBase64, "base64");
    if (bytes.length === 0) throw bad(`${f.name} is empty`);
    if (bytes.length > MAX_FILE_BYTES) throw bad(`${f.name} is too large`);
    if (f.name === "pack.json") packBytes = bytes;
    else if (PLAN_NAME.test(f.name)) {
      if (!bytes.subarray(0, 4).equals(PNG_SIGNATURE)) throw bad(`${f.name} is not a PNG image`);
      plans.set(f.name, bytes);
    } else if (f.name.startsWith("images/") && IMAGE_NAME.test(f.name.slice(7))) {
      if (!isJpeg(bytes) && !isWebp(bytes)) throw bad(`${f.name} is not a JPEG or WebP image`);
      images.set(f.name.slice(7), bytes);
    } else throw bad(`unexpected file "${f.name}": upload pack.json, the floor-plan .png files and images/<name>.jpg photos only`);
  }
  let pack = null;
  if (packBytes) {
    try { pack = JSON.parse(packBytes.toString("utf8")); validatePack(pack); } catch (e) { throw bad(e.message); }
    for (const p of pack.plans || []) if (typeof p.file !== "string" || !PLAN_NAME.test(p.file)) throw bad(`training pack: plan file name "${p.file}" is not allowed`);
  }
  const plansDir = path.join(dir, "plans");
  const imagesDir = path.join(dir, "images");
  const haveImages = new Set(existsSync(imagesDir) ? readdirSync(imagesDir) : []);
  for (const n of images.keys()) haveImages.add(n);
  if (pack) for (const n of referencedImages(pack)) if (!haveImages.has(n)) throw bad(`a briefing uses the photo ${n}, but it has not been uploaded (send it as images/${n})`);
  const present = new Set(existsSync(plansDir) ? readdirSync(plansDir) : []);
  for (const n of plans.keys()) present.add(n);
  if (pack) for (const p of pack.plans || []) if (!present.has(p.file)) throw bad(`pack.json lists the floor plan ${p.file}, but it has not been uploaded`);

  mkdirSync(plansDir, { recursive: true });
  if (images.size) mkdirSync(imagesDir, { recursive: true });
  const put = (full, bytes) => { const tmp = `${full}.tmp-${process.pid}`; writeFileSync(tmp, bytes); renameSync(tmp, full); };
  for (const [name, bytes] of plans) put(path.join(plansDir, name), bytes);
  for (const [name, bytes] of images) put(path.join(imagesDir, name), bytes);
  if (packBytes) put(path.join(dir, "pack.json"), packBytes);
  return { installed: [...plans.keys(), ...[...images.keys()].map((n) => "images/" + n), ...(packBytes ? ["pack.json"] : [])], pack: pack ? summarisePack(pack) : null };
}

/** What the browser is allowed to see: everything except answers and explanations. */
export function publicPack(pack) {
  return {
    hotelName: pack.hotelName,
    passMark: pack.passMark,
    signedBy: pack.signedBy || null,
    plans: (pack.plans || []).map((p) => ({ label: p.label, file: p.file, note: p.note || "" })),
    modules: pack.modules.map((m) => ({
      id: m.id, code: m.code || null, kind: m.kind || "assessment", title: m.title, group: m.group || "", version: m.version,
      refreshMonths: m.refreshMonths ?? null, minutes: m.minutes || null, certNote: m.certNote || null,
      briefing: m.briefing || "",
      questionCount: (m.questions || []).length,
      passMarkCount: passMarkCount((m.questions || []).length, pack.passMark),
      questions: (m.questions || []).map((q) => ({ stem: q.stem, options: q.options })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Marking, expiry, certificate numbers
// ---------------------------------------------------------------------------

/** Number of correct answers needed. The small epsilon stops 0.8 * 5 style float noise rounding up. */
export function passMarkCount(total, passMark) {
  return Math.ceil(total * passMark - 1e-9);
}

/** Adds calendar months in UTC, clamping to the last day of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

const CERT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1

function newCertificateNo(code, when) {
  const ymd = when.toISOString().slice(0, 10).replaceAll("-", "");
  const bytes = randomBytes(4);
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += CERT_ALPHABET[bytes[i] % CERT_ALPHABET.length];
  return `${code}-${ymd}-${suffix}`;
}

/**
 * Marks submitted answers against the server's own copy of the module.
 * `answers` is [{ question, chosen }] where question is the stem and chosen is the option text.
 * Throws a { status, message } object for malformed input. An unanswered question, or an option
 * that isn't one of the real options, simply counts as wrong.
 */
export function markAnswers(mod, passMark, answers) {
  if (!Array.isArray(answers) || answers.length > mod.questions.length) throw { status: 400, message: "answers must be a list with at most one entry per question" };
  const byStem = new Map();
  for (const a of answers) {
    if (!a || typeof a.question !== "string" || (a.chosen != null && typeof a.chosen !== "string")) throw { status: 400, message: "each answer needs a question and the text of the option chosen" };
    if (a.question.length > 1000 || (a.chosen || "").length > 1000) throw { status: 400, message: "answer text is too long" };
    if (byStem.has(a.question)) throw { status: 400, message: "a question was answered twice" };
    byStem.set(a.question, a.chosen ?? null);
  }
  const known = new Set(mod.questions.map((q) => q.stem));
  for (const stem of byStem.keys()) if (!known.has(stem)) throw { status: 400, message: "an answer does not match any question in this module; reload and try again" };

  const review = mod.questions.map((q) => {
    const chosen = byStem.get(q.stem) ?? null;
    const correct = q.options[q.answerIndex];
    return { question: q.stem, chosen, correct, isCorrect: chosen === correct, explanation: q.explanation || "" };
  });
  const score = review.filter((r) => r.isCorrect).length;
  const total = review.length;
  const needed = passMarkCount(total, passMark);
  return { review, score, total, needed, passed: score >= needed };
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

const insertAttempt = db.prepare(`
  INSERT INTO training_attempts
    (id, user_id, user_name, user_email, module_id, module_version, score, total, pass_mark_count, passed, completed_at, valid_until, certificate_no, answers)
  VALUES (@id, @user_id, @user_name, @user_email, @module_id, @module_version, @score, @total, @pass_mark_count, @passed, @completed_at, @valid_until, @certificate_no, @answers)
`);

function rowToAttempt(r) {
  return {
    id: r.id, userId: r.user_id, name: r.user_name, email: r.user_email || null, moduleId: r.module_id, version: r.module_version,
    score: r.score, total: r.total, passed: !!r.passed, completedAt: r.completed_at, validUntil: r.valid_until, certNo: r.certificate_no,
  };
}

/** Per module: the latest pass if there is one, otherwise the latest attempt (the shape the Training page wants). */
function resultsFor(userId) {
  const rows = db.prepare("SELECT * FROM training_attempts WHERE user_id = ? ORDER BY completed_at ASC, rowid ASC").all(userId);
  const results = {};
  for (const r of rows) {
    const cur = results[r.module_id];
    if (r.passed || !cur || !cur.passed) results[r.module_id] = rowToAttempt(r);
  }
  return results;
}

// ---------------------------------------------------------------------------
// People: Staff register entries, logins, the pairing between them, and assignments
// ---------------------------------------------------------------------------

/** The Staff register lives in the shared "ledger-staff" kv_store blob, like the users do. */
function readStaff() {
  const row = db.prepare("SELECT value FROM kv_store WHERE key = 'ledger-staff' AND shared = 1").get();
  if (!row) return [];
  try { const parsed = JSON.parse(row.value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

const isGM = (user) => user?.role === "General Manager";

/** Which Staff register entry this login is paired with, and which modules that entry has been given. */
function assignmentFor(userId) {
  const link = db.prepare("SELECT staff_id FROM training_links WHERE user_id = ?").get(userId);
  if (!link) return { linked: false, staffId: null, moduleIds: [] };
  const rows = db.prepare("SELECT module_id FROM training_assignments WHERE staff_id = ?").all(link.staff_id);
  return { linked: true, staffId: link.staff_id, moduleIds: rows.map((r) => r.module_id) };
}

/**
 * The name to print for each login. A login that is paired with a Staff register entry uses that entry's name, because
 * that is where the full, correct name is kept; a login account's own name can be just a first name or a nickname.
 * Logins that aren't paired (for example the General Manager's own) fall back to the name on the login account, which is
 * what was stored when they took the module. Resolved when read, so correcting a name in the Staff register corrects it
 * on every certificate for that person.
 */
function printedNames() {
  const staffNames = new Map(readStaff().map((s) => [s.id, String(s.name || "").trim()]));
  const byUser = new Map();
  for (const l of db.prepare("SELECT staff_id, user_id FROM training_links").all()) {
    const name = staffNames.get(l.staff_id);
    if (name) byUser.set(l.user_id, name);
  }
  return byUser;
}

function peopleSnapshot(byId) {
  const links = new Map(db.prepare("SELECT staff_id, user_id FROM training_links").all().map((l) => [l.staff_id, l.user_id]));
  const assigned = new Map();
  for (const a of db.prepare("SELECT staff_id, module_id FROM training_assignments").all()) {
    if (!byId.has(a.module_id)) continue; // module has since been removed from the pack
    if (!assigned.has(a.staff_id)) assigned.set(a.staff_id, []);
    assigned.get(a.staff_id).push(a.module_id);
  }
  return {
    staff: readStaff().map((s) => ({
      id: s.id, name: s.name, role: s.role || "", email: s.email || "", archived: !!s.archived,
      userId: links.get(s.id) || null, moduleIds: assigned.get(s.id) || [],
    })),
    users: readUsers().filter((u) => !u.archived).map((u) => ({ id: u.id, name: u.name, email: u.email || "", role: u.role })),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function trainingRouter(requireAuth) {
  const router = Router();

  // Open on purpose: lets the frontend decide whether to show the Training section at all.
  // `configured` means this deployment is meant to have training (TRAINING_PACK_DIR is set), even if no pack has
  // been installed yet. It lets a General Manager reach the "install the pack" page on a brand-new setup.
  router.get("/status", (req, res) => res.json({ enabled: loadPack().enabled, configured: !!process.env.TRAINING_PACK_DIR }));

  router.use(requireAuth);
  router.use((req, res, next) => (req.user ? next() : res.status(401).json({ error: "authentication required" })));
  const requireGM = (req, res, next) => (isGM(req.user) ? next() : res.status(403).json({ error: "only a General Manager can do this" }));

  // Pack management works whether or not a pack is installed yet, so it sits above the "is training enabled" check.
  router.get("/pack-info", requireGM, (req, res) => {
    const loaded = loadPack();
    res.json({ configured: !!process.env.TRAINING_PACK_DIR, enabled: loaded.enabled, reason: loaded.enabled ? null : loaded.reason || null, pack: loaded.enabled ? summarisePack(loaded.pack) : null });
  });
  router.put("/pack-files", requireGM, (req, res) => {
    const dir = process.env.TRAINING_PACK_DIR;
    if (!dir) return res.status(409).json({ error: "TRAINING_PACK_DIR is not set on this server, so there is nowhere to install the pack" });
    try {
      const result = installPack(dir, req.body?.files);
      res.json({ ...result, enabled: loadPack().enabled });
    } catch (e) {
      if (e && e.status) return res.status(e.status).json({ error: e.message });
      console.error("Installing the training pack failed:", e);
      res.status(500).json({ error: "the pack could not be written to the server's disk" });
    }
  });

  router.use((req, res, next) => {
    const loaded = loadPack();
    if (!loaded.enabled) return res.status(404).json({ error: "training is not available on this deployment" });
    req.training = loaded;
    next();
  });

  /** A General Manager sees every module. Everyone else sees only the modules assigned to their Staff entry. */
  router.get("/pack", (req, res) => {
    const full = publicPack(req.training.pack);
    if (!isGM(req.user)) {
      const mine = new Set(assignmentFor(req.user.id).moduleIds);
      full.modules = full.modules.filter((m) => mine.has(m.id));
    }
    res.json(full);
  });

  // Photos used inside briefings. Any signed-in person may load them (they are part of the briefings they can read).
  router.get("/images/:file", (req, res) => {
    const file = path.basename(req.params.file);
    const full = path.join(req.training.dir, "images", file);
    if (!IMAGE_NAME.test(file) || !existsSync(full)) return res.status(404).json({ error: "not found" });
    res.set("Cache-Control", "private, max-age=3600");
    res.sendFile(path.resolve(full));
  });

  router.get("/plans/:file", (req, res) => {
    const file = path.basename(req.params.file);
    const allowed = (req.training.pack.plans || []).some((p) => p.file === file);
    const full = path.join(req.training.dir, "plans", file);
    if (!allowed || !existsSync(full)) return res.status(404).json({ error: "not found" });
    res.sendFile(path.resolve(full));
  });

  router.get("/me", (req, res) => {
    const results = resultsFor(req.user.id);
    const history = db.prepare("SELECT * FROM training_attempts WHERE user_id = ? ORDER BY completed_at DESC, rowid DESC LIMIT 100").all(req.user.id).map(rowToAttempt);
    const a = assignmentFor(req.user.id);
    const gm = isGM(req.user);
    res.json({
      results, history,
      linked: a.linked,
      assignedModuleIds: gm ? [...req.training.byId.keys()] : a.moduleIds.filter((id) => req.training.byId.has(id)),
      canTakeAny: gm,
    });
  });

  // Training this person has been asked to do and hasn't finished: assigned modules they haven't started, last attempted
  // without passing, or passed but expired. Only what is actually assigned to their Staff entry counts, so a General
  // Manager (who can open every module) isn't reminded about modules nobody gave them, and someone with nothing
  // assigned, or whose login isn't paired with a Staff entry, gets no reminder at all.
  router.get("/reminders", (req, res) => {
    const assigned = new Set(assignmentFor(req.user.id).moduleIds);
    const results = resultsFor(req.user.id);
    const now = Date.now();
    const outstanding = [];
    for (const mod of req.training.pack.modules) {
      if (!assigned.has(mod.id)) continue;
      const r = results[mod.id];
      let reason = null;
      if (!r) reason = "not-started";
      else if (!r.passed) reason = "not-passed";
      else if (r.validUntil && new Date(r.validUntil).getTime() < now) reason = "expired";
      if (reason) outstanding.push({ moduleId: mod.id, title: mod.title, kind: mod.kind || "assessment", reason, validUntil: r?.validUntil || null });
    }
    res.json({ outstanding });
  });

  // An information-only module has no quiz: the person confirms they have read it. Stored like every other result
  // (append-only, same assignment rules), but with no score and no certificate. It expires only if the module says so.
  router.post("/acknowledge", (req, res) => {
    const { moduleId, moduleVersion } = req.body || {};
    const mod = typeof moduleId === "string" ? req.training.byId.get(moduleId) : null;
    if (!mod) return res.status(400).json({ error: "unknown module" });
    if (mod.kind !== "info") return res.status(400).json({ error: "this module has an assessment; take the assessment instead" });
    if (!isGM(req.user) && !assignmentFor(req.user.id).moduleIds.includes(mod.id)) {
      return res.status(403).json({ error: "this module has not been assigned to you" });
    }
    if (moduleVersion !== mod.version) return res.status(409).json({ error: "this module has been updated; reload the page and read it again", currentVersion: mod.version });
    const completedAt = new Date();
    const validUntil = mod.refreshMonths ? addMonths(completedAt, mod.refreshMonths) : null;
    insertAttempt.run({
      id: randomUUID(), user_id: req.user.id, user_name: req.user.name, user_email: req.user.email || null,
      module_id: mod.id, module_version: mod.version, score: 0, total: 0, pass_mark_count: 0, passed: 1,
      completed_at: completedAt.toISOString(), valid_until: validUntil ? validUntil.toISOString() : null, certificate_no: null, answers: "[]",
    });
    res.status(201).json({ acknowledged: true, moduleId: mod.id, version: mod.version, completedAt: completedAt.toISOString(), validUntil: validUntil ? validUntil.toISOString() : null });
  });

  router.post("/attempts", (req, res) => {
    const { moduleId, moduleVersion, answers } = req.body || {};
    const mod = typeof moduleId === "string" ? req.training.byId.get(moduleId) : null;
    if (!mod) return res.status(400).json({ error: "unknown module" });
    if (mod.kind === "info") return res.status(400).json({ error: "this module has no assessment; mark it as read instead" });
    if (!isGM(req.user) && !assignmentFor(req.user.id).moduleIds.includes(mod.id)) {
      return res.status(403).json({ error: "this module has not been assigned to you" });
    }
    if (moduleVersion !== mod.version) return res.status(409).json({ error: "this module has been updated; reload the page and start again", currentVersion: mod.version });

    let marked;
    try { marked = markAnswers(mod, req.training.pack.passMark, answers); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message || "bad request" }); }

    const completedAt = new Date();
    const validUntil = marked.passed ? addMonths(completedAt, mod.refreshMonths) : null;
    const base = {
      id: randomUUID(), user_id: req.user.id, user_name: req.user.name, user_email: req.user.email || null,
      module_id: mod.id, module_version: mod.version, score: marked.score, total: marked.total, pass_mark_count: marked.needed,
      passed: marked.passed ? 1 : 0, completed_at: completedAt.toISOString(), valid_until: validUntil ? validUntil.toISOString() : null,
      answers: JSON.stringify(marked.review),
    };

    let certificateNo = null;
    if (marked.passed) {
      for (let i = 0; i < 8 && !certificateNo; i++) {
        const candidate = newCertificateNo(mod.code, completedAt);
        try { insertAttempt.run({ ...base, certificate_no: candidate }); certificateNo = candidate; }
        catch (err) { if (!/UNIQUE/i.test(String(err.message))) throw err; }
      }
      if (!certificateNo) return res.status(500).json({ error: "could not issue a certificate number; please try again" });
    } else {
      insertAttempt.run({ ...base, certificate_no: null });
    }

    res.status(201).json({
      attemptId: base.id, moduleId: mod.id, moduleTitle: mod.title, version: mod.version,
      score: marked.score, total: marked.total, passMarkCount: marked.needed, passed: marked.passed,
      completedAt: base.completed_at, validUntil: base.valid_until, certificateNo,
      review: marked.review,
    });
  });

  // A list of issued certificates: a General Manager sees everyone's, anyone else sees only their own.
  router.get("/certificates", (req, res) => {
    const rows = isGM(req.user)
      ? db.prepare("SELECT * FROM training_attempts WHERE certificate_no IS NOT NULL ORDER BY completed_at DESC, rowid DESC").all()
      : db.prepare("SELECT * FROM training_attempts WHERE certificate_no IS NOT NULL AND user_id = ? ORDER BY completed_at DESC, rowid DESC").all(req.user.id);
    const names = printedNames();
    res.json({
      certificates: rows.map((r) => ({
        certificateNo: r.certificate_no, userId: r.user_id, name: names.get(r.user_id) || r.user_name, moduleId: r.module_id,
        moduleTitle: req.training.byId.get(r.module_id)?.title || r.module_id, version: r.module_version,
        score: r.score, total: r.total, completedAt: r.completed_at, validUntil: r.valid_until,
      })),
    });
  });

  router.get("/certificates/:no", (req, res) => {
    const row = db.prepare("SELECT * FROM training_attempts WHERE certificate_no = ?").get(req.params.no);
    if (!row) return res.status(404).json({ error: "certificate not found" });
    if (row.user_id !== req.user.id && !isGM(req.user)) return res.status(403).json({ error: "not allowed" });
    const mod = req.training.byId.get(row.module_id);
    res.json({
      certificateNo: row.certificate_no, name: printedNames().get(row.user_id) || row.user_name, moduleId: row.module_id, moduleTitle: mod?.title || row.module_id,
      version: row.module_version, score: row.score, total: row.total, completedAt: row.completed_at, validUntil: row.valid_until,
      certNote: mod?.certNote || null, hotelName: req.training.pack.hotelName, signedBy: req.training.pack.signedBy || null,
    });
  });

  // ----- General Manager only: the whole team -----

  // Summary for the whole team: per person and module, the latest pass, how many tries and whether the last one passed.
  // No answers. staffId is filled in where the login has been paired with a Staff register entry.
  router.get("/records", requireGM, (req, res) => {
    const rows = db.prepare("SELECT * FROM training_attempts ORDER BY completed_at ASC, rowid ASC").all();
    const staffByUser = new Map(db.prepare("SELECT staff_id, user_id FROM training_links").all().map((l) => [l.user_id, l.staff_id]));
    const names = printedNames();
    const map = new Map();
    for (const r of rows) {
      const key = `${r.user_id}|${r.module_id}`;
      const cur = map.get(key) || { userId: r.user_id, staffId: staffByUser.get(r.user_id) || null, userName: r.user_name, userEmail: r.user_email || null, moduleId: r.module_id, lastPass: null, attempts: 0, lastAttemptAt: null, lastAttemptPassed: false };
      cur.userName = names.get(r.user_id) || r.user_name; cur.userEmail = r.user_email || cur.userEmail;
      cur.attempts += 1; cur.lastAttemptAt = r.completed_at; cur.lastAttemptPassed = !!r.passed;
      if (r.passed) cur.lastPass = { score: r.score, total: r.total, completedAt: r.completed_at, validUntil: r.valid_until, certNo: r.certificate_no, version: r.module_version };
      map.set(key, cur);
    }
    res.json({ records: [...map.values()].map((r) => ({ ...r, moduleTitle: req.training.byId.get(r.moduleId)?.title || r.moduleId, kind: req.training.byId.get(r.moduleId)?.kind || "assessment" })) });
  });

  router.get("/people", requireGM, (req, res) => res.json(peopleSnapshot(req.training.byId)));

  // Pair a Staff register entry with a login, or unpair it (userId: null).
  router.put("/links", requireGM, (req, res) => {
    const { staffId, userId } = req.body || {};
    if (typeof staffId !== "string" || !readStaff().some((s) => s.id === staffId)) return res.status(400).json({ error: "unknown staff member" });
    if (userId == null) {
      db.prepare("DELETE FROM training_links WHERE staff_id = ?").run(staffId);
      return res.json(peopleSnapshot(req.training.byId));
    }
    if (typeof userId !== "string" || !findUserById(userId)) return res.status(400).json({ error: "unknown login" });
    const existing = db.prepare("SELECT staff_id FROM training_links WHERE user_id = ?").get(userId);
    if (existing && existing.staff_id !== staffId) return res.status(409).json({ error: "that login is already paired with another staff member; unpair it first" });
    db.prepare(
      `INSERT INTO training_links (staff_id, user_id, linked_by) VALUES (?, ?, ?)
       ON CONFLICT(staff_id) DO UPDATE SET user_id = excluded.user_id, linked_at = datetime('now'), linked_by = excluded.linked_by`
    ).run(staffId, userId, req.user.name);
    res.json(peopleSnapshot(req.training.byId));
  });

  // Give modules to (or take them from) one or more Staff register entries.
  router.put("/assignments", requireGM, (req, res) => {
    const { staffIds, moduleIds, assigned } = req.body || {};
    const isList = (v) => Array.isArray(v) && v.length > 0 && v.length <= 100 && v.every((x) => typeof x === "string");
    if (!isList(staffIds) || !isList(moduleIds) || typeof assigned !== "boolean") return res.status(400).json({ error: "staffIds, moduleIds and assigned are required" });
    const known = new Set(readStaff().map((s) => s.id));
    if (staffIds.some((id) => !known.has(id))) return res.status(400).json({ error: "unknown staff member" });
    if (moduleIds.some((id) => !req.training.byId.has(id))) return res.status(400).json({ error: "unknown module" });
    const add = db.prepare("INSERT OR IGNORE INTO training_assignments (staff_id, module_id, assigned_by) VALUES (?, ?, ?)");
    const remove = db.prepare("DELETE FROM training_assignments WHERE staff_id = ? AND module_id = ?");
    db.transaction(() => {
      for (const s of staffIds) for (const m of moduleIds) assigned ? add.run(s, m, req.user.name) : remove.run(s, m);
    })();
    res.json(peopleSnapshot(req.training.byId));
  });

  return router;
}
