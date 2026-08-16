import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  fmtDate, addDays, weekStartDate, todayStr, lastEditor,
  fireLogCurrentPeriodKey, fireLogPeriodLabel, fireLogFindMissingDaily, fireLogWeeksInRange,
  fireLogMergeItemForExport, fireLogExportSource, fireLogLockBoundary, isFireLogLocked,
  fireLogEnsureSnapshot, fireLogRepairWeeklyKeys, fireLogSuspectedTimezoneAffected,
  checkpointCheckPeriodKey, checkpointCheckPeriodLabel, checkpointCheckPeriodsInRange, checkpointCheckLockBoundary,
  isCheckpointCheckLocked, checkpointCheckExportSource,
} from "./helpers";

describe("lastEditor", () => {
  it("returns the most recent history entry that has a 'by'", () => {
    expect(lastEditor({ history: [{ by: "Alice" }, { by: "Bob" }] })).toBe("Bob");
  });

  it("skips entries with no 'by' and falls back further back", () => {
    expect(lastEditor({ history: [{ by: "Alice" }, { note: "system event" }] })).toBe("Alice");
  });

  it("returns null with no history at all", () => {
    expect(lastEditor({})).toBe(null);
    expect(lastEditor({ history: [] })).toBe(null);
  });
});

describe("fireLogCurrentPeriodKey", () => {
  it("daily is just today's date", () => {
    expect(fireLogCurrentPeriodKey("fire_daily", "2026-03-05")).toBe("2026-03-05");
  });

  it("weekly delegates to weekStartDate", () => {
    expect(fireLogCurrentPeriodKey("fire_weekly", "2026-03-05")).toBe(weekStartDate("2026-03-05"));
  });

  it("monthly is the year-month prefix", () => {
    expect(fireLogCurrentPeriodKey("fire_monthly", "2026-03-05")).toBe("2026-03");
  });

  it("periodic has no shared period key", () => {
    expect(fireLogCurrentPeriodKey("fire_periodic", "2026-03-05")).toBe(null);
  });

  it("defaults 'today' to todayStr() when omitted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0));
    expect(fireLogCurrentPeriodKey("fire_daily")).toBe("2026-01-15");
    vi.useRealTimers();
  });
});

describe("fireLogPeriodLabel", () => {
  it("daily: a formatted date", () => {
    expect(fireLogPeriodLabel("fire_daily", "2026-03-05")).toBe(fmtDate("2026-03-05"));
  });

  it("weekly: 'Week of <mon> – <sun>'", () => {
    expect(fireLogPeriodLabel("fire_weekly", "2026-03-02")).toBe(
      `Week of ${fmtDate("2026-03-02")} – ${fmtDate(addDays("2026-03-02", 6))}`
    );
  });

  it("monthly: full month name and year", () => {
    expect(fireLogPeriodLabel("fire_monthly", "2026-03")).toBe("March 2026");
  });

  it("periodic (or anything else): empty string", () => {
    expect(fireLogPeriodLabel("fire_periodic", "whatever")).toBe("");
  });
});

describe("fireLogFindMissingDaily", () => {
  it("flags every day in range with no non-archived daily record", () => {
    const records = [{ category: "fire_daily", periodKey: "2026-01-01", archived: false }];
    expect(fireLogFindMissingDaily(records, "2026-01-01", "2026-01-03")).toEqual([
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it("an archived record doesn't count as covering its day", () => {
    const records = [{ category: "fire_daily", periodKey: "2026-01-02", archived: true }];
    expect(fireLogFindMissingDaily(records, "2026-01-01", "2026-01-02")).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("returns an empty list when every day is covered", () => {
    const records = [
      { category: "fire_daily", periodKey: "2026-01-01", archived: false },
      { category: "fire_daily", periodKey: "2026-01-02", archived: false },
    ];
    expect(fireLogFindMissingDaily(records, "2026-01-01", "2026-01-02")).toEqual([]);
  });
});

describe("fireLogWeeksInRange", () => {
  it("lists every Monday-start week overlapping the range", () => {
    // 2024-01-01 is a known Monday, 2024-01-14 falls in the following week
    expect(fireLogWeeksInRange("2024-01-01", "2024-01-14")).toEqual(["2024-01-01", "2024-01-08"]);
  });

  it("a single-day range still returns that day's week", () => {
    expect(fireLogWeeksInRange("2024-01-03", "2024-01-03")).toEqual(["2024-01-01"]);
  });
});

describe("fireLogMergeItemForExport", () => {
  it("a genuinely blank-at-lock field that's since been filled counts as late filing, not a correction", () => {
    const snap = { comments: "", callPoint: "A1", done: false, status: "" };
    const live = { comments: "filled late", callPoint: "A2 changed", done: true, status: "OK" };
    expect(fireLogMergeItemForExport(snap, live)).toEqual({
      comments: "filled late", // was blank at lock -> live value shows through
      callPoint: "A1", // had a value at lock -> stays frozen even though it later changed
      done: true, // false -> true is allowed through (same "late completion" rule)
      status: "OK", // was blank at lock -> live value shows through
    });
  });

  it("falls back to whichever side actually exists", () => {
    expect(fireLogMergeItemForExport(null, { done: true })).toEqual({ done: true });
    expect(fireLogMergeItemForExport({ done: true }, null)).toEqual({ done: true });
    expect(fireLogMergeItemForExport(null, null)).toBe(null);
  });
});

describe("fireLogLockBoundary / isFireLogLocked", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0)); // fixed "now": 2026-01-15 10:00
  });
  afterEach(() => vi.useRealTimers());

  it("fire_daily locks at the end of its own day", () => {
    expect(isFireLogLocked({ category: "fire_daily", periodKey: "2026-01-14" })).toBe(true); // yesterday
    expect(isFireLogLocked({ category: "fire_daily", periodKey: "2026-01-15" })).toBe(false); // still today
  });

  it("fire_weekly locks at the end of its Sunday", () => {
    expect(isFireLogLocked({ category: "fire_weekly", periodKey: "2026-01-05" })).toBe(true); // week long over
  });

  it("fire_monthly locks at the end of its month", () => {
    expect(isFireLogLocked({ category: "fire_monthly", periodKey: "2025-12" })).toBe(true);
    expect(isFireLogLocked({ category: "fire_monthly", periodKey: "2026-01" })).toBe(false); // still January
  });

  it("fire_periodic locks 24h after its first save", () => {
    const wellOver = new Date(2026, 0, 14, 9, 0, 0).toISOString(); // 25h before "now"
    const notYet = new Date(2026, 0, 15, 9, 30, 0).toISOString(); // 30m before "now"
    expect(isFireLogLocked({ category: "fire_periodic", history: [{ at: wellOver }] })).toBe(true);
    expect(isFireLogLocked({ category: "fire_periodic", history: [{ at: notYet }] })).toBe(false);
  });
});

describe("fireLogExportSource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("returns null for no record", () => {
    expect(fireLogExportSource(null)).toBe(null);
  });

  it("an unlocked record shows its live state, credited to the last editor", () => {
    const record = {
      category: "fire_daily",
      periodKey: "2026-01-20", // in the future -> not locked
      checks: { x: { done: false } },
      history: [{ by: "Bob" }],
    };
    expect(fireLogExportSource(record)).toEqual({ checks: { x: { done: false } }, by: "Bob" });
  });

  it("a locked record with a snapshot merges frozen + late-filled fields, credited to the snapshot's editor", () => {
    const record = {
      category: "fire_daily",
      periodKey: "2026-01-10", // well in the past -> locked
      lockedSnapshot: {
        by: "Alice",
        checks: { a: { done: true, comments: "snap" } },
      },
      checks: {
        a: { done: true, comments: "snap" },
        b: { done: true, comments: "added after lock" }, // present live, absent from the snapshot
      },
    };
    expect(fireLogExportSource(record)).toEqual({
      checks: {
        a: { done: true, comments: "snap" },
        b: { done: true, comments: "added after lock" },
      },
      by: "Alice",
    });
  });
});

describe("fireLogEnsureSnapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("leaves an unlocked record untouched", () => {
    const record = { category: "fire_daily", periodKey: "2026-01-20", checks: {} };
    expect(fireLogEnsureSnapshot(record)).toBe(record); // same reference, no-op
  });

  it("leaves an already-snapshotted record untouched", () => {
    const record = { category: "fire_daily", periodKey: "2026-01-10", lockedSnapshot: { by: "Alice" } };
    expect(fireLogEnsureSnapshot(record)).toBe(record);
  });

  it("freezes a locked record's current state the first time it's looked at", () => {
    const record = {
      category: "fire_daily",
      periodKey: "2026-01-10",
      checks: { a: { done: true } },
      history: [{ by: "Carol" }],
    };
    const result = fireLogEnsureSnapshot(record);
    expect(result.lockedSnapshot).toMatchObject({ checks: { a: { done: true } }, by: "Carol" });
  });
});

describe("fireLogRepairWeeklyKeys", () => {
  it("shifts a mislabelled Sunday-stored key forward a day when that resolves to a valid Monday", () => {
    const records = [{ id: "1", category: "fire_weekly", periodKey: "2024-01-07", archived: false, history: [] }];
    const { next, fixed } = fireLogRepairWeeklyKeys(records, "Fixer");
    expect(fixed).toEqual([{ id: "1", from: "2024-01-07", to: "2024-01-08" }]);
    expect(next[0].periodKey).toBe("2024-01-08");
    expect(next[0].history).toHaveLength(1);
    expect(next[0].history[0]).toMatchObject({ action: "edited", by: "Fixer" });
  });

  it("leaves an already-valid weekly key alone, unchanged (same reference)", () => {
    const record = { id: "2", category: "fire_weekly", periodKey: "2024-01-01", archived: false, history: [] };
    const { next, fixed } = fireLogRepairWeeklyKeys([record], "Fixer");
    expect(next[0]).toBe(record);
    expect(fixed).toEqual([]);
  });

  it("doesn't guess further when shifting by a day still isn't a valid Monday", () => {
    const record = { id: "3", category: "fire_weekly", periodKey: "2024-01-03", archived: false, history: [] };
    const { next, fixed } = fireLogRepairWeeklyKeys([record], "Fixer");
    expect(next[0]).toBe(record); // left untouched
    expect(fixed).toEqual([]);
  });

  it("ignores non-weekly and archived records entirely", () => {
    const daily = { id: "4", category: "fire_daily", periodKey: "2024-01-07", archived: false, history: [] };
    const archivedWeekly = { id: "5", category: "fire_weekly", periodKey: "2024-01-07", archived: true, history: [] };
    const { next, fixed } = fireLogRepairWeeklyKeys([daily, archivedWeekly], "Fixer");
    expect(next[0]).toBe(daily);
    expect(next[1]).toBe(archivedWeekly);
    expect(fixed).toEqual([]);
  });
});

describe("fireLogSuspectedTimezoneAffected", () => {
  const originalTZ = process.env.TZ;
  afterEach(() => { process.env.TZ = originalTZ; });

  it("is false for categories other than daily/monthly", () => {
    expect(fireLogSuspectedTimezoneAffected({ category: "fire_weekly", periodKey: "2026-01-01", history: [{ at: "2026-01-01T00:00:00.000Z" }] })).toBe(false);
  });

  it("is false with no history or no periodKey", () => {
    expect(fireLogSuspectedTimezoneAffected({ category: "fire_daily", periodKey: "2026-01-01", history: [] })).toBe(false);
    expect(fireLogSuspectedTimezoneAffected({ category: "fire_daily", history: [{ at: "2026-01-01T00:00:00.000Z" }] })).toBe(false);
  });

  it("flags a daily record whose periodKey matches the old (UTC-based) bug's output, not the correct local date", () => {
    process.env.TZ = "Europe/London";
    // 23:30 UTC in June (BST, UTC+1) -> local calendar date is one day ahead of the UTC date
    const at = "2026-06-15T23:30:00.000Z";
    const buggyRecord = { category: "fire_daily", periodKey: "2026-06-15", history: [{ at }] }; // stored the UTC date, per the old bug
    const correctRecord = { category: "fire_daily", periodKey: "2026-06-16", history: [{ at }] }; // stored the correct local date
    expect(fireLogSuspectedTimezoneAffected(buggyRecord)).toBe(true);
    expect(fireLogSuspectedTimezoneAffected(correctRecord)).toBe(false);
  });

  it("is false for a moment where the bug's window never applied (UTC and local date agree)", () => {
    process.env.TZ = "Europe/London";
    const at = "2026-06-15T10:00:00.000Z"; // mid-morning UTC -> same local calendar date either way
    expect(fireLogSuspectedTimezoneAffected({ category: "fire_daily", periodKey: "2026-06-15", history: [{ at }] })).toBe(false);
  });
});

describe("checkpointCheckPeriodKey / checkpointCheckPeriodLabel", () => {
  it("period key is the year-month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0));
    expect(checkpointCheckPeriodKey()).toBe("2026-01");
    vi.useRealTimers();
  });

  it("period label is the full month name and year", () => {
    expect(checkpointCheckPeriodLabel("2026-03")).toBe("March 2026");
  });
});

describe("checkpointCheckPeriodsInRange", () => {
  it("lists every calendar-month period overlapping the range", () => {
    expect(checkpointCheckPeriodsInRange("2026-01-15", "2026-04-02")).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
  });

  it("a range within a single month is just that one period", () => {
    expect(checkpointCheckPeriodsInRange("2026-03-01", "2026-03-20")).toEqual(["2026-03"]);
  });

  it("correctly rolls over a year boundary", () => {
    expect(checkpointCheckPeriodsInRange("2025-11-10", "2026-02-05")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("checkpointCheckLockBoundary / isCheckpointCheckLocked", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("locks at the end of its month", () => {
    expect(isCheckpointCheckLocked({ periodKey: "2025-12" })).toBe(true);
    expect(isCheckpointCheckLocked({ periodKey: "2026-01" })).toBe(false);
  });
});

describe("checkpointCheckExportSource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("returns null for no record", () => {
    expect(checkpointCheckExportSource(null)).toBe(null);
  });

  it("an unlocked record shows its live state", () => {
    const record = { periodKey: "2026-01", status: "OK", note: "fine", history: [{ by: "Dan" }] };
    expect(checkpointCheckExportSource(record)).toEqual({ status: "OK", note: "fine", by: "Dan" });
  });

  it("a locked record with a blank-at-lock note shows a later-added note (late filing)", () => {
    const record = {
      periodKey: "2025-12",
      status: "OK",
      note: "added after lock",
      lockedSnapshot: { status: "Not OK", note: "", by: "Alice" },
    };
    expect(checkpointCheckExportSource(record)).toEqual({ status: "Not OK", note: "added after lock", by: "Alice" });
  });

  it("a locked record with a real note at lock time keeps it frozen even if the note later changed", () => {
    const record = {
      periodKey: "2025-12",
      status: "OK",
      note: "changed after lock",
      lockedSnapshot: { status: "Not OK", note: "original note at lock", by: "Alice" },
    };
    expect(checkpointCheckExportSource(record)).toEqual({ status: "Not OK", note: "original note at lock", by: "Alice" });
  });

  it("a maintenance resolution (resolvedVia) shows through live even across a lock", () => {
    const record = {
      periodKey: "2025-12",
      status: "OK",
      note: "resolved",
      resolvedVia: "maintenance-record-123",
      lockedSnapshot: { status: "Not OK", note: "original fault", by: "Alice" },
      history: [{ by: "Dan" }],
    };
    expect(checkpointCheckExportSource(record)).toEqual({ status: "OK", note: "resolved", by: "Dan" });
  });
});
