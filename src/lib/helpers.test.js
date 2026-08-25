import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  localDateStr, addDays, weekStartDate, daysUntil, daysSince, fmtDate, formatBytes,
  initialsOf, getMode, getDueDate, getStatus, getEventDate, isOverdue, isDueSoon, isDueToday, isOpenIssue,
  insuranceStatus, certificateStatus, visitStatus, validateRecord, validateAsset, validateRoom,
  validateContractor, validateStaff, validateCertificate, validateVisit, validateUser, generateAssetCode,
  recordDetailText, recordWhoText, checkpointCheckEligibleCheckpoints, checkpointCheckFindMissing,
  findOpenLinkedIssue, hasOpenLinkedIssue, phoneContactLinks, checkResult, assetComplianceStatus,
} from "./helpers";

describe("date arithmetic", () => {
  it("localDateStr formats a Date as local YYYY-MM-DD with zero-padding", () => {
    expect(localDateStr(new Date(2026, 2, 5))).toBe("2026-03-05");
    expect(localDateStr(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("addDays adds/subtracts days and rolls over month boundaries", () => {
    expect(addDays("2026-01-30", 5)).toBe("2026-02-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28"); // 2026 is not a leap year
    expect(addDays("2026-01-01", 0)).toBe("2026-01-01");
  });

  it("weekStartDate always returns the Monday of that date's week", () => {
    // 2024-01-01 is a known Monday
    expect(weekStartDate("2024-01-01")).toBe("2024-01-01");
    expect(weekStartDate("2024-01-03")).toBe("2024-01-01"); // Wednesday
    expect(weekStartDate("2024-01-07")).toBe("2024-01-01"); // Sunday -> that week's Monday
    expect(weekStartDate("2024-01-08")).toBe("2024-01-08"); // the following Monday
  });
});

describe('daysUntil / daysSince (relative to "today")', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0)); // fixed "now": 2026-01-15
  });
  afterEach(() => vi.useRealTimers());

  it("daysUntil counts forward, daysSince counts backward", () => {
    expect(daysUntil("2026-01-20")).toBe(5);
    expect(daysUntil("2026-01-10")).toBe(-5);
    expect(daysUntil("2026-01-15")).toBe(0);
    expect(daysSince("2026-01-10")).toBe(5);
    expect(daysSince("2026-01-20")).toBe(-5);
  });
});

describe("fmtDate", () => {
  it("formats a YYYY-MM-DD string as 'DD Mon YYYY'", () => {
    expect(fmtDate("2026-03-05")).toBe("05 Mar 2026");
  });

  it("returns an em dash for missing or invalid dates", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("")).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
  });
});

describe("formatBytes", () => {
  it("shows KB under 1MB, MB at or above", () => {
    expect(formatBytes(300)).toBe("0KB");
    expect(formatBytes(1536)).toBe("2KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0MB");
  });
});

describe("initialsOf", () => {
  it("uses first+last initials for multi-word names", () => {
    expect(initialsOf("John Smith")).toBe("JS");
    expect(initialsOf("John Michael Smith")).toBe("JS");
  });

  it("uses the first two letters for a single-word name", () => {
    expect(initialsOf("Madonna")).toBe("MA");
  });

  it("returns an empty string for no name", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf(null)).toBe("");
  });
});

describe("record mode/status logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0)); // fixed "now": 2026-01-15
  });
  afterEach(() => vi.useRealTimers());

  it("getMode reads the mode off the record's category template", () => {
    expect(getMode({ category: "fire" })).toBe("recurring");
    expect(getMode({ category: "training" })).toBe("expiry");
    expect(getMode({ category: "pest" })).toBe("incident");
    expect(getMode({ category: "maintenance" })).toBe("maintenance");
    expect(getMode({ category: "room_inspection" })).toBe("log");
  });

  it("getDueDate: expiry mode uses expiryDate directly, recurring adds frequencyDays to lastCompleted", () => {
    expect(getDueDate({ category: "training", expiryDate: "2026-02-01" })).toBe("2026-02-01");
    expect(getDueDate({ category: "fire", lastCompleted: "2026-01-01", frequencyDays: 30 })).toBe("2026-01-31");
  });

  it("getStatus for schedule modes: overdue / due-soon / compliant by days until due", () => {
    expect(getStatus({ category: "training", expiryDate: "2025-12-01" })).toBe("overdue");
    expect(getStatus({ category: "training", expiryDate: "2026-01-25" })).toBe("due-soon"); // 10 days away
    expect(getStatus({ category: "training", expiryDate: "2026-06-01" })).toBe("compliant");
    expect(getStatus({ category: "training" })).toBe("compliant"); // no due date at all
  });

  it("getStatus for log mode is always 'logged'", () => {
    expect(getStatus({ category: "room_inspection" })).toBe("logged");
  });

  it("getStatus for issue modes reads the record's own status field", () => {
    expect(getStatus({ category: "pest", status: "Resolved" })).toBe("resolved");
    expect(getStatus({ category: "pest", status: "In Progress" })).toBe("in-progress");
    expect(getStatus({ category: "pest", status: "Awaiting" })).toBe("in-progress");
    expect(getStatus({ category: "pest" })).toBe("open");
  });

  it("getStatus for firelog mode is always 'logged' (never the maintenance-style 'open' fallback)", () => {
    expect(getStatus({ category: "fire_daily" })).toBe("logged");
    expect(getStatus({ category: "fire_weekly" })).toBe("logged");
    expect(getStatus({ category: "fire_monthly" })).toBe("logged");
    expect(getStatus({ category: "fire_periodic" })).toBe("logged");
  });

  it("getStatus for single-status checkpoint checks (Window Restriction, Legionella Temp) maps ok/not_ok directly", () => {
    expect(getStatus({ category: "window_restriction_check", status: "ok" })).toBe("compliant");
    expect(getStatus({ category: "window_restriction_check", status: "not_ok" })).toBe("open");
    expect(getStatus({ category: "legionella_temp_check", status: "ok" })).toBe("compliant");
    expect(getStatus({ category: "legionella_temp_check", status: "not_ok" })).toBe("open");
  });

  it("getStatus for Legionella Descaling aggregates its per-item checks: any not_ok wins, else compliant once everything recorded so far is ok", () => {
    expect(getStatus({ category: "legionella_check", checks: { kettle: { status: "ok" }, tap: { status: "not_ok" } } })).toBe("open");
    expect(getStatus({ category: "legionella_check", checks: { kettle: { status: "ok" }, tap: { status: "ok" } } })).toBe("compliant");
    expect(getStatus({ category: "legionella_check", checks: { kettle: { status: "ok" } } })).toBe("compliant"); // nothing recorded so far contradicts ok — whether every eligible item has been logged is a separate question the golden-rule export answers with full checkpoint context, not this quick status badge
    expect(getStatus({ category: "legionella_check", checks: {} })).toBe("in-progress"); // nothing recorded yet at all
  });

  it("isOverdue / isDueSoon / isDueToday / isOpenIssue derive from getStatus", () => {
    expect(isOverdue({ category: "training", expiryDate: "2025-12-01" })).toBe(true);
    expect(isDueSoon({ category: "training", expiryDate: "2026-01-25" })).toBe(true);
    expect(isDueToday({ category: "training", expiryDate: "2026-01-15" })).toBe(true);
    expect(isOpenIssue({ category: "pest", status: "Awaiting" })).toBe(true);
    expect(isOpenIssue({ category: "pest", status: "Resolved" })).toBe(false);
  });

  it("getMode: the Risk Assessments category is review-based now, not recurring", () => {
    expect(getMode({ category: "risk", title: "COSHH assessment" })).toBe("review");
  });

  it("getMode: the Fire Risk Assessment overrides to review-based even though its category (fire) stays recurring for everything else", () => {
    expect(getMode({ category: "fire", title: "Fire risk assessment review" })).toBe("review");
    expect(getMode({ category: "fire", title: "Fire alarm test" })).toBe("recurring");
  });

  it("getMode: the review override is scoped by category, not title alone — a maintenance issue coincidentally titled the same as a review-based preset stays maintenance", () => {
    expect(getMode({ category: "maintenance", title: "COSHH assessment" })).toBe("maintenance");
  });

  it("getMode: Health & Safety Induction overrides to log mode — a one-time event, not something that expires. Training records key off 'detail' (the preset), not 'title' (the staff member's name), same field getMatchKey uses for expiry mode", () => {
    expect(getMode({ category: "training", detail: "Health & Safety Induction", title: "Some Staff Member" })).toBe("log");
    expect(getMode({ category: "training", detail: "First Aid at Work", title: "Some Staff Member" })).toBe("expiry");
  });

  it("getDueDate for review mode reads nextReviewTarget, which is optional", () => {
    expect(getDueDate({ category: "risk", title: "COSHH assessment", nextReviewTarget: "2026-06-01" })).toBe("2026-06-01");
    expect(getDueDate({ category: "risk", title: "COSHH assessment" })).toBe(null);
  });

  it("getStatus for review mode: never logged is 'review-due'; no target set is 'reviewed' (no fixed interval means no automatic overdue); a set target behaves like due-soon/overdue but with review-specific labels", () => {
    expect(getStatus({ category: "risk", title: "COSHH assessment" })).toBe("review-due");
    expect(getStatus({ category: "risk", title: "COSHH assessment", lastReviewed: "2025-01-01" })).toBe("reviewed");
    expect(getStatus({ category: "risk", title: "COSHH assessment", lastReviewed: "2025-01-01", nextReviewTarget: "2025-12-01" })).toBe("review-overdue");
    expect(getStatus({ category: "risk", title: "COSHH assessment", lastReviewed: "2025-01-01", nextReviewTarget: "2026-01-25" })).toBe("review-due"); // 10 days away
    expect(getStatus({ category: "risk", title: "COSHH assessment", lastReviewed: "2025-01-01", nextReviewTarget: "2026-06-01" })).toBe("reviewed");
  });

  it("getEventDate for review mode reads lastReviewed, falling back to completedDate for pre-existing records", () => {
    expect(getEventDate({ category: "risk", title: "COSHH assessment", lastReviewed: "2026-01-10" })).toBe("2026-01-10");
    expect(getEventDate({ category: "risk", title: "COSHH assessment", completedDate: "2025-06-01" })).toBe("2025-06-01");
  });

  it("validateRecord requires a deliberately-entered lastReviewed for review mode — no silent default", () => {
    expect(validateRecord("review", { title: "COSHH assessment", lastReviewed: null })).toContain("Enter the date this was actually last reviewed — not today's date unless that's genuinely when it happened.");
    expect(validateRecord("review", { title: "COSHH assessment", lastReviewed: "2026-01-10" })).toEqual([]);
  });
});

describe("insuranceStatus / certificateStatus / visitStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0)); // fixed "now": 2026-01-15
  });
  afterEach(() => vi.useRealTimers());

  it("insuranceStatus", () => {
    expect(insuranceStatus({})).toBe("missing");
    expect(insuranceStatus({ insuranceExpiry: "2025-12-01" })).toBe("overdue");
    expect(insuranceStatus({ insuranceExpiry: "2026-01-25" })).toBe("due-soon");
    expect(insuranceStatus({ insuranceExpiry: "2026-06-01" })).toBe("compliant");
  });

  it("certificateStatus", () => {
    expect(certificateStatus({})).toBe("missing");
    expect(certificateStatus({ expiryDate: "2025-12-01" })).toBe("overdue");
    expect(certificateStatus({ expiryDate: "2026-01-25" })).toBe("due-soon");
    expect(certificateStatus({ expiryDate: "2026-06-01" })).toBe("compliant");
  });

  it("visitStatus", () => {
    expect(visitStatus({ status: "Closed" })).toBe("resolved");
    expect(visitStatus({ followUpDate: "2025-12-01" })).toBe("overdue");
    expect(visitStatus({ followUpDate: "2026-01-25" })).toBe("due-soon");
    expect(visitStatus({ followUpDate: "2026-06-01" })).toBe("open"); // too far out to be "due-soon"
    expect(visitStatus({})).toBe("open");
  });
});

describe("form validators", () => {
  it("validateRecord checks the field required for its mode", () => {
    expect(validateRecord("expiry", { title: "" })).toEqual(["Staff member name is required."]);
    expect(validateRecord("incident", { location: "  " })).toEqual(["Location is required."]);
    expect(validateRecord("incident", { location: "Room 5" })).toEqual([]);
    expect(validateRecord("maintenance", { title: "" })).toEqual(["Issue title is required."]);
    expect(validateRecord("log", { title: "Note" })).toEqual([]);
    expect(validateRecord("recurring", { flagged: true, flagDescription: "" }))
      .toEqual(["Please describe what the check found."]);
    expect(validateRecord("recurring", { flagged: false })).toEqual([]);
  });

  it("validateAsset / validateRoom / validateContractor / validateStaff / validateCertificate / validateVisit", () => {
    expect(validateAsset({ assetCode: "" })).toEqual(["Asset code is required."]);
    expect(validateAsset({ assetCode: "FE-001" })).toEqual([]);
    expect(validateRoom({ roomNumber: "" })).toEqual(["Room number is required."]);
    expect(validateContractor({ name: "" })).toEqual(["Contractor / company name is required."]);
    expect(validateStaff({ name: "" })).toEqual(["Staff member name is required."]);
    expect(validateCertificate({ title: "" })).toEqual(["Certificate title is required."]);
    expect(validateVisit({ visitType: "" })).toEqual(["Visit type is required."]);
    expect(validateVisit({ visitType: "EHO" })).toEqual([]);
  });

  it("validateUser checks name, email format, and duplicate emails among other active users", () => {
    expect(validateUser({ id: "1", name: "", email: "" }, [])).toEqual([
      "Name is required.",
      "A valid email is required.",
    ]);
    expect(
      validateUser({ id: "1", name: "Bob", email: "bob@x.com" }, [
        { id: "2", email: "bob@x.com", archived: false },
      ])
    ).toEqual(["That email is already registered to someone else."]);
    // matching your own existing record isn't a duplicate
    expect(
      validateUser({ id: "1", name: "Bob", email: "bob@x.com" }, [
        { id: "1", email: "bob@x.com", archived: false },
      ])
    ).toEqual([]);
    // duplicate check is case-insensitive
    expect(
      validateUser({ id: "1", name: "Bob", email: "BOB@X.com" }, [
        { id: "2", email: "bob@x.com", archived: false },
      ])
    ).toEqual(["That email is already registered to someone else."]);
  });
});

describe("recordDetailText", () => {
  const rooms = [{ id: "r1", roomNumber: "204" }];
  const assets = [{ id: "a1", assetCode: "KTL001", location: "Kitchen" }];

  it("falls back to the linked room when there's no free-text location or linked asset (the export bug: this used to render blank)", () => {
    const record = { category: "deep_clean", roomId: "r1", location: "" };
    expect(recordDetailText(record, assets, rooms, [], [])).toBe("Room 204");
  });

  it("prefers a free-text location over the linked room", () => {
    const record = { category: "deep_clean", roomId: "r1", location: "Corridor 3F" };
    expect(recordDetailText(record, assets, rooms, [], [])).toBe("Corridor 3F");
  });

  it("a linked asset shows its code plus location, falling back to the asset's own location", () => {
    const record = { category: "fire", assetId: "a1", location: "" };
    expect(recordDetailText(record, assets, [], [], [])).toBe("KTL001 · Kitchen");
  });

  it("expiry-mode records use the free-text detail field", () => {
    const record = { category: "training", detail: "First Aid at Work" };
    expect(recordDetailText(record, [], [], [], [])).toBe("First Aid at Work");
  });

  it("falls back to actionTaken, then an em-dash, when nothing else applies", () => {
    expect(recordDetailText({ category: "deep_clean", actionTaken: "Deep cleaned bathroom" }, [], [], [], [])).toBe("Deep cleaned bathroom");
    expect(recordDetailText({ category: "deep_clean" }, [], [], [], [])).toBe("—");
  });

  it("appends the legionella temperature reading", () => {
    const record = { category: "legionella", location: "Plant Room", temperatureC: 54, readingType: "Hot water outlet" };
    expect(recordDetailText(record, [], [], [], [])).toBe("Plant Room · 54°C (Hot water outlet)");
  });

  it("appends who a maintenance issue is awaiting or was resolved by", () => {
    const contractors = [{ id: "c1", name: "Acme Fire Ltd" }];
    const awaiting = { category: "maintenance", status: "Awaiting", location: "Room 12", awaitingContractorId: "c1" };
    expect(recordDetailText(awaiting, [], [], contractors, [])).toBe("Room 12 · Awaiting Acme Fire Ltd");
    const resolved = { category: "maintenance", status: "Resolved", location: "Room 12", resolvedContractorId: "c1" };
    expect(recordDetailText(resolved, [], [], contractors, [])).toBe("Room 12 · Resolved by Acme Fire Ltd");
  });
});

describe("recordWhoText", () => {
  it("prefers the typed people field", () => {
    expect(recordWhoText({ people: "Duty Manager" }, [], [])).toBe("Duty Manager");
  });

  it("falls back to a linked contractor, then a linked staff member", () => {
    expect(recordWhoText({ contractorId: "c1" }, [{ id: "c1", name: "Acme Fire Ltd" }], [])).toBe("Acme Fire Ltd");
    expect(recordWhoText({ staffId: "s1" }, [], [{ id: "s1", name: "Jane Doe" }])).toBe("Jane Doe");
  });

  it("falls back to whoever last edited the record (the export bug: this used to render blank)", () => {
    const record = { history: [{ by: "Valentin Glodeanu" }] };
    expect(recordWhoText(record, [], [])).toBe("Valentin Glodeanu");
  });

  it("falls back to an em-dash with no people field, no links, and no history", () => {
    expect(recordWhoText({}, [], [])).toBe("—");
  });
});

describe("generateAssetCode", () => {
  it("uses the asset type's prefix and increments per existing asset of that type", () => {
    expect(generateAssetCode("fire_extinguisher", [])).toBe("FE-001");
    expect(
      generateAssetCode("fire_extinguisher", [
        { assetType: "fire_extinguisher" },
        { assetType: "fire_extinguisher" },
      ])
    ).toBe("FE-003");
  });
});

describe("checkpointCheckEligibleCheckpoints", () => {
  const checkpoints = [{ id: "cp1", name: "101", archived: false }, { id: "cp2", name: "102", archived: false }];

  it("excludes a checkpoint whose only linked asset isn't a window restrictor (a kettle doesn't need a window check)", () => {
    const assets = [{ checkpointId: "cp1", assetType: "kettle", archived: false }];
    expect(checkpointCheckEligibleCheckpoints(checkpoints, assets)).toEqual([]);
  });

  it("includes a checkpoint with a non-archived window_restrictor asset", () => {
    const assets = [
      { checkpointId: "cp1", assetType: "kettle", archived: false },
      { checkpointId: "cp2", assetType: "window_restrictor", archived: false },
    ];
    expect(checkpointCheckEligibleCheckpoints(checkpoints, assets).map((c) => c.id)).toEqual(["cp2"]);
  });

  it("ignores an archived window_restrictor asset", () => {
    const assets = [{ checkpointId: "cp1", assetType: "window_restrictor", archived: true }];
    expect(checkpointCheckEligibleCheckpoints(checkpoints, assets)).toEqual([]);
  });
});

describe("checkpointCheckFindMissing", () => {
  it("never flags a checkpoint with only non-window assets, even with zero records logged", () => {
    const checkpoints = [{ id: "cp1", name: "101", archived: false }];
    const assets = [{ checkpointId: "cp1", assetType: "kettle", archived: false }];
    expect(checkpointCheckFindMissing(checkpoints, assets, [], "2026-01-01", "2026-01-31")).toEqual([]);
  });
});

describe("findOpenLinkedIssue / hasOpenLinkedIssue", () => {
  it("finds nothing with no records at all", () => {
    expect(findOpenLinkedIssue([], "origin1")).toBeNull();
    expect(hasOpenLinkedIssue([], "origin1")).toBe(false);
  });

  it("finds nothing for a falsy linkedId, even with matching-shaped records around", () => {
    const records = [{ id: "m1", category: "maintenance", linkedRecordId: null, status: "Open", archived: false }];
    expect(findOpenLinkedIssue(records, null)).toBeNull();
    expect(findOpenLinkedIssue(records, undefined)).toBeNull();
  });

  it("ignores a Resolved match — a closed issue never blocks a genuinely new failure", () => {
    const records = [{ id: "m1", category: "maintenance", linkedRecordId: "origin1", status: "Resolved", archived: false }];
    expect(hasOpenLinkedIssue(records, "origin1")).toBe(false);
  });

  it("ignores an archived match", () => {
    const records = [{ id: "m1", category: "maintenance", linkedRecordId: "origin1", status: "Open", archived: true }];
    expect(hasOpenLinkedIssue(records, "origin1")).toBe(false);
  });

  it("finds a genuinely open, non-archived match", () => {
    const records = [{ id: "m1", category: "maintenance", linkedRecordId: "origin1", status: "Open", archived: false }];
    expect(findOpenLinkedIssue(records, "origin1")?.id).toBe("m1");
    expect(hasOpenLinkedIssue(records, "origin1")).toBe(true);
  });

  it("never matches a different linkedId, including a composite id sharing the same prefix", () => {
    const records = [
      { id: "m1", category: "maintenance", linkedRecordId: "origin1", status: "Open", archived: false },
      { id: "m2", category: "maintenance", linkedRecordId: "origin1:kettle", status: "Open", archived: false },
    ];
    expect(findOpenLinkedIssue(records, "origin1")?.id).toBe("m1");
    expect(findOpenLinkedIssue(records, "origin1:kettle")?.id).toBe("m2");
    expect(findOpenLinkedIssue(records, "origin2")).toBeNull();
  });

  it("finds the still-open one even when an earlier, resolved issue for the same origin also exists — the two historical failures case", () => {
    const records = [
      { id: "m1", category: "maintenance", linkedRecordId: "origin1", status: "Resolved", archived: false },
      { id: "m2", category: "maintenance", linkedRecordId: "origin1", status: "Open", archived: false },
    ];
    expect(findOpenLinkedIssue(records, "origin1")?.id).toBe("m2");
  });

  it("ignores non-maintenance records even if they happen to carry a matching linkedRecordId field", () => {
    const records = [{ id: "r1", category: "pest", linkedRecordId: "origin1", status: "Open", archived: false }];
    expect(hasOpenLinkedIssue(records, "origin1")).toBe(false);
  });
});

describe("phoneContactLinks", () => {
  it("returns null for a blank or missing phone", () => {
    expect(phoneContactLinks("")).toBeNull();
    expect(phoneContactLinks(null)).toBeNull();
    expect(phoneContactLinks(undefined)).toBeNull();
  });

  it("tel: and sms: keep the number as typed (minus formatting), WhatsApp assumes UK (44) for a leading 0", () => {
    const links = phoneContactLinks("07911 123456");
    expect(links).toEqual({ tel: "tel:07911123456", sms: "sms:07911123456", whatsapp: "https://wa.me/447911123456" });
  });

  it("uses an already-international number (leading +) as-is for WhatsApp, without double-adding 44", () => {
    const links = phoneContactLinks("+44 7911 123456");
    expect(links).toEqual({ tel: "tel:+447911123456", sms: "sms:+447911123456", whatsapp: "https://wa.me/447911123456" });
  });

  it("strips dashes and brackets, not just spaces", () => {
    const links = phoneContactLinks("(079) 11-123-456");
    expect(links.tel).toBe("tel:07911123456");
  });
});

describe("checkResult", () => {
  it("recurring mode: unflagged is OK, flagged is Not OK", () => {
    expect(checkResult({ category: "equipment", flagged: false })).toBe("OK");
    expect(checkResult({ category: "equipment", flagged: true })).toBe("Not OK");
    expect(checkResult({ category: "equipment" })).toBe("OK"); // flagged undefined -> falsy -> OK
  });

  it("checkpoint_check mode (window_restriction_check / legionella_temp_check): reads record.status", () => {
    expect(checkResult({ category: "window_restriction_check", status: "ok" })).toBe("OK");
    expect(checkResult({ category: "window_restriction_check", status: "not_ok" })).toBe("Not OK");
  });

  it("checkpoint_check mode (legionella_check, multi-item): any not_ok item is Not OK, all ok is OK, partial is dashed", () => {
    expect(checkResult({ category: "legionella_check", checks: { kettle: { status: "ok" }, tap: { status: "not_ok" } } })).toBe("Not OK");
    expect(checkResult({ category: "legionella_check", checks: { kettle: { status: "ok" }, tap: { status: "ok" } } })).toBe("OK");
    expect(checkResult({ category: "legionella_check", checks: {} })).toBe("—"); // nothing ticked yet this quarter
  });

  it("never invents OK/Not OK for modes with no real pass/fail tick — expiry, review, log, incident/maintenance, firelog all read as dashed", () => {
    expect(checkResult({ category: "training", expiryDate: "2027-01-01" })).toBe("—");
    expect(checkResult({ category: "risk", lastReviewed: "2026-01-01" })).toBe("—");
    expect(checkResult({ category: "room_inspection", dateLogged: "2026-01-01" })).toBe("—");
    expect(checkResult({ category: "maintenance", status: "Open" })).toBe("—");
    expect(checkResult({ category: "fire_daily", periodKey: "2026-01-01" })).toBe("—");
  });
});

describe("assetComplianceStatus", () => {
  const asset = { id: "a1", assetType: "kettle" };

  it("an open Maintenance/Pest issue linked to the asset dominates, even alongside a compliant recurring check", () => {
    const openMaintenance = { id: "r1", category: "maintenance", assetId: "a1", status: "Open" };
    const compliantCheck = { id: "r2", category: "equipment", assetId: "a1", frequencyDays: 90, lastCompleted: "2026-08-01", flagged: false };
    expect(assetComplianceStatus(asset, [openMaintenance])).toBe("open");
    expect(assetComplianceStatus(asset, [openMaintenance, compliantCheck])).toBe("open");
  });

  it("a resolved Maintenance/Pest issue does not mask a recurring check's own status", () => {
    const resolvedMaintenance = { id: "r1", category: "maintenance", assetId: "a1", status: "Resolved" };
    const overdueCheck = { id: "r2", category: "equipment", assetId: "a1", frequencyDays: 30, lastCompleted: "2020-01-01", flagged: false };
    expect(assetComplianceStatus(asset, [resolvedMaintenance, overdueCheck])).toBe("overdue");
  });

  it("a resolved Maintenance/Pest issue with no other record reads as compliant, not no-checks — it was checked and fixed, not never logged", () => {
    const resolvedMaintenance = { id: "r1", category: "maintenance", assetId: "a1", status: "Resolved" };
    expect(assetComplianceStatus(asset, [resolvedMaintenance])).toBe("compliant");
    const resolvedPest = { id: "r2", category: "pest", assetId: "a1", status: "Resolved" };
    expect(assetComplianceStatus(asset, [resolvedMaintenance, resolvedPest])).toBe("compliant");
  });

  it("falls back to no-checks when nothing is linked to the asset at all", () => {
    expect(assetComplianceStatus(asset, [])).toBe("no-checks");
    expect(assetComplianceStatus(asset, [{ id: "r1", category: "maintenance", assetId: "someone-else", status: "Open" }])).toBe("no-checks");
  });

  it("ignores an archived open issue", () => {
    const archivedOpenMaintenance = { id: "r1", category: "maintenance", assetId: "a1", status: "Open", archived: true };
    expect(assetComplianceStatus(asset, [archivedOpenMaintenance])).toBe("no-checks");
  });
});
