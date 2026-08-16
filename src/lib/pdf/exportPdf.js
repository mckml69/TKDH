/** Phones/tablets don't have a clean "save this file to a findable folder" flow the way
    desktop browsers do — the native share sheet is the standard mobile pattern precisely
    because it lets someone explicitly choose Files/Drive/etc. On desktop, where a direct
    download already lands in a normal, known Downloads folder, routing through a share
    sheet first is an extra, unfamiliar step people don't expect from "export a report" —
    so it's gated to mobile only. */
function isMobileDevice() {
  return window.matchMedia?.("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Shares/downloads a generated PDF: on mobile, tries the native Share/Save sheet first,
 * then a direct file download; on desktop, goes straight to a direct download. Either way,
 * falls back to an in-app view (ReportFallback, src/components/shared/UI.jsx) for the rare
 * browser where that's blocked too.
 */
export async function exportPdfReport(filename, title, pdfBytes) {
  try {
    if (isMobileDevice() && navigator.share && navigator.canShare) {
      const file = new File([pdfBytes], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return { status: "shared" };
      }
    }
  } catch (e) {
    if (e && e.name === "AbortError") return { status: "cancelled" };
    // fall through to the next method
  }
  try {
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { status: "downloaded" };
  } catch (e) {
    return { status: "fallback", pdfBytes, title };
  }
}
