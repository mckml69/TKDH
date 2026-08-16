import { PdfKit } from "./pdfKit";

/**
 * The generic "flowing document" PDF: letterhead, title/subtitle, a sequence of
 * heading/paragraph/table blocks, footer. Covers every register export
 * (Contractors, Assets, Rooms, Certificates, Visits, Staff, the Compliance
 * Ledger) and the First Day Audit gap report (which is multiple heading+table
 * sections plus closing paragraphs, rather than one single table).
 *
 * sections: Array<
 *   | { type: "heading", text }
 *   | { type: "paragraph", text }
 *   | { type: "table", columns, rows }
 * >
 */
export async function buildRegisterPdf({ title, subtitle, branding, sections }) {
  const kit = await PdfKit.create();
  await kit.letterhead(branding);
  kit.titleBlock(title, subtitle);

  for (const block of sections) {
    if (block.type === "heading") kit.heading(block.text);
    else if (block.type === "paragraph") kit.paragraph(block.text, { size: 9.5, lineGap: 3 });
    else if (block.type === "table") kit.table(block.columns, block.rows);
  }

  kit.footer(branding?.footerText);
  return kit.bytes();
}
