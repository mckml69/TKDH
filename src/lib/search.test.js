import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  dateSearchBlob, attachmentBlob, tagBlob,
  recordHaystack, assetHaystack, roomHaystack, requirementHaystack,
  contractorHaystack, staffHaystack, certificateHaystack, visitHaystack,
  matchesQuery, universalSearch,
  getMatchKey, matchRequirement, requirementStatus,
  belongsToRoom, findRoomMentions, getEventDate,
  assetComplianceStatus, staffTrainingStatus,
} from "./helpers";
import { REQUIREMENTS } from "./constants";

describe("dateSearchBlob / attachmentBlob / tagBlob", () => {
  it("dateSearchBlob includes the raw ISO date plus short and long formatted versions", () => {
    const blob = dateSearchBlob(["2026-03-05"]);
    expect(blob).toContain("2026-03-05");
    expect(blob).toContain("05 Mar 2026");
    expect(blob).toContain("05 March 2026");
  });

  it("dateSearchBlob skips falsy dates", () => {
    expect(dateSearchBlob([null, "", undefined])).toBe("");
  });

  it("attachmentBlob/tagBlob join names/tags with spaces, and tolerate missing input", () => {
    expect(attachmentBlob([{ name: "photo1.jpg" }, { name: "doc.pdf" }])).toBe("photo1.jpg doc.pdf");
    expect(attachmentBlob(undefined)).toBe("");
    expect(tagBlob(["urgent", "fire"])).toBe("urgent fire");
    expect(tagBlob(undefined)).toBe("");
  });
});

describe("haystack builders (lowercased, searchable text blobs)", () => {
  const rooms = [{ id: "r1", roomNumber: "101" }];
  const contractors = [{ id: "c1", name: "Acme Fire Ltd" }];

  it("recordHaystack pulls in title, location, category label, tags, attachments, and linked room/contractor", () => {
    const record = {
      title: "Fire alarm test", location: "Corridor", people: "Bob", notes: "all clear",
      category: "fire", tags: ["urgent"], attachments: [{ name: "photo.jpg" }],
      lastCompleted: "2026-01-01", roomId: "r1", contractorId: "c1",
    };
    const hay = recordHaystack(record, rooms, contractors);
    expect(hay).toContain("fire alarm test");
    expect(hay).toContain("corridor");
    expect(hay).toContain("fire safety"); // TEMPLATES["fire"].label, lowercased
    expect(hay).toContain("urgent");
    expect(hay).toContain("photo.jpg");
    expect(hay).toContain("room 101");
    expect(hay).toContain("acme fire ltd");
  });

  it("recordHaystack doesn't crash with no rooms/contractors supplied", () => {
    expect(() => recordHaystack({ title: "x", category: "fire" }, undefined, undefined)).not.toThrow();
  });

  it("assetHaystack pulls in code, type label, and linked room", () => {
    const hay = assetHaystack({ assetCode: "FE-001", assetType: "fire_extinguisher", category: "fire", roomId: "r1" }, rooms);
    expect(hay).toContain("fe-001");
    expect(hay).toContain("fire extinguisher");
    expect(hay).toContain("room 101");
  });

  it("roomHaystack pulls in the room number in both raw and 'Room N' form", () => {
    const hay = roomHaystack({ roomNumber: "101", floor: "1st", roomType: "Double" });
    expect(hay).toContain("room 101");
    expect(hay).toContain("101");
    expect(hay).toContain("double");
  });

  it("requirementHaystack pulls in title and category label", () => {
    const hay = requirementHaystack({ title: "Fire Risk Assessment", category: "risk", frequency: "Annually" });
    expect(hay).toContain("fire risk assessment");
    expect(hay).toContain("annually");
  });

  it("contractorHaystack / staffHaystack / certificateHaystack / visitHaystack", () => {
    expect(contractorHaystack({ name: "Acme Fire Ltd", contactName: "Jane" })).toContain("acme fire ltd");
    expect(staffHaystack({ name: "Bob Smith", role: "Housekeeping" })).toContain("housekeeping");
    expect(certificateHaystack({ title: "Gas Safety Cert", certType: "Gas Safety Certificate (CP12)" })).toContain("gas safety cert");
    expect(visitHaystack({ visitType: "EHO", officerName: "Inspector Smith" })).toContain("inspector smith");
  });
});

describe("matchesQuery", () => {
  const record = { title: "Fire alarm test", category: "fire" };

  it("an empty query always matches", () => {
    expect(matchesQuery(record, "", [], [])).toBe(true);
  });

  it("matches case-insensitively against the haystack", () => {
    expect(matchesQuery(record, "ALARM", [], [])).toBe(true);
  });

  it("doesn't match unrelated text", () => {
    expect(matchesQuery(record, "legionella", [], [])).toBe(false);
  });
});

describe("universalSearch", () => {
  it("returns all-empty results for a blank query, without touching any of the lists", () => {
    const result = universalSearch("   ", [{ title: "x" }], [], [], [], [], [], []);
    expect(result).toEqual({
      records: [], assets: [], rooms: [], requirements: [], contractors: [], staff: [], certificates: [], visits: [],
    });
  });

  it("filters each entity list by the query and excludes archived entries", () => {
    const contractor = { id: "c1", name: "Acme Fire Ltd", archived: false };
    const archivedContractor = { id: "c2", name: "Acme Legionella Ltd", archived: true };
    const matchingRecord = { title: "Acme visit note", category: "fire", archived: false };
    const archivedMatchingRecord = { title: "Acme old note", category: "fire", archived: true };
    const nonMatchingRecord = { title: "Unrelated", category: "fire", archived: false };

    const result = universalSearch(
      "acme",
      [matchingRecord, archivedMatchingRecord, nonMatchingRecord],
      [], [], [contractor, archivedContractor], [], [], []
    );

    expect(result.records).toEqual([matchingRecord]);
    expect(result.contractors).toEqual([contractor]);
  });

  it("also searches the built-in REQUIREMENTS reference list", () => {
    const result = universalSearch("fire risk assessment", [], [], [], [], [], [], []);
    expect(result.requirements.some((r) => r.id === "fra")).toBe(true);
    expect(result.requirements).toEqual(REQUIREMENTS.filter((r) => requirementHaystack(r).includes("fire risk assessment")));
  });
});

describe("getMatchKey", () => {
  it("uses 'detail' for expiry-mode records (e.g. training), 'title' otherwise", () => {
    expect(getMatchKey({ category: "training", detail: "First Aid", title: "ignored" })).toBe("First Aid");
    expect(getMatchKey({ category: "fire", title: "Fire alarm test", detail: "ignored" })).toBe("Fire alarm test");
  });
});

describe("matchRequirement", () => {
  it("matchMode 'none' tracks nothing", () => {
    expect(matchRequirement({ matchMode: "none" }, [{ category: "fire" }], [])).toEqual({ records: [], certificates: [] });
  });

  it("matchMode 'preset' matches by category + exact title/detail among matchValues, excluding archived", () => {
    const req = { matchMode: "preset", category: "fire", matchValues: ["Fire alarm test"] };
    const records = [
      { category: "fire", title: "Fire alarm test", archived: false },
      { category: "fire", title: "Something else", archived: false },
      { category: "fire", title: "Fire alarm test", archived: true },
      { category: "legionella", title: "Fire alarm test", archived: false }, // right title, wrong category
    ];
    expect(matchRequirement(req, records, []).records).toEqual([records[0]]);
  });

  it("matchMode 'preset' also matches certificates by certType, excluding archived", () => {
    const req = { matchMode: "preset", category: "equipment", matchValues: ["PAT testing"], certTypes: ["PAT Testing Summary"] };
    const certificates = [
      { certType: "PAT Testing Summary", archived: false },
      { certType: "Other", archived: false },
      { certType: "PAT Testing Summary", archived: true },
    ];
    expect(matchRequirement(req, [], certificates).certificates).toEqual([certificates[0]]);
  });

  it("matchMode 'category' matches by category alone, ignoring matchValues", () => {
    const req = { matchMode: "category", category: "fire" };
    const records = [
      { category: "fire", title: "Anything at all", archived: false },
      { category: "legionella", title: "Anything at all", archived: false },
    ];
    expect(matchRequirement(req, records, []).records).toEqual([records[0]]);
  });
});

describe("requirementStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0)); // fixed "now": 2026-01-15
  });
  afterEach(() => vi.useRealTimers());

  it("'none' is always 'not-tracked'", () => {
    expect(requirementStatus({ matchMode: "none" }, { records: [{ category: "training", expiryDate: "2025-01-01" }], certificates: [] })).toBe("not-tracked");
  });

  it("nothing matched is 'missing', regardless of mode", () => {
    expect(requirementStatus({ matchMode: "preset" }, { records: [], certificates: [] })).toBe("missing");
    expect(requirementStatus({ matchMode: "category" }, { records: [], certificates: [] })).toBe("missing");
  });

  it("'category' mode is just 'tracked' once anything is matched, regardless of status", () => {
    expect(requirementStatus({ matchMode: "category" }, { records: [{ category: "training", expiryDate: "2025-01-01" }], certificates: [] })).toBe("tracked");
  });

  it("'preset' mode reports the worst status among matched records/certificates", () => {
    const matched = {
      records: [{ category: "training", expiryDate: "2026-06-01" }], // compliant
      certificates: [{ expiryDate: "2025-12-01" }], // overdue
    };
    expect(requirementStatus({ matchMode: "preset" }, matched)).toBe("overdue");
  });
});

describe("belongsToRoom", () => {
  it("true for a direct room link", () => {
    expect(belongsToRoom({ roomId: "r1" }, "r1", [])).toBe(true);
  });

  it("true via a linked asset's room", () => {
    expect(belongsToRoom({ roomId: "r2", assetId: "a1" }, "r1", [{ id: "a1", roomId: "r1" }])).toBe(true);
  });

  it("false when neither the record nor its asset is in that room", () => {
    expect(belongsToRoom({ roomId: "r2" }, "r1", [])).toBe(false);
  });
});

describe("findRoomMentions", () => {
  it("finds records whose free-text location mentions the room number, but only if not already linked", () => {
    const room = { roomNumber: "101" };
    const alreadyLinked = { roomId: "x", location: "room 101" };
    const looseMention = { roomId: null, location: "near room 101 corridor" };
    const unrelated = { roomId: null, location: "lobby" };
    expect(findRoomMentions(room, [alreadyLinked, looseMention, unrelated])).toEqual([looseMention]);
  });

  it("returns nothing for a room with a blank number", () => {
    expect(findRoomMentions({ roomNumber: "  " }, [{ roomId: null, location: "room 101" }])).toEqual([]);
  });
});

describe("getEventDate", () => {
  it("reads the mode-appropriate 'what actually happened' date", () => {
    expect(getEventDate({ category: "fire", lastCompleted: "2026-01-01" })).toBe("2026-01-01"); // recurring
    expect(getEventDate({ category: "training", completedDate: "2026-02-01" })).toBe("2026-02-01"); // expiry
    expect(getEventDate({ category: "pest", dateReported: "2026-01-05" })).toBe("2026-01-05"); // incident
    expect(getEventDate({ category: "maintenance", dateRaised: "2026-01-06" })).toBe("2026-01-06"); // maintenance
    expect(getEventDate({ category: "room_inspection", dateLogged: "2026-01-07" })).toBe("2026-01-07"); // log
  });

  it("falls back to updatedAt/createdAt for anything else", () => {
    expect(getEventDate({ category: "totally_unknown", updatedAt: "2026-01-08", createdAt: "2026-01-01" })).toBe("2026-01-08");
    expect(getEventDate({ category: "totally_unknown", createdAt: "2026-01-01" })).toBe("2026-01-01");
  });
});

describe("assetComplianceStatus / staffTrainingStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 0)); // fixed "now": 2026-01-15
  });
  afterEach(() => vi.useRealTimers());

  it("assetComplianceStatus is 'no-checks' with nothing linked, else the worst linked status", () => {
    const asset = { id: "a1" };
    expect(assetComplianceStatus(asset, [])).toBe("no-checks");
    const records = [
      { assetId: "a1", archived: false, category: "training", expiryDate: "2026-06-01" }, // compliant
      { assetId: "a1", archived: false, category: "training", expiryDate: "2025-12-01" }, // overdue
      { assetId: "a2", archived: false, category: "training", expiryDate: "2025-01-01" }, // different asset, ignored
    ];
    expect(assetComplianceStatus(asset, records)).toBe("overdue");
  });

  it("staffTrainingStatus is 'no-checks' with nothing linked, else the worst linked training status", () => {
    const staff = { id: "s1" };
    expect(staffTrainingStatus(staff, [])).toBe("no-checks");
    const records = [{ staffId: "s1", archived: false, category: "training", expiryDate: "2025-12-01" }]; // overdue
    expect(staffTrainingStatus(staff, records)).toBe("overdue");
  });
});
