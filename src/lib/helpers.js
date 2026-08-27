import { TEMPLATES, DUE_SOON_WINDOW, RECENT_WINDOW, ASSET_TYPES, REQUIREMENTS, LEGIONELLA_CHECK_ITEMS, VENUE_NAME, PUB_VENUE_NAME, ROOM_LABEL } from "./constants";

/** Every "Room 302"-style string in the app goes through here, so relabeling to "Area" (or
    anything else, via VITE_ROOM_LABEL) only ever needs changing in one place. */
export const roomLabelText = (roomNumber) => `${ROOM_LABEL} ${roomNumber}`;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
/** Formats a Date's own LOCAL calendar date as YYYY-MM-DD — never via toISOString(), which converts
    to UTC first and silently shifts the date by a day for any timezone ahead of UTC (the UK included,
    for most of the year, under BST). That mistake was previously baked into todayStr/addDays/
    weekStartDate — every date arithmetic function in the app — and only became visible as a hard
    failure once something (the Fire Log export) looped on it; everywhere else it was a quiet, very
    real one-day error in due dates and lock boundaries for anyone not in a UTC+0 timezone. */
export function localDateStr(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
export const todayStr = () => localDateStr(new Date());
export const addDays = (dateStr, days) => {
  const dt = new Date(dateStr + "T00:00:00");
  dt.setDate(dt.getDate() + days);
  return localDateStr(dt);
};

/** --- Fire Log period keys, one record per period, found not created --- */
export function weekStartDate(dateStr) {
  const dt = new Date(dateStr + "T00:00:00");
  const day = dt.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diffToMonday);
  return localDateStr(dt);
}
export function fireLogCurrentPeriodKey(category, today = todayStr()) {
  if (category === "fire_daily") return today;
  if (category === "fire_weekly") return weekStartDate(today);
  if (category === "fire_monthly") return today.slice(0, 7);
  return null; // periodic has no shared period key — every entry is its own event
}
export function fireLogPeriodLabel(category, periodKey) {
  if (category === "fire_daily") return fmtDate(periodKey);
  if (category === "fire_weekly") return `Week of ${fmtDate(periodKey)} – ${fmtDate(addDays(periodKey, 6))}`;
  if (category === "fire_monthly") {
    const [y, m] = periodKey.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  return "";
}
/** --- Fire Log export: pure data-assembly, independent of whatever eventually renders the page.
    Today that's an in-app/print view (see FireLogExportView); once this app has real hosting, the
    same functions below feed a real PDF-fill step instead — nothing here needs to change for that. --- */

/** Finds every daily period in [startDate, endDate] with no record at all. Non-empty return value
    is a hard block on exporting daily — an inspector should never see a gap that was never even
    surfaced to whoever generated the report. */
export function fireLogFindMissingDaily(records, startDate, endDate) {
  const missing = [];
  let day = startDate;
  let guard = 0;
  while (day <= endDate && guard < 3660) { // ~10 years, just a sane upper bound against a bad range
    const exists = records.some((r) => r.category === "fire_daily" && r.periodKey === day && !r.archived);
    if (!exists) missing.push(day);
    day = addDays(day, 1);
    guard++;
  }
  return missing;
}
/** Every Monday-start week that overlaps [startDate, endDate] — the real unit the export renders,
    one page per entry in this list. */
export function fireLogWeeksInRange(startDate, endDate) {
  const weeks = [];
  let cursor = weekStartDate(startDate);
  const last = weekStartDate(endDate);
  let guard = 0;
  while (cursor <= last && guard < 600) { // ~11 years of weeks, sane upper bound
    weeks.push(cursor);
    cursor = addDays(cursor, 7);
    guard++;
  }
  return weeks;
}
/** Merges one checklist item's frozen (at-lock) state with its current live state, field by field.
    A field that was genuinely blank at lock time and has a value now was completed late, not
    corrected — the whole point of "late filing still shows as filled" applies here too, so the live
    value wins. A field that already had a value at lock time and has since changed is a real
    correction, which per the export rules agreed on stays internal — the frozen value wins. */
export function fireLogMergeItemForExport(snapItem, liveItem) {
  if (!snapItem) return liveItem || null;
  if (!liveItem) return snapItem;
  const merged = { ...snapItem };
  for (const field of ["comments", "callPoint"]) {
    const snapVal = (snapItem[field] || "").trim();
    const liveVal = (liveItem[field] || "").trim();
    if (!snapVal && liveVal) merged[field] = liveItem[field];
  }
  if (!snapItem.done && liveItem.done) merged.done = true;
  if (!snapItem.status && liveItem.status) merged.status = liveItem.status;
  return merged;
}
/** What a locked record should actually show on export: its frozen snapshot, but with any field that
    was genuinely blank at lock time allowed to show its later-completed value (see
    fireLogMergeItemForExport) — or its live state as a fallback for a locked record the sweep hasn't
    reached yet, which should be rare given the sweep and the synchronous pre-edit capture, but export
    should never crash or omit data over a timing gap in a background sweep. */
export function fireLogExportSource(record) {
  if (!record) return null;
  if (isFireLogLocked(record) && record.lockedSnapshot) {
    const snapChecks = record.lockedSnapshot.checks || {};
    const liveChecks = record.checks || {};
    const mergedChecks = {};
    for (const key of new Set([...Object.keys(snapChecks), ...Object.keys(liveChecks)])) {
      mergedChecks[key] = fireLogMergeItemForExport(snapChecks[key], liveChecks[key]);
    }
    return { checks: mergedChecks, by: record.lockedSnapshot.by };
  }
  return { checks: record.checks, by: fireLogLastEditor(record) };
}
/** Assembles everything one weekly page needs: the 7 daily records for that week, that week's own
    weekly record, the monthly record for whichever month the week falls in (repeated across every
    week of that month, same as the original form), and any periodic events logged within the week. */
export function fireLogAssembleWeekPage(records, weekMonday) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayKey = addDays(weekMonday, i);
    const rec = records.find((r) => r.category === "fire_daily" && r.periodKey === dayKey && !r.archived);
    days.push({ date: dayKey, record: rec || null, source: fireLogExportSource(rec) });
  }
  const weeklyRec = records.find((r) => r.category === "fire_weekly" && r.periodKey === weekMonday && !r.archived);
  const monthKey = weekMonday.slice(0, 7);
  const monthlyRec = records.find((r) => r.category === "fire_monthly" && r.periodKey === monthKey && !r.archived);
  const weekEnd = addDays(weekMonday, 6);
  const periodicEntries = records.filter((r) => r.category === "fire_periodic" && !r.archived && r.dateLogged >= weekMonday && r.dateLogged <= weekEnd);
  return {
    weekMonday, weekEnd, days,
    weekly: weeklyRec ? fireLogExportSource(weeklyRec) : null,
    monthly: monthlyRec ? fireLogExportSource(monthlyRec) : null,
    periodic: periodicEntries.map((r) => ({ ...r, source: fireLogExportSource(r) })),
  };
}

/** The moment a period's export view freezes. Daily/weekly/monthly lock at the natural calendar
    boundary; periodic events (drills, authority visits — no fixed slot) lock 24h after first save. */
export function fireLogLockBoundary(record) {
  if (record.category === "fire_daily") return new Date(record.periodKey + "T23:59:59.999");
  if (record.category === "fire_weekly") return new Date(addDays(record.periodKey, 6) + "T23:59:59.999");
  if (record.category === "fire_monthly") {
    const [y, m] = record.periodKey.split("-").map(Number);
    return new Date(y, m, 0, 23, 59, 59, 999); // last day of that month
  }
  if (record.category === "fire_periodic") {
    const firstSave = record.history?.[0]?.at || record.createdAt;
    return new Date(new Date(firstSave).getTime() + 24 * 60 * 60 * 1000);
  }
  return null;
}
export function isFireLogLocked(record) {
  const boundary = fireLogLockBoundary(record);
  return boundary ? new Date() > boundary : false;
}
export function initialsOf(name) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
/** The last person who actually touched this record, read from its own audit trail —
    works for any entity with a `history` array, not just Fire Log. Used as the "who"
    fallback for record types (Fire Log, Window Restriction checks) that don't have a
    plain `people` field of their own. */
export function lastEditor(record) {
  const hist = record.history || [];
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].by) return hist[i].by;
  }
  return null;
}
/** Who to credit on a locked period's export — the last person who actually touched it before lock,
    not necessarily who first opened it. */
export const fireLogLastEditor = lastEditor;
/** Captures what a locked period's export should show, frozen at (or as close as possible to) lock time.
    Taken lazily — the first time anything looks at this record after its lock boundary has passed — so a
    later correction never changes what was already frozen. This is the one honest gap worth naming: if a
    record is edited after its lock boundary passes but before it's ever viewed again, that edit gets
    captured into the "frozen" snapshot instead of the true at-lock state. In practice a GM views a record
    before editing it, so this is a narrow edge case, not a routine one — but it is a real one. */
export function fireLogEnsureSnapshot(record) {
  if (!isFireLogLocked(record) || record.lockedSnapshot) return record;
  return { ...record, lockedSnapshot: { checks: record.checks, by: fireLogLastEditor(record), at: new Date().toISOString() } };
}
/** One-time repair for weekly Fire Log records saved before the date-arithmetic timezone fix.
    A weekly periodKey should always be the Monday of its week — the app has no path that lets anyone
    set one directly, it's always computed by weekStartDate(). So if a stored periodKey ISN'T a valid
    Monday under the current (correct) weekStartDate, it can only be a leftover from the old bug, never
    a legitimate value — safe to auto-correct, unlike daily/monthly keys, where a mismatch could just as
    easily be a genuine backdated entry and guessing would risk actually breaking a real record. */
export function fireLogRepairWeeklyKeys(records, actorName) {
  const fixed = [];
  const next = records.map((r) => {
    if (r.category !== "fire_weekly" || !r.periodKey || r.archived) return r;
    if (weekStartDate(r.periodKey) === r.periodKey) return r; // already a valid Monday
    const shifted = addDays(r.periodKey, 1);
    if (weekStartDate(shifted) !== shifted) return r; // doesn't resolve to a Monday either — leave it, don't guess further
    fixed.push({ id: r.id, from: r.periodKey, to: shifted });
    const now = new Date().toISOString();
    return {
      ...r, periodKey: shifted,
      history: [...(r.history || []), { at: now, action: "edited", by: actorName || "System", note: `Corrected a date bug from before this was fixed — this week was mis-labelled ${fmtDate(r.periodKey)} instead of the correct ${fmtDate(shifted)}. Nothing about the check itself changed.` }],
    };
  });
  return { next, fixed };
}
/** Daily/monthly period keys can't be safely auto-corrected the way weekly ones can — any date could
    just as easily be a genuine backdated entry. But we CAN detect, with real evidence rather than a
    guess, whether a specific record's periodKey matches exactly what the old buggy todayStr() would
    have produced at its own creation moment, and that this differs from what the correct one would
    give — not "was this near midnight", but "does the stored value match the bug's exact output".
    Flagged for a GM to look at, never silently changed. */
export function fireLogSuspectedTimezoneAffected(record) {
  if (!["fire_daily", "fire_monthly"].includes(record.category)) return false;
  const at = record.history?.[0]?.at;
  if (!at || !record.periodKey) return false;
  const oldWouldHaveComputed = at.slice(0, 10); // exactly what the old (buggy) todayStr() returns for this moment
  const correctlyComputed = localDateStr(new Date(at));
  if (oldWouldHaveComputed === correctlyComputed) return false; // this moment was never in the bug's affected window
  if (record.category === "fire_daily") return record.periodKey === oldWouldHaveComputed;
  return record.periodKey === oldWouldHaveComputed.slice(0, 7); // monthly: compare year-month
}

/** --- Checkpoint checks (Window Restriction, and future checks shaped like it): one record per
    (checkpoint, calendar month) — same golden rule as Fire Log: found not created, locks at month end,
    late filing shows clean, corrections after lock stay internal. Kept as its own small parallel
    system rather than renaming Fire Log's proven functions mid-build — both share the same "last day
    of month" boundary math, just computed independently. */
export function checkpointCheckPeriodKey(today = todayStr()) { return today.slice(0, 7); }
/** Every calendar-month period key ("YYYY-MM") overlapping [startDate, endDate] — the export unit
    for Window Restriction checks, same role fireLogWeeksInRange plays for the Fire Log's weeks. */
export function checkpointCheckPeriodsInRange(startDate, endDate) {
  const periods = [];
  let [y, m] = startDate.slice(0, 7).split("-").map(Number);
  const [endY, endM] = endDate.slice(0, 7).split("-").map(Number);
  let guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard < 600) { // ~50 years, sane upper bound
    periods.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    guard++;
  }
  return periods;
}
export function checkpointCheckPeriodLabel(periodKey) {
  const [y, m] = periodKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
/** A checkpoint only needs a Window Restriction check once it has at least one non-archived
    window_restrictor asset — not just any asset (a checkpoint holding only a kettle, say, has
    nothing to do with windows). Shared by the live checks page, the export page, and
    checkpointCheckFindMissing below, so all three agree on what "eligible" means. */
export function checkpointCheckEligibleCheckpoints(checkpoints, assets) {
  return checkpoints.filter((cp) => !cp.archived && assets.some((a) => a.checkpointId === cp.id && !a.archived && a.assetType === "window_restrictor"));
}
/** Same golden rule as fireLogFindMissingDaily: every (eligible checkpoint, month) combination in
    range with no record at all is a hard block on exporting — an inspector should never see a gap
    that was never even surfaced to whoever generated the report. */
export function checkpointCheckFindMissing(checkpoints, assets, records, startDate, endDate) {
  const eligible = checkpointCheckEligibleCheckpoints(checkpoints, assets);
  const periods = checkpointCheckPeriodsInRange(startDate, endDate);
  const missing = [];
  for (const periodKey of periods) {
    for (const cp of eligible) {
      const exists = records.some((r) => r.category === "window_restriction_check" && r.checkpointId === cp.id && r.periodKey === periodKey && !r.archived);
      if (!exists) missing.push({ checkpointId: cp.id, checkpointName: cp.name, periodKey });
    }
  }
  return missing;
}
export function checkpointCheckLockBoundary(record) {
  const [y, m] = record.periodKey.split("-").map(Number);
  return new Date(y, m, 0, 23, 59, 59, 999); // last day of that month
}
export function isCheckpointCheckLocked(record) { return new Date() > checkpointCheckLockBoundary(record); }
export const checkpointCheckLastEditor = lastEditor;
export function checkpointCheckEnsureSnapshot(record) {
  if (!isCheckpointCheckLocked(record) || record.lockedSnapshot) return record;
  return { ...record, lockedSnapshot: { status: record.status, note: record.note, by: checkpointCheckLastEditor(record), at: new Date().toISOString() } };
}
/** Same completing-vs-correcting rule as Fire Log's export merge: a note that was genuinely blank at
    lock time and has one now was filed late, not corrected, so it's allowed to show. A note that
    already existed at lock time and has since changed is a real correction and stays frozen — with ONE
    sanctioned exception, agreed explicitly: a maintenance RESOLUTION flowing back to the check that
    raised it shows through even across a lock (a fault on the 31st fixed on the 1st was never "a month
    of Not OK"). resolvedVia marks that path — it's only ever set by the resolve flow, which snapshots
    first and writes an attributed history entry, so the full trail stays visible internally. */
export function checkpointCheckExportSource(record) {
  if (!record) return null;
  if (isCheckpointCheckLocked(record) && record.lockedSnapshot && !record.resolvedVia) {
    const snap = record.lockedSnapshot;
    const noteWasBlank = !(snap.note || "").trim();
    return { status: snap.status, note: (noteWasBlank && record.note) ? record.note : snap.note, by: snap.by };
  }
  return { status: record.status, note: record.note, by: checkpointCheckLastEditor(record) };
}

/** Legionella checkpoint checks — quarterly cadence, up to three independently tickable fixture
    items (kettle/shower head/tap) per checkpoint per quarter, one shared record per (checkpoint,
    quarter) holding a `checks: { [itemKey]: {status, note} }` map. Kept as its own parallel system
    rather than generalizing checkpointCheck* (monthly, single status) mid-build — same convention as
    fireLog* and checkpointCheck* already living side by side. */
export function legionellaCheckPeriodKey(today = todayStr()) {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  return `${y}-Q${Math.ceil(m / 3)}`;
}
/** Every quarter key ("YYYY-Qn") overlapping [startDate, endDate] — the export unit for Legionella
    checks, same role checkpointCheckPeriodsInRange plays for Window Restriction's months. */
export function legionellaCheckPeriodsInRange(startDate, endDate) {
  const toQ = (dateStr) => {
    const [y, m] = dateStr.slice(0, 7).split("-").map(Number);
    return { y, q: Math.ceil(m / 3) };
  };
  const periods = [];
  let { y, q } = toQ(startDate);
  const end = toQ(endDate);
  let guard = 0;
  while ((y < end.y || (y === end.y && q <= end.q)) && guard < 200) { // 50 years of quarters, sane upper bound
    periods.push(`${y}-Q${q}`);
    q += 1;
    if (q > 4) { q = 1; y += 1; }
    guard++;
  }
  return periods;
}
const LEGIONELLA_QUARTER_MONTHS = { 1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12] };
export function legionellaCheckPeriodLabel(periodKey) {
  const [yStr, qStr] = periodKey.split("-Q");
  const y = Number(yStr), q = Number(qStr);
  const [startM, endM] = LEGIONELLA_QUARTER_MONTHS[q];
  const startLabel = new Date(y, startM - 1, 1).toLocaleDateString("en-GB", { month: "short" });
  const endLabel = new Date(y, endM - 1, 1).toLocaleDateString("en-GB", { month: "short" });
  return `Q${q} ${y} (${startLabel}–${endLabel})`;
}
export function legionellaCheckLockBoundary(record) {
  const [yStr, qStr] = record.periodKey.split("-Q");
  const y = Number(yStr), q = Number(qStr);
  const [, endM] = LEGIONELLA_QUARTER_MONTHS[q];
  return new Date(y, endM, 0, 23, 59, 59, 999); // last day of the quarter's last month
}
export function isLegionellaCheckLocked(record) { return new Date() > legionellaCheckLockBoundary(record); }
export const legionellaCheckLastEditor = lastEditor;
/** Which of the fixed checklist items actually apply to this checkpoint — only the ones with a
    non-archived asset of that type linked to it (a checkpoint with no taps just doesn't get a tap
    tick-box). */
export function legionellaCheckEligibleItems(checkpoint, assets) {
  return LEGIONELLA_CHECK_ITEMS.filter((item) =>
    assets.some((a) => a.checkpointId === checkpoint.id && a.assetType === item.assetType && !a.archived));
}
export function legionellaCheckEligibleCheckpoints(checkpoints, assets) {
  return checkpoints.filter((cp) => !cp.archived && legionellaCheckEligibleItems(cp, assets).length > 0);
}
/** Same golden rule as checkpointCheckFindMissing/fireLogFindMissingDaily, at item granularity: every
    (eligible checkpoint, quarter, eligible item) combination in range with no logged status is a hard
    block on exporting — an inspector should never see a gap nobody caught. */
export function legionellaCheckFindMissing(checkpoints, assets, records, startDate, endDate) {
  const eligible = legionellaCheckEligibleCheckpoints(checkpoints, assets);
  const periods = legionellaCheckPeriodsInRange(startDate, endDate);
  const missing = [];
  for (const periodKey of periods) {
    for (const cp of eligible) {
      const rec = records.find((r) => r.category === "legionella_check" && r.checkpointId === cp.id && r.periodKey === periodKey && !r.archived);
      for (const item of legionellaCheckEligibleItems(cp, assets)) {
        if (!rec || !rec.checks?.[item.key]?.status) missing.push({ checkpointId: cp.id, checkpointName: cp.name, periodKey, itemKey: item.key, itemLabel: item.label });
      }
    }
  }
  return missing;
}
/** Same late-filed-vs-corrected rule as checkpointCheckExportSource's note merge, applied per item: a
    note genuinely blank at lock time and filled in since was filed late, not corrected, so the live
    value shows; one that already had a value at lock time and has since changed stays frozen. */
export function legionellaCheckMergeItemForExport(snapItem, liveItem) {
  if (!snapItem) return liveItem || null;
  if (!liveItem) return snapItem;
  const noteWasBlank = !(snapItem.note || "").trim();
  return { status: snapItem.status, note: (noteWasBlank && liveItem.note) ? liveItem.note : snapItem.note };
}
/** Same shape as fireLogExportSource's checks-merging, but with the maintenance-resolution exception
    tracked per item via resolvedVia[itemKey] rather than one record-wide flag — a single record can
    have its kettle item resolved via maintenance while its shower head item stays frozen. */
export function legionellaCheckExportSource(record) {
  if (!record) return null;
  if (isLegionellaCheckLocked(record) && record.lockedSnapshot) {
    const snapChecks = record.lockedSnapshot.checks || {};
    const liveChecks = record.checks || {};
    const mergedChecks = {};
    for (const key of new Set([...Object.keys(snapChecks), ...Object.keys(liveChecks)])) {
      mergedChecks[key] = record.resolvedVia?.[key]
        ? (liveChecks[key] || snapChecks[key] || null)
        : legionellaCheckMergeItemForExport(snapChecks[key], liveChecks[key]);
    }
    return { checks: mergedChecks, by: record.lockedSnapshot.by };
  }
  return { checks: record.checks, by: legionellaCheckLastEditor(record) };
}
export function legionellaCheckEnsureSnapshot(record) {
  if (!isLegionellaCheckLocked(record) || record.lockedSnapshot) return record;
  return { ...record, lockedSnapshot: { checks: record.checks, by: legionellaCheckLastEditor(record), at: new Date().toISOString() } };
}

/** Legionella water temperature checks — monthly, one hot + one cold reading per checkpoint per
    month (the "as it was" reading-type/temperatureC pair, just checkpoint-based now instead of
    free-standing). Reuses checkpointCheck*'s month/lock math verbatim (it's generic, not actually
    tied to Window Restriction) rather than forking it a second time. */
export function legionellaTempCheckEligibleCheckpoints(checkpoints, assets) {
  return checkpoints.filter((cp) => !cp.archived &&
    assets.some((a) => a.checkpointId === cp.id && !a.archived && (a.assetType === "tap" || a.assetType === "shower_head")));
}
/** Same golden rule as checkpointCheckFindMissing: every (eligible checkpoint, month) combination in
    range with no record at all is a hard block on exporting. */
export function legionellaTempCheckFindMissing(checkpoints, assets, records, startDate, endDate) {
  const eligible = legionellaTempCheckEligibleCheckpoints(checkpoints, assets);
  const periods = checkpointCheckPeriodsInRange(startDate, endDate);
  const missing = [];
  for (const periodKey of periods) {
    for (const cp of eligible) {
      const exists = records.some((r) => r.category === "legionella_temp_check" && r.checkpointId === cp.id && r.periodKey === periodKey && !r.archived);
      if (!exists) missing.push({ checkpointId: cp.id, checkpointName: cp.name, periodKey });
    }
  }
  return missing;
}
/** Same late-filed-vs-corrected merge as checkpointCheckExportSource's note handling, extended to
    the two numeric readings: a reading genuinely blank at lock time and filled in since was filed
    late, not corrected, so the live value shows; one that already had a value at lock stays frozen. */
export function legionellaTempCheckExportSource(record) {
  if (!record) return null;
  if (isCheckpointCheckLocked(record) && record.lockedSnapshot && !record.resolvedVia) {
    const snap = record.lockedSnapshot;
    const noteWasBlank = !(snap.note || "").trim();
    return {
      status: snap.status,
      note: (noteWasBlank && record.note) ? record.note : snap.note,
      hotTempC: (snap.hotTempC == null && record.hotTempC != null) ? record.hotTempC : snap.hotTempC,
      coldTempC: (snap.coldTempC == null && record.coldTempC != null) ? record.coldTempC : snap.coldTempC,
      by: snap.by,
    };
  }
  return { status: record.status, note: record.note, hotTempC: record.hotTempC, coldTempC: record.coldTempC, by: checkpointCheckLastEditor(record) };
}
export function legionellaTempCheckEnsureSnapshot(record) {
  if (!isCheckpointCheckLocked(record) || record.lockedSnapshot) return record;
  return { ...record, lockedSnapshot: { status: record.status, note: record.note, hotTempC: record.hotTempC, coldTempC: record.coldTempC, by: checkpointCheckLastEditor(record), at: new Date().toISOString() } };
}

/** Whether there's a currently-OPEN (not archived, not Resolved) maintenance record linked to
    `linkedId` — the single shared definition of "does this origin already have an active issue,"
    used both to decide whether logging a new failure should create a fresh maintenance record and
    to warn someone before they log Not OK on something that already has one open. A resolved or
    archived match never counts: closing an issue — however it got closed — always clears the way
    for a genuinely new failure to raise its own, instead of one old link blocking every future
    failure at that same spot forever. */
export function findOpenLinkedIssue(records, linkedId) {
  if (!linkedId) return null;
  return records.find((r) => r.category === "maintenance" && r.linkedRecordId === linkedId && !r.archived && r.status !== "Resolved") || null;
}
export function hasOpenLinkedIssue(records, linkedId) {
  return !!findOpenLinkedIssue(records, linkedId);
}

/** What a maintenance resolution writes back into whichever checkpoint-check record raised it —
    the single source of truth for this, used both by the formal Resolve flow and by "mark OK
    directly from the checklist" auto-resolving an already-open linked issue, so the two paths can
    never drift out of sync. `itemKey` only matters for legionella_check (multi-item per record);
    pass null for the single-item categories. Returns null for an origin category this doesn't know
    how to resolve into (the generic flagged-record case is handled separately by the caller). */
export function resolveOriginRecord(origin, itemKey, maintenanceRecordId, { date, notes, resolver } = {}) {
  const resolutionNote = `Resolved${date ? ` ${fmtDate(date)}` : ""}${resolver ? ` by ${resolver}` : ""}: ${notes || "no details given"}`;
  const historyNote = `Marked OK via maintenance resolution${resolver ? ` (${resolver})` : ""}: ${notes || "no details given"}`;
  if (origin.category === "window_restriction_check") {
    const base = isCheckpointCheckLocked(origin) ? checkpointCheckEnsureSnapshot(origin) : origin;
    return { ...base, status: "ok", note: origin.note ? `${origin.note}\n${resolutionNote}` : resolutionNote, resolvedVia: maintenanceRecordId, _historyNote: historyNote };
  }
  if (origin.category === "legionella_temp_check") {
    const base = isCheckpointCheckLocked(origin) ? legionellaTempCheckEnsureSnapshot(origin) : origin;
    return { ...base, status: "ok", note: origin.note ? `${origin.note}\n${resolutionNote}` : resolutionNote, resolvedVia: maintenanceRecordId, _historyNote: historyNote };
  }
  if (origin.category === "legionella_check") {
    const base = isLegionellaCheckLocked(origin) ? legionellaCheckEnsureSnapshot(origin) : origin;
    const existingNote = base.checks?.[itemKey]?.note || "";
    return {
      ...base,
      checks: { ...(base.checks || {}), [itemKey]: { status: "ok", note: existingNote ? `${existingNote}\n${resolutionNote}` : resolutionNote } },
      resolvedVia: { ...(base.resolvedVia || {}), [itemKey]: maintenanceRecordId },
      _historyNote: historyNote,
    };
  }
  return null;
}

export const daysUntil = (dateStr) => {
  const dt = new Date(dateStr + "T00:00:00");
  const now = new Date(todayStr() + "T00:00:00");
  return Math.round((dt - now) / 86400000);
};
export const daysSince = (dateStr) => -daysUntil(dateStr);
export const formatBytes = (b) => (b < 1024 * 1024 ? `${Math.round(b / 1024)}KB` : `${(b / (1024 * 1024)).toFixed(1)}MB`);
/** tel:/sms: work with a phone number exactly as typed (spaces/dashes are fine); WhatsApp's
    wa.me links specifically need full international format with no leading 0 or + — this app is
    UK-only throughout, so a bare "07911 123456"-style number gets the 44 country code assumed;
    a number already given in international form (leading +) is used as-is. */
export function phoneContactLinks(phone) {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  const international = digits.startsWith("+") ? digits.slice(1) : digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
  return { tel: `tel:${digits}`, sms: `sms:${digits}`, whatsapp: `https://wa.me/${international}` };
}

/* ---------------------------------------------------------
   EXPORT — real PDFs are generated by src/lib/pdf/ (registerPdf.js for the
   flowing register/audit reports, fireLogPdf.js for the Fire Log grid),
   entirely client-side via pdf-lib, sharing/downloading through the same
   navigator.share -> direct-download -> in-app-fallback strategy as before.
--------------------------------------------------------- */

export const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error("read failed"));
  r.readAsDataURL(file);
});
/** Resizes to a max dimension and re-encodes as JPEG — a phone camera photo is often 4-8MB; this gets it well under the storage limit with no visible quality loss at the sizes this app displays. */
export function compressImageDataUrl(dataUrl, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; clearTimeout(timeout); resolve(result); } };
    const timeout = setTimeout(() => finish(dataUrl), 4000); // never let a stuck image load lose the photo
    try {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { finish(dataUrl); return; }
        ctx.drawImage(img, 0, 0, w, h);
        finish(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => finish(dataUrl); // fall back to the original rather than losing the photo
      img.src = dataUrl;
    } catch { finish(dataUrl); }
  });
}
export const generateAssetCode = (assetTypeKey, existingAssets) => {
  const t = ASSET_TYPES.find((a) => a.key === assetTypeKey) || ASSET_TYPES[ASSET_TYPES.length - 1];
  const count = existingAssets.filter((a) => a.assetType === assetTypeKey).length;
  return `${t.prefix}-${String(count + 1).padStart(3, "0")}`;
};
/** The single answer to "what survives an asset replacement" — these describe the *slot* (what it is, where it
    lives, what it can be checked against), not the specific physical unit, so they carry forward unchanged.
    Everything NOT listed here (manufacturer, model, serial, install date) describes the unit itself and is
    deliberately left for the replacement form to fill in fresh. Lives here, next to replaceAsset, on purpose —
    a form component should never independently decide which fields are "continuity" vs "new unit". */
export function copyLifecycleFields(oldAsset) {
  return {
    assetType: oldAsset.assetType,
    category: oldAsset.category,
    eligibleFor: oldAsset.eligibleFor,
    location: oldAsset.location,
    roomId: oldAsset.roomId,
    tags: oldAsset.tags || [],
  };
}

/** Most records get their mode from their category's TEMPLATES entry, but a handful of presets need
    a different mode than their category's default — most of Risk Assessments needs "review" while
    Fire Safety stays "recurring" apart from its one Fire Risk Assessment preset, which also needs
    "review". Rather than restructuring categories (which would mean rewriting `record.category` on
    existing data), this lookup overrides mode per (category, title) pair, sourced directly from
    REQUIREMENTS' own `timingModel` field — computed once at module load, not on every call. Scoped by
    category (not title alone) so a Maintenance issue someone free-typed as "COSHH assessment" stays a
    maintenance issue rather than being swept into review mode by a coincidental title match. */
const MODE_OVERRIDE_LOOKUP = (() => {
  const map = new Map();
  for (const req of REQUIREMENTS) {
    if (!req.timingModel) continue;
    const categories = req.matchCategories || [req.category];
    for (const category of categories) {
      for (const title of req.matchValues) map.set(`${category}::${title}`, req.timingModel);
    }
  }
  return map;
})();
export function getMode(record) {
  const baseMode = TEMPLATES[record.category]?.mode;
  // Same field-selection rule as getMatchKey (title, except expiry-mode records use detail — training
  // records put the staff name in title and the actual preset in detail) — computed directly off the
  // category's base mode, not through getMatchKey itself, since that calls getMode and would recurse.
  const key = baseMode === "expiry" ? record.detail : record.title;
  return MODE_OVERRIDE_LOOKUP.get(`${record.category}::${key}`) || baseMode;
}
/** The one true "what's this record about, in one line" computation — used both by RecordRow's
    in-app secondary text and the Ledger's PDF export, so the two can't silently drift apart. (They
    used to: the export was an independent, incomplete copy missing the linked-room fallback, so a
    Deep Clean or Room Inspection record linked to a room but with no free-text location exported
    with a blank Detail column even though it showed "Room 204" in the app.) */
export function recordDetailText(record, assets, rooms, contractors, staff) {
  const linkedAsset = record.assetId ? assets.find((a) => a.id === record.assetId) : null;
  const linkedRoom = record.roomId ? rooms.find((r) => r.id === record.roomId) : null;
  // An asset's own code (e.g. "FRG205") means nothing to anyone outside this hotel — lead with what
  // the thing actually is, so an export handed to head office or an inspector reads on its own.
  const assetLabel = linkedAsset ? (linkedAsset.name || ASSET_TYPES.find((t) => t.key === linkedAsset.assetType)?.label || linkedAsset.assetCode) : null;
  let text = getMode(record) === "expiry" ? (record.detail || "")
    : linkedAsset ? `${assetLabel} (${linkedAsset.assetCode}) · ${record.location || linkedAsset.location || (linkedRoom ? roomLabelText(linkedRoom.roomNumber) : "")}`
    : record.location ? record.location
    : linkedRoom ? roomLabelText(linkedRoom.roomNumber)
    : (record.actionTaken || "—");
  if (record.category === "legionella" && record.temperatureC != null) text += ` · ${record.temperatureC}°C (${record.readingType})`;
  if (record.category === "maintenance" && record.status === "Awaiting") {
    const awaitingWhom = record.awaitingContractorId ? contractors.find((c) => c.id === record.awaitingContractorId)?.name : record.awaitingStaffId ? staff.find((s) => s.id === record.awaitingStaffId)?.name : null;
    if (awaitingWhom) text += ` · Awaiting ${awaitingWhom}`;
  }
  if (record.category === "maintenance" && record.status === "Resolved") {
    const resolvedByWhom = record.resolvedContractorId ? contractors.find((c) => c.id === record.resolvedContractorId)?.name : record.resolvedStaffId ? staff.find((s) => s.id === record.resolvedStaffId)?.name : null;
    if (resolvedByWhom) text += ` · Resolved by ${resolvedByWhom}`;
  }
  return text;
}
/** Same drift-prevention reasoning as recordDetailText: "who" falls back from a typed people field
    through a linked contractor/staff member to whoever last actually edited the record, and the
    export used to skip straight from "no people field" to blank. */
export function recordWhoText(record, contractors, staff) {
  const linkedContractor = record.contractorId ? contractors.find((c) => c.id === record.contractorId) : null;
  const linkedStaffMember = record.staffId ? staff.find((s) => s.id === record.staffId) : null;
  return record.people || linkedContractor?.name || linkedStaffMember?.name || lastEditor(record) || "—";
}
export function getDueDate(record) {
  const mode = getMode(record);
  if (mode === "expiry") return record.expiryDate;
  if (mode === "recurring") return addDays(record.lastCompleted, record.frequencyDays || 0);
  if (mode === "review") return record.nextReviewTarget || null;
  return null;
}
export function getStatus(record) {
  const mode = getMode(record);
  if (mode === "recurring" || mode === "expiry") {
    const due = getDueDate(record);
    if (!due) return "compliant";
    const d = daysUntil(due);
    if (d < 0) return "overdue";
    if (d <= DUE_SOON_WINDOW) return "due-soon";
    return "compliant";
  }
  if (mode === "review") {
    if (!record.lastReviewed) return "review-due";
    if (!record.nextReviewTarget) return "reviewed"; // no fixed interval was set — no target means no automatic overdue
    const d = daysUntil(record.nextReviewTarget);
    if (d < 0) return "review-overdue";
    if (d <= DUE_SOON_WINDOW) return "review-due";
    return "reviewed";
  }
  if (mode === "log" || mode === "firelog") return "logged";
  if (mode === "checkpoint_check") {
    if (record.category === "legionella_check") {
      const items = Object.values(record.checks || {});
      if (items.some((i) => i?.status === "not_ok")) return "open";
      if (items.length > 0 && items.every((i) => i?.status === "ok")) return "compliant";
      return "in-progress";
    }
    if (record.status === "not_ok") return "open";
    if (record.status === "ok") return "compliant";
    return "in-progress";
  }
  if (record.status === "Resolved") return "resolved";
  if (record.status === "In Progress" || record.status === "Awaiting") return "in-progress";
  return "open";
}
/** Whether the check itself passed, as opposed to getStatus's due-date/lifecycle status — "OK" /
    "Not OK" is only a real, filled-in-by-a-human concept for the two mode families that actually
    carry a pass/fail tick: recurring-mode's "Flag as failed" checkbox, and checkpoint_check mode's
    own OK/Not OK toggle. Every other mode (expiry, review, log, incident/maintenance, firelog) has
    no such tick at all, so this deliberately returns "—" there rather than defaulting to "OK" and
    implying a check that was never actually ticked one way or the other. */
export function checkResult(record) {
  const mode = getMode(record);
  if (mode === "recurring") return record.flagged ? "Not OK" : "OK";
  if (mode === "checkpoint_check") {
    const s = getStatus(record);
    if (s === "open") return "Not OK";
    if (s === "compliant") return "OK";
    return "—";
  }
  return "—";
}
export const isIssueMode = (record) => ["incident", "maintenance"].includes(getMode(record));
export const isScheduleMode = (record) => ["recurring", "expiry"].includes(getMode(record));
export const isLogMode = (record) => getMode(record) === "log";
export const isReviewMode = (record) => getMode(record) === "review";
export const isOverdue = (record) => isScheduleMode(record) && getStatus(record) === "overdue";
export const isDueSoon = (record, window = DUE_SOON_WINDOW) => isScheduleMode(record) && getStatus(record) === "due-soon" && daysUntil(getDueDate(record)) <= window;
export const isDueToday = (record) => isScheduleMode(record) && daysUntil(getDueDate(record)) === 0;
export const isOpenIssue = (record) => isIssueMode(record) && getStatus(record) !== "resolved";
/** A contractor can be linked to a record two ways: contractorId (assigned/engaged when the record
    was first logged) or resolvedContractorId (who actually attended, set later when resolving a
    Maintenance issue — often a different person than whoever was first contacted). Both count as
    a real visit for that contractor. */
export const contractorVisitedRecord = (record, contractorId) => record.contractorId === contractorId || record.resolvedContractorId === contractorId;
/** Same idea as contractorVisitedRecord, for staff: staffId (assigned/logged at creation) or
    resolvedStaffId (who actually attended, set later when resolving) both count as this staff
    member's own record. */
export const staffLinkedToRecord = (record, staffId) => record.staffId === staffId || record.resolvedStaffId === staffId;
export const isRecent = (record, window = RECENT_WINDOW) => {
  const t = record.updatedAt || record.createdAt;
  return t && daysSince(t) <= window && daysSince(t) >= 0;
};
/** Builds a searchable text blob from a date so "March", "2026", "05 Mar 2026" all match. */
export function dateSearchBlob(dates) {
  return dates.filter(Boolean).map((d) => {
    const dt = new Date(d + "T00:00:00");
    if (isNaN(dt)) return "";
    const short = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const long = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    return `${d} ${short} ${long}`;
  }).join(" ");
}
export const attachmentBlob = (attachments) => (attachments || []).map((a) => a.name).join(" ");
export const tagBlob = (tags) => (tags || []).join(" ");

export function recordHaystack(r, rooms, contractors) {
  const dates = [r.lastCompleted, r.completedDate, r.expiryDate, r.dateReported, r.dateRaised, r.dateLogged, r.resolvedDate, r.createdAt, r.updatedAt];
  const room = rooms?.find((rm) => rm.id === r.roomId);
  const contractor = contractors?.find((c) => c.id === r.contractorId);
  // A pulled-in record is visibly tagged with the other venue's name in every list it appears in
  // (see RecordRow's flag-tag) — so searching that name (or a plain "pub"-style word inside it)
  // should surface it here too, even when nothing in the record's own text mentions the venue.
  return [r.title, r.location, r.people, r.notes, r.detail, r.actionTaken, TEMPLATES[r.category]?.label, tagBlob(r.tags), attachmentBlob(r.attachments), dateSearchBlob(dates), room ? roomLabelText(room.roomNumber) : "", contractor?.name, r.__pulled ? PUB_VENUE_NAME : ""]
    .filter(Boolean).join(" ").toLowerCase();
}
export function assetHaystack(a, rooms) {
  const dates = [a.installDate, a.createdAt, a.updatedAt];
  const type = ASSET_TYPES.find((t) => t.key === a.assetType);
  const room = rooms?.find((rm) => rm.id === a.roomId);
  return [a.assetCode, a.name, a.location, a.manufacturer, a.model, a.serialNumber, a.notes, type?.label, TEMPLATES[a.category]?.label, tagBlob(a.tags), attachmentBlob(a.attachments), dateSearchBlob(dates), room ? roomLabelText(room.roomNumber) : ""]
    .filter(Boolean).join(" ").toLowerCase();
}
export function roomHaystack(r) {
  const dates = [r.createdAt, r.updatedAt];
  return [roomLabelText(r.roomNumber), r.roomNumber, r.floor, r.roomType, r.notes, tagBlob(r.tags), attachmentBlob(r.attachments), dateSearchBlob(dates)]
    .filter(Boolean).join(" ").toLowerCase();
}
export function requirementHaystack(req) {
  return [req.title, req.whatToKeep, req.why, req.frequency, req.evidence, req.retention, req.legislation, TEMPLATES[req.category]?.label]
    .filter(Boolean).join(" ").toLowerCase();
}
export const matchesQuery = (record, q, rooms, contractors) => !q || recordHaystack(record, rooms, contractors).includes(q.toLowerCase());
export function universalSearch(query, records, assets, rooms, contractors, staff, certificates, visits) {
  const q = query.trim().toLowerCase();
  if (!q) return { records: [], assets: [], rooms: [], requirements: [], contractors: [], staff: [], certificates: [], visits: [] };
  return {
    records: records.filter((r) => !r.archived && recordHaystack(r, rooms, contractors).includes(q)),
    assets: assets.filter((a) => !a.archived && assetHaystack(a, rooms).includes(q)),
    rooms: rooms.filter((r) => !r.archived && roomHaystack(r).includes(q)),
    requirements: REQUIREMENTS.filter((req) => requirementHaystack(req).includes(q)),
    contractors: contractors.filter((c) => !c.archived && contractorHaystack(c).includes(q)),
    staff: staff.filter((s) => !s.archived && staffHaystack(s).includes(q)),
    certificates: certificates.filter((c) => !c.archived && certificateHaystack(c).includes(q)),
    visits: visits.filter((v) => !v.archived && visitHaystack(v).includes(q)),
  };
}

export function assetComplianceStatus(asset, records) {
  const own = records.filter((r) => r.assetId === asset.id && !r.archived);
  // An open Maintenance/Pest issue against this asset is more urgent than any routine schedule
  // status, and needs to dominate the stamp — otherwise an asset with a live reported problem
  // still reads as "no checks logged" (recurring/expiry-only records were the only thing this
  // function ever looked at) or even "compliant" from an unrelated passing check.
  if (own.some((r) => isOpenIssue(r))) return "open";
  const linked = own.filter((r) => isScheduleMode(r));
  if (linked.length > 0) {
    const rank = { overdue: 0, "due-soon": 1, compliant: 2 };
    return linked.map(getStatus).sort((a, b) => rank[a] - rank[b])[0];
  }
  // Legionella-eligible fixtures (kettle/tap/shower_head) are never assetId-linked — one
  // legionella_check record covers every fixture of that type at a checkpoint together (see
  // LEGIONELLA_CHECK_ITEMS). Fall back to that fixture's own status on the most recent
  // checkpoint check, so the asset's compliance stamp is the same fact everywhere it's shown
  // (Room, Asset register, Search…) instead of permanently reading "No checks logged" just
  // because the check itself lives on the checkpoint, not the asset.
  if (asset.checkpointId && ["kettle", "tap", "shower_head"].includes(asset.assetType)) {
    const checkpointChecks = records.filter((r) => r.category === "legionella_check" && r.checkpointId === asset.checkpointId && !r.archived);
    const mostRecent = checkpointChecks.sort((a, b) => (b.periodKey || "").localeCompare(a.periodKey || ""))[0];
    const itemStatus = mostRecent?.checks?.[asset.assetType]?.status;
    if (itemStatus === "ok") return "compliant";
    if (itemStatus === "not_ok") return "open";
  }
  // No open issue and no schedule-mode record — but a resolved Maintenance/Pest issue is still
  // real history (it was checked and the problem was fixed), not "nothing on file". "Resolved" is
  // the honest label here, not "Compliant" — that word belongs to a routine check that passed,
  // not a reported problem that got fixed after the fact.
  if (own.some((r) => isIssueMode(r))) return "resolved";
  return "no-checks";
}
/** The date something actually happened, for timelines — not when it's next due. */
export function getEventDate(record) {
  const mode = getMode(record);
  if (mode === "recurring") return record.lastCompleted;
  if (mode === "expiry") return record.completedDate;
  if (mode === "review") return record.lastReviewed || record.completedDate;
  if (mode === "incident") return record.dateReported;
  if (mode === "maintenance") return record.dateRaised;
  if (mode === "log") return record.dateLogged;
  return record.updatedAt || record.createdAt;
}
/* ---------------------------------------------------------
   AUDIT TRAIL — every create/edit is logged automatically, and nothing
   is ever truly deleted. "Delete" archives (hidden from lists, kept for
   the record) rather than destroying evidence.
--------------------------------------------------------- */

/** Undefined/missing scope (every record created before this field existed) behaves exactly like
    "venue" — the default — so nothing needs backfilling on old data. */
export function scopeLabel(scope) {
  return scope === "whole_building" ? "Whole building" : `${VENUE_NAME} only`;
}
export function contractorHaystack(c) {
  const dates = [c.createdAt, c.updatedAt];
  return [c.name, c.contactName, c.phone, c.email, c.notes, tagBlob(c.tags), attachmentBlob(c.attachments), dateSearchBlob(dates)]
    .filter(Boolean).join(" ").toLowerCase();
}
export function staffHaystack(s) {
  const dates = [s.startDate, s.createdAt, s.updatedAt];
  return [s.name, s.role, s.email, s.phone, s.notes, tagBlob(s.tags), attachmentBlob(s.attachments), dateSearchBlob(dates)]
    .filter(Boolean).join(" ").toLowerCase();
}
export function staffTrainingStatus(staff, records) {
  const linked = records.filter((r) => r.staffId === staff.id && !r.archived && getMode(r) === "expiry");
  if (linked.length === 0) return "no-checks";
  const rank = { overdue: 0, "due-soon": 1, compliant: 2 };
  return linked.map(getStatus).sort((a, b) => rank[a] - rank[b])[0];
}
export function certificateStatus(cert) {
  if (!cert.expiryDate) return "missing";
  const d = daysUntil(cert.expiryDate);
  if (d < 0) return "overdue";
  if (d <= 30) return "due-soon";
  return "compliant";
}
export function certificateHaystack(cert) {
  const dates = [cert.issueDate, cert.expiryDate, cert.createdAt, cert.updatedAt];
  return [cert.title, cert.certType, cert.issuer, cert.coverage, cert.notes, tagBlob(cert.tags), attachmentBlob(cert.attachments), dateSearchBlob(dates)]
    .filter(Boolean).join(" ").toLowerCase();
}
export function visitStatus(visit) {
  if (visit.status === "Closed") return "resolved";
  if (visit.followUpDate) {
    const d = daysUntil(visit.followUpDate);
    if (d < 0) return "overdue";
    if (d <= 30) return "due-soon";
  }
  return "open";
}
export function visitHaystack(visit) {
  const dates = [visit.visitDate, visit.followUpDate, visit.createdAt, visit.updatedAt];
  return [visit.visitType, visit.officerName, visit.authority, visit.outcome, visit.findings, visit.actionsRequired, visit.notes, tagBlob(visit.tags), attachmentBlob(visit.attachments), dateSearchBlob(dates)]
    .filter(Boolean).join(" ").toLowerCase();
}
export function getMatchKey(record) {
  return getMode(record) === "expiry" ? record.detail : record.title;
}
/** categoryMatches: most requirements track one category, but a few real-world documents get logged
    under more than one (the Fire Risk Assessment, historically split across a "fire" preset and a
    "risk" preset that were never actually recognised as the same thing — see REQUIREMENTS.fra).
    matchCategories, when present, ORs across every category it lists instead of requiring one exact
    match. */
function categoryMatches(req, record) {
  return req.matchCategories ? req.matchCategories.includes(record.category) : record.category === req.category;
}
export function matchRequirement(req, records, certificates) {
  if (req.matchMode === "none") return { records: [], certificates: [] };
  const matchedRecords = req.matchMode === "category"
    ? records.filter((r) => !r.archived && categoryMatches(req, r))
    : records.filter((r) => !r.archived && categoryMatches(req, r) && req.matchValues.includes(getMatchKey(r)));
  const matchedCerts = (req.certTypes && certificates) ? certificates.filter((c) => !c.archived && req.certTypes.includes(c.certType)) : [];
  return { records: matchedRecords, certificates: matchedCerts };
}
export function requirementStatus(req, matched) {
  if (req.matchMode === "none") return "not-tracked";
  const total = matched.records.length + matched.certificates.length;
  if (total === 0) return "missing";
  if (req.matchMode === "category") return "tracked";
  const rank = { "review-overdue": 0, overdue: 0, "review-due": 1, "due-soon": 1, reviewed: 2, compliant: 2 };
  const statuses = [...matched.records.map(getStatus), ...matched.certificates.map(certificateStatus)];
  return statuses.sort((a, b) => (rank[a] ?? 3) - (rank[b] ?? 3))[0];
}
/** A record "belongs to" a room if linked directly, or via an asset installed in that room. */
export function belongsToRoom(record, roomId, assets) {
  if (record.roomId === roomId) return true;
  if (record.assetId) {
    const a = assets.find((x) => x.id === record.assetId);
    if (a && a.roomId === roomId) return true;
  }
  return false;
}
export function findRoomMentions(room, records) {
  const num = room.roomNumber.trim().toLowerCase();
  if (!num) return [];
  return records.filter((r) => !r.roomId && r.location && r.location.toLowerCase().includes(num));
}

export function validateRecord(mode, form) {
  const errors = [];
  if (mode === "expiry" && !form.title.trim()) errors.push("Staff member name is required.");
  if (mode === "incident" && !form.location.trim()) errors.push("Location is required.");
  if (mode === "maintenance" && !form.title.trim()) errors.push("Issue title is required.");
  if (mode === "log" && !form.title.trim()) errors.push("A title is required.");
  if (mode === "recurring" && form.flagged && !form.flagDescription.trim()) errors.push("Please describe what the check found.");
  if (mode === "review" && !form.title.trim()) errors.push("Title is required.");
  if (mode === "review" && !form.lastReviewed) errors.push("Enter the date this was actually last reviewed — not today's date unless that's genuinely when it happened.");
  return errors;
}
export function validateAsset(form) {
  const errors = [];
  if (!form.assetCode.trim()) errors.push("Asset code is required.");
  return errors;
}
export function validateRoom(form) {
  const errors = [];
  if (!form.roomNumber.trim()) errors.push(`${ROOM_LABEL} name is required.`);
  return errors;
}
export function validateContractor(form) {
  const errors = [];
  if (!form.name.trim()) errors.push("Contractor / company name is required.");
  return errors;
}
export function validateStaff(form) {
  const errors = [];
  if (!form.name.trim()) errors.push("Staff member name is required.");
  return errors;
}
export function validateCertificate(form) {
  const errors = [];
  if (!form.title.trim()) errors.push("Certificate title is required.");
  return errors;
}
export function validateVisit(form) {
  const errors = [];
  if (!form.visitType) errors.push("Visit type is required.");
  return errors;
}
export function validateUser(form, existingUsers) {
  const errors = [];
  if (!form.name.trim()) errors.push("Name is required.");
  if (!form.email.trim() || !form.email.includes("@")) errors.push("A valid email is required.");
  const dupe = existingUsers.some((u) => u.id !== form.id && !u.archived && u.email.trim().toLowerCase() === form.email.trim().toLowerCase());
  if (dupe) errors.push("That email is already registered to someone else.");
  return errors;
}

/** Already overdue or an open issue is more urgent than something merely due today, which in turn
    outranks a flagged-but-not-yet-overdue item — ties break on date. */
function actionRank(r) {
  if (isOverdue(r) || (isIssueMode(r) && isOpenIssue(r))) return 0;
  if (isDueToday(r)) return 1;
  return 2;
}
export function todaysActionItems(records) {
  return records
    .filter((r) => (r.flagged && !r.flagResolved) || isOverdue(r) || (isIssueMode(r) && isOpenIssue(r)) || isDueToday(r))
    .sort((a, b) => actionRank(a) - actionRank(b) || (getEventDate(a) || getDueDate(a) || "").localeCompare(getEventDate(b) || getDueDate(b) || ""));
}
export function roomProblemCounts(records, assets, rooms) {
  return rooms
    .map((room) => {
      const scoped = records.filter((r) => belongsToRoom(r, room.id, assets));
      const recurring = findRecurringIssue(scoped);
      return { room, count: recurring ? recurring.count : 0, recurring };
    })
    .filter((x) => x.recurring)
    .sort((a, b) => b.count - a.count);
}
export function assetUnreliability(records, assets) {
  return assets
    .map((asset) => {
      const scoped = records.filter((r) => r.assetId === asset.id);
      const signal = findRepeatFailure(scoped) || findRecurringIssue(scoped);
      return { asset, count: signal ? signal.count : 0, signal };
    })
    .filter((x) => x.signal)
    .sort((a, b) => b.count - a.count);
}
export const normTitle = (t) => (t || "").trim().toLowerCase();
/** The manager shouldn't have to notice a room/asset keeps having the SAME problem, not just "problems" in general. */
export function findRecurringIssue(scopedRecords) {
  const groups = {};
  scopedRecords.filter((r) => (r.category === "maintenance" || r.category === "pest") && !r.archived).forEach((r) => {
    const key = normTitle(r.title);
    if (!key) return;
    (groups[key] = groups[key] || []).push(r);
  });
  const recurring = Object.values(groups).filter((list) => list.length >= 2).sort((a, b) => b.length - a.length);
  return recurring[0] ? { title: recurring[0][0].title, count: recurring[0].length, records: recurring[0] } : null;
}
/** If the same contractor keeps coming back for the same asset, the fix likely isn't sticking. */
export function findRepeatContractor(scopedRecords, assetId, contractors) {
  const counts = {};
  scopedRecords.filter((r) => r.assetId === assetId && r.contractorId && !r.archived).forEach((r) => { counts[r.contractorId] = (counts[r.contractorId] || 0) + 1; });
  const entries = Object.entries(counts).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]);
  if (!entries[0]) return null;
  const contractor = contractors.find((c) => c.id === entries[0][0]);
  return contractor ? { contractor, count: entries[0][1] } : null;
}
/** A single check that keeps failing is a stronger signal than "something failed once." */
export function findRepeatFailure(scopedRecords) {
  const groups = {};
  scopedRecords.filter((r) => r.flagged && !r.archived).forEach((r) => {
    const key = normTitle(r.title);
    if (!key) return;
    (groups[key] = groups[key] || []).push(r);
  });
  const recurring = Object.values(groups).filter((list) => list.length >= 2).sort((a, b) => b.length - a.length);
  return recurring[0] ? { title: recurring[0][0].title, count: recurring[0].length } : null;
}

export function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning.";
  if (h < 17) return "Good afternoon.";
  return "Good evening.";
}
export function briefingToday(today) {
  if (today.length === 0) return "Nothing — you're genuinely clear right now.";
  if (today.length === 1) return `One thing: "${today[0].title}."`;
  return `${today.length} things need attention, starting with "${today[0].title}."`;
}
export function briefingLikely({ dueSoonCount, patternCount, patternExample }) {
  const bits = [];
  if (dueSoonCount > 0) bits.push(`${dueSoonCount} check${dueSoonCount === 1 ? "" : "s"} due within 30 days`);
  if (patternCount > 0) bits.push(patternExample ? `a recurring pattern at ${patternExample}` : `${patternCount} recurring pattern${patternCount === 1 ? "" : "s"} worth watching`);
  if (bits.length === 0) return "Nothing on the horizon — nothing is trending toward trouble.";
  return bits.join(", and ") + ".";
}
export function briefingForgotten(count) {
  if (count === 0) return "Nothing — every tracked requirement has at least one record against it.";
  return `${count} compliance requirement${count === 1 ? " has" : "s have"} never been logged at all — not overdue, just never started.`;
}
export function briefingCanWait(count) {
  if (count === 0) return "Nothing to report yet — log a few checks and this will fill in.";
  return `${count} check${count === 1 ? " is" : "s are"} up to date. Nothing there needs you.`;
}

export function hasPendingCorrection(record) {
  const hist = record.history || [];
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].action === "correction-requested") return true;
    if (hist[i].action === "correction-resolved" || hist[i].action === "correction-dismissed") return false;
  }
  return false;
}

export const formatHistoryValue = (v) => {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") {
    const entries = Object.values(v);
    const looksLikeChecklist = entries.length > 0 && entries.every((e) => e && typeof e === "object" && ("done" in e || "status" in e));
    if (looksLikeChecklist) {
      const done = entries.filter((e) => e.done || e.status === "completed" || e.status === "na").length;
      return `${done}/${entries.length} items`;
    }
    return Object.keys(v).length ? `${Object.keys(v).length} field(s) updated` : "—";
  }
  return String(v);
};
