import { PdfKit, COLORS, MARGIN, CONTENT_WIDTH } from "./pdfKit";
import { FIRE_LOG_ITEMS } from "../constants";
import {
  fmtDate, todayStr, initialsOf,
  fireLogAssembleWeekPage, fireLogWeeksInRange,
} from "../helpers";

/** Centers `text` horizontally within [x, x+width) at the given font/size. */
function centerText(kit, text, x, width, y, opts) {
  const font = opts?.font || kit.font;
  const size = opts?.size || 9;
  const w = font.widthOfTextAtSize(String(text), size);
  kit.textAt(text, x + Math.max(0, (width - w) / 2), y, opts);
}

/** The 7-day, 4-item bordered grid matching the paper Fire Weekly Compliance Sheet, plus the
    Initials row — the one part of the export with no equivalent in registerPdf.js's generic
    table renderer, since it's a fixed shape (label col + 7 day cols) with two-line headers and
    glyph+comment cells, not a flowing list of rows. */
function drawDailyGrid(kit, days) {
  const labelColWidth = 95;
  const dayColWidth = (CONTENT_WIDTH - labelColWidth) / 7;
  const headerHeight = 28;
  const itemRowHeight = 26;
  const initialsRowHeight = 16;
  const items = FIRE_LOG_ITEMS.fire_daily;
  const totalHeight = headerHeight + items.length * itemRowHeight + initialsRowHeight;

  kit.ensureSpace(totalHeight);
  const top = kit.y;
  const left = MARGIN;

  kit.rect(left, top - headerHeight, CONTENT_WIDTH, headerHeight, { fill: COLORS.gridHeaderBg });

  // Day headers: weekday name + date, one per day column.
  days.forEach((d, i) => {
    const x = left + labelColWidth + i * dayColWidth;
    const weekday = new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" });
    centerText(kit, weekday, x, dayColWidth, top - 12, { size: 8, font: kit.bold });
    centerText(kit, fmtDate(d.date), x, dayColWidth, top - 22, { size: 7, color: COLORS.muted });
  });

  // One row per fixed daily checklist item, one cell per day.
  let rowTop = top - headerHeight;
  for (const item of items) {
    kit.textAt(item.label, left + 4, rowTop - 16, { size: 7.5, font: kit.bold });
    days.forEach((d, i) => {
      const x = left + labelColWidth + i * dayColWidth;
      const v = d.source?.checks?.[item.key];
      if (!v) {
        centerText(kit, "N/A", x, dayColWidth, rowTop - 15, { size: 8, color: COLORS.muted });
      } else {
        if (v.done) kit.checkmark(x + dayColWidth / 2 - 4, rowTop - 19, 9);
        else centerText(kit, "—", x, dayColWidth, rowTop - 15, { size: 10, font: kit.bold });
        if (v.comments) centerText(kit, v.comments.slice(0, 24), x, dayColWidth, rowTop - 23, { size: 6, color: COLORS.muted });
      }
    });
    rowTop -= itemRowHeight;
  }

  // Initials row.
  kit.textAt("Initials", left + 4, rowTop - 11, { size: 7.5, font: kit.bold });
  days.forEach((d, i) => {
    const x = left + labelColWidth + i * dayColWidth;
    const initials = d.source?.by ? initialsOf(d.source.by) : "";
    centerText(kit, initials, x, dayColWidth, rowTop - 11, { size: 7.5 });
  });
  rowTop -= initialsRowHeight;

  // Grid lines: one horizontal per row boundary, one vertical per column boundary.
  const rowYs = [top, top - headerHeight];
  for (let i = 1; i <= items.length; i++) rowYs.push(top - headerHeight - i * itemRowHeight);
  rowYs.push(rowTop);
  for (const y of rowYs) {
    kit.page.drawLine({ start: { x: left, y }, end: { x: left + CONTENT_WIDTH, y }, thickness: 1, color: COLORS.navy });
  }
  for (let i = 0; i <= 7; i++) {
    const x = left + labelColWidth + i * dayColWidth;
    kit.page.drawLine({ start: { x, y: top }, end: { x, y: rowTop }, thickness: 1, color: COLORS.navy });
  }
  kit.page.drawLine({ start: { x: left, y: top }, end: { x: left, y: rowTop }, thickness: 1, color: COLORS.navy });

  kit.y = rowTop - 10;
}

function weeklyTableRows(page) {
  return FIRE_LOG_ITEMS.fire_weekly.map((item) => {
    const v = page.weekly?.checks?.[item.key];
    if (!v) return { item: item.label, tick: "", comments: "Not logged this week", by: "" };
    const label = item.hasCallPoint && v.callPoint ? `${item.label} (${v.callPoint})` : item.label;
    return { item: label, tick: v.done ? "✓" : "—", comments: v.comments || "", by: page.weekly.by ? initialsOf(page.weekly.by) : "" };
  });
}

function monthlyTableRows(page) {
  return FIRE_LOG_ITEMS.fire_monthly.map((item) => {
    const v = page.monthly?.checks?.[item.key];
    if (!v) return { item: item.label, tick: "", comments: "Not logged this month", by: "" };
    const status = item.hasNA ? (v.status === "na" ? "N/A" : v.status === "completed" ? "Completed" : "—") : (v.done ? "✓" : "—");
    return { item: item.label, tick: status, comments: v.comments || "", by: page.monthly.by ? initialsOf(page.monthly.by) : "" };
  });
}

function periodicTableRows(page) {
  if (page.periodic.length === 0) return [{ item: "None logged this week", date: "", comments: "", by: "" }];
  return page.periodic.map((r) => {
    const itemDef = FIRE_LOG_ITEMS.fire_periodic.find((i) => i.key === r.periodicItemKey);
    return {
      item: itemDef?.label || r.title,
      date: fmtDate(r.dateLogged),
      comments: r.source?.checks?.[r.periodicItemKey]?.comments || "",
      by: r.source?.by ? initialsOf(r.source.by) : "",
    };
  });
}

const FOUR_COL = [
  { key: "item", label: "Item", width: 0.4 },
  { key: "tick", label: "Tick/Initial", width: 0.14 },
  { key: "comments", label: "Comments", width: 0.32 },
  { key: "by", label: "By", width: 0.14 },
];
const PERIODIC_COL = [
  { key: "item", label: "Item", width: 0.32 },
  { key: "date", label: "Date", width: 0.16 },
  { key: "comments", label: "Comments", width: 0.38 },
  { key: "by", label: "By", width: 0.14 },
];

function drawWeekPage(kit, page, branding) {
  kit.siteLine(`Site: ${branding?.companyName || "—"}`, `W/C Date: ${fmtDate(page.weekMonday)}`);

  kit.sectionBar("Daily Procedures");
  drawDailyGrid(kit, page.days);

  kit.sectionBar("Weekly Procedures");
  kit.table(FOUR_COL, weeklyTableRows(page));

  kit.sectionBar("Monthly Procedures");
  kit.table(FOUR_COL, monthlyTableRows(page));

  kit.sectionBar("Periodic Procedures");
  kit.table(PERIODIC_COL, periodicTableRows(page));

  kit.ensureSpace(40);
  kit.y -= 8;
  const signedNote = page.managerName ? `Manager signature: ${page.managerName}  (digitally signed, exported ${fmtDate(todayStr())})` : "Manager signature: —";
  kit.paragraph(signedNote, { font: kit.bold, size: 10, lineGap: 3 });
  kit.y -= 10;
  kit.paragraph("RETAIN ALL FIRE SAFETY RECORDS", { font: kit.bold, size: 9, color: COLORS.text, lineGap: 0 });
}

/** One real PDF page per Monday-start week overlapping [startDate, endDate] — mirrors
    fireLogExportBodyHTML's "one HTML page-break per week" unit exactly. */
export async function buildFireLogPdf({ records, startDate, endDate, managerName, branding }) {
  const kit = await PdfKit.create();
  const weeks = fireLogWeeksInRange(startDate, endDate);
  const pages = weeks.map((w) => ({ ...fireLogAssembleWeekPage(records, w), managerName }));

  pages.forEach((page, i) => {
    if (i > 0) kit.addPage();
    drawWeekPage(kit, page, branding);
  });

  return kit.bytes();
}
