import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  localDateStr, addDays, weekStartDate, daysUntil, daysSince, fmtDate, formatBytes,
  initialsOf, getMode, getDueDate, getStatus, isOverdue, isDueSoon, isDueToday, isOpenIssue,
  insuranceStatus, certificateStatus, visitStatus, validateRecord, validateAsset, validateRoom,
  validateContractor, validateStaff, validateCertificate, validateVisit, validateUser, generateAssetCode,
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

  it("isOverdue / isDueSoon / isDueToday / isOpenIssue derive from getStatus", () => {
    expect(isOverdue({ category: "training", expiryDate: "2025-12-01" })).toBe(true);
    expect(isDueSoon({ category: "training", expiryDate: "2026-01-25" })).toBe(true);
    expect(isDueToday({ category: "training", expiryDate: "2026-01-15" })).toBe(true);
    expect(isOpenIssue({ category: "pest", status: "Awaiting" })).toBe(true);
    expect(isOpenIssue({ category: "pest", status: "Resolved" })).toBe(false);
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
