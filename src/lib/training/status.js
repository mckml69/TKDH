/**
 * Pure helpers for showing training status. Dates from the server are full ISO timestamps.
 * The status keys ("tr-...") are entries in STATUS_META (constants.js) so the same chip
 * renders in the app and in PDF reports.
 */

export const DUE_SOON_DAYS = 30;

/**
 * result: the latest pass for a module if there is one, else the latest attempt, or null/undefined.
 * { passed, validUntil } is all that is read from it.
 */
export function moduleStatus(result, now = new Date(), kind = "assessment") {
  const base = assessedStatus(result, now);
  if (kind !== "info") return base;
  // An information-only module (no quiz) is simply read or not read; an expired or due-soon re-read keeps its date wording.
  return base === "tr-passed" ? "tr-read" : base === "tr-not-started" ? "tr-unread" : base;
}
function assessedStatus(result, now) {
  if (!result) return "tr-not-started";
  if (!result.passed) return "tr-failed";
  if (!result.validUntil) return "tr-passed";
  const until = new Date(result.validUntil).getTime();
  if (until < now.getTime()) return "tr-expired";
  if (until - now.getTime() <= DUE_SOON_DAYS * 24 * 60 * 60 * 1000) return "tr-due-soon";
  return "tr-passed";
}

/** The same, from one row of GET /api/training/records (a person + module summary). */
export function recordStatus(rec, now = new Date(), kind = rec?.kind || "assessment") {
  if (!rec) return moduleStatus(null, now, kind);
  if (rec.lastPass) return moduleStatus({ passed: true, validUntil: rec.lastPass.validUntil }, now, kind);
  return rec.attempts > 0 ? "tr-failed" : moduleStatus(null, now, kind);
}

/** Why a module is on someone's reminder list, in a few words. item: one entry from GET /api/training/reminders. */
export function reminderReason(item) {
  const info = item.kind === "info";
  if (item.reason === "expired") return info ? "needs reading again" : "has expired, take it again";
  if (item.reason === "not-passed") return "last attempt not passed";
  return info ? "not read yet" : "not started";
}

/** Short human text for how often a module must be repeated. */
export function refreshLabel(months) {
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? "every 12 months" : `every ${years} years`;
  }
  return `every ${months} months`;
}

/** yyyy-mm-dd from a server ISO timestamp (UTC date, matching how validity is calculated). */
export function isoDay(iso) {
  return iso ? String(iso).slice(0, 10) : "";
}

/** Fisher-Yates, returning a new array. `random` is injectable for tests. */
export function shuffled(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A file-name-safe version of a name or title. */
export function slug(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}
