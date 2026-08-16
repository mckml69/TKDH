import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

/**
 * Integration tests against the real Express app + a real, throwaway SQLite file —
 * not mocks. db.js reads DATABASE_PATH at import time, so it must be set before
 * index.js (and therefore db.js) is ever imported, which is why `app` is loaded
 * dynamically inside beforeAll rather than via a normal top-level import.
 */
const dbPath = join(tmpdir(), `compliance-ledger-test-${process.pid}-${Date.now()}.sqlite`);
process.env.DATABASE_PATH = dbPath;
process.env.COOKIE_SECURE = "false";
process.env.NODE_ENV = "test";

let app;

beforeAll(async () => {
  ({ app } = await import("./index.js"));
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(dbPath + suffix); } catch {}
  }
});

describe("GET /api/health", () => {
  it("responds ok with no auth required", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// These run in order against the same app/database on purpose — auth bootstrap is a
// real one-time-only state transition (see server/README.md's two-phase design), so
// the tests below are a single linear story: open server -> bootstrap -> gated server.
describe("auth + storage lifecycle", () => {
  let agent;
  beforeAll(() => {
    agent = request.agent(app); // created here, not at collection time, so `app` is already loaded
  });

  it("starts out needing bootstrap, with /api/storage still open", async () => {
    const status = await agent.get("/api/auth/bootstrap-status");
    expect(status.status).toBe(200);
    expect(status.body.needsBootstrap).toBe(true);

    const storage = await agent.get("/api/storage/nonexistent-key");
    expect(storage.status).toBe(404); // no auth error — just no such row yet
  });

  it("rejects a bootstrap password under 8 characters", async () => {
    const res = await agent
      .post("/api/auth/bootstrap")
      .send({ name: "Test GM", email: "gm@hotel.test", password: "short" });
    expect(res.status).toBe(400);
  });

  it("creates the first General Manager and signs them in", async () => {
    const res = await agent
      .post("/api/auth/bootstrap")
      .send({ name: "Test GM", email: "gm@hotel.test", password: "correct horse battery" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: "Test GM", email: "gm@hotel.test", role: "General Manager" });
    expect(res.body.user.password_hash).toBeUndefined(); // never leak the hash
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a second bootstrap once an account exists", async () => {
    const res = await agent
      .post("/api/auth/bootstrap")
      .send({ name: "Someone Else", email: "someone@hotel.test", password: "whatever12345" });
    expect(res.status).toBe(409);
  });

  it("reflects the signed-in user on /api/auth/session via the session cookie", async () => {
    const res = await agent.get("/api/auth/session");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("gm@hotel.test");
  });

  it("now requires a session for /api/storage/* — a request with no cookie is rejected", async () => {
    const res = await request(app).get("/api/storage/some-key");
    expect(res.status).toBe(401);
  });

  it("round-trips a value through PUT / GET / list / DELETE for an authenticated request", async () => {
    const put = await agent.put("/api/storage/test-key").send({ value: "hello world" });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ key: "test-key", value: "hello world", shared: true });

    const get = await agent.get("/api/storage/test-key");
    expect(get.status).toBe(200);
    expect(get.body.value).toBe("hello world");

    const list = await agent.get("/api/storage?prefix=test-");
    expect(list.status).toBe(200);
    expect(list.body.keys).toContain("test-key");

    const del = await agent.delete("/api/storage/test-key");
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const getAfterDelete = await agent.get("/api/storage/test-key");
    expect(getAfterDelete.status).toBe(404);
  });

  it("rejects a PUT whose value isn't a string", async () => {
    const res = await agent.put("/api/storage/bad-key").send({ value: 12345 });
    expect(res.status).toBe(400);
  });

  it("falls back to plain kv_store storage for attach-* keys when R2 isn't configured", async () => {
    // No R2_* env vars are set in this test run, so r2Enabled is false and this should
    // behave exactly like any other key — the same safety net that would have caught
    // the AWS SDK checksum bug that broke real uploads before it ever reached Render.
    const dataUrl = "data:image/png;base64,aGVsbG8=";
    const put = await agent.put("/api/storage/attach-rec1-file1").send({ value: dataUrl });
    expect(put.status).toBe(200);

    const get = await agent.get("/api/storage/attach-rec1-file1");
    expect(get.status).toBe(200);
    expect(get.body.value).toBe(dataUrl); // returned byte-for-byte, no R2 marker involved

    await agent.delete("/api/storage/attach-rec1-file1");
  });

  it("rejects login with the wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "gm@hotel.test", password: "wrong password" });
    expect(res.status).toBe(401);
  });

  it("logs in with the correct password and signing out clears the session", async () => {
    const loginAgent = request.agent(app);
    const login = await loginAgent.post("/api/auth/login").send({ email: "gm@hotel.test", password: "correct horse battery" });
    expect(login.status).toBe(200);
    expect(login.headers["set-cookie"]).toBeDefined();

    const before = await loginAgent.get("/api/auth/session");
    expect(before.status).toBe(200);

    await loginAgent.post("/api/auth/logout");
    const after = await loginAgent.get("/api/auth/session");
    expect(after.status).toBe(401);
  });
});
