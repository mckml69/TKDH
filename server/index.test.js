import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
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

describe("cross-venue sharing (/api/shared/pull, /api/venue-pull)", () => {
  let agent;
  const secret = "test-shared-secret";

  beforeAll(async () => {
    agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "gm@hotel.test", password: "correct horse battery" });
    // Seed exactly what a real venue would have: an open Maintenance issue and a resolved Pest
    // issue (both should count), a schedule-mode record that must NOT leak out, the asset/room/
    // contractor those issues reference, and one whole_building contractor + one venue-only
    // contractor (only the former should ever be exposed).
    const records = [
      { id: "r1", category: "maintenance", title: "Fridge not working", status: "Open", archived: false, assetId: "a1", roomId: "rm1", contractorId: null },
      { id: "r2", category: "pest", title: "Mice sighting", status: "Resolved", archived: false, roomId: "rm1", resolvedContractorId: "c1" },
      { id: "r3", category: "equipment", title: "AC filter clean", status: null, archived: false, assetId: "a1" }, // not an issue — must not appear
      { id: "r4", category: "maintenance", title: "Old, archived issue", status: "Open", archived: true }, // archived — must not appear
    ];
    const assets = [{ id: "a1", assetCode: "FRG001", assetType: "fridge", name: "" }];
    const rooms = [{ id: "rm1", roomNumber: "12" }];
    const contractors = [
      { id: "c1", name: "Acme Pest Control", scope: "venue" },
      { id: "c2", name: "Acme Fire & Electrical", scope: "whole_building", archived: false },
      { id: "c3", name: "Archived Whole Building Contractor", scope: "whole_building", archived: true },
    ];
    const certificates = [
      { id: "cert1", title: "Fire Alarm Service", scope: "whole_building", archived: false },
      { id: "cert2", title: "Local Food Hygiene", scope: "venue" },
    ];
    for (const [key, value] of [
      ["ledger-records", records], ["ledger-assets", assets], ["ledger-rooms", rooms],
      ["ledger-contractors", contractors], ["ledger-certificates", certificates],
    ]) {
      await agent.put(`/api/storage/${key}`).send({ value: JSON.stringify(value) });
    }
  });

  afterEach(() => { delete process.env.SHARED_SYNC_SECRET; delete process.env.OTHER_VENUE_URL; delete process.env.SHARE_ISSUES_WITH_OTHER_VENUE; vi.unstubAllGlobals(); });

  describe("/api/shared/pull (outbound — another venue's server calls in)", () => {
    it("is unavailable when this deployment has no SHARED_SYNC_SECRET configured", async () => {
      const res = await request(app).get("/api/shared/pull");
      expect(res.status).toBe(503);
    });

    it("rejects a request with the wrong (or missing) secret", async () => {
      process.env.SHARED_SYNC_SECRET = secret;
      const wrong = await request(app).get("/api/shared/pull").set("Authorization", "Bearer nope");
      expect(wrong.status).toBe(401);
      const missing = await request(app).get("/api/shared/pull");
      expect(missing.status).toBe(401);
    });

    // This is the important regression test: a valid, correctly-authenticated request from the
    // other venue must NOT get this venue's own issues back unless SHARE_ISSUES_WITH_OTHER_VENUE
    // was deliberately turned on — a real prior bug had every deployment hand its own issues to
    // anyone holding the shared secret, in both directions, regardless of intent.
    it("never returns this venue's own issues (or their asset/room/contractor context) unless SHARE_ISSUES_WITH_OTHER_VENUE=true, even with a valid secret", async () => {
      process.env.SHARED_SYNC_SECRET = secret;
      const res = await request(app).get("/api/shared/pull").set("Authorization", `Bearer ${secret}`);
      expect(res.status).toBe(200);
      expect(res.body.issues).toEqual([]);
      expect(res.body.assets).toEqual([]);
      expect(res.body.rooms).toEqual([]);
      expect(res.body.contractors).toEqual([]);
      expect(res.body.staff).toEqual([]);
    });

    it("returns Maintenance/Pest issues (not archived, not other categories), with just the referenced context, once SHARE_ISSUES_WITH_OTHER_VENUE=true", async () => {
      process.env.SHARED_SYNC_SECRET = secret;
      process.env.SHARE_ISSUES_WITH_OTHER_VENUE = "true";
      const res = await request(app).get("/api/shared/pull").set("Authorization", `Bearer ${secret}`);
      expect(res.status).toBe(200);
      expect(res.body.issues.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
      expect(res.body.assets.map((a) => a.id)).toEqual(["a1"]);
      expect(res.body.rooms.map((r) => r.id)).toEqual(["rm1"]);
      expect(res.body.contractors.map((c) => c.id)).toEqual(["c1"]); // referenced by r2.resolvedContractorId
    });

    it("returns only non-archived whole_building contractors and certificates, never venue-scoped ones — regardless of SHARE_ISSUES_WITH_OTHER_VENUE", async () => {
      process.env.SHARED_SYNC_SECRET = secret;
      const res = await request(app).get("/api/shared/pull").set("Authorization", `Bearer ${secret}`);
      expect(res.body.wholeBuildingContractors.map((c) => c.id)).toEqual(["c2"]);
      expect(res.body.wholeBuildingCertificates.map((c) => c.id)).toEqual(["cert1"]);
    });
  });

  describe("/api/venue-pull (inbound — this venue's own frontend calls it)", () => {
    it("requires a signed-in session, same as any other app route", async () => {
      const res = await request(app).get("/api/venue-pull");
      expect(res.status).toBe(401);
    });

    it("reports unavailable when OTHER_VENUE_URL/SHARED_SYNC_SECRET aren't configured", async () => {
      const res = await agent.get("/api/venue-pull");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
    });

    it("fetches from the other venue's /api/shared/pull and forwards the result when configured", async () => {
      process.env.OTHER_VENUE_URL = "https://pub.example.test";
      process.env.SHARED_SYNC_SECRET = secret;
      const fetchMock = vi.fn(async (url, opts) => {
        expect(url).toBe("https://pub.example.test/api/shared/pull");
        expect(opts.headers.Authorization).toBe(`Bearer ${secret}`);
        return { ok: true, json: async () => ({ issues: [{ id: "pub-r1", category: "maintenance", title: "Beer line clean overdue" }], assets: [], rooms: [], contractors: [], staff: [], wholeBuildingContractors: [], wholeBuildingCertificates: [] }) };
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await agent.get("/api/venue-pull");
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
      expect(res.body.issues).toEqual([{ id: "pub-r1", category: "maintenance", title: "Beer line clean overdue" }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("reports unavailable (not a 500) when the other venue is unreachable", async () => {
      process.env.OTHER_VENUE_URL = "https://pub.example.test";
      process.env.SHARED_SYNC_SECRET = secret;
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));

      const res = await agent.get("/api/venue-pull");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
    });
  });
});
