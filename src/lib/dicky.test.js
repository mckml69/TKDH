import { describe, it, expect } from "vitest";
import { DICKY_CHANCE, dailyFireSittingJustCompleted, shouldDickyApprove } from "./dicky";

const done = (...keys) => Object.fromEntries(keys.map((k) => [k, { done: true }]));
const TODAY = "2026-10-14";

describe("shouldDickyApprove", () => {
  it("approves on a low roll and not on a high one, around the chance threshold", () => {
    expect(shouldDickyApprove(() => 0)).toBe(true);
    expect(shouldDickyApprove(() => DICKY_CHANCE - 0.0001)).toBe(true);
    expect(shouldDickyApprove(() => DICKY_CHANCE)).toBe(false);
    expect(shouldDickyApprove(() => 0.99)).toBe(false);
  });
  it("is occasional, not constant: about one in four over many rolls", () => {
    let seed = 12345;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    let yes = 0;
    for (let i = 0; i < 4000; i++) if (shouldDickyApprove(random)) yes++;
    expect(yes / 4000).toBeGreaterThan(0.2);
    expect(yes / 4000).toBeLessThan(0.3);
  });
  it("never approves with a chance of zero, always with a chance of one", () => {
    expect(shouldDickyApprove(() => 0, 0)).toBe(false);
    expect(shouldDickyApprove(() => 0.999, 1)).toBe(true);
  });
});

describe("dailyFireSittingJustCompleted: each of the two daily sittings counts on its own", () => {
  it("fires when the opening pair first becomes done today, without needing the closing pair", () => {
    expect(dailyFireSittingJustCompleted({}, done("exitDoorsOpen", "openingProcedure"), TODAY, TODAY)).toBe(true);
  });
  it("fires when the closing pair first becomes done today", () => {
    expect(dailyFireSittingJustCompleted({ openedBy: "Sam" }, done("exitDoorsOpen", "openingProcedure", "exitDoorsClosed", "closingProcedure"), TODAY, TODAY)).toBe(true);
  });
  it("does not fire for a half-finished sitting", () => {
    expect(dailyFireSittingJustCompleted({}, done("exitDoorsOpen"), TODAY, TODAY)).toBe(false);
    expect(dailyFireSittingJustCompleted({}, done("exitDoorsClosed"), TODAY, TODAY)).toBe(false);
    expect(dailyFireSittingJustCompleted({}, {}, TODAY, TODAY)).toBe(false);
  });
  it("does not fire again when a finished sitting is only edited later", () => {
    const base = { openedBy: "Sam", closedBy: "Lee" };
    expect(dailyFireSittingJustCompleted(base, done("exitDoorsOpen", "openingProcedure", "exitDoorsClosed", "closingProcedure"), TODAY, TODAY)).toBe(false);
  });
  it("does not fire when filling in an earlier day", () => {
    expect(dailyFireSittingJustCompleted({}, done("exitDoorsOpen", "openingProcedure"), "2026-10-10", TODAY)).toBe(false);
  });
  it("copes with missing data instead of throwing", () => {
    expect(dailyFireSittingJustCompleted(undefined, undefined, TODAY, TODAY)).toBe(false);
    expect(dailyFireSittingJustCompleted(null, null, TODAY, TODAY)).toBe(false);
  });
});

import { DICKY_COOLDOWN_MS, dickyCooldownOver, maybeDickyVisit } from "./dicky";

const HOUR = 60 * 60 * 1000;
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), _m: m }; };
const T0 = new Date("2026-10-14T09:00:00Z").getTime();

describe("the cooldown keeps him from being annoying", () => {
  it("is over with no previous visit, or once the cooldown has passed, and not before", () => {
    expect(dickyCooldownOver(NaN, T0)).toBe(true);
    expect(dickyCooldownOver(T0, T0 + DICKY_COOLDOWN_MS - 1)).toBe(false);
    expect(dickyCooldownOver(T0, T0 + DICKY_COOLDOWN_MS)).toBe(true);
  });
  it("doesn't lock him out if the clock has gone backwards", () => {
    expect(dickyCooldownOver(T0, T0 - 5 * HOUR)).toBe(true);
  });
  it("after a morning visit he stays away that evening, but next-day sittings are fair game", () => {
    const storage = memory();
    expect(maybeDickyVisit({ random: () => 0, now: T0, storage })).toBe(true);                // this morning: appears
    expect(maybeDickyVisit({ random: () => 0, now: T0 + 9 * HOUR, storage })).toBe(false);     // this evening: even a perfect roll is refused
    expect(maybeDickyVisit({ random: () => 0, now: T0 + 14 * HOUR, storage })).toBe(false);    // tomorrow's early morning: still too soon
    expect(maybeDickyVisit({ random: () => 0, now: T0 + 24 * HOUR, storage })).toBe(true);     // the same time tomorrow: allowed again
  });
  it("a roll that doesn't land doesn't start a cooldown, so the next sitting still has its chance", () => {
    const storage = memory();
    expect(maybeDickyVisit({ random: () => 0.9, now: T0, storage })).toBe(false);
    expect(storage._m.size).toBe(0);
    expect(maybeDickyVisit({ random: () => 0, now: T0 + 9 * HOUR, storage })).toBe(true);
  });
  it("only rolls the dice once the cooldown is over", () => {
    const storage = memory();
    maybeDickyVisit({ random: () => 0, now: T0, storage });
    let rolls = 0;
    maybeDickyVisit({ random: () => { rolls++; return 0; }, now: T0 + HOUR, storage });
    expect(rolls).toBe(0);
  });
  it("over a fortnight of two sittings a day he turns up every few days, never twice within a day", () => {
    let seed = 99;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const storage = memory();
    const visits = [];
    for (let day = 0; day < 14; day++) for (const hour of [8, 21]) {
      const now = T0 + day * 24 * HOUR + (hour - 9) * HOUR;
      if (maybeDickyVisit({ random, now, storage })) visits.push(now);
    }
    for (let i = 1; i < visits.length; i++) expect(visits[i] - visits[i - 1]).toBeGreaterThanOrEqual(DICKY_COOLDOWN_MS);
    expect(visits.length).toBeGreaterThan(0);
    expect(visits.length).toBeLessThan(9); // 28 sittings in the fortnight: well short of "every time"
  });
  it("still works when storage is missing or throws", () => {
    expect(maybeDickyVisit({ random: () => 0, now: T0, storage: null })).toBe(true);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(maybeDickyVisit({ random: () => 0, now: T0, storage: broken })).toBe(true);
  });
});

import { DICKY_VISITS, isNewMiceRecord } from "./dicky";

describe("Dicky and mice", () => {
  it("takes an interest in every newly logged mice or rodent record", () => {
    for (const title of ["Mice / rodents", "mice", "Mouse in the store", "Rats", "rodent droppings"]) {
      expect(isNewMiceRecord(null, { category: "pest", title })).toBe(true);
    }
  });
  it("leaves every other pest alone: mice are his area of expertise", () => {
    for (const title of ["Bed bugs", "Cockroaches", "Ants", "Wasps / hornets", "Other", "", undefined]) {
      expect(isNewMiceRecord(null, { category: "pest", title })).toBe(false);
    }
    expect(isNewMiceRecord(null, { category: "pest", title: "Rattan furniture" })).toBe(false); // a word that merely contains "rat"
  });
  it("does not when a mice record is edited or resolved later, or for any other kind of record", () => {
    expect(isNewMiceRecord({ id: "x" }, { category: "pest", title: "Mice / rodents" })).toBe(false);
    expect(isNewMiceRecord(null, { category: "maintenance", title: "Mice / rodents" })).toBe(false);
    expect(isNewMiceRecord(null, { category: "fire_daily", title: "mice" })).toBe(false);
    expect(isNewMiceRecord(null, null)).toBe(false);
  });
  it("has the agreed wording, and keeps the longer message up a little longer", () => {
    expect(DICKY_VISITS.approves.text).toBe("Dicky approves");
    expect(DICKY_VISITS.pest.text).toBe("Dicky would like to request more information on this matter");
    expect(DICKY_VISITS.pest.ms).toBeGreaterThan(DICKY_VISITS.approves.ms);
  });
});
