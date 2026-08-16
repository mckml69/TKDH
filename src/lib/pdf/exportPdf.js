/**
 * Shares/downloads a generated PDF — same three-tier strategy as the old HTML
 * exportReport() (see git history): native Share/Save sheet first (the standard
 * mobile pattern), then a direct file download, then an in-app fallback view
 * (ReportFallback, src/components/shared/UI.jsx) for the rare browser where
 * both of those are blocked.
 */
export async function exportPdfReport(filename, title, pdfBytes) {
  try {
    if (navigator.share && navigator.canShare) {
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
