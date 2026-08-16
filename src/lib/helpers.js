import { TEMPLATES, DUE_SOON_WINDOW, RECENT_WINDOW, STATUS_META, ASSET_TYPES, REQUIREMENTS, AUDIT_PRIORITY, FIRE_LOG_ITEMS } from "./constants";

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
/** Who to credit on a locked period's export — the last person who actually touched it before lock,
    not necessarily who first opened it. Read from the audit trail already recorded on every entry. */
export function fireLogLastEditor(record) {
  const hist = record.history || [];
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].by) return hist[i].by;
  }
  return null;
}
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
export function checkpointCheckPeriodLabel(periodKey) {
  const [y, m] = periodKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
export function checkpointCheckLockBoundary(record) {
  const [y, m] = record.periodKey.split("-").map(Number);
  return new Date(y, m, 0, 23, 59, 59, 999); // last day of that month
}
export function isCheckpointCheckLocked(record) { return new Date() > checkpointCheckLockBoundary(record); }
export function checkpointCheckLastEditor(record) {
  const hist = record.history || [];
  for (let i = hist.length - 1; i >= 0; i--) { if (hist[i].by) return hist[i].by; }
  return null;
}
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

export const daysUntil = (dateStr) => {
  const dt = new Date(dateStr + "T00:00:00");
  const now = new Date(todayStr() + "T00:00:00");
  return Math.round((dt - now) / 86400000);
};
export const daysSince = (dateStr) => -daysUntil(dateStr);
export const formatBytes = (b) => (b < 1024 * 1024 ? `${Math.round(b / 1024)}KB` : `${(b / (1024 * 1024)).toFixed(1)}MB`);

/* ---------------------------------------------------------
   EXPORT — Ctrl+P assumes a keyboard, which doesn't exist on mobile (the
   actual target platform here). This tries three things in order:
   1. Native Share/Save sheet (navigator.share) — the standard mobile
      pattern, works from the phone's own "Save to Files" flow.
   2. A direct file download (works on most desktop browsers).
   3. If both are blocked by the sandbox, fall back to an in-app page that
      just renders the report as content — guaranteed to work, since
      rendering is the one thing that has never failed this session.
--------------------------------------------------------- */
export const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** The letterhead block every export shares: logo (if set), business name/address/registration
    number. Independent of report type — Fire Log's own per-page "Site:" line (see
    fireLogWeekPageHTML) is a separate, smaller thing that mirrors the paper form's per-page
    site field, not a duplicate of this. */
export function letterheadHTML(branding) {
  if (!branding) return "";
  const { logoDataUrl, companyName, address, registrationNumber } = branding;
  if (!logoDataUrl && !companyName && !address && !registrationNumber) return "";
  const logo = logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo" class="letterhead-logo" />` : "";
  const details = (companyName || address || registrationNumber) ? `<div class="letterhead-details">
    ${companyName ? `<div class="letterhead-name">${escapeHtml(companyName)}</div>` : ""}
    ${address ? `<div>${escapeHtml(address).replace(/\n/g, "<br/>")}</div>` : ""}
    ${registrationNumber ? `<div class="muted">${escapeHtml(registrationNumber)}</div>` : ""}
  </div>` : "";
  return `<div class="letterhead">${logo}${details}</div>`;
}
export function reportFooterHTML(branding) {
  if (!branding?.footerText) return "";
  return `<div class="report-footer">${escapeHtml(branding.footerText)}</div>`;
}
export function wrapReportHTML(title, subtitle, bodyHTML, branding) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font-family:Georgia,'Times New Roman',serif;color:#1C1F24;max-width:960px;margin:40px auto;padding:0 24px;}
h1{font-size:24px;margin:0 0 4px;}
.subtitle{color:#6E6A61;font-size:13px;margin-bottom:26px;font-family:Arial,sans-serif;}
h2{font-size:16px;margin:30px 0 10px;padding-top:16px;border-top:2px solid #16263D;font-family:Arial,sans-serif;}
p{font-family:Arial,sans-serif;font-size:13px;line-height:1.6;}
table{width:100%;border-collapse:collapse;margin-bottom:10px;font-family:Arial,sans-serif;font-size:12.5px;}
th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #E4DFD2;vertical-align:top;}
th{background:#FAF8F2;text-transform:uppercase;font-size:10px;letter-spacing:.04em;color:#6E6A61;}
.status{display:inline-block;padding:1px 7px;border-radius:3px;font-size:10.5px;font-weight:600;border:1.4px solid;font-family:Arial,sans-serif;}
.muted{color:#6E6A61;font-size:12px;font-family:Arial,sans-serif;}
.letterhead{display:flex;align-items:center;gap:16px;padding-bottom:16px;margin-bottom:16px;border-bottom:2px solid #16263D;font-family:Arial,sans-serif;}
.letterhead-logo{max-height:64px;max-width:220px;}
.letterhead-details{font-size:12px;line-height:1.5;color:#4A463D;}
.letterhead-name{font-size:16px;font-weight:700;color:#1C1F24;}
.report-footer{margin-top:30px;padding-top:10px;border-top:1px solid #E4DFD2;font-family:Arial,sans-serif;font-size:11px;color:#6E6A61;text-align:center;}
/* Fire Log grid — matches the paper Fire Weekly Compliance Sheet's layout: black section bars,
   bordered grid, Site/W-C header line, big bold N/A placeholders. Monday-first, not the original
   paper form's Sunday-first, since the app's Fire Log has always tracked Monday-start weeks. */
.fl-page{font-family:Arial,sans-serif;}
.fl-site-line{display:flex;justify-content:space-between;font-size:12.5px;font-weight:700;margin-bottom:10px;}
.fl-bar{background:#16263D;color:#fff;font-weight:700;font-size:12.5px;padding:6px 10px;margin-top:22px;}
.fl-grid{width:100%;border-collapse:collapse;table-layout:fixed;}
.fl-grid th,.fl-grid td{border:1px solid #16263D;padding:5px 6px;font-size:11px;text-align:center;vertical-align:middle;}
.fl-grid th{background:#F1EEE6;font-size:10px;text-transform:none;}
.fl-grid td.fl-label{text-align:left;font-weight:600;width:150px;}
.fl-grid td.fl-mark{font-size:13px;font-weight:700;}
.fl-table{width:100%;border-collapse:collapse;margin-top:0;}
.fl-table th,.fl-table td{border:1px solid #16263D;padding:6px 8px;font-size:11px;text-align:left;vertical-align:top;}
.fl-table th{background:#F1EEE6;font-size:10px;text-transform:none;}
.fl-signature{font-size:13px;font-weight:700;margin-top:14px;padding-top:8px;border-top:1px solid #16263D;}
.fl-retain{font-size:10.5px;font-weight:700;text-align:center;margin-top:10px;letter-spacing:.03em;}
</style></head><body>
${letterheadHTML(branding)}
<h1>${escapeHtml(title)}</h1>
<div class="subtitle">${escapeHtml(subtitle)}</div>
${bodyHTML}
${reportFooterHTML(branding)}
</body></html>`;
}
export function statusChipHTML(status) {
  const meta = STATUS_META[status];
  return `<span class="status" style="color:${meta.color};border-color:${meta.color}">${escapeHtml(meta.label)}</span>`;
}
export function recordsTableHTML(records, assets) {
  if (records.length === 0) return '<p class="muted">None.</p>';
  const rows = records.map((r) => {
    const status = getStatus(r);
    const showDue = isScheduleMode(r);
    const dateCol = showDue ? fmtDate(getDueDate(r)) : fmtDate(getEventDate(r));
    const linkedAsset = r.assetId ? assets.find((a) => a.id === r.assetId) : null;
    const secondary = getMode(r) === "expiry" ? r.detail : (linkedAsset ? `${linkedAsset.assetCode} · ${r.location || ""}` : (r.location || ""));
    return `<tr><td>${escapeHtml(TEMPLATES[r.category]?.short)}</td><td>${escapeHtml(r.title)}</td><td>${escapeHtml(secondary)}</td><td>${escapeHtml(r.people || "")}</td><td>${dateCol}</td><td>${statusChipHTML(status)}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Type</th><th>Title</th><th>Detail</th><th>Who</th><th>Date</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}
export function initialsCell(by) { return by ? `<span style="color:#6E6A61;font-size:10.5px;">(${escapeHtml(initialsOf(by))})</span>` : ""; }
/** Renders one item's daily grid cell: a big tick for done, a dash for logged-but-not-done, and a
    muted "N/A" — same placeholder text the original paper form printed in every blank cell — for
    a day that was never logged at all (shouldn't happen by export time; fireLogFindMissingDaily
    blocks export while any daily gap exists, but a locked record with no snapshot for this item
    is still possible, so this stays defensive rather than assuming). */
function dailyCellHTML(daySource, itemKey) {
  if (!daySource) return `<td class="fl-mark muted">N/A</td>`;
  const v = daySource.checks?.[itemKey];
  if (!v) return `<td class="fl-mark muted">N/A</td>`;
  return `<td class="fl-mark">${v.done ? "✓" : "—"}${v.comments ? `<div class="muted" style="font-size:9px;font-weight:400;">${escapeHtml(v.comments)}</div>` : ""}</td>`;
}
/** Matches the paper Fire Weekly Compliance Sheet's grid: one row per daily item, one column per
    day, Monday first — the week this app has always tracked internally (see weekStartDate), unlike
    the Sunday-first paper form it replaces. */
export function fireLogWeekPageHTML(page, branding) {
  const dayHeaders = page.days.map((d) => `<th>${new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" })}<br/><span class="muted" style="font-size:9px;">${fmtDate(d.date)}</span></th>`).join("");
  const dailyRows = FIRE_LOG_ITEMS.fire_daily.map((item) => {
    const cells = page.days.map((d) => dailyCellHTML(d.source, item.key)).join("");
    return `<tr><td class="fl-label">${escapeHtml(item.label)}</td>${cells}</tr>`;
  }).join("");
  const dailyInitials = page.days.map((d) => `<td style="font-size:9px;">${d.source?.by ? escapeHtml(initialsOf(d.source.by)) : ""}</td>`).join("");

  const weeklyRows = FIRE_LOG_ITEMS.fire_weekly.map((item) => {
    const v = page.weekly?.checks?.[item.key];
    if (!v) return `<tr><td>${escapeHtml(item.label)}</td><td colspan="3" class="muted">Not logged this week</td></tr>`;
    return `<tr><td>${escapeHtml(item.label)}${item.hasCallPoint && v.callPoint ? ` <span class="muted">(${escapeHtml(v.callPoint)})</span>` : ""}</td><td>${v.done ? "✓" : "—"}</td><td>${escapeHtml(v.comments || "")}</td><td>${initialsCell(page.weekly.by)}</td></tr>`;
  }).join("");

  const monthlyRows = FIRE_LOG_ITEMS.fire_monthly.map((item) => {
    const v = page.monthly?.checks?.[item.key];
    if (!v) return `<tr><td>${escapeHtml(item.label)}</td><td colspan="3" class="muted">Not logged this month</td></tr>`;
    const status = item.hasNA ? (v.status === "na" ? "N/A" : v.status === "completed" ? "Completed" : "—") : (v.done ? "✓" : "—");
    return `<tr><td>${escapeHtml(item.label)}</td><td>${status}</td><td>${escapeHtml(v.comments || "")}</td><td>${initialsCell(page.monthly.by)}</td></tr>`;
  }).join("");

  const periodicRows = page.periodic.length === 0
    ? `<tr><td colspan="4" class="muted">None logged this week</td></tr>`
    : page.periodic.map((r) => {
        const itemDef = FIRE_LOG_ITEMS.fire_periodic.find((i) => i.key === r.periodicItemKey);
        return `<tr><td>${escapeHtml(itemDef?.label || r.title)}</td><td>${fmtDate(r.dateLogged)}</td><td>${escapeHtml(r.source?.checks?.[r.periodicItemKey]?.comments || "")}</td><td>${initialsCell(r.source?.by)}</td></tr>`;
      }).join("");

  return `
    <div class="fl-page">
      <div class="fl-site-line"><span>Site: ${escapeHtml(branding?.companyName || "—")}</span><span>W/C Date: ${fmtDate(page.weekMonday)}</span></div>

      <div class="fl-bar">Daily Procedures</div>
      <table class="fl-grid">
        <tr><th class="fl-label">&nbsp;</th>${dayHeaders}</tr>
        ${dailyRows}
        <tr><td class="fl-label" style="font-size:9px;">Initials</td>${dailyInitials}</tr>
      </table>

      <div class="fl-bar">Weekly Procedures</div>
      <table class="fl-table"><tr><th>Item</th><th>Tick/Initial</th><th>Comments</th><th>By</th></tr>${weeklyRows}</table>

      <div class="fl-bar">Monthly Procedures</div>
      <table class="fl-table"><tr><th>Item</th><th>Tick/Initial</th><th>Comments</th><th>By</th></tr>${monthlyRows}</table>

      <div class="fl-bar">Periodic Procedures</div>
      <table class="fl-table"><tr><th>Item</th><th>Date</th><th>Comments</th><th>By</th></tr>${periodicRows}</table>

      <p class="fl-signature">Manager signature: ${escapeHtml(page.managerName || "—")}${page.managerName ? ` <span class="muted" style="font-weight:400;">(digitally signed, exported ${fmtDate(todayStr())})</span>` : ""}</p>
      <p class="fl-retain">RETAIN ALL FIRE SAFETY RECORDS</p>
    </div>
  `;
}
export function fireLogExportBodyHTML(records, startDate, endDate, managerName, branding) {
  const weeks = fireLogWeeksInRange(startDate, endDate);
  const pages = weeks.map((w) => ({ ...fireLogAssembleWeekPage(records, w), managerName }));
  return pages.map((page) => fireLogWeekPageHTML(page, branding)).join('<div style="page-break-after:always;"></div>');
}

export async function exportReport(filename, title, subtitle, bodyHTML, branding) {
  const html = wrapReportHTML(title, subtitle, bodyHTML, branding);
  try {
    if (navigator.share && navigator.canShare) {
      const file = new File([html], filename, { type: "text/html" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return { status: "shared" };
      }
    }
  } catch (e) {
    if (e && e.name === "AbortError") return { status: "cancelled" };
    // fall through to next method
  }
  try {
    const a = document.createElement("a");
    a.href = `data:text/html;charset=utf-8;base64,${btoa(unescape(encodeURIComponent(html)))}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return { status: "downloaded" };
  } catch (e) {
    return { status: "fallback", bodyHTML, title, subtitle };
  }
}

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

export function getMode(record) { return TEMPLATES[record.category]?.mode; }
export function getDueDate(record) {
  const mode = getMode(record);
  if (mode === "expiry") return record.expiryDate;
  if (mode === "recurring") return addDays(record.lastCompleted, record.frequencyDays || 0);
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
  if (mode === "log") return "logged";
  if (record.status === "Resolved") return "resolved";
  if (record.status === "In Progress" || record.status === "Awaiting") return "in-progress";
  return "open";
}
export const isIssueMode = (record) => ["incident", "maintenance"].includes(getMode(record));
export const isScheduleMode = (record) => ["recurring", "expiry"].includes(getMode(record));
export const isLogMode = (record) => getMode(record) === "log";
export const isOverdue = (record) => isScheduleMode(record) && getStatus(record) === "overdue";
export const isDueSoon = (record, window = DUE_SOON_WINDOW) => isScheduleMode(record) && getStatus(record) === "due-soon" && daysUntil(getDueDate(record)) <= window;
export const isDueToday = (record) => isScheduleMode(record) && daysUntil(getDueDate(record)) === 0;
export const isOpenIssue = (record) => isIssueMode(record) && getStatus(record) !== "resolved";
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
  return [r.title, r.location, r.people, r.notes, r.detail, r.actionTaken, TEMPLATES[r.category]?.label, tagBlob(r.tags), attachmentBlob(r.attachments), dateSearchBlob(dates), room ? `Room ${room.roomNumber}` : "", contractor?.name]
    .filter(Boolean).join(" ").toLowerCase();
}
export function assetHaystack(a, rooms) {
  const dates = [a.installDate, a.createdAt, a.updatedAt];
  const type = ASSET_TYPES.find((t) => t.key === a.assetType);
  const room = rooms?.find((rm) => rm.id === a.roomId);
  return [a.assetCode, a.name, a.location, a.manufacturer, a.model, a.serialNumber, a.notes, type?.label, TEMPLATES[a.category]?.label, tagBlob(a.tags), attachmentBlob(a.attachments), dateSearchBlob(dates), room ? `Room ${room.roomNumber}` : ""]
    .filter(Boolean).join(" ").toLowerCase();
}
export function roomHaystack(r) {
  const dates = [r.createdAt, r.updatedAt];
  return [`Room ${r.roomNumber}`, r.roomNumber, r.floor, r.roomType, r.notes, tagBlob(r.tags), attachmentBlob(r.attachments), dateSearchBlob(dates)]
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
  const linked = records.filter((r) => r.assetId === asset.id && !r.archived && isScheduleMode(r));
  if (linked.length === 0) return "no-checks";
  const rank = { overdue: 0, "due-soon": 1, compliant: 2 };
  return linked.map(getStatus).sort((a, b) => rank[a] - rank[b])[0];
}
/** The date something actually happened, for timelines — not when it's next due. */
export function getEventDate(record) {
  const mode = getMode(record);
  if (mode === "recurring") return record.lastCompleted;
  if (mode === "expiry") return record.completedDate;
  if (mode === "incident") return record.dateReported;
  if (mode === "maintenance") return record.dateRaised;
  if (mode === "log") return record.dateLogged;
  return record.updatedAt || record.createdAt;
}
export function insuranceStatus(contractor) {
  if (!contractor.insuranceExpiry) return "missing";
  const d = daysUntil(contractor.insuranceExpiry);
  if (d < 0) return "overdue";
  if (d <= 30) return "due-soon";
  return "compliant";
}

/* ---------------------------------------------------------
   AUDIT TRAIL — every create/edit is logged automatically, and nothing
   is ever truly deleted. "Delete" archives (hidden from lists, kept for
   the record) rather than destroying evidence.
--------------------------------------------------------- */

export function contractorHaystack(c) {
  const dates = [c.insuranceExpiry, c.createdAt, c.updatedAt];
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
export function matchRequirement(req, records, certificates) {
  if (req.matchMode === "none") return { records: [], certificates: [] };
  const matchedRecords = req.matchMode === "category"
    ? records.filter((r) => !r.archived && r.category === req.category)
    : records.filter((r) => !r.archived && r.category === req.category && req.matchValues.includes(getMatchKey(r)));
  const matchedCerts = (req.certTypes && certificates) ? certificates.filter((c) => !c.archived && req.certTypes.includes(c.certType)) : [];
  return { records: matchedRecords, certificates: matchedCerts };
}
export function requirementStatus(req, matched) {
  if (req.matchMode === "none") return "not-tracked";
  const total = matched.records.length + matched.certificates.length;
  if (total === 0) return "missing";
  if (req.matchMode === "category") return "tracked";
  const rank = { overdue: 0, "due-soon": 1, compliant: 2 };
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
  return errors;
}
export function validateAsset(form) {
  const errors = [];
  if (!form.assetCode.trim()) errors.push("Asset code is required.");
  return errors;
}
export function validateRoom(form) {
  const errors = [];
  if (!form.roomNumber.trim()) errors.push("Room number is required.");
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
