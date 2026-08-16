import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";
import { STATUS_META } from "../constants";

/**
 * A small layout toolkit built on top of pdf-lib, which only offers low-level
 * primitives (place this text at this x/y) — no flowing text, tables, or page
 * management of its own. This is the shared foundation both registerPdf.js
 * (generic flowing documents) and fireLogPdf.js (the bespoke per-week grid)
 * build on, so letterhead/fonts/colors/pagination behave identically everywhere.
 */

export const PAGE_WIDTH = PageSizes.A4[0];
export const PAGE_HEIGHT = PageSizes.A4[1];
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return rgb(
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255
  );
}

export const COLORS = {
  text: hexToRgb("#1C1F24"),
  muted: hexToRgb("#6E6A61"),
  line: hexToRgb("#E4DFD2"),
  headerBg: hexToRgb("#FAF8F2"),
  navy: hexToRgb("#16263D"),
  gridHeaderBg: hexToRgb("#F1EEE6"),
  white: rgb(1, 1, 1),
};

/** Decodes a `data:<mime>;base64,<data>` string to raw bytes — pdf-lib's embedPng/embedJpg
    want actual image bytes, not a data URL. */
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Wraps `text` to fit within `maxWidth` at `size`, using the font's own metrics
    (not a fixed char-count guess) — returns an array of lines, always at least one. */
export function wrapText(text, font, size, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export class PdfKit {
  /** Use PdfKit.create() instead — font embedding is async. */
  constructor() {
    this.doc = null;
    this.page = null;
    this.y = 0;
    this.font = null;
    this.bold = null;
    this.serif = null;
    this.serifBold = null;
  }

  static async create() {
    const kit = new PdfKit();
    kit.doc = await PDFDocument.create();
    kit.font = await kit.doc.embedFont(StandardFonts.Helvetica);
    kit.bold = await kit.doc.embedFont(StandardFonts.HelveticaBold);
    kit.serif = await kit.doc.embedFont(StandardFonts.TimesRoman);
    kit.serifBold = await kit.doc.embedFont(StandardFonts.TimesRomanBold);
    kit.addPage();
    return kit;
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
    return this.page;
  }

  /** Starts a new page if `height` points don't fit above the bottom margin. */
  ensureSpace(height) {
    if (this.y - height < MARGIN) this.addPage();
  }

  hline(color = COLORS.line, thickness = 1) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y },
      thickness,
      color,
    });
  }

  rect(x, y, width, height, { fill, border, borderWidth = 1 } = {}) {
    this.page.drawRectangle({ x, y, width, height, color: fill, borderColor: border, borderWidth: border ? borderWidth : undefined });
  }

  /** Absolute-position single line of text — for bespoke layouts (fireLogPdf.js's grid). */
  textAt(text, x, y, { size = 9, font = this.font, color = COLORS.text } = {}) {
    this.page.drawText(String(text ?? ""), { x, y, size, font, color });
  }

  /** A flowing, word-wrapped block of text that advances the cursor and paginates. */
  paragraph(text, { x = MARGIN, size = 10, font = this.font, color = COLORS.text, maxWidth = CONTENT_WIDTH - (x - MARGIN), lineGap = 3 } = {}) {
    const lines = wrapText(text, font, size, maxWidth);
    for (const line of lines) {
      this.ensureSpace(size + lineGap);
      this.page.drawText(line, { x, y: this.y - size, size, font, color });
      this.y -= size + lineGap;
    }
  }

  titleBlock(title, subtitle) {
    this.paragraph(title, { font: this.serifBold, size: 20, color: COLORS.text, lineGap: 5 });
    this.y -= 2;
    if (subtitle) this.paragraph(subtitle, { font: this.font, size: 9.5, color: COLORS.muted, lineGap: 3 });
    this.y -= 12;
  }

  heading(text) {
    this.ensureSpace(34);
    this.y -= 10;
    this.hline(COLORS.navy, 1.4);
    this.y -= 14;
    this.paragraph(text, { font: this.bold, size: 12, color: COLORS.text, lineGap: 3 });
    this.y -= 2;
  }

  /** The dark navy section bar used by the Fire Log grid ("Daily Procedures" etc). */
  sectionBar(text) {
    this.ensureSpace(26);
    this.y -= 16;
    this.rect(MARGIN, this.y - 4, CONTENT_WIDTH, 20, { fill: COLORS.navy });
    this.textAt(text, MARGIN + 8, this.y + 1, { size: 10.5, font: this.bold, color: COLORS.white });
    this.y -= 8;
  }

  /** Two pieces of text on one baseline, one left-aligned and one right-aligned — the
      Fire Log "Site: X    W/C Date: Y" line. */
  siteLine(left, right) {
    this.ensureSpace(16);
    this.textAt(left, MARGIN, this.y - 10, { size: 10.5, font: this.bold });
    const w = this.bold.widthOfTextAtSize(right, 10.5);
    this.textAt(right, MARGIN + CONTENT_WIDTH - w, this.y - 10, { size: 10.5, font: this.bold });
    this.y -= 20;
  }

  /** A vector-drawn ✓ — pdf-lib's standard fonts use WinAnsi encoding, which has no glyph
      for U+2713 (throws if you try to draw it as text), so "done" marks are drawn as two
      strokes instead of a character. (x, y) is the mark's bottom-left corner. */
  checkmark(x, y, size = 9, color = COLORS.text) {
    this.page.drawLine({ start: { x, y: y + size * 0.35 }, end: { x: x + size * 0.38, y }, thickness: 1.6, color });
    this.page.drawLine({ start: { x: x + size * 0.38, y }, end: { x: x + size, y: y + size * 0.75 }, thickness: 1.6, color });
  }

  /** Colored outline "chip" (status label), matching the app's existing look — colored
      border + colored text, no fill. */
  chip(label, hexColor, x, baselineY) {
    const color = hexToRgb(hexColor);
    const size = 8;
    const padX = 5, padY = 3;
    const textWidth = this.bold.widthOfTextAtSize(label, size);
    this.rect(x, baselineY - padY, textWidth + padX * 2, size + padY * 2, { border: color, borderWidth: 1 });
    this.textAt(label, x + padX, baselineY, { size, font: this.bold, color });
    return textWidth + padX * 2;
  }

  /**
   * A generic flowing table: header row + body rows, auto-paginating (redrawing the
   * header on each new page), with per-row height computed from wrapped cell text so
   * longer cells (e.g. Audit's "Next step" guidance) don't get clipped.
   * columns: [{ key, label, width /* fraction of content width *\/, chip? /* renders row[key] as a status chip *\/, get? /* (row) => text, overrides row[key] *\/ }]
   */
  table(columns, rows) {
    const widths = columns.map((c) => c.width * CONTENT_WIDTH);
    const cellSize = 9, cellPadX = 6, cellPadY = 6, lineGap = 2, headerHeight = 20;

    const drawHeaderRow = () => {
      this.ensureSpace(headerHeight);
      const top = this.y;
      this.rect(MARGIN, top - headerHeight, CONTENT_WIDTH, headerHeight, { fill: COLORS.headerBg });
      let x = MARGIN;
      columns.forEach((col, i) => {
        this.textAt(col.label.toUpperCase(), x + cellPadX, top - headerHeight + 7, { size: 7.5, font: this.bold, color: COLORS.muted });
        x += widths[i];
      });
      this.y = top - headerHeight;
      this.hline();
    };

    drawHeaderRow();

    if (rows.length === 0) {
      this.paragraph("None.", { size: 9.5, color: COLORS.muted });
      return;
    }

    for (const row of rows) {
      const cellLines = columns.map((col, i) => {
        if (col.chip) return null;
        const text = col.get ? col.get(row) : (row[col.key] ?? "");
        if (text === "✓") return "check"; // drawn as a vector mark, not text — see checkmark()
        return wrapText(text, this.font, cellSize, widths[i] - cellPadX * 2);
      });
      const maxLines = Math.max(1, ...cellLines.map((l) => (Array.isArray(l) ? l.length : 1)));
      const rowHeight = maxLines * (cellSize + lineGap) + cellPadY * 2 - lineGap;

      if (this.y - rowHeight < MARGIN) {
        this.addPage();
        drawHeaderRow();
      }

      const rowTop = this.y;
      let x = MARGIN;
      columns.forEach((col, i) => {
        if (col.chip) {
          const status = row[col.key];
          const meta = STATUS_META[status];
          if (meta) this.chip(meta.label, meta.color, x + cellPadX, rowTop - cellPadY - cellSize + 1);
        } else if (cellLines[i] === "check") {
          this.checkmark(x + cellPadX, rowTop - cellPadY - cellSize + 1, cellSize);
        } else {
          cellLines[i].forEach((line, li) => {
            this.textAt(line, x + cellPadX, rowTop - cellPadY - cellSize - li * (cellSize + lineGap), { size: cellSize });
          });
        }
        x += widths[i];
      });
      this.y = rowTop - rowHeight;
      this.hline();
    }
  }

  /** Logo (if any) + business name/address/registration number — mirrors letterheadHTML. */
  async letterhead(branding) {
    if (!branding) return;
    const { logoDataUrl, companyName, address, registrationNumber } = branding;
    if (!logoDataUrl && !companyName && !address && !registrationNumber) return;

    this.ensureSpace(60);
    const top = this.y;
    let textX = MARGIN;
    let logoBottom = top;

    if (logoDataUrl) {
      try {
        const bytes = dataUrlToBytes(logoDataUrl);
        const isPng = logoDataUrl.startsWith("data:image/png");
        const image = isPng ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
        const maxH = 42, maxW = 150;
        const scale = Math.min(maxH / image.height, maxW / image.width, 1);
        const w = image.width * scale, h = image.height * scale;
        this.page.drawImage(image, { x: MARGIN, y: top - h, width: w, height: h });
        textX = MARGIN + w + 16;
        logoBottom = top - h;
      } catch {
        // Unsupported/corrupt logo image — skip it rather than failing the whole export.
      }
    }

    let ty = top - 11;
    if (companyName) { this.textAt(companyName, textX, ty, { size: 11, font: this.bold }); ty -= 13; }
    if (address) {
      for (const line of address.split("\n")) {
        if (!line.trim()) continue;
        this.textAt(line, textX, ty, { size: 8.5 });
        ty -= 11;
      }
    }
    if (registrationNumber) { this.textAt(registrationNumber, textX, ty, { size: 8.5, color: COLORS.muted }); ty -= 11; }

    this.y = Math.min(ty, logoBottom) - 8;
    this.hline(COLORS.navy, 1.5);
    this.y -= 16;
  }

  /** Rendered once, at the current cursor position — call this last, after everything else,
      to match the original HTML export's "footer at the very end of the document" placement. */
  footer(text) {
    if (!text) return;
    this.ensureSpace(24);
    this.y -= 10;
    this.hline();
    this.y -= 12;
    this.paragraph(text, { size: 8, color: COLORS.muted, lineGap: 2 });
  }

  async bytes() {
    return this.doc.save();
  }
}
