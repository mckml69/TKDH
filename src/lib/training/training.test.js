import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { DUE_SOON_DAYS, moduleStatus, recordStatus, refreshLabel, isoDay, shuffled, slug } from "./status";
import { buildCertificatePdf } from "../pdf/certificatePdf";
import { buildRegisterPdf } from "../pdf/registerPdf";
import { STATUS_META } from "../constants";

const NOW = new Date("2026-10-14T12:00:00Z");
const inDays = (n) => new Date(NOW.getTime() + n * 86400000).toISOString();

describe("moduleStatus", () => {
  it("is not started with no result", () => {
    expect(moduleStatus(null, NOW)).toBe("tr-not-started");
    expect(moduleStatus(undefined, NOW)).toBe("tr-not-started");
  });
  it("is not passed after a failed attempt", () => {
    expect(moduleStatus({ passed: false, validUntil: null }, NOW)).toBe("tr-failed");
  });
  it("is passed while valid, due soon inside the warning window, expired afterwards", () => {
    expect(moduleStatus({ passed: true, validUntil: inDays(400) }, NOW)).toBe("tr-passed");
    expect(moduleStatus({ passed: true, validUntil: inDays(DUE_SOON_DAYS + 1) }, NOW)).toBe("tr-passed");
    expect(moduleStatus({ passed: true, validUntil: inDays(DUE_SOON_DAYS) }, NOW)).toBe("tr-due-soon");
    expect(moduleStatus({ passed: true, validUntil: inDays(1) }, NOW)).toBe("tr-due-soon");
    expect(moduleStatus({ passed: true, validUntil: inDays(-1) }, NOW)).toBe("tr-expired");
  });
  it("treats a pass with no expiry as passed", () => {
    expect(moduleStatus({ passed: true, validUntil: null }, NOW)).toBe("tr-passed");
  });
});

describe("recordStatus (team summary rows)", () => {
  it("uses the latest pass even if a later attempt failed", () => {
    const rec = { attempts: 3, lastAttemptPassed: false, lastPass: { validUntil: inDays(300) } };
    expect(recordStatus(rec, NOW)).toBe("tr-passed");
  });
  it("is expired when the only pass has run out", () => {
    expect(recordStatus({ attempts: 1, lastPass: { validUntil: inDays(-5) } }, NOW)).toBe("tr-expired");
  });
  it("is not passed with attempts but no pass, and not started with no row at all", () => {
    expect(recordStatus({ attempts: 2, lastPass: null }, NOW)).toBe("tr-failed");
    expect(recordStatus(undefined, NOW)).toBe("tr-not-started");
  });
  it("every status it can return has a label and colour", () => {
    for (const k of ["tr-passed", "tr-due-soon", "tr-expired", "tr-failed", "tr-not-started"]) {
      expect(STATUS_META[k]).toMatchObject({ label: expect.any(String), color: expect.stringMatching(/^#/) });
    }
  });
});

describe("small helpers", () => {
  it("describes refresh periods", () => {
    expect(refreshLabel(12)).toBe("every 12 months");
    expect(refreshLabel(24)).toBe("every 2 years");
    expect(refreshLabel(36)).toBe("every 3 years");
    expect(refreshLabel(18)).toBe("every 18 months");
  });
  it("cuts a server timestamp to a day", () => {
    expect(isoDay("2026-10-14T08:12:03.000Z")).toBe("2026-10-14");
    expect(isoDay(null)).toBe("");
  });
  it("shuffles into a new array without losing or duplicating anything", () => {
    const src = [1, 2, 3, 4, 5, 6];
    const out = shuffled(src);
    expect(out).not.toBe(src);
    expect([...out].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("makes file-name-safe slugs", () => {
    expect(slug("Sam O'Brien (GM)")).toBe("sam-o-brien-gm");
    expect(slug("")).toBe("x");
  });
});

describe("buildCertificatePdf", () => {
  const cert = {
    certificateNo: "FSA-20261014-K3PZ", name: "Sam Patel", moduleId: "fire", moduleTitle: "Fire Safety Awareness", version: "2026.10-KH",
    score: 9, total: 10, completedAt: "2026-10-14T08:12:03.000Z", validUntil: "2027-10-14T08:12:03.000Z",
    certNote: "Awareness training only.", hotelName: "The Kings Head Hotel", signedBy: "Test Manager, General Manager",
  };
  it("produces a valid one-page PDF with the report letterhead and footer branding", async () => {
    const bytes = await buildCertificatePdf({
      cert, savedOn: "2026-10-14",
      branding: { companyName: "The Kings Head Hotel", address: "214 High Street\nLondon", registrationNumber: "Co. 123", footerText: "Confidential", logoDataUrl: "" },
    });
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height); // landscape, like a certificate
  });
  it("copes with no branding, no note and no expiry", async () => {
    const bytes = await buildCertificatePdf({ cert: { ...cert, certNote: null, validUntil: null, signedBy: null }, branding: null, savedOn: "2026-10-14" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
  it("shrinks a very long name and module title to fit one page instead of failing", async () => {
    const bytes = await buildCertificatePdf({
      cert: { ...cert, name: "Alexandrina Wilhelmina Konstantinopolitanskaya-Featherstonehaugh", moduleTitle: "An Exceedingly Long Module Title About Everything You Could Possibly Need To Know" },
      branding: { companyName: "The Kings Head Hotel", address: "1\n2\n3\n4", registrationNumber: "R", footerText: "F", logoDataUrl: "" }, savedOn: "2026-10-14",
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe("training report through the shared register PDF", () => {
  it("renders training status chips and does not throw for every status", async () => {
    const rows = ["tr-passed", "tr-due-soon", "tr-expired", "tr-failed", "tr-not-started"].map((status, i) => ({ name: `Person ${i}`, module: "Fire Safety Awareness", status, completed: "", until: "", cert: "" }));
    const columns = [
      { key: "name", label: "Name", width: 0.3 }, { key: "module", label: "Module", width: 0.3 },
      { key: "status", label: "Status", width: 0.2, chip: true }, { key: "cert", label: "Certificate", width: 0.2 },
    ];
    const bytes = await buildRegisterPdf({ title: "Training Report", subtitle: "x", branding: null, sections: [{ type: "table", columns, rows }] });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

import { deriveTrainingRecords } from "./derive";
import { isSupersededTraining, staffTrainingStatus, requirementStatus, getMode, getStatus, matchRequirement } from "../helpers";
import { REQUIREMENTS, TEMPLATES, TRAINING_DEFAULT_VALIDITY_DAYS, TRAINING_MODULE_PRESET } from "../constants";

const rec = (over) => ({ id: "x", category: "training", title: "Sam", detail: "Fire Safety Awareness", staffId: "s1", archived: false, completedDate: "2026-01-01", expiryDate: "2027-01-01", ...over });

describe("deriveTrainingRecords", () => {
  const staff = [{ id: "s1", name: "Sam Reception" }, { id: "s2", name: "Gone", archived: true }];
  const row = (over) => ({ userId: "u1", staffId: "s1", userName: "Sam R", moduleId: "fire", moduleTitle: "Fire Safety Awareness", attempts: 1, lastAttemptPassed: true,
    lastPass: { score: 9, total: 10, completedAt: "2026-10-14T08:00:00.000Z", validUntil: "2027-10-14T08:00:00.000Z", certNo: "FSA-1", version: "2026.10-KH" }, ...over });

  it("makes a read-only training record from a pass, named after the Staff register entry", () => {
    const [r] = deriveTrainingRecords([row()], staff);
    expect(r).toMatchObject({ category: "training", title: "Sam Reception", detail: "Fire Safety Awareness", staffId: "s1", completedDate: "2026-10-14", expiryDate: "2027-10-14", archived: false, __training: true });
    expect(r.id).toBe("training:u1:fire");
    expect(r.notes).toContain("FSA-1");
    expect(getMode(r)).toBe("expiry");
  });
  it("skips failures, unpaired logins, archived or missing staff", () => {
    const out = deriveTrainingRecords([
      row({ lastPass: null, attempts: 2 }), row({ staffId: null }), row({ staffId: "s2" }), row({ staffId: "nobody" }),
    ], staff);
    expect(out).toEqual([]);
  });
  it("maps each module to its Ledger training type, and every mapped type is a real preset with a default expiry", () => {
    for (const preset of Object.values(TRAINING_MODULE_PRESET)) {
      expect(TEMPLATES.training.presets).toContain(preset);
      expect(TRAINING_DEFAULT_VALIDITY_DAYS[preset]).toBeGreaterThan(0);
    }
    expect(TEMPLATES.training.presets).toContain("First Aid at Work"); // the external certificate stays
    expect(TRAINING_MODULE_PRESET.firstaid).toBe("First Aid Awareness"); // and the in-house module is a separate type
  });
  it("uses the module title for a module it has no mapping for", () => {
    const [r] = deriveTrainingRecords([row({ moduleId: "brandnew", moduleTitle: "Brand New Module" })], staff);
    expect(r.detail).toBe("Brand New Module");
  });
});

describe("renewed training supersedes the old record", () => {
  const old = rec({ id: "old", expiryDate: "2025-01-01" });
  const renewed = rec({ id: "new", completedDate: "2026-10-14", expiryDate: "2027-10-14" });
  it("only the older record for the same person and type is superseded", () => {
    expect(isSupersededTraining(old, [old, renewed])).toBe(true);
    expect(isSupersededTraining(renewed, [old, renewed])).toBe(false);
    expect(isSupersededTraining(old, [old, rec({ id: "o", staffId: "s2", expiryDate: "2030-01-01" })])).toBe(false); // another person
    expect(isSupersededTraining(old, [old, rec({ id: "o", detail: "Manual Handling", expiryDate: "2030-01-01" })])).toBe(false); // another type
    expect(isSupersededTraining(old, [old, rec({ id: "o", archived: true, expiryDate: "2030-01-01" })])).toBe(false); // archived doesn't count
  });
  it("an expired old record no longer keeps the person overdue once they have renewed", () => {
    const staff = { id: "s1" };
    expect(staffTrainingStatus(staff, [old])).toBe("overdue");
    expect(staffTrainingStatus(staff, [old, renewed])).toBe("compliant");
  });
  it("the Library requirement is satisfied by the renewal, not dragged down by the old record", () => {
    const req = REQUIREMENTS.find((r) => r.id === "fire-training");
    const records = [old, renewed];
    expect(requirementStatus(req, matchRequirement(req, records, []))).toBe("compliant");
    expect(requirementStatus(req, matchRequirement(req, [old], []))).toBe("overdue");
  });
});

describe("Library entries for the in-house training types", () => {
  it("has one entry per new type, and the external First Aid at Work entry is still there", () => {
    const ids = REQUIREMENTS.map((r) => r.id);
    for (const id of ["first-aid-training", "first-aid-awareness-training", "equality-training", "harassment-training", "data-protection-training", "hs-induction"]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("Health & Safety Induction is no longer a one-off: it has an expiry and a 36-month default", () => {
    expect(REQUIREMENTS.find((r) => r.id === "hs-induction").timingModel).toBeUndefined();
    expect(TRAINING_DEFAULT_VALIDITY_DAYS["Health & Safety Induction"]).toBe(1095);
    expect(getStatus(rec({ detail: "Health & Safety Induction", completedDate: "2020-01-01", expiryDate: "2023-01-01" }))).toBe("overdue");
  });
  it("a derived record is matched by the Library entry for its type", () => {
    const [d] = deriveTrainingRecords([{ userId: "u", staffId: "s1", userName: "x", moduleId: "equality", moduleTitle: "Equality & Discrimination", attempts: 1,
      lastPass: { score: 8, total: 8, completedAt: "2026-10-14T00:00:00Z", validUntil: "2028-10-14T00:00:00Z", certNo: "EQD-1", version: "v" } }], [{ id: "s1", name: "Sam" }]);
    const req = REQUIREMENTS.find((r) => r.id === "equality-training");
    expect(matchRequirement(req, [d], []).records).toHaveLength(1);
    expect(requirementStatus(req, matchRequirement(req, [d], []))).toBe("compliant");
  });
});

import { staffOutstandingTraining } from "../helpers";

describe("training status takes assigned modules into account", () => {
  const staff = { id: "s1" };
  const fire = rec({ id: "f", detail: "Fire Safety Awareness", expiryDate: "2099-01-01" });
  const manual = rec({ id: "m", detail: "Manual Handling", expiryDate: "2099-01-01" });
  const ALL = ["Fire Safety Awareness", "Manual Handling", "Legionella Awareness"];

  it("passing some of what was assigned is In progress, not Compliant", () => {
    expect(staffTrainingStatus(staff, [fire], ALL)).toBe("incomplete");
    expect(staffTrainingStatus(staff, [fire, manual], ALL)).toBe("incomplete");
    expect(staffOutstandingTraining(staff, [fire, manual], ALL)).toEqual(["Legionella Awareness"]);
  });
  it("is Compliant only once every assigned module has an in-date record", () => {
    const legionella = rec({ id: "l", detail: "Legionella Awareness", expiryDate: "2099-01-01" });
    expect(staffTrainingStatus(staff, [fire, manual, legionella], ALL)).toBe("compliant");
    expect(staffOutstandingTraining(staff, [fire, manual, legionella], ALL)).toEqual([]);
  });
  it("shows assigned-but-untouched as In progress instead of 'No checks logged'", () => {
    expect(staffTrainingStatus(staff, [], ALL)).toBe("incomplete");
    expect(staffTrainingStatus(staff, [], [])).toBe("no-checks");
    expect(staffTrainingStatus(staff, [], undefined)).toBe("no-checks");
  });
  it("overdue outranks incomplete, which outranks due soon and compliant", () => {
    const expired = rec({ id: "e", detail: "Manual Handling", expiryDate: "2020-01-01" });
    const soon = rec({ id: "d", detail: "Fire Safety Awareness", expiryDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
    expect(staffTrainingStatus(staff, [fire, expired], ALL)).toBe("overdue");
    expect(staffTrainingStatus(staff, [soon, manual], ["Fire Safety Awareness", "Manual Handling", "Legionella Awareness"])).toBe("incomplete");
    expect(staffTrainingStatus(staff, [soon, manual], ["Fire Safety Awareness", "Manual Handling"])).toBe("due-soon");
  });
  it("an expired record counts as done-but-overdue, not outstanding, and a renewal supersedes it", () => {
    const expired = rec({ id: "e", detail: "Fire Safety Awareness", expiryDate: "2020-01-01" });
    expect(staffOutstandingTraining(staff, [expired], ["Fire Safety Awareness"])).toEqual([]);
    expect(staffTrainingStatus(staff, [expired], ["Fire Safety Awareness"])).toBe("overdue");
    expect(staffTrainingStatus(staff, [expired, fire], ["Fire Safety Awareness"])).toBe("compliant");
  });
  it("ignores archived records and other people's records", () => {
    const other = rec({ id: "o", staffId: "s2", detail: "Fire Safety Awareness", expiryDate: "2099-01-01" });
    const archived = rec({ id: "a", detail: "Fire Safety Awareness", expiryDate: "2099-01-01", archived: true });
    expect(staffOutstandingTraining(staff, [other, archived], ["Fire Safety Awareness"])).toEqual(["Fire Safety Awareness"]);
  });
  it("the In progress status has a label and colour for the app and the PDF", () => {
    expect(STATUS_META.incomplete).toMatchObject({ label: "In progress", color: expect.stringMatching(/^#/) });
  });
});
