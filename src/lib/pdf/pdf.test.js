import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildRegisterPdf } from "./registerPdf";
import { buildFireLogPdf } from "./fireLogPdf";

/**
 * Structural tests only — pdf-lib output is binary, so these don't (and can't
 * usefully) assert on visual layout. What matters here: the builders produce a
 * genuinely valid PDF (loads back via pdf-lib), the right page count for a
 * given amount of content, and don't throw on the edge cases most likely to
 * break (empty data, no branding, long text forcing pagination, and the ✓
 * glyph that WinAnsi standard fonts can't encode as text — see pdfKit.js's
 * checkmark()/table() handling, which this guards against regressing).
 */

const simpleColumns = [{ key: "name", label: "Name", width: 1 }];

describe("buildRegisterPdf", () => {
  it("produces a valid, loadable PDF with the correct magic header", async () => {
    const bytes = await buildRegisterPdf({
      title: "Test Register", subtitle: "Saved today", branding: null,
      sections: [{ type: "table", columns: simpleColumns, rows: [{ name: "Acme Ltd" }] }],
    });
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("doesn't throw with zero rows or no branding at all", async () => {
    const bytes = await buildRegisterPdf({
      title: "Empty Register", subtitle: "", branding: null,
      sections: [{ type: "table", columns: simpleColumns, rows: [] }],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("paginates once enough rows overflow one page", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ name: `Row ${i}` }));
    const bytes = await buildRegisterPdf({
      title: "Long Register", subtitle: "", branding: null,
      sections: [{ type: "table", columns: simpleColumns, rows }],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("doesn't crash on a status chip value that has no STATUS_META entry", async () => {
    const bytes = await buildRegisterPdf({
      title: "Chip Edge Case", subtitle: "", branding: null,
      sections: [{ type: "table", columns: [{ key: "status", label: "Status", width: 1, chip: true }], rows: [{ status: "not-a-real-status" }] }],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("doesn't crash on a plain '✓' cell value — WinAnsi standard fonts can't encode it as text", async () => {
    const bytes = await buildRegisterPdf({
      title: "Checkmark Edge Case", subtitle: "", branding: null,
      sections: [{ type: "table", columns: simpleColumns, rows: [{ name: "✓" }] }],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("supports heading/paragraph/table sections together (the Audit gap report shape)", async () => {
    const bytes = await buildRegisterPdf({
      title: "Audit Report", subtitle: "", branding: { companyName: "Test Hotel" },
      sections: [
        { type: "heading", text: "Do these first" },
        { type: "table", columns: simpleColumns, rows: [{ name: "Item" }] },
        { type: "paragraph", text: "Closing guidance text." },
      ],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe("buildFireLogPdf", () => {
  it("produces one page per week, even with zero records", async () => {
    const bytes = await buildFireLogPdf({ records: [], startDate: "2026-01-05", endDate: "2026-01-11", managerName: "Bob Manager", branding: null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("one real PDF page per Monday-start week in the range", async () => {
    const bytes = await buildFireLogPdf({ records: [], startDate: "2026-01-05", endDate: "2026-01-18", managerName: "Bob Manager", branding: null });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it("handles a fully-populated week (done/not-done/comments/call points/N/A/periodic) without throwing", async () => {
    const records = [
      { id: "d1", category: "fire_daily", periodKey: "2026-01-05", archived: false, checks: { exitDoorsOpen: { done: true, comments: "note" }, openingProcedure: { done: false }, exitDoorsClosed: { done: true }, closingProcedure: { done: true } }, history: [{ at: "2026-01-05T09:00:00.000Z", by: "Alice" }] },
      { id: "w1", category: "fire_weekly", periodKey: "2026-01-05", archived: false, checks: { fireAlarmTest: { done: true, callPoint: "Zone 1" } }, history: [{ at: "2026-01-05T10:00:00.000Z", by: "Bob" }] },
      { id: "m1", category: "fire_monthly", periodKey: "2026-01", archived: false, checks: { staffInduction: { status: "na" } }, history: [{ at: "2026-01-03T10:00:00.000Z", by: "Bob" }] },
      { id: "p1", category: "fire_periodic", periodicItemKey: "fireDrill", dateLogged: "2026-01-06", title: "Fire drill", archived: false, checks: { fireDrill: { comments: "All clear" } }, history: [{ at: "2026-01-06T14:00:00.000Z", by: "Bob" }] },
    ];
    const bytes = await buildFireLogPdf({ records, startDate: "2026-01-05", endDate: "2026-01-11", managerName: "Bob Manager", branding: { companyName: "Test Hotel" } });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
