import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { COLORS, dataUrlToBytes, hexToRgb, wrapText } from "./pdfKit";
import { fmtDate } from "../helpers";
import { isoDay } from "../training/status";

/**
 * A training certificate: a landscape A4 page with a double border, the same branding as every
 * report (logo, business name, address, registration number) centred at the top and as a faint
 * watermark, then the person, the module and the details, and "Issued by <hotel>" at the bottom. It is saved and shared through
 * exportPdfReport, so it behaves like "Save report" does elsewhere.
 *
 * cert: the object from GET /api/training/certificates/:no
 */
const W = 841.89;
const H = 595.28;
const GOLD = hexToRgb("#A8832F");

export async function buildCertificatePdf({ cert, branding }) {
  const doc = await PDFDocument.create();
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const page = doc.addPage([W, H]);

  const text = (t, x, y, { size = 10, font = sans, color = COLORS.text } = {}) => page.drawText(String(t ?? ""), { x, y, size, font, color });
  const centred = (t, y, opts = {}) => {
    const { size = 10, font = sans } = opts;
    text(t, (W - font.widthOfTextAtSize(String(t ?? ""), size)) / 2, y, opts);
  };
  /** Shrinks the size until the text fits `maxWidth`, so a long name or module title never runs off the page. */
  const fitSize = (t, font, size, maxWidth) => {
    let s = size;
    while (s > 10 && font.widthOfTextAtSize(String(t), s) > maxWidth) s -= 1;
    return s;
  };

  const { logoDataUrl, companyName, address, registrationNumber } = branding || {};
  let logo = null;
  if (logoDataUrl) {
    try {
      const bytes = dataUrlToBytes(logoDataUrl);
      logo = logoDataUrl.startsWith("data:image/png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch { /* unsupported or corrupt logo: skip it rather than failing the certificate */ }
  }

  // The logo again as a watermark: zoomed in so it fills the page (edges cropped), very faint, behind
  // everything else. Zooming matters for logos on a solid background: the background becomes an even
  // tint across the page instead of a visible box in the middle.
  if (logo) {
    const scale = Math.max(W / logo.width, H / logo.height) * 1.08;
    const w = logo.width * scale, h = logo.height * scale;
    page.drawImage(logo, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h, opacity: 0.055 });
  }

  // Double border with small corner squares.
  page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: COLORS.navy, borderWidth: 3 });
  page.drawRectangle({ x: 31, y: 31, width: W - 62, height: H - 62, borderColor: GOLD, borderWidth: 1 });
  for (const [cx, cy] of [[31, 31], [W - 31, 31], [31, H - 31], [W - 31, H - 31]]) {
    page.drawRectangle({ x: cx - 4, y: cy - 4, width: 8, height: 8, color: GOLD });
  }

  // Branded header, centred.
  let y = H - 54;
  if (logo) {
    const scale = Math.min(40 / logo.height, 160 / logo.width, 1);
    const w = logo.width * scale, h = logo.height * scale;
    page.drawImage(logo, { x: (W - w) / 2, y: y - h, width: w, height: h });
    y -= h + 12;
  }
  if (companyName) { centred(companyName, y - 10, { size: 12, font: sansBold }); y -= 17; }
  for (const line of String(address || "").split("\n")) {
    if (!line.trim()) continue;
    centred(line, y - 8, { size: 8.5, color: COLORS.muted }); y -= 11;
  }
  if (registrationNumber) { centred(registrationNumber, y - 8, { size: 8.5, color: COLORS.muted }); y -= 11; }

  // Title.
  y -= 16;
  page.drawLine({ start: { x: W / 2 - 40, y }, end: { x: W / 2 + 40, y }, thickness: 1.2, color: GOLD });
  y -= 36;
  centred("CERTIFICATE", y, { size: 38, font: serifBold, color: COLORS.navy });
  y -= 22;
  centred("OF COMPLETION", y, { size: 12, font: sansBold, color: GOLD });

  // Person and module.
  y -= 34;
  centred("This is to certify that", y, { size: 14, font: serifItalic, color: COLORS.muted });
  y -= 40;
  const nameSize = fitSize(cert.name, serifBold, 32, W - 200);
  centred(cert.name, y, { size: nameSize, font: serifBold });
  const nameWidth = serifBold.widthOfTextAtSize(cert.name, nameSize);
  const ruleHalf = Math.max(nameWidth / 2 + 24, 130);
  page.drawLine({ start: { x: W / 2 - ruleHalf, y: y - 9 }, end: { x: W / 2 + ruleHalf, y: y - 9 }, thickness: 0.8, color: COLORS.line });
  y -= 34;
  centred("has successfully completed", y, { size: 14, font: serifItalic, color: COLORS.muted });
  y -= 32;
  const modSize = fitSize(cert.moduleTitle, sansBold, 22, W - 200);
  centred(cert.moduleTitle, y, { size: modSize, font: sansBold, color: COLORS.navy });
  y -= 20;
  centred(`at ${cert.hotelName}`, y, { size: 11, color: COLORS.muted });

  // Facts row: score, completed, valid until.
  y -= 38;
  const facts = [
    ["SCORE", `${cert.score} of ${cert.total}`],
    ["COMPLETED", fmtDate(isoDay(cert.completedAt))],
    ["VALID UNTIL", cert.validUntil ? fmtDate(isoDay(cert.validUntil)) : "No expiry"],
  ];
  const colW = 170;
  const startX = (W - colW * facts.length) / 2;
  facts.forEach(([label, value], i) => {
    const cx = startX + colW * i + colW / 2;
    const lw = sans.widthOfTextAtSize(label, 7.5);
    text(label, cx - lw / 2, y, { size: 7.5, color: COLORS.muted });
    const vw = sansBold.widthOfTextAtSize(value, 13);
    text(value, cx - vw / 2, y - 16, { size: 13, font: sansBold });
  });
  y -= 44;

  if (cert.certNote) {
    for (const line of wrapText(cert.certNote, serifItalic, 10, 560).slice(0, 2)) {
      centred(line, y, { size: 10, font: serifItalic, color: COLORS.muted });
      y -= 13;
    }
  }

  // Signature (left) and certificate number (right), above the footer.
  const baseY = 84;
  page.drawLine({ start: { x: 90, y: baseY }, end: { x: 290, y: baseY }, thickness: 0.8, color: COLORS.text });
  text(cert.signedBy || cert.hotelName, 90, baseY - 13, { size: 9, color: COLORS.muted });
  const noLabel = "CERTIFICATE NUMBER";
  text(noLabel, W - 90 - sans.widthOfTextAtSize(noLabel, 7.5), baseY + 14, { size: 7.5, color: COLORS.muted });
  text(cert.certificateNo, W - 90 - sansBold.widthOfTextAtSize(cert.certificateNo, 12), baseY - 2, { size: 12, font: sansBold });
  const ver = `Content version ${cert.version}`;
  text(ver, W - 90 - sans.widthOfTextAtSize(ver, 8), baseY - 16, { size: 8, color: COLORS.muted });

  // The certificate is issued by the hotel, not by the software, so this line is fixed rather than taken
  // from the report footer text in Branding.
  centred(`Issued by ${cert.hotelName}`, 44, { size: 9, font: serifItalic, color: COLORS.muted });
  return doc.save();
}
