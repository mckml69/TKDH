/**
 * Dicky, the hotel kitten, occasionally approves of a daily fire check being finished.
 * Purely cosmetic: nothing here touches a record, and a failure here can never stop a check from saving.
 *
 * The daily check is done in two sittings (opening and closing). To keep him from becoming annoying:
 *  - only a freshly finished sitting is a chance for him to appear, and then only about one time in four;
 *  - after he has appeared he stays away for about a day (the cooldown), so he can never show up for the morning
 *    and the evening of the same day, and never twice in a row. A morning visit followed by a visit the next evening
 *    is exactly the sort of thing it should look like.
 * The time of his last visit is remembered on this device only (localStorage). If that isn't available, the random
 * chance still applies and he just can't remember when he last came.
 */

/** What Dicky says, and how long his card stays up, for each kind of visit. */
export const DICKY_VISITS = {
  approves: { text: "Dicky approves", ms: 3800 },
  pest: { text: "Dicky would like to request more information on this matter", ms: 6500 },
};

export const DICKY_CHANCE = 0.25;
export const DICKY_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20 hours: morning -> next morning is allowed, same day never
const STORAGE_KEY = "compliance-ledger:dicky-last-visit";

export function shouldDickyApprove(random = Math.random, chance = DICKY_CHANCE) {
  return random() < chance;
}

/** True once enough time has passed since his last visit (or he has never visited). */
export function dickyCooldownOver(lastVisitMs, nowMs, cooldownMs = DICKY_COOLDOWN_MS) {
  if (!Number.isFinite(lastVisitMs)) return true;
  const elapsed = nowMs - lastVisitMs;
  // A negative gap means the device clock went backwards; don't let that lock him out for days.
  return elapsed >= cooldownMs || elapsed < 0;
}

function defaultStorage() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
function readLast(storage) {
  try { const raw = storage?.getItem(STORAGE_KEY); return raw == null ? NaN : Number(raw); } catch { return NaN; }
}

/**
 * Decides, and if he is going to appear, remembers it. Call once when a sitting has just been finished.
 * The dice are only rolled when the cooldown is over, so a refused roll never uses up his next chance.
 */
export function maybeDickyVisit({ random = Math.random, now = Date.now(), storage = defaultStorage(), chance = DICKY_CHANCE, cooldownMs = DICKY_COOLDOWN_MS } = {}) {
  if (!dickyCooldownOver(readLast(storage), now, cooldownMs)) return false;
  if (!shouldDickyApprove(random, chance)) return false;
  try { storage?.setItem(STORAGE_KEY, String(now)); } catch { /* remembering is optional */ }
  return true;
}

/**
 * True when a pest record is being logged for the first time (not edited, not resolved later). Pest records are rare,
 * so unlike the daily fire check this is not random and has no cooldown: Dicky takes an interest every time, whatever
 * the pest, mice and other rodents included.
 */
export function isNewPestRecord(existingRecord, form) {
  return !existingRecord && form?.category === "pest";
}

/**
 * True when this save is the moment the opening pair, or the closing pair, of today's daily fire check first becomes
 * fully done. Mirrors the rule App.jsx already uses to stamp "opened by" / "closed by": it only happens once per
 * sitting, so editing a comment on a finished check later never counts. Checks backfilled for an earlier day don't
 * count either, because Dicky only approves of what is being done today.
 *
 * base: the daily record before this save (or a new one); checks: the checks being saved; periodKey: yyyy-mm-dd.
 */
export function dailyFireSittingJustCompleted(base, checks, periodKey, today) {
  if (periodKey !== today) return false;
  const bothDone = (a, b) => !!(checks?.[a]?.done && checks?.[b]?.done);
  const opening = !base?.openedBy && bothDone("exitDoorsOpen", "openingProcedure");
  const closing = !base?.closedBy && bothDone("exitDoorsClosed", "closingProcedure");
  return opening || closing;
}
