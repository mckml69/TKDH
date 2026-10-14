import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";

/**
 * Training endpoints, against the real Express app and a throwaway SQLite file, with a tiny
 * FAKE pack written to a temp directory. The real pack never lives in this repository.
 */
const dbPath = join(tmpdir(), `compliance-ledger-training-test-${process.pid}-${Date.now()}.sqlite`);
const packDir = mkdtempSync(join(tmpdir(), "training-pack-test-"));
process.env.DATABASE_PATH = dbPath;
process.env.COOKIE_SECURE = "false";
process.env.NODE_ENV = "test";

const pack = {
  hotelName: "Test Hotel",
  passMark: 0.8,
  signedBy: "Test Manager, General Manager",
  plans: [{ label: "Ground", file: "ground.png", note: "n" }],
  modules: [
    {
      id: "alpha", code: "ALP", title: "Alpha Awareness", group: "Health & safety", version: "1.0", refreshMonths: 12, minutes: 5,
      briefing: "<p>Read this.</p>", certNote: "Awareness only.",
      questions: [
        { stem: "Q1?", options: ["right1", "wrong1a", "wrong1b", "wrong1c"], answerIndex: 0, explanation: "because 1" },
        { stem: "Q2?", options: ["wrong2a", "right2", "wrong2b", "wrong2c"], answerIndex: 1, explanation: "because 2" },
        { stem: "Q3?", options: ["wrong3a", "wrong3b", "right3", "wrong3c"], answerIndex: 2, explanation: "because 3" },
        { stem: "Q4?", options: ["wrong4a", "wrong4b", "wrong4c", "right4"], answerIndex: 3, explanation: "because 4" },
        { stem: "Q5?", options: ["right5", "wrong5a", "wrong5b", "wrong5c"], answerIndex: 0, explanation: "because 5" },
      ],
    },
    {
      id: "beta", code: "BET", title: "Beta Basics", group: "People", version: "2.0", refreshMonths: 1,
      questions: [
        { stem: "B1?", options: ["yes", "no"], answerIndex: 0, explanation: "" },
        { stem: "B2?", options: ["yes", "no"], answerIndex: 1, explanation: "" },
      ],
    },
  ],
};
const ALL_RIGHT = [
  { question: "Q1?", chosen: "right1" }, { question: "Q2?", chosen: "right2" }, { question: "Q3?", chosen: "right3" },
  { question: "Q4?", chosen: "right4" }, { question: "Q5?", chosen: "right5" },
];

let app, gm, staff, pat, staffEmail = "sam@hotel.test";

beforeAll(async () => {
  mkdirSync(join(packDir, "plans"));
  writeFileSync(join(packDir, "pack.json"), JSON.stringify(pack));
  writeFileSync(join(packDir, "plans", "ground.png"), Buffer.from("not-really-a-png"));
  writeFileSync(join(packDir, "plans", "secret.png"), Buffer.from("not listed in the pack"));
  process.env.TRAINING_PACK_DIR = packDir;
  ({ app } = await import("./index.js"));

  // GM via bootstrap, then a second (non-GM) user created the way the frontend does it: write the
  // ledger-users blob, then set their password.
  gm = request.agent(app);
  const boot = await gm.post("/api/auth/bootstrap").send({ name: "Test GM", email: "gm@hotel.test", password: "correct horse battery" });
  expect(boot.status).toBe(200);
  const users = JSON.parse((await gm.get("/api/storage/ledger-users")).body.value);
  users.push({ id: "user-sam", name: "Sam Reception", email: staffEmail, role: "Reception", tags: [], archived: false });
  await gm.put("/api/storage/ledger-users").send({ value: JSON.stringify(users) });
  const setPw = await gm.post("/api/auth/set-password").send({ userId: "user-sam", newPassword: "another good password" });
  expect(setPw.status).toBe(204);
  staff = request.agent(app);
  const login = await staff.post("/api/auth/login").send({ email: staffEmail, password: "another good password" });
  expect(login.status).toBe(200);

  // A second non-GM login (Pat) who starts off NOT paired with any Staff register entry.
  const users2 = JSON.parse((await gm.get("/api/storage/ledger-users")).body.value);
  users2.push({ id: "user-pat", name: "Pat Other", email: "pat@hotel.test", role: "Reception", tags: [], archived: false });
  await gm.put("/api/storage/ledger-users").send({ value: JSON.stringify(users2) });
  await gm.post("/api/auth/set-password").send({ userId: "user-pat", newPassword: "yet another password" });
  pat = request.agent(app);
  expect((await pat.post("/api/auth/login").send({ email: "pat@hotel.test", password: "yet another password" })).status).toBe(200);

  // The Staff register, as the frontend writes it.
  const staffList = [
    { id: "staff-sam", name: "Sam Reception", role: "Receptionist", email: staffEmail, archived: false },
    { id: "staff-pat", name: "Pat Other", role: "Receptionist", email: "pat@hotel.test", archived: false },
    { id: "staff-hk", name: "Agency Housekeeper", role: "Housekeeping", email: "", archived: false },
  ];
  await gm.put("/api/storage/ledger-staff").send({ value: JSON.stringify(staffList) });

  // Sam is paired and has both modules; Pat is set up inside the "assignments" tests below.
  expect((await gm.put("/api/training/links").send({ staffId: "staff-sam", userId: "user-sam" })).status).toBe(200);
  expect((await gm.put("/api/training/assignments").send({ staffIds: ["staff-sam"], moduleIds: ["alpha", "beta"], assigned: true })).status).toBe(200);
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) { try { unlinkSync(dbPath + suffix); } catch {} }
  rmSync(packDir, { recursive: true, force: true });
});

describe("access", () => {
  it("reports whether training is enabled without needing a login", async () => {
    const res = await request(app).get("/api/training/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, configured: true });
  });

  it("requires a session for everything else", async () => {
    for (const p of ["/api/training/pack", "/api/training/me", "/api/training/records", "/api/training/people", "/api/training/certificates", "/api/training/certificates/X"]) {
      const res = await request(app).get(p);
      expect(res.status).toBe(401);
    }
    const post = await request(app).post("/api/training/attempts").send({ moduleId: "alpha", moduleVersion: "1.0", answers: ALL_RIGHT });
    expect(post.status).toBe(401);
  });
});

describe("pack", () => {
  it("serves modules and questions without any answers or explanations", async () => {
    const res = await staff.get("/api/training/pack");
    expect(res.status).toBe(200);
    expect(res.body.hotelName).toBe("Test Hotel");
    const alpha = res.body.modules.find((m) => m.id === "alpha");
    expect(alpha.questionCount).toBe(5);
    expect(alpha.passMarkCount).toBe(4);
    expect(alpha.briefing).toBe("<p>Read this.</p>");
    expect(alpha.questions[0]).toEqual({ stem: "Q1?", options: ["right1", "wrong1a", "wrong1b", "wrong1c"] });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("answerIndex");
    expect(text).not.toContain("because 1");
  });

  it("serves only floor plans that the pack lists", async () => {
    const ok = await staff.get("/api/training/plans/ground.png");
    expect(ok.status).toBe(200);
    expect((await staff.get("/api/training/plans/secret.png")).status).toBe(404);
    expect((await staff.get("/api/training/plans/..%2Fpack.json")).status).toBe(404);
  });
});

describe("attempts", () => {
  it("fails a low score: stored, no certificate, no expiry, answers revealed", async () => {
    const wrong = ALL_RIGHT.map((a) => ({ ...a, chosen: "nonsense" }));
    wrong[0] = { question: "Q1?", chosen: "right1" };
    const res = await staff.post("/api/training/attempts").send({ moduleId: "alpha", moduleVersion: "1.0", answers: wrong });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ score: 1, total: 5, passMarkCount: 4, passed: false, certificateNo: null, validUntil: null });
    expect(res.body.review[1]).toMatchObject({ question: "Q2?", chosen: "nonsense", correct: "right2", isCorrect: false, explanation: "because 2" });
  });

  it("passes at exactly the pass mark and issues a certificate and expiry", async () => {
    const answers = ALL_RIGHT.map((a, i) => (i === 4 ? { ...a, chosen: "wrong5a" } : a)); // 4 of 5
    const res = await staff.post("/api/training/attempts").send({ moduleId: "alpha", moduleVersion: "1.0", answers });
    expect(res.status).toBe(201);
    expect(res.body.passed).toBe(true);
    expect(res.body.score).toBe(4);
    expect(res.body.certificateNo).toMatch(/^ALP-\d{8}-[A-HJ-NP-Z2-9]{4}$/);
    const done = new Date(res.body.completedAt);
    const until = new Date(res.body.validUntil);
    expect(until.getUTCFullYear() * 12 + until.getUTCMonth()).toBe(done.getUTCFullYear() * 12 + done.getUTCMonth() + 12);
  });

  it("ignores a forged identity and a forged pass in the request body", async () => {
    const res = await staff.post("/api/training/attempts").send({
      moduleId: "alpha", moduleVersion: "1.0", staffId: "user-gm-forged", staffName: "Somebody Else",
      passed: true, score: 5, total: 5, certificateNo: "ALP-FORGED", answers: [{ question: "Q1?", chosen: "wrong1a" }],
    });
    expect(res.status).toBe(201);
    expect(res.body.passed).toBe(false);
    expect(res.body.score).toBe(0);
    expect(res.body.certificateNo).toBeNull();
    const me = await staff.get("/api/training/me");
    expect(me.body.history.every((h) => h.userId === "user-sam" && h.name === "Sam Reception")).toBe(true);
  });

  it("rejects unknown modules, stale versions, unknown or repeated questions and too many answers", async () => {
    const post = (body) => staff.post("/api/training/attempts").send(body);
    expect((await post({ moduleId: "nope", moduleVersion: "1.0", answers: [] })).status).toBe(400);
    const stale = await post({ moduleId: "alpha", moduleVersion: "0.9", answers: ALL_RIGHT });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersion).toBe("1.0");
    expect((await post({ moduleId: "alpha", moduleVersion: "1.0", answers: [{ question: "Not a question", chosen: "x" }] })).status).toBe(400);
    expect((await post({ moduleId: "alpha", moduleVersion: "1.0", answers: [ALL_RIGHT[0], ALL_RIGHT[0]] })).status).toBe(400);
    expect((await post({ moduleId: "alpha", moduleVersion: "1.0", answers: [...ALL_RIGHT, ALL_RIGHT[0]] })).status).toBe(400);
    expect((await post({ moduleId: "alpha", moduleVersion: "1.0", answers: "all of them" })).status).toBe(400);
  });

  it("counts unanswered questions and made-up options as wrong", async () => {
    const res = await staff.post("/api/training/attempts").send({
      moduleId: "beta", moduleVersion: "2.0", answers: [{ question: "B1?", chosen: "maybe" }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ score: 0, total: 2, passed: false });
    expect(res.body.review[1].chosen).toBeNull();
  });

  it("gives every certificate a different number", async () => {
    const nos = new Set();
    for (let i = 0; i < 12; i++) {
      const res = await staff.post("/api/training/attempts").send({ moduleId: "alpha", moduleVersion: "1.0", answers: ALL_RIGHT });
      expect(res.status).toBe(201);
      nos.add(res.body.certificateNo);
    }
    expect(nos.size).toBe(12);
  });
});

describe("results, certificates and records", () => {
  it("returns the latest pass per module, and a failed module as its latest attempt", async () => {
    const me = await staff.get("/api/training/me");
    expect(me.status).toBe(200);
    expect(me.body.results.alpha).toMatchObject({ passed: true, score: 5, total: 5, version: "1.0", name: "Sam Reception" });
    expect(me.body.results.alpha.certNo).toMatch(/^ALP-/);
    expect(me.body.results.beta).toMatchObject({ passed: false, score: 0 });
    expect(me.body.history.length).toBeGreaterThan(10);
  });

  it("lets the owner and a General Manager fetch a certificate, but not another staff member", async () => {
    const no = (await staff.get("/api/training/me")).body.results.alpha.certNo;
    const own = await staff.get(`/api/training/certificates/${no}`);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ name: "Sam Reception", moduleTitle: "Alpha Awareness", hotelName: "Test Hotel", signedBy: "Test Manager, General Manager" });
    expect((await gm.get(`/api/training/certificates/${no}`)).status).toBe(200);
    expect((await staff.get("/api/training/certificates/ALP-00000000-ZZZZ")).status).toBe(404);

    // A different non-GM user can't read Sam's certificate.
    expect((await pat.get(`/api/training/certificates/${no}`)).status).toBe(403);
  });

  it("summarises the team without answers, for a General Manager only", async () => {
    expect((await staff.get("/api/training/records")).status).toBe(403);
    const res = await gm.get("/api/training/records");
    expect(res.status).toBe(200);
    const alpha = res.body.records.find((r) => r.userId === "user-sam" && r.moduleId === "alpha");
    expect(alpha).toMatchObject({ staffId: "staff-sam", userName: "Sam Reception", userEmail: staffEmail, moduleTitle: "Alpha Awareness", lastAttemptPassed: true });
    expect(alpha.attempts).toBeGreaterThan(10);
    expect(alpha.lastPass).toMatchObject({ score: 5, total: 5 });
    expect(JSON.stringify(res.body)).not.toContain("because");
    expect(JSON.stringify(res.body)).not.toContain("right1");
  });
});

describe("assignments and pairing", () => {
  it("shows an unpaired login nothing, and refuses its attempts", async () => {
    const me = await pat.get("/api/training/me");
    expect(me.body).toMatchObject({ linked: false, assignedModuleIds: [], canTakeAny: false });
    expect((await pat.get("/api/training/pack")).body.modules).toEqual([]);
    const res = await pat.post("/api/training/attempts").send({ moduleId: "alpha", moduleVersion: "1.0", answers: ALL_RIGHT });
    expect(res.status).toBe(403);
  });

  it("only lets a General Manager manage people, pairing and assignments", async () => {
    expect((await staff.get("/api/training/people")).status).toBe(403);
    expect((await staff.put("/api/training/links").send({ staffId: "staff-pat", userId: "user-pat" })).status).toBe(403);
    expect((await staff.put("/api/training/assignments").send({ staffIds: ["staff-sam"], moduleIds: ["alpha"], assigned: true })).status).toBe(403);
  });

  it("lists staff with their pairing and assignments, and the available logins", async () => {
    const res = await gm.get("/api/training/people");
    expect(res.status).toBe(200);
    const sam = res.body.staff.find((s) => s.id === "staff-sam");
    expect(sam).toMatchObject({ name: "Sam Reception", userId: "user-sam" });
    expect(sam.moduleIds.sort()).toEqual(["alpha", "beta"]);
    expect(res.body.staff.find((s) => s.id === "staff-pat")).toMatchObject({ userId: null, moduleIds: [] });
    expect(res.body.users.map((u) => u.id)).toEqual(expect.arrayContaining(["user-sam", "user-pat"]));
    expect(JSON.stringify(res.body)).not.toContain("password");
  });

  it("validates pairing: unknown people, and one login per staff member", async () => {
    expect((await gm.put("/api/training/links").send({ staffId: "nobody", userId: "user-pat" })).status).toBe(400);
    expect((await gm.put("/api/training/links").send({ staffId: "staff-pat", userId: "nobody" })).status).toBe(400);
    const clash = await gm.put("/api/training/links").send({ staffId: "staff-pat", userId: "user-sam" });
    expect(clash.status).toBe(409);
  });

  it("pairs Pat, who still can't take anything until a module is assigned, then only that module", async () => {
    expect((await gm.put("/api/training/links").send({ staffId: "staff-pat", userId: "user-pat" })).status).toBe(200);
    expect((await pat.get("/api/training/me")).body).toMatchObject({ linked: true, assignedModuleIds: [] });
    expect((await pat.post("/api/training/attempts").send({ moduleId: "beta", moduleVersion: "2.0", answers: [] })).status).toBe(403);

    expect((await gm.put("/api/training/assignments").send({ staffIds: ["staff-pat"], moduleIds: ["beta"], assigned: true })).status).toBe(200);
    const mods = (await pat.get("/api/training/pack")).body.modules.map((m) => m.id);
    expect(mods).toEqual(["beta"]);
    expect((await pat.post("/api/training/attempts").send({ moduleId: "alpha", moduleVersion: "1.0", answers: ALL_RIGHT })).status).toBe(403);
    expect((await pat.post("/api/training/attempts").send({ moduleId: "beta", moduleVersion: "2.0", answers: [{ question: "B1?", chosen: "no" }, { question: "B2?", chosen: "yes" }] })).status).toBe(201);
    expect((await pat.get("/api/training/me")).body.assignedModuleIds).toEqual(["beta"]);
  });

  it("takes an assignment away again, and unpairs", async () => {
    expect((await gm.put("/api/training/assignments").send({ staffIds: ["staff-pat"], moduleIds: ["beta"], assigned: false })).status).toBe(200);
    expect((await pat.get("/api/training/me")).body.assignedModuleIds).toEqual([]);
    expect((await gm.put("/api/training/links").send({ staffId: "staff-pat", userId: null })).status).toBe(200);
    expect((await pat.get("/api/training/me")).body.linked).toBe(false);
    // The earlier attempt is still there: removing an assignment never deletes results.
    const records = (await gm.get("/api/training/records")).body.records;
    expect(records.find((r) => r.userId === "user-pat" && r.moduleId === "beta").attempts).toBe(1);
  });

  it("rejects bad assignment requests", async () => {
    const put = (b) => gm.put("/api/training/assignments").send(b);
    expect((await put({ staffIds: ["staff-sam"], moduleIds: ["nope"], assigned: true })).status).toBe(400);
    expect((await put({ staffIds: ["ghost"], moduleIds: ["alpha"], assigned: true })).status).toBe(400);
    expect((await put({ staffIds: [], moduleIds: ["alpha"], assigned: true })).status).toBe(400);
    expect((await put({ staffIds: ["staff-sam"], moduleIds: ["alpha"] })).status).toBe(400);
  });

  it("lets a General Manager take any module without being assigned", async () => {
    const me = await gm.get("/api/training/me");
    expect(me.body).toMatchObject({ canTakeAny: true });
    expect(me.body.assignedModuleIds.sort()).toEqual(["alpha", "beta"]);
    expect((await gm.get("/api/training/pack")).body.modules).toHaveLength(2);
    const res = await gm.post("/api/training/attempts").send({ moduleId: "alpha", moduleVersion: "1.0", answers: ALL_RIGHT });
    expect(res.status).toBe(201);
  });
});

describe("certificate list", () => {
  it("shows staff only their own certificates, and a General Manager everyone's", async () => {
    const own = await staff.get("/api/training/certificates");
    expect(own.status).toBe(200);
    expect(own.body.certificates.length).toBeGreaterThan(0);
    expect(own.body.certificates.every((c) => c.userId === "user-sam")).toBe(true);
    expect(own.body.certificates[0]).toMatchObject({ name: "Sam Reception", moduleTitle: "Alpha Awareness" });
    expect((await pat.get("/api/training/certificates")).body.certificates).toEqual([]); // Pat has only a fail
    const all = await gm.get("/api/training/certificates");
    const names = new Set(all.body.certificates.map((c) => c.name));
    expect(names.has("Sam Reception")).toBe(true);
    expect(names.has("Test GM")).toBe(true);
  });
});

describe("installing a pack from the browser", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from("rest-of-a-fake-png")]);
  const b64 = (buf) => Buffer.from(buf).toString("base64");
  const file = (name, buf) => ({ name, contentBase64: b64(buf) });
  const packFile = (mod = {}) => file("pack.json", Buffer.from(JSON.stringify({ ...pack, ...mod })));
  let freshDir;
  let original; // read inside beforeAll: the outer beforeAll is what sets TRAINING_PACK_DIR, after this block is collected
  beforeAll(() => { original = process.env.TRAINING_PACK_DIR; freshDir = mkdtempSync(join(tmpdir(), "training-pack-fresh-")); });
  afterAll(() => { process.env.TRAINING_PACK_DIR = original; rmSync(freshDir, { recursive: true, force: true }); });

  it("is for a General Manager only, and reports whether the server is set up for it", async () => {
    expect((await staff.get("/api/training/pack-info")).status).toBe(403);
    expect((await staff.put("/api/training/pack-files").send({ files: [] })).status).toBe(403);
    expect((await request(app).get("/api/training/status")).body).toEqual({ enabled: true, configured: true });
    const info = await gm.get("/api/training/pack-info");
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ configured: true, enabled: true });
    expect(info.body.pack.modules.map((m) => m.id)).toEqual(["alpha", "beta"]);
    expect(JSON.stringify(info.body)).not.toContain("right1");
  });

  it("on a server with no pack yet: training is off, then a General Manager installs one and it switches on", async () => {
    process.env.TRAINING_PACK_DIR = freshDir;
    expect((await request(app).get("/api/training/status")).body).toEqual({ enabled: false, configured: true });
    expect((await gm.get("/api/training/pack")).status).toBe(404);
    const info = await gm.get("/api/training/pack-info");
    expect(info.body).toMatchObject({ configured: true, enabled: false, pack: null });

    const res = await gm.put("/api/training/pack-files").send({ files: [file("ground.png", png), packFile()] });
    expect(res.status).toBe(200);
    expect(res.body.installed.sort()).toEqual(["ground.png", "pack.json"]);
    expect(res.body).toMatchObject({ enabled: true, pack: { hotelName: "Test Hotel" } });
    expect(existsSync(join(freshDir, "pack.json"))).toBe(true);
    expect(existsSync(join(freshDir, "plans", "ground.png"))).toBe(true);
    expect((await request(app).get("/api/training/status")).body.enabled).toBe(true);
    expect((await gm.get("/api/training/plans/ground.png")).status).toBe(200);
  });

  it("replaces an installed pack: a changed module version is picked up straight away", async () => {
    process.env.TRAINING_PACK_DIR = freshDir;
    const next = JSON.parse(JSON.stringify(pack));
    next.modules[0].version = "1.1";
    const res = await gm.put("/api/training/pack-files").send({ files: [file("pack.json", Buffer.from(JSON.stringify(next)))] });
    expect(res.status).toBe(200);
    const served = (await gm.get("/api/training/pack")).body.modules.find((m) => m.id === "alpha");
    expect(served.version).toBe("1.1");
  });

  it("refuses bad uploads, and writes nothing when it does", async () => {
    process.env.TRAINING_PACK_DIR = freshDir;
    const before = readFileSync(join(freshDir, "pack.json"), "utf8");
    const put = (files) => gm.put("/api/training/pack-files").send({ files });
    const broken = JSON.parse(JSON.stringify(pack)); broken.modules[0].questions[0].answerIndex = 99;
    expect((await put([file("pack.json", Buffer.from(JSON.stringify(broken)))])).status).toBe(400);
    expect((await put([file("pack.json", Buffer.from("not json at all"))])).status).toBe(400);
    expect((await put([file("evil.sh", Buffer.from("rm -rf /"))])).status).toBe(400);
    expect((await put([file("../escape.png", png)])).status).toBe(400);
    expect((await put([file("plans/ground.png", png)])).status).toBe(400); // subfolders aren't accepted: send the bare file name
    expect((await put([file("fake.png", Buffer.from("this is not a png"))])).status).toBe(400);
    expect((await put([])).status).toBe(400);
    expect((await put("nope")).status).toBe(400);
    const missingPlan = JSON.parse(JSON.stringify(pack)); missingPlan.plans = [{ label: "Ghost", file: "ghost.png", note: "" }];
    expect((await put([file("pack.json", Buffer.from(JSON.stringify(missingPlan)))])).status).toBe(400);
    expect(readFileSync(join(freshDir, "pack.json"), "utf8")).toBe(before); // untouched by every refusal
    expect(existsSync(join(freshDir, "evil.sh"))).toBe(false);
  });

  it("explains itself when the server has no pack folder configured", async () => {
    delete process.env.TRAINING_PACK_DIR;
    expect((await request(app).get("/api/training/status")).body).toEqual({ enabled: false, configured: false });
    const res = await gm.put("/api/training/pack-files").send({ files: [file("pack.json", Buffer.from(JSON.stringify(pack)))] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/TRAINING_PACK_DIR/);
    process.env.TRAINING_PACK_DIR = original;
  });
});

describe("the name printed on a certificate", () => {
  const original = (id) => ({ id, archived: false, email: "", role: "Receptionist" });
  const writeStaff = (list) => gm.put("/api/storage/ledger-staff").send({ value: JSON.stringify(list) });
  const staffList = (samName) => [
    { ...original("staff-sam"), name: samName },
    { ...original("staff-pat"), name: "Pat Other" },
    { ...original("staff-hk"), name: "Agency Housekeeper" },
  ];

  it("uses the full name from the paired Staff register entry, even when the login account only has a short name", async () => {
    await writeStaff(staffList("Samuel Reception-Jones"));
    const list = await staff.get("/api/training/certificates");
    expect(list.body.certificates.length).toBeGreaterThan(0);
    expect(list.body.certificates.every((c) => c.name === "Samuel Reception-Jones")).toBe(true);
    const no = list.body.certificates[0].certificateNo;
    expect((await staff.get(`/api/training/certificates/${no}`)).body.name).toBe("Samuel Reception-Jones");
    expect((await gm.get(`/api/training/certificates/${no}`)).body.name).toBe("Samuel Reception-Jones"); // a GM sees the same
    const rec = (await gm.get("/api/training/records")).body.records.find((r) => r.userId === "user-sam");
    expect(rec.userName).toBe("Samuel Reception-Jones");
  });

  it("follows a correction made later in the Staff register, on certificates already issued", async () => {
    await writeStaff(staffList("Samuel R. Jones"));
    const no = (await staff.get("/api/training/certificates")).body.certificates[0].certificateNo;
    expect((await staff.get(`/api/training/certificates/${no}`)).body.name).toBe("Samuel R. Jones");
  });

  it("falls back to the login account's name for a login that is not paired with a Staff entry", async () => {
    const mine = (await gm.get("/api/training/certificates")).body.certificates.filter((c) => c.userId !== "user-sam");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((c) => c.name === "Test GM")).toBe(true);
  });

  it("ignores a blank Staff register name rather than printing nothing", async () => {
    await writeStaff(staffList("   "));
    const names = (await staff.get("/api/training/certificates")).body.certificates.map((c) => c.name);
    expect(new Set(names)).toEqual(new Set(["Sam Reception"]));
    await writeStaff(staffList("Sam Reception")); // put the register back as the other tests expect
  });
});

describe("append-only", () => {
  it("refuses to update or delete a stored attempt, even through SQL", async () => {
    const { db } = await import("./db.js");
    expect(() => db.prepare("UPDATE training_attempts SET passed = 1").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM training_attempts").run()).toThrow(/append-only/);
  });
});

describe("helpers and pack validation", () => {
  it("clamps month arithmetic to the end of a shorter month", async () => {
    const { addMonths, passMarkCount } = await import("./training.js");
    expect(addMonths(new Date("2027-01-31T10:00:00Z"), 1).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(addMonths(new Date("2028-01-31T10:00:00Z"), 1).toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(addMonths(new Date("2026-10-14T08:00:00Z"), 36).toISOString()).toBe("2029-10-14T08:00:00.000Z");
    expect(addMonths(new Date("2026-12-15T08:00:00Z"), 1).toISOString()).toBe("2027-01-15T08:00:00.000Z");
    expect(passMarkCount(5, 0.8)).toBe(4);
    expect(passMarkCount(8, 0.8)).toBe(7);
    expect(passMarkCount(10, 0.8)).toBe(8);
  });

  it("rejects a broken pack", async () => {
    const { validatePack } = await import("./training.js");
    const clone = () => JSON.parse(JSON.stringify(pack));
    expect(() => validatePack(clone())).not.toThrow();
    const dupOpt = clone(); dupOpt.modules[0].questions[0].options = ["a", "a"];
    expect(() => validatePack(dupOpt)).toThrow(/duplicate options/);
    const badIdx = clone(); badIdx.modules[0].questions[0].answerIndex = 9;
    expect(() => validatePack(badIdx)).toThrow(/answerIndex/);
    const dupStem = clone(); dupStem.modules[0].questions[1].stem = "Q1?";
    expect(() => validatePack(dupStem)).toThrow(/duplicate question/);
    const badMark = clone(); badMark.passMark = 0;
    expect(() => validatePack(badMark)).toThrow(/passMark/);
    const badCode = clone(); badCode.modules[0].code = "alp";
    expect(() => validatePack(badCode)).toThrow(/code/);
  });
});
